/**
 * PROJECT IGNIS — T0007 / PKG-04
 * Validação declarativa e pura dos fixture profiles telemétricos conforme C03 e schema 0006.
 */

import { AppError } from '../../errors.js';
import type { ActiveTelemetryBinding } from './binding.js';

export type TelemetryProfileId = 'FX-NONE-v1' | 'FX-FIXED-v1' | 'FX-MOBILE-v1' | 'FX-AGENT-v1';

export type TelemetryObservationType =
  | 'heartbeat'
  | 'position'
  | 'metric'
  | 'fault_detected'
  | 'fault_cleared'
  | 'agent_activity';

export type AgentActivity = 'available' | 'assigned' | 'off_duty' | 'unknown';

export interface RawObservationEnvelope {
  readonly channel: string;
  readonly observationType: string;
  readonly occurredAtMs: number;
  readonly values: Record<string, unknown>;
}

export interface TrustedResourceMetadata {
  readonly resourceId?: string;
  readonly resourceKind?: 'equipment' | 'agent';
  readonly categoryCode?: string | null;
  readonly categoryVersion?: number | null;
  readonly mobility?: 'fixed' | 'mobile' | null;
}

export type ValidatedObservationValues =
  | { readonly kind: 'heartbeat' }
  | { readonly kind: 'position'; readonly latitude: number; readonly longitude: number; readonly accuracyM: number | null }
  | { readonly kind: 'metric'; readonly metricName: 'fixture_scalar'; readonly unit: 'fixture_unit'; readonly value: number }
  | { readonly kind: 'fault'; readonly episodeId: string; readonly causeCode: 'fixture_fault_a' | 'fixture_fault_b'; readonly episodeStartedAtMs: number }
  | { readonly kind: 'agent_activity'; readonly activity: AgentActivity };

export interface ValidatedTelemetryObservation {
  readonly profileId: TelemetryProfileId;
  readonly profileVersion: number;
  readonly channel: string;
  readonly projectionField: string;
  readonly observationType: TelemetryObservationType;
  readonly occurredAtMs: number;
  readonly values: ValidatedObservationValues;
}

const KNOWN_PROFILES: ReadonlySet<string> = new Set([
  'FX-NONE-v1',
  'FX-FIXED-v1',
  'FX-MOBILE-v1',
  'FX-AGENT-v1',
]);

const ALLOWED_RAW_KEYS: ReadonlySet<string> = new Set([
  'channel',
  'observationType',
  'occurredAtMs',
  'values',
]);

const ALLOWED_ACTIVITIES: ReadonlySet<string> = new Set([
  'available',
  'assigned',
  'off_duty',
  'unknown',
]);

const MIN_UTC_MS = -62135596800000;
const MAX_UTC_MS = 253402300799999;

export class TelemetryProfileValidator {
  /**
   * Validação pura, estrita e sem efeitos colaterais de uma observação contra seu binding ativo.
   */
  validate(
    binding: ActiveTelemetryBinding,
    raw: RawObservationEnvelope,
    resource?: TrustedResourceMetadata,
  ): ValidatedTelemetryObservation {
    // 1. Validação estrutural básica do envelope raw
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new AppError(422, 'INVALID_VALUE', 'Envelope de observação inválido.');
    }

    const rawKeys = Object.keys(raw);
    for (const key of rawKeys) {
      if (!ALLOWED_RAW_KEYS.has(key)) {
        throw new AppError(
          422,
          'INVALID_VALUE',
          `Propriedade desconhecida no envelope de observação: ${key}`,
        );
      }
    }

    if (typeof raw.channel !== 'string' || !raw.channel) {
      throw new AppError(422, 'INVALID_VALUE', 'Canal de observação inválido.');
    }

    if (typeof raw.observationType !== 'string' || !raw.observationType) {
      throw new AppError(422, 'INVALID_VALUE', 'Tipo de observação inválido.');
    }

    if (
      typeof raw.occurredAtMs !== 'number' ||
      !Number.isSafeInteger(raw.occurredAtMs) ||
      raw.occurredAtMs < MIN_UTC_MS ||
      raw.occurredAtMs > MAX_UTC_MS
    ) {
      throw new AppError(422, 'INVALID_VALUE', 'Timestamp occurredAtMs inválido.');
    }

    if (!raw.values || typeof raw.values !== 'object' || Array.isArray(raw.values)) {
      throw new AppError(422, 'INVALID_VALUE', 'Objeto values inválido.');
    }

    // 2. Validação do binding
    if (!KNOWN_PROFILES.has(binding.profileId)) {
      throw new AppError(422, 'INVALID_VALUE', `Perfil telemétrico desconhecido: ${binding.profileId}`);
    }

    if (binding.profileVersion !== 1) {
      throw new AppError(422, 'INVALID_VALUE', `Versão de perfil incompatível: ${binding.profileVersion}`);
    }

    // G2: FX-NONE-v1 — sem capacidade telemétrica
    if (binding.profileId === 'FX-NONE-v1') {
      throw new AppError(403, 'FORBIDDEN', 'Perfil sem capacidade telemétrica.');
    }

    // Canal do payload deve corresponder ao canal autorizado no binding
    if (raw.channel !== binding.channel) {
      throw new AppError(
        422,
        'INVALID_VALUE',
        `Canal informado (${raw.channel}) diverge do canal do binding (${binding.channel}).`,
      );
    }

    // Limite histórico inferior obrigatório
    const historyLimit = Math.max(binding.resourceBornAtMs, binding.historyAllowedFromMs);
    if (raw.occurredAtMs < historyLimit) {
      throw new AppError(
        422,
        'INVALID_VALUE',
        'occurredAtMs anterior ao limite histórico autorizado.',
      );
    }

    // 3. Verificação de compatibilidade de recurso
    this.verifyResourceCompatibility(binding, resource);

    // 4. Validação por perfil específico
    let validatedValues: ValidatedObservationValues;

    switch (binding.profileId) {
      case 'FX-FIXED-v1':
        validatedValues = this.validateFixedProfile(binding, raw, historyLimit);
        break;
      case 'FX-MOBILE-v1':
        validatedValues = this.validateMobileProfile(binding, raw);
        break;
      case 'FX-AGENT-v1':
        validatedValues = this.validateAgentProfile(binding, raw);
        break;
      default:
        throw new AppError(422, 'INVALID_VALUE', `Perfil não suportado: ${binding.profileId}`);
    }

    return Object.freeze({
      profileId: binding.profileId as TelemetryProfileId,
      profileVersion: binding.profileVersion,
      channel: binding.channel,
      projectionField: binding.projectionField,
      observationType: raw.observationType as TelemetryObservationType,
      occurredAtMs: raw.occurredAtMs,
      values: validatedValues,
    });
  }

  private verifyResourceCompatibility(
    binding: ActiveTelemetryBinding,
    resource?: TrustedResourceMetadata,
  ): void {
    if (binding.profileId === 'FX-AGENT-v1') {
      if (binding.resourceKind !== 'agent') {
        throw new AppError(
          422,
          'INVALID_VALUE',
          'Perfil FX-AGENT-v1 exige binding com resourceKind agent.',
        );
      }
      if (resource) {
        if (resource.resourceId != null && resource.resourceId !== binding.resourceId) {
          throw new AppError(422, 'INVALID_VALUE', 'resourceId diverge do binding.');
        }
        if (resource.resourceKind != null && resource.resourceKind !== 'agent') {
          throw new AppError(422, 'INVALID_VALUE', 'resourceKind de metadados diverge de agent.');
        }
        if (
          resource.categoryCode != null ||
          resource.categoryVersion != null ||
          resource.mobility != null
        ) {
          throw new AppError(
            422,
            'INVALID_VALUE',
            'Perfil FX-AGENT-v1 não admite atributos de equipamento.',
          );
        }
      }
      return;
    }

    // Perfis de equipamento
    if (binding.resourceKind !== 'equipment') {
      throw new AppError(
        422,
        'INVALID_VALUE',
        `Perfil ${binding.profileId} exige binding com resourceKind equipment.`,
      );
    }

    if (resource) {
      if (resource.resourceId != null && resource.resourceId !== binding.resourceId) {
        throw new AppError(422, 'INVALID_VALUE', 'resourceId diverge do binding.');
      }
      if (resource.resourceKind != null && resource.resourceKind !== 'equipment') {
        throw new AppError(422, 'INVALID_VALUE', 'resourceKind de metadados diverge de equipment.');
      }

      if (binding.profileId === 'FX-FIXED-v1') {
        if (resource.categoryCode != null && resource.categoryCode !== 'camera') {
          throw new AppError(422, 'INVALID_VALUE', 'FX-FIXED-v1 exige categoryCode camera.');
        }
        if (resource.categoryVersion != null && resource.categoryVersion !== 1) {
          throw new AppError(422, 'INVALID_VALUE', 'FX-FIXED-v1 exige categoryVersion 1.');
        }
        if (resource.mobility != null && resource.mobility !== 'fixed') {
          throw new AppError(422, 'INVALID_VALUE', 'FX-FIXED-v1 exige mobility fixed.');
        }
      } else if (binding.profileId === 'FX-MOBILE-v1') {
        if (resource.categoryCode != null && resource.categoryCode !== 'inspection_vehicle') {
          throw new AppError(422, 'INVALID_VALUE', 'FX-MOBILE-v1 exige categoryCode inspection_vehicle.');
        }
        if (resource.categoryVersion != null && resource.categoryVersion !== 1) {
          throw new AppError(422, 'INVALID_VALUE', 'FX-MOBILE-v1 exige categoryVersion 1.');
        }
        if (resource.mobility != null && resource.mobility !== 'mobile') {
          throw new AppError(422, 'INVALID_VALUE', 'FX-MOBILE-v1 exige mobility mobile.');
        }
      }
    }
  }

  private validateFixedProfile(
    binding: ActiveTelemetryBinding,
    raw: RawObservationEnvelope,
    historyLimit: number,
  ): ValidatedObservationValues {
    if (binding.channel === 'heartbeat') {
      if (binding.projectionField !== 'communication') {
        throw new AppError(422, 'INVALID_VALUE', 'Canal heartbeat deve projetar communication.');
      }
      if (raw.observationType !== 'heartbeat') {
        throw new AppError(422, 'INVALID_VALUE', 'Canal heartbeat exige observationType heartbeat.');
      }
      if (Object.keys(raw.values).length > 0) {
        throw new AppError(422, 'INVALID_VALUE', 'Heartbeat não aceita campos em values.');
      }
      return Object.freeze({ kind: 'heartbeat' });
    }

    if (binding.channel === 'fixture_fault_a' || binding.channel === 'fixture_fault_b') {
      if (binding.projectionField !== 'fault') {
        throw new AppError(422, 'INVALID_VALUE', 'Canal de falha deve projetar fault.');
      }
      if (raw.observationType !== 'fault_detected' && raw.observationType !== 'fault_cleared') {
        throw new AppError(
          422,
          'INVALID_VALUE',
          'Canal de falha exige observationType fault_detected ou fault_cleared.',
        );
      }
      return this.validateFaultValues(binding.channel, raw.values, raw.occurredAtMs, historyLimit);
    }

    if (binding.channel === 'fixture_scalar') {
      if (binding.projectionField !== 'metric') {
        throw new AppError(422, 'INVALID_VALUE', 'Canal fixture_scalar deve projetar metric.');
      }
      if (raw.observationType !== 'metric') {
        throw new AppError(422, 'INVALID_VALUE', 'Canal fixture_scalar exige observationType metric.');
      }
      return this.validateMetricValues(raw.values);
    }

    throw new AppError(
      422,
      'INVALID_VALUE',
      `Canal ${binding.channel} não é permitido para FX-FIXED-v1.`,
    );
  }

  private validateMobileProfile(
    binding: ActiveTelemetryBinding,
    raw: RawObservationEnvelope,
  ): ValidatedObservationValues {
    if (binding.channel === 'heartbeat') {
      if (binding.projectionField !== 'communication') {
        throw new AppError(422, 'INVALID_VALUE', 'Canal heartbeat deve projetar communication.');
      }
      if (raw.observationType !== 'heartbeat') {
        throw new AppError(422, 'INVALID_VALUE', 'Canal heartbeat exige observationType heartbeat.');
      }
      if (Object.keys(raw.values).length > 0) {
        throw new AppError(422, 'INVALID_VALUE', 'Heartbeat não aceita campos em values.');
      }
      return Object.freeze({ kind: 'heartbeat' });
    }

    if (binding.channel === 'position') {
      if (binding.projectionField !== 'position') {
        throw new AppError(422, 'INVALID_VALUE', 'Canal position deve projetar position.');
      }
      if (raw.observationType !== 'position') {
        throw new AppError(422, 'INVALID_VALUE', 'Canal position exige observationType position.');
      }
      return this.validatePositionValues(raw.values);
    }

    throw new AppError(
      422,
      'INVALID_VALUE',
      `Canal ${binding.channel} não é permitido para FX-MOBILE-v1.`,
    );
  }

  private validateAgentProfile(
    binding: ActiveTelemetryBinding,
    raw: RawObservationEnvelope,
  ): ValidatedObservationValues {
    if (binding.channel === 'position') {
      if (binding.projectionField !== 'position') {
        throw new AppError(422, 'INVALID_VALUE', 'Canal position deve projetar position.');
      }
      if (raw.observationType !== 'position') {
        throw new AppError(422, 'INVALID_VALUE', 'Canal position exige observationType position.');
      }
      return this.validatePositionValues(raw.values);
    }

    if (binding.channel === 'agent_activity') {
      if (binding.projectionField !== 'activity') {
        throw new AppError(422, 'INVALID_VALUE', 'Canal agent_activity deve projetar activity.');
      }
      if (raw.observationType !== 'agent_activity') {
        throw new AppError(
          422,
          'INVALID_VALUE',
          'Canal agent_activity exige observationType agent_activity.',
        );
      }
      return this.validateAgentActivityValues(raw.values);
    }

    throw new AppError(
      422,
      'INVALID_VALUE',
      `Canal ${binding.channel} não é permitido para FX-AGENT-v1.`,
    );
  }

  private validateFaultValues(
    expectedCauseCode: 'fixture_fault_a' | 'fixture_fault_b',
    values: Record<string, unknown>,
    occurredAtMs: number,
    historyLimit: number,
  ): ValidatedObservationValues {
    const keys = Object.keys(values);
    const requiredKeys = ['causeCode', 'episodeId', 'episodeStartedAtMs'];
    if (keys.length !== 3 || !requiredKeys.every((k) => Object.hasOwn(values, k))) {
      throw new AppError(
        422,
        'INVALID_VALUE',
        'Falha exige exatamente causeCode, episodeId e episodeStartedAtMs.',
      );
    }

    const { causeCode, episodeId, episodeStartedAtMs } = values;

    if (typeof episodeId !== 'string' || !episodeId.trim()) {
      throw new AppError(422, 'INVALID_VALUE', 'episodeId deve ser string não vazia.');
    }

    if (causeCode !== expectedCauseCode) {
      throw new AppError(
        422,
        'INVALID_VALUE',
        `causeCode (${String(causeCode)}) diverge do canal autorizado (${expectedCauseCode}).`,
      );
    }

    if (
      typeof episodeStartedAtMs !== 'number' ||
      !Number.isSafeInteger(episodeStartedAtMs) ||
      episodeStartedAtMs < MIN_UTC_MS ||
      episodeStartedAtMs > MAX_UTC_MS
    ) {
      throw new AppError(422, 'INVALID_VALUE', 'episodeStartedAtMs deve ser inteiro seguro.');
    }

    if (episodeStartedAtMs < historyLimit) {
      throw new AppError(
        422,
        'INVALID_VALUE',
        'episodeStartedAtMs anterior ao limite histórico.',
      );
    }

    if (episodeStartedAtMs > occurredAtMs) {
      throw new AppError(
        422,
        'INVALID_VALUE',
        'episodeStartedAtMs posterior a occurredAtMs.',
      );
    }

    return Object.freeze({
      kind: 'fault',
      episodeId,
      causeCode: expectedCauseCode,
      episodeStartedAtMs,
    });
  }

  private validateMetricValues(values: Record<string, unknown>): ValidatedObservationValues {
    const keys = Object.keys(values);
    const requiredKeys = ['metricName', 'unit', 'value'];
    if (keys.length !== 3 || !requiredKeys.every((k) => Object.hasOwn(values, k))) {
      throw new AppError(
        422,
        'INVALID_VALUE',
        'Métrica exige exatamente metricName, unit e value.',
      );
    }

    const { metricName, unit, value } = values;

    if (metricName !== 'fixture_scalar') {
      throw new AppError(
        422,
        'INVALID_VALUE',
        `metricName inválido: esperado fixture_scalar, recebido ${String(metricName)}.`,
      );
    }

    if (unit !== 'fixture_unit') {
      throw new AppError(
        422,
        'INVALID_VALUE',
        `unit inválida: esperada fixture_unit, recebida ${String(unit)}.`,
      );
    }

    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0.0 ||
      value > 1.0
    ) {
      throw new AppError(
        422,
        'INVALID_VALUE',
        'Valor de fixture_scalar deve ser número finito no intervalo [0, 1].',
      );
    }

    return Object.freeze({
      kind: 'metric',
      metricName: 'fixture_scalar',
      unit: 'fixture_unit',
      value,
    });
  }

  private validatePositionValues(values: Record<string, unknown>): ValidatedObservationValues {
    const keys = Object.keys(values);
    for (const k of keys) {
      if (k !== 'latitude' && k !== 'longitude' && k !== 'accuracyM') {
        throw new AppError(
          422,
          'INVALID_VALUE',
          `Propriedade desconhecida em posição: ${k}`,
        );
      }
    }

    if (!Object.hasOwn(values, 'latitude') || !Object.hasOwn(values, 'longitude')) {
      throw new AppError(422, 'INVALID_VALUE', 'Posição exige latitude e longitude.');
    }

    const { latitude, longitude, accuracyM } = values;

    if (
      typeof latitude !== 'number' ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new AppError(422, 'INVALID_VALUE', 'Latitude fora da faixa [-90, 90].');
    }

    if (
      typeof longitude !== 'number' ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new AppError(422, 'INVALID_VALUE', 'Longitude fora da faixa [-180, 180].');
    }

    let normalizedAccuracy: number | null = null;
    if (accuracyM !== undefined && accuracyM !== null) {
      if (typeof accuracyM !== 'number' || !Number.isFinite(accuracyM) || accuracyM < 0) {
        throw new AppError(
          422,
          'INVALID_VALUE',
          'accuracyM deve ser número finito não negativo.',
        );
      }
      normalizedAccuracy = accuracyM;
    }

    return Object.freeze({
      kind: 'position',
      latitude,
      longitude,
      accuracyM: normalizedAccuracy,
    });
  }

  private validateAgentActivityValues(values: Record<string, unknown>): ValidatedObservationValues {
    const keys = Object.keys(values);
    if (keys.length !== 1 || keys[0] !== 'activity') {
      throw new AppError(
        422,
        'INVALID_VALUE',
        'agent_activity exige exatamente o campo activity.',
      );
    }

    const activity = values.activity;
    if (typeof activity !== 'string' || !ALLOWED_ACTIVITIES.has(activity)) {
      throw new AppError(
        422,
        'INVALID_VALUE',
        `Atividade inválida: ${String(activity)}. Esperado: available, assigned, off_duty ou unknown.`,
      );
    }

    return Object.freeze({
      kind: 'agent_activity',
      activity: activity as AgentActivity,
    });
  }
}

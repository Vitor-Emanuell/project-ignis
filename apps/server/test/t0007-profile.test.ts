/**
 * PROJECT IGNIS — T0007 / PKG-04
 * Suíte de testes unitários para os fixture profiles telemétricos (C03 §8, §9, migration 0006).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AppError } from '../src/errors.js';
import type { ActiveTelemetryBinding } from '../src/domain/telemetry/binding.js';
import {
  TelemetryProfileValidator,
  type RawObservationEnvelope,
  type TrustedResourceMetadata,
  type ValidatedTelemetryObservation,
} from '../src/domain/telemetry/profile.js';

describe('T0007 / PKG-04 — TelemetryProfileValidator', () => {
  let validator: TelemetryProfileValidator;

  beforeEach(() => {
    validator = new TelemetryProfileValidator();
  });

  // Helper para criar binding válido
  function makeBinding(overrides: Partial<ActiveTelemetryBinding> = {}): ActiveTelemetryBinding {
    return Object.freeze({
      bindingId: 'bind-001',
      sourceId: 'src-001',
      resourceId: 'res-001',
      resourceKind: 'equipment',
      channel: 'heartbeat',
      projectionField: 'communication',
      profileId: 'FX-FIXED-v1',
      profileVersion: 1,
      resourceBornAtMs: 1_000_000,
      historyAllowedFromMs: 1_000_000,
      ...overrides,
    });
  }

  // Helper para envelope raw válido
  function makeRaw(overrides: Partial<RawObservationEnvelope> = {}): RawObservationEnvelope {
    return {
      channel: 'heartbeat',
      observationType: 'heartbeat',
      occurredAtMs: 1_500_000,
      values: {},
      ...overrides,
    };
  }

  // =========================================================================
  // G2: FX-NONE-v1 (Sem capacidade telemétrica)
  // =========================================================================
  describe('Perfil FX-NONE-v1', () => {
    it('PF-NONE-01: rejeita qualquer ingestão com 403 FORBIDDEN em binding sintético', () => {
      const binding = makeBinding({
        profileId: 'FX-NONE-v1',
        profileVersion: 1,
        channel: 'heartbeat',
        projectionField: 'communication',
      });
      const raw = makeRaw();

      expect(() => validator.validate(binding, raw)).toThrow(
        expect.objectContaining({
          statusCode: 403,
          code: 'FORBIDDEN',
        }),
      );
    });
  });

  // =========================================================================
  // G2: FX-FIXED-v1 (Câmera fixa)
  // =========================================================================
  describe('Perfil FX-FIXED-v1 (Câmera fixa)', () => {
    const fixedBinding = makeBinding({
      profileId: 'FX-FIXED-v1',
      profileVersion: 1,
      resourceKind: 'equipment',
    });

    const fixedResource: TrustedResourceMetadata = Object.freeze({
      resourceId: 'res-001',
      resourceKind: 'equipment',
      categoryCode: 'camera',
      categoryVersion: 1,
      mobility: 'fixed',
    });

    it('PF-FIXED-01: valida heartbeat com sucesso', () => {
      const binding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'heartbeat',
        projectionField: 'communication',
      });
      const raw = makeRaw({
        channel: 'heartbeat',
        observationType: 'heartbeat',
        values: {},
      });

      const res = validator.validate(binding, raw, fixedResource);
      expect(res.profileId).toBe('FX-FIXED-v1');
      expect(res.profileVersion).toBe(1);
      expect(res.channel).toBe('heartbeat');
      expect(res.projectionField).toBe('communication');
      expect(res.observationType).toBe('heartbeat');
      expect(res.occurredAtMs).toBe(1_500_000);
      expect(res.values).toEqual({ kind: 'heartbeat' });
    });

    it('PF-FIXED-02: valida falha fixture_fault_a (fault_detected) com metadados em values', () => {
      const binding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'fixture_fault_a',
        projectionField: 'fault',
      });
      const raw = makeRaw({
        channel: 'fixture_fault_a',
        observationType: 'fault_detected',
        occurredAtMs: 1_500_000,
        values: {
          episodeId: 'ep-001',
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs: 1_200_000,
        },
      });

      const res = validator.validate(binding, raw, fixedResource);
      expect(res.values).toEqual({
        kind: 'fault',
        episodeId: 'ep-001',
        causeCode: 'fixture_fault_a',
        episodeStartedAtMs: 1_200_000,
      });
    });

    it('PF-FIXED-03: valida falha fixture_fault_b (fault_cleared) com metadados em values', () => {
      const binding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'fixture_fault_b',
        projectionField: 'fault',
      });
      const raw = makeRaw({
        channel: 'fixture_fault_b',
        observationType: 'fault_cleared',
        occurredAtMs: 1_500_000,
        values: {
          episodeId: 'ep-002',
          causeCode: 'fixture_fault_b',
          episodeStartedAtMs: 1_200_000,
        },
      });

      const res = validator.validate(binding, raw, fixedResource);
      expect(res.values).toEqual({
        kind: 'fault',
        episodeId: 'ep-002',
        causeCode: 'fixture_fault_b',
        episodeStartedAtMs: 1_200_000,
      });
    });

    it('PF-FIXED-04: valida métrica fixture_scalar no limite inferior 0.0', () => {
      const binding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'fixture_scalar',
        projectionField: 'metric',
      });
      const raw = makeRaw({
        channel: 'fixture_scalar',
        observationType: 'metric',
        values: {
          metricName: 'fixture_scalar',
          unit: 'fixture_unit',
          value: 0.0,
        },
      });

      const res = validator.validate(binding, raw, fixedResource);
      expect(res.values).toEqual({
        kind: 'metric',
        metricName: 'fixture_scalar',
        unit: 'fixture_unit',
        value: 0.0,
      });
    });

    it('PF-FIXED-05: valida métrica fixture_scalar no limite superior 1.0', () => {
      const binding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'fixture_scalar',
        projectionField: 'metric',
      });
      const raw = makeRaw({
        channel: 'fixture_scalar',
        observationType: 'metric',
        values: {
          metricName: 'fixture_scalar',
          unit: 'fixture_unit',
          value: 1.0,
        },
      });

      const res = validator.validate(binding, raw, fixedResource);
      expect(res.values).toEqual({
        kind: 'metric',
        metricName: 'fixture_scalar',
        unit: 'fixture_unit',
        value: 1.0,
      });
    });

    it('PF-FIXED-06: rejeita métrica com valor fora do intervalo [0, 1]', () => {
      const binding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'fixture_scalar',
        projectionField: 'metric',
      });

      expect(() =>
        validator.validate(
          binding,
          makeRaw({
            channel: 'fixture_scalar',
            observationType: 'metric',
            values: { metricName: 'fixture_scalar', unit: 'fixture_unit', value: 1.0001 },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));

      expect(() =>
        validator.validate(
          binding,
          makeRaw({
            channel: 'fixture_scalar',
            observationType: 'metric',
            values: { metricName: 'fixture_scalar', unit: 'fixture_unit', value: -0.0001 },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));
    });

    it('PF-FIXED-07: rejeita métrica com unidade ou nome incorreto', () => {
      const binding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'fixture_scalar',
        projectionField: 'metric',
      });

      expect(() =>
        validator.validate(
          binding,
          makeRaw({
            channel: 'fixture_scalar',
            observationType: 'metric',
            values: { metricName: 'fixture_scalar', unit: 'wrong_unit', value: 0.5 },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));

      expect(() =>
        validator.validate(
          binding,
          makeRaw({
            channel: 'fixture_scalar',
            observationType: 'metric',
            values: { metricName: 'wrong_scalar', unit: 'fixture_unit', value: 0.5 },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));
    });

    it('PF-FIXED-08: proíbe canal de posição dinâmica em equipamento fixo', () => {
      const binding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'position',
        projectionField: 'position',
      });
      const raw = makeRaw({
        channel: 'position',
        observationType: 'position',
        values: { latitude: -23.55, longitude: -46.63 },
      });

      expect(() => validator.validate(binding, raw, fixedResource)).toThrow(
        expect.objectContaining({ statusCode: 422 }),
      );
    });
  });

  // =========================================================================
  // G2: FX-MOBILE-v1 (Veículo de fiscalização móvel)
  // =========================================================================
  describe('Perfil FX-MOBILE-v1 (Veículo de inspeção móvel)', () => {
    const mobileBinding = makeBinding({
      profileId: 'FX-MOBILE-v1',
      profileVersion: 1,
      resourceKind: 'equipment',
    });

    const mobileResource: TrustedResourceMetadata = Object.freeze({
      resourceId: 'res-001',
      resourceKind: 'equipment',
      categoryCode: 'inspection_vehicle',
      categoryVersion: 1,
      mobility: 'mobile',
    });

    it('PF-MOBILE-01: valida heartbeat de veículo móvel', () => {
      const binding = makeBinding({
        profileId: 'FX-MOBILE-v1',
        channel: 'heartbeat',
        projectionField: 'communication',
      });
      const raw = makeRaw({
        channel: 'heartbeat',
        observationType: 'heartbeat',
        values: {},
      });

      const res = validator.validate(binding, raw, mobileResource);
      expect(res.values).toEqual({ kind: 'heartbeat' });
    });

    it('PF-MOBILE-02: valida posição dinâmica com latitude, longitude e precisão', () => {
      const binding = makeBinding({
        profileId: 'FX-MOBILE-v1',
        channel: 'position',
        projectionField: 'position',
      });
      const raw = makeRaw({
        channel: 'position',
        observationType: 'position',
        values: { latitude: -23.55052, longitude: -46.633308, accuracyM: 5.2 },
      });

      const res = validator.validate(binding, raw, mobileResource);
      expect(res.values).toEqual({
        kind: 'position',
        latitude: -23.55052,
        longitude: -46.633308,
        accuracyM: 5.2,
      });
    });

    it('PF-MOBILE-03: valida posição com accuracyM ausente/nulo normalizado para null', () => {
      const binding = makeBinding({
        profileId: 'FX-MOBILE-v1',
        channel: 'position',
        projectionField: 'position',
      });
      const raw = makeRaw({
        channel: 'position',
        observationType: 'position',
        values: { latitude: -23.55, longitude: -46.63 },
      });

      const res = validator.validate(binding, raw, mobileResource);
      expect(res.values).toEqual({
        kind: 'position',
        latitude: -23.55,
        longitude: -46.63,
        accuracyM: null,
      });
    });

    it('PF-MOBILE-04: rejeita latitude fora do intervalo [-90, 90]', () => {
      const binding = makeBinding({
        profileId: 'FX-MOBILE-v1',
        channel: 'position',
        projectionField: 'position',
      });

      expect(() =>
        validator.validate(
          binding,
          makeRaw({
            channel: 'position',
            observationType: 'position',
            values: { latitude: 90.0001, longitude: 0 },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));

      expect(() =>
        validator.validate(
          binding,
          makeRaw({
            channel: 'position',
            observationType: 'position',
            values: { latitude: -90.0001, longitude: 0 },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));
    });

    it('PF-MOBILE-05: rejeita longitude fora do intervalo [-180, 180]', () => {
      const binding = makeBinding({
        profileId: 'FX-MOBILE-v1',
        channel: 'position',
        projectionField: 'position',
      });

      expect(() =>
        validator.validate(
          binding,
          makeRaw({
            channel: 'position',
            observationType: 'position',
            values: { latitude: 0, longitude: 180.0001 },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));

      expect(() =>
        validator.validate(
          binding,
          makeRaw({
            channel: 'position',
            observationType: 'position',
            values: { latitude: 0, longitude: -180.0001 },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));
    });

    it('PF-MOBILE-06: rejeita accuracyM negativa', () => {
      const binding = makeBinding({
        profileId: 'FX-MOBILE-v1',
        channel: 'position',
        projectionField: 'position',
      });

      expect(() =>
        validator.validate(
          binding,
          makeRaw({
            channel: 'position',
            observationType: 'position',
            values: { latitude: 0, longitude: 0, accuracyM: -1 },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));
    });

    it('PF-MOBILE-07: proíbe métricas e falhas físicas em veículo móvel', () => {
      const metricBinding = makeBinding({
        profileId: 'FX-MOBILE-v1',
        channel: 'fixture_scalar',
        projectionField: 'metric',
      });
      expect(() =>
        validator.validate(
          metricBinding,
          makeRaw({
            channel: 'fixture_scalar',
            observationType: 'metric',
            values: { metricName: 'fixture_scalar', unit: 'fixture_unit', value: 0.5 },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));

      const faultBinding = makeBinding({
        profileId: 'FX-MOBILE-v1',
        channel: 'fixture_fault_a',
        projectionField: 'fault',
      });
      expect(() =>
        validator.validate(
          faultBinding,
          makeRaw({
            channel: 'fixture_fault_a',
            observationType: 'fault_detected',
            values: { episodeId: 'ep-1', causeCode: 'fixture_fault_a', episodeStartedAtMs: 1_200_000 },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));
    });
  });

  // =========================================================================
  // G2: FX-AGENT-v1 (Agente de campo)
  // =========================================================================
  describe('Perfil FX-AGENT-v1 (Agente)', () => {
    const agentBinding = makeBinding({
      profileId: 'FX-AGENT-v1',
      profileVersion: 1,
      resourceKind: 'agent',
    });

    const agentResource: TrustedResourceMetadata = Object.freeze({
      resourceId: 'res-001',
      resourceKind: 'agent',
      categoryCode: null,
      categoryVersion: null,
      mobility: null,
    });

    it('PF-AGENT-01: valida posição de agente em canal independente', () => {
      const binding = makeBinding({
        profileId: 'FX-AGENT-v1',
        resourceKind: 'agent',
        channel: 'position',
        projectionField: 'position',
      });
      const raw = makeRaw({
        channel: 'position',
        observationType: 'position',
        values: { latitude: -23.55, longitude: -46.63, accuracyM: 10 },
      });

      const res = validator.validate(binding, raw, agentResource);
      expect(res.values).toEqual({
        kind: 'position',
        latitude: -23.55,
        longitude: -46.63,
        accuracyM: 10,
      });
    });

    it('PF-AGENT-02: valida os quatro estados canônicos de atividade: available, assigned, off_duty, unknown', () => {
      const binding = makeBinding({
        profileId: 'FX-AGENT-v1',
        resourceKind: 'agent',
        channel: 'agent_activity',
        projectionField: 'activity',
      });

      const activities = ['available', 'assigned', 'off_duty', 'unknown'] as const;
      for (const act of activities) {
        const raw = makeRaw({
          channel: 'agent_activity',
          observationType: 'agent_activity',
          values: { activity: act },
        });
        const res = validator.validate(binding, raw, agentResource);
        expect(res.values).toEqual({
          kind: 'agent_activity',
          activity: act,
        });
      }
    });

    it('PF-AGENT-03: rejeita estados espúrios de atividade (ex: idle, active, moving, offline)', () => {
      const binding = makeBinding({
        profileId: 'FX-AGENT-v1',
        resourceKind: 'agent',
        channel: 'agent_activity',
        projectionField: 'activity',
      });

      const invalidActs = ['idle', 'active', 'moving', 'offline', 'paused', 'acting'];
      for (const act of invalidActs) {
        expect(() =>
          validator.validate(
            binding,
            makeRaw({
              channel: 'agent_activity',
              observationType: 'agent_activity',
              values: { activity: act },
            }),
            agentResource,
          ),
        ).toThrow(expect.objectContaining({ statusCode: 422 }));
      }
    });

    it('PF-AGENT-04: proíbe heartbeat de equipamento e falhas físicas em perfil de agente', () => {
      const hbBinding = makeBinding({
        profileId: 'FX-AGENT-v1',
        resourceKind: 'agent',
        channel: 'heartbeat',
        projectionField: 'communication',
      });
      expect(() =>
        validator.validate(
          hbBinding,
          makeRaw({
            channel: 'heartbeat',
            observationType: 'heartbeat',
            values: {},
          }),
          agentResource,
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));

      const faultBinding = makeBinding({
        profileId: 'FX-AGENT-v1',
        resourceKind: 'agent',
        channel: 'fixture_fault_a',
        projectionField: 'fault',
      });
      expect(() =>
        validator.validate(
          faultBinding,
          makeRaw({
            channel: 'fixture_fault_a',
            observationType: 'fault_detected',
            values: { episodeId: 'ep-1', causeCode: 'fixture_fault_a', episodeStartedAtMs: 1_200_000 },
          }),
          agentResource,
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));
    });
  });

  // =========================================================================
  // G3: Validação causal e integridade de episódios
  // =========================================================================
  describe('G3 — Validação causal de episódios de falha', () => {
    const faultBinding = makeBinding({
      profileId: 'FX-FIXED-v1',
      channel: 'fixture_fault_a',
      projectionField: 'fault',
      resourceBornAtMs: 1_000_000,
      historyAllowedFromMs: 1_100_000, // limiteHistorico = 1_100_000
    });

    it('PF-CAUSAL-01: rejeita episodeStartedAtMs posterior a occurredAtMs com 422', () => {
      const raw = makeRaw({
        channel: 'fixture_fault_a',
        observationType: 'fault_detected',
        occurredAtMs: 1_500_000,
        values: {
          episodeId: 'ep-001',
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs: 1_500_001, // posterior!
        },
      });

      expect(() => validator.validate(faultBinding, raw)).toThrow(
        expect.objectContaining({ statusCode: 422 }),
      );
    });

    it('PF-CAUSAL-02: rejeita episodeStartedAtMs anterior ao limite histórico com 422', () => {
      const raw = makeRaw({
        channel: 'fixture_fault_a',
        observationType: 'fault_detected',
        occurredAtMs: 1_500_000,
        values: {
          episodeId: 'ep-001',
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs: 1_099_999, // menor que historyAllowedFromMs 1_100_000
        },
      });

      expect(() => validator.validate(faultBinding, raw)).toThrow(
        expect.objectContaining({ statusCode: 422 }),
      );
    });

    it('PF-CAUSAL-03: aceita episodeStartedAtMs exatamente no limite histórico e no occurredAtMs', () => {
      const rawAtLimit = makeRaw({
        channel: 'fixture_fault_a',
        observationType: 'fault_detected',
        occurredAtMs: 1_500_000,
        values: {
          episodeId: 'ep-001',
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs: 1_100_000,
        },
      });
      expect(validator.validate(faultBinding, rawAtLimit).values).toHaveProperty(
        'episodeStartedAtMs',
        1_100_000,
      );

      const rawAtOccurred = makeRaw({
        channel: 'fixture_fault_a',
        observationType: 'fault_detected',
        occurredAtMs: 1_500_000,
        values: {
          episodeId: 'ep-001',
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs: 1_500_000,
        },
      });
      expect(validator.validate(faultBinding, rawAtOccurred).values).toHaveProperty(
        'episodeStartedAtMs',
        1_500_000,
      );
    });

    it('PF-CAUSAL-04: rejeita occurredAtMs anterior ao limite histórico com 422', () => {
      const raw = makeRaw({
        channel: 'fixture_fault_a',
        observationType: 'fault_detected',
        occurredAtMs: 1_000_000, // inferior a 1_100_000
        values: {
          episodeId: 'ep-001',
          causeCode: 'fixture_fault_a',
          episodeStartedAtMs: 1_000_000,
        },
      });

      expect(() => validator.validate(faultBinding, raw)).toThrow(
        expect.objectContaining({ statusCode: 422 }),
      );
    });

    it('PF-CAUSAL-05: rejeita causeCode diferente do canal autorizado com 422', () => {
      const raw = makeRaw({
        channel: 'fixture_fault_a',
        observationType: 'fault_detected',
        occurredAtMs: 1_500_000,
        values: {
          episodeId: 'ep-001',
          causeCode: 'fixture_fault_b', // divergente do channel 'fixture_fault_a'!
          episodeStartedAtMs: 1_200_000,
        },
      });

      expect(() => validator.validate(faultBinding, raw)).toThrow(
        expect.objectContaining({ statusCode: 422 }),
      );
    });

    it('PF-CAUSAL-06: rejeita episodeId vazio ou tipo inválido', () => {
      expect(() =>
        validator.validate(
          faultBinding,
          makeRaw({
            channel: 'fixture_fault_a',
            observationType: 'fault_detected',
            values: { episodeId: '', causeCode: 'fixture_fault_a', episodeStartedAtMs: 1_200_000 },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));

      expect(() =>
        validator.validate(
          faultBinding,
          makeRaw({
            channel: 'fixture_fault_a',
            observationType: 'fault_detected',
            values: { episodeId: 12345, causeCode: 'fixture_fault_a', episodeStartedAtMs: 1_200_000 },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));
    });

    it('PF-CAUSAL-07: rejeita episodeStartedAtMs não-inteiro seguro', () => {
      expect(() =>
        validator.validate(
          faultBinding,
          makeRaw({
            channel: 'fixture_fault_a',
            observationType: 'fault_detected',
            values: { episodeId: 'ep-1', causeCode: 'fixture_fault_a', episodeStartedAtMs: 1200.5 },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));

      expect(() =>
        validator.validate(
          faultBinding,
          makeRaw({
            channel: 'fixture_fault_a',
            observationType: 'fault_detected',
            values: { episodeId: 'ep-1', causeCode: 'fixture_fault_a', episodeStartedAtMs: '1200000' },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));
    });
  });

  // =========================================================================
  // G1: Autoridade do binding e compatibilidade de recurso
  // =========================================================================
  describe('G1 — Autoridade do binding e compatibilidade', () => {
    it('PF-AUTH-01: rejeita perfil desconhecido com 422', () => {
      const binding = makeBinding({ profileId: 'FX-UNKNOWN-v1' as any });
      expect(() => validator.validate(binding, makeRaw())).toThrow(
        expect.objectContaining({ statusCode: 422 }),
      );
    });

    it('PF-AUTH-02: rejeita versão de perfil incompatível com 422', () => {
      const binding = makeBinding({ profileVersion: 2 });
      expect(() => validator.validate(binding, makeRaw())).toThrow(
        expect.objectContaining({ statusCode: 422 }),
      );
    });

    it('PF-AUTH-03: rejeita incompatibilidade entre perfil e resourceKind do binding', () => {
      const binding = makeBinding({
        profileId: 'FX-AGENT-v1',
        resourceKind: 'equipment', // Incompatível com FX-AGENT-v1
        channel: 'position',
        projectionField: 'position',
      });
      const raw = makeRaw({
        channel: 'position',
        observationType: 'position',
        values: { latitude: 0, longitude: 0 },
      });

      expect(() => validator.validate(binding, raw)).toThrow(
        expect.objectContaining({ statusCode: 422 }),
      );
    });

    it('PF-AUTH-04: rejeita divergência entre canal do payload e canal do binding', () => {
      const binding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'heartbeat',
        projectionField: 'communication',
      });
      const raw = makeRaw({
        channel: 'other_channel', // Divergente do binding!
        observationType: 'heartbeat',
        values: {},
      });

      expect(() => validator.validate(binding, raw)).toThrow(
        expect.objectContaining({ statusCode: 422 }),
      );
    });

    it('PF-AUTH-05: rejeita incompatibilidade entre canal e observationType', () => {
      const binding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'heartbeat',
        projectionField: 'communication',
      });
      const raw = makeRaw({
        channel: 'heartbeat',
        observationType: 'metric', // Incompatível com canal heartbeat!
        values: {},
      });

      expect(() => validator.validate(binding, raw)).toThrow(
        expect.objectContaining({ statusCode: 422 }),
      );
    });

    it('PF-AUTH-06: rejeita incompatibilidade entre projectionField e canal autorizado', () => {
      const binding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'heartbeat',
        projectionField: 'metric', // heartbeat deve projetar communication!
      });
      const raw = makeRaw({
        channel: 'heartbeat',
        observationType: 'heartbeat',
        values: {},
      });

      expect(() => validator.validate(binding, raw)).toThrow(
        expect.objectContaining({ statusCode: 422 }),
      );
    });

    it('PF-AUTH-07: valida metadados explícitos de recurso e rejeita incompatibilidade', () => {
      const fixedBinding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'heartbeat',
        projectionField: 'communication',
      });
      const raw = makeRaw({
        channel: 'heartbeat',
        observationType: 'heartbeat',
        values: {},
      });

      // Câmera com mobilidade mobile é incompatível com FX-FIXED-v1
      expect(() =>
        validator.validate(fixedBinding, raw, {
          resourceKind: 'equipment',
          categoryCode: 'camera',
          categoryVersion: 1,
          mobility: 'mobile',
        }),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));

      // Veículo de fiscalização é incompatível com FX-FIXED-v1
      expect(() =>
        validator.validate(fixedBinding, raw, {
          resourceKind: 'equipment',
          categoryCode: 'inspection_vehicle',
          categoryVersion: 1,
          mobility: 'fixed',
        }),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));

      // Agente com atributos de equipamento é incompatível
      const agentBinding = makeBinding({
        profileId: 'FX-AGENT-v1',
        resourceKind: 'agent',
        channel: 'agent_activity',
        projectionField: 'activity',
      });
      expect(() =>
        validator.validate(
          agentBinding,
          makeRaw({
            channel: 'agent_activity',
            observationType: 'agent_activity',
            values: { activity: 'available' },
          }),
          {
            resourceKind: 'agent',
            categoryCode: 'camera',
          },
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));
    });
  });

  // =========================================================================
  // G4 & G5: Estrutura estrita, imutabilidade e determinismo
  // =========================================================================
  describe('G4 & G5 — Estrutura estrita, pureza e imutabilidade', () => {
    it('PF-STRICT-01: rejeita campos adicionais no envelope raw com 422', () => {
      const binding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'heartbeat',
        projectionField: 'communication',
      });
      const rawWithExtra = {
        channel: 'heartbeat',
        observationType: 'heartbeat',
        occurredAtMs: 1_500_000,
        values: {},
        profileId: 'FX-FIXED-v1', // Campo autodeclarado proibido no envelope!
      } as any;

      expect(() => validator.validate(binding, rawWithExtra)).toThrow(
        expect.objectContaining({ statusCode: 422 }),
      );
    });

    it('PF-STRICT-02: rejeita campos adicionais dentro de values com 422', () => {
      const binding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'heartbeat',
        projectionField: 'communication',
      });
      const rawWithExtraValue = makeRaw({
        values: { unexpected: 'field' },
      });

      expect(() => validator.validate(binding, rawWithExtraValue)).toThrow(
        expect.objectContaining({ statusCode: 422 }),
      );
    });

    it('PF-STRICT-03: rejeita NaN e Infinity em coordenadas e métricas com 422', () => {
      const mobileBinding = makeBinding({
        profileId: 'FX-MOBILE-v1',
        channel: 'position',
        projectionField: 'position',
      });

      expect(() =>
        validator.validate(
          mobileBinding,
          makeRaw({
            channel: 'position',
            observationType: 'position',
            values: { latitude: NaN, longitude: 0 },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));

      expect(() =>
        validator.validate(
          mobileBinding,
          makeRaw({
            channel: 'position',
            observationType: 'position',
            values: { latitude: 0, longitude: Infinity },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));

      const metricBinding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'fixture_scalar',
        projectionField: 'metric',
      });
      expect(() =>
        validator.validate(
          metricBinding,
          makeRaw({
            channel: 'fixture_scalar',
            observationType: 'metric',
            values: { metricName: 'fixture_scalar', unit: 'fixture_unit', value: NaN },
          }),
        ),
      ).toThrow(expect.objectContaining({ statusCode: 422 }));
    });

    it('PF-STRICT-04: retorna objetos profundamente congelados (Object.isFrozen)', () => {
      const binding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'fixture_fault_a',
        projectionField: 'fault',
      });
      const raw = makeRaw({
        channel: 'fixture_fault_a',
        observationType: 'fault_detected',
        values: { episodeId: 'ep-1', causeCode: 'fixture_fault_a', episodeStartedAtMs: 1_200_000 },
      });

      const res = validator.validate(binding, raw);
      expect(Object.isFrozen(res)).toBe(true);
      expect(Object.isFrozen(res.values)).toBe(true);
    });

    it('PF-STRICT-05: preserva a pureza sem mutar argumentos de entrada', () => {
      const binding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'heartbeat',
        projectionField: 'communication',
      });
      const raw = makeRaw({ values: {} });
      const rawClone = JSON.parse(JSON.stringify(raw));

      validator.validate(binding, raw);
      expect(raw).toEqual(rawClone);
    });

    it('PF-STRICT-06: opera de forma puramente determinística para os mesmos inputs', () => {
      const binding = makeBinding({
        profileId: 'FX-FIXED-v1',
        channel: 'heartbeat',
        projectionField: 'communication',
      });
      const raw = makeRaw({ values: {} });

      const res1 = validator.validate(binding, raw);
      const res2 = validator.validate(binding, raw);
      expect(res1).toEqual(res2);
    });
  });
});

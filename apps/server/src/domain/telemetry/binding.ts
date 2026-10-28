/**
 * PROJECT IGNIS — T0007 / PKG-03
 * Resolução e autorização de canais/recursos vinculados (bindings) conforme C03 e D07.
 */

import type Database from 'better-sqlite3';
import { AppError, storageError } from '../../errors.js';
import { type AuthenticatedSourceContext, assertValidSourceContext } from './auth.js';

export interface ActiveTelemetryBinding {
  readonly bindingId: string;
  readonly sourceId: string;
  readonly resourceId: string;
  readonly resourceKind: string;
  readonly channel: string;
  readonly projectionField: string;
  readonly profileId: string;
  readonly profileVersion: number;
  readonly resourceBornAtMs: number;
  readonly historyAllowedFromMs: number;
}

export class TelemetryBindingService {
  /**
   * Resolve e autoriza o canal e recurso associados para a identidade autenticada.
   * Não aceita identificadores avulsos fornecidos pelo cliente.
   */
  resolveActiveBinding(
    db: Database.Database,
    auth: AuthenticatedSourceContext,
    resourceId: string,
    channel: string,
  ): ActiveTelemetryBinding {
    assertValidSourceContext(auth);

    if (!resourceId || typeof resourceId !== 'string' || !channel || typeof channel !== 'string') {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Binding inexistente, inativo ou não autorizado para a fonte.',
      );
    }

    let row:
      | {
          id: string;
          resource_kind: string;
          projection_field: string;
          profile_id: string;
          profile_version: number;
          resource_born_at_ms: number;
          history_allowed_from_ms: number;
          active: number;
        }
      | undefined;

    try {
      row = db
        .prepare(
          `SELECT id, resource_kind, projection_field, profile_id, profile_version,
                  resource_born_at_ms, history_allowed_from_ms, active
           FROM telemetry_binding
           WHERE dataset_id = ? AND epoch = ? AND source_id = ? AND resource_id = ? AND channel = ?`,
        )
        .get(auth.datasetId, auth.epoch, auth.sourceId, resourceId, channel) as typeof row;
    } catch (error) {
      return storageError(error);
    }

    if (!row || row.active !== 1) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Binding inexistente, inativo ou não autorizado para a fonte.',
      );
    }

    return Object.freeze({
      bindingId: row.id,
      sourceId: auth.sourceId,
      resourceId,
      resourceKind: row.resource_kind,
      channel,
      projectionField: row.projection_field,
      profileId: row.profile_id,
      profileVersion: row.profile_version,
      resourceBornAtMs: row.resource_born_at_ms,
      historyAllowedFromMs: row.history_allowed_from_ms,
    });
  }

  /**
   * Revalidação atômica e estrita a ser executada obrigatoriamente dentro de transaction(db, ...).
   * Previne TOCTOU entre a amostragem de borda e o commit de ingestão.
   */
  assertBindingActiveInTx(
    db: Database.Database,
    auth: AuthenticatedSourceContext,
    resourceId: string,
    channel: string,
  ): ActiveTelemetryBinding {
    if (!db.inTransaction) {
      throw new AppError(
        500,
        'TRANSACTION_REQUIRED',
        'Revalidação de binding exige transação ativa.',
      );
    }

    assertValidSourceContext(auth);

    if (!resourceId || typeof resourceId !== 'string' || !channel || typeof channel !== 'string') {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Binding inexistente, inativo ou não autorizado para a fonte.',
      );
    }

    let row:
      | {
          id: string;
          resource_kind: string;
          projection_field: string;
          profile_id: string;
          profile_version: number;
          resource_born_at_ms: number;
          history_allowed_from_ms: number;
          active: number;
        }
      | undefined;

    try {
      row = db
        .prepare(
          `SELECT id, resource_kind, projection_field, profile_id, profile_version,
                  resource_born_at_ms, history_allowed_from_ms, active
           FROM telemetry_binding
           WHERE dataset_id = ? AND epoch = ? AND source_id = ? AND resource_id = ? AND channel = ?`,
        )
        .get(auth.datasetId, auth.epoch, auth.sourceId, resourceId, channel) as typeof row;
    } catch (error) {
      return storageError(error);
    }

    if (!row || row.active !== 1) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Binding inexistente, inativo ou não autorizado para a fonte.',
      );
    }

    return Object.freeze({
      bindingId: row.id,
      sourceId: auth.sourceId,
      resourceId,
      resourceKind: row.resource_kind,
      channel,
      projectionField: row.projection_field,
      profileId: row.profile_id,
      profileVersion: row.profile_version,
      resourceBornAtMs: row.resource_born_at_ms,
      historyAllowedFromMs: row.history_allowed_from_ms,
    });
  }
}

export class AppError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string) {
    super(message);
  }
}

export function isSqliteUnavailable(error: unknown): boolean {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    && /^(SQLITE_BUSY|SQLITE_LOCKED|SQLITE_IOERR|SQLITE_FULL|SQLITE_CANTOPEN)(_|$)/.test(error.code);
}

export function storageError(error: unknown): never {
  if (isSqliteUnavailable(error)) {
    throw new AppError(503, 'DATABASE_UNAVAILABLE', 'Banco indisponível. Reenvie a mesma chave.');
  }
  throw error;
}

/**
 * PROJECT IGNIS — T0007 / PKG-02
 * Provedores de tempo UTC para telemetria conforme C03 e D08.
 */

/**
 * Abstração de provedor de tempo UTC em milissegundos inteiros.
 */
export interface TimeProvider {
  /**
   * Retorna o timestamp UTC atual em milissegundos.
   */
  now(): number;
}

/**
 * Provedor de produção baseado no relógio físico do sistema operacional.
 */
export class SystemTimeProvider implements TimeProvider {
  now(): number {
    return Date.now();
  }
}

/**
 * Provedor determinístico e configurável para testes e simulação.
 */
export class SettableTimeProvider implements TimeProvider {
  private currentUtcMs: number;

  constructor(initialUtcMs: number) {
    this.currentUtcMs = initialUtcMs;
  }

  now(): number {
    return this.currentUtcMs;
  }

  setTime(utcMs: number): void {
    this.currentUtcMs = utcMs;
  }

  advanceBy(ms: number): void {
    this.currentUtcMs += ms;
  }
}

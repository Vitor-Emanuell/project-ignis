import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors.js';
import { canonicalJson, hashJson, parseJson } from '../src/idempotency/json.js';
import { normalizeBody, timestamp } from '../src/idempotency/normalize.js';
import type { Field } from '../src/idempotency/normalize.js';

const result = (body: unknown, fields: Record<string, Field>) => hashJson(normalizeBody(body, fields));
function rejects(action: () => unknown, status: number) {
  expect(action).toThrow(AppError);
  try { action(); } catch (error) { expect((error as AppError).statusCode).toBe(status); }
}

describe('V00-I: normalização normativa', () => {
  it('V00-I07 — tipagem e precisão sem coerção', () => {
    const fields = { version: { type: 'integer', min: 0 } } as const;
    rejects(() => normalizeBody({ version: '1' }, fields), 400);
    for (const version of [0.5, 9007199254740992, -1]) rejects(() => normalizeBody({ version }, fields), 422);
    for (const value of [NaN, Infinity, -Infinity]) rejects(() => canonicalJson(value), 400);
    for (const value of ['NaN', 'Infinity', '{"n":01}', 'true false']) rejects(() => parseJson(value), 400);
    for (const value of ['9007199254740993', '-9007199254740993', '900719925474099300e-2', '1e400']) {
      rejects(() => parseJson(value), 422);
    }
    expect(parseJson('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('V00-I08 — números finitos e representação JCS', () => {
    const fields = { n: { type: 'number' } } as const;
    expect(result({ n: -0 }, fields)).toEqual(result({ n: 0 }, fields));
    expect(result(parseJson('{"n":1.0}'), fields)).toEqual(result(parseJson('{"n":1e0}'), fields));
    expect(result({ n: 0.3 }, fields).hash).not.toBe(result({ n: 0.30000000000000004 }, fields).hash);
    expect(canonicalJson([1e-7, 1e-6, 4.5])).toBe('[1e-7,0.000001,4.5]');
  });

  it('V00-I09 — ausência, null e defaults estáticos', () => {
    const fields = { note: { type: 'string', optional: true, nullable: true } } as const;
    expect(result({}, fields).canonical).toBe('{}');
    expect(result({ note: null }, fields).canonical).toBe('{"note":null}');
    const defaults = { flag: { type: 'boolean', optional: true, default: false } } as const;
    expect(result({}, defaults)).toEqual(result({ flag: false }, defaults));
    rejects(() => normalizeBody({ flag: null }, defaults), 422);
    rejects(() => normalizeBody({ flag: undefined }, defaults), 400);
  });

  it('V00-I10 — texto, Unicode, arrays e chaves numéricas', () => {
    const text = { text: { type: 'string' } } as const;
    for (const [a, b] of [['A', 'a'], [' A', 'A'], ['é', 'e\u0301']]) {
      expect(result({ text: a }, text).hash).not.toBe(result({ text: b }, text).hash);
    }
    expect(hashJson(parseJson('{"x":"\\u0041"}'))).toEqual(hashJson(parseJson('{"x":"A"}')));
    expect(canonicalJson({ 2: 'two', 10: 'ten' })).toBe('{"10":"ten","2":"two"}');
    expect(canonicalJson({ '\ufb33': 1, '😀': 2, a: { z: 0, b: 1 }, list: [2, 1] }))
      .toBe('{"a":{"b":1,"z":0},"list":[2,1],"😀":2,"דּ":1}');
    expect(hashJson([1, 2]).hash).not.toBe(hashJson([2, 1]).hash);
    for (const body of ['{"x":"\\ud800"}', '{"x":"\\udc00"}', '{"x":1,"\\u0078":2}']) {
      rejects(() => parseJson(body), 400);
    }
    rejects(() => parseJson(Buffer.from([0x22, 0xff, 0x22])), 400);
    rejects(() => canonicalJson([, 1]), 400);
    rejects(() => canonicalJson({ x: BigInt(1) }), 400);
    expect(parseJson('{"__proto__":{"polluted":true}}')).toHaveProperty('__proto__');
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('V00-I11 — instante semântico preserva equivalência de offset', () => {
    const fields = { occurredAt: { type: 'timestamp' } } as const;
    const first = result({ occurredAt: '2026-10-23T10:00:00-03:00' }, fields);
    expect(first.canonical).toBe('{"occurredAt":"2026-10-23T13:00:00.000Z"}');
    expect(first).toEqual(result({ occurredAt: '2026-10-23T13:00:00.000Z' }, fields));
    expect(first.hash).not.toBe(result({ occurredAt: '2026-10-23T13:00:00.001Z' }, fields).hash);
    expect(timestamp('0001-01-01T00:00:00Z')).toBe('0001-01-01T00:00:00.000Z');
  });

  it('V00-I12 — tempo inválido rejeitado e data civil preservada', () => {
    for (const value of ['2026-10-23T10:00:00', '2026-10-23T10:00:00-00:00', '2026-02-29T00:00:00Z',
      '2026-10-23T10:00:60Z', '2026-10-23T10:00:00.0001Z', '0001-01-01T00:00:00+01:00',
      '9999-12-31T23:59:59-01:00', '2026-10-23T24:00:00Z', '2026-10-23T10:00:00+24:00']) {
      rejects(() => timestamp(value), 422);
    }
    const fields = { dueDate: { type: 'date' }, note: { type: 'string' } } as const;
    const body = { dueDate: '2026-10-23', note: '2026-10-23T10:00:00-03:00' };
    expect(normalizeBody(body, fields)).toEqual(body);
    rejects(() => normalizeBody({ ...body, dueDate: '2026-02-30' }, fields), 422);
  });
});

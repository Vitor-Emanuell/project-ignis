import { AppError } from '../errors.js';
import { canonicalJson } from './json.js';
import type { Json } from './json.js';

// Trusted server-side field descriptions, never executable schemas supplied by a client.
export type Field = {
  type: 'string' | 'uuid' | 'timestamp' | 'date' | 'integer' | 'number' | 'boolean' | 'object' | 'array';
  optional?: boolean;
  nullable?: boolean;
  default?: Json;
  min?: number;
  max?: number;
  fields?: Readonly<Record<string, Field>>;
  items?: Field;
};
const badType = () => new AppError(400, 'INVALID_REQUEST', 'Tipo ou campo inválido.');
const badValue = () => new AppError(422, 'INVALID_VALUE', 'Valor inválido.');

export function uuid(value: unknown): string {
  if (typeof value !== 'string') throw badType();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw badValue();
  return value.toLowerCase();
}

function validDate(year: number, month: number, day: number): boolean {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!;
}

function civilDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || !validDate(Number(match[1]), Number(match[2]), Number(match[3]))) throw badValue();
  return value;
}

export function timestamp(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/);
  if (!match) throw badValue();
  const [, y, m, d, h, min, sec, fraction = '', zone = ''] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  if (!validDate(year, month, day) || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59
    || zone === '-00:00') throw badValue();
  let offset = 0;
  if (zone !== 'Z') {
    const hours = Number(zone.slice(1, 3)), minutes = Number(zone.slice(4));
    if (hours > 23 || minutes > 59) throw badValue();
    offset = (hours * 60 + minutes) * (zone[0] === '-' ? -1 : 1);
  }
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(Number(h), Number(min), Number(sec), Number(fraction.padEnd(3, '0')));
  date.setTime(date.getTime() - offset * 60_000);
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) throw badValue();
  return date.toISOString();
}

export function normalize(value: unknown, field: Field): Json {
  if (value === null) {
    if (!field.nullable) throw badValue();
    return null;
  }
  if (field.type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) throw badType();
    const object = value as Record<string, unknown>;
    const fields = field.fields ?? {};
    if (Object.keys(object).some(key => !Object.hasOwn(fields, key))) throw badType();
    const result: Record<string, Json> = Object.create(null) as Record<string, Json>;
    for (const [key, rule] of Object.entries(fields)) {
      if (Object.hasOwn(object, key)) result[key] = normalize(object[key], rule);
      else if (Object.hasOwn(rule, 'default')) result[key] = normalize(rule.default, rule);
      else if (!rule.optional) throw badType();
    }
    return result;
  }
  if (field.type === 'array') {
    if (!Array.isArray(value) || !field.items) throw badType();
    canonicalJson(value); // also rejects holes/undefined/invalid JSON values
    return value.map(item => normalize(item, field.items!));
  }
  if (field.type === 'number' || field.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw badType();
    if ((Number.isInteger(value) && !Number.isSafeInteger(value))
      || (field.type === 'integer' && !Number.isSafeInteger(value))
      || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) throw badValue();
    return Object.is(value, -0) ? 0 : value;
  }
  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') throw badType();
    return value;
  }
  if (typeof value !== 'string') throw badType();
  canonicalJson(value);
  if (value.length > (field.max ?? 256) || value.length < (field.min ?? 0)) throw badValue();
  if (field.type === 'uuid') return uuid(value);
  if (field.type === 'timestamp') return timestamp(value);
  if (field.type === 'date') return civilDate(value);
  return value;
}

export function normalizeBody(value: unknown, fields: Readonly<Record<string, Field>>): Record<string, Json> {
  // Reject non-JSON values/prototypes, including undefined, before projection.
  canonicalJson(value);
  return normalize(value, { type: 'object', fields }) as Record<string, Json>;
}

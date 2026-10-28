import { createHash } from 'node:crypto';
import { AppError } from '../errors.js';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const invalid = () => new AppError(400, 'INVALID_REQUEST', 'JSON ou estrutura inválida.');

function validString(value: string): void {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw invalid();
    } else if (code >= 0xdc00 && code <= 0xdfff) throw invalid();
  }
}

// Validate raw number tokens before JSON parsing could round an unsafe integer.
function numberToken(token: string): number {
  const value = Number(token);
  if (!Number.isFinite(value)) throw new AppError(422, 'INVALID_VALUE', 'Número fora da faixa finita.');
  const [mantissa = '', exponent = '0'] = token.toLowerCase().split('e');
  const [whole = '', fraction = ''] = mantissa.replace('-', '').split('.');
  const digits = (whole + fraction).replace(/^0+/, '') || '0';
  const scale = Number(exponent) - fraction.length;
  if (digits !== '0') {
    let exactInteger: string | undefined;
    if (scale >= 0) {
      if (digits.length + scale > 16) throw new AppError(422, 'INVALID_VALUE', 'Inteiro inseguro.');
      exactInteger = digits + '0'.repeat(scale);
    } else if (-scale < digits.length && digits.endsWith('0'.repeat(-scale))) {
      exactInteger = digits.slice(0, scale);
    }
    if (exactInteger && BigInt(exactInteger) > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new AppError(422, 'INVALID_VALUE', 'Inteiro inseguro.');
    }
  }
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
    throw new AppError(422, 'INVALID_VALUE', 'Inteiro inseguro.');
  }
  return Object.is(value, -0) ? 0 : value;
}

// Small JSON reader: duplicate names and invalid Unicode must not be silently lost.
export function parseJson(input: string | Buffer): Json {
  if (Buffer.byteLength(input) > 64 * 1024) throw new AppError(413, 'BODY_TOO_LARGE', 'Corpo excede 64 KiB.');
  let text: string;
  try { text = typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true }).decode(input); }
  catch { throw invalid(); }
  let index = 0;
  const whitespace = () => { while (index < text.length && /[\x20\t\r\n]/.test(text[index]!)) index++; };
  const string = (): string => {
    const start = index++;
    while (index < text.length) {
      const char = text[index++];
      if (char === '\\') { index++; continue; }
      if (char === '"') {
        let value: string;
        try { value = JSON.parse(text.slice(start, index)) as string; } catch { throw invalid(); }
        validString(value);
        return value;
      }
    }
    throw invalid();
  };
  const read = (): Json => {
    whitespace();
    if (text[index] === '"') return string();
    if (text[index] === '{') {
      index++; whitespace();
      const object: Record<string, Json> = Object.create(null) as Record<string, Json>;
      if (text[index] === '}') { index++; return object; }
      while (true) {
        whitespace();
        if (text[index] !== '"') throw invalid();
        const key = string(); whitespace();
        if (Object.hasOwn(object, key) || text[index++] !== ':') throw invalid();
        object[key] = read(); whitespace();
        if (text[index] === '}') { index++; return object; }
        if (text[index++] !== ',') throw invalid();
      }
    }
    if (text[index] === '[') {
      index++; whitespace();
      const array: Json[] = [];
      if (text[index] === ']') { index++; return array; }
      while (true) {
        array.push(read()); whitespace();
        if (text[index] === ']') { index++; return array; }
        if (text[index++] !== ',') throw invalid();
      }
    }
    for (const [token, value] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(token, index)) { index += token.length; return value; }
    }
    const token = text.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)?.[0];
    if (!token) throw invalid();
    index += token.length;
    return numberToken(token);
  };
  try {
    const value = read(); whitespace();
    if (index !== text.length) throw invalid();
    return value;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw invalid();
  }
}

// Emit each sorted property directly. Rebuilding an object would reorder integer keys.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') { validString(value); return JSON.stringify(value); }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw invalid();
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new AppError(422, 'INVALID_VALUE', 'Inteiro inseguro.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(value, i)) throw invalid();
      parts.push(canonicalJson(value[i]));
    }
    return `[${parts.join(',')}]`;
  }
  if (typeof value === 'object' && value !== null
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return `{${Object.keys(value).sort().map(key => {
      validString(key);
      return `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`;
    }).join(',')}}`;
  }
  throw invalid();
}

export function hashJson(value: unknown) {
  const canonical = canonicalJson(value);
  return { canonical, hash: createHash('sha256').update(canonical, 'utf8').digest('hex') };
}

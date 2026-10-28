import { AppError } from '../errors.js';
import { normalizeBody } from '../idempotency/normalize.js';
import type { Field } from '../idempotency/normalize.js';
import type { Json } from '../idempotency/json.js';
import { CATEGORY, profile, attributeFields, attributeUnion } from './catalog.js';
import type { CategoryProfile } from './catalog.js';
export { CATEGORY } from './catalog.js';
export const OPERATIONAL_ID = '10000000-0000-4000-8000-000000000003';
export const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000004';
const text: Field = { type: 'string', min: 1, max: 256 };
export const locationFields: Record<string, Field> = {
  referenceType: text, postalCode: text, neighborhood: text, city: text, uf: text, address: text, reference: text,
  latitude: { type: 'number', min: -90, max: 90, nullable: true, default: null },
  longitude: { type: 'number', min: -180, max: 180, nullable: true, default: null },
};
const location: Field = { type: 'object', fields: locationFields };
const maintenance: Field = { type: 'object', nullable: true, default: null, fields: {
  reason: text, priority: text, schedule: { type: 'object', fields: {
    status: text, dueDate: { type: 'date', nullable: true, default: null },
    notApplicableReason: { ...text, nullable: true, default: null },
  } },
} };
export const editableFields: Record<string, Field> = {
  serialNumber: text, brand: text, model: text, criticality: { type: 'integer', min: 1, max: 5 },
  attributes: { type: 'object', fields: attributeUnion },
  registrationLocation: location, baseLocation: { ...location, nullable: true },
};
export const createFields: Record<string, Field> = {
  ...editableFields, baseLocation: { ...location, nullable: true, default: null },
  organizationId: { type: 'uuid' }, categoryCode: text, categoryVersion: { type: 'integer', min: 1 },
  initialState: { ...text, default: 'not_installed' }, initialMaintenance: maintenance,
  initialStateReason: { ...text, optional: true },
};
const patchFields = (fields: Record<string, Field>): Record<string, Field> => ({
  ...Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, { ...field, optional: true }])),
  expectedVersion: { type: 'integer', min: 1 },
});
export const updateFields = patchFields(editableFields);
export const agentEditableFields: Record<string, Field> = {
  enrollmentNumber: text, fictitiousName: text, function: text,
  registrationLocation: location, baseLocation: { ...location, nullable: true },
};
export const agentCreateFields: Record<string, Field> = {
  ...agentEditableFields, organizationId: { type: 'uuid' },
  baseLocation: { ...location, nullable: true, default: null },
  initialActivity: { ...text, default: 'unknown' },
};
export const agentUpdateFields = patchFields(agentEditableFields);
export type ObjectJson = Record<string, Json>;
export const invalid = (message: string): never => { throw new AppError(422, 'INVALID_VALUE', message); };
const bad = (message: string): never => { throw new AppError(400, 'INVALID_REQUEST', message); };
const nonblank = (value: Json) => { if (typeof value === 'string' && !value.trim()) invalid('Texto não pode conter somente espaços.'); };
function normalizeLocations(body: ObjectJson, agent: boolean) {
  for (const key of ['registrationLocation', 'baseLocation']) {
    if (!body[key]) continue;
    const loc = body[key] as ObjectJson;
    for (const value of Object.values(loc)) nonblank(value);
    const allowed = key === 'baseLocation' ? ['base'] : agent ? ['institutional'] : ['base', 'installation'];
    if (!allowed.includes(loc.referenceType as string)) invalid('Referência de localização inválida.');
    if (!/^\d{5}-?\d{3}$/.test(loc.postalCode as string)) invalid('CEP deve ter oito dígitos.');
    loc.postalCode = (loc.postalCode as string).replace('-', '');
    if (!'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').includes(loc.uf as string)) invalid('UF inválida.');
    if ((loc.latitude === null) !== (loc.longitude === null)) invalid('Informe as duas coordenadas ou nenhuma.');
  }
}
function normalizedIdentity(body: ObjectJson, key: string) {
  if (body[key] === undefined) return;
  const value = (body[key] as string).trim().toUpperCase();
  if (!value.length || value.length > 256) invalid('Identificação inválida.');
  body[key] = value;
}
export function validateAttributes(attributes: Json, category: CategoryProfile) {
  const value = normalizeBody(attributes, attributeFields(category));
  for (const [key, descriptor] of Object.entries(category.attributes)) {
    if (descriptor.enum && !descriptor.enum.includes(value[key] as string)) invalid('Opção de atributo inválida.');
    if (descriptor.exclusiveMinimum !== undefined && (value[key] as number) <= descriptor.exclusiveMinimum) invalid('Atributo deve ser positivo.');
  }
}
// PATCH's profile check follows receipt lookup; normalization itself never reads mutable state.
export function validateEquipment(body: ObjectJson, category: CategoryProfile, operationalState?: string) {
  if (body.attributes !== undefined) validateAttributes(body.attributes, category);
  const loc = body.registrationLocation as ObjectJson | undefined;
  if (loc && category.mobility === 'mobile' && loc.referenceType !== 'base') invalid('Recurso móvel exige base cadastral.');
  if (loc && category.mobility === 'fixed' && operationalState === 'operational'
    && (loc.referenceType !== 'installation' || loc.latitude === null || loc.longitude === null)) invalid('Instalação operacional exige coordenadas completas.');
}
export function inventoryInput(input: unknown, update = false) {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const category = profile(raw.categoryCode, raw.categoryVersion);
  const fields: Record<string, Field> = update ? updateFields : { ...createFields,
    attributes: { type: 'object', fields: attributeFields(category ?? CATEGORY) } };
  if (!update && (!category || category.code === CATEGORY.code)) delete fields.initialStateReason;
  const normalized = normalizeBody(input, { commandId: { type: 'uuid' }, ...fields });
  const { commandId, ...body } = normalized;
  if (update && !Object.keys(editableFields).some(key => Object.hasOwn(body, key))) bad('Informe ao menos um campo cadastral.');
  normalizedIdentity(body, 'serialNumber');
  for (const key of ['brand', 'model']) if (body[key] !== undefined) nonblank(body[key]!);
  normalizeLocations(body, false);
  if (!update) {
    if (!category || (body.initialState !== 'not_installed' && body.initialState !== 'operational')
      || (category.code === CATEGORY.code && body.initialState !== 'not_installed')) invalid('Categoria, versão ou situação inicial inválida.');
    if (body.initialState === 'operational') {
      if (body.initialStateReason === undefined) invalid('Declare a situação inicial e seu motivo.');
      nonblank(body.initialStateReason!);
    } else if (Object.hasOwn(body, 'initialStateReason')) bad('Motivo de situação só é admitido na declaração operacional.');
    validateEquipment(body, category!, body.initialState as string);
  }
  if (body.initialMaintenance) {
    const request = body.initialMaintenance as ObjectJson, schedule = request.schedule as ObjectJson;
    nonblank(request.reason!);
    if (!['low', 'normal', 'high', 'critical'].includes(request.priority as string)) invalid('Prioridade inválida.');
    if (!['dated', 'unknown', 'not_applicable'].includes(schedule.status as string)
      || (schedule.status === 'dated') !== (schedule.dueDate !== null)
      || (schedule.status === 'not_applicable') !== (schedule.notApplicableReason !== null)) invalid('Agenda incoerente.');
    if (schedule.notApplicableReason !== null) nonblank(schedule.notApplicableReason!);
  }
  return { commandId: commandId as string, body };
}
export function agentInput(input: unknown, update = false) {
  const normalized = normalizeBody(input, { commandId: { type: 'uuid' }, ...(update ? agentUpdateFields : agentCreateFields) });
  const { commandId, ...body } = normalized;
  if (update && !Object.keys(agentEditableFields).some(key => Object.hasOwn(body, key))) bad('Informe ao menos um campo cadastral.');
  normalizedIdentity(body, 'enrollmentNumber');
  for (const key of ['fictitiousName', 'function']) if (body[key] !== undefined) nonblank(body[key]!);
  normalizeLocations(body, true);
  if (!update && body.initialActivity !== 'unknown') invalid('Atividade inicial deve ser unknown.');
  return { commandId: commandId as string, body };
}

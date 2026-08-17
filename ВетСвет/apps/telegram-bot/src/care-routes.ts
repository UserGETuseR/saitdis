import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname, resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';

type Staff = { current: { userId: string }; membership: { role: string } };
type Context = {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  db: PrismaClient;
  organizationId: string;
  uploadRoot: string;
  currentStaff: (request: IncomingMessage) => Promise<Staff | undefined>;
  body: (request: IncomingMessage, maxBytes?: number) => Promise<string>;
  json: (response: ServerResponse, status: number, payload: unknown) => void;
  idempotencyKey: (request: IncomingMessage) => string | undefined;
  audit: (input: { actorId: string; action: string; aggregateType: string; aggregateId: string; idempotencyKey: string; payload?: Record<string, unknown> }) => Promise<void>;
};

const ownerRoles = new Set(['ADMIN', 'MANAGER', 'RECEPTIONIST']);
const petRoles = new Set(['ADMIN', 'MANAGER', 'RECEPTIONIST', 'VETERINARIAN', 'GROOMER', 'ASSISTANT']);
const channels = new Set(['TELEGRAM', 'PHONE', 'EMAIL', 'SMS', 'IN_APP']);
const relationTypes = new Set(['OWNER', 'CAREGIVER', 'FAMILY', 'AUTHORIZED']);
const fileCategories = new Set(['PHOTO', 'PASSPORT', 'VACCINATION', 'LAB_RESULT', 'DISCHARGE', 'OTHER']);
const fileTypes: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
const list = (value: unknown, max = 30) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, max) : [];
const text = (value: unknown, max = 4000) => String(value ?? '').trim().slice(0, max) || null;
const phone = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) return `+7${digits.slice(1)}`;
  return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
};
const email = (value: unknown) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
};
const date = (value: unknown) => {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
};
const parse = async (ctx: Context, maxBytes?: number) => {
  try { return JSON.parse(await ctx.body(ctx.request, maxBytes)) as Record<string, unknown>; } catch { return undefined; }
};
const requireStaff = async (ctx: Context, roles: Set<string>) => {
  const staff = await ctx.currentStaff(ctx.request);
  if (!staff) { ctx.json(ctx.response, 401, { error: 'UNAUTHORIZED' }); return undefined; }
  if (!roles.has(staff.membership.role)) { ctx.json(ctx.response, 403, { error: 'CARE_ROLE_REQUIRED' }); return undefined; }
  return staff;
};

export async function handleCareRoutes(ctx: Context): Promise<boolean> {
  const { request, response, url, db, organizationId } = ctx;
  if (!url.pathname.startsWith('/api/v1/staff/care/')) return false;

  if (request.method === 'POST' && url.pathname === '/api/v1/staff/care/owners') {
    const staff = await requireStaff(ctx, ownerRoles); const key = ctx.idempotencyKey(request); if (!staff) return true;
    if (!key) { ctx.json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return true; }
    const repeated = await db.owner.findUnique({ where: { createdIdempotencyKey: key } });
    if (repeated) { ctx.json(response, 200, { owner: repeated, repeated: true }); return true; }
    const input = await parse(ctx); if (!input) { ctx.json(response, 400, { error: 'INVALID_REQUEST' }); return true; }
    const fullName = text(input.fullName, 180); const normalizedPhone = phone(input.phone); const normalizedEmail = email(input.email);
    if (!fullName || fullName.length < 2 || (!normalizedPhone && !normalizedEmail)) { ctx.json(response, 400, { error: 'OWNER_NAME_AND_CONTACT_REQUIRED' }); return true; }
    const duplicates = await db.owner.findMany({ where: { organizationId, OR: [...(normalizedPhone ? [{ phone: normalizedPhone }] : []), ...(normalizedEmail ? [{ email: normalizedEmail }] : [])] }, take: 10 });
    if (duplicates.length) { ctx.json(response, 409, { error: 'OWNER_DUPLICATE', duplicates: duplicates.map((item) => ({ id: item.id, fullName: item.fullName, phone: item.phone, email: item.email })) }); return true; }
    const preferredChannel = channels.has(String(input.preferredChannel)) ? String(input.preferredChannel) : normalizedPhone ? 'PHONE' : 'EMAIL';
    const owner = await db.owner.create({ data: { organizationId, fullName, phone: normalizedPhone, email: normalizedEmail, preferredChannel, address: text(input.address, 500), emergencyContact: text(input.emergencyContact, 300), source: text(input.source, 120), notes: text(input.notes), tags: list(input.tags), marketingConsent: input.marketingConsent === true, createdIdempotencyKey: key } });
    await ctx.audit({ actorId: staff.current.userId, action: 'care.owner_created', aggregateType: 'Owner', aggregateId: owner.id, idempotencyKey: key, payload: { preferredChannel } });
    ctx.json(response, 201, { owner }); return true;
  }

  const ownerRoute = url.pathname.match(/^\/api\/v1\/staff\/care\/owners\/([^/]+)$/);
  if (request.method === 'PATCH' && ownerRoute) {
    const staff = await requireStaff(ctx, ownerRoles); const key = ctx.idempotencyKey(request); if (!staff) return true;
    if (!key) { ctx.json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return true; }
    const owner = await db.owner.findFirst({ where: { id: decodeURIComponent(ownerRoute[1]), organizationId } });
    if (!owner) { ctx.json(response, 404, { error: 'OWNER_NOT_FOUND' }); return true; }
    const input = await parse(ctx); if (!input) { ctx.json(response, 400, { error: 'INVALID_REQUEST' }); return true; }
    const normalizedPhone = input.phone === undefined ? owner.phone : phone(input.phone); const normalizedEmail = input.email === undefined ? owner.email : email(input.email);
    const fullName = input.fullName === undefined ? owner.fullName : text(input.fullName, 180);
    if (!fullName || (!normalizedPhone && !normalizedEmail)) { ctx.json(response, 400, { error: 'OWNER_NAME_AND_CONTACT_REQUIRED' }); return true; }
    const duplicate = await db.owner.findFirst({ where: { organizationId, id: { not: owner.id }, OR: [...(normalizedPhone ? [{ phone: normalizedPhone }] : []), ...(normalizedEmail ? [{ email: normalizedEmail }] : [])] } });
    if (duplicate) { ctx.json(response, 409, { error: 'OWNER_DUPLICATE', duplicates: [{ id: duplicate.id, fullName: duplicate.fullName }] }); return true; }
    const preferredChannel = input.preferredChannel === undefined ? owner.preferredChannel : String(input.preferredChannel);
    if (!channels.has(preferredChannel)) { ctx.json(response, 400, { error: 'INVALID_CHANNEL' }); return true; }
    const updated = await db.owner.update({ where: { id: owner.id }, data: { fullName, phone: normalizedPhone, email: normalizedEmail, preferredChannel, address: input.address === undefined ? owner.address : text(input.address, 500), emergencyContact: input.emergencyContact === undefined ? owner.emergencyContact : text(input.emergencyContact, 300), notes: input.notes === undefined ? owner.notes : text(input.notes), tags: input.tags === undefined ? owner.tags : list(input.tags), marketingConsent: typeof input.marketingConsent === 'boolean' ? input.marketingConsent : owner.marketingConsent } });
    await ctx.audit({ actorId: staff.current.userId, action: 'care.owner_updated', aggregateType: 'Owner', aggregateId: owner.id, idempotencyKey: key });
    ctx.json(response, 200, { owner: updated }); return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/v1/staff/care/pets') {
    const staff = await requireStaff(ctx, petRoles); const key = ctx.idempotencyKey(request); if (!staff) return true;
    if (!key) { ctx.json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return true; }
    const repeated = await db.pet.findUnique({ where: { createdIdempotencyKey: key } }); if (repeated) { ctx.json(response, 200, { pet: repeated, repeated: true }); return true; }
    const input = await parse(ctx); if (!input) { ctx.json(response, 400, { error: 'INVALID_REQUEST' }); return true; }
    const ownerId = String(input.ownerId ?? ''); const owner = await db.owner.findFirst({ where: { id: ownerId, organizationId, accountStatus: { not: 'BLOCKED' } } });
    const name = text(input.name, 120); const species = String(input.species ?? '').trim().toUpperCase(); const birthDate = date(input.birthDate);
    if (!owner || !name || name.length < 1 || !['DOG', 'CAT', 'OTHER'].includes(species) || birthDate === undefined) { ctx.json(response, 400, { error: 'INVALID_PET' }); return true; }
    const microchip = text(input.microchip, 80); const passportId = text(input.passportId, 100);
    const duplicate = await db.pet.findFirst({ where: { organizationId, OR: [...(microchip ? [{ microchip }] : []), ...(passportId ? [{ passportId }] : []), { name: { equals: name, mode: 'insensitive' as const }, species, relations: { some: { ownerId, state: 'ACTIVE' } } }] } });
    if (duplicate) { ctx.json(response, 409, { error: 'PET_DUPLICATE', duplicates: [{ id: duplicate.id, name: duplicate.name, species: duplicate.species, microchip: duplicate.microchip }] }); return true; }
    const result = await db.$transaction(async (tx) => {
      const pet = await tx.pet.create({ data: { organizationId, name, species, breed: text(input.breed, 120), sex: text(input.sex, 30), neuterState: text(input.neuterState, 30), birthDate, color: text(input.color, 100), microchip, passportId, medicalAlerts: list(input.medicalAlerts), chronicConditions: list(input.chronicConditions), behavioralAlerts: list(input.behavioralAlerts), feedingNotes: text(input.feedingNotes), medicationNotes: text(input.medicationNotes), vaccinationDueAt: date(input.vaccinationDueAt) ?? null, createdIdempotencyKey: key } });
      const relation = await tx.ownerPetRelation.create({ data: { organizationId, ownerId, petId: pet.id, relation: 'OWNER', primary: true, permissions: ['VIEW', 'BOOK', 'CONSENT', 'PAY'] } });
      return { pet, relation };
    });
    await ctx.audit({ actorId: staff.current.userId, action: 'care.pet_created', aggregateType: 'Pet', aggregateId: result.pet.id, idempotencyKey: key, payload: { ownerId } });
    ctx.json(response, 201, result); return true;
  }

  const petRoute = url.pathname.match(/^\/api\/v1\/staff\/care\/pets\/([^/]+)$/);
  if (request.method === 'PATCH' && petRoute) {
    const staff = await requireStaff(ctx, petRoles); const key = ctx.idempotencyKey(request); if (!staff) return true;
    if (!key) { ctx.json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return true; }
    const pet = await db.pet.findFirst({ where: { id: decodeURIComponent(petRoute[1]), organizationId } }); if (!pet) { ctx.json(response, 404, { error: 'PET_NOT_FOUND' }); return true; }
    const input = await parse(ctx); if (!input) { ctx.json(response, 400, { error: 'INVALID_REQUEST' }); return true; }
    const name = input.name === undefined ? pet.name : text(input.name, 120); const species = input.species === undefined ? pet.species : String(input.species).toUpperCase();
    if (!name || !['DOG', 'CAT', 'OTHER'].includes(species)) { ctx.json(response, 400, { error: 'INVALID_PET' }); return true; }
    const fields = ['breed', 'sex', 'neuterState', 'color', 'microchip', 'passportId', 'feedingNotes', 'medicationNotes'] as const;
    const data: Record<string, unknown> = { name, species };
    for (const field of fields) if (input[field] !== undefined) data[field] = text(input[field], field === 'feedingNotes' || field === 'medicationNotes' ? 4000 : 120);
    for (const field of ['medicalAlerts', 'chronicConditions', 'behavioralAlerts'] as const) if (input[field] !== undefined) data[field] = list(input[field]);
    for (const field of ['birthDate', 'vaccinationDueAt'] as const) if (input[field] !== undefined) { const value = date(input[field]); if (value === undefined) { ctx.json(response, 400, { error: 'INVALID_DATE' }); return true; } data[field] = value; }
    if (input.lifecycle !== undefined && ['ACTIVE', 'INACTIVE', 'DECEASED'].includes(String(input.lifecycle))) data.lifecycle = String(input.lifecycle);
    if (data.microchip) { const duplicate = await db.pet.findFirst({ where: { organizationId, id: { not: pet.id }, microchip: String(data.microchip) } }); if (duplicate) { ctx.json(response, 409, { error: 'PET_DUPLICATE' }); return true; } }
    const updated = await db.pet.update({ where: { id: pet.id }, data });
    await ctx.audit({ actorId: staff.current.userId, action: 'care.pet_updated', aggregateType: 'Pet', aggregateId: pet.id, idempotencyKey: key });
    ctx.json(response, 200, { pet: updated }); return true;
  }

  const caregivers = url.pathname.match(/^\/api\/v1\/staff\/care\/pets\/([^/]+)\/caregivers$/);
  if (request.method === 'POST' && caregivers) {
    const staff = await requireStaff(ctx, ownerRoles); const key = ctx.idempotencyKey(request); if (!staff) return true;
    if (!key) { ctx.json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return true; }
    const input = await parse(ctx); if (!input) { ctx.json(response, 400, { error: 'INVALID_REQUEST' }); return true; }
    const petId = decodeURIComponent(caregivers[1]); const ownerId = String(input.ownerId ?? ''); const relation = String(input.relation ?? 'CAREGIVER').toUpperCase();
    const [pet, owner] = await Promise.all([db.pet.findFirst({ where: { id: petId, organizationId } }), db.owner.findFirst({ where: { id: ownerId, organizationId } })]);
    if (!pet || !owner || !relationTypes.has(relation)) { ctx.json(response, 400, { error: 'INVALID_CAREGIVER' }); return true; }
    const permissions = list(input.permissions, 10).filter((item) => ['VIEW', 'BOOK', 'CONSENT', 'PAY'].includes(item));
    const item = await db.ownerPetRelation.upsert({ where: { organizationId_ownerId_petId: { organizationId, ownerId, petId } }, update: { relation, permissions: permissions.length ? permissions : ['VIEW', 'BOOK'], state: 'ACTIVE', endedAt: null }, create: { organizationId, ownerId, petId, relation, permissions: permissions.length ? permissions : ['VIEW', 'BOOK'] } });
    await ctx.audit({ actorId: staff.current.userId, action: 'care.caregiver_linked', aggregateType: 'OwnerPetRelation', aggregateId: item.id, idempotencyKey: key, payload: { ownerId, petId, relation } });
    ctx.json(response, 201, { relation: item }); return true;
  }

  const relationRoute = url.pathname.match(/^\/api\/v1\/staff\/care\/relations\/([^/]+)$/);
  if (request.method === 'PATCH' && relationRoute) {
    const staff = await requireStaff(ctx, ownerRoles); const key = ctx.idempotencyKey(request); if (!staff) return true;
    if (!key) { ctx.json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return true; }
    const input = await parse(ctx); const item = await db.ownerPetRelation.findFirst({ where: { id: decodeURIComponent(relationRoute[1]), organizationId } });
    if (!input || !item) { ctx.json(response, 404, { error: 'RELATION_NOT_FOUND' }); return true; }
    const action = String(input.action ?? '');
    if (action === 'ARCHIVE' && item.primary) { ctx.json(response, 409, { error: 'PRIMARY_OWNER_CANNOT_BE_ARCHIVED' }); return true; }
    if (action === 'SET_PRIMARY') await db.$transaction([db.ownerPetRelation.updateMany({ where: { organizationId, petId: item.petId }, data: { primary: false } }), db.ownerPetRelation.update({ where: { id: item.id }, data: { primary: true, state: 'ACTIVE', endedAt: null } })]);
    else if (action === 'ARCHIVE') await db.ownerPetRelation.update({ where: { id: item.id }, data: { state: 'ARCHIVED', endedAt: new Date() } });
    else { ctx.json(response, 400, { error: 'INVALID_RELATION_ACTION' }); return true; }
    await ctx.audit({ actorId: staff.current.userId, action: `care.relation_${action.toLowerCase()}`, aggregateType: 'OwnerPetRelation', aggregateId: item.id, idempotencyKey: key });
    ctx.json(response, 200, { ok: true }); return true;
  }

  const ownerConsents = url.pathname.match(/^\/api\/v1\/staff\/care\/owners\/([^/]+)\/consents$/);
  if (request.method === 'POST' && ownerConsents) {
    const staff = await requireStaff(ctx, ownerRoles); const key = ctx.idempotencyKey(request); if (!staff) return true;
    if (!key) { ctx.json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return true; }
    const repeated = await db.consent.findUnique({ where: { idempotencyKey: key } }); if (repeated) { ctx.json(response, 200, { consent: repeated, repeated: true }); return true; }
    const input = await parse(ctx); const ownerId = decodeURIComponent(ownerConsents[1]); const owner = await db.owner.findFirst({ where: { id: ownerId, organizationId } });
    const petId = text(input?.petId, 80); const purpose = text(input?.purpose, 500); const documentVersion = text(input?.documentVersion, 120) ?? 'care-consent:v1';
    if (!owner || !input || !purpose || (petId && !await db.ownerPetRelation.findFirst({ where: { organizationId, ownerId, petId, state: 'ACTIVE' } }))) { ctx.json(response, 400, { error: 'INVALID_CONSENT' }); return true; }
    const consent = await db.consent.create({ data: { organizationId, ownerId, petId, documentVersion, purpose, state: 'SIGNED', signerName: text(input.signerName, 180) ?? owner.fullName, source: 'STAFF_WEB', proofMetadata: { actorId: staff.current.userId }, signedAt: new Date(), idempotencyKey: key } });
    await ctx.audit({ actorId: staff.current.userId, action: 'care.consent_signed', aggregateType: 'Consent', aggregateId: consent.id, idempotencyKey: key, payload: { ownerId, petId: petId ?? undefined, purpose } });
    ctx.json(response, 201, { consent }); return true;
  }

  const consentRoute = url.pathname.match(/^\/api\/v1\/staff\/care\/consents\/([^/]+)$/);
  if (request.method === 'PATCH' && consentRoute) {
    const staff = await requireStaff(ctx, ownerRoles); const key = ctx.idempotencyKey(request); if (!staff) return true;
    if (!key) { ctx.json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return true; }
    const consent = await db.consent.findFirst({ where: { id: decodeURIComponent(consentRoute[1]), organizationId } }); if (!consent) { ctx.json(response, 404, { error: 'CONSENT_NOT_FOUND' }); return true; }
    if (consent.state !== 'REVOKED') await db.consent.update({ where: { id: consent.id }, data: { state: 'REVOKED', revokedAt: new Date() } });
    await ctx.audit({ actorId: staff.current.userId, action: 'care.consent_revoked', aggregateType: 'Consent', aggregateId: consent.id, idempotencyKey: key });
    ctx.json(response, 200, { ok: true }); return true;
  }

  const petFiles = url.pathname.match(/^\/api\/v1\/staff\/care\/pets\/([^/]+)\/files$/);
  if (request.method === 'POST' && petFiles) {
    const staff = await requireStaff(ctx, petRoles); const key = ctx.idempotencyKey(request); if (!staff) return true;
    if (!key) { ctx.json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return true; }
    const repeated = await db.petFile.findUnique({ where: { idempotencyKey: key } }); if (repeated) { ctx.json(response, 200, { file: repeated, repeated: true }); return true; }
    const input = await parse(ctx, 12 * 1024 * 1024); const petId = decodeURIComponent(petFiles[1]); const pet = await db.pet.findFirst({ where: { id: petId, organizationId } });
    const mimeType = String(input?.mimeType ?? ''); const category = String(input?.category ?? 'OTHER').toUpperCase(); const originalName = text(input?.originalName, 200); const raw = String(input?.contentBase64 ?? '').replace(/^data:[^;]+;base64,/, '');
    if (!pet || !input || !originalName || !fileTypes[mimeType] || !fileCategories.has(category) || !/^[A-Za-z0-9+/=\r\n]+$/.test(raw)) { ctx.json(response, 400, { error: 'INVALID_FILE' }); return true; }
    const bytes = Buffer.from(raw, 'base64'); if (!bytes.length || bytes.length > 8 * 1024 * 1024) { ctx.json(response, 413, { error: 'FILE_TOO_LARGE' }); return true; }
    const storageKey = `${organizationId}/${petId}/${randomBytes(18).toString('hex')}${fileTypes[mimeType]}`; const target = resolve(ctx.uploadRoot, storageKey);
    if (!target.startsWith(resolve(ctx.uploadRoot))) { ctx.json(response, 400, { error: 'INVALID_FILE_PATH' }); return true; }
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' });
    const relation = await db.ownerPetRelation.findFirst({ where: { organizationId, petId, state: 'ACTIVE', primary: true } });
    const file = await db.petFile.create({ data: { organizationId, ownerId: relation?.ownerId, petId, category, originalName, mimeType, sizeBytes: bytes.length, contentHash: createHash('sha256').update(bytes).digest('hex'), storageKey, uploadedBy: staff.current.userId, idempotencyKey: key } });
    await ctx.audit({ actorId: staff.current.userId, action: 'care.pet_file_uploaded', aggregateType: 'PetFile', aggregateId: file.id, idempotencyKey: key, payload: { petId, category, sizeBytes: bytes.length } });
    ctx.json(response, 201, { file }); return true;
  }

  const fileContent = url.pathname.match(/^\/api\/v1\/staff\/care\/files\/([^/]+)\/content$/);
  if (request.method === 'GET' && fileContent) {
    const staff = await requireStaff(ctx, petRoles); if (!staff) return true;
    const file = await db.petFile.findFirst({ where: { id: decodeURIComponent(fileContent[1]), organizationId, state: 'ACTIVE' } }); if (!file) { ctx.json(response, 404, { error: 'FILE_NOT_FOUND' }); return true; }
    const target = resolve(ctx.uploadRoot, file.storageKey); if (!target.startsWith(resolve(ctx.uploadRoot))) { ctx.json(response, 403, { error: 'FORBIDDEN' }); return true; }
    const bytes = await readFile(target); response.writeHead(200, { 'content-type': file.mimeType, 'content-length': bytes.length, 'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' }); response.end(bytes); return true;
  }

  const fileRoute = url.pathname.match(/^\/api\/v1\/staff\/care\/files\/([^/]+)$/);
  if (request.method === 'PATCH' && fileRoute) {
    const staff = await requireStaff(ctx, ownerRoles); const key = ctx.idempotencyKey(request); if (!staff) return true;
    if (!key) { ctx.json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return true; }
    const file = await db.petFile.findFirst({ where: { id: decodeURIComponent(fileRoute[1]), organizationId } }); if (!file) { ctx.json(response, 404, { error: 'FILE_NOT_FOUND' }); return true; }
    await db.petFile.update({ where: { id: file.id }, data: { state: 'ARCHIVED', archivedAt: new Date() } });
    await ctx.audit({ actorId: staff.current.userId, action: 'care.pet_file_archived', aggregateType: 'PetFile', aggregateId: file.id, idempotencyKey: key });
    ctx.json(response, 200, { ok: true }); return true;
  }

  return false;
}

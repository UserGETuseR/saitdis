import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import { appointmentJourney, deriveCareSignals, memorySeverity } from '../../api/src/pet-intelligence';

type JsonWriter = (response: ServerResponse, status: number, payload: unknown) => void;
type StaffAccount = { current: { userId: string }; membership: { role: string } };
type OwnerAccount = { current: { userId: string }; owner: { id: string } };

type RouteContext = {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  db: PrismaClient;
  organizationId: string;
  publicUrl: string;
  currentStaff: (request: IncomingMessage) => Promise<StaffAccount | undefined>;
  currentOwner: (request: IncomingMessage) => Promise<OwnerAccount | undefined>;
  body: (request: IncomingMessage) => Promise<string>;
  json: JsonWriter;
  idempotencyKey: (request: IncomingMessage) => string | undefined;
  audit: (input: { actorId: string; action: string; aggregateType: string; aggregateId: string; idempotencyKey: string; payload?: Record<string, unknown> }) => Promise<void>;
};

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const clean = (value: unknown, limit = 3000) => String(value ?? '').trim().slice(0, limit);
const html = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const jsonArray = (value: unknown) => Array.isArray(value) ? value.map((item) => clean(item, 500)).filter(Boolean) : [];

export async function recordAppointmentStage(db: any, organizationId: string, input: {
  appointmentId: string;
  petId: string;
  stage: string;
  message: string;
  actorId: string;
  idempotencyKey: string;
  visibleToOwner?: boolean;
}) {
  return db.appointmentStatusEvent.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      organizationId,
      appointmentId: input.appointmentId,
      petId: input.petId,
      stage: input.stage,
      message: input.message,
      createdBy: input.actorId,
      visibleToOwner: input.visibleToOwner ?? true,
      idempotencyKey: input.idempotencyKey
    }
  });
}

export async function rememberPetEvent(db: any, organizationId: string, input: {
  petId: string;
  type: string;
  title: string;
  summary: string;
  severity?: string;
  sourceType: string;
  sourceId: string;
  facts?: Record<string, unknown>;
  occurredAt?: Date;
  verifiedBy?: string;
}) {
  return db.petMemoryNode.upsert({
    where: { organizationId_sourceType_sourceId_type: { organizationId, sourceType: input.sourceType, sourceId: input.sourceId, type: input.type } },
    update: { title: input.title, summary: input.summary, severity: input.severity ?? 'INFO', facts: input.facts ?? {}, ...(input.verifiedBy ? { verifiedBy: input.verifiedBy, verifiedAt: new Date() } : {}) },
    create: { organizationId, petId: input.petId, type: input.type, title: input.title, summary: input.summary, severity: input.severity ?? 'INFO', sourceType: input.sourceType, sourceId: input.sourceId, facts: input.facts ?? {}, occurredAt: input.occurredAt ?? new Date(), ...(input.verifiedBy ? { verifiedBy: input.verifiedBy, verifiedAt: new Date() } : {}) }
  });
}

export async function linkPetMemories(db: any, organizationId: string, input: {
  petId: string;
  fromNodeId: string;
  toNodeId: string;
  relation: string;
  explanation: string;
}) {
  return db.petMemoryEdge.upsert({
    where: { organizationId_fromNodeId_toNodeId_relation: { organizationId, fromNodeId: input.fromNodeId, toNodeId: input.toNodeId, relation: input.relation } },
    update: { explanation: input.explanation },
    create: { organizationId, ...input }
  });
}

export async function refreshPetIntelligence(db: PrismaClient, organizationId: string) {
  const now = new Date();
  const pets = await db.pet.findMany({
    where: { organizationId, lifecycle: 'ACTIVE' },
    include: { relations: { where: { state: 'ACTIVE' }, orderBy: { primary: 'desc' }, take: 1 } },
    take: 500
  });
  const petIds = pets.map((pet) => pet.id);
  if (!petIds.length) return;
  const [prescriptions, labs, groomingVisits, requestedAppointments, unsignedDocuments] = await Promise.all([
    db.prescription.findMany({ where: { organizationId, encounter: { petId: { in: petIds } }, state: 'ACTIVE' }, select: { id: true, medicationName: true, state: true, endsAt: true, encounter: { select: { petId: true } } }, take: 5000 }),
    db.labOrder.findMany({ where: { organizationId, petId: { in: petIds }, state: { in: ['RESULT_READY', 'REVIEW_REQUIRED'] } }, select: { id: true, petId: true, testName: true, state: true, resultSummary: true }, take: 5000 }),
    db.groomingVisit.findMany({ where: { organizationId, petId: { in: petIds }, nextCareAt: { not: null } }, orderBy: { nextCareAt: 'desc' }, select: { petId: true, nextCareAt: true }, take: 5000 }),
    db.appointment.findMany({ where: { organizationId, petId: { in: petIds }, state: 'REQUESTED' }, orderBy: { createdAt: 'asc' }, select: { id: true, petId: true, createdAt: true }, take: 5000 }),
    db.generatedDocument.findMany({ where: { organizationId, petId: { in: petIds }, state: { in: ['DRAFT', 'AWAITING_SIGNATURE'] }, revokedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true, petId: true, createdAt: true }, take: 5000 })
  ]);
  const firstByPet = <T extends { petId: string | null }>(rows: T[]) => { const result = new Map<string, T>(); for (const row of rows) if (row.petId && !result.has(row.petId)) result.set(row.petId, row); return result; };
  const groomingByPet = firstByPet(groomingVisits);
  const appointmentByPet = firstByPet(requestedAppointments);
  const documentByPet = firstByPet(unsignedDocuments);
  for (const pet of pets) {
    const ownerId = pet.relations[0]?.ownerId;
    if (!ownerId) continue;
    const petPrescriptions = prescriptions.filter((item) => item.encounter.petId === pet.id).map(({ encounter: _encounter, ...item }) => item);
    const signals = deriveCareSignals({ now, vaccinationDueAt: pet.vaccinationDueAt, prescriptions: petPrescriptions, labs: labs.filter((item) => item.petId === pet.id), groomingNextCareAt: groomingByPet.get(pet.id)?.nextCareAt, requestedAppointment: appointmentByPet.get(pet.id) ?? null, unsignedDocument: documentByPet.get(pet.id) ?? null });
    for (const signal of signals) {
      await db.careRecommendation.upsert({
        where: { idempotencyKey: `care-engine:${organizationId}:${pet.id}:${signal.key}` },
        update: { title: signal.title, explanation: signal.explanation, expectedOutcome: signal.expectedOutcome, priority: signal.priority, assignedRole: signal.assignedRole, dueAt: signal.dueAt },
        create: { organizationId, ownerId, petId: pet.id, kind: signal.kind, title: signal.title, explanation: signal.explanation, expectedOutcome: signal.expectedOutcome, priority: signal.priority, assignedRole: signal.assignedRole, dueAt: signal.dueAt, idempotencyKey: `care-engine:${organizationId}:${pet.id}:${signal.key}` }
      });
    }
  }
}

async function petIntelligence(db: PrismaClient, organizationId: string, petId: string) {
  const [nodes, edges, recommendations, observations, shares, appointments, groomingProfile] = await Promise.all([
    db.petMemoryNode.findMany({ where: { organizationId, petId }, orderBy: { occurredAt: 'desc' }, take: 100 }),
    db.petMemoryEdge.findMany({ where: { organizationId, petId }, orderBy: { createdAt: 'desc' }, take: 200 }),
    db.careRecommendation.findMany({ where: { organizationId, petId }, orderBy: [{ state: 'asc' }, { priority: 'desc' }, { dueAt: 'asc' }], take: 100 }),
    db.groomingObservation.findMany({ where: { organizationId, petId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.passportShare.findMany({ where: { organizationId, petId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    db.appointment.findMany({ where: { organizationId, petId, state: { in: ['CHECKED_IN', 'IN_SERVICE', 'READY'] } }, orderBy: { startsAt: 'desc' }, take: 5 }),
    db.groomingProfile.findUnique({ where: { organizationId_petId: { organizationId, petId } } })
  ]);
  const appointmentIds = appointments.map((item) => item.id);
  const events = appointmentIds.length ? await db.appointmentStatusEvent.findMany({ where: { organizationId, appointmentId: { in: appointmentIds } }, orderBy: { createdAt: 'asc' } }) : [];
  return {
    memoryGraph: { nodes, edges }, recommendations, observations, groomingProfile,
    passportShares: shares.map((item) => ({ id: item.id, scope: item.scope, label: item.label, state: item.state, expiresAt: item.expiresAt, accessCount: item.accessCount, lastAccessedAt: item.lastAccessedAt, revokedAt: item.revokedAt })),
    activeVisits: appointments.map((item) => ({ id: item.id, state: item.state, journey: appointmentJourney(item.state, nodes.some((node) => node.sourceId === item.id && node.type === 'RECOMMENDATION')), events: events.filter((event) => event.appointmentId === item.id) }))
  };
}

export async function handlePetIntelligenceRoutes(ctx: RouteContext) {
  const { request, response, url, db, organizationId, publicUrl, json } = ctx;
  const staffPet = url.pathname.match(/^\/api\/v1\/staff\/pets\/([^/]+)\/intelligence$/);
  if (request.method === 'GET' && staffPet) {
    const account = await ctx.currentStaff(request);
    if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return true; }
    const petId = decodeURIComponent(staffPet[1]);
    const pet = await db.pet.findFirst({ where: { id: petId, organizationId } });
    if (!pet) { json(response, 404, { error: 'PET_NOT_FOUND' }); return true; }
    json(response, 200, { pet: { id: pet.id, name: pet.name }, ...(await petIntelligence(db, organizationId, pet.id)) });
    return true;
  }

  const clientPet = url.pathname.match(/^\/api\/v1\/client\/pets\/([^/]+)\/intelligence$/);
  if (request.method === 'GET' && clientPet) {
    const account = await ctx.currentOwner(request);
    if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return true; }
    const petId = decodeURIComponent(clientPet[1]);
    const relation = await db.ownerPetRelation.findFirst({ where: { organizationId, ownerId: account.owner.id, petId, state: 'ACTIVE' } });
    if (!relation) { json(response, 403, { error: 'PET_ACCESS_DENIED' }); return true; }
    const data = await petIntelligence(db, organizationId, petId);
    json(response, 200, {
      memoryGraph: { nodes: data.memoryGraph.nodes.filter((item) => item.verifiedAt), edges: data.memoryGraph.edges },
      recommendations: data.recommendations.filter((item) => ['VERIFIED', 'IN_PROGRESS', 'COMPLETED'].includes(item.state)),
      observations: data.observations.filter((item) => ['VERIFIED', 'ESCALATED'].includes(item.state)),
      passportShares: data.passportShares,
      activeVisits: data.activeVisits.map((visit) => ({ ...visit, events: visit.events.filter((event) => event.visibleToOwner) }))
    });
    return true;
  }

  const recommendation = url.pathname.match(/^\/api\/v1\/staff\/care-recommendations\/([^/]+)$/);
  if (request.method === 'PATCH' && recommendation) {
    const account = await ctx.currentStaff(request); const key = ctx.idempotencyKey(request);
    if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return true; }
    if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return true; }
    let input: { action?: string; resolution?: string } = {}; try { input = JSON.parse(await ctx.body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return true; }
    const item = await db.careRecommendation.findFirst({ where: { id: decodeURIComponent(recommendation[1]), organizationId } });
    if (!item) { json(response, 404, { error: 'RECOMMENDATION_NOT_FOUND' }); return true; }
    const action = clean(input.action, 40).toUpperCase();
    if (['VERIFY', 'DISMISS'].includes(action) && item.assignedRole === 'VETERINARIAN' && !['ADMIN', 'VETERINARIAN'].includes(account.membership.role)) { json(response, 403, { error: 'VETERINARY_REVIEW_REQUIRED' }); return true; }
    const allowedStates: Record<string, string[]> = { VERIFY: ['PROPOSED'], START: ['VERIFIED'], COMPLETE: ['VERIFIED', 'IN_PROGRESS'], DISMISS: ['PROPOSED', 'VERIFIED'] };
    if (!allowedStates[action]?.includes(item.state)) { json(response, 409, { error: 'INVALID_RECOMMENDATION_TRANSITION', state: item.state }); return true; }
    const transitions: Record<string, any> = {
      VERIFY: { state: 'VERIFIED', reviewedBy: account.current.userId, reviewedAt: new Date(), resolution: clean(input.resolution) || null },
      START: { state: 'IN_PROGRESS', reviewedBy: item.reviewedBy ?? account.current.userId, reviewedAt: item.reviewedAt ?? new Date() },
      COMPLETE: { state: 'COMPLETED', completedBy: account.current.userId, completedAt: new Date(), resolution: clean(input.resolution) || 'Выполнено командой VetSvet' },
      DISMISS: { state: 'DISMISSED', reviewedBy: account.current.userId, reviewedAt: new Date(), resolution: clean(input.resolution) || 'Проверено и отклонено' }
    };
    if (!transitions[action]) { json(response, 400, { error: 'INVALID_RECOMMENDATION_ACTION' }); return true; }
    const updated = await db.careRecommendation.update({ where: { id: item.id }, data: transitions[action] });
    await ctx.audit({ actorId: account.current.userId, action: `care_recommendation.${action.toLowerCase()}`, aggregateType: 'CareRecommendation', aggregateId: item.id, idempotencyKey: key, payload: { state: updated.state, petId: updated.petId } });
    json(response, 200, { recommendation: updated }); return true;
  }

  const observationCreate = url.pathname.match(/^\/api\/v1\/staff\/grooming\/visits\/([^/]+)\/observations$/);
  if (request.method === 'POST' && observationCreate) {
    const account = await ctx.currentStaff(request); const key = ctx.idempotencyKey(request);
    if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return true; }
    if (!['ADMIN', 'GROOMER'].includes(account.membership.role)) { json(response, 403, { error: 'GROOMING_ROLE_REQUIRED' }); return true; }
    if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return true; }
    const repeated = await db.groomingObservation.findUnique({ where: { idempotencyKey: key } });
    if (repeated) { json(response, 200, { observation: repeated, repeated: true }); return true; }
    let input: { category?: string; note?: string; severity?: string } = {}; try { input = JSON.parse(await ctx.body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return true; }
    const visit = await db.groomingVisit.findFirst({ where: { id: decodeURIComponent(observationCreate[1]), organizationId } });
    if (!visit) { json(response, 404, { error: 'GROOMING_VISIT_NOT_FOUND' }); return true; }
    const category = clean(input.category, 40).toUpperCase(); const severity = clean(input.severity || 'LOW', 20).toUpperCase(); const note = clean(input.note);
    if (!['SKIN', 'COAT', 'EAR', 'PAIN', 'BEHAVIOR', 'OTHER'].includes(category) || !['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(severity) || note.length < 8) { json(response, 400, { error: 'INVALID_SAFE_OBSERVATION' }); return true; }
    const result = await db.$transaction(async (tx) => {
      const created = await tx.groomingObservation.create({ data: { organizationId, appointmentId: visit.appointmentId, groomingVisitId: visit.id, petId: visit.petId, category, note, severity, observedBy: account.current.userId, idempotencyKey: key } });
      const node = await rememberPetEvent(tx, organizationId, { petId: visit.petId, type: 'GROOMING_OBSERVATION', title: `Наблюдение грумера · ${category}`, summary: note, severity: memorySeverity(severity), sourceType: 'GROOMING_OBSERVATION', sourceId: created.id, facts: { category, severity, disclaimer: 'Наблюдение не является диагнозом' }, verifiedBy: undefined });
      await tx.groomingObservation.update({ where: { id: created.id }, data: { linkedMemoryNodeId: node.id } });
      if (['HIGH', 'URGENT'].includes(severity)) {
        const relation = await tx.ownerPetRelation.findFirst({ where: { organizationId, petId: visit.petId, state: 'ACTIVE' }, orderBy: { primary: 'desc' } });
        if (relation) await tx.careRecommendation.upsert({ where: { idempotencyKey: `grooming-observation:${created.id}` }, update: {}, create: { organizationId, ownerId: relation.ownerId, petId: visit.petId, triggerNodeId: node.id, kind: 'VETERINARY_REVIEW', title: 'Ветеринару проверить наблюдение грумера', explanation: `Во время ухода безопасно зафиксировано наблюдение: ${note}. Это не диагноз.`, expectedOutcome: 'Ветеринарный сотрудник проверит наблюдение и решит, нужны ли ограничения ухода или контакт с владельцем.', priority: severity === 'URGENT' ? 'HIGH' : 'NORMAL', assignedRole: 'VETERINARIAN', idempotencyKey: `grooming-observation:${created.id}` } });
      }
      return { created, node };
    });
    await ctx.audit({ actorId: account.current.userId, action: 'grooming_observation.created', aggregateType: 'GroomingObservation', aggregateId: result.created.id, idempotencyKey: key, payload: { petId: visit.petId, category, severity } });
    json(response, 201, { observation: { ...result.created, linkedMemoryNodeId: result.node.id }, disclaimer: 'Наблюдение грумера не является диагнозом и передано на проверку по правилам VetSvet.' }); return true;
  }

  const observationReview = url.pathname.match(/^\/api\/v1\/staff\/grooming\/observations\/([^/]+)$/);
  if (request.method === 'PATCH' && observationReview) {
    const account = await ctx.currentStaff(request); const key = ctx.idempotencyKey(request);
    if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return true; }
    if (!['ADMIN', 'VETERINARIAN'].includes(account.membership.role)) { json(response, 403, { error: 'VETERINARY_REVIEW_REQUIRED' }); return true; }
    if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return true; }
    let input: { action?: string; restriction?: string } = {}; try { input = JSON.parse(await ctx.body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return true; }
    const observation = await db.groomingObservation.findFirst({ where: { id: decodeURIComponent(observationReview[1]), organizationId } });
    if (!observation) { json(response, 404, { error: 'OBSERVATION_NOT_FOUND' }); return true; }
    if (observation.state !== 'NEW') { json(response, 409, { error: 'OBSERVATION_ALREADY_REVIEWED', state: observation.state }); return true; }
    const action = clean(input.action, 30).toUpperCase(); if (!['VERIFY', 'DISMISS', 'ESCALATE'].includes(action)) { json(response, 400, { error: 'INVALID_REVIEW_ACTION' }); return true; }
    const state = action === 'DISMISS' ? 'DISMISSED' : action === 'ESCALATE' ? 'ESCALATED' : 'VERIFIED';
    const updated = await db.$transaction(async (tx) => {
      const item = await tx.groomingObservation.update({ where: { id: observation.id }, data: { state, reviewedBy: account.current.userId, reviewedAt: new Date() } });
      if (observation.linkedMemoryNodeId) await tx.petMemoryNode.update({ where: { id: observation.linkedMemoryNodeId }, data: { verifiedBy: account.current.userId, verifiedAt: new Date(), severity: state === 'DISMISSED' ? 'INFO' : memorySeverity(observation.severity) } });
      const restriction = clean(input.restriction, 500);
      if (restriction && state !== 'DISMISSED') {
        const profile = await tx.groomingProfile.findUnique({ where: { organizationId_petId: { organizationId, petId: observation.petId } } });
        const restrictions = Array.from(new Set([...jsonArray(profile?.medicalRestrictions), restriction]));
        await tx.groomingProfile.upsert({ where: { organizationId_petId: { organizationId, petId: observation.petId } }, update: { medicalRestrictions: restrictions }, create: { organizationId, petId: observation.petId, medicalRestrictions: restrictions } });
      }
      return item;
    });
    await ctx.audit({ actorId: account.current.userId, action: `grooming_observation.${action.toLowerCase()}`, aggregateType: 'GroomingObservation', aggregateId: observation.id, idempotencyKey: key, payload: { petId: observation.petId, state } });
    json(response, 200, { observation: updated }); return true;
  }

  const clientShares = url.pathname.match(/^\/api\/v1\/client\/pets\/([^/]+)\/passport-shares$/);
  if (clientShares && ['GET', 'POST'].includes(request.method ?? '')) {
    const account = await ctx.currentOwner(request);
    if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return true; }
    const petId = decodeURIComponent(clientShares[1]);
    const relation = await db.ownerPetRelation.findFirst({ where: { organizationId, ownerId: account.owner.id, petId, state: 'ACTIVE' } });
    if (!relation) { json(response, 403, { error: 'PET_ACCESS_DENIED' }); return true; }
    if (request.method === 'GET') {
      const shares = await db.passportShare.findMany({ where: { organizationId, ownerId: account.owner.id, petId }, orderBy: { createdAt: 'desc' }, take: 30 });
      json(response, 200, { shares: shares.map((item) => ({ id: item.id, scope: item.scope, label: item.label, state: item.state, expiresAt: item.expiresAt, accessCount: item.accessCount, lastAccessedAt: item.lastAccessedAt, revokedAt: item.revokedAt })) }); return true;
    }
    const key = ctx.idempotencyKey(request); if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return true; }
    if (await db.passportShare.findUnique({ where: { idempotencyKey: key } })) { json(response, 409, { error: 'PASSPORT_SHARE_REQUEST_ALREADY_USED', message: 'Эта команда уже была выполнена. Создайте новую ссылку отдельным нажатием.' }); return true; }
    let input: { scope?: string; expiresInHours?: number; label?: string } = {}; try { input = JSON.parse(await ctx.body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return true; }
    const scope = clean(input.scope || 'MEDICAL', 20).toUpperCase(); const hours = Math.trunc(Number(input.expiresInHours ?? 24));
    if (!['BASIC', 'MEDICAL', 'EMERGENCY'].includes(scope) || hours < 1 || hours > 168) { json(response, 400, { error: 'INVALID_PASSPORT_SCOPE' }); return true; }
    const secret = randomBytes(32).toString('base64url');
    const share = await db.passportShare.create({ data: { organizationId, ownerId: account.owner.id, petId, token: hash(secret), scope, state: 'ACTIVE', expiresAt: new Date(Date.now() + hours * 3_600_000), label: clean(input.label, 120) || null, createdBy: account.current.userId, idempotencyKey: key } });
    await ctx.audit({ actorId: account.current.userId, action: 'care_passport.shared', aggregateType: 'PassportShare', aggregateId: share.id, idempotencyKey: key, payload: { petId, scope, expiresAt: share.expiresAt.toISOString() } });
    json(response, 201, { share: { id: share.id, scope, label: share.label, expiresAt: share.expiresAt, url: `${publicUrl}/care-passport/${secret}` }, warning: 'Ссылка показана один раз. Передавайте её только доверенному специалисту.' }); return true;
  }

  const revokeShare = url.pathname.match(/^\/api\/v1\/client\/passport-shares\/([^/]+)$/);
  if (request.method === 'DELETE' && revokeShare) {
    const account = await ctx.currentOwner(request); const key = ctx.idempotencyKey(request);
    if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return true; }
    if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return true; }
    const share = await db.passportShare.findFirst({ where: { id: decodeURIComponent(revokeShare[1]), organizationId, ownerId: account.owner.id } });
    if (!share) { json(response, 404, { error: 'SHARE_NOT_FOUND' }); return true; }
    await db.passportShare.update({ where: { id: share.id }, data: { state: 'REVOKED', revokedAt: new Date() } });
    await ctx.audit({ actorId: account.current.userId, action: 'care_passport.revoked', aggregateType: 'PassportShare', aggregateId: share.id, idempotencyKey: key, payload: { petId: share.petId } });
    json(response, 200, { ok: true }); return true;
  }

  const publicPassport = url.pathname.match(/^\/care-passport\/([^/]+)$/);
  if (request.method === 'GET' && publicPassport) {
    const share = await db.passportShare.findUnique({ where: { token: hash(decodeURIComponent(publicPassport[1])) } });
    if (!share || share.organizationId !== organizationId || share.state !== 'ACTIVE' || share.expiresAt <= new Date()) {
      response.writeHead(410, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
      response.end('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Доступ завершён</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#082f30;color:#fff;font:18px system-ui"><main><h1>Ссылка больше не действует</h1><p>Попросите владельца создать новый защищённый доступ.</p></main></body></html>'); return true;
    }
    const [pet, owner, nodes, prescriptions, labs] = await Promise.all([
      db.pet.findFirst({ where: { id: share.petId, organizationId } }),
      db.owner.findFirst({ where: { id: share.ownerId, organizationId } }),
      db.petMemoryNode.findMany({ where: { organizationId, petId: share.petId, verifiedAt: { not: null } }, orderBy: { occurredAt: 'desc' }, take: 30 }),
      db.prescription.findMany({ where: { organizationId, encounter: { petId: share.petId }, state: 'ACTIVE' }, orderBy: { startsAt: 'desc' }, take: 20 }),
      db.labOrder.findMany({ where: { organizationId, petId: share.petId, state: { in: ['RESULT_READY', 'REVIEWED', 'COMPLETE'] } }, orderBy: { orderedAt: 'desc' }, take: 20 })
    ]);
    if (!pet || !owner) { json(response, 404, { error: 'NOT_FOUND' }); return true; }
    await db.passportShare.update({ where: { id: share.id }, data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() } });
    const medical = share.scope !== 'BASIC'; const emergency = share.scope === 'EMERGENCY';
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" });
    response.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Care Passport · ${html(pet.name)}</title><style>body{margin:0;background:#eaf4ee;color:#10211f;font:15px/1.55 Inter,system-ui}.page{max-width:880px;margin:auto;padding:28px}.hero{padding:32px;border-radius:28px;background:radial-gradient(circle at 85% 10%,#bffbd5 0 10%,transparent 32%),#073f40;color:white;box-shadow:0 24px 80px #073f4030}.eyebrow{letter-spacing:.15em;text-transform:uppercase;color:#bffbd5;font-size:11px;font-weight:800}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px;margin-top:16px}.card{padding:20px;border:1px solid #cadbd1;border-radius:20px;background:#fff}.card h2{margin:0 0 12px;font-size:18px}.pill{display:inline-block;margin:3px;padding:6px 9px;border-radius:99px;background:#e4f7e9}.alert{background:#fff1df}.muted{color:#64716a;font-size:12px}@media(max-width:600px){.page{padding:0}.hero{border-radius:0;padding:26px 20px}.grid{padding:0 12px 20px}}</style></head><body><main class="page"><section class="hero"><p class="eyebrow">VetSvet · защищённый Care Passport</p><h1>${html(pet.name)}</h1><p>${html([pet.species, pet.breed, pet.sex].filter(Boolean).join(' · '))}</p><small>Доступ действует до ${html(share.expiresAt.toLocaleString('ru-RU'))} · режим ${html(share.scope)}</small></section><section class="grid"><article class="card"><h2>Идентификация</h2><p>Дата рождения: ${html(pet.birthDate?.toLocaleDateString('ru-RU') ?? 'не указана')}<br>Микрочип: ${html(pet.microchip ?? 'не указан')}<br>Паспорт: ${html(pet.passportId ?? 'не указан')}</p></article>${medical ? `<article class="card alert"><h2>Важно перед помощью</h2><p><b>Аллергии и риски:</b> ${html(jsonArray(pet.medicalAlerts).join(', ') || 'не зафиксированы')}<br><b>Хронические состояния:</b> ${html(jsonArray(pet.chronicConditions).join(', ') || 'не зафиксированы')}<br><b>Препараты:</b> ${html(pet.medicationNotes || 'нет заметки')}</p></article><article class="card"><h2>Текущие назначения</h2>${prescriptions.map((item) => `<p><b>${html(item.medicationName)}</b><br>${html(item.instructions)}${item.endsAt ? `<br><span class="muted">до ${html(item.endsAt.toLocaleDateString('ru-RU'))}</span>` : ''}</p>`).join('') || '<p>Активных назначений нет.</p>'}</article><article class="card"><h2>Проверенная память</h2>${nodes.map((node) => `<p><b>${html(node.title)}</b><br>${html(node.summary)}<br><span class="muted">${html(node.occurredAt.toLocaleDateString('ru-RU'))}</span></p>`).join('') || '<p>Проверенных записей пока нет.</p>'}</article><article class="card"><h2>Результаты</h2>${labs.map((lab) => `<p><b>${html(lab.testName)}</b><br>${html(lab.resultSummary ?? lab.state)}</p>`).join('') || '<p>Доступных результатов нет.</p>'}</article>` : ''}${emergency ? `<article class="card"><h2>Экстренная связь</h2><p>${html(owner.emergencyContact || 'Экстренный контакт не указан')}</p><p class="muted">Используйте только для оказания помощи питомцу.</p></article>` : ''}</section></main></body></html>`); return true;
  }
  return false;
}

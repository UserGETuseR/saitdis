import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Prisma, PrismaClient } from '@prisma/client';
import { clinicalReadiness, clinicalSignature } from '../../api/src/clinical-workflow';

type StaffAccount = { current: { userId: string }; membership: { role: string } };
type Context = {
  request: IncomingMessage; response: ServerResponse; url: URL; db: PrismaClient; organizationId: string;
  currentStaff(request: IncomingMessage): Promise<StaffAccount | undefined>;
  body(request: IncomingMessage): Promise<string>;
  json(response: ServerResponse, status: number, payload: unknown): void;
  idempotencyKey(request: IncomingMessage): string | undefined;
  audit(input: { actorId: string; action: string; aggregateType: string; aggregateId: string; idempotencyKey: string; payload?: Record<string, unknown> }): Promise<void>;
};

type DiagnosisInput = { code?: unknown; display?: unknown; diagnosisType?: unknown; certainty?: unknown };
type ProcedureInput = { code?: unknown; display?: unknown; quantityMilli?: unknown; unitPriceMinor?: unknown };
type PrescriptionInput = { medicationName?: unknown; instructions?: unknown; durationDays?: unknown };
const clean = (value: unknown, limit = 4000) => String(value ?? '').trim().slice(0, limit);
const jsonObject = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const diagnoses = (value: unknown) => (Array.isArray(value) ? value : []).map((item: DiagnosisInput) => ({ code: clean(item.code, 80) || null, display: clean(item.display, 300), diagnosisType: clean(item.diagnosisType, 40).toUpperCase() || 'WORKING', certainty: clean(item.certainty, 40).toUpperCase() || 'SUSPECTED' })).filter((item) => item.display.length >= 3).slice(0, 30);
const procedures = (value: unknown) => (Array.isArray(value) ? value : []).map((item: ProcedureInput) => ({ code: clean(item.code, 80) || null, display: clean(item.display, 300), quantityMilli: Math.max(1, Math.min(1_000_000, Math.round(Number(item.quantityMilli ?? 1000)))), unitPriceMinor: Math.max(0, Math.min(100_000_000, Math.round(Number(item.unitPriceMinor ?? 0)))) })).filter((item) => item.display.length >= 3).slice(0, 50);
const prescriptions = (value: unknown) => (Array.isArray(value) ? value : []).map((item: PrescriptionInput) => ({ medicationName: clean(item.medicationName, 240), instructions: clean(item.instructions, 1000), durationDays: Math.max(0, Math.min(365, Math.trunc(Number(item.durationDays ?? 0)))) })).filter((item) => item.medicationName && item.instructions).slice(0, 20);
const html = (value: unknown) => clean(value, 12_000).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

const includeEncounter = { diagnoses: true, procedures: true, prescriptions: true } as const;
const outputEncounter = (item: any) => ({ id: item.id, caseId: item.caseId, appointmentId: item.appointmentId, petId: item.petId, version: item.version, recordVersion: item.recordVersion, state: item.state, complaint: item.complaint, history: item.history, vitals: item.vitals, subjective: item.subjective, objective: item.objective, assessment: item.assessment, plan: item.plan, dischargeSummary: item.dischargeSummary, clinicianId: item.clinicianId, signedBy: item.signedBy, signatureHash: item.signatureHash, lockedAt: item.lockedAt, finalizedAt: item.finalizedAt, amendmentOfId: item.amendmentOfId, revisionReason: item.revisionReason, diagnoses: item.diagnoses, procedures: item.procedures, prescriptions: item.prescriptions, updatedAt: item.updatedAt });

async function clinicalAppointment(db: PrismaClient, organizationId: string, appointmentId: string) {
  const appointment = await db.appointment.findFirst({ where: { id: appointmentId, organizationId } });
  if (!appointment) return undefined;
  const variant = await db.serviceVariant.findFirst({ where: { id: appointment.variantId, organizationId }, include: { service: true } });
  return variant?.service.kind === 'VETERINARY' ? { appointment, variant } : undefined;
}

export async function handleClinicalRoutes(ctx: Context): Promise<boolean> {
  const { request, response, url, db, organizationId } = ctx;
  if (request.method === 'GET' && url.pathname === '/api/v1/staff/clinical/workspace') {
    const staff = await ctx.currentStaff(request);
    if (!staff) { ctx.json(response, 401, { error: 'UNAUTHORIZED' }); return true; }
    if (!['ADMIN', 'VETERINARIAN', 'ASSISTANT'].includes(staff.membership.role)) { ctx.json(response, 403, { error: 'CLINICAL_ROLE_REQUIRED' }); return true; }
    const variants = await db.serviceVariant.findMany({ where: { organizationId, service: { kind: 'VETERINARY' } }, include: { service: true } });
    const appointments = await db.appointment.findMany({ where: { organizationId, variantId: { in: variants.map((item) => item.id) }, OR: [{ state: { in: ['CHECKED_IN', 'IN_SERVICE', 'READY'] } }, { startsAt: { gte: new Date(Date.now() - 90 * 86400000) } }] }, orderBy: { startsAt: 'desc' }, take: 250 });
    const [owners, pets, encounters, invoices, documents, followUps] = await Promise.all([
      db.owner.findMany({ where: { organizationId, id: { in: appointments.map((item) => item.ownerId) } } }),
      db.pet.findMany({ where: { organizationId, id: { in: appointments.map((item) => item.petId) } } }),
      db.encounter.findMany({ where: { organizationId, OR: [{ appointmentId: { in: appointments.map((item) => item.id) } }, { amendmentOfId: { not: null }, petId: { in: appointments.map((item) => item.petId) } }] }, include: includeEncounter, orderBy: [{ updatedAt: 'desc' }] }),
      db.invoice.findMany({ where: { organizationId, appointmentId: { in: appointments.map((item) => item.id) } }, include: { lines: true, payments: true } }),
      db.generatedDocument.findMany({ where: { organizationId, appointmentId: { in: appointments.map((item) => item.id) }, kind: 'CLINICAL_DISCHARGE', revokedAt: null }, orderBy: { createdAt: 'desc' } }),
      db.carePlanTask.findMany({ where: { organizationId, category: 'CLINICAL_FOLLOW_UP', carePlan: { petId: { in: appointments.map((item) => item.petId) } } }, include: { carePlan: { select: { petId: true } } }, orderBy: { dueAt: 'asc' }, take: 300 })
    ]);
    const ownerById = new Map(owners.map((item) => [item.id, item])); const petById = new Map(pets.map((item) => [item.id, item])); const variantById = new Map(variants.map((item) => [item.id, item]));
    const encounterByAppointment = new Map(encounters.filter((item) => item.appointmentId).map((item) => [item.appointmentId!, item])); const invoiceByAppointment = new Map(invoices.map((item) => [item.appointmentId!, item])); const documentByAppointment = new Map(documents.map((item) => [item.appointmentId!, item]));
    ctx.json(response, 200, { role: staff.membership.role, visits: appointments.map((appointment) => { const encounter = encounterByAppointment.get(appointment.id); return { id: appointment.id, state: appointment.state, startsAt: appointment.startsAt, endsAt: appointment.endsAt, staffId: appointment.staffId, owner: ownerById.get(appointment.ownerId), pet: petById.get(appointment.petId), service: variantById.get(appointment.variantId)?.service.publicName, variant: variantById.get(appointment.variantId)?.name, encounter: encounter ? outputEncounter(encounter) : null, amendments: encounter ? encounters.filter((item) => item.amendmentOfId === encounter.id).map(outputEncounter) : [], invoice: invoiceByAppointment.get(appointment.id) ?? null, dischargeDocument: documentByAppointment.get(appointment.id) ?? null, followUps: followUps.filter((item) => item.carePlan.petId === appointment.petId).map(({ carePlan: _carePlan, ...item }) => item) }; }) });
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/v1/staff/clinical/drafts') {
    const staff = await ctx.currentStaff(request); const key = ctx.idempotencyKey(request);
    if (!staff) { ctx.json(response, 401, { error: 'UNAUTHORIZED' }); return true; }
    if (!['ADMIN', 'VETERINARIAN'].includes(staff.membership.role)) { ctx.json(response, 403, { error: 'CLINICAL_ROLE_REQUIRED' }); return true; }
    if (!key) { ctx.json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return true; }
    const repeated = await db.encounter.findUnique({ where: { idempotencyKey: key }, include: includeEncounter }); if (repeated) { ctx.json(response, 200, { encounter: outputEncounter(repeated) }); return true; }
    let input: Record<string, unknown>; try { input = JSON.parse(await ctx.body(request)); } catch { ctx.json(response, 400, { error: 'INVALID_REQUEST' }); return true; }
    const resolved = await clinicalAppointment(db, organizationId, clean(input.appointmentId, 80));
    if (!resolved || !['CHECKED_IN', 'IN_SERVICE'].includes(resolved.appointment.state)) { ctx.json(response, 409, { error: 'CLINICAL_VISIT_NOT_READY' }); return true; }
    if (resolved.appointment.staffId !== staff.current.userId && staff.membership.role !== 'ADMIN') { ctx.json(response, 403, { error: 'ASSIGNED_STAFF_REQUIRED' }); return true; }
    const existing = await db.encounter.findUnique({ where: { appointmentId: resolved.appointment.id }, include: includeEncounter });
    if (existing) { ctx.json(response, 200, { encounter: outputEncounter(existing) }); return true; }
    const complaint = clean(input.complaint ?? input.reason, 500);
    if (complaint.length < 3) { ctx.json(response, 400, { error: 'COMPLAINT_REQUIRED' }); return true; }
    const encounter = await db.$transaction(async (tx) => {
      const clinicalCase = await tx.clinicalCase.findFirst({ where: { organizationId, ownerId: resolved.appointment.ownerId, petId: resolved.appointment.petId, status: 'OPEN' }, orderBy: { openedAt: 'desc' }, include: { encounters: { orderBy: { version: 'desc' }, take: 1 } } }) ?? await tx.clinicalCase.create({ data: { organizationId, ownerId: resolved.appointment.ownerId, petId: resolved.appointment.petId, status: 'OPEN', reason: complaint }, include: { encounters: true } });
      const created = await tx.encounter.create({ data: { organizationId, caseId: clinicalCase.id, appointmentId: resolved.appointment.id, petId: resolved.appointment.petId, version: (clinicalCase.encounters[0]?.version ?? 0) + 1, state: 'DRAFT', complaint, clinicianId: staff.current.userId, idempotencyKey: key }, include: includeEncounter });
      if (resolved.appointment.state === 'CHECKED_IN') await tx.appointment.update({ where: { id: resolved.appointment.id }, data: { state: 'IN_SERVICE' } });
      await tx.appointmentStatusEvent.upsert({ where: { idempotencyKey: `clinical-stage:${created.id}:STARTED` }, update: {}, create: { organizationId, appointmentId: resolved.appointment.id, petId: resolved.appointment.petId, stage: 'SPECIALIST_STARTED', message: 'Врач начал приём и ведёт клиническую запись.', createdBy: staff.current.userId, idempotencyKey: `clinical-stage:${created.id}:STARTED` } });
      return created;
    });
    await ctx.audit({ actorId: staff.current.userId, action: 'clinical.encounter_started', aggregateType: 'Encounter', aggregateId: encounter.id, idempotencyKey: key, payload: { appointmentId: resolved.appointment.id } });
    ctx.json(response, 201, { encounter: outputEncounter(encounter) }); return true;
  }

  const route = url.pathname.match(/^\/api\/v1\/staff\/clinical\/encounters\/([^/]+)$/);
  if (request.method !== 'PATCH' || !route) return false;
  const staff = await ctx.currentStaff(request); const key = ctx.idempotencyKey(request);
  if (!staff) { ctx.json(response, 401, { error: 'UNAUTHORIZED' }); return true; }
  if (!['ADMIN', 'VETERINARIAN'].includes(staff.membership.role)) { ctx.json(response, 403, { error: 'CLINICAL_ROLE_REQUIRED' }); return true; }
  if (!key) { ctx.json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return true; }
  let input: Record<string, any>; try { input = JSON.parse(await ctx.body(request)); } catch { ctx.json(response, 400, { error: 'INVALID_REQUEST' }); return true; }
  const encounter = await db.encounter.findFirst({ where: { id: decodeURIComponent(route[1]), organizationId }, include: includeEncounter });
  if (!encounter) { ctx.json(response, 404, { error: 'NOT_FOUND' }); return true; }
  if (encounter.clinicianId !== staff.current.userId && staff.membership.role !== 'ADMIN') { ctx.json(response, 403, { error: 'ENCOUNTER_CLINICIAN_REQUIRED' }); return true; }
  const action = clean(input.action, 30).toUpperCase();
  if (action === 'AMEND') {
    if (encounter.state !== 'FINALIZED' || clean(input.reason, 1000).length < 10) { ctx.json(response, 409, { error: 'SIGNED_ENCOUNTER_AND_REASON_REQUIRED' }); return true; }
    const repeated = await db.encounter.findUnique({ where: { idempotencyKey: key }, include: includeEncounter }); if (repeated) { ctx.json(response, 200, { encounter: outputEncounter(repeated) }); return true; }
    const amendment = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`clinical:${organizationId}:${encounter.caseId}`}))`;
      const latest = await tx.encounter.findFirst({ where: { caseId: encounter.caseId }, orderBy: { version: 'desc' } });
      return tx.encounter.create({ data: { organizationId, caseId: encounter.caseId, petId: encounter.petId, version: (latest?.version ?? encounter.version) + 1, state: 'DRAFT', complaint: encounter.complaint, history: encounter.history as Prisma.InputJsonValue, vitals: encounter.vitals as Prisma.InputJsonValue, subjective: encounter.subjective, objective: encounter.objective, assessment: encounter.assessment, plan: encounter.plan, dischargeSummary: encounter.dischargeSummary, clinicianId: staff.current.userId, amendmentOfId: encounter.id, revisionReason: clean(input.reason, 1000), idempotencyKey: key, diagnoses: { create: encounter.diagnoses.map((item) => ({ organizationId, code: item.code, display: item.display, diagnosisType: item.diagnosisType, certainty: item.certainty })) }, procedures: { create: encounter.procedures.map((item) => ({ organizationId, code: item.code, display: item.display, quantityMilli: item.quantityMilli, unitPriceMinor: item.unitPriceMinor })) }, prescriptions: { create: encounter.prescriptions.map((item) => ({ organizationId, medicationName: item.medicationName, instructions: item.instructions, state: item.state, prescriberId: staff.current.userId, startsAt: item.startsAt, endsAt: item.endsAt, reactions: item.reactions as Prisma.InputJsonValue })) } }, include: includeEncounter });
    });
    await ctx.audit({ actorId: staff.current.userId, action: 'clinical.amendment_started', aggregateType: 'Encounter', aggregateId: amendment.id, idempotencyKey: key, payload: { amendmentOfId: encounter.id, reason: amendment.revisionReason ?? '' } });
    ctx.json(response, 201, { encounter: outputEncounter(amendment) }); return true;
  }
  if (!['SAVE', 'FINALIZE'].includes(action) || encounter.state !== 'DRAFT') { ctx.json(response, 409, { error: 'CLINICAL_TRANSITION_NOT_ALLOWED' }); return true; }
  const expectedVersion = Math.trunc(Number(input.expectedVersion ?? 0));
  if (expectedVersion !== encounter.recordVersion) { ctx.json(response, 409, { error: 'CLINICAL_RECORD_CONFLICT', currentVersion: encounter.recordVersion }); return true; }
  const merged = {
    complaint: input.complaint === undefined ? encounter.complaint : clean(input.complaint, 500), history: input.history === undefined ? jsonObject(encounter.history) : jsonObject(input.history), vitals: input.vitals === undefined ? jsonObject(encounter.vitals) : jsonObject(input.vitals),
    subjective: input.subjective === undefined ? encounter.subjective : clean(input.subjective), objective: input.objective === undefined ? encounter.objective : clean(input.objective), assessment: input.assessment === undefined ? encounter.assessment : clean(input.assessment), plan: input.plan === undefined ? encounter.plan : clean(input.plan), dischargeSummary: input.dischargeSummary === undefined ? encounter.dischargeSummary : clean(input.dischargeSummary, 6000),
    diagnoses: input.diagnoses === undefined ? encounter.diagnoses.map((item) => ({ code: item.code, display: item.display, diagnosisType: item.diagnosisType, certainty: item.certainty })) : diagnoses(input.diagnoses),
    procedures: input.procedures === undefined ? encounter.procedures.map((item) => ({ code: item.code, display: item.display, quantityMilli: item.quantityMilli, unitPriceMinor: item.unitPriceMinor })) : procedures(input.procedures), prescriptions: input.prescriptions === undefined ? encounter.prescriptions.map((item) => ({ medicationName: item.medicationName, instructions: item.instructions, durationDays: item.endsAt ? Math.max(0, Math.ceil((item.endsAt.valueOf() - Date.now()) / 86400000)) : 0 })) : prescriptions(input.prescriptions)
  };
  if (action === 'SAVE') {
    const saved = await db.$transaction(async (tx) => {
      const updated = await tx.encounter.updateMany({ where: { id: encounter.id, state: 'DRAFT', recordVersion: expectedVersion }, data: { complaint: merged.complaint, history: merged.history as Prisma.InputJsonValue, vitals: merged.vitals as Prisma.InputJsonValue, subjective: merged.subjective, objective: merged.objective, assessment: merged.assessment, plan: merged.plan, dischargeSummary: merged.dischargeSummary, recordVersion: { increment: 1 } } });
      if (updated.count !== 1) throw new Error('CLINICAL_RECORD_CONFLICT');
      await tx.encounterDiagnosis.deleteMany({ where: { encounterId: encounter.id } }); await tx.encounterProcedure.deleteMany({ where: { encounterId: encounter.id } }); await tx.prescription.deleteMany({ where: { encounterId: encounter.id } });
      if (merged.diagnoses.length) await tx.encounterDiagnosis.createMany({ data: merged.diagnoses.map((item) => ({ organizationId, encounterId: encounter.id, ...item })) });
      if (merged.procedures.length) await tx.encounterProcedure.createMany({ data: merged.procedures.map((item) => ({ organizationId, encounterId: encounter.id, ...item })) });
      if (merged.prescriptions.length) await tx.prescription.createMany({ data: merged.prescriptions.map((item) => ({ organizationId, encounterId: encounter.id, medicationName: item.medicationName, instructions: item.instructions, state: 'DRAFT', prescriberId: staff.current.userId, endsAt: item.durationDays ? new Date(Date.now() + item.durationDays * 86400000) : null, reactions: [] })) });
      return tx.encounter.findUniqueOrThrow({ where: { id: encounter.id }, include: includeEncounter });
    }).catch((error) => { if (error instanceof Error && error.message === 'CLINICAL_RECORD_CONFLICT') return undefined; throw error; });
    if (!saved) { ctx.json(response, 409, { error: 'CLINICAL_RECORD_CONFLICT' }); return true; }
    await ctx.audit({ actorId: staff.current.userId, action: 'clinical.draft_saved', aggregateType: 'Encounter', aggregateId: saved.id, idempotencyKey: key, payload: { recordVersion: saved.recordVersion } });
    ctx.json(response, 200, { encounter: outputEncounter(saved) }); return true;
  }
  const readiness = clinicalReadiness(merged);
  if (!readiness.ready) { ctx.json(response, 422, { error: 'CLINICAL_RECORD_INCOMPLETE', missing: readiness.missing }); return true; }
  const root = encounter.appointmentId ? encounter : encounter.amendmentOfId ? await db.encounter.findUnique({ where: { id: encounter.amendmentOfId } }) : null;
  const resolved = root?.appointmentId ? await clinicalAppointment(db, organizationId, root.appointmentId) : undefined;
  if (!resolved) { ctx.json(response, 409, { error: 'CLINICAL_APPOINTMENT_CONTEXT_REQUIRED' }); return true; }
  const signatureHash = clinicalSignature({ ...merged, encounterId: encounter.id, version: encounter.version, clinicianId: staff.current.userId }); const now = new Date();
  const followUpAt = input.followUpAt ? new Date(input.followUpAt) : null;
  if (followUpAt && (Number.isNaN(followUpAt.valueOf()) || followUpAt <= now)) { ctx.json(response, 400, { error: 'INVALID_FOLLOW_UP_DATE' }); return true; }
  const result = await db.$transaction(async (tx) => {
    const changed = await tx.encounter.updateMany({ where: { id: encounter.id, state: 'DRAFT', recordVersion: expectedVersion }, data: { complaint: merged.complaint, history: merged.history as Prisma.InputJsonValue, vitals: merged.vitals as Prisma.InputJsonValue, subjective: merged.subjective, objective: merged.objective, assessment: merged.assessment, plan: merged.plan, dischargeSummary: merged.dischargeSummary, state: 'FINALIZED', signedBy: staff.current.userId, signatureHash, lockedAt: now, finalizedAt: now, recordVersion: { increment: 1 } } });
    if (changed.count !== 1) throw new Error('CLINICAL_RECORD_CONFLICT');
    await tx.encounterDiagnosis.deleteMany({ where: { encounterId: encounter.id } }); await tx.encounterProcedure.deleteMany({ where: { encounterId: encounter.id } }); await tx.prescription.deleteMany({ where: { encounterId: encounter.id } });
    await tx.encounterDiagnosis.createMany({ data: merged.diagnoses.map((item) => ({ organizationId, encounterId: encounter.id, ...item })) });
    if (merged.procedures.length) await tx.encounterProcedure.createMany({ data: merged.procedures.map((item) => ({ organizationId, encounterId: encounter.id, ...item })) });
    if (merged.prescriptions.length) await tx.prescription.createMany({ data: merged.prescriptions.map((item) => ({ organizationId, encounterId: encounter.id, medicationName: item.medicationName, instructions: item.instructions, state: 'ACTIVE', prescriberId: staff.current.userId, endsAt: item.durationDays ? new Date(Date.now() + item.durationDays * 86400000) : null, reactions: [] })) });
    let invoice = await tx.invoice.findUnique({ where: { appointmentId: resolved.appointment.id }, include: { lines: true } });
    if (!invoice) invoice = await tx.invoice.create({ data: { organizationId, ownerId: resolved.appointment.ownerId, appointmentId: resolved.appointment.id, state: 'DRAFT', totalMinor: 0 }, include: { lines: true } });
    if (!invoice.lines.length) await tx.invoiceLine.create({ data: { organizationId, invoiceId: invoice.id, lineType: 'SERVICE', referenceId: resolved.variant.id, description: resolved.variant.service.publicName, quantityMilli: 1000, unitPriceMinor: resolved.variant.priceMinor, totalMinor: resolved.variant.priceMinor, performerId: staff.current.userId, idempotencyKey: `clinical:${encounter.id}:service` } });
    for (let index = 0; index < merged.procedures.length; index += 1) { const item = merged.procedures[index]; await tx.invoiceLine.upsert({ where: { idempotencyKey: `clinical:${encounter.id}:procedure:${index}` }, update: {}, create: { organizationId, invoiceId: invoice.id, lineType: 'PROCEDURE', referenceId: encounter.id, description: item.display, quantityMilli: item.quantityMilli, unitPriceMinor: item.unitPriceMinor, totalMinor: Math.round(item.quantityMilli * item.unitPriceMinor / 1000), performerId: staff.current.userId, idempotencyKey: `clinical:${encounter.id}:procedure:${index}` } }); }
    const total = await tx.invoiceLine.aggregate({ where: { invoiceId: invoice.id }, _sum: { totalMinor: true } }); invoice = await tx.invoice.update({ where: { id: invoice.id }, data: { totalMinor: total._sum.totalMinor ?? 0, state: (total._sum.totalMinor ?? 0) > invoice.paidMinor ? 'ISSUED' : 'PAID', issuedAt: invoice.issuedAt ?? now, dueAt: invoice.dueAt ?? now }, include: { lines: true } });
    const template = await tx.printTemplate.findFirst({ where: { organizationId, kind: 'CLINICAL_DISCHARGE', state: 'PUBLISHED' }, orderBy: { version: 'desc' } });
    const owner = await tx.owner.findUniqueOrThrow({ where: { id: resolved.appointment.ownerId } }); const pet = await tx.pet.findUniqueOrThrow({ where: { id: resolved.appointment.petId } });
    let document = null;
    if (template) { const renderedBody = `<p><b>Владелец:</b> ${html(owner.fullName)}<br><b>Питомец:</b> ${html(pet.name)}<br><b>Дата:</b> ${html(now.toLocaleString('ru-RU'))}</p><h2>Итог приёма</h2><p>${html(merged.assessment)}</p><h2>План</h2><p>${html(merged.plan)}</p><h2>Рекомендации домой</h2><p>${html(merged.dischargeSummary)}</p>${merged.prescriptions.length ? `<h2>Назначения</h2>${merged.prescriptions.map((item) => `<p><b>${html(item.medicationName)}</b><br>${html(item.instructions)}</p>`).join('')}` : ''}`; document = await tx.generatedDocument.upsert({ where: { idempotencyKey: `clinical-discharge:${encounter.id}` }, update: {}, create: { organizationId, templateId: template.id, ownerId: owner.id, petId: pet.id, appointmentId: resolved.appointment.id, caseId: encounter.caseId, invoiceId: invoice.id, kind: 'CLINICAL_DISCHARGE', title: `Выписка · ${pet.name}`, documentVersion: `CLINICAL_DISCHARGE:v${encounter.version}`, renderedBody, contentHash: signatureHash, idempotencyKey: `clinical-discharge:${encounter.id}`, state: 'DELIVERED', createdBy: staff.current.userId } }); }
    await tx.appointment.update({ where: { id: resolved.appointment.id }, data: { state: 'READY' } });
    await tx.appointmentStatusEvent.upsert({ where: { idempotencyKey: `clinical-stage:${encounter.id}:READY` }, update: {}, create: { organizationId, appointmentId: resolved.appointment.id, petId: resolved.appointment.petId, stage: 'RECOMMENDATIONS_READY', message: 'Врач подписал запись. Выписка и рекомендации готовы.', createdBy: staff.current.userId, idempotencyKey: `clinical-stage:${encounter.id}:READY` } });
    if (followUpAt) {
      const carePlan = await tx.carePlan.findFirst({ where: { organizationId, ownerId: owner.id, petId: pet.id, state: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }) ?? await tx.carePlan.create({ data: { organizationId, ownerId: owner.id, petId: pet.id, title: 'План лечения и наблюдения', state: 'ACTIVE' } });
      await tx.carePlanTask.create({ data: { carePlanId: carePlan.id, organizationId, title: `Контроль после приёма: ${merged.diagnoses[0].display}`, category: 'CLINICAL_FOLLOW_UP', dueAt: followUpAt, state: 'OPEN' } });
      await tx.careRecommendation.upsert({ where: { idempotencyKey: `clinical-follow-up:${encounter.id}` }, update: { dueAt: followUpAt }, create: { organizationId, ownerId: owner.id, petId: pet.id, kind: 'CLINICAL_FOLLOW_UP', title: 'Контроль после ветеринарного приёма', explanation: `Срок назначен врачом в подписанной записи v${encounter.version}.`, expectedOutcome: 'Команда сверит состояние питомца и при необходимости скорректирует план.', priority: 'NORMAL', assignedRole: 'VETERINARIAN', dueAt: followUpAt, state: 'VERIFIED', reviewedBy: staff.current.userId, reviewedAt: now, idempotencyKey: `clinical-follow-up:${encounter.id}` } });
    }
    await tx.petMemoryNode.upsert({ where: { organizationId_sourceType_sourceId_type: { organizationId, sourceType: 'ENCOUNTER', sourceId: encounter.id, type: 'ASSESSMENT' } }, update: { title: merged.diagnoses[0].display, summary: merged.assessment, facts: { vitals: merged.vitals, diagnoses: merged.diagnoses } as Prisma.InputJsonValue, verifiedBy: staff.current.userId }, create: { organizationId, petId: pet.id, type: 'ASSESSMENT', title: merged.diagnoses[0].display, summary: merged.assessment, facts: { vitals: merged.vitals, diagnoses: merged.diagnoses } as Prisma.InputJsonValue, sourceType: 'ENCOUNTER', sourceId: encounter.id, verifiedBy: staff.current.userId, occurredAt: now } });
    const saved = await tx.encounter.findUniqueOrThrow({ where: { id: encounter.id }, include: includeEncounter }); return { encounter: saved, invoice, document };
  }).catch((error) => { if (error instanceof Error && error.message === 'CLINICAL_RECORD_CONFLICT') return undefined; throw error; });
  if (!result) { ctx.json(response, 409, { error: 'CLINICAL_RECORD_CONFLICT' }); return true; }
  await ctx.audit({ actorId: staff.current.userId, action: 'clinical.encounter_finalized', aggregateType: 'Encounter', aggregateId: encounter.id, idempotencyKey: key, payload: { appointmentId: resolved.appointment.id, invoiceId: result.invoice.id, documentId: result.document?.id, signatureHash } });
  ctx.json(response, 200, { encounter: outputEncounter(result.encounter), invoice: result.invoice, dischargeDocument: result.document }); return true;
}

import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Prisma, PrismaClient } from '@prisma/client';
import { buildBookingSlots, dateKeyInMoscow } from '../../api/src/booking-slots';
import { bookingHoldExpiresAt, canCancelBooking, canMarkNoShow, canRescheduleBooking, reminderPlan, waitlistPeriodMatches, WAITLIST_OFFER_MINUTES } from '../../api/src/booking-lifecycle';
import { advanceGroomingStage, canCompleteGrooming, createGroomingChecklist, normalizeGroomingChecklist, toggleGroomingChecklist } from '../../api/src/grooming-workflow';
import { handleCareRoutes } from './care-routes';
import { handlePetIntelligenceRoutes, linkPetMemories, recordAppointmentStage, refreshPetIntelligence, rememberPetEvent } from './pet-intelligence-routes';

type AuthMode = 'CLIENT' | 'STAFF';
type TgUpdate = {
  update_id: number;
  message?: { message_id: number; chat: { id: number }; from?: { id: number; first_name?: string; last_name?: string }; text?: string; photo?: unknown[] };
  callback_query?: { id: string; data?: string; from: { id: number }; message?: { chat: { id: number } } };
};

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const config = {
  databaseUrl: required('DATABASE_URL'),
  botToken: required('TELEGRAM_BOT_TOKEN'),
  webhookSecret: required('TELEGRAM_WEBHOOK_SECRET'),
  botUsername: required('TELEGRAM_BOT_USERNAME').replace('@', ''),
  publicUrl: required('PUBLIC_URL').replace(/\/$/, ''),
  organizationId: process.env.VETSVET_ORGANIZATION_ID?.trim() || 'vetsvet-production',
  sbpPhone: required('VETSVET_SBP_PHONE'),
  port: Number(process.env.PORT ?? 4400),
  botDryRun: process.env.BOT_DRY_RUN === 'true'
};
const db = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
const root = process.cwd();
const publicRoot = resolve(root, 'apps', 'public-web');
const clientRoot = resolve(root, 'apps', 'client-web');
const staffRoot = resolve(root, 'apps', 'staff-web');
const authRoot = resolve(root, 'apps', 'auth-web');
const photoRoot = resolve(root, 'Photo');
const uploadRoot = resolve(process.env.VETSVET_UPLOAD_ROOT?.trim() || join(root, 'storage', 'uploads'));
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const scrypt = promisify(scryptCallback);
const sameSecret = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json'
};
const staffRoles = new Set(['ADMIN', 'MANAGER', 'VETERINARIAN', 'GROOMER', 'ASSISTANT', 'RECEPTIONIST']);
const loginPattern = /^[a-z0-9][a-z0-9_.-]{2,31}$/;

async function body(request: IncomingMessage, maxBytes = 1_000_000): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const part of request) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part); total += chunk.length;
    if (total > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
function json(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}
function redirect(response: ServerResponse, location: string) { response.writeHead(302, { location }); response.end(); }
function setSession(response: ServerResponse, token: string) { response.setHeader('set-cookie', `vetsvet_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`); }
function cookie(request: IncomingMessage, name: string) {
  return request.headers.cookie?.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}
async function session(request: IncomingMessage) {
  const token = cookie(request, 'vetsvet_session');
  if (!token) return undefined;
  return db.authSession.findFirst({ where: { tokenHash: digest(token), state: 'ACTIVE', expiresAt: { gt: new Date() } }, include: { user: true } });
}
async function currentOwner(request: IncomingMessage) {
  const current = await session(request);
  if (!current || current.mode !== 'CLIENT') return undefined;
  const owner = await db.owner.findFirst({ where: { organizationId: config.organizationId, OR: [{ userId: current.userId }, { telegramUserId: current.user.telegramUserId ?? undefined }] } });
  return owner ? { current, owner } : undefined;
}
async function currentStaff(request: IncomingMessage) {
  const current = await session(request);
  if (!current || current.mode !== 'STAFF') return undefined;
  const membership = await db.staffMembership.findUnique({ where: { organizationId_userId: { organizationId: config.organizationId, userId: current.userId } } });
  return membership?.state === 'ACTIVE' ? { current, membership } : undefined;
}

const bookingRoles = (kind: string) => kind === 'GROOMING'
  ? ['ADMIN', 'GROOMER']
  : kind === 'VETERINARY'
    ? ['ADMIN', 'VETERINARIAN']
    : ['ADMIN', 'MANAGER', 'VETERINARIAN', 'GROOMER'];

async function bookingAvailability(variantId: string, locationId: string, date: string, excludeHoldId?: string) {
  const [variant, location] = await Promise.all([
    db.serviceVariant.findFirst({ where: { id: variantId, organizationId: config.organizationId, service: { onlineBookable: true } }, include: { service: true } }),
    db.location.findFirst({ where: { id: locationId, organizationId: config.organizationId, active: true } })
  ]);
  if (!variant || !location || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const dayStart = new Date(`${date}T00:00:00+03:00`);
  const dayEnd = new Date(`${date}T23:59:59.999+03:00`);
  if (Number.isNaN(dayStart.valueOf()) || dayEnd < new Date(Date.now() - 86400000) || dayStart > new Date(Date.now() + 120 * 86400000)) return undefined;
  await db.bookingHold.updateMany({ where: { organizationId: config.organizationId, state: 'ACTIVE', expiresAt: { lte: new Date() } }, data: { state: 'EXPIRED' } });
  const [staffCount, appointments, holds] = await Promise.all([
    db.staffMembership.count({ where: { organizationId: config.organizationId, state: 'ACTIVE', role: { in: bookingRoles(variant.service.kind) } } }),
    db.appointment.findMany({ where: { organizationId: config.organizationId, locationId, state: { in: ['REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'READY'] }, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } } }),
    db.bookingHold.findMany({ where: { organizationId: config.organizationId, locationId, state: 'ACTIVE', expiresAt: { gt: new Date() }, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart }, ...(excludeHoldId ? { id: { not: excludeHoldId } } : {}) } })
  ]);
  const variants = await db.serviceVariant.findMany({ where: { organizationId: config.organizationId, id: { in: appointments.map((item) => item.variantId) } }, include: { service: true } });
  const kindByVariant = new Map(variants.map((item) => [item.id, item.service.kind]));
  const holdVariants = holds.length ? await db.serviceVariant.findMany({ where: { organizationId: config.organizationId, id: { in: holds.map((item) => item.variantId) } }, include: { service: true } }) : [];
  const holdKindByVariant = new Map(holdVariants.map((item) => [item.id, item.service.kind]));
  const busy = [
    ...appointments.filter((item) => kindByVariant.get(item.variantId) === variant.service.kind).map((item) => ({ startsAt: item.startsAt, endsAt: item.endsAt })),
    ...holds.filter((item) => holdKindByVariant.get(item.variantId) === variant.service.kind).map((item) => ({ startsAt: item.startsAt, endsAt: item.endsAt }))
  ];
  const capacity = Math.max(0, Math.min(location.bookingCapacity || 1, staffCount));
  return { variant, location, slots: buildBookingSlots({ date, durationMinutes: variant.durationMinutes, bufferBeforeMinutes: variant.bufferBeforeMinutes, bufferAfterMinutes: variant.bufferAfterMinutes, capacity, busy }) };
}
function idempotencyKey(request: IncomingMessage) {
  const key = String(request.headers['idempotency-key'] ?? '').trim();
  return /^[A-Za-z0-9_.:-]{8,160}$/.test(key) ? key : undefined;
}
async function auditCommand(input: { actorId: string; action: string; aggregateType: string; aggregateId: string; idempotencyKey: string; payload?: Record<string, unknown> }) {
  const occurredAt = new Date();
  const eventPayload = (input.payload ?? {}) as Prisma.InputJsonValue;
  await db.$transaction([
    db.auditEvent.create({ data: { organizationId: config.organizationId, actorId: input.actorId, action: input.action, aggregateType: input.aggregateType, aggregateId: input.aggregateId, correlationId: input.idempotencyKey, metadata: eventPayload } }),
    db.outboxEvent.create({ data: { organizationId: config.organizationId, eventName: input.action, aggregateType: input.aggregateType, aggregateId: input.aggregateId, idempotencyKey: input.idempotencyKey, payload: eventPayload, occurredAt } })
  ]);
}

async function ensureBookingReminders(appointmentId: string, ownerId: string, startsAt: Date) {
  const plan = reminderPlan(startsAt);
  await db.bookingReminder.updateMany({ where: { organizationId: config.organizationId, appointmentId, state: 'PENDING' }, data: { state: 'CANCELLED', cancelledAt: new Date() } });
  for (const item of plan) {
    await db.bookingReminder.upsert({
      where: { appointmentId_kind: { appointmentId, kind: item.kind } },
      update: { scheduledAt: item.scheduledAt, state: 'PENDING', attempts: 0, sentAt: null, cancelledAt: null, lastError: null },
      create: { organizationId: config.organizationId, appointmentId, ownerId, kind: item.kind, scheduledAt: item.scheduledAt }
    });
  }
}

async function cancelBookingReminders(appointmentId: string) {
  await db.bookingReminder.updateMany({ where: { organizationId: config.organizationId, appointmentId, state: 'PENDING' }, data: { state: 'CANCELLED', cancelledAt: new Date() } });
}

async function backfillBookingReminders() {
  const appointments = await db.appointment.findMany({ where: { organizationId: config.organizationId, state: { in: ['REQUESTED', 'CONFIRMED'] }, startsAt: { gt: new Date() } }, select: { id: true, ownerId: true, startsAt: true }, take: 1000 });
  for (const appointment of appointments) { const plan = reminderPlan(appointment.startsAt); if (plan.length) await db.bookingReminder.createMany({ data: plan.map((item) => ({ organizationId: config.organizationId, appointmentId: appointment.id, ownerId: appointment.ownerId, kind: item.kind, scheduledAt: item.scheduledAt })), skipDuplicates: true }); }
}

async function offerReleasedSlot(released: { id: string; locationId: string; variantId: string; startsAt: Date; endsAt: Date }) {
  const dayStart = new Date(`${dateKeyInMoscow(released.startsAt)}T00:00:00+03:00`);
  const dayEnd = new Date(`${dateKeyInMoscow(released.startsAt)}T23:59:59.999+03:00`);
  const candidates = await db.bookingWaitlistEntry.findMany({ where: { organizationId: config.organizationId, locationId: released.locationId, variantId: released.variantId, state: 'ACTIVE', preferredDate: { gte: dayStart, lte: dayEnd } }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }], take: 20 });
  const candidate = candidates.find((item) => waitlistPeriodMatches(item.period, released.startsAt));
  if (!candidate) return;
  const expiresAt = new Date(Date.now() + WAITLIST_OFFER_MINUTES * 60_000);
  const variant = await db.serviceVariant.findFirst({ where: { id: candidate.variantId, organizationId: config.organizationId }, include: { service: true } }); if (!variant) return;
  const hold = await db.$transaction(async (tx) => { await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${config.organizationId}:${candidate.locationId}:${variant.service.kind}:${dateKeyInMoscow(released.startsAt)}`}))`; const available = await bookingAvailability(candidate.variantId, candidate.locationId, dateKeyInMoscow(released.startsAt)); if (!available?.slots.some((slot) => new Date(slot.startsAt).valueOf() === released.startsAt.valueOf())) throw new Error('SLOT_TAKEN'); return tx.bookingHold.create({ data: { organizationId: config.organizationId, ownerId: candidate.ownerId, petId: candidate.petId, variantId: candidate.variantId, locationId: candidate.locationId, startsAt: released.startsAt, endsAt: released.endsAt, state: 'ACTIVE', expiresAt, idempotencyKey: `waitlist:${candidate.id}:${released.id}` } }); }).catch(() => undefined);
  if (!hold) return;
  await db.bookingWaitlistEntry.update({ where: { id: candidate.id }, data: { state: 'OFFERED', offeredHoldId: hold.id, offeredAt: new Date(), offerExpiresAt: expiresAt } });
  const owner = await db.owner.findFirst({ where: { id: candidate.ownerId, organizationId: config.organizationId } });
  const conversation = owner?.telegramUserId ? await db.telegramConversation.findUnique({ where: { organizationId_telegramUserId: { organizationId: config.organizationId, telegramUserId: owner.telegramUserId } } }) : undefined;
  if (conversation) await say(conversation.chatId, `Освободилось окно ${released.startsAt.toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Moscow' })}. Мы держим его для вас ${WAITLIST_OFFER_MINUTES} минут. Подтвердите в личном кабинете VetSvet.`, [[{ text: 'Открыть кабинет', url: `${config.publicUrl}/client/` }]]).catch(() => undefined);
}

let remindersRunning = false;
async function processBookingReminders() {
  if (remindersRunning) return;
  remindersRunning = true;
  try {
    const expiredOffers = await db.bookingWaitlistEntry.findMany({ where: { organizationId: config.organizationId, state: 'OFFERED', offerExpiresAt: { lte: new Date() }, offeredHoldId: { not: null } }, take: 50 });
    for (const entry of expiredOffers) {
      const hold = entry.offeredHoldId ? await db.bookingHold.findFirst({ where: { id: entry.offeredHoldId, organizationId: config.organizationId } }) : null;
      await db.bookingWaitlistEntry.update({ where: { id: entry.id }, data: { state: 'EXPIRED' } });
      if (hold) { await db.bookingHold.updateMany({ where: { id: hold.id, state: 'ACTIVE' }, data: { state: 'EXPIRED' } }); await offerReleasedSlot({ id: `expired-${entry.id}`, locationId: hold.locationId, variantId: hold.variantId, startsAt: hold.startsAt, endsAt: hold.endsAt }); }
    }
    await db.bookingHold.updateMany({ where: { organizationId: config.organizationId, state: 'ACTIVE', expiresAt: { lte: new Date() } }, data: { state: 'EXPIRED' } });
    const due = await db.bookingReminder.findMany({ where: { organizationId: config.organizationId, state: 'PENDING', scheduledAt: { lte: new Date() } }, orderBy: { scheduledAt: 'asc' }, take: 30 });
    for (const reminder of due) {
      try {
        const [appointment, owner] = await Promise.all([db.appointment.findFirst({ where: { id: reminder.appointmentId, organizationId: config.organizationId } }), db.owner.findFirst({ where: { id: reminder.ownerId, organizationId: config.organizationId } })]);
        if (!appointment || !owner || !['REQUESTED', 'CONFIRMED'].includes(appointment.state) || appointment.startsAt <= new Date()) { await db.bookingReminder.update({ where: { id: reminder.id }, data: { state: 'CANCELLED', cancelledAt: new Date() } }); continue; }
        const [pet, variant, conversation] = await Promise.all([db.pet.findFirst({ where: { id: appointment.petId, organizationId: config.organizationId } }), db.serviceVariant.findFirst({ where: { id: appointment.variantId, organizationId: config.organizationId }, include: { service: true } }), owner.telegramUserId ? db.telegramConversation.findUnique({ where: { organizationId_telegramUserId: { organizationId: config.organizationId, telegramUserId: owner.telegramUserId } } }) : Promise.resolve(null)]);
        const text = `${reminder.kind === 'DAY_BEFORE' ? 'Напоминаем о завтрашнем визите' : 'До визита осталось около двух часов'}: ${pet?.name ?? 'питомец'} · ${variant?.service.publicName ?? 'VetSvet'} · ${appointment.startsAt.toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Moscow' })}.`;
        if (conversation) await say(conversation.chatId, text, [[{ text: 'Мои записи', url: `${config.publicUrl}/client/` }]]);
        await db.$transaction([db.bookingReminder.update({ where: { id: reminder.id }, data: { state: 'SENT', sentAt: new Date(), attempts: { increment: 1 }, lastError: null } }), db.communicationLog.create({ data: { organizationId: config.organizationId, ownerId: owner.id, petId: appointment.petId, channel: conversation ? 'TELEGRAM' : 'IN_APP', direction: 'OUTBOUND', kind: 'APPOINTMENT_REMINDER', subject: 'Напоминание о визите', body: text, state: conversation ? 'SENT' : 'LOGGED', idempotencyKey: `booking-reminder:${reminder.id}` } })]);
      } catch (error) {
        const attempts = reminder.attempts + 1;
        await db.bookingReminder.update({ where: { id: reminder.id }, data: { attempts, state: attempts >= 5 ? 'FAILED' : 'PENDING', scheduledAt: attempts >= 5 ? reminder.scheduledAt : new Date(Date.now() + 5 * 60_000), lastError: String(error).slice(0, 500) } });
      }
    }
  } finally { remindersRunning = false; }
}
async function serve(response: ServerResponse, base: string, path: string) {
  const target = normalize(join(base, path));
  if (!target.startsWith(base)) { json(response, 403, { error: 'FORBIDDEN' }); return; }
  try {
    const data = await readFile(target);
    response.writeHead(200, { 'content-type': mime[extname(target)] ?? 'application/octet-stream', 'cache-control': extname(target) === '.html' ? 'no-store' : 'public, max-age=300' });
    response.end(data);
  } catch { json(response, 404, { error: 'NOT_FOUND' }); }
}
async function serveStaffHome(response: ServerResponse) {
  try {
    const html = await readFile(join(staffRoot, 'index.html'), 'utf8');
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(html);
  } catch { json(response, 404, { error: 'NOT_FOUND' }); }
}
async function serveClientHome(response: ServerResponse) {
  try {
    const html = await readFile(join(clientRoot, 'index.html'), 'utf8');
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(html.replace('</body>', '<script src="/client/experience.js"></script></body>'));
  } catch { json(response, 404, { error: 'NOT_FOUND' }); }
}
async function telegram(method: string, payload: Record<string, unknown>) {
  if (config.botDryRun) return;
  const result = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (!result.ok) throw new Error(`Telegram ${method} failed.`);
}
async function say(chatId: string, text: string, keyboard?: unknown) {
  await telegram('sendMessage', { chat_id: chatId, text, reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined });
}
async function ensureBotCommandMenu() {
  await telegram('setMyCommands', { commands: [
    { command: 'menu', description: 'Главное меню VetSvet' },
    { command: 'booking', description: 'Выбрать услугу и свободное окно' },
    { command: 'consultation', description: 'Создать консультацию' },
    { command: 'pets', description: 'Мои питомцы' },
    { command: 'appointments', description: 'Мои записи и статусы' },
    { command: 'payment', description: 'Оплата и отправка чека' },
    { command: 'emergency', description: 'Что делать срочно' }
  ] });
  await telegram('setChatMenuButton', { menu_button: { type: 'commands' } });
}
async function ensureOrganization() {
  await db.organization.upsert({ where: { id: config.organizationId }, update: {}, create: { id: config.organizationId, legalName: 'VetSvet', displayName: 'ВетСвет' } });
}
async function ensureBookingFoundation() {
  const location = await db.location.findFirst({ where: { organizationId: config.organizationId, active: true }, orderBy: { name: 'asc' } })
    ?? await db.location.create({ data: { organizationId: config.organizationId, name: 'Основная клиника', timezone: 'Europe/Moscow' } });
  const defaults = [
    { internalName: 'VET_INITIAL', publicName: 'Первичный приём ветеринара', kind: 'VETERINARY', variant: 'Осмотр и план заботы', durationMinutes: 40 },
    { internalName: 'GROOMING_REQUEST', publicName: 'Груминг', kind: 'GROOMING', variant: 'Подобрать уход для питомца', durationMinutes: 90 },
    { internalName: 'REMOTE_CONSULTATION', publicName: 'Консультация', kind: 'CONSULTATION', variant: 'Онлайн-консультация специалиста', durationMinutes: 30 }
  ];
  for (const item of defaults) {
    const service = await db.service.findFirst({ where: { organizationId: config.organizationId, internalName: item.internalName } })
      ?? await db.service.create({ data: { organizationId: config.organizationId, publicName: item.publicName, internalName: item.internalName, kind: item.kind, onlineBookable: true } });
    const variant = await db.serviceVariant.findFirst({ where: { organizationId: config.organizationId, serviceId: service.id, name: item.variant } });
    if (!variant) await db.serviceVariant.create({ data: { organizationId: config.organizationId, serviceId: service.id, name: item.variant, durationMinutes: item.durationMinutes, priceMinor: 0, depositMinor: 0, allowedSpecies: ['DOG', 'CAT', 'OTHER'] } });
  }
  if (!await db.hospitalBed.count({ where: { organizationId: config.organizationId, locationId: location.id } })) {
    await db.hospitalBed.createMany({ data: [
      { organizationId: config.organizationId, locationId: location.id, label: 'A-01', zone: 'Основной стационар' },
      { organizationId: config.organizationId, locationId: location.id, label: 'A-02', zone: 'Основной стационар' },
      { organizationId: config.organizationId, locationId: location.id, label: 'A-03', zone: 'Основной стационар' },
      { organizationId: config.organizationId, locationId: location.id, label: 'ISO-01', zone: 'Изоляция', isolation: true }
    ] });
  }
  return location;
}
async function ensureDocumentFoundation() {
  const templates = [
    {
      kind: 'PROCEDURE_CONSENT',
      title: 'Согласие на осмотр и процедуры',
      body: '<p>Я, {{owner}}, подтверждаю согласие на осмотр и согласованные процедуры для питомца {{pet}} в VetSvet.</p><p>Команда объяснила цель визита «{{service}}», ожидаемый результат, существенные риски и возможные альтернативы. Я могу задать вопросы до начала процедуры.</p>'
    },
    {
      kind: 'GROOMING_CONSENT',
      title: 'Согласие на груминг и уход',
      body: '<p>Я, {{owner}}, передаю питомца {{pet}} команде VetSvet для услуги «{{service}}».</p><p>Я сообщил(а) об особенностях здоровья и поведения. Разрешаю остановить процедуру, если продолжение станет небезопасным для питомца.</p>'
    },
    {
      kind: 'REMOTE_CONSULTATION_CONSENT',
      title: 'Условия дистанционной консультации',
      body: '<p>Я, {{owner}}, понимаю, что дистанционная консультация по питомцу {{pet}} не заменяет очный осмотр и экстренную помощь.</p><p>Я обязуюсь сообщить достоверные сведения и обратиться очно при ухудшении состояния или по рекомендации специалиста VetSvet.</p>'
    },
    {
      kind: 'ESTIMATE_APPROVAL',
      title: 'Согласование расчёта',
      body: '<p>Я, {{owner}}, ознакомился(ась) с расчётом VetSvet по питомцу {{pet}} на сумму {{amount}}.</p><p>Изменения объёма помощи и итоговой стоимости согласуются отдельно.</p>'
    }
  ];
  for (const template of templates) {
    await db.printTemplate.upsert({
      where: { organizationId_kind_version: { organizationId: config.organizationId, kind: template.kind, version: 1 } },
      update: { title: template.title, body: template.body, contentHash: digest(template.body), state: 'PUBLISHED', publishedAt: new Date() },
      create: { organizationId: config.organizationId, kind: template.kind, title: template.title, version: 1, body: template.body, contentHash: digest(template.body), state: 'PUBLISHED', publishedAt: new Date() }
    });
  }
}
async function ensureGrowthFoundation() {
  await db.loyaltyPolicy.upsert({
    where: { organizationId_version: { organizationId: config.organizationId, version: 1 } },
    update: {},
    create: { organizationId: config.organizationId, name: 'Базовая забота VetSvet', pointsPer100Rubles: 1, rublesPerPoint: 1, tiers: [{ name: 'Знакомство', from: 0 }, { name: 'Рядом', from: 300 }, { name: 'Семья VetSvet', from: 1000 }], state: 'ACTIVE', version: 1 }
  });
  await refreshGrowthStates();
}
async function refreshGrowthStates() {
  const now = new Date();
  await db.packageBalance.updateMany({ where: { organizationId: config.organizationId, state: 'ACTIVE', expiresAt: { lt: now } }, data: { state: 'EXPIRED' } });
  await db.ownerMembership.updateMany({ where: { organizationId: config.organizationId, state: 'ACTIVE', currentPeriodEnd: { lt: now } }, data: { state: 'EXPIRED', autoRenew: false } });
}
async function settleGrowthBenefits(tx: Prisma.TransactionClient, invoice: { id: string; ownerId: string; state: string }, payment: { id: string; amountMinor: number }, paidAt: Date) {
  const policy = await tx.loyaltyPolicy.findFirst({ where: { organizationId: config.organizationId, state: 'ACTIVE', effectiveAt: { lte: paidAt } }, orderBy: { version: 'desc' } });
  if (policy) {
    const points = Math.floor(payment.amountMinor / 10_000) * policy.pointsPer100Rubles;
    if (points > 0 && !await tx.loyaltyLedgerEntry.findUnique({ where: { idempotencyKey: `payment:${payment.id}` } })) {
      const aggregate = await tx.loyaltyLedgerEntry.aggregate({ where: { organizationId: config.organizationId, ownerId: invoice.ownerId }, _sum: { pointsDelta: true } });
      await tx.loyaltyLedgerEntry.create({ data: { organizationId: config.organizationId, ownerId: invoice.ownerId, pointsDelta: points, balanceAfter: (aggregate._sum.pointsDelta ?? 0) + points, reason: 'Оплата услуг VetSvet', referenceType: 'PAYMENT', referenceId: payment.id, idempotencyKey: `payment:${payment.id}` } });
    }
  }
  if (invoice.state !== 'PAID') return;
  const pendingPackages = await tx.packageBalance.findMany({ where: { organizationId: config.organizationId, invoiceId: invoice.id, state: 'PENDING_PAYMENT' }, include: { servicePackage: true } });
  for (const balance of pendingPackages) await tx.packageBalance.update({ where: { id: balance.id }, data: { state: 'ACTIVE', activatedAt: paidAt, expiresAt: balance.expiresAt ?? new Date(paidAt.valueOf() + balance.servicePackage.validityDays * 86400000) } });
  const pendingMemberships = await tx.ownerMembership.findMany({ where: { organizationId: config.organizationId, invoiceId: invoice.id, state: { in: ['PENDING_PAYMENT', 'ACTIVE'] } }, include: { plan: true } });
  for (const membership of pendingMemberships) {
    const periodStart = membership.currentPeriodEnd && membership.currentPeriodEnd > paidAt ? membership.currentPeriodEnd : paidAt;
    const periodEnd = new Date(periodStart.valueOf() + membership.plan.billingPeriodDays * 86400000);
    await tx.ownerMembership.update({ where: { id: membership.id }, data: { state: 'ACTIVE', startedAt: membership.startedAt ?? paidAt, currentPeriodStart: membership.state === 'PENDING_PAYMENT' ? paidAt : membership.currentPeriodStart, currentPeriodEnd: periodEnd, renewsAt: periodEnd, pausedAt: null } });
  }
}
function safeDocumentValue(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}
function renderDocumentBody(template: string, values: Record<string, unknown>) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => safeDocumentValue(values[key] ?? '—'));
}
function invoiceState(totalMinor: number, paidMinor: number, issued: boolean) {
  if (totalMinor <= 0) return issued ? 'ISSUED' : 'DRAFT';
  if (paidMinor >= totalMinor) return 'PAID';
  if (paidMinor > 0) return 'PARTIALLY_PAID';
  return issued ? 'ISSUED' : 'DRAFT';
}
async function ownerFor(telegramUserId: string, fullName: string) {
  const user = await db.userIdentity.upsert({ where: { telegramUserId }, update: {}, create: { telegramUserId } });
  return db.owner.upsert({ where: { organizationId_telegramUserId: { organizationId: config.organizationId, telegramUserId } }, update: { fullName, userId: user.id }, create: { organizationId: config.organizationId, userId: user.id, telegramUserId, fullName } });
}
async function adminFor(chatId: string, telegramUserId: string) {
  return db.telegramAdminChat.findFirst({ where: { chatId, telegramUserId } });
}
async function adminChats() {
  const records = await db.telegramAdminChat.findMany({ orderBy: { createdAt: 'asc' } });
  return [...new Map(records.map((record) => [record.chatId, record])).values()];
}
function parseInvite(value: unknown) {
  const [id, token, extra] = String(value ?? '').split('.');
  return !extra && /^[0-9a-f-]{36}$/i.test(id ?? '') && /^[A-Za-z0-9_-]{16,}$/i.test(token ?? '') ? { id, token } : undefined;
}
function normalizeLogin(value: unknown) { return String(value ?? '').trim().toLowerCase(); }
function validPassword(value: unknown) { return typeof value === 'string' && value.length >= 10 && value.length <= 128; }
async function passwordHash(password: string) { const salt = randomBytes(16).toString('hex'); const derived = await scrypt(password, salt, 64) as Buffer; return `scrypt$${salt}$${Buffer.from(derived).toString('hex')}`; }
async function passwordMatches(password: string, encoded: string | null) { const [algorithm, salt, expected] = encoded?.split('$') ?? []; if (algorithm !== 'scrypt' || !salt || !expected) return false; const actual = Buffer.from(await scrypt(password, salt, 64) as Buffer).toString('hex'); return sameSecret(actual, expected); }
async function createPasswordSession(response: ServerResponse, userId: string, mode: AuthMode) { const token = randomBytes(32).toString('base64url'); await db.authSession.create({ data: { userId, tokenHash: digest(token), mode, state: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000) } }); setSession(response, token); }

type BotData = Record<string, string>;
function readBotData(value: Prisma.JsonValue): BotData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}
async function botAccount(telegramUserId: string) {
  const user = await db.userIdentity.findUnique({ where: { telegramUserId } });
  if (!user) return undefined;
  const owner = await db.owner.findFirst({ where: { organizationId: config.organizationId, OR: [{ userId: user.id }, { telegramUserId }] } });
  return owner ? { user, owner } : undefined;
}
async function botConversation(telegramUserId: string) {
  const record = await db.telegramConversation.findUnique({ where: { organizationId_telegramUserId: { organizationId: config.organizationId, telegramUserId } } });
  if (!record || record.expiresAt <= new Date()) return undefined;
  return { ...record, values: readBotData(record.data) };
}
async function saveBotConversation(telegramUserId: string, chatId: string, state: string, data: BotData = {}) {
  return db.telegramConversation.upsert({
    where: { organizationId_telegramUserId: { organizationId: config.organizationId, telegramUserId } },
    update: { chatId, state, data, expiresAt: new Date(Date.now() + 30 * 60_000) },
    create: { organizationId: config.organizationId, telegramUserId, chatId, state, data, expiresAt: new Date(Date.now() + 30 * 60_000) }
  });
}
async function showBotMenu(chatId: string, telegramUserId: string) {
  const account = await botAccount(telegramUserId);
  const greeting = account ? `${account.owner.fullName}, выберите, что сделать.` : 'Создайте аккаунт на сайте, затем подключите Telegram в личном кабинете. После этого бот увидит питомцев, записи и консультации.';
  await say(chatId, `VetSvet — забота рядом.\n\n${greeting}`, [
    [{ text: '🗓 Записаться', callback_data: 'bot:booking' }, { text: '💬 Консультация', callback_data: 'bot:consultation' }],
    [{ text: '🐾 Мои питомцы', callback_data: 'bot:pets' }, { text: '📋 Мои записи', callback_data: 'bot:appointments' }],
    [{ text: '💳 Оплата', callback_data: 'bot:payment' }, { text: '🚑 Срочно', callback_data: 'bot:emergency' }],
    [{ text: account ? '🌐 Открыть кабинет' : 'Создать аккаунт', url: `${config.publicUrl}/auth/` }]
  ]);
}
function botDayLabel(day: string) { return new Date(`${day}T12:00:00+03:00`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' }); }
function botDays() {
  const days: string[] = [];
  for (let offset = 0; days.length < 7 && offset < 10; offset += 1) {
    const point = new Date(Date.now() + offset * 86400000);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(point);
    const weekday = new Date(`${day}T12:00:00+03:00`).getUTCDay();
    if (weekday !== 0) days.push(day);
  }
  return days;
}
async function availableBotSlots(locationId: string, variantId: string, day: string) {
  const [location, variant] = await Promise.all([
    db.location.findFirst({ where: { id: locationId, organizationId: config.organizationId, active: true } }),
    db.serviceVariant.findFirst({ where: { id: variantId, organizationId: config.organizationId } })
  ]);
  if (!location || !variant || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const slots = [10, 12, 14, 16, 18].map((hour) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+03:00`)).filter((slot) => slot > new Date(Date.now() + 60 * 60_000));
  const result: Date[] = [];
  for (const startsAt of slots) {
    const endsAt = new Date(startsAt.valueOf() + variant.durationMinutes * 60_000);
    const occupied = await db.appointment.count({ where: { organizationId: config.organizationId, locationId, state: { in: ['REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'READY'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
    if (occupied < location.bookingCapacity) result.push(startsAt);
  }
  return result;
}
async function showBotPets(chatId: string, telegramUserId: string, purpose: 'BOOKING' | 'CONSULTATION' | 'PROFILE', initialData: BotData = {}) {
  const account = await botAccount(telegramUserId);
  if (!account) { await showBotMenu(chatId, telegramUserId); return; }
  const relations = await db.ownerPetRelation.findMany({ where: { organizationId: config.organizationId, ownerId: account.owner.id }, include: { pet: true }, orderBy: { pet: { name: 'asc' } } });
  if (purpose === 'PROFILE') {
    await say(chatId, relations.length ? `Ваши питомцы:\n${relations.map((item) => `• ${item.pet.name} · ${item.pet.species}${item.pet.breed ? ` · ${item.pet.breed}` : ''}`).join('\n')}` : 'В профиле пока нет питомцев.', [[{ text: '➕ Добавить питомца', callback_data: 'bot:addpet' }], [{ text: '← Главное меню', callback_data: 'bot:menu' }]]);
    return;
  }
  if (!relations.length) { await say(chatId, 'Сначала добавим питомца — это займёт меньше минуты.', [[{ text: '➕ Добавить питомца', callback_data: 'bot:addpet' }], [{ text: '← Главное меню', callback_data: 'bot:menu' }]]); return; }
  await saveBotConversation(telegramUserId, chatId, `${purpose}_PET`, initialData);
  await say(chatId, purpose === 'BOOKING' ? 'Кого записываем?' : 'О ком хотите проконсультироваться?', [...relations.map((item) => [{ text: `${item.pet.species === 'CAT' ? '🐈' : item.pet.species === 'DOG' ? '🐕' : '🐾'} ${item.pet.name}`, callback_data: `bot:pet:${item.pet.id}` }]), [{ text: '← Главное меню', callback_data: 'bot:menu' }]]);
}
async function showBotServices(chatId: string, telegramUserId: string, consultation: boolean, values: BotData) {
  const services = await db.serviceVariant.findMany({ where: { organizationId: config.organizationId, service: { onlineBookable: true, kind: consultation ? 'CONSULTATION' : { not: 'CONSULTATION' } } }, include: { service: true }, orderBy: { service: { publicName: 'asc' } } });
  if (!services.length) { await say(chatId, 'Сейчас нет доступных направлений. Команда уже получила сигнал — попробуйте чуть позже.', [[{ text: '← Главное меню', callback_data: 'bot:menu' }]]); return; }
  await saveBotConversation(telegramUserId, chatId, consultation ? 'CONSULTATION_SERVICE' : 'BOOKING_SERVICE', values);
  await say(chatId, consultation ? 'Выберите формат консультации.' : 'Выберите услугу.', [...services.slice(0, 12).map((variant) => [{ text: `${variant.service.publicName} · ${variant.name}${variant.priceMinor ? ` · ${(variant.priceMinor / 100).toLocaleString('ru-RU')} ₽` : ''}`, callback_data: `bot:service:${variant.id}` }]), [{ text: '← Главное меню', callback_data: 'bot:menu' }]]);
}
async function showBotDays(chatId: string, telegramUserId: string, state: string, values: BotData) {
  await saveBotConversation(telegramUserId, chatId, state, values);
  await say(chatId, 'Выберите удобный день. Показываем только рабочие дни.', [...botDays().map((day) => [{ text: botDayLabel(day), callback_data: `bot:day:${day}` }]), [{ text: '← Главное меню', callback_data: 'bot:menu' }]]);
}
async function createBotBooking(telegramUserId: string, chatId: string, values: BotData) {
  const account = await botAccount(telegramUserId); if (!account) throw new Error('ACCOUNT_LINK_REQUIRED');
  const [relation, variant, location, hold] = await Promise.all([
    db.ownerPetRelation.findFirst({ where: { organizationId: config.organizationId, ownerId: account.owner.id, petId: values.petId }, include: { pet: true } }),
    db.serviceVariant.findFirst({ where: { id: values.variantId, organizationId: config.organizationId, service: { onlineBookable: true, kind: { not: 'CONSULTATION' } } }, include: { service: true } }),
    db.location.findFirst({ where: { id: values.locationId, organizationId: config.organizationId, active: true } }),
    values.holdId ? db.bookingHold.findFirst({ where: { id: values.holdId, organizationId: config.organizationId, ownerId: account.owner.id, state: 'ACTIVE', expiresAt: { gt: new Date() } } }) : Promise.resolve(null)
  ]);
  const startsAt = new Date(values.startsAt); if (!relation || !variant || !location || Number.isNaN(startsAt.valueOf()) || startsAt <= new Date()) throw new Error('BOOKING_DATA_CHANGED');
  if (!hold || hold.petId !== relation.petId || hold.variantId !== variant.id || hold.locationId !== location.id || hold.startsAt.valueOf() !== startsAt.valueOf()) throw new Error('BOOKING_HOLD_EXPIRED');
  const endsAt = new Date(startsAt.valueOf() + variant.durationMinutes * 60_000); const commandKey = `telegram-booking:${telegramUserId}:${Date.now()}`;
  const result = await db.$transaction(async (tx) => {
    const consumed = await tx.bookingHold.updateMany({ where: { id: hold.id, organizationId: config.organizationId, state: 'ACTIVE', expiresAt: { gt: new Date() } }, data: { state: 'CONSUMED', consumedAt: new Date() } }); if (consumed.count !== 1) throw new Error('BOOKING_HOLD_EXPIRED');
    const appointment = await tx.appointment.create({ data: { organizationId: config.organizationId, locationId: location.id, ownerId: account.owner.id, petId: relation.petId, variantId: variant.id, staffId: 'UNASSIGNED', startsAt, endsAt, state: 'REQUESTED' } });
    const invoice = await tx.invoice.create({ data: { organizationId: config.organizationId, ownerId: account.owner.id, appointmentId: appointment.id, state: variant.priceMinor > 0 ? 'ISSUED' : 'PAID', totalMinor: Math.max(0, variant.priceMinor), paidMinor: 0, currency: variant.currency, issuedAt: new Date(), lines: { create: { organizationId: config.organizationId, lineType: 'SERVICE', referenceId: variant.id, description: `${variant.service.publicName} · ${variant.name}`, unitPriceMinor: Math.max(0, variant.priceMinor), totalMinor: Math.max(0, variant.priceMinor) } } } });
    const kind = variant.service.kind === 'GROOMING' ? 'GROOMING_CONSENT' : 'PROCEDURE_CONSENT'; const template = await tx.printTemplate.findFirst({ where: { organizationId: config.organizationId, kind, state: 'PUBLISHED' }, orderBy: { version: 'desc' } });
    if (template) { const renderedBody = renderDocumentBody(template.body, { owner: account.owner.fullName, pet: relation.pet.name, service: variant.service.publicName, amount: `${(variant.priceMinor / 100).toLocaleString('ru-RU')} ₽` }); await tx.generatedDocument.create({ data: { organizationId: config.organizationId, templateId: template.id, ownerId: account.owner.id, petId: relation.petId, appointmentId: appointment.id, invoiceId: invoice.id, kind: template.kind, title: template.title ?? 'Согласие VetSvet', documentVersion: `${template.kind}:v${template.version}`, renderedBody, contentHash: digest(renderedBody), createdBy: account.user.id } }); }
    return { appointment, invoice, pet: relation.pet, variant };
  });
  await ensureBookingReminders(result.appointment.id, result.appointment.ownerId, result.appointment.startsAt);
  await auditCommand({ actorId: account.user.id, action: 'appointment.requested_via_telegram', aggregateType: 'Appointment', aggregateId: result.appointment.id, idempotencyKey: commandKey, payload: { petId: result.pet.id, variantId: result.variant.id } });
  await db.telegramConversation.update({ where: { organizationId_telegramUserId: { organizationId: config.organizationId, telegramUserId } }, data: { state: 'DONE', data: {}, expiresAt: new Date() } });
  return result;
}
async function createBotConsultation(telegramUserId: string, chatId: string, values: BotData, question: string) {
  const account = await botAccount(telegramUserId); if (!account) throw new Error('ACCOUNT_LINK_REQUIRED');
  const [relation, variant, location] = await Promise.all([
    db.ownerPetRelation.findFirst({ where: { organizationId: config.organizationId, ownerId: account.owner.id, petId: values.petId }, include: { pet: true } }),
    db.serviceVariant.findFirst({ where: { id: values.variantId, organizationId: config.organizationId, service: { onlineBookable: true, kind: 'CONSULTATION' } }, include: { service: true } }),
    db.location.findFirst({ where: { id: values.locationId, organizationId: config.organizationId, active: true } })
  ]);
  const startsAt = new Date(values.startsAt); if (!relation || !variant || !location || question.length < 10 || Number.isNaN(startsAt.valueOf())) throw new Error('CONSULTATION_DATA_CHANGED');
  const duplicate = await db.consultation.findFirst({ where: { organizationId: config.organizationId, ownerId: account.owner.id, petId: relation.petId, state: { in: ['WAITING_PAYMENT', 'PAYMENT_LINKED', 'PAYMENT_REVIEW', 'READY_FOR_SCHEDULING', 'CONFIRMED'] } } }); if (duplicate) throw new Error('CONSULTATION_ALREADY_ACTIVE');
  const slots = await availableBotSlots(location.id, variant.id, values.day); if (!slots.some((slot) => slot.valueOf() === startsAt.valueOf())) throw new Error('SLOT_TAKEN');
  const secret = randomBytes(20).toString('base64url'); const paid = variant.priceMinor <= 0; const endsAt = new Date(startsAt.valueOf() + variant.durationMinutes * 60_000); const commandKey = `telegram-consultation:${telegramUserId}:${Date.now()}`;
  const result = await db.$transaction(async (tx) => {
    const appointment = await tx.appointment.create({ data: { organizationId: config.organizationId, locationId: location.id, ownerId: account.owner.id, petId: relation.petId, variantId: variant.id, staffId: 'UNASSIGNED', startsAt, endsAt, state: 'REQUESTED' } });
    const invoice = await tx.invoice.create({ data: { organizationId: config.organizationId, ownerId: account.owner.id, appointmentId: appointment.id, state: paid ? 'PAID' : 'ISSUED', totalMinor: Math.max(0, variant.priceMinor), paidMinor: 0, currency: variant.currency, issuedAt: new Date(), lines: { create: { organizationId: config.organizationId, lineType: 'CONSULTATION', referenceId: variant.id, description: `${variant.service.publicName} · ${variant.name}`, unitPriceMinor: Math.max(0, variant.priceMinor), totalMinor: Math.max(0, variant.priceMinor) } } } });
    const consultation = await tx.consultation.create({ data: { organizationId: config.organizationId, ownerId: account.owner.id, petId: relation.petId, appointmentId: appointment.id, question, paymentTokenHash: digest(secret), paymentTokenExpiresAt: new Date(Date.now() + 48 * 60 * 60_000), telegramUserId, telegramChatId: chatId, state: paid ? 'READY_FOR_SCHEDULING' : 'PAYMENT_LINKED', paymentState: paid ? 'CONFIRMED' : 'AWAITING_PROOF' } });
    const template = await tx.printTemplate.findFirst({ where: { organizationId: config.organizationId, kind: 'REMOTE_CONSULTATION_CONSENT', state: 'PUBLISHED' }, orderBy: { version: 'desc' } });
    if (template) {
      const renderedBody = renderDocumentBody(template.body, { owner: account.owner.fullName, pet: relation.pet.name, service: variant.service.publicName, amount: `${(variant.priceMinor / 100).toLocaleString('ru-RU')} ₽` });
      await tx.generatedDocument.create({ data: { organizationId: config.organizationId, templateId: template.id, ownerId: account.owner.id, petId: relation.petId, appointmentId: appointment.id, invoiceId: invoice.id, kind: template.kind, title: template.title ?? 'Условия консультации', documentVersion: `${template.kind}:v${template.version}`, renderedBody, contentHash: digest(renderedBody), createdBy: account.user.id } });
    }
    return { appointment, invoice, consultation, pet: relation.pet, variant };
  });
  await ensureBookingReminders(result.appointment.id, result.appointment.ownerId, result.appointment.startsAt);
  await auditCommand({ actorId: account.user.id, action: 'consultation.requested_via_telegram', aggregateType: 'Consultation', aggregateId: result.consultation.id, idempotencyKey: commandKey, payload: { appointmentId: result.appointment.id, petId: result.pet.id } });
  await db.telegramConversation.update({ where: { organizationId_telegramUserId: { organizationId: config.organizationId, telegramUserId } }, data: { state: 'DONE', data: {}, expiresAt: new Date() } });
  return result;
}

async function confirmTelegramLogin(recordId: string, secret: string, telegramUserId: string, chatId: string, fullName: string) {
  const record = await db.telegramLoginRequest.findUnique({ where: { id: recordId } });
  if (!record || record.state !== 'PENDING' || record.expiresAt <= new Date() || !sameSecret(record.tokenHash, digest(secret))) return false;
  if (record.targetUserId) {
    const [target, occupied] = await Promise.all([db.userIdentity.findUnique({ where: { id: record.targetUserId } }), db.userIdentity.findUnique({ where: { telegramUserId } })]);
    if (!target || (occupied && occupied.id !== target.id)) { await db.telegramLoginRequest.update({ where: { id: record.id }, data: { state: 'REJECTED' } }); return false; }
    await db.$transaction([
      db.userIdentity.update({ where: { id: target.id }, data: { telegramUserId } }),
      db.owner.updateMany({ where: { organizationId: config.organizationId, userId: target.id }, data: { telegramUserId } }),
      db.telegramLoginRequest.update({ where: { id: record.id }, data: { state: 'CONFIRMED', telegramUserId, chatId, confirmedAt: new Date() } })
    ]);
    return true;
  }
  if (record.mode === 'STAFF') {
    const user = await db.userIdentity.upsert({ where: { telegramUserId }, update: {}, create: { telegramUserId } });
    const invite = record.staffInviteId ? await db.staffInvite.findUnique({ where: { id: record.staffInviteId } }) : undefined;
    if (record.staffInviteId) {
      if (!invite || invite.state !== 'PENDING' || invite.expiresAt <= new Date()) return false;
      await db.$transaction([
        db.staffInvite.update({ where: { id: invite.id }, data: { state: 'ACCEPTED', acceptedAt: new Date(), acceptedByUserId: user.id } }),
        db.staffMembership.upsert({ where: { organizationId_userId: { organizationId: config.organizationId, userId: user.id } }, update: { role: invite.role, state: 'ACTIVE' }, create: { organizationId: config.organizationId, userId: user.id, role: invite.role, state: 'ACTIVE' } }),
        db.staffProfile.upsert({ where: { organizationId_userId: { organizationId: config.organizationId, userId: user.id } }, update: { employmentState: 'ACTIVE' }, create: { organizationId: config.organizationId, userId: user.id, employmentState: 'ACTIVE', specialties: [], locationIds: [] } }),
        db.telegramLoginRequest.update({ where: { id: record.id }, data: { state: 'CONFIRMED', telegramUserId, chatId, confirmedAt: new Date() } })
      ]);
    } else {
      const membership = await db.staffMembership.findUnique({ where: { organizationId_userId: { organizationId: config.organizationId, userId: user.id } } });
      if (!membership || membership.state !== 'ACTIVE') { await db.telegramLoginRequest.update({ where: { id: record.id }, data: { state: 'REJECTED' } }); return false; }
      await db.telegramLoginRequest.update({ where: { id: record.id }, data: { state: 'CONFIRMED', telegramUserId, chatId, confirmedAt: new Date() } });
    }
  } else {
    const user = await db.userIdentity.findUnique({ where: { telegramUserId } });
    const owner = user ? await db.owner.findFirst({ where: { organizationId: config.organizationId, OR: [{ userId: user.id }, { telegramUserId }] } }) : null;
    if (!user || !owner) { await db.telegramLoginRequest.update({ where: { id: record.id }, data: { state: 'REJECTED' } }); return false; }
    await db.telegramLoginRequest.update({ where: { id: record.id }, data: { state: 'CONFIRMED', telegramUserId, chatId, confirmedAt: new Date() } });
  }
  return true;
}

async function handleBotCallback(callback: NonNullable<TgUpdate['callback_query']>) {
  if (!callback.message?.chat || !callback.data) return;
  const chatId = String(callback.message.chat.id); const telegramUserId = String(callback.from.id); const command = callback.data;
  if (!callback.id.startsWith('command-')) await telegram('answerCallbackQuery', { callback_query_id: callback.id });
  if (command === 'bot:menu' || command === 'bot:cancel') { await saveBotConversation(telegramUserId, chatId, 'MENU'); await showBotMenu(chatId, telegramUserId); return; }
  if (command === 'bot:emergency') { await say(chatId, 'Если питомцу плохо прямо сейчас, не ждите ответа в боте: позвоните в клинику или обратитесь в ближайшую круглосуточную ветеринарную помощь.', [[{ text: '← Главное меню', callback_data: 'bot:menu' }]]); return; }
  if (command === 'bot:payment') { await say(chatId, `Оплата консультации проходит по СБП на ${config.sbpPhone}. После перевода отправьте сюда скриншот чека — администратор проверит его вручную. Никому не сообщайте коды из SMS.`, [[{ text: '← Главное меню', callback_data: 'bot:menu' }]]); return; }
  const account = await botAccount(telegramUserId);
  if (!account) { await say(chatId, 'Telegram пока не привязан к аккаунту. Сначала войдите по логину и паролю, затем нажмите «Подключить Telegram» в личном кабинете.', [[{ text: 'Открыть вход', url: `${config.publicUrl}/auth/` }], [{ text: '← Главное меню', callback_data: 'bot:menu' }]]); return; }
  if (command === 'bot:booking') { await showBotPets(chatId, telegramUserId, 'BOOKING'); return; }
  if (command === 'bot:consultation') { await showBotPets(chatId, telegramUserId, 'CONSULTATION'); return; }
  if (command === 'bot:pets') { await showBotPets(chatId, telegramUserId, 'PROFILE'); return; }
  if (command === 'bot:addpet') { await saveBotConversation(telegramUserId, chatId, 'PET_NAME'); await say(chatId, 'Напишите имя питомца одним сообщением.', [[{ text: 'Отмена', callback_data: 'bot:menu' }]]); return; }
  if (command === 'bot:appointments') {
    const appointments = await db.appointment.findMany({ where: { organizationId: config.organizationId, ownerId: account.owner.id, state: { not: 'CANCELLED' } }, orderBy: { startsAt: 'desc' }, take: 10 });
    const [pets, variants, invoices] = await Promise.all([db.pet.findMany({ where: { id: { in: appointments.map((item) => item.petId) } } }), db.serviceVariant.findMany({ where: { id: { in: appointments.map((item) => item.variantId) } }, include: { service: true } }), db.invoice.findMany({ where: { appointmentId: { in: appointments.map((item) => item.id) } } })]);
    const petById = new Map(pets.map((pet) => [pet.id, pet])); const variantById = new Map(variants.map((variant) => [variant.id, variant])); const invoiceByAppointment = new Map(invoices.filter((invoice) => invoice.appointmentId).map((invoice) => [invoice.appointmentId!, invoice]));
    const manageable = appointments.filter((item) => canCancelBooking(item.state, item.startsAt)).slice(0, 4);
    await say(chatId, appointments.length ? `Последние записи:\n\n${appointments.map((item) => { const invoice = invoiceByAppointment.get(item.id); const payment = invoice?.totalMinor ? ` · оплата ${invoice.state === 'PAID' ? 'подтверждена' : 'ожидается'}` : ''; return `• ${petById.get(item.petId)?.name ?? 'Питомец'} · ${variantById.get(item.variantId)?.service.publicName ?? 'Услуга'}\n  ${item.startsAt.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' })} · ${item.state}${payment}`; }).join('\n')}` : 'Записей пока нет.', [...manageable.map((item) => [{ text: `Отменить · ${petById.get(item.petId)?.name ?? 'визит'} · ${item.startsAt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Moscow' })}`, callback_data: `bot:cancel:${item.id}` }]), [{ text: 'Перенести в кабинете', url: `${config.publicUrl}/client/` }], [{ text: '🗓 Новая запись', callback_data: 'bot:booking' }], [{ text: '← Главное меню', callback_data: 'bot:menu' }]]); return;
  }
  const cancelMatch = command.match(/^bot:cancel:([0-9a-f-]{36})$/i);
  if (cancelMatch) {
    const appointment = await db.appointment.findFirst({ where: { id: cancelMatch[1], organizationId: config.organizationId, ownerId: account.owner.id } });
    if (!appointment || !canCancelBooking(appointment.state, appointment.startsAt)) { await say(chatId, 'Эту запись уже нельзя отменить в боте. Команда видит её актуальный статус.'); return; }
    await db.appointment.update({ where: { id: appointment.id }, data: { state: 'CANCELLED', cancelledAt: new Date(), cancellationReason: 'Отменено владельцем в Telegram' } }); await cancelBookingReminders(appointment.id); await offerReleasedSlot(appointment);
    await auditCommand({ actorId: account.user.id, action: 'appointment.cancelled_via_telegram', aggregateType: 'Appointment', aggregateId: appointment.id, idempotencyKey: `telegram-cancel:${appointment.id}:${Date.now()}` }); await say(chatId, 'Запись отменена. Освободившееся окно уже предложено листу ожидания.', [[{ text: 'Мои записи', callback_data: 'bot:appointments' }], [{ text: 'Новая запись', callback_data: 'bot:booking' }]]); return;
  }
  const conversation = await botConversation(telegramUserId);
  if (!conversation) { await say(chatId, 'Выбор времени истёк. Начнём заново.', [[{ text: 'Главное меню', callback_data: 'bot:menu' }]]); return; }
  const petMatch = command.match(/^bot:pet:([0-9a-f-]{36})$/i);
  if (petMatch && ['BOOKING_PET', 'CONSULTATION_PET'].includes(conversation.state)) {
    const relation = await db.ownerPetRelation.findFirst({ where: { organizationId: config.organizationId, ownerId: account.owner.id, petId: petMatch[1] } }); if (!relation) return;
    await showBotServices(chatId, telegramUserId, conversation.state === 'CONSULTATION_PET', { ...conversation.values, petId: relation.petId }); return;
  }
  const serviceMatch = command.match(/^bot:service:([0-9a-f-]{36})$/i);
  if (serviceMatch && ['BOOKING_SERVICE', 'CONSULTATION_SERVICE'].includes(conversation.state)) {
    const location = await db.location.findFirst({ where: { organizationId: config.organizationId, active: true }, orderBy: { name: 'asc' } });
    if (!location) { await say(chatId, 'Пока нет доступной площадки для записи. Свяжитесь с командой VetSvet.'); return; }
    const consultation = conversation.state === 'CONSULTATION_SERVICE'; await showBotDays(chatId, telegramUserId, consultation ? 'CONSULTATION_DAY' : 'BOOKING_DAY', { ...conversation.values, variantId: serviceMatch[1], locationId: location.id }); return;
  }
  const dayMatch = command.match(/^bot:day:(\d{4}-\d{2}-\d{2})$/);
  if (dayMatch && ['BOOKING_DAY', 'CONSULTATION_DAY'].includes(conversation.state)) {
    const slots = await availableBotSlots(conversation.values.locationId, conversation.values.variantId, dayMatch[1]);
    if (!slots.length) { await saveBotConversation(telegramUserId, chatId, conversation.state, { ...conversation.values, day: dayMatch[1] }); await say(chatId, 'На этот день свободных окон уже нет. Можем поставить вас в лист ожидания и первыми предложить освободившееся время.', [[{ text: '🔔 Встать в лист ожидания', callback_data: 'bot:waitlist' }], ...botDays().map((day) => [{ text: botDayLabel(day), callback_data: `bot:day:${day}` }]), [{ text: '← Главное меню', callback_data: 'bot:menu' }]]); return; }
    const state = conversation.state === 'CONSULTATION_DAY' ? 'CONSULTATION_SLOT' : 'BOOKING_SLOT'; await saveBotConversation(telegramUserId, chatId, state, { ...conversation.values, day: dayMatch[1] });
    await say(chatId, `Свободные окна на ${botDayLabel(dayMatch[1])}:`, [...slots.map((slot) => [{ text: slot.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }), callback_data: `bot:slot:${slot.valueOf()}` }]), [{ text: '← Выбрать другой день', callback_data: conversation.state === 'CONSULTATION_DAY' ? 'bot:consultation' : 'bot:booking' }]]); return;
  }
  const slotMatch = command.match(/^bot:slot:(\d{13})$/);
  if (slotMatch && ['BOOKING_SLOT', 'CONSULTATION_SLOT'].includes(conversation.state)) {
    const startsAt = new Date(Number(slotMatch[1])); const slots = await availableBotSlots(conversation.values.locationId, conversation.values.variantId, conversation.values.day);
    if (!slots.some((slot) => slot.valueOf() === startsAt.valueOf())) { await say(chatId, 'Это окно только что заняли. Пожалуйста, выберите другое.', [[{ text: 'Выбрать заново', callback_data: conversation.state === 'CONSULTATION_SLOT' ? 'bot:consultation' : 'bot:booking' }]]); return; }
    let holdId = '';
    if (conversation.state === 'BOOKING_SLOT') {
      const variant = await db.serviceVariant.findFirst({ where: { id: conversation.values.variantId, organizationId: config.organizationId } });
      if (!variant) { await say(chatId, 'Услуга изменилась. Начните выбор заново.'); return; }
      const expiresAt = bookingHoldExpiresAt(); const endsAt = new Date(startsAt.valueOf() + variant.durationMinutes * 60_000);
      const hold = await db.$transaction(async (tx) => { await tx.bookingHold.updateMany({ where: { organizationId: config.organizationId, ownerId: account.owner.id, state: 'ACTIVE' }, data: { state: 'RELEASED', releasedAt: new Date() } }); return tx.bookingHold.create({ data: { organizationId: config.organizationId, ownerId: account.owner.id, petId: conversation.values.petId, variantId: conversation.values.variantId, locationId: conversation.values.locationId, startsAt, endsAt, expiresAt, idempotencyKey: `telegram-hold:${telegramUserId}:${startsAt.valueOf()}:${Date.now()}` } }); });
      holdId = hold.id;
    }
    const values: BotData = { ...conversation.values, startsAt: startsAt.toISOString(), ...(holdId ? { holdId } : {}) };
    if (conversation.state === 'CONSULTATION_SLOT') {
      if (values.initialQuestion?.length >= 10) {
        try { const result = await createBotConsultation(telegramUserId, chatId, values, values.initialQuestion); const admins = await adminChats(); await Promise.all(admins.map((admin) => say(admin.chatId, `Новая консультация из бота: ${result.pet.name}\n${values.initialQuestion.slice(0, 500)}`))); await say(chatId, `Консультация для ${result.pet.name} создана на ${startsAt.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' })}.\n\n${result.invoice.totalMinor > 0 ? `К оплате ${(result.invoice.totalMinor / 100).toLocaleString('ru-RU')} ₽ по СБП ${config.sbpPhone}. После перевода пришлите сюда скриншот.` : 'Оплата не требуется.'}`, [[{ text: 'Главное меню', callback_data: 'bot:menu' }]]); } catch (error) { await say(chatId, `Не удалось создать консультацию: ${(error as Error).message}. Начните заново.`, [[{ text: 'Начать заново', callback_data: 'bot:consultation' }]]); } return;
      }
      await saveBotConversation(telegramUserId, chatId, 'CONSULTATION_QUESTION', values); await say(chatId, 'Опишите одним сообщением, что беспокоит: когда началось, какие симптомы и что уже пробовали. Не отправляйте экстренные случаи — при ухудшении сразу обращайтесь за неотложной помощью.', [[{ text: 'Отмена', callback_data: 'bot:menu' }]]); return;
    }
    await saveBotConversation(telegramUserId, chatId, 'BOOKING_CONFIRM', values);
    const [pet, variant] = await Promise.all([db.pet.findUnique({ where: { id: values.petId } }), db.serviceVariant.findUnique({ where: { id: values.variantId }, include: { service: true } })]);
    await say(chatId, `Проверьте запись:\n\n${pet?.name ?? 'Питомец'} · ${variant?.service.publicName ?? 'Услуга'}\n${startsAt.toLocaleString('ru-RU', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Moscow' })}\n${variant?.priceMinor ? `${(variant.priceMinor / 100).toLocaleString('ru-RU')} ₽` : 'Стоимость уточнит команда'}\n\nОкно удерживается за вами 7 минут.`, [[{ text: '✓ Подтвердить запись', callback_data: 'bot:confirm' }], [{ text: 'Отмена', callback_data: 'bot:menu' }]]); return;
  }
  if (command === 'bot:waitlist' && conversation.state === 'BOOKING_DAY' && conversation.values.day) {
    const preferredDate = new Date(`${conversation.values.day}T12:00:00+03:00`);
    const key = `telegram-waitlist:${telegramUserId}:${conversation.values.petId}:${conversation.values.variantId}:${conversation.values.day}`;
    const entry = await db.bookingWaitlistEntry.upsert({ where: { organizationId_idempotencyKey: { organizationId: config.organizationId, idempotencyKey: key } }, update: { state: 'ACTIVE', cancelledAt: null }, create: { organizationId: config.organizationId, ownerId: account.owner.id, petId: conversation.values.petId, variantId: conversation.values.variantId, locationId: conversation.values.locationId, preferredDate, period: 'ANY', idempotencyKey: key } });
    await saveBotConversation(telegramUserId, chatId, 'MENU'); await say(chatId, 'Готово. Вы в листе ожидания — если окно освободится, бот сразу напишет и будет держать его 30 минут.', [[{ text: 'Выбрать другой день', callback_data: 'bot:booking' }], [{ text: 'Главное меню', callback_data: 'bot:menu' }]]); return;
  }
  const speciesMatch = command.match(/^bot:species:(DOG|CAT|OTHER)$/);
  if (speciesMatch && conversation.state === 'PET_SPECIES') {
    const pet = await db.$transaction(async (tx) => { const created = await tx.pet.create({ data: { organizationId: config.organizationId, name: conversation.values.petName, species: speciesMatch[1], medicalAlerts: [] } }); await tx.ownerPetRelation.create({ data: { organizationId: config.organizationId, ownerId: account.owner.id, petId: created.id, relation: 'OWNER', primary: true } }); return created; });
    await saveBotConversation(telegramUserId, chatId, 'MENU'); await say(chatId, `${pet.name} добавлен в семью VetSvet.`, [[{ text: '🗓 Записать питомца', callback_data: 'bot:booking' }], [{ text: 'Главное меню', callback_data: 'bot:menu' }]]); return;
  }
  if (command === 'bot:confirm' && conversation.state === 'BOOKING_CONFIRM') {
    try { const result = await createBotBooking(telegramUserId, chatId, conversation.values); const admins = await adminChats(); await Promise.all(admins.map((admin) => say(admin.chatId, `Новая запись из бота: ${result.pet.name} · ${result.variant.service.publicName} · ${result.appointment.startsAt.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' })}`))); const payment = result.invoice.totalMinor > 0 ? `\nК оплате ${(result.invoice.totalMinor / 100).toLocaleString('ru-RU')} ₽ по СБП ${config.sbpPhone}. После перевода пришлите сюда скриншот.` : ''; await say(chatId, `Готово — заявка на запись создана.\n\n${result.pet.name} · ${result.variant.service.publicName}\n${result.appointment.startsAt.toLocaleString('ru-RU', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Moscow' })}\nСтатус: ожидает подтверждения команды.${payment}`, [[{ text: 'Мои записи', callback_data: 'bot:appointments' }], [{ text: 'Главное меню', callback_data: 'bot:menu' }]]); } catch (error) { await say(chatId, (error as Error).message === 'SLOT_TAKEN' ? 'Это окно уже заняли. Выберите другое время.' : 'Не удалось создать запись. Данные изменились — начните выбор заново.', [[{ text: 'Выбрать время', callback_data: 'bot:booking' }]]); } return;
  }
  await say(chatId, 'Этот шаг уже неактуален. Откройте главное меню и начните заново.', [[{ text: 'Главное меню', callback_data: 'bot:menu' }]]);
}

async function handleUpdate(update: TgUpdate) {
  const message = update.message;
  const callback = update.callback_query;
  if (callback?.message?.chat && callback.data) {
    const match = callback.data.match(/^payment:(approve|reject):([0-9a-f-]{36})$/i);
    if (!match) { if (callback.data.startsWith('bot:')) await handleBotCallback(callback); return; }
    const admin = await adminFor(String(callback.message.chat.id), String(callback.from.id));
    if (!admin) { await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: 'Нет прав администратора.', show_alert: true }); return; }
    const proof = await db.telegramPaymentProof.findUnique({ where: { id: match[2] }, include: { consultation: true } });
    if (!proof || proof.state !== 'PENDING_REVIEW') { await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: 'Чек уже обработан.' }); return; }
    const approved = match[1] === 'approve';
    const paymentAppointmentId = proof.consultation?.appointmentId ?? proof.appointmentId;
    const paymentInvoice = paymentAppointmentId ? await db.invoice.findUnique({ where: { appointmentId: paymentAppointmentId } }) : undefined;
    await db.$transaction(async (tx) => {
      await tx.telegramPaymentProof.update({ where: { id: proof.id }, data: { state: approved ? 'CONFIRMED' : 'REJECTED', reviewedAt: new Date(), reviewedByChatId: admin.chatId } });
      if (proof.requestId) await tx.telegramRequest.update({ where: { id: proof.requestId }, data: { state: approved ? 'READY' : 'WAITING_PAYMENT' } });
      if (proof.consultationId) await tx.consultation.update({ where: { id: proof.consultationId }, data: { paymentState: approved ? 'CONFIRMED' : 'AWAITING_PROOF', state: approved ? 'READY_FOR_SCHEDULING' : 'WAITING_PAYMENT' } });
      if (paymentInvoice) {
        const paidAt = new Date();
        let confirmedPayment: { id: string; amountMinor: number } | undefined;
        if (approved && paymentInvoice.totalMinor > 0) {
          const payment = await tx.payment.create({ data: { organizationId: config.organizationId, invoiceId: paymentInvoice.id, provider: 'TELEGRAM_PROOF', providerTransactionId: proof.id, amountMinor: paymentInvoice.totalMinor, currency: paymentInvoice.currency, state: 'CONFIRMED', method: 'SBP_MANUAL_REVIEW', confirmedAt: paidAt } });
          confirmedPayment = payment;
          await tx.fiscalReceipt.create({ data: { organizationId: config.organizationId, invoiceId: paymentInvoice.id, paymentId: payment.id, state: 'PENDING_PROVIDER', idempotencyKey: `telegram-proof:${proof.id}` } });
        }
        const updatedInvoice = await tx.invoice.update({ where: { id: paymentInvoice.id }, data: { state: approved ? 'PAID' : 'PENDING_PAYMENT_REVIEW', ...(approved ? { paidMinor: paymentInvoice.totalMinor } : {}) } });
        if (confirmedPayment) await settleGrowthBenefits(tx, updatedInvoice, confirmedPayment, paidAt);
      }
    });
    await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: approved ? 'Оплата подтверждена.' : 'Оплата отклонена.' });
    await say(proof.chatId, approved ? 'Оплата подтверждена. Запись и счёт обновлены — статус всегда доступен в разделе «Мои записи».' : 'Чек пока не удалось подтвердить. Проверьте перевод и отправьте новый скриншот.');
    return;
  }
  if (!message?.from) return;
  const telegramUserId = String(message.from.id);
  const chatId = String(message.chat.id);
  const text = message.text?.trim() ?? '';
  const fullName = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ') || 'Владелец питомца';
  const consultationLink = text.match(/^\/start\s+c_([0-9a-f-]{36})_([A-Za-z0-9_-]{16,})$/i);
  if (consultationLink) {
    const consultation = await db.consultation.findFirst({ where: { id: consultationLink[1], organizationId: config.organizationId } });
    if (!consultation || consultation.paymentTokenExpiresAt <= new Date() || !sameSecret(consultation.paymentTokenHash, digest(consultationLink[2])) || !['WAITING_PAYMENT', 'PAYMENT_LINKED'].includes(consultation.state)) {
      await say(chatId, 'Ссылка на оплату недействительна или уже обработана. Вернитесь в кабинет и создайте новую консультацию.');
      return;
    }
    const owner = await db.owner.findFirst({ where: { id: consultation.ownerId, organizationId: config.organizationId } });
    const telegramIdentity = await db.userIdentity.findUnique({ where: { telegramUserId } });
    if (!owner || (telegramIdentity && owner.userId && telegramIdentity.id !== owner.userId)) {
      await say(chatId, 'Этот Telegram уже связан с другим профилем VetSvet. Откройте ссылку из нужного личного кабинета.');
      return;
    }
    const linkedUser = owner.userId
      ? await db.userIdentity.update({ where: { id: owner.userId }, data: { telegramUserId } })
      : await db.userIdentity.upsert({ where: { telegramUserId }, update: {}, create: { telegramUserId } });
    await db.$transaction([
      db.owner.update({ where: { id: owner.id }, data: { userId: linkedUser.id, telegramUserId, fullName: owner.fullName || fullName } }),
      db.consultation.update({ where: { id: consultation.id }, data: { telegramUserId, telegramChatId: chatId, state: 'PAYMENT_LINKED' } })
    ]);
    await say(chatId, `Консультация связана с вашим кабинетом. Переведите согласованную с клиникой сумму по СБП на ${config.sbpPhone}, затем пришлите сюда скриншот чека. Его проверит администратор.`);
    return;
  }
  const login = text.match(/^\/start\s+(?:l|login)_([0-9a-f-]{36})_([A-Za-z0-9_-]{16,})$/i);
  if (login) {
    const confirmed = await confirmTelegramLogin(login[1], login[2], telegramUserId, chatId, fullName);
    await say(chatId, confirmed ? 'Готово. Telegram подключён. Вернитесь на сайт — профиль откроется автоматически.' : 'Не удалось подключить Telegram. Если аккаунта ещё нет, сначала зарегистрируйтесь по логину и паролю, затем подключите Telegram из личного кабинета.');
    if (confirmed) await showBotMenu(chatId, telegramUserId);
    return;
  }
  const claim = text.match(/^\/admin\s+(.+)$/);
  if (claim) {
    const enrollment = await db.adminEnrollment.findUnique({ where: { tokenHash: digest(claim[1]) } });
    if (!enrollment || enrollment.state !== 'PENDING' || enrollment.expiresAt <= new Date()) { await say(chatId, 'Этот код администратора недействителен, уже использован или истёк.'); return; }
    const user = await db.userIdentity.upsert({ where: { telegramUserId }, update: {}, create: { telegramUserId } });
    await db.$transaction([
      db.adminEnrollment.update({ where: { id: enrollment.id }, data: { state: 'CONSUMED', consumedAt: new Date(), telegramUserId } }),
      db.telegramAdminChat.upsert({ where: { singletonKey: `admin:${telegramUserId}` }, update: { chatId, telegramUserId }, create: { singletonKey: `admin:${telegramUserId}`, chatId, telegramUserId } }),
      db.staffMembership.upsert({ where: { organizationId_userId: { organizationId: config.organizationId, userId: user.id } }, update: { role: 'ADMIN', state: 'ACTIVE' }, create: { organizationId: config.organizationId, userId: user.id, role: 'ADMIN', state: 'ACTIVE' } }),
      db.staffProfile.upsert({ where: { organizationId_userId: { organizationId: config.organizationId, userId: user.id } }, update: { employmentState: 'ACTIVE' }, create: { organizationId: config.organizationId, userId: user.id, employmentState: 'ACTIVE', specialties: [], locationIds: [] } })
    ]);
    const secret = randomBytes(16).toString('base64url');
    const invite = await db.staffInvite.create({ data: { organizationId: config.organizationId, tokenHash: digest(secret), fullName, role: 'ADMIN', expiresAt: new Date(Date.now() + 7 * 86400000) } });
    await say(chatId, `Вы подключены как администратор VetSvet. Ваш доступ не заменит другого администратора: заявки, чеки и приглашения будут приходить каждому из вас.\n\nЛичная ссылка в рабочее пространство (действует 7 дней):\n${config.publicUrl}/auth/?mode=staff&invite=${invite.id}.${secret}`);
    return;
  }
  const inviteCommand = text.match(/^\/invite\s+(ADMIN|MANAGER|VETERINARIAN|GROOMER|ASSISTANT|RECEPTIONIST)(?:\s+(.+))?$/i);
  if (inviteCommand) {
    if (!await adminFor(chatId, telegramUserId)) { await say(chatId, 'Приглашения может создавать только подключённый администратор VetSvet.'); return; }
    const role = inviteCommand[1].toUpperCase();
    if (!staffRoles.has(role)) { await say(chatId, 'Неизвестная роль сотрудника.'); return; }
    const secret = randomBytes(16).toString('base64url');
    const invite = await db.staffInvite.create({ data: { organizationId: config.organizationId, tokenHash: digest(secret), fullName: inviteCommand[2]?.trim() || 'Новый сотрудник', role, expiresAt: new Date(Date.now() + 7 * 86400000) } });
    await say(chatId, `Приглашение для «${invite.fullName}» (${role}) готово на 7 дней.\n\n${config.publicUrl}/auth/?mode=staff&invite=${invite.id}.${secret}\n\nПередайте эту ссылку сотруднику лично.`);
    return;
  }
  const conversation = await botConversation(telegramUserId);
  if (conversation?.state === 'PET_NAME' && text && !text.startsWith('/')) {
    const petName = text.trim();
    if (petName.length < 1 || petName.length > 80) { await say(chatId, 'Имя должно содержать от 1 до 80 символов. Попробуйте ещё раз.'); return; }
    await saveBotConversation(telegramUserId, chatId, 'PET_SPECIES', { petName });
    await say(chatId, `Кто ${petName}?`, [[{ text: '🐕 Собака', callback_data: 'bot:species:DOG' }, { text: '🐈 Кошка', callback_data: 'bot:species:CAT' }], [{ text: '🐾 Другой питомец', callback_data: 'bot:species:OTHER' }], [{ text: 'Отмена', callback_data: 'bot:menu' }]]); return;
  }
  if (conversation?.state === 'CONSULTATION_QUESTION' && text && !text.startsWith('/')) {
    if (text.length < 10 || text.length > 3000) { await say(chatId, 'Опишите вопрос подробнее — от 10 до 3000 символов.'); return; }
    try {
      const result = await createBotConsultation(telegramUserId, chatId, conversation.values, text);
      const admins = await adminChats(); await Promise.all(admins.map((admin) => say(admin.chatId, `Новая консультация из бота: ${result.pet.name}\n${text.slice(0, 500)}`)));
      await say(chatId, `Консультация для ${result.pet.name} создана на ${result.appointment.startsAt.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' })}.\n\n${result.invoice.totalMinor > 0 ? `К оплате ${(result.invoice.totalMinor / 100).toLocaleString('ru-RU')} ₽ по СБП ${config.sbpPhone}. После перевода пришлите сюда скриншот чека.` : 'Оплата не требуется.'}`, [[{ text: 'Мои записи', callback_data: 'bot:appointments' }], [{ text: 'Главное меню', callback_data: 'bot:menu' }]]);
    } catch (error) { await say(chatId, `Не удалось создать консультацию: ${(error as Error).message}.`, [[{ text: 'Начать заново', callback_data: 'bot:consultation' }]]); }
    return;
  }
  if (text === '/start' || text === '/menu') {
    await showBotMenu(chatId, telegramUserId);
    return;
  }
  if (text.startsWith('/booking')) {
    await showBotPets(chatId, telegramUserId, 'BOOKING');
    return;
  }
  if (text.startsWith('/consultation')) {
    const initialQuestion = text.slice(13).trim(); await showBotPets(chatId, telegramUserId, 'CONSULTATION', initialQuestion.length >= 10 ? { initialQuestion } : {});
    return;
  }
  if (text === '/profile' || text === '/pets') { await showBotPets(chatId, telegramUserId, 'PROFILE'); return; }
  if (text === '/appointments') { await handleBotCallback({ id: `command-${update.update_id}`, data: 'bot:appointments', from: message.from, message: { chat: message.chat } }); return; }
  if (text === '/payment') { await say(chatId, `Оплата консультации: перевод по СБП на ${config.sbpPhone}. После перевода отправьте сюда скриншот чека — его подтвердит администратор.`); return; }
  if (text === '/emergency') { await say(chatId, 'Если питомцу плохо прямо сейчас, не ждите ответа в чате: позвоните в клинику или обратитесь в ближайшую круглосуточную ветеринарную помощь.'); return; }
  if (message.photo?.length) {
    const consultation = await db.consultation.findFirst({ where: { organizationId: config.organizationId, telegramUserId, telegramChatId: chatId, state: { in: ['PAYMENT_LINKED', 'WAITING_PAYMENT'] }, paymentState: 'AWAITING_PROOF' }, orderBy: { createdAt: 'desc' } });
    const request = consultation ? undefined : await db.telegramRequest.findFirst({ where: { telegramUserId, state: 'WAITING_PAYMENT' }, orderBy: { createdAt: 'desc' } });
    const account = consultation || request ? undefined : await botAccount(telegramUserId);
    const unpaidInvoice = account ? await db.invoice.findFirst({ where: { organizationId: config.organizationId, ownerId: account.owner.id, appointmentId: { not: null }, state: { in: ['ISSUED', 'PENDING_PAYMENT_REVIEW'] }, totalMinor: { gt: 0 } }, orderBy: { createdAt: 'desc' } }) : undefined;
    if (!consultation && !request && !unpaidInvoice?.appointmentId) { await say(chatId, 'Не нашёл запись, ожидающую оплату. Откройте «Мои записи» или создайте новую запись, затем отправьте чек ещё раз.', [[{ text: 'Мои записи', callback_data: 'bot:appointments' }]]); return; }
    const proof = await db.telegramPaymentProof.create({ data: { requestId: request?.id, consultationId: consultation?.id, appointmentId: unpaidInvoice?.appointmentId, telegramUserId, chatId, sourceMessageId: message.message_id, purpose: consultation || request ? 'CONSULTATION' : 'APPOINTMENT', state: 'PENDING_REVIEW' } });
    if (consultation) await db.consultation.update({ where: { id: consultation.id }, data: { paymentState: 'PENDING_REVIEW', state: 'PAYMENT_REVIEW' } });
    if (unpaidInvoice) await db.invoice.update({ where: { id: unpaidInvoice.id }, data: { state: 'PENDING_PAYMENT_REVIEW' } });
    const admins = await adminChats();
    await Promise.all(admins.flatMap((admin) => [
      telegram('forwardMessage', { chat_id: admin.chatId, from_chat_id: chatId, message_id: message.message_id }),
      say(admin.chatId, `Чек #${proof.id.slice(0, 8)} — подтвердить перевод?`, [[{ text: '✓ Подтвердить', callback_data: `payment:approve:${proof.id}` }, { text: '✕ Отклонить', callback_data: `payment:reject:${proof.id}` }]])
    ]));
    await say(chatId, 'Чек получен и отправлен администратору на проверку.');
    return;
  }
  if (text) await say(chatId, 'Я помогу записаться, выбрать консультацию, проверить записи или добавить питомца. Откройте меню ниже.', [[{ text: 'Открыть меню', callback_data: 'bot:menu' }]]);
}

async function startTelegramLogin(request: IncomingMessage, response: ServerResponse) {
  let input: { mode?: string; invite?: string } = {};
  try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
  const mode: AuthMode = input.mode === 'STAFF' ? 'STAFF' : 'CLIENT';
  let staffInviteId: string | undefined;
  if (mode === 'STAFF') {
    const parsed = parseInvite(input.invite);
    if (input.invite) {
      const invite = parsed ? await db.staffInvite.findUnique({ where: { id: parsed.id } }) : undefined;
      if (!parsed || !invite || invite.state !== 'PENDING' || invite.expiresAt <= new Date() || !sameSecret(invite.tokenHash, digest(parsed.token))) { json(response, 403, { error: 'INVITE_REQUIRED' }); return; }
      staffInviteId = invite.id;
    }
  }
  const secret = randomBytes(16).toString('base64url');
  const expiresAt = new Date(Date.now() + 600000);
  const record = await db.telegramLoginRequest.create({ data: { tokenHash: digest(secret), mode, staffInviteId, expiresAt } });
  json(response, 201, { requestId: record.id, expiresAt, telegramUrl: `https://t.me/${config.botUsername}?start=l_${record.id}_${secret}` });
}

async function startTelegramLink(request: IncomingMessage, response: ServerResponse) {
  const current = await session(request); if (!current) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
  if (current.user.telegramUserId) { json(response, 409, { error: 'TELEGRAM_ALREADY_LINKED', message: 'Telegram уже подключён к этому аккаунту.' }); return; }
  const secret = randomBytes(16).toString('base64url'); const expiresAt = new Date(Date.now() + 600000);
  const record = await db.telegramLoginRequest.create({ data: { tokenHash: digest(secret), mode: current.mode, targetUserId: current.userId, expiresAt } });
  json(response, 201, { requestId: record.id, expiresAt, telegramUrl: `https://t.me/${config.botUsername}?start=l_${record.id}_${secret}` });
}

async function passwordRegister(request: IncomingMessage, response: ServerResponse) {
  let input: { login?: string; password?: string; fullName?: string; mode?: string; invite?: string } = {};
  try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
  const login = normalizeLogin(input.login);
  const fullName = String(input.fullName ?? '').trim();
  if (!loginPattern.test(login)) { json(response, 400, { error: 'INVALID_LOGIN', message: 'Логин: 3–32 символа, латинские буквы, цифры, точка, дефис или подчёркивание.' }); return; }
  if (!validPassword(input.password)) { json(response, 400, { error: 'WEAK_PASSWORD', message: 'Пароль должен содержать от 10 до 128 символов.' }); return; }
  if (fullName.length < 2 || fullName.length > 120) { json(response, 400, { error: 'INVALID_NAME', message: 'Укажите имя для профиля.' }); return; }
  if (await db.userIdentity.findUnique({ where: { login } })) { json(response, 409, { error: 'LOGIN_TAKEN', message: 'Этот логин уже занят.' }); return; }
  const mode: AuthMode = input.mode === 'STAFF' ? 'STAFF' : 'CLIENT';
  let invite: { id: string; role: string } | undefined;
  if (mode === 'STAFF') {
    const parsed = parseInvite(input.invite);
    const record = parsed ? await db.staffInvite.findUnique({ where: { id: parsed.id } }) : undefined;
    if (!parsed || !record || record.state !== 'PENDING' || record.expiresAt <= new Date() || !sameSecret(record.tokenHash, digest(parsed.token))) { json(response, 403, { error: 'INVITE_REQUIRED', message: 'Для регистрации сотрудника нужна действующая персональная ссылка.' }); return; }
    invite = { id: record.id, role: record.role };
  }
  const encodedPassword = await passwordHash(input.password!);
  const user = await db.$transaction(async (tx) => {
    const created = await tx.userIdentity.create({ data: { login, passwordHash: encodedPassword, passwordUpdatedAt: new Date() } });
    if (mode === 'STAFF' && invite) {
      const accepted = await tx.staffInvite.updateMany({ where: { id: invite.id, state: 'PENDING', expiresAt: { gt: new Date() } }, data: { state: 'ACCEPTED', acceptedAt: new Date(), acceptedByUserId: created.id } });
      if (accepted.count !== 1) throw new Error('INVITE_ALREADY_USED');
      await tx.staffMembership.create({ data: { organizationId: config.organizationId, userId: created.id, role: invite.role, state: 'ACTIVE' } });
      await tx.staffProfile.create({ data: { organizationId: config.organizationId, userId: created.id, employmentState: 'ACTIVE', specialties: [], locationIds: [] } });
    } else {
      await tx.owner.create({ data: { organizationId: config.organizationId, userId: created.id, fullName } });
    }
    return created;
  });
  await createPasswordSession(response, user.id, mode);
  json(response, 201, { account: { mode }, redirectTo: mode === 'STAFF' ? '/staff/' : '/client/' });
}

async function passwordLogin(request: IncomingMessage, response: ServerResponse) {
  let input: { login?: string; password?: string; mode?: string } = {};
  try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
  const login = normalizeLogin(input.login);
  const mode: AuthMode = input.mode === 'STAFF' ? 'STAFF' : 'CLIENT';
  const user = loginPattern.test(login) ? await db.userIdentity.findUnique({ where: { login } }) : undefined;
  if (!user || !validPassword(input.password) || !await passwordMatches(input.password, user.passwordHash)) { json(response, 401, { error: 'INVALID_CREDENTIALS', message: 'Неверный логин или пароль.' }); return; }
  if (mode === 'STAFF') {
    const membership = await db.staffMembership.findUnique({ where: { organizationId_userId: { organizationId: config.organizationId, userId: user.id } } });
    if (!membership || membership.state !== 'ACTIVE') { json(response, 403, { error: 'STAFF_ACCESS_REQUIRED', message: 'Этот аккаунт не подключён к команде VetSvet.' }); return; }
  } else if (!await db.owner.findFirst({ where: { organizationId: config.organizationId, userId: user.id } })) {
    json(response, 403, { error: 'CLIENT_ACCESS_REQUIRED', message: 'Этот аккаунт не является личным кабинетом владельца.' }); return;
  }
  await createPasswordSession(response, user.id, mode);
  json(response, 200, { account: { mode }, redirectTo: mode === 'STAFF' ? '/staff/' : '/client/' });
}

async function setPassword(request: IncomingMessage, response: ServerResponse) {
  const current = await session(request);
  if (!current) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
  let input: { login?: string; password?: string } = {};
  try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
  const login = normalizeLogin(input.login);
  if (!loginPattern.test(login)) { json(response, 400, { error: 'INVALID_LOGIN' }); return; }
  if (!validPassword(input.password)) { json(response, 400, { error: 'WEAK_PASSWORD' }); return; }
  const owner = await db.userIdentity.findUnique({ where: { login } });
  if (owner && owner.id !== current.userId) { json(response, 409, { error: 'LOGIN_TAKEN' }); return; }
  await db.userIdentity.update({ where: { id: current.userId }, data: { login, passwordHash: await passwordHash(input.password!), passwordUpdatedAt: new Date() } });
  json(response, 200, { ok: true, redirectTo: current.mode === 'STAFF' ? '/staff/' : '/client/' });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', config.publicUrl);
  try {
    if (request.method === 'GET' && url.pathname === '/healthz') { await db.$queryRawUnsafe('SELECT 1'); json(response, 200, { status: 'ok' }); return; }
    if (request.method === 'POST' && url.pathname === '/telegram/webhook') {
      if (request.headers['x-telegram-bot-api-secret-token'] !== config.webhookSecret) { json(response, 403, { error: 'FORBIDDEN' }); return; }
      await handleUpdate(JSON.parse(await body(request)) as TgUpdate); json(response, 200, { ok: true }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/password/register') { await passwordRegister(request, response); return; }
    if (request.method === 'POST' && url.pathname === '/api/auth/password/login') { await passwordLogin(request, response); return; }
    if (request.method === 'POST' && url.pathname === '/api/auth/password/set') { await setPassword(request, response); return; }
    if (request.method === 'POST' && url.pathname === '/api/auth/telegram/start') { await startTelegramLogin(request, response); return; }
    if (request.method === 'POST' && url.pathname === '/api/v1/auth/telegram/link/start') { await startTelegramLink(request, response); return; }
    if (await handleCareRoutes({ request, response, url, db, organizationId: config.organizationId, uploadRoot, currentStaff, body, json, idempotencyKey, audit: auditCommand })) return;
    if (await handlePetIntelligenceRoutes({ request, response, url, db, organizationId: config.organizationId, publicUrl: config.publicUrl, currentStaff, currentOwner, body, json, idempotencyKey, audit: auditCommand })) return;
    if (request.method === 'GET' && url.pathname === '/api/auth/telegram/status') {
      const id = url.searchParams.get('requestId') ?? '';
      const record = await db.telegramLoginRequest.findUnique({ where: { id } });
      if (!record) { json(response, 404, { error: 'NOT_FOUND' }); return; }
      if (record.expiresAt <= new Date()) { json(response, 200, { state: 'EXPIRED' }); return; }
      if (record.state !== 'CONFIRMED' || !record.telegramUserId) { json(response, 200, { state: record.state }); return; }
      const user = await db.userIdentity.upsert({ where: { telegramUserId: record.telegramUserId }, update: {}, create: { telegramUserId: record.telegramUserId } });
      const token = randomBytes(32).toString('base64url');
      await db.$transaction([
        db.authSession.create({ data: { userId: user.id, tokenHash: digest(token), mode: record.mode, state: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000) } }),
        db.telegramLoginRequest.update({ where: { id }, data: { state: 'CONSUMED', consumedAt: new Date() } })
      ]);
      setSession(response, token);
      json(response, 200, { state: 'AUTHENTICATED', redirectTo: record.mode === 'STAFF' && !user.passwordHash ? '/account/password?next=/staff/' : record.mode === 'STAFF' ? '/staff/' : '/client/' });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/auth/me') {
      const current = await session(request);
      if (!current) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (current.mode === 'STAFF') {
        const membership = await db.staffMembership.findUnique({ where: { organizationId_userId: { organizationId: config.organizationId, userId: current.userId } } });
        if (!membership || membership.state !== 'ACTIVE') { json(response, 403, { error: 'FORBIDDEN' }); return; }
        json(response, 200, { account: { mode: 'STAFF', userId: current.userId, organizationId: config.organizationId, role: membership.role, telegramLinked: Boolean(current.user.telegramUserId) } });
        return;
      }
      const owner = await db.owner.findFirst({ where: { organizationId: config.organizationId, OR: [{ userId: current.userId }, { telegramUserId: current.user.telegramUserId ?? undefined }] } });
      json(response, 200, { account: { mode: 'CLIENT', userId: current.userId, organizationId: config.organizationId, telegramLinked: Boolean(current.user.telegramUserId), owner } });
      return;
    }
    const dashboard = url.pathname.match(/^\/api\/v1\/client\/owners\/([^/]+)\/dashboard$/);
    if (request.method === 'GET' && dashboard) {
      const account = await currentOwner(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      await refreshGrowthStates();
      const { owner } = account;
      if (!owner || owner.id !== decodeURIComponent(dashboard[1])) { json(response, 403, { error: 'FORBIDDEN' }); return; }
      const relations = await db.ownerPetRelation.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, include: { pet: true } });
      const petIds = relations.map((item) => item.pet.id);
      const [appointments, plans, groomingVisits, consultations, clinicalCases, hospitalizations, invoices, documents, communications, packageBalances, loyaltyEntries, memberships, waitlistEntries, bookingHolds] = await Promise.all([
        db.appointment.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, orderBy: { startsAt: 'asc' }, take: 20 }),
        db.carePlan.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, include: { tasks: { orderBy: { dueAt: 'asc' } } } }),
        db.groomingVisit.findMany({ where: { organizationId: config.organizationId, petId: { in: petIds } }, orderBy: { createdAt: 'desc' }, take: 20 }),
        db.consultation.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
        db.clinicalCase.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id, petId: { in: petIds } }, include: { encounters: { where: { state: 'FINALIZED' }, include: { prescriptions: true }, orderBy: { finalizedAt: 'desc' } } }, orderBy: { openedAt: 'desc' }, take: 20 }),
        db.hospitalization.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, include: { bed: true, tasks: { orderBy: { scheduledAt: 'asc' } }, observations: { orderBy: { recordedAt: 'desc' }, take: 3 } }, orderBy: { admittedAt: 'desc' }, take: 20 }),
        db.invoice.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, include: { lines: true, payments: { orderBy: { createdAt: 'desc' } }, fiscalReceipts: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' }, take: 30 }),
        db.generatedDocument.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id, revokedAt: null }, orderBy: { createdAt: 'desc' }, take: 30 }),
        db.communicationLog.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
        db.packageBalance.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, include: { servicePackage: true, usages: { orderBy: { usedAt: 'desc' }, take: 10 } }, orderBy: { purchasedAt: 'desc' } }),
        db.loyaltyLedgerEntry.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
        db.ownerMembership.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, include: { plan: true }, orderBy: { createdAt: 'desc' } }),
        db.bookingWaitlistEntry.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id, state: { in: ['ACTIVE', 'OFFERED'] } }, orderBy: { createdAt: 'desc' } }),
        db.bookingHold.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id, state: 'ACTIVE', expiresAt: { gt: new Date() } }, orderBy: { expiresAt: 'asc' } })
      ]);
      const variants = await db.serviceVariant.findMany({ where: { organizationId: config.organizationId, id: { in: appointments.map((item) => item.variantId) } }, include: { service: true } });
      const variantById = new Map(variants.map((item) => [item.id, item]));
      const groomingByAppointment = new Map(groomingVisits.map((item) => [item.appointmentId, item]));
      const invoiceByAppointment = new Map(invoices.filter((item) => item.appointmentId).map((item) => [item.appointmentId!, item]));
      json(response, 200, { owner: { id: owner.id, fullName: owner.fullName, phone: owner.phone, email: owner.email, preferredChannel: owner.preferredChannel, marketingConsent: owner.marketingConsent }, pets: relations.map((item) => ({ id: item.pet.id, name: item.pet.name, species: item.pet.species, breed: item.pet.breed, medicalAlerts: item.pet.medicalAlerts, vaccinationDueAt: item.pet.vaccinationDueAt, appointments: appointments.filter((appointment) => appointment.petId === item.pet.id).map((appointment) => { const grooming = groomingByAppointment.get(appointment.id); return { id: appointment.id, state: appointment.state, startsAt: appointment.startsAt, endsAt: appointment.endsAt, service: variantById.get(appointment.variantId)?.service.publicName ?? 'Услуга VetSvet', variant: variantById.get(appointment.variantId)?.name ?? '', variantId: appointment.variantId, locationId: appointment.locationId, grooming: grooming ? { state: grooming.state, currentStage: grooming.currentStage, report: grooming.report, homeCare: grooming.homeCare, nextCareAt: grooming.nextCareAt, completedAt: grooming.completedAt } : undefined }; }), careTasks: plans.filter((plan) => plan.petId === item.pet.id).flatMap((plan) => plan.tasks.map((task) => ({ id: task.id, title: task.title, state: task.state, dueAt: task.dueAt }))), clinicalHistory: clinicalCases.filter((clinicalCase) => clinicalCase.petId === item.pet.id).flatMap((clinicalCase) => clinicalCase.encounters.map((encounter) => ({ id: encounter.id, reason: clinicalCase.reason, assessment: encounter.assessment, plan: encounter.plan, finalizedAt: encounter.finalizedAt, prescriptions: encounter.prescriptions.map((prescription) => ({ medicationName: prescription.medicationName, instructions: prescription.instructions, state: prescription.state })) }))), timeline: [
        ...appointments.filter((appointment) => appointment.petId === item.pet.id).map((appointment) => ({ type: 'BOOKING', occurredAt: appointment.startsAt, title: variantById.get(appointment.variantId)?.service.publicName ?? 'Визит VetSvet', detail: appointment.state })),
        ...clinicalCases.filter((clinicalCase) => clinicalCase.petId === item.pet.id).flatMap((clinicalCase) => clinicalCase.encounters.map((encounter) => ({ type: 'HEALTH', occurredAt: encounter.finalizedAt ?? clinicalCase.openedAt, title: clinicalCase.reason, detail: encounter.assessment ?? 'Клиническая запись' }))),
        ...groomingVisits.filter((visit) => visit.petId === item.pet.id).map((visit) => ({ type: 'GROOMING', occurredAt: visit.completedAt ?? visit.createdAt, title: 'Уход и груминг', detail: visit.report ?? visit.state })),
        ...hospitalizations.filter((hospitalization) => hospitalization.petId === item.pet.id).map((hospitalization) => ({ type: 'HOSPITAL', occurredAt: hospitalization.dischargedAt ?? hospitalization.admittedAt, title: hospitalization.state === 'DISCHARGED' ? 'Выписка из стационара' : 'Стационар', detail: hospitalization.dischargeSummary ?? hospitalization.currentPlan ?? hospitalization.state })),
        ...documents.filter((document) => document.petId === item.pet.id).map((document) => ({ type: 'DOCUMENT', occurredAt: document.signedAt ?? document.createdAt, title: document.title, detail: document.state })),
        ...appointments.filter((appointment) => appointment.petId === item.pet.id).flatMap((appointment) => { const invoice = invoiceByAppointment.get(appointment.id); return invoice ? [{ type: 'FINANCE', occurredAt: invoice.createdAt, title: `Счёт ${(invoice.totalMinor / 100).toLocaleString('ru-RU')} ₽`, detail: invoice.state }] : []; }),
        ...communications.filter((communication) => !communication.petId || communication.petId === item.pet.id).map((communication) => ({ type: 'COMMUNICATION', occurredAt: communication.createdAt, title: communication.subject ?? 'Связь с VetSvet', detail: communication.body }))
      ].sort((left, right) => new Date(right.occurredAt).valueOf() - new Date(left.occurredAt).valueOf()).slice(0, 50) })), consultations: consultations.map((item) => ({ id: item.id, petId: item.petId, appointmentId: item.appointmentId, question: item.question, state: item.state, paymentState: item.paymentState, response: item.response, respondedAt: item.respondedAt, createdAt: item.createdAt })), hospitalizations: hospitalizations.map((item) => ({ id: item.id, petId: item.petId, state: item.state, acuity: item.acuity, currentPlan: item.currentPlan, ownerUpdateState: item.ownerUpdateState, alerts: item.alerts, bed: item.bed ? { label: item.bed.label, zone: item.bed.zone } : undefined, admittedAt: item.admittedAt, dischargedAt: item.dischargedAt, dischargeSummary: item.dischargeSummary, nextTasks: item.tasks.filter((task) => task.state === 'DUE').slice(0, 5).map((task) => ({ title: task.title, scheduledAt: task.scheduledAt })), lastObservation: item.observations[0] ? { acuity: item.observations[0].acuity, note: item.observations[0].note, recordedAt: item.observations[0].recordedAt } : undefined })), invoices: invoices.map((invoice) => ({ id: invoice.id, appointmentId: invoice.appointmentId, state: invoice.state, totalMinor: invoice.totalMinor, paidMinor: invoice.paidMinor, currency: invoice.currency, createdAt: invoice.createdAt, lines: invoice.lines.map((line) => ({ id: line.id, lineType: line.lineType, description: line.description, quantityMilli: line.quantityMilli, unitPriceMinor: line.unitPriceMinor, discountMinor: line.discountMinor, totalMinor: line.totalMinor })), payments: invoice.payments.map((payment) => ({ id: payment.id, amountMinor: payment.amountMinor, method: payment.method, state: payment.state, confirmedAt: payment.confirmedAt })), receiptState: invoice.fiscalReceipts[0]?.state })), documents: documents.map((document) => ({ id: document.id, petId: document.petId, appointmentId: document.appointmentId, invoiceId: document.invoiceId, kind: document.kind, title: document.title, documentVersion: document.documentVersion, state: document.state, contentHash: document.contentHash, createdAt: document.createdAt, signedAt: document.signedAt })), growth: { loyaltyPoints: loyaltyEntries.reduce((sum, entry) => sum + entry.pointsDelta, 0), loyaltyHistory: loyaltyEntries.map((entry) => ({ id: entry.id, pointsDelta: entry.pointsDelta, balanceAfter: entry.balanceAfter, reason: entry.reason, createdAt: entry.createdAt })), packages: packageBalances.map((balance) => ({ id: balance.id, petId: balance.petId, name: balance.servicePackage.name, description: balance.servicePackage.description, state: balance.state, initialCredits: balance.initialCredits, remainingCredits: balance.remainingCredits, expiresAt: balance.expiresAt, serviceIds: balance.servicePackage.serviceIds, familyShared: balance.servicePackage.familyShared, usages: balance.usages })), memberships: memberships.map((membership) => ({ id: membership.id, name: membership.plan.name, description: membership.plan.description, state: membership.state, benefits: membership.plan.benefits, autoRenew: membership.autoRenew, currentPeriodEnd: membership.currentPeriodEnd, renewsAt: membership.renewsAt })) }, booking: { waitlist: waitlistEntries, holds: bookingHolds }, petCount: petIds.length });
      return;
    }
    const clientDocumentPrint = url.pathname.match(/^\/api\/v1\/client\/documents\/([^/]+)\/print$/);
    if (request.method === 'GET' && clientDocumentPrint) {
      const account = await currentOwner(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      const document = await db.generatedDocument.findFirst({ where: { id: decodeURIComponent(clientDocumentPrint[1]), organizationId: config.organizationId, ownerId: account.owner.id, revokedAt: null } });
      if (!document) { json(response, 404, { error: 'NOT_FOUND' }); return; }
      const status = document.state === 'SIGNED' ? `Подписано ${document.signedAt?.toLocaleString('ru-RU') ?? ''}` : 'Ожидает подтверждения';
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" });
      response.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeDocumentValue(document.title)}</title><style>body{margin:0;background:#eef3ef;color:#10211f;font:16px/1.6 Inter,system-ui,sans-serif}.page{max-width:760px;margin:40px auto;padding:54px;background:#fff;border-radius:24px;box-shadow:0 22px 80px #0b494d1a}.brand{font-weight:900;letter-spacing:-.07em;color:#07555a}.meta{margin:24px 0;padding:14px;border-radius:12px;background:#c9f8d9;font-size:13px}.hash{overflow-wrap:anywhere;color:#6d7773;font-size:11px}h1{font-size:38px;line-height:1.05;letter-spacing:-.055em}@media(max-width:700px){.page{margin:0;padding:28px 20px;border-radius:0;min-height:100svh}h1{font-size:31px}}@media print{body{background:#fff}.page{margin:0;box-shadow:none}}</style></head><body><main class="page"><div class="brand">ВЕТ✦СВЕТ</div><h1>${safeDocumentValue(document.title)}</h1><div class="meta">Версия ${safeDocumentValue(document.documentVersion)} · ${safeDocumentValue(status)}</div>${document.renderedBody}<hr><p class="hash">Контрольная сумма документа: ${safeDocumentValue(document.contentHash)}</p></main></body></html>`); return;
    }
    const clientDocumentSign = url.pathname.match(/^\/api\/v1\/client\/documents\/([^/]+)\/sign$/);
    if (request.method === 'POST' && clientDocumentSign) {
      const account = await currentOwner(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { signerName?: string; accepted?: boolean } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const signerName = String(input.signerName ?? '').trim();
      const document = await db.generatedDocument.findFirst({ where: { id: decodeURIComponent(clientDocumentSign[1]), organizationId: config.organizationId, ownerId: account.owner.id, revokedAt: null } });
      if (!document) { json(response, 404, { error: 'NOT_FOUND' }); return; }
      if (document.state !== 'AWAITING_SIGNATURE') { json(response, 409, { error: 'DOCUMENT_NOT_AWAITING_SIGNATURE' }); return; }
      if (input.accepted !== true || signerName.length < 2 || signerName.toLocaleLowerCase('ru-RU') !== account.owner.fullName.trim().toLocaleLowerCase('ru-RU')) { json(response, 400, { error: 'SIGNATURE_CONFIRMATION_REQUIRED' }); return; }
      const signedAt = new Date();
      const result = await db.$transaction(async (tx) => {
        const consent = await tx.consent.create({ data: { organizationId: config.organizationId, ownerId: account.owner.id, petId: document.petId, documentId: document.id, appointmentId: document.appointmentId, caseId: document.caseId, documentVersion: document.documentVersion, purpose: document.kind, state: 'SIGNED', signerName, source: 'CLIENT_WEB', signedAt, proofMetadata: { contentHash: document.contentHash, userId: account.current.userId, userAgent: String(request.headers['user-agent'] ?? '').slice(0, 500), forwardedFor: String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim().slice(0, 100) } } });
        await tx.generatedDocument.update({ where: { id: document.id }, data: { state: 'SIGNED', signedAt } });
        return consent;
      });
      await auditCommand({ actorId: account.current.userId, action: 'document.signed', aggregateType: 'GeneratedDocument', aggregateId: document.id, idempotencyKey: key, payload: { consentId: result.id, contentHash: document.contentHash } });
      json(response, 200, { document: { id: document.id, state: 'SIGNED', signedAt }, consentId: result.id }); return;
    }
    if (request.method === 'PATCH' && url.pathname === '/api/v1/client/profile') {
      const account = await currentOwner(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { fullName?: string; phone?: string; email?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const fullName = String(input.fullName ?? '').trim();
      if (fullName.length < 2 || fullName.length > 120) { json(response, 400, { error: 'INVALID_NAME' }); return; }
      const owner = await db.owner.update({ where: { id: account.owner.id }, data: { fullName, phone: String(input.phone ?? '').trim() || null, email: String(input.email ?? '').trim() || null } });
      await auditCommand({ actorId: account.current.userId, action: 'owner.profile_updated', aggregateType: 'Owner', aggregateId: owner.id, idempotencyKey: key });
      json(response, 200, { owner: { id: owner.id, fullName: owner.fullName, phone: owner.phone, email: owner.email } }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/client/pets') {
      const account = await currentOwner(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { name?: string; species?: string; medicalAlerts?: string[] } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const name = String(input.name ?? '').trim(); const species = String(input.species ?? '').toUpperCase();
      if (name.length < 1 || name.length > 80 || !['DOG', 'CAT', 'OTHER'].includes(species)) { json(response, 400, { error: 'INVALID_PET' }); return; }
      const alerts = Array.isArray(input.medicalAlerts) ? input.medicalAlerts.map((item) => String(item).trim()).filter(Boolean).slice(0, 12) : [];
      const pet = await db.$transaction(async (tx) => {
        const created = await tx.pet.create({ data: { organizationId: config.organizationId, name, species, medicalAlerts: alerts } });
        await tx.ownerPetRelation.create({ data: { organizationId: config.organizationId, ownerId: account.owner.id, petId: created.id, relation: 'OWNER', primary: true } });
        return created;
      });
      await auditCommand({ actorId: account.current.userId, action: 'pet.created', aggregateType: 'Pet', aggregateId: pet.id, idempotencyKey: key, payload: { species } });
      json(response, 201, { pet: { id: pet.id, name: pet.name, species: pet.species, medicalAlerts: pet.medicalAlerts } }); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/client/booking/catalog') {
      const account = await currentOwner(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      const [locations, variants] = await Promise.all([
        db.location.findMany({ where: { organizationId: config.organizationId, active: true }, orderBy: { name: 'asc' } }),
        db.serviceVariant.findMany({ where: { organizationId: config.organizationId, service: { onlineBookable: true } }, include: { service: true }, orderBy: { service: { publicName: 'asc' } } })
      ]);
      json(response, 200, { locations: locations.map((location) => ({ id: location.id, name: location.name })), variants: variants.map((variant) => ({ id: variant.id, service: variant.service.publicName, name: variant.name, kind: variant.service.kind, durationMinutes: variant.durationMinutes, priceMinor: variant.priceMinor, currency: variant.currency, allowedSpecies: variant.allowedSpecies })) }); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/client/booking/availability') {
      const account = await currentOwner(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      const variantId = String(url.searchParams.get('variantId') ?? ''); const locationId = String(url.searchParams.get('locationId') ?? ''); const date = String(url.searchParams.get('date') ?? '');
      const availability = await bookingAvailability(variantId, locationId, date);
      if (!availability) { json(response, 400, { error: 'INVALID_AVAILABILITY_REQUEST' }); return; }
      json(response, 200, { date, timezone: availability.location.timezone, location: { id: availability.location.id, name: availability.location.name }, variant: { id: availability.variant.id, name: availability.variant.name, service: availability.variant.service.publicName, kind: availability.variant.service.kind, durationMinutes: availability.variant.durationMinutes }, slots: availability.slots }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/client/booking/holds') {
      const account = await currentOwner(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      const repeated = await db.bookingHold.findUnique({ where: { organizationId_idempotencyKey: { organizationId: config.organizationId, idempotencyKey: key } } });
      if (repeated && repeated.state === 'ACTIVE' && repeated.expiresAt > new Date()) { json(response, 200, { hold: repeated }); return; }
      let input: { petId?: string; variantId?: string; locationId?: string; startsAt?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const [relation, variant, location] = await Promise.all([db.ownerPetRelation.findFirst({ where: { organizationId: config.organizationId, ownerId: account.owner.id, petId: String(input.petId ?? '') } }), db.serviceVariant.findFirst({ where: { organizationId: config.organizationId, id: String(input.variantId ?? ''), service: { onlineBookable: true } }, include: { service: true } }), db.location.findFirst({ where: { organizationId: config.organizationId, id: String(input.locationId ?? ''), active: true } })]);
      const startsAt = new Date(String(input.startsAt ?? ''));
      if (!relation || !variant || !location || Number.isNaN(startsAt.valueOf()) || startsAt <= new Date() || variant.service.kind === 'CONSULTATION') { json(response, 400, { error: 'INVALID_HOLD_REQUEST' }); return; }
      const endsAt = new Date(startsAt.valueOf() + variant.durationMinutes * 60_000); const expiresAt = bookingHoldExpiresAt();
      try {
        const hold = await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${config.organizationId}:${location.id}:${variant.service.kind}:${dateKeyInMoscow(startsAt)}`}))`;
          const available = await bookingAvailability(variant.id, location.id, dateKeyInMoscow(startsAt));
          if (!available?.slots.some((slot) => new Date(slot.startsAt).valueOf() === startsAt.valueOf())) throw new Error('BOOKING_SLOT_UNAVAILABLE');
          await tx.bookingHold.updateMany({ where: { organizationId: config.organizationId, ownerId: account.owner.id, state: 'ACTIVE' }, data: { state: 'RELEASED', releasedAt: new Date() } });
          return tx.bookingHold.create({ data: { organizationId: config.organizationId, ownerId: account.owner.id, petId: relation.petId, variantId: variant.id, locationId: location.id, startsAt, endsAt, expiresAt, idempotencyKey: key } });
        });
        json(response, 201, { hold: { id: hold.id, startsAt: hold.startsAt, endsAt: hold.endsAt, expiresAt: hold.expiresAt, secondsRemaining: Math.max(0, Math.floor((hold.expiresAt.valueOf() - Date.now()) / 1000)) } }); return;
      } catch (error) { json(response, 409, { error: (error as Error).message === 'BOOKING_SLOT_UNAVAILABLE' ? 'BOOKING_SLOT_UNAVAILABLE' : 'HOLD_CHANGED_RETRY' }); return; }
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/client/booking/waitlist') {
      const account = await currentOwner(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      const entries = await db.bookingWaitlistEntry.findMany({ where: { organizationId: config.organizationId, ownerId: account.owner.id, state: { in: ['ACTIVE', 'OFFERED'] } }, orderBy: { createdAt: 'desc' } });
      json(response, 200, { entries }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/client/booking/waitlist') {
      const account = await currentOwner(request); const key = idempotencyKey(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; } if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      const repeated = await db.bookingWaitlistEntry.findUnique({ where: { organizationId_idempotencyKey: { organizationId: config.organizationId, idempotencyKey: key } } }); if (repeated) { json(response, 200, { entry: repeated }); return; }
      let input: { petId?: string; variantId?: string; locationId?: string; date?: string; period?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const [relation, variant, location] = await Promise.all([db.ownerPetRelation.findFirst({ where: { organizationId: config.organizationId, ownerId: account.owner.id, petId: String(input.petId ?? '') } }), db.serviceVariant.findFirst({ where: { organizationId: config.organizationId, id: String(input.variantId ?? ''), service: { onlineBookable: true } } }), db.location.findFirst({ where: { organizationId: config.organizationId, id: String(input.locationId ?? ''), active: true } })]);
      const date = String(input.date ?? ''); const preferredDate = new Date(`${date}T12:00:00+03:00`); const period = String(input.period ?? 'ANY').toUpperCase();
      if (!relation || !variant || !location || Number.isNaN(preferredDate.valueOf()) || preferredDate < new Date() || !['ANY', 'MORNING', 'AFTERNOON', 'EVENING'].includes(period)) { json(response, 400, { error: 'INVALID_WAITLIST_REQUEST' }); return; }
      await db.bookingWaitlistEntry.updateMany({ where: { organizationId: config.organizationId, ownerId: account.owner.id, petId: relation.petId, variantId: variant.id, locationId: location.id, preferredDate: { gte: new Date(`${date}T00:00:00+03:00`), lte: new Date(`${date}T23:59:59.999+03:00`) }, state: 'ACTIVE' }, data: { state: 'CANCELLED', cancelledAt: new Date() } });
      const entry = await db.bookingWaitlistEntry.create({ data: { organizationId: config.organizationId, ownerId: account.owner.id, petId: relation.petId, variantId: variant.id, locationId: location.id, preferredDate, period, idempotencyKey: key } });
      await auditCommand({ actorId: account.current.userId, action: 'booking.waitlist_joined', aggregateType: 'BookingWaitlistEntry', aggregateId: entry.id, idempotencyKey: `${key}:audit`, payload: { date, period } }); json(response, 201, { entry }); return;
    }
    const clientWaitlist = url.pathname.match(/^\/api\/v1\/client\/booking\/waitlist\/([^/]+)$/);
    if (request.method === 'DELETE' && clientWaitlist) {
      const account = await currentOwner(request); const key = idempotencyKey(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; } if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      const entry = await db.bookingWaitlistEntry.findFirst({ where: { id: decodeURIComponent(clientWaitlist[1]), organizationId: config.organizationId, ownerId: account.owner.id, state: { in: ['ACTIVE', 'OFFERED'] } } }); if (!entry) { json(response, 404, { error: 'NOT_FOUND' }); return; }
      await db.$transaction([db.bookingWaitlistEntry.update({ where: { id: entry.id }, data: { state: 'CANCELLED', cancelledAt: new Date() } }), ...(entry.offeredHoldId ? [db.bookingHold.updateMany({ where: { id: entry.offeredHoldId, organizationId: config.organizationId, state: 'ACTIVE' }, data: { state: 'RELEASED', releasedAt: new Date() } })] : [])]);
      await auditCommand({ actorId: account.current.userId, action: 'booking.waitlist_cancelled', aggregateType: 'BookingWaitlistEntry', aggregateId: entry.id, idempotencyKey: key }); json(response, 200, { entry: { id: entry.id, state: 'CANCELLED' } }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/client/appointments') {
      const account = await currentOwner(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { petId?: string; variantId?: string; locationId?: string; startsAt?: string; packageBalanceId?: string; holdId?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const [relation, variant, location, packageBalance, hold] = await Promise.all([
        db.ownerPetRelation.findFirst({ where: { organizationId: config.organizationId, ownerId: account.owner.id, petId: String(input.petId ?? '') }, include: { pet: true } }),
        db.serviceVariant.findFirst({ where: { organizationId: config.organizationId, id: String(input.variantId ?? ''), service: { onlineBookable: true } }, include: { service: true } }),
        db.location.findFirst({ where: { organizationId: config.organizationId, id: String(input.locationId ?? ''), active: true } }),
        input.packageBalanceId ? db.packageBalance.findFirst({ where: { id: String(input.packageBalanceId), organizationId: config.organizationId, ownerId: account.owner.id }, include: { servicePackage: true } }) : Promise.resolve(null),
        input.holdId ? db.bookingHold.findFirst({ where: { id: String(input.holdId), organizationId: config.organizationId, ownerId: account.owner.id, state: 'ACTIVE', expiresAt: { gt: new Date() } } }) : Promise.resolve(null)
      ]);
      const startsAt = new Date(String(input.startsAt ?? ''));
      if (!relation || !variant || !location || Number.isNaN(startsAt.valueOf()) || startsAt <= new Date()) { json(response, 400, { error: 'INVALID_BOOKING_REQUEST' }); return; }
      const allowed = Array.isArray(variant.allowedSpecies) && variant.allowedSpecies.includes(relation.pet.species);
      if (!allowed) { json(response, 400, { error: 'SPECIES_NOT_ALLOWED' }); return; }
      if (variant.service.kind === 'CONSULTATION') { json(response, 400, { error: 'USE_CONSULTATION_WORKFLOW' }); return; }
      if (input.holdId && (!hold || hold.petId !== relation.petId || hold.variantId !== variant.id || hold.locationId !== location.id || hold.startsAt.valueOf() !== startsAt.valueOf())) { json(response, 409, { error: 'BOOKING_HOLD_EXPIRED' }); return; }
      const availability = await bookingAvailability(variant.id, location.id, dateKeyInMoscow(startsAt), hold?.id);
      if (!availability?.slots.some((slot) => new Date(slot.startsAt).valueOf() === startsAt.valueOf())) { json(response, 409, { error: 'BOOKING_SLOT_UNAVAILABLE' }); return; }
      if (input.packageBalanceId) {
        const eligibleServices = Array.isArray(packageBalance?.servicePackage.serviceIds) ? packageBalance.servicePackage.serviceIds.map(String) : [];
        if (!packageBalance || packageBalance.state !== 'ACTIVE' || packageBalance.remainingCredits < 1 || (packageBalance.expiresAt && packageBalance.expiresAt <= new Date()) || (!packageBalance.servicePackage.familyShared && packageBalance.petId !== relation.petId) || !eligibleServices.includes(variant.id)) { json(response, 409, { error: 'PACKAGE_CREDIT_NOT_AVAILABLE' }); return; }
      }
      const endsAt = new Date(startsAt.valueOf() + variant.durationMinutes * 60_000);
      const conflict = await db.appointment.findFirst({ where: { organizationId: config.organizationId, petId: relation.petId, startsAt, state: { in: ['REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'READY'] } } });
      if (conflict) { json(response, 409, { error: 'DUPLICATE_APPOINTMENT_REQUEST' }); return; }
      let bookingFailure: string | undefined;
      const result = await db.$transaction(async (tx) => {
        const lockKeys = [
          `booking:${config.organizationId}:${location.id}:${variant.service.kind}:${dateKeyInMoscow(startsAt)}`,
          `pet:${config.organizationId}:${relation.petId}`
        ].sort();
        for (const lockKey of lockKeys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        if (hold) { const consumed = await tx.bookingHold.updateMany({ where: { id: hold.id, organizationId: config.organizationId, ownerId: account.owner.id, state: 'ACTIVE', expiresAt: { gt: new Date() } }, data: { state: 'CONSUMED', consumedAt: new Date() } }); if (consumed.count !== 1) throw new Error('BOOKING_HOLD_CHANGED'); }
        const lockedAvailability = await bookingAvailability(variant.id, location.id, dateKeyInMoscow(startsAt), hold?.id);
        if (!lockedAvailability?.slots.some((slot) => new Date(slot.startsAt).valueOf() === startsAt.valueOf())) throw new Error('BOOKING_SLOT_CHANGED');
        const lockedConflict = await tx.appointment.findFirst({ where: { organizationId: config.organizationId, petId: relation.petId, startsAt, state: { in: ['REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'READY'] } } });
        if (lockedConflict) throw new Error('DUPLICATE_APPOINTMENT_CHANGED');
        const appointment = await tx.appointment.create({ data: { organizationId: config.organizationId, locationId: location.id, ownerId: account.owner.id, petId: relation.petId, variantId: variant.id, staffId: 'UNASSIGNED', startsAt, endsAt, state: 'REQUESTED' } });
        if (packageBalance) {
          const claimed = await tx.packageBalance.updateMany({ where: { id: packageBalance.id, organizationId: config.organizationId, state: 'ACTIVE', remainingCredits: { gt: 0 } }, data: { remainingCredits: { decrement: 1 }, ...(packageBalance.remainingCredits === 1 ? { state: 'DEPLETED' } : {}) } });
          if (claimed.count !== 1) throw new Error('PACKAGE_CREDIT_CHANGED');
          await tx.packageUsage.create({ data: { organizationId: config.organizationId, balanceId: packageBalance.id, appointmentId: appointment.id, variantId: variant.id, usedBy: account.current.userId } });
        }
        const payableMinor = packageBalance ? 0 : variant.priceMinor;
        const invoice = await tx.invoice.create({ data: { organizationId: config.organizationId, ownerId: account.owner.id, appointmentId: appointment.id, state: packageBalance ? 'PAID' : variant.priceMinor > 0 ? 'ISSUED' : 'DRAFT', totalMinor: payableMinor, paidMinor: 0, currency: variant.currency, issuedAt: packageBalance || variant.priceMinor > 0 ? new Date() : null, lines: { create: { organizationId: config.organizationId, lineType: packageBalance ? 'PACKAGE' : 'SERVICE', referenceId: packageBalance?.id ?? variant.id, description: packageBalance ? `${variant.service.publicName} · списание из пакета «${packageBalance.servicePackage.name}»` : `${variant.service.publicName} · ${variant.name}`, unitPriceMinor: payableMinor, totalMinor: payableMinor } } } });
        const kind = variant.service.kind === 'GROOMING' ? 'GROOMING_CONSENT' : 'PROCEDURE_CONSENT';
        const template = await tx.printTemplate.findFirst({ where: { organizationId: config.organizationId, kind, state: 'PUBLISHED' }, orderBy: { version: 'desc' } });
        if (template) {
          const renderedBody = renderDocumentBody(template.body, { owner: account.owner.fullName, pet: relation.pet.name, service: variant.service.publicName, amount: packageBalance ? `1 посещение из пакета «${packageBalance.servicePackage.name}»` : `${(variant.priceMinor / 100).toLocaleString('ru-RU')} ₽` });
          await tx.generatedDocument.create({ data: { organizationId: config.organizationId, templateId: template.id, ownerId: account.owner.id, petId: relation.petId, appointmentId: appointment.id, invoiceId: invoice.id, kind: template.kind, title: template.title ?? 'Согласие VetSvet', documentVersion: `${template.kind}:v${template.version}`, renderedBody, contentHash: digest(renderedBody), createdBy: account.current.userId } });
        }
        return { appointment, invoice };
      }).catch((error: Error) => {
        if (['PACKAGE_CREDIT_CHANGED', 'BOOKING_SLOT_CHANGED', 'DUPLICATE_APPOINTMENT_CHANGED', 'BOOKING_HOLD_CHANGED'].includes(error.message)) { bookingFailure = error.message; return null; }
        throw error;
      });
      if (!result) {
        json(response, 409, { error: bookingFailure === 'BOOKING_SLOT_CHANGED' ? 'BOOKING_SLOT_UNAVAILABLE' : bookingFailure === 'DUPLICATE_APPOINTMENT_CHANGED' ? 'DUPLICATE_APPOINTMENT_REQUEST' : bookingFailure === 'BOOKING_HOLD_CHANGED' ? 'BOOKING_HOLD_EXPIRED' : 'PACKAGE_CREDIT_CHANGED_RETRY' }); return;
      }
      await ensureBookingReminders(result.appointment.id, result.appointment.ownerId, result.appointment.startsAt);
      if (hold) await db.bookingWaitlistEntry.updateMany({ where: { organizationId: config.organizationId, offeredHoldId: hold.id, state: 'OFFERED' }, data: { state: 'BOOKED', bookedAt: new Date() } });
      await auditCommand({ actorId: account.current.userId, action: 'appointment.requested', aggregateType: 'Appointment', aggregateId: result.appointment.id, idempotencyKey: key, payload: { petId: relation.petId, variantId: variant.id, packageBalanceId: packageBalance?.id } });
      json(response, 201, { appointment: { id: result.appointment.id, state: result.appointment.state, startsAt: result.appointment.startsAt, endsAt: result.appointment.endsAt }, invoice: { id: result.invoice.id, state: result.invoice.state, totalMinor: result.invoice.totalMinor, currency: result.invoice.currency } }); return;
    }
    const clientAppointmentManage = url.pathname.match(/^\/api\/v1\/client\/appointments\/([^/]+)$/);
    if (request.method === 'PATCH' && clientAppointmentManage) {
      const account = await currentOwner(request); const key = idempotencyKey(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; } if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { action?: string; startsAt?: string; reason?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const appointment = await db.appointment.findFirst({ where: { id: decodeURIComponent(clientAppointmentManage[1]), organizationId: config.organizationId, ownerId: account.owner.id } }); if (!appointment) { json(response, 404, { error: 'NOT_FOUND' }); return; }
      const action = String(input.action ?? '').toUpperCase();
      if (action === 'CANCEL') {
        if (!canCancelBooking(appointment.state, appointment.startsAt)) { json(response, 409, { error: 'APPOINTMENT_NOT_CANCELLABLE' }); return; }
        const reason = String(input.reason ?? 'Отменено владельцем').trim().slice(0, 500);
        const updated = await db.appointment.update({ where: { id: appointment.id }, data: { state: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason } });
        await cancelBookingReminders(appointment.id); await offerReleasedSlot(appointment);
        await auditCommand({ actorId: account.current.userId, action: 'appointment.cancelled_by_owner', aggregateType: 'Appointment', aggregateId: appointment.id, idempotencyKey: key, payload: { reason } }); json(response, 200, { appointment: updated }); return;
      }
      if (action === 'RESCHEDULE') {
        if (!canRescheduleBooking(appointment.state, appointment.startsAt)) { json(response, 409, { error: 'APPOINTMENT_NOT_RESCHEDULABLE' }); return; }
        const startsAt = new Date(String(input.startsAt ?? '')); const variant = await db.serviceVariant.findFirst({ where: { id: appointment.variantId, organizationId: config.organizationId }, include: { service: true } });
        if (!variant || Number.isNaN(startsAt.valueOf()) || startsAt <= new Date()) { json(response, 400, { error: 'INVALID_RESCHEDULE_REQUEST' }); return; }
        const endsAt = new Date(startsAt.valueOf() + variant.durationMinutes * 60_000); const available = await bookingAvailability(variant.id, appointment.locationId, dateKeyInMoscow(startsAt));
        if (!available?.slots.some((slot) => new Date(slot.startsAt).valueOf() === startsAt.valueOf())) { json(response, 409, { error: 'BOOKING_SLOT_UNAVAILABLE' }); return; }
        try {
          const updated = await db.$transaction(async (tx) => { await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${config.organizationId}:${appointment.locationId}:${variant.service.kind}:${dateKeyInMoscow(startsAt)}`}))`; const locked = await bookingAvailability(variant.id, appointment.locationId, dateKeyInMoscow(startsAt)); if (!locked?.slots.some((slot) => new Date(slot.startsAt).valueOf() === startsAt.valueOf())) throw new Error('BOOKING_SLOT_UNAVAILABLE'); return tx.appointment.update({ where: { id: appointment.id }, data: { previousStartsAt: appointment.startsAt, previousEndsAt: appointment.endsAt, startsAt, endsAt, state: 'REQUESTED', staffId: 'UNASSIGNED', rescheduledAt: new Date(), rescheduleCount: { increment: 1 } } }); });
          await ensureBookingReminders(updated.id, updated.ownerId, updated.startsAt); await offerReleasedSlot(appointment);
          await auditCommand({ actorId: account.current.userId, action: 'appointment.rescheduled_by_owner', aggregateType: 'Appointment', aggregateId: appointment.id, idempotencyKey: key, payload: { from: appointment.startsAt.toISOString(), to: startsAt.toISOString() } }); json(response, 200, { appointment: updated }); return;
        } catch { json(response, 409, { error: 'BOOKING_SLOT_UNAVAILABLE' }); return; }
      }
      json(response, 400, { error: 'UNKNOWN_APPOINTMENT_ACTION' }); return;
    }
    const clientRebook = url.pathname.match(/^\/api\/v1\/client\/appointments\/([^/]+)\/rebook$/);
    if (request.method === 'POST' && clientRebook) {
      const account = await currentOwner(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { startsAt?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const original = await db.appointment.findFirst({ where: { id: decodeURIComponent(clientRebook[1]), organizationId: config.organizationId, ownerId: account.owner.id } });
      if (!original || !['COMPLETED', 'READY'].includes(original.state)) { json(response, 409, { error: 'APPOINTMENT_NOT_REBOOKABLE' }); return; }
      const [relation, variant] = await Promise.all([
        db.ownerPetRelation.findFirst({ where: { organizationId: config.organizationId, ownerId: account.owner.id, petId: original.petId }, include: { pet: true } }),
        db.serviceVariant.findFirst({ where: { organizationId: config.organizationId, id: original.variantId, service: { onlineBookable: true } }, include: { service: true } })
      ]);
      const startsAt = new Date(String(input.startsAt ?? '')); if (!relation || !variant || Number.isNaN(startsAt.valueOf()) || startsAt <= new Date() || variant.service.kind === 'CONSULTATION') { json(response, 400, { error: 'INVALID_REBOOK_REQUEST' }); return; }
      const endsAt = new Date(startsAt.valueOf() + variant.durationMinutes * 60_000);
      const conflict = await db.appointment.findFirst({ where: { organizationId: config.organizationId, petId: original.petId, startsAt, state: { in: ['REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'READY'] } } }); if (conflict) { json(response, 409, { error: 'DUPLICATE_APPOINTMENT_REQUEST' }); return; }
      const result = await db.$transaction(async (tx) => {
        const appointment = await tx.appointment.create({ data: { organizationId: config.organizationId, locationId: original.locationId, ownerId: account.owner.id, petId: original.petId, variantId: original.variantId, staffId: original.staffId === 'UNASSIGNED' ? 'UNASSIGNED' : original.staffId, startsAt, endsAt, state: 'REQUESTED' } });
        const invoice = await tx.invoice.create({ data: { organizationId: config.organizationId, ownerId: account.owner.id, appointmentId: appointment.id, state: variant.priceMinor > 0 ? 'ISSUED' : 'DRAFT', totalMinor: variant.priceMinor, currency: variant.currency, issuedAt: variant.priceMinor > 0 ? new Date() : null, lines: { create: { organizationId: config.organizationId, lineType: 'SERVICE', referenceId: variant.id, description: `${variant.service.publicName} · повтор удачного визита`, unitPriceMinor: variant.priceMinor, totalMinor: variant.priceMinor } } } });
        const kind = variant.service.kind === 'GROOMING' ? 'GROOMING_CONSENT' : 'PROCEDURE_CONSENT'; const template = await tx.printTemplate.findFirst({ where: { organizationId: config.organizationId, kind, state: 'PUBLISHED' }, orderBy: { version: 'desc' } });
        if (template) { const renderedBody = renderDocumentBody(template.body, { owner: account.owner.fullName, pet: relation.pet.name, service: variant.service.publicName, amount: `${(variant.priceMinor / 100).toLocaleString('ru-RU')} ₽` }); await tx.generatedDocument.create({ data: { organizationId: config.organizationId, templateId: template.id, ownerId: account.owner.id, petId: original.petId, appointmentId: appointment.id, invoiceId: invoice.id, kind: template.kind, title: template.title ?? 'Согласие VetSvet', documentVersion: `${template.kind}:v${template.version}`, renderedBody, contentHash: digest(renderedBody), createdBy: account.current.userId } }); }
        return { appointment, invoice };
      });
      await ensureBookingReminders(result.appointment.id, result.appointment.ownerId, result.appointment.startsAt);
      await auditCommand({ actorId: account.current.userId, action: 'appointment.rebooked', aggregateType: 'Appointment', aggregateId: result.appointment.id, idempotencyKey: key, payload: { previousAppointmentId: original.id, petId: original.petId, variantId: original.variantId } });
      json(response, 201, { appointment: result.appointment, invoice: { id: result.invoice.id, state: result.invoice.state, totalMinor: result.invoice.totalMinor } }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/client/consultations') {
      const account = await currentOwner(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { petId?: string; locationId?: string; startsAt?: string; question?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const question = String(input.question ?? '').trim();
      if (question.length < 10 || question.length > 3000) { json(response, 400, { error: 'CONSULTATION_QUESTION_REQUIRED' }); return; }
      const [relation, variant, location] = await Promise.all([
        db.ownerPetRelation.findFirst({ where: { organizationId: config.organizationId, ownerId: account.owner.id, petId: String(input.petId ?? '') }, include: { pet: true } }),
        db.serviceVariant.findFirst({ where: { organizationId: config.organizationId, service: { kind: 'CONSULTATION', onlineBookable: true } }, include: { service: true }, orderBy: { name: 'asc' } }),
        db.location.findFirst({ where: { organizationId: config.organizationId, id: String(input.locationId ?? ''), active: true } })
      ]);
      const startsAt = new Date(String(input.startsAt ?? ''));
      if (!relation || !variant || !location || Number.isNaN(startsAt.valueOf()) || startsAt <= new Date()) { json(response, 400, { error: 'INVALID_CONSULTATION_REQUEST' }); return; }
      const endsAt = new Date(startsAt.valueOf() + variant.durationMinutes * 60_000);
      const duplicate = await db.consultation.findFirst({ where: { organizationId: config.organizationId, ownerId: account.owner.id, petId: relation.petId, state: { in: ['WAITING_PAYMENT', 'PAYMENT_LINKED', 'PAYMENT_REVIEW', 'READY_FOR_SCHEDULING', 'CONFIRMED'] } } });
      if (duplicate) { json(response, 409, { error: 'ACTIVE_CONSULTATION_EXISTS' }); return; }
      const secret = randomBytes(24).toString('base64url');
      const result = await db.$transaction(async (tx) => {
        const appointment = await tx.appointment.create({ data: { organizationId: config.organizationId, locationId: location.id, ownerId: account.owner.id, petId: relation.petId, variantId: variant.id, staffId: 'UNASSIGNED', startsAt, endsAt, state: 'REQUESTED' } });
        const invoice = await tx.invoice.create({ data: { organizationId: config.organizationId, ownerId: account.owner.id, appointmentId: appointment.id, state: 'PENDING_PAYMENT_REVIEW', totalMinor: variant.priceMinor, currency: variant.currency, issuedAt: new Date(), lines: { create: { organizationId: config.organizationId, lineType: 'SERVICE', referenceId: variant.id, description: `${variant.service.publicName} · ${variant.name}`, unitPriceMinor: variant.priceMinor, totalMinor: variant.priceMinor } } } });
        const consultation = await tx.consultation.create({ data: { organizationId: config.organizationId, ownerId: account.owner.id, petId: relation.petId, appointmentId: appointment.id, question, paymentTokenHash: digest(secret), paymentTokenExpiresAt: new Date(Date.now() + 48 * 60 * 60_000) } });
        const template = await tx.printTemplate.findFirst({ where: { organizationId: config.organizationId, kind: 'REMOTE_CONSULTATION_CONSENT', state: 'PUBLISHED' }, orderBy: { version: 'desc' } });
        if (template) {
          const renderedBody = renderDocumentBody(template.body, { owner: account.owner.fullName, pet: relation.pet.name, service: variant.service.publicName, amount: `${(variant.priceMinor / 100).toLocaleString('ru-RU')} ₽` });
          await tx.generatedDocument.create({ data: { organizationId: config.organizationId, templateId: template.id, ownerId: account.owner.id, petId: relation.petId, appointmentId: appointment.id, invoiceId: invoice.id, kind: template.kind, title: template.title ?? 'Условия консультации', documentVersion: `${template.kind}:v${template.version}`, renderedBody, contentHash: digest(renderedBody), createdBy: account.current.userId } });
        }
        return { appointment, invoice, consultation };
      });
      await auditCommand({ actorId: account.current.userId, action: 'consultation.requested', aggregateType: 'Consultation', aggregateId: result.consultation.id, idempotencyKey: key, payload: { appointmentId: result.appointment.id, petId: relation.petId } });
      json(response, 201, { consultation: { id: result.consultation.id, state: result.consultation.state, paymentState: result.consultation.paymentState }, invoice: { id: result.invoice.id, state: result.invoice.state }, telegramUrl: `https://t.me/${config.botUsername}?start=c_${result.consultation.id}_${secret}` }); return;
    }
    const consultationPaymentLink = url.pathname.match(/^\/api\/v1\/client\/consultations\/([^/]+)\/payment-link$/);
    if (request.method === 'POST' && consultationPaymentLink) {
      const account = await currentOwner(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      const consultation = await db.consultation.findFirst({ where: { id: decodeURIComponent(consultationPaymentLink[1]), organizationId: config.organizationId, ownerId: account.owner.id } });
      if (!consultation) { json(response, 404, { error: 'NOT_FOUND' }); return; }
      if (!['WAITING_PAYMENT', 'PAYMENT_LINKED'].includes(consultation.state) || !['AWAITING_PROOF'].includes(consultation.paymentState)) { json(response, 409, { error: 'PAYMENT_LINK_NOT_AVAILABLE' }); return; }
      const secret = randomBytes(24).toString('base64url');
      await db.consultation.update({ where: { id: consultation.id }, data: { paymentTokenHash: digest(secret), paymentTokenExpiresAt: new Date(Date.now() + 48 * 60 * 60_000) } });
      await auditCommand({ actorId: account.current.userId, action: 'consultation.payment_link_rotated', aggregateType: 'Consultation', aggregateId: consultation.id, idempotencyKey: key });
      json(response, 200, { telegramUrl: `https://t.me/${config.botUsername}?start=c_${consultation.id}_${secret}` }); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/staff/dashboard') {
      const account = await currentStaff(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      const appointments = await db.appointment.findMany({ where: { organizationId: config.organizationId, state: { in: ['REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'READY'] } }, orderBy: { startsAt: 'asc' }, take: 80 });
      const [owners, pets, variants, invoices, groomingVisits, consultations, encounters, hospitalizations] = await Promise.all([
        db.owner.findMany({ where: { organizationId: config.organizationId, id: { in: appointments.map((item) => item.ownerId) } } }),
        db.pet.findMany({ where: { organizationId: config.organizationId, id: { in: appointments.map((item) => item.petId) } } }),
        db.serviceVariant.findMany({ where: { organizationId: config.organizationId, id: { in: appointments.map((item) => item.variantId) } }, include: { service: true } }),
        db.invoice.findMany({ where: { organizationId: config.organizationId, appointmentId: { in: appointments.map((item) => item.id) } } }),
        db.groomingVisit.findMany({ where: { organizationId: config.organizationId, appointmentId: { in: appointments.map((item) => item.id) } } }),
        db.consultation.findMany({ where: { organizationId: config.organizationId, appointmentId: { in: appointments.map((item) => item.id) } } }),
        db.encounter.findMany({ where: { organizationId: config.organizationId, appointmentId: { in: appointments.map((item) => item.id) } }, include: { prescriptions: true } }),
        db.hospitalization.findMany({ where: { organizationId: config.organizationId, appointmentId: { in: appointments.map((item) => item.id) } } })
      ]);
      const ownerById = new Map(owners.map((item) => [item.id, item])); const petById = new Map(pets.map((item) => [item.id, item])); const variantById = new Map(variants.map((item) => [item.id, item])); const invoiceByAppointment = new Map(invoices.filter((item) => item.appointmentId).map((item) => [item.appointmentId!, item])); const groomingByAppointment = new Map(groomingVisits.map((item) => [item.appointmentId, item])); const consultationByAppointment = new Map(consultations.map((item) => [item.appointmentId, item])); const encounterByAppointment = new Map(encounters.filter((item) => item.appointmentId).map((item) => [item.appointmentId!, item])); const hospitalizationByAppointment = new Map(hospitalizations.filter((item) => item.appointmentId).map((item) => [item.appointmentId!, item]));
      json(response, 200, { account: { role: account.membership.role }, appointments: appointments.map((item) => { const invoice = invoiceByAppointment.get(item.id); const grooming = groomingByAppointment.get(item.id); return { id: item.id, state: item.state, startsAt: item.startsAt, endsAt: item.endsAt, staffId: item.staffId, owner: ownerById.get(item.ownerId)?.fullName ?? 'Владелец', pet: petById.get(item.petId)?.name ?? 'Питомец', petId: item.petId, locationId: item.locationId, species: petById.get(item.petId)?.species ?? 'OTHER', service: variantById.get(item.variantId)?.service.publicName ?? 'Услуга VetSvet', kind: variantById.get(item.variantId)?.service.kind ?? 'OTHER', variant: variantById.get(item.variantId)?.name ?? '', invoiceState: invoice?.state ?? '—', invoice: invoice ? { id: invoice.id, state: invoice.state, totalMinor: invoice.totalMinor, paidMinor: invoice.paidMinor, currency: invoice.currency } : undefined, hospitalization: hospitalizationByAppointment.get(item.id) ? { id: hospitalizationByAppointment.get(item.id)!.id, state: hospitalizationByAppointment.get(item.id)!.state } : undefined, encounter: encounterByAppointment.get(item.id) ? { id: encounterByAppointment.get(item.id)!.id, state: encounterByAppointment.get(item.id)!.state, assessment: encounterByAppointment.get(item.id)!.assessment, plan: encounterByAppointment.get(item.id)!.plan } : undefined, consultation: consultationByAppointment.get(item.id) ? { id: consultationByAppointment.get(item.id)!.id, state: consultationByAppointment.get(item.id)!.state, paymentState: consultationByAppointment.get(item.id)!.paymentState, question: consultationByAppointment.get(item.id)!.question, response: consultationByAppointment.get(item.id)!.response } : undefined, groomingVisit: grooming ? { id: grooming.id, state: grooming.state, currentStage: grooming.currentStage, stageStartedAt: grooming.stageStartedAt, stageLog: grooming.stageLog, checklist: normalizeGroomingChecklist(grooming.checklist), report: grooming.report, homeCare: grooming.homeCare, nextCareAt: grooming.nextCareAt } : undefined }; }) }); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/staff/booking/availability') {
      const account = await currentStaff(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      const variantId = String(url.searchParams.get('variantId') ?? ''); const locationId = String(url.searchParams.get('locationId') ?? ''); const date = String(url.searchParams.get('date') ?? ''); const availability = await bookingAvailability(variantId, locationId, date);
      if (!availability) { json(response, 400, { error: 'INVALID_AVAILABILITY_REQUEST' }); return; }
      json(response, 200, { date, timezone: availability.location.timezone, slots: availability.slots }); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/staff/booking/board') {
      const account = await currentStaff(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      const date = String(url.searchParams.get('date') ?? dateKeyInMoscow(new Date()));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { json(response, 400, { error: 'INVALID_DATE' }); return; }
      const dayStart = new Date(`${date}T00:00:00+03:00`); const dayEnd = new Date(`${date}T23:59:59.999+03:00`);
      const [appointments, locations, variants, memberships, holds, waitlist] = await Promise.all([
        db.appointment.findMany({ where: { organizationId: config.organizationId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } }, orderBy: { startsAt: 'asc' }, take: 300 }),
        db.location.findMany({ where: { organizationId: config.organizationId, active: true }, orderBy: { name: 'asc' } }),
        db.serviceVariant.findMany({ where: { organizationId: config.organizationId }, include: { service: true }, orderBy: { service: { publicName: 'asc' } } }),
        db.staffMembership.findMany({ where: { organizationId: config.organizationId, state: 'ACTIVE' }, include: { user: true }, orderBy: { role: 'asc' } }),
        db.bookingHold.findMany({ where: { organizationId: config.organizationId, state: 'ACTIVE', expiresAt: { gt: new Date() }, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } }, orderBy: { startsAt: 'asc' } }),
        db.bookingWaitlistEntry.findMany({ where: { organizationId: config.organizationId, preferredDate: { gte: dayStart, lte: dayEnd }, state: { in: ['ACTIVE', 'OFFERED'] } }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] })
      ]);
      const appointmentReminders = appointments.length ? await db.bookingReminder.findMany({ where: { organizationId: config.organizationId, appointmentId: { in: appointments.map((item) => item.id) }, state: { in: ['PENDING', 'SENT', 'FAILED'] } } }) : [];
      const [owners, pets] = await Promise.all([
        db.owner.findMany({ where: { organizationId: config.organizationId, id: { in: [...appointments.map((item) => item.ownerId), ...waitlist.map((item) => item.ownerId)] } } }),
        db.pet.findMany({ where: { organizationId: config.organizationId, id: { in: [...appointments.map((item) => item.petId), ...waitlist.map((item) => item.petId)] } } })
      ]);
      const ownerById = new Map(owners.map((item) => [item.id, item])); const petById = new Map(pets.map((item) => [item.id, item])); const variantById = new Map(variants.map((item) => [item.id, item]));
      json(response, 200, { date, timezone: 'Europe/Moscow', locations: locations.map((item) => ({ id: item.id, name: item.name, bookingCapacity: item.bookingCapacity })), variants: variants.map((item) => ({ id: item.id, service: item.service.publicName, kind: item.service.kind, name: item.name, durationMinutes: item.durationMinutes, priceMinor: item.priceMinor })), staff: memberships.map((item) => ({ id: item.userId, role: item.role, name: item.user.login ?? item.user.email ?? item.user.phone ?? item.role })), holds: holds.map((item) => ({ id: item.id, ownerId: item.ownerId, petId: item.petId, variantId: item.variantId, startsAt: item.startsAt, endsAt: item.endsAt, expiresAt: item.expiresAt })), waitlist: waitlist.map((item) => ({ id: item.id, owner: ownerById.get(item.ownerId)?.fullName ?? 'Владелец', pet: petById.get(item.petId)?.name ?? 'Питомец', variantId: item.variantId, service: variantById.get(item.variantId)?.service.publicName ?? 'Услуга', period: item.period, state: item.state, preferredDate: item.preferredDate, offerExpiresAt: item.offerExpiresAt })), appointments: appointments.map((item) => ({ id: item.id, ownerId: item.ownerId, owner: ownerById.get(item.ownerId)?.fullName ?? 'Владелец', petId: item.petId, pet: petById.get(item.petId)?.name ?? 'Питомец', species: petById.get(item.petId)?.species ?? 'OTHER', variantId: item.variantId, service: variantById.get(item.variantId)?.service.publicName ?? 'Услуга', kind: variantById.get(item.variantId)?.service.kind ?? 'OTHER', staffId: item.staffId, startsAt: item.startsAt, endsAt: item.endsAt, state: item.state, rescheduleCount: item.rescheduleCount, reminders: appointmentReminders.filter((reminder) => reminder.appointmentId === item.id).map((reminder) => ({ kind: reminder.kind, state: reminder.state, scheduledAt: reminder.scheduledAt })) })) }); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/staff/care-directory') {
      const account = await currentStaff(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      const owners = await db.owner.findMany({ where: { organizationId: config.organizationId, accountStatus: { not: 'BLOCKED' } }, include: { consents: { orderBy: { createdAt: 'desc' }, take: 100 }, relations: { where: { state: 'ACTIVE' }, include: { pet: { include: { files: { where: { state: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 30 } } } } } }, orderBy: { updatedAt: 'desc' }, take: 250 });
      const petIds = owners.flatMap((owner) => owner.relations.map((relation) => relation.petId));
      const [appointments, profiles, recipes, groomingVisits, clinicalCases, carePlans] = await Promise.all([
        db.appointment.findMany({ where: { organizationId: config.organizationId, petId: { in: petIds } }, orderBy: { startsAt: 'desc' }, take: 1500 }),
        db.groomingProfile.findMany({ where: { organizationId: config.organizationId, petId: { in: petIds } } }),
        db.groomingRecipe.findMany({ where: { organizationId: config.organizationId, petId: { in: petIds }, isPreferred: true }, orderBy: { createdAt: 'desc' } }),
        db.groomingVisit.findMany({ where: { organizationId: config.organizationId, petId: { in: petIds } }, orderBy: { createdAt: 'desc' }, take: 800 }),
        db.clinicalCase.findMany({ where: { organizationId: config.organizationId, petId: { in: petIds } }, include: { encounters: { where: { state: 'FINALIZED' }, orderBy: { finalizedAt: 'desc' }, take: 3 } }, orderBy: { openedAt: 'desc' }, take: 800 }),
        db.carePlan.findMany({ where: { organizationId: config.organizationId, petId: { in: petIds }, state: 'ACTIVE' }, include: { tasks: { where: { state: { in: ['OPEN', 'IN_PROGRESS'] } }, orderBy: { dueAt: 'asc' } } } })
      ]);
      const variants = await db.serviceVariant.findMany({ where: { organizationId: config.organizationId, id: { in: appointments.map((item) => item.variantId) } }, include: { service: true } }); const variantById = new Map(variants.map((item) => [item.id, item]));
      const now = new Date(); const profileByPet = new Map(profiles.map((item) => [item.petId, item])); const recipeByPet = new Map(recipes.map((item) => [item.petId, item]));
      const rows = owners.map((owner) => ({ id: owner.id, fullName: owner.fullName, phone: owner.phone, email: owner.email, preferredChannel: owner.preferredChannel, address: owner.address, emergencyContact: owner.emergencyContact, marketingConsent: owner.marketingConsent, accountStatus: owner.accountStatus, tags: owner.tags, notes: owner.notes, consents: owner.consents.map((item) => ({ id: item.id, petId: item.petId, purpose: item.purpose, documentVersion: item.documentVersion, state: item.state, signerName: item.signerName, signedAt: item.signedAt, revokedAt: item.revokedAt })), pets: owner.relations.map((relation) => { const pet = relation.pet; const petAppointments = appointments.filter((item) => item.petId === pet.id); const profile = profileByPet.get(pet.id); const recipe = recipeByPet.get(pet.id); const visits = groomingVisits.filter((item) => item.petId === pet.id); const cases = clinicalCases.filter((item) => item.petId === pet.id); const plans = carePlans.filter((item) => item.petId === pet.id); const next = petAppointments.filter((item) => item.startsAt >= now && !['CANCELLED', 'COMPLETED'].includes(item.state)).sort((a, b) => a.startsAt.valueOf() - b.startsAt.valueOf())[0]; const last = petAppointments.filter((item) => item.startsAt < now && item.state === 'COMPLETED')[0]; return { id: pet.id, name: pet.name, species: pet.species, breed: pet.breed, sex: pet.sex, neuterState: pet.neuterState, birthDate: pet.birthDate, color: pet.color, microchip: pet.microchip, passportId: pet.passportId, lifecycle: pet.lifecycle, medicalAlerts: pet.medicalAlerts, chronicConditions: pet.chronicConditions, behavioralAlerts: pet.behavioralAlerts, feedingNotes: pet.feedingNotes, medicationNotes: pet.medicationNotes, vaccinationDueAt: pet.vaccinationDueAt, relation: { id: relation.id, relation: relation.relation, primary: relation.primary, permissions: relation.permissions }, caregivers: owners.flatMap((candidate) => candidate.relations.filter((item) => item.petId === pet.id).map((item) => ({ relationId: item.id, ownerId: candidate.id, fullName: candidate.fullName, phone: candidate.phone, relation: item.relation, primary: item.primary, permissions: item.permissions }))), files: pet.files.map((file) => ({ id: file.id, category: file.category, originalName: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, createdAt: file.createdAt })), grooming: profile ? { coatType: profile.coatType, sensitivities: profile.sensitivities, behaviorNotes: profile.behaviorNotes, preferredStyle: profile.preferredStyle, recipe: recipe ? { id: recipe.id, title: recipe.title, steps: recipe.steps } : undefined, lastReport: visits.find((item) => item.state === 'COMPLETE')?.report, lastCompletedAt: visits.find((item) => item.state === 'COMPLETE')?.completedAt } : undefined, nextAppointment: next ? { id: next.id, state: next.state, startsAt: next.startsAt, service: variantById.get(next.variantId)?.service.publicName ?? 'Услуга', kind: variantById.get(next.variantId)?.service.kind ?? 'OTHER' } : undefined, lastAppointment: last ? { id: last.id, startsAt: last.startsAt, service: variantById.get(last.variantId)?.service.publicName ?? 'Услуга', kind: variantById.get(last.variantId)?.service.kind ?? 'OTHER' } : undefined, clinical: cases.flatMap((item) => item.encounters.map((encounter) => ({ reason: item.reason, assessment: encounter.assessment, plan: encounter.plan, occurredAt: encounter.finalizedAt ?? item.openedAt }))).slice(0, 5), careTasks: plans.flatMap((plan) => plan.tasks.map((task) => ({ id: task.id, title: task.title, category: task.category, dueAt: task.dueAt, state: task.state }))).slice(0, 10) }; }) }));
      json(response, 200, { owners: rows, summary: { owners: rows.length, pets: rows.reduce((sum, owner) => sum + owner.pets.length, 0), groomingProfiles: profiles.length, upcoming: appointments.filter((item) => item.startsAt >= now && !['CANCELLED', 'COMPLETED'].includes(item.state)).length } }); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/staff/finance/dashboard') {
      const account = await currentStaff(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(account.membership.role)) { json(response, 403, { error: 'FINANCE_ROLE_REQUIRED' }); return; }
      const [invoices, templates] = await Promise.all([
        db.invoice.findMany({ where: { organizationId: config.organizationId }, include: { owner: true, lines: { orderBy: { createdAt: 'asc' } }, payments: { orderBy: { createdAt: 'desc' } }, fiscalReceipts: { orderBy: { createdAt: 'desc' } }, documents: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' }, take: 80 }),
        db.printTemplate.findMany({ where: { organizationId: config.organizationId, state: 'PUBLISHED' }, orderBy: [{ kind: 'asc' }, { version: 'desc' }] })
      ]);
      const appointmentIds = invoices.flatMap((invoice) => invoice.appointmentId ? [invoice.appointmentId] : []);
      const appointments = await db.appointment.findMany({ where: { organizationId: config.organizationId, id: { in: appointmentIds } } });
      const pets = await db.pet.findMany({ where: { organizationId: config.organizationId, id: { in: appointments.map((appointment) => appointment.petId) } } });
      const appointmentById = new Map(appointments.map((appointment) => [appointment.id, appointment])); const petById = new Map(pets.map((pet) => [pet.id, pet]));
      json(response, 200, { invoices: invoices.map((invoice) => { const appointment = invoice.appointmentId ? appointmentById.get(invoice.appointmentId) : undefined; return { id: invoice.id, ownerId: invoice.ownerId, owner: invoice.owner.fullName, petId: appointment?.petId, pet: appointment ? petById.get(appointment.petId)?.name : undefined, appointmentId: invoice.appointmentId, state: invoice.state, totalMinor: invoice.totalMinor, paidMinor: invoice.paidMinor, currency: invoice.currency, createdAt: invoice.createdAt, lines: invoice.lines, payments: invoice.payments, receipts: invoice.fiscalReceipts, documents: invoice.documents.map((document) => ({ id: document.id, kind: document.kind, title: document.title, state: document.state, documentVersion: document.documentVersion })) }; }), templates: templates.map((template) => ({ id: template.id, kind: template.kind, title: template.title, version: template.version })) }); return;
    }
    const staffInvoiceLines = url.pathname.match(/^\/api\/v1\/staff\/finance\/invoices\/([^/]+)\/lines$/);
    if (request.method === 'POST' && staffInvoiceLines) {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(account.membership.role)) { json(response, 403, { error: 'FINANCE_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { lineType?: string; referenceId?: string; description?: string; quantityMilli?: number; unitPriceMinor?: number; discountMinor?: number; taxCode?: string; performerId?: string; costBasisMinor?: number } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const lineType = String(input.lineType ?? '').toUpperCase(); const description = String(input.description ?? '').trim(); const quantityMilli = Math.round(Number(input.quantityMilli ?? 1000)); const unitPriceMinor = Math.round(Number(input.unitPriceMinor ?? 0)); const discountMinor = Math.round(Number(input.discountMinor ?? 0));
      if (!['SERVICE', 'PRODUCT', 'MEDICATION', 'PACKAGE', 'DISCOUNT'].includes(lineType) || description.length < 2 || description.length > 500 || quantityMilli <= 0 || quantityMilli > 1_000_000_000 || unitPriceMinor < 0 || unitPriceMinor > 100_000_000 || discountMinor < 0) { json(response, 400, { error: 'INVALID_INVOICE_LINE' }); return; }
      const repeatedLine = await db.invoiceLine.findUnique({ where: { idempotencyKey: key }, include: { invoice: true } });
      if (repeatedLine) {
        if (repeatedLine.invoiceId !== decodeURIComponent(staffInvoiceLines[1])) { json(response, 409, { error: 'IDEMPOTENCY_KEY_REUSED' }); return; }
        json(response, 200, { line: repeatedLine, invoice: { id: repeatedLine.invoice.id, state: repeatedLine.invoice.state, totalMinor: repeatedLine.invoice.totalMinor, paidMinor: repeatedLine.invoice.paidMinor } }); return;
      }
      const lineTotal = Math.max(0, Math.round(quantityMilli * unitPriceMinor / 1000) - discountMinor);
      const currentInvoice = await db.invoice.findFirst({ where: { id: decodeURIComponent(staffInvoiceLines[1]), organizationId: config.organizationId } });
      if (!currentInvoice) { json(response, 404, { error: 'NOT_FOUND' }); return; }
      if (['PAID', 'VOID', 'REFUNDED'].includes(currentInvoice.state)) { json(response, 409, { error: 'INVOICE_LOCKED' }); return; }
      const result = await db.$transaction(async (tx) => {
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: currentInvoice.id } });
        const line = await tx.invoiceLine.create({ data: { organizationId: config.organizationId, invoiceId: invoice.id, lineType, referenceId: String(input.referenceId ?? '').trim() || null, description, quantityMilli, unitPriceMinor, discountMinor, totalMinor: lineTotal, taxCode: String(input.taxCode ?? '').trim() || null, performerId: String(input.performerId ?? '').trim() || null, costBasisMinor: Number.isFinite(input.costBasisMinor) ? Math.max(0, Math.round(Number(input.costBasisMinor))) : null, idempotencyKey: key } });
        const aggregate = await tx.invoiceLine.aggregate({ where: { invoiceId: invoice.id }, _sum: { totalMinor: true } });
        const totalMinor = aggregate._sum.totalMinor ?? 0;
        const updated = await tx.invoice.update({ where: { id: invoice.id }, data: { totalMinor, state: invoiceState(totalMinor, invoice.paidMinor, Boolean(invoice.issuedAt)) } });
        return { line, invoice: updated };
      });
      await auditCommand({ actorId: account.current.userId, action: 'invoice.line_added', aggregateType: 'Invoice', aggregateId: result.invoice.id, idempotencyKey: key, payload: { lineId: result.line.id, totalMinor: result.invoice.totalMinor } });
      json(response, 201, { line: result.line, invoice: { id: result.invoice.id, state: result.invoice.state, totalMinor: result.invoice.totalMinor, paidMinor: result.invoice.paidMinor } }); return;
    }
    const staffInvoice = url.pathname.match(/^\/api\/v1\/staff\/finance\/invoices\/([^/]+)$/);
    if (request.method === 'PATCH' && staffInvoice) {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(account.membership.role)) { json(response, 403, { error: 'FINANCE_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { action?: string; amountMinor?: number; method?: string; providerTransactionId?: string; dueAt?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const action = String(input.action ?? '').toUpperCase(); const invoiceId = decodeURIComponent(staffInvoice[1]);
      if (action === 'ISSUE') {
        const invoice = await db.invoice.findFirst({ where: { id: invoiceId, organizationId: config.organizationId }, include: { lines: true } });
        if (!invoice) { json(response, 404, { error: 'NOT_FOUND' }); return; }
        if (!['DRAFT', 'PENDING_QUOTE', 'ISSUED'].includes(invoice.state) || !invoice.lines.length || invoice.totalMinor < 0) { json(response, 409, { error: 'INVOICE_NOT_READY' }); return; }
        const dueAt = input.dueAt ? new Date(input.dueAt) : null; if (dueAt && Number.isNaN(dueAt.valueOf())) { json(response, 400, { error: 'INVALID_DUE_DATE' }); return; }
        const updated = await db.invoice.update({ where: { id: invoice.id }, data: { state: invoiceState(invoice.totalMinor, invoice.paidMinor, true), issuedAt: invoice.issuedAt ?? new Date(), dueAt } });
        await auditCommand({ actorId: account.current.userId, action: 'invoice.issued', aggregateType: 'Invoice', aggregateId: invoice.id, idempotencyKey: key, payload: { totalMinor: invoice.totalMinor } });
        json(response, 200, { invoice: updated }); return;
      }
      if (action === 'RECORD_PAYMENT') {
        const amountMinor = Math.round(Number(input.amountMinor ?? 0)); const method = String(input.method ?? 'SBP').toUpperCase();
        if (amountMinor <= 0 || amountMinor > 100_000_000 || !['CASH', 'CARD', 'SBP', 'TRANSFER'].includes(method)) { json(response, 400, { error: 'INVALID_PAYMENT' }); return; }
        const providerTransactionId = String(input.providerTransactionId ?? '').trim() || key;
        const repeatedPayment = await db.payment.findUnique({ where: { organizationId_provider_providerTransactionId: { organizationId: config.organizationId, provider: 'MANUAL', providerTransactionId } }, include: { invoice: true, fiscalReceipts: true } });
        if (repeatedPayment) {
          if (repeatedPayment.invoiceId !== invoiceId || repeatedPayment.amountMinor !== amountMinor) { json(response, 409, { error: 'PAYMENT_REFERENCE_REUSED' }); return; }
          json(response, 200, { invoice: repeatedPayment.invoice, payment: repeatedPayment, fiscalReceipt: repeatedPayment.fiscalReceipts[0] }); return;
        }
        const currentInvoice = await db.invoice.findFirst({ where: { id: invoiceId, organizationId: config.organizationId } });
        if (!currentInvoice) { json(response, 404, { error: 'NOT_FOUND' }); return; }
        if (!['ISSUED', 'PARTIALLY_PAID', 'PENDING_PAYMENT_REVIEW'].includes(currentInvoice.state) || currentInvoice.paidMinor + amountMinor > currentInvoice.totalMinor) { json(response, 409, { error: 'PAYMENT_EXCEEDS_BALANCE' }); return; }
        const result = await db.$transaction(async (tx) => {
          const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: currentInvoice.id } });
          const paidAt = new Date();
          const payment = await tx.payment.create({ data: { organizationId: config.organizationId, invoiceId: invoice.id, provider: 'MANUAL', providerTransactionId, amountMinor, currency: invoice.currency, state: 'CONFIRMED', method, confirmedAt: paidAt } });
          const paidMinor = invoice.paidMinor + amountMinor;
          const updated = await tx.invoice.update({ where: { id: invoice.id }, data: { paidMinor, state: invoiceState(invoice.totalMinor, paidMinor, true) } });
          const receipt = await tx.fiscalReceipt.create({ data: { organizationId: config.organizationId, invoiceId: invoice.id, paymentId: payment.id, state: 'PENDING_PROVIDER', idempotencyKey: `manual-payment:${key}` } });
          await settleGrowthBenefits(tx, updated, payment, paidAt);
          return { invoice: updated, payment, receipt };
        });
        await auditCommand({ actorId: account.current.userId, action: 'payment.confirmed_manually', aggregateType: 'Invoice', aggregateId: result.invoice.id, idempotencyKey: key, payload: { paymentId: result.payment.id, amountMinor, receiptState: result.receipt.state } });
        json(response, 200, { invoice: result.invoice, payment: result.payment, fiscalReceipt: result.receipt }); return;
      }
      if (action === 'VOID') {
        const invoice = await db.invoice.findFirst({ where: { id: invoiceId, organizationId: config.organizationId } });
        if (!invoice) { json(response, 404, { error: 'NOT_FOUND' }); return; }
        if (invoice.paidMinor > 0 || ['PAID', 'REFUNDED'].includes(invoice.state)) { json(response, 409, { error: 'PAID_INVOICE_CANNOT_BE_VOIDED' }); return; }
        const updated = await db.invoice.update({ where: { id: invoice.id }, data: { state: 'VOID' } });
        await auditCommand({ actorId: account.current.userId, action: 'invoice.voided', aggregateType: 'Invoice', aggregateId: invoice.id, idempotencyKey: key });
        json(response, 200, { invoice: updated }); return;
      }
      json(response, 400, { error: 'UNKNOWN_INVOICE_ACTION' }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/staff/documents') {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER', 'VETERINARIAN', 'GROOMER', 'RECEPTIONIST'].includes(account.membership.role)) { json(response, 403, { error: 'DOCUMENT_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      const repeatedDocument = await db.generatedDocument.findUnique({ where: { idempotencyKey: key } });
      if (repeatedDocument) { json(response, 200, { document: { id: repeatedDocument.id, title: repeatedDocument.title, state: repeatedDocument.state, documentVersion: repeatedDocument.documentVersion } }); return; }
      let input: { ownerId?: string; petId?: string; appointmentId?: string; invoiceId?: string; kind?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const kind = String(input.kind ?? '').toUpperCase();
      const [owner, relation, template, invoice] = await Promise.all([
        db.owner.findFirst({ where: { id: String(input.ownerId ?? ''), organizationId: config.organizationId } }),
        db.ownerPetRelation.findFirst({ where: { organizationId: config.organizationId, ownerId: String(input.ownerId ?? ''), petId: String(input.petId ?? '') }, include: { pet: true } }),
        db.printTemplate.findFirst({ where: { organizationId: config.organizationId, kind, state: 'PUBLISHED' }, orderBy: { version: 'desc' } }),
        input.invoiceId ? db.invoice.findFirst({ where: { id: String(input.invoiceId), organizationId: config.organizationId } }) : Promise.resolve(null)
      ]);
      if (!owner || !relation || !template || (input.invoiceId && !invoice)) { json(response, 400, { error: 'INVALID_DOCUMENT_CONTEXT' }); return; }
      if (invoice && invoice.ownerId !== owner.id) { json(response, 403, { error: 'INVOICE_OWNER_MISMATCH' }); return; }
      const renderedBody = renderDocumentBody(template.body, { owner: owner.fullName, pet: relation.pet.name, service: 'согласованный план помощи', amount: invoice ? `${(invoice.totalMinor / 100).toLocaleString('ru-RU')} ₽` : 'по согласованному расчёту' });
      const document = await db.generatedDocument.create({ data: { organizationId: config.organizationId, templateId: template.id, ownerId: owner.id, petId: relation.petId, appointmentId: String(input.appointmentId ?? '').trim() || null, invoiceId: invoice?.id, kind: template.kind, title: template.title ?? 'Документ VetSvet', documentVersion: `${template.kind}:v${template.version}`, renderedBody, contentHash: digest(renderedBody), idempotencyKey: key, createdBy: account.current.userId } });
      await auditCommand({ actorId: account.current.userId, action: 'document.generated', aggregateType: 'GeneratedDocument', aggregateId: document.id, idempotencyKey: key, payload: { kind, ownerId: owner.id, contentHash: document.contentHash } });
      json(response, 201, { document: { id: document.id, title: document.title, state: document.state, documentVersion: document.documentVersion } }); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/staff/crm/dashboard') {
      const account = await currentStaff(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(account.membership.role)) { json(response, 403, { error: 'CRM_ROLE_REQUIRED' }); return; }
      const since = new Date(Date.now() - 365 * 86400000); const lapsedBefore = new Date(Date.now() - 180 * 86400000); const newAfter = new Date(Date.now() - 30 * 86400000);
      const [owners, appointments, invoices, tasks, communications] = await Promise.all([
        db.owner.findMany({ where: { organizationId: config.organizationId }, include: { relations: { include: { pet: true } } }, orderBy: { createdAt: 'desc' }, take: 250 }),
        db.appointment.findMany({ where: { organizationId: config.organizationId, createdAt: { gte: since } }, orderBy: { startsAt: 'desc' }, take: 3000 }),
        db.invoice.findMany({ where: { organizationId: config.organizationId, state: { not: 'VOID' } }, orderBy: { createdAt: 'desc' }, take: 3000 }),
        db.operationalTask.findMany({ where: { organizationId: config.organizationId, state: { in: ['OPEN', 'IN_PROGRESS'] } }, orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }], take: 300 }),
        db.communicationLog.findMany({ where: { organizationId: config.organizationId }, orderBy: { createdAt: 'desc' }, take: 300 })
      ]);
      const variants = await db.serviceVariant.findMany({ where: { organizationId: config.organizationId, id: { in: appointments.map((appointment) => appointment.variantId) } }, include: { service: true } }); const variantById = new Map(variants.map((variant) => [variant.id, variant]));
      const ownerRows = owners.map((owner) => {
        const ownerAppointments = appointments.filter((appointment) => appointment.ownerId === owner.id); const completed = ownerAppointments.filter((appointment) => appointment.state === 'COMPLETED'); const lastVisit = completed[0]?.startsAt; const kinds = new Set(completed.map((appointment) => variantById.get(appointment.variantId)?.service.kind).filter(Boolean)); const ownerInvoices = invoices.filter((invoice) => invoice.ownerId === owner.id); const outstandingMinor = ownerInvoices.reduce((sum, invoice) => sum + Math.max(0, invoice.totalMinor - invoice.paidMinor), 0); const segments: string[] = [];
        if (owner.createdAt >= newAfter && completed.length <= 1) segments.push('NEW');
        if (!lastVisit || lastVisit < lapsedBefore) segments.push('LAPSED'); else segments.push('ACTIVE');
        if (kinds.size === 1 && kinds.has('GROOMING')) segments.push('GROOMING_ONLY');
        if (kinds.size === 1 && kinds.has('VETERINARY')) segments.push('VETERINARY_ONLY');
        if (kinds.size > 1) segments.push('MIXED');
        if (completed.length >= 6) segments.push('HIGH_FREQUENCY');
        if (owner.relations.some((relation) => relation.pet.vaccinationDueAt && relation.pet.vaccinationDueAt <= new Date(Date.now() + 30 * 86400000))) segments.push('VACCINATION_DUE');
        if (outstandingMinor > 0) segments.push('OUTSTANDING');
        return { id: owner.id, fullName: owner.fullName, phone: owner.phone, email: owner.email, preferredChannel: owner.preferredChannel, marketingConsent: owner.marketingConsent, accountStatus: owner.accountStatus, tags: owner.tags, source: owner.source, notes: owner.notes, createdAt: owner.createdAt, lastVisit, visitCount: completed.length, outstandingMinor, segments, pets: owner.relations.map((relation) => ({ id: relation.pet.id, name: relation.pet.name, species: relation.pet.species, breed: relation.pet.breed, lifecycle: relation.pet.lifecycle, vaccinationDueAt: relation.pet.vaccinationDueAt })), openTasks: tasks.filter((task) => task.ownerId === owner.id).map((task) => ({ id: task.id, title: task.title, kind: task.kind, priority: task.priority, state: task.state, dueAt: task.dueAt, details: task.details })), lastCommunication: communications.find((communication) => communication.ownerId === owner.id) };
      });
      json(response, 200, { owners: ownerRows, tasks, communications, summary: { totalOwners: ownerRows.length, active: ownerRows.filter((owner) => owner.segments.includes('ACTIVE')).length, lapsed: ownerRows.filter((owner) => owner.segments.includes('LAPSED')).length, vaccinationDue: ownerRows.filter((owner) => owner.segments.includes('VACCINATION_DUE')).length, outstandingMinor: ownerRows.reduce((sum, owner) => sum + owner.outstandingMinor, 0), openTasks: tasks.length } }); return;
    }
    const staffCrmOwner = url.pathname.match(/^\/api\/v1\/staff\/crm\/owners\/([^/]+)$/);
    if (request.method === 'PATCH' && staffCrmOwner) {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(account.membership.role)) { json(response, 403, { error: 'CRM_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { preferredChannel?: string; marketingConsent?: boolean; accountStatus?: string; tags?: string[]; source?: string; notes?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const owner = await db.owner.findFirst({ where: { id: decodeURIComponent(staffCrmOwner[1]), organizationId: config.organizationId } });
      if (!owner) { json(response, 404, { error: 'NOT_FOUND' }); return; }
      const preferredChannel = String(input.preferredChannel ?? owner.preferredChannel).toUpperCase(); const accountStatus = String(input.accountStatus ?? owner.accountStatus).toUpperCase(); const tags = Array.isArray(input.tags) ? [...new Set(input.tags.map((tag) => String(tag).trim().toUpperCase()).filter(Boolean))].slice(0, 20) : owner.tags;
      if (!Array.isArray(tags) || !['TELEGRAM', 'PHONE', 'EMAIL', 'SMS'].includes(preferredChannel) || !['ACTIVE', 'PAUSED', 'BLOCKED'].includes(accountStatus) || tags.some((tag) => String(tag).length > 40)) { json(response, 400, { error: 'INVALID_CRM_PROFILE' }); return; }
      const updated = await db.owner.update({ where: { id: owner.id }, data: { preferredChannel, marketingConsent: typeof input.marketingConsent === 'boolean' ? input.marketingConsent : owner.marketingConsent, accountStatus, tags, source: input.source === undefined ? owner.source : String(input.source).trim().slice(0, 120) || null, notes: input.notes === undefined ? owner.notes : String(input.notes).trim().slice(0, 4000) || null } });
      await auditCommand({ actorId: account.current.userId, action: 'crm.owner_updated', aggregateType: 'Owner', aggregateId: owner.id, idempotencyKey: key, payload: { preferredChannel, accountStatus, tagCount: tags.length } });
      json(response, 200, { owner: { id: updated.id, preferredChannel: updated.preferredChannel, marketingConsent: updated.marketingConsent, accountStatus: updated.accountStatus, tags: updated.tags, source: updated.source, notes: updated.notes } }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/staff/crm/tasks') {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER', 'RECEPTIONIST', 'VETERINARIAN', 'GROOMER'].includes(account.membership.role)) { json(response, 403, { error: 'CRM_TASK_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      const repeated = await db.operationalTask.findUnique({ where: { idempotencyKey: key } }); if (repeated) { json(response, 200, { task: repeated }); return; }
      let input: { ownerId?: string; petId?: string; title?: string; kind?: string; priority?: string; dueAt?: string; details?: string; assigneeId?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const title = String(input.title ?? '').trim(); const kind = String(input.kind ?? 'FOLLOW_UP').toUpperCase(); const priority = String(input.priority ?? 'NORMAL').toUpperCase(); const dueAt = input.dueAt ? new Date(input.dueAt) : null;
      const owner = await db.owner.findFirst({ where: { id: String(input.ownerId ?? ''), organizationId: config.organizationId } }); const relation = input.petId ? await db.ownerPetRelation.findFirst({ where: { organizationId: config.organizationId, ownerId: owner?.id ?? '', petId: String(input.petId) } }) : null;
      if (!owner || (input.petId && !relation) || title.length < 3 || title.length > 240 || !['FOLLOW_UP', 'REBOOK', 'PAYMENT', 'VACCINATION', 'SERVICE_RECOVERY', 'GENERAL'].includes(kind) || !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority) || (dueAt && Number.isNaN(dueAt.valueOf()))) { json(response, 400, { error: 'INVALID_CRM_TASK' }); return; }
      const task = await db.operationalTask.create({ data: { organizationId: config.organizationId, ownerId: owner.id, petId: relation?.petId, title, kind, priority, state: 'OPEN', dueAt, details: String(input.details ?? '').trim().slice(0, 4000) || null, assigneeId: String(input.assigneeId ?? '').trim() || account.current.userId, relatedType: 'OWNER', relatedId: owner.id, idempotencyKey: key } });
      await auditCommand({ actorId: account.current.userId, action: 'crm.task_created', aggregateType: 'OperationalTask', aggregateId: task.id, idempotencyKey: key, payload: { ownerId: owner.id, petId: relation?.petId, kind, dueAt } });
      json(response, 201, { task }); return;
    }
    const staffCrmTask = url.pathname.match(/^\/api\/v1\/staff\/crm\/tasks\/([^/]+)$/);
    if (request.method === 'PATCH' && staffCrmTask) {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      const task = await db.operationalTask.findFirst({ where: { id: decodeURIComponent(staffCrmTask[1]), organizationId: config.organizationId } });
      if (!task) { json(response, 404, { error: 'NOT_FOUND' }); return; }
      if (task.state === 'DONE') { json(response, 200, { task }); return; }
      if (task.assigneeId && task.assigneeId !== account.current.userId && !['ADMIN', 'MANAGER'].includes(account.membership.role)) { json(response, 403, { error: 'TASK_ASSIGNEE_REQUIRED' }); return; }
      const updated = await db.operationalTask.update({ where: { id: task.id }, data: { state: 'DONE', completedAt: new Date() } });
      await auditCommand({ actorId: account.current.userId, action: 'crm.task_completed', aggregateType: 'OperationalTask', aggregateId: task.id, idempotencyKey: key });
      json(response, 200, { task: updated }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/staff/crm/communications') {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER', 'RECEPTIONIST', 'VETERINARIAN', 'GROOMER'].includes(account.membership.role)) { json(response, 403, { error: 'COMMUNICATION_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      const repeated = await db.communicationLog.findUnique({ where: { idempotencyKey: key } }); if (repeated) { json(response, 200, { communication: repeated }); return; }
      let input: { ownerId?: string; petId?: string; channel?: string; direction?: string; kind?: string; subject?: string; body?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const channel = String(input.channel ?? 'PHONE').toUpperCase(); const direction = String(input.direction ?? 'OUTBOUND').toUpperCase(); const kind = String(input.kind ?? 'FOLLOW_UP').toUpperCase(); const message = String(input.body ?? '').trim();
      const owner = await db.owner.findFirst({ where: { id: String(input.ownerId ?? ''), organizationId: config.organizationId } }); const relation = input.petId ? await db.ownerPetRelation.findFirst({ where: { organizationId: config.organizationId, ownerId: owner?.id ?? '', petId: String(input.petId) } }) : null;
      if (!owner || (input.petId && !relation) || !['PHONE', 'TELEGRAM', 'EMAIL', 'SMS', 'IN_APP'].includes(channel) || !['INBOUND', 'OUTBOUND'].includes(direction) || message.length < 2 || message.length > 6000) { json(response, 400, { error: 'INVALID_COMMUNICATION_LOG' }); return; }
      const communication = await db.communicationLog.create({ data: { organizationId: config.organizationId, ownerId: owner.id, petId: relation?.petId, channel, direction, kind, subject: String(input.subject ?? '').trim().slice(0, 240) || null, body: message, state: 'LOGGED', staffId: account.current.userId, idempotencyKey: key } });
      await auditCommand({ actorId: account.current.userId, action: 'communication.logged', aggregateType: 'CommunicationLog', aggregateId: communication.id, idempotencyKey: key, payload: { ownerId: owner.id, petId: relation?.petId, channel, direction, kind } });
      json(response, 201, { communication }); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/staff/analytics/dashboard') {
      const account = await currentStaff(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER'].includes(account.membership.role)) { json(response, 403, { error: 'ANALYTICS_ROLE_REQUIRED' }); return; }
      const days = Math.min(365, Math.max(7, Number(url.searchParams.get('days') ?? 30) || 30)); const from = new Date(Date.now() - days * 86400000); const now = new Date();
      const [payments, invoices, appointments, owners, pets, consultations, hospitalizations, treatmentTasks, inventoryItems, lots] = await Promise.all([
        db.payment.findMany({ where: { organizationId: config.organizationId, state: { in: ['CONFIRMED', 'SUCCEEDED'] }, OR: [{ confirmedAt: { gte: from } }, { confirmedAt: null, createdAt: { gte: from } }] } }),
        db.invoice.findMany({ where: { organizationId: config.organizationId, createdAt: { gte: from }, state: { not: 'VOID' } }, include: { payments: true } }),
        db.appointment.findMany({ where: { organizationId: config.organizationId, createdAt: { gte: from } } }),
        db.owner.findMany({ where: { organizationId: config.organizationId } }),
        db.pet.findMany({ where: { organizationId: config.organizationId, lifecycle: 'ACTIVE' } }),
        db.consultation.findMany({ where: { organizationId: config.organizationId, createdAt: { gte: from } } }),
        db.hospitalization.findMany({ where: { organizationId: config.organizationId, admittedAt: { gte: from } } }),
        db.treatmentTask.findMany({ where: { organizationId: config.organizationId, scheduledAt: { gte: from } } }),
        db.inventoryItem.findMany({ where: { organizationId: config.organizationId, active: true } }),
        db.stockLot.findMany({ where: { organizationId: config.organizationId, state: 'ACTIVE', storageState: 'AVAILABLE' } })
      ]);
      const variants = await db.serviceVariant.findMany({ where: { organizationId: config.organizationId, id: { in: appointments.map((appointment) => appointment.variantId) } }, include: { service: true } }); const variantById = new Map(variants.map((variant) => [variant.id, variant])); const invoiceByAppointment = new Map(invoices.filter((invoice) => invoice.appointmentId).map((invoice) => [invoice.appointmentId!, invoice]));
      const legacyCollectedMinor = invoices.filter((invoice) => invoice.state === 'PAID' && invoice.payments.length === 0).reduce((sum, invoice) => sum + invoice.paidMinor, 0); const collectedMinor = payments.reduce((sum, payment) => sum + payment.amountMinor, legacyCollectedMinor); const outstandingMinor = invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.totalMinor - invoice.paidMinor), 0); const paidInvoiceIds = new Set([...payments.map((payment) => payment.invoiceId), ...invoices.filter((invoice) => invoice.state === 'PAID' && invoice.payments.length === 0).map((invoice) => invoice.id)]); const revenueByKind = new Map<string, number>();
      for (const appointment of appointments) { const invoice = invoiceByAppointment.get(appointment.id); const kind = variantById.get(appointment.variantId)?.service.kind ?? 'OTHER'; if (invoice?.paidMinor) revenueByKind.set(kind, (revenueByKind.get(kind) ?? 0) + invoice.paidMinor); }
      const completed = appointments.filter((appointment) => appointment.state === 'COMPLETED'); const returningOwnerIds = new Set([...new Set(completed.map((appointment) => appointment.ownerId))].filter((ownerId) => completed.filter((appointment) => appointment.ownerId === ownerId).length >= 2)); const itemById = new Map(inventoryItems.map((item) => [item.id, item])); const usableLots = lots.filter((lot) => !lot.expiryAt || lot.expiryAt > now); const stockValueMinor = usableLots.reduce((sum, lot) => sum + Math.round(lot.quantityMilli * (itemById.get(lot.itemId)?.purchasePriceMinor ?? 0) / 1000), 0); const expiringAt = new Date(Date.now() + 30 * 86400000);
      json(response, 200, { range: { days, from, to: now }, definitionsVersion: 'v1', revenue: { collectedMinor, outstandingMinor, averageTicketMinor: paidInvoiceIds.size ? Math.round(collectedMinor / paidInvoiceIds.size) : 0, byKind: Object.fromEntries(revenueByKind) }, booking: { total: appointments.length, requested: appointments.filter((appointment) => appointment.state === 'REQUESTED').length, completed: completed.length, cancelled: appointments.filter((appointment) => appointment.state === 'CANCELLED').length, noShow: appointments.filter((appointment) => appointment.state === 'NO_SHOW').length, conversionPercent: appointments.length ? Math.round(completed.length / appointments.length * 1000) / 10 : 0 }, clients: { total: owners.length, new: owners.filter((owner) => owner.createdAt >= from).length, returning: returningOwnerIds.size, activePets: pets.length }, consultations: { total: consultations.length, paid: consultations.filter((consultation) => consultation.paymentState === 'CONFIRMED').length, waitingPayment: consultations.filter((consultation) => consultation.paymentState !== 'CONFIRMED').length, answered: consultations.filter((consultation) => consultation.state === 'ANSWERED').length }, hospital: { admitted: hospitalizations.length, active: hospitalizations.filter((hospitalization) => ['ADMITTED', 'IN_TREATMENT', 'DISCHARGE_READY'].includes(hospitalization.state)).length, treatmentDue: treatmentTasks.filter((task) => task.state === 'DUE').length, treatmentCompleted: treatmentTasks.filter((task) => task.state === 'COMPLETED').length }, inventory: { stockValueMinor, lowStockItems: inventoryItems.filter((item) => usableLots.filter((lot) => lot.itemId === item.id).reduce((sum, lot) => sum + lot.quantityMilli, 0) <= item.lowStockThresholdMilli).length, expiringLots: usableLots.filter((lot) => lot.expiryAt && lot.expiryAt <= expiringAt).length }, staff: [...new Set(appointments.filter((appointment) => appointment.staffId !== 'UNASSIGNED').map((appointment) => appointment.staffId))].map((staffId) => ({ staffId, appointments: appointments.filter((appointment) => appointment.staffId === staffId).length, completed: completed.filter((appointment) => appointment.staffId === staffId).length })) }); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/staff/growth/dashboard') {
      const account = await currentStaff(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(account.membership.role)) { json(response, 403, { error: 'GROWTH_ROLE_REQUIRED' }); return; }
      await refreshGrowthStates();
      const [packages, balances, plans, memberships, policy, loyalty, owners, retentionTasks, variants, openInvoices] = await Promise.all([
        db.servicePackage.findMany({ where: { organizationId: config.organizationId }, orderBy: { createdAt: 'desc' } }),
        db.packageBalance.findMany({ where: { organizationId: config.organizationId }, include: { servicePackage: true, usages: true }, orderBy: { purchasedAt: 'desc' }, take: 300 }),
        db.membershipPlan.findMany({ where: { organizationId: config.organizationId }, orderBy: { createdAt: 'desc' } }),
        db.ownerMembership.findMany({ where: { organizationId: config.organizationId }, include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 300 }),
        db.loyaltyPolicy.findFirst({ where: { organizationId: config.organizationId, state: 'ACTIVE' }, orderBy: { version: 'desc' } }),
        db.loyaltyLedgerEntry.groupBy({ by: ['ownerId'], where: { organizationId: config.organizationId }, _sum: { pointsDelta: true } }),
        db.owner.findMany({ where: { organizationId: config.organizationId, accountStatus: 'ACTIVE' }, include: { relations: { include: { pet: true } } }, orderBy: { fullName: 'asc' }, take: 300 }),
        db.operationalTask.findMany({ where: { organizationId: config.organizationId, kind: { in: ['REBOOK', 'VACCINATION', 'PAYMENT', 'MEMBERSHIP_RENEWAL'] }, state: { in: ['OPEN', 'IN_PROGRESS'] } }, orderBy: { dueAt: 'asc' }, take: 300 }),
        db.serviceVariant.findMany({ where: { organizationId: config.organizationId }, include: { service: true }, orderBy: { service: { publicName: 'asc' } } }),
        db.invoice.findMany({ where: { organizationId: config.organizationId, state: { in: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PENDING_PAYMENT_REVIEW'] } }, orderBy: { createdAt: 'desc' }, take: 300 })
      ]);
      const ownerById = new Map(owners.map((owner) => [owner.id, owner])); const pointsByOwner = new Map(loyalty.map((entry) => [entry.ownerId, entry._sum.pointsDelta ?? 0]));
      json(response, 200, { policy, variants: variants.map((variant) => ({ id: variant.id, name: `${variant.service.publicName} · ${variant.name}` })), owners: owners.map((owner) => ({ id: owner.id, fullName: owner.fullName, points: pointsByOwner.get(owner.id) ?? 0, pets: owner.relations.map((relation) => ({ id: relation.pet.id, name: relation.pet.name })) })), openInvoices: openInvoices.map((invoice) => ({ id: invoice.id, ownerId: invoice.ownerId, state: invoice.state, totalMinor: invoice.totalMinor, paidMinor: invoice.paidMinor, availableMinor: Math.max(0, invoice.totalMinor - invoice.paidMinor) })), packages, balances: balances.map((balance) => ({ id: balance.id, ownerId: balance.ownerId, owner: ownerById.get(balance.ownerId)?.fullName ?? 'Владелец', petId: balance.petId, package: balance.servicePackage.name, state: balance.state, initialCredits: balance.initialCredits, remainingCredits: balance.remainingCredits, expiresAt: balance.expiresAt, invoiceId: balance.invoiceId, used: balance.usages.length })), plans, memberships: memberships.map((membership) => ({ id: membership.id, ownerId: membership.ownerId, owner: ownerById.get(membership.ownerId)?.fullName ?? 'Владелец', plan: membership.plan.name, state: membership.state, autoRenew: membership.autoRenew, currentPeriodEnd: membership.currentPeriodEnd, renewsAt: membership.renewsAt, invoiceId: membership.invoiceId })), retentionTasks }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/staff/growth/packages') {
      const account = await currentStaff(request); const key = idempotencyKey(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER'].includes(account.membership.role)) { json(response, 403, { error: 'GROWTH_MANAGER_REQUIRED' }); return; } if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { name?: string; description?: string; credits?: number; priceMinor?: number; validityDays?: number; familyShared?: boolean; serviceIds?: string[]; benefits?: Record<string, unknown> } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const name = String(input.name ?? '').trim(); const credits = Math.round(Number(input.credits ?? 0)); const priceMinor = Math.round(Number(input.priceMinor ?? 0)); const validityDays = Math.round(Number(input.validityDays ?? 365)); const serviceIds = Array.isArray(input.serviceIds) ? [...new Set(input.serviceIds.map(String))].slice(0, 100) : [];
      const foundVariants = await db.serviceVariant.count({ where: { organizationId: config.organizationId, id: { in: serviceIds } } });
      if (name.length < 2 || name.length > 160 || credits < 1 || credits > 1000 || priceMinor < 0 || priceMinor > 100_000_000 || validityDays < 1 || validityDays > 3650 || !serviceIds.length || foundVariants !== serviceIds.length) { json(response, 400, { error: 'INVALID_SERVICE_PACKAGE' }); return; }
      const packageItem = await db.servicePackage.create({ data: { organizationId: config.organizationId, name, description: String(input.description ?? '').trim().slice(0, 2000) || null, credits, priceMinor, validityDays, familyShared: input.familyShared === true, benefits: (input.benefits ?? {}) as Prisma.InputJsonValue, state: 'ACTIVE', serviceIds } });
      await auditCommand({ actorId: account.current.userId, action: 'package.created', aggregateType: 'ServicePackage', aggregateId: packageItem.id, idempotencyKey: key, payload: { credits, priceMinor, validityDays, serviceCount: serviceIds.length } }); json(response, 201, { package: packageItem }); return;
    }
    const staffGrantPackage = url.pathname.match(/^\/api\/v1\/staff\/growth\/packages\/([^/]+)\/grant$/);
    if (request.method === 'POST' && staffGrantPackage) {
      const account = await currentStaff(request); const key = idempotencyKey(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(account.membership.role)) { json(response, 403, { error: 'GROWTH_ROLE_REQUIRED' }); return; } if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      const repeated = await db.packageBalance.findUnique({ where: { idempotencyKey: key }, include: { servicePackage: true } }); if (repeated) { json(response, 200, { balance: repeated }); return; }
      let input: { ownerId?: string; petId?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const [packageItem, owner, relation] = await Promise.all([db.servicePackage.findFirst({ where: { id: decodeURIComponent(staffGrantPackage[1]), organizationId: config.organizationId, state: 'ACTIVE' } }), db.owner.findFirst({ where: { id: String(input.ownerId ?? ''), organizationId: config.organizationId, accountStatus: 'ACTIVE' } }), input.petId ? db.ownerPetRelation.findFirst({ where: { organizationId: config.organizationId, ownerId: String(input.ownerId ?? ''), petId: String(input.petId) } }) : Promise.resolve(null)]);
      if (!packageItem || !owner || (!packageItem.familyShared && !relation)) { json(response, 400, { error: 'INVALID_PACKAGE_RECIPIENT' }); return; }
      const now = new Date(); const result = await db.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({ data: { organizationId: config.organizationId, ownerId: owner.id, state: packageItem.priceMinor > 0 ? 'ISSUED' : 'PAID', totalMinor: packageItem.priceMinor, paidMinor: 0, currency: packageItem.currency, issuedAt: now, lines: { create: { organizationId: config.organizationId, lineType: 'PACKAGE', referenceId: packageItem.id, description: `Пакет «${packageItem.name}» · ${packageItem.credits} посещений`, unitPriceMinor: packageItem.priceMinor, totalMinor: packageItem.priceMinor } } } });
        const active = packageItem.priceMinor === 0; const balance = await tx.packageBalance.create({ data: { organizationId: config.organizationId, ownerId: owner.id, petId: packageItem.familyShared ? null : relation?.petId, packageId: packageItem.id, invoiceId: invoice.id, initialCredits: packageItem.credits, remainingCredits: packageItem.credits, state: active ? 'ACTIVE' : 'PENDING_PAYMENT', activatedAt: active ? now : null, expiresAt: active ? new Date(now.valueOf() + packageItem.validityDays * 86400000) : null, idempotencyKey: key } }); return { invoice, balance };
      });
      await auditCommand({ actorId: account.current.userId, action: 'package.granted', aggregateType: 'PackageBalance', aggregateId: result.balance.id, idempotencyKey: key, payload: { ownerId: owner.id, petId: result.balance.petId, invoiceId: result.invoice.id, state: result.balance.state } }); json(response, 201, result); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/staff/growth/membership-plans') {
      const account = await currentStaff(request); const key = idempotencyKey(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER'].includes(account.membership.role)) { json(response, 403, { error: 'GROWTH_MANAGER_REQUIRED' }); return; } if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { name?: string; description?: string; priceMinor?: number; billingPeriodDays?: number; benefits?: Record<string, unknown>; serviceLimits?: Record<string, unknown> } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const name = String(input.name ?? '').trim(); const priceMinor = Math.round(Number(input.priceMinor ?? 0)); const billingPeriodDays = Math.round(Number(input.billingPeriodDays ?? 30)); if (name.length < 2 || name.length > 160 || priceMinor < 0 || priceMinor > 100_000_000 || billingPeriodDays < 7 || billingPeriodDays > 365) { json(response, 400, { error: 'INVALID_MEMBERSHIP_PLAN' }); return; }
      const plan = await db.membershipPlan.create({ data: { organizationId: config.organizationId, name, description: String(input.description ?? '').trim().slice(0, 2000) || null, priceMinor, billingPeriodDays, benefits: (input.benefits ?? {}) as Prisma.InputJsonValue, serviceLimits: (input.serviceLimits ?? {}) as Prisma.InputJsonValue } });
      await auditCommand({ actorId: account.current.userId, action: 'membership_plan.created', aggregateType: 'MembershipPlan', aggregateId: plan.id, idempotencyKey: key, payload: { priceMinor, billingPeriodDays } }); json(response, 201, { plan }); return;
    }
    const staffEnrollMembership = url.pathname.match(/^\/api\/v1\/staff\/growth\/membership-plans\/([^/]+)\/enroll$/);
    if (request.method === 'POST' && staffEnrollMembership) {
      const account = await currentStaff(request); const key = idempotencyKey(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(account.membership.role)) { json(response, 403, { error: 'GROWTH_ROLE_REQUIRED' }); return; } if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      const repeated = await db.ownerMembership.findUnique({ where: { idempotencyKey: key }, include: { plan: true } }); if (repeated) { json(response, 200, { membership: repeated }); return; }
      let input: { ownerId?: string; autoRenew?: boolean } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const [plan, owner, existing] = await Promise.all([db.membershipPlan.findFirst({ where: { id: decodeURIComponent(staffEnrollMembership[1]), organizationId: config.organizationId, state: 'ACTIVE' } }), db.owner.findFirst({ where: { id: String(input.ownerId ?? ''), organizationId: config.organizationId, accountStatus: 'ACTIVE' } }), db.ownerMembership.findFirst({ where: { organizationId: config.organizationId, ownerId: String(input.ownerId ?? ''), state: { in: ['PENDING_PAYMENT', 'ACTIVE', 'PAUSED'] } } })]);
      if (!plan || !owner || existing) { json(response, 409, { error: existing ? 'ACTIVE_MEMBERSHIP_EXISTS' : 'INVALID_MEMBERSHIP_RECIPIENT' }); return; }
      const now = new Date(); const result = await db.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({ data: { organizationId: config.organizationId, ownerId: owner.id, state: plan.priceMinor > 0 ? 'ISSUED' : 'PAID', totalMinor: plan.priceMinor, paidMinor: 0, currency: plan.currency, issuedAt: now, lines: { create: { organizationId: config.organizationId, lineType: 'MEMBERSHIP', referenceId: plan.id, description: `Membership «${plan.name}» · ${plan.billingPeriodDays} дней`, unitPriceMinor: plan.priceMinor, totalMinor: plan.priceMinor } } } });
        const active = plan.priceMinor === 0; const periodEnd = active ? new Date(now.valueOf() + plan.billingPeriodDays * 86400000) : null; const membership = await tx.ownerMembership.create({ data: { organizationId: config.organizationId, ownerId: owner.id, planId: plan.id, invoiceId: invoice.id, state: active ? 'ACTIVE' : 'PENDING_PAYMENT', autoRenew: input.autoRenew === true, startedAt: active ? now : null, currentPeriodStart: active ? now : null, currentPeriodEnd: periodEnd, renewsAt: periodEnd, idempotencyKey: key } }); return { invoice, membership };
      });
      await auditCommand({ actorId: account.current.userId, action: 'membership.enrolled', aggregateType: 'OwnerMembership', aggregateId: result.membership.id, idempotencyKey: key, payload: { ownerId: owner.id, planId: plan.id, invoiceId: result.invoice.id, state: result.membership.state } }); json(response, 201, result); return;
    }
    const staffMembershipAction = url.pathname.match(/^\/api\/v1\/staff\/growth\/memberships\/([^/]+)$/);
    if (request.method === 'PATCH' && staffMembershipAction) {
      const account = await currentStaff(request); const key = idempotencyKey(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER'].includes(account.membership.role)) { json(response, 403, { error: 'GROWTH_MANAGER_REQUIRED' }); return; } if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { action?: string; autoRenew?: boolean } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; } const action = String(input.action ?? '').toUpperCase();
      const membership = await db.ownerMembership.findFirst({ where: { id: decodeURIComponent(staffMembershipAction[1]), organizationId: config.organizationId }, include: { plan: true } }); if (!membership) { json(response, 404, { error: 'NOT_FOUND' }); return; }
      if (action === 'RENEW' && membership.state === 'ACTIVE') {
        const priorInvoice = membership.invoiceId ? await db.invoice.findFirst({ where: { id: membership.invoiceId, organizationId: config.organizationId } }) : null;
        if (priorInvoice && !['PAID', 'VOID', 'REFUNDED'].includes(priorInvoice.state)) { json(response, 409, { error: 'MEMBERSHIP_RENEWAL_ALREADY_PENDING' }); return; }
        const now = new Date(); const result = await db.$transaction(async (tx) => {
          const invoice = await tx.invoice.create({ data: { organizationId: config.organizationId, ownerId: membership.ownerId, state: membership.plan.priceMinor > 0 ? 'ISSUED' : 'PAID', totalMinor: membership.plan.priceMinor, paidMinor: 0, currency: membership.plan.currency, issuedAt: now, lines: { create: { organizationId: config.organizationId, lineType: 'MEMBERSHIP', referenceId: membership.plan.id, description: `Продление membership «${membership.plan.name}» · ${membership.plan.billingPeriodDays} дней`, unitPriceMinor: membership.plan.priceMinor, totalMinor: membership.plan.priceMinor } } } });
          let updated = await tx.ownerMembership.update({ where: { id: membership.id }, data: { invoiceId: invoice.id, autoRenew: input.autoRenew ?? membership.autoRenew } });
          if (membership.plan.priceMinor === 0) { const periodStart = membership.currentPeriodEnd && membership.currentPeriodEnd > now ? membership.currentPeriodEnd : now; const periodEnd = new Date(periodStart.valueOf() + membership.plan.billingPeriodDays * 86400000); updated = await tx.ownerMembership.update({ where: { id: membership.id }, data: { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, renewsAt: periodEnd } }); }
          return { invoice, membership: updated };
        });
        await auditCommand({ actorId: account.current.userId, action: 'membership.renewal_issued', aggregateType: 'OwnerMembership', aggregateId: membership.id, idempotencyKey: key, payload: { invoiceId: result.invoice.id, totalMinor: result.invoice.totalMinor } }); json(response, 200, result); return;
      }
      let data: Prisma.OwnerMembershipUpdateInput;
      if (action === 'PAUSE' && membership.state === 'ACTIVE') data = { state: 'PAUSED', pausedAt: new Date(), autoRenew: false }; else if (action === 'RESUME' && membership.state === 'PAUSED') { const now = new Date(); const periodEnd = new Date(now.valueOf() + membership.plan.billingPeriodDays * 86400000); data = { state: 'ACTIVE', pausedAt: null, currentPeriodStart: now, currentPeriodEnd: periodEnd, renewsAt: periodEnd, autoRenew: input.autoRenew === true }; } else if (action === 'CANCEL' && ['ACTIVE', 'PAUSED', 'PENDING_PAYMENT'].includes(membership.state)) data = { state: 'CANCELLED', cancelledAt: new Date(), autoRenew: false }; else { json(response, 409, { error: 'INVALID_MEMBERSHIP_TRANSITION' }); return; }
      const updated = await db.ownerMembership.update({ where: { id: membership.id }, data }); await auditCommand({ actorId: account.current.userId, action: `membership.${action.toLowerCase()}`, aggregateType: 'OwnerMembership', aggregateId: membership.id, idempotencyKey: key }); json(response, 200, { membership: updated }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/staff/growth/loyalty-adjustments') {
      const account = await currentStaff(request); const key = idempotencyKey(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER'].includes(account.membership.role)) { json(response, 403, { error: 'GROWTH_MANAGER_REQUIRED' }); return; } if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      const repeated = await db.loyaltyLedgerEntry.findUnique({ where: { idempotencyKey: key } }); if (repeated) { json(response, 200, { entry: repeated }); return; }
      let input: { ownerId?: string; pointsDelta?: number; reason?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; } const pointsDelta = Math.round(Number(input.pointsDelta ?? 0)); const reason = String(input.reason ?? '').trim(); const owner = await db.owner.findFirst({ where: { id: String(input.ownerId ?? ''), organizationId: config.organizationId } }); const aggregate = owner ? await db.loyaltyLedgerEntry.aggregate({ where: { organizationId: config.organizationId, ownerId: owner.id }, _sum: { pointsDelta: true } }) : null; const balance = aggregate?._sum.pointsDelta ?? 0;
      if (!owner || !pointsDelta || Math.abs(pointsDelta) > 1_000_000 || balance + pointsDelta < 0 || reason.length < 3 || reason.length > 500) { json(response, 400, { error: 'INVALID_LOYALTY_ADJUSTMENT' }); return; }
      const entry = await db.loyaltyLedgerEntry.create({ data: { organizationId: config.organizationId, ownerId: owner.id, pointsDelta, balanceAfter: balance + pointsDelta, reason, referenceType: 'MANUAL_ADJUSTMENT', referenceId: account.current.userId, idempotencyKey: key } }); await auditCommand({ actorId: account.current.userId, action: 'loyalty.adjusted', aggregateType: 'LoyaltyLedgerEntry', aggregateId: entry.id, idempotencyKey: key, payload: { ownerId: owner.id, pointsDelta, balanceAfter: entry.balanceAfter } }); json(response, 201, { entry }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/staff/growth/loyalty-redemptions') {
      const account = await currentStaff(request); const key = idempotencyKey(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(account.membership.role)) { json(response, 403, { error: 'GROWTH_ROLE_REQUIRED' }); return; } if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      const repeated = await db.loyaltyLedgerEntry.findUnique({ where: { idempotencyKey: key } }); if (repeated) { json(response, 200, { entry: repeated }); return; }
      let input: { ownerId?: string; invoiceId?: string; points?: number } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const points = Math.round(Number(input.points ?? 0)); const [owner, invoice, policy] = await Promise.all([db.owner.findFirst({ where: { id: String(input.ownerId ?? ''), organizationId: config.organizationId } }), db.invoice.findFirst({ where: { id: String(input.invoiceId ?? ''), organizationId: config.organizationId }, include: { lines: true } }), db.loyaltyPolicy.findFirst({ where: { organizationId: config.organizationId, state: 'ACTIVE' }, orderBy: { version: 'desc' } })]);
      const discountMinor = policy ? points * policy.rublesPerPoint * 100 : 0; const invoiceBalance = invoice ? invoice.totalMinor - invoice.paidMinor : 0;
      if (!owner || !invoice || invoice.ownerId !== owner.id || !policy || points < 1 || discountMinor < 1 || discountMinor > invoiceBalance || !['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PENDING_PAYMENT_REVIEW'].includes(invoice.state)) { json(response, 409, { error: 'LOYALTY_REDEMPTION_NOT_AVAILABLE' }); return; }
      let result: { entry: Awaited<ReturnType<Prisma.TransactionClient['loyaltyLedgerEntry']['create']>>; invoice: Awaited<ReturnType<Prisma.TransactionClient['invoice']['update']>>; discountMinor: number } | null = null;
      try {
        result = await db.$transaction(async (tx) => {
          const aggregate = await tx.loyaltyLedgerEntry.aggregate({ where: { organizationId: config.organizationId, ownerId: owner.id }, _sum: { pointsDelta: true } }); const availablePoints = aggregate._sum.pointsDelta ?? 0;
          if (points > availablePoints) throw new Error('LOYALTY_BALANCE_CHANGED_RETRY');
          const entry = await tx.loyaltyLedgerEntry.create({ data: { organizationId: config.organizationId, ownerId: owner.id, pointsDelta: -points, balanceAfter: availablePoints - points, reason: `Скидка по программе заботы на счёт ${invoice.id.slice(0, 8)}`, referenceType: 'INVOICE_REDEMPTION', referenceId: invoice.id, idempotencyKey: key } });
          await tx.invoiceLine.create({ data: { organizationId: config.organizationId, invoiceId: invoice.id, lineType: 'LOYALTY', referenceId: entry.id, description: `Баллы программы заботы · ${points}`, quantityMilli: 1000, unitPriceMinor: -discountMinor, totalMinor: -discountMinor, idempotencyKey: `loyalty-line:${key}` } });
          const totalMinor = invoice.totalMinor - discountMinor; const state = totalMinor <= invoice.paidMinor ? 'PAID' : invoiceState(totalMinor, invoice.paidMinor, invoice.state !== 'DRAFT'); const updatedInvoice = await tx.invoice.update({ where: { id: invoice.id }, data: { totalMinor, state } });
          if (updatedInvoice.state === 'PAID') await settleGrowthBenefits(tx, updatedInvoice, { id: `loyalty:${entry.id}`, amountMinor: 0 }, new Date());
          return { entry, invoice: updatedInvoice, discountMinor };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) { if ((error as Error).message === 'LOYALTY_BALANCE_CHANGED_RETRY' || (error as { code?: string }).code === 'P2034') { json(response, 409, { error: 'LOYALTY_BALANCE_CHANGED_RETRY' }); return; } throw error; }
      await auditCommand({ actorId: account.current.userId, action: 'loyalty.redeemed', aggregateType: 'Invoice', aggregateId: invoice.id, idempotencyKey: key, payload: { ownerId: owner.id, points, discountMinor } }); json(response, 201, result); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/staff/growth/run-retention') {
      const account = await currentStaff(request); const key = idempotencyKey(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER'].includes(account.membership.role)) { json(response, 403, { error: 'GROWTH_MANAGER_REQUIRED' }); return; } if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      const now = new Date(); const month = now.toISOString().slice(0, 7); const lapsedBefore = new Date(now.valueOf() - 180 * 86400000); const dueSoon = new Date(now.valueOf() + 30 * 86400000);
      const [owners, appointments, pets, groomingTasks, renewals] = await Promise.all([db.owner.findMany({ where: { organizationId: config.organizationId, accountStatus: 'ACTIVE' }, include: { relations: true } }), db.appointment.findMany({ where: { organizationId: config.organizationId, state: 'COMPLETED' }, orderBy: { startsAt: 'desc' }, take: 10000 }), db.pet.findMany({ where: { organizationId: config.organizationId, lifecycle: 'ACTIVE', vaccinationDueAt: { lte: dueSoon } } }), db.carePlanTask.findMany({ where: { organizationId: config.organizationId, category: 'GROOMING_REBOOK', state: 'OPEN', dueAt: { lte: dueSoon } }, include: { carePlan: true } }), db.ownerMembership.findMany({ where: { organizationId: config.organizationId, state: 'ACTIVE', renewsAt: { lte: dueSoon } } })]);
      const candidates: { ownerId: string; petId?: string; kind: string; title: string; dueAt: Date; details: string; token: string }[] = [];
      for (const owner of owners) { const ownerVisits = appointments.filter((appointment) => appointment.ownerId === owner.id); if (ownerVisits.length && ownerVisits[0].startsAt < lapsedBefore) candidates.push({ ownerId: owner.id, kind: 'REBOOK', title: 'Мягко уточнить, нужна ли помощь VetSvet', dueAt: now, details: 'Клиент давно не был. Сначала проверить актуальность и предпочтительный канал; не отправлять маркетинг без согласия.', token: `lapsed:${owner.id}:${month}` }); }
      for (const pet of pets) { const relation = owners.flatMap((owner) => owner.relations.map((item) => ({ owner, item }))).find(({ item }) => item.petId === pet.id); if (relation) candidates.push({ ownerId: relation.owner.id, petId: pet.id, kind: 'VACCINATION', title: `Проверить профилактику для ${pet.name}`, dueAt: pet.vaccinationDueAt ?? now, details: 'Проверить медицинскую карту до контакта. Это внутренняя задача, не автоматическая рассылка.', token: `vaccine:${pet.id}:${month}` }); }
      for (const task of groomingTasks) candidates.push({ ownerId: task.carePlan.ownerId, petId: task.carePlan.petId, kind: 'REBOOK', title: task.title, dueAt: task.dueAt ?? now, details: 'Предложить повтор только после проверки истории ухода и настроек коммуникации.', token: `grooming:${task.id}` });
      for (const membership of renewals) candidates.push({ ownerId: membership.ownerId, kind: 'MEMBERSHIP_RENEWAL', title: 'Проверить продление membership', dueAt: membership.renewsAt ?? now, details: membership.autoRenew ? 'Подготовить счёт на новый период; оплату не списывать автоматически.' : 'Уточнить желание продлить без давления.', token: `membership:${membership.id}:${month}` });
      let created = 0; for (const candidate of candidates) { const idempotencyKey = `retention:${candidate.token}`; const existing = await db.operationalTask.findUnique({ where: { idempotencyKey } }); if (!existing) { await db.operationalTask.create({ data: { organizationId: config.organizationId, ownerId: candidate.ownerId, petId: candidate.petId, title: candidate.title, kind: candidate.kind, priority: candidate.kind === 'VACCINATION' ? 'HIGH' : 'NORMAL', state: 'OPEN', assigneeId: account.current.userId, dueAt: candidate.dueAt, details: candidate.details, relatedType: candidate.petId ? 'PET' : 'OWNER', relatedId: candidate.petId ?? candidate.ownerId, idempotencyKey } }); created += 1; } }
      await auditCommand({ actorId: account.current.userId, action: 'retention.scan_completed', aggregateType: 'Organization', aggregateId: config.organizationId, idempotencyKey: key, payload: { candidates: candidates.length, created } }); json(response, 200, { candidates: candidates.length, created }); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/staff/search') {
      const account = await currentStaff(request); if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      const query = String(url.searchParams.get('q') ?? '').trim(); if (query.length < 2 || query.length > 100) { json(response, 400, { error: 'SEARCH_QUERY_REQUIRED' }); return; }
      const [owners, pets, items] = await Promise.all([
        db.owner.findMany({ where: { organizationId: config.organizationId, OR: [{ fullName: { contains: query, mode: 'insensitive' } }, { phone: { contains: query } }, { email: { contains: query, mode: 'insensitive' } }] }, take: 12 }),
        db.pet.findMany({ where: { organizationId: config.organizationId, OR: [{ name: { contains: query, mode: 'insensitive' } }, { microchip: { contains: query } }, { passportId: { contains: query } }] }, take: 12 }),
        db.inventoryItem.findMany({ where: { organizationId: config.organizationId, OR: [{ name: { contains: query, mode: 'insensitive' } }, { sku: { contains: query, mode: 'insensitive' } }, { barcode: { contains: query } }] }, take: 12 })
      ]);
      json(response, 200, { results: [...owners.map((owner) => ({ type: 'OWNER', id: owner.id, title: owner.fullName, subtitle: owner.phone ?? owner.email ?? 'Владелец' })), ...pets.map((pet) => ({ type: 'PET', id: pet.id, title: pet.name, subtitle: [pet.species, pet.breed, pet.microchip].filter(Boolean).join(' · ') })), ...items.map((item) => ({ type: 'INVENTORY', id: item.id, title: item.name, subtitle: `${item.sku} · ${item.unit}` }))] }); return;
    }
    const staffAppointment = url.pathname.match(/^\/api\/v1\/staff\/appointments\/([^/]+)$/);
    if (request.method === 'PATCH' && staffAppointment) {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { action?: string; note?: string; startsAt?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const appointment = await db.appointment.findFirst({ where: { id: decodeURIComponent(staffAppointment[1]), organizationId: config.organizationId } });
      if (!appointment) { json(response, 404, { error: 'NOT_FOUND' }); return; }
      const action = String(input.action ?? '').toUpperCase();
      if (action === 'CONFIRM') {
        if (appointment.state !== 'REQUESTED') { json(response, 409, { error: 'INVALID_APPOINTMENT_STATE' }); return; }
        const consultation = await db.consultation.findUnique({ where: { appointmentId: appointment.id } });
        if (consultation && consultation.paymentState !== 'CONFIRMED') { json(response, 409, { error: 'CONSULTATION_PAYMENT_REQUIRED' }); return; }
        const unsignedDocument = await db.generatedDocument.findFirst({ where: { organizationId: config.organizationId, appointmentId: appointment.id, state: 'AWAITING_SIGNATURE' } });
        if (unsignedDocument) { json(response, 409, { error: 'OWNER_SIGNATURE_REQUIRED' }); return; }
        const overlap = await db.appointment.findFirst({ where: { organizationId: config.organizationId, staffId: account.current.userId, state: { in: ['CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'READY'] }, startsAt: { lt: appointment.endsAt }, endsAt: { gt: appointment.startsAt } } });
        if (overlap) { json(response, 409, { error: 'STAFF_TIME_CONFLICT' }); return; }
        const updated = await db.appointment.update({ where: { id: appointment.id }, data: { state: 'CONFIRMED', staffId: account.current.userId } });
        if (consultation) await db.consultation.update({ where: { id: consultation.id }, data: { state: 'CONFIRMED', staffId: account.current.userId } });
        await ensureBookingReminders(updated.id, updated.ownerId, updated.startsAt);
        await auditCommand({ actorId: account.current.userId, action: 'appointment.confirmed', aggregateType: 'Appointment', aggregateId: appointment.id, idempotencyKey: key });
        json(response, 200, { appointment: { id: updated.id, state: updated.state, staffId: updated.staffId } }); return;
      }
      if (action === 'CANCEL') {
        if (!['REQUESTED', 'CONFIRMED'].includes(appointment.state)) { json(response, 409, { error: 'INVALID_APPOINTMENT_STATE' }); return; }
        const linkedConsultation = await db.consultation.findUnique({ where: { appointmentId: appointment.id } });
        const updated = await db.$transaction(async (tx) => {
          const cancelled = await tx.appointment.update({ where: { id: appointment.id }, data: { state: 'CANCELLED', cancelledAt: new Date(), cancellationReason: String(input.note ?? 'Отменено командой').trim().slice(0, 500) } });
          if (linkedConsultation) await tx.consultation.update({ where: { id: linkedConsultation.id }, data: { state: 'CANCELLED' } });
          return cancelled;
        });
        await cancelBookingReminders(appointment.id); await offerReleasedSlot(appointment);
        await auditCommand({ actorId: account.current.userId, action: 'appointment.cancelled', aggregateType: 'Appointment', aggregateId: appointment.id, idempotencyKey: key, payload: { note: String(input.note ?? '').trim().slice(0, 500) } });
        json(response, 200, { appointment: { id: updated.id, state: updated.state } }); return;
      }
      if (action === 'RESCHEDULE') {
        if (!canRescheduleBooking(appointment.state, appointment.startsAt)) { json(response, 409, { error: 'APPOINTMENT_NOT_RESCHEDULABLE' }); return; }
        const startsAt = new Date(String(input.startsAt ?? '')); const variant = await db.serviceVariant.findFirst({ where: { id: appointment.variantId, organizationId: config.organizationId }, include: { service: true } });
        if (!variant || Number.isNaN(startsAt.valueOf()) || startsAt <= new Date()) { json(response, 400, { error: 'INVALID_RESCHEDULE_REQUEST' }); return; }
        const endsAt = new Date(startsAt.valueOf() + variant.durationMinutes * 60_000); const available = await bookingAvailability(variant.id, appointment.locationId, dateKeyInMoscow(startsAt));
        if (!available?.slots.some((slot) => new Date(slot.startsAt).valueOf() === startsAt.valueOf())) { json(response, 409, { error: 'BOOKING_SLOT_UNAVAILABLE' }); return; }
        try {
          const updated = await db.$transaction(async (tx) => { await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${config.organizationId}:${appointment.locationId}:${variant.service.kind}:${dateKeyInMoscow(startsAt)}`}))`; const locked = await bookingAvailability(variant.id, appointment.locationId, dateKeyInMoscow(startsAt)); if (!locked?.slots.some((slot) => new Date(slot.startsAt).valueOf() === startsAt.valueOf())) throw new Error('BOOKING_SLOT_UNAVAILABLE'); return tx.appointment.update({ where: { id: appointment.id }, data: { previousStartsAt: appointment.startsAt, previousEndsAt: appointment.endsAt, startsAt, endsAt, state: 'REQUESTED', staffId: 'UNASSIGNED', rescheduledAt: new Date(), rescheduleCount: { increment: 1 } } }); });
          await ensureBookingReminders(updated.id, updated.ownerId, updated.startsAt); await offerReleasedSlot(appointment);
          await auditCommand({ actorId: account.current.userId, action: 'appointment.rescheduled_by_staff', aggregateType: 'Appointment', aggregateId: appointment.id, idempotencyKey: key, payload: { from: appointment.startsAt.toISOString(), to: startsAt.toISOString() } }); json(response, 200, { appointment: updated }); return;
        } catch { json(response, 409, { error: 'BOOKING_SLOT_UNAVAILABLE' }); return; }
      }
      if (action === 'NO_SHOW') {
        if (!canMarkNoShow(appointment.state, appointment.startsAt)) { json(response, 409, { error: 'APPOINTMENT_NOT_NO_SHOW_ELIGIBLE' }); return; }
        const updated = await db.appointment.update({ where: { id: appointment.id }, data: { state: 'NO_SHOW', noShowAt: new Date() } }); await cancelBookingReminders(appointment.id);
        await auditCommand({ actorId: account.current.userId, action: 'appointment.no_show', aggregateType: 'Appointment', aggregateId: appointment.id, idempotencyKey: key, payload: { note: String(input.note ?? '').trim().slice(0, 500) } }); json(response, 200, { appointment: { id: updated.id, state: updated.state } }); return;
      }
      const transitions: Record<string, string[]> = { CHECK_IN: ['CONFIRMED'], START: ['CHECKED_IN'], READY: ['IN_SERVICE'], COMPLETE: ['READY'] };
      if (action in transitions) {
        if (appointment.staffId !== account.current.userId && account.membership.role !== 'ADMIN') { json(response, 403, { error: 'ASSIGNED_STAFF_REQUIRED' }); return; }
        if (!transitions[action].includes(appointment.state)) { json(response, 409, { error: 'INVALID_APPOINTMENT_STATE' }); return; }
        const states: Record<string, string> = { CHECK_IN: 'CHECKED_IN', START: 'IN_SERVICE', READY: 'READY', COMPLETE: 'COMPLETED' };
        const journey: Record<string, { stage: string; message: string }> = {
          CHECK_IN: { stage: 'ACCEPTED', message: 'Питомец принят командой VetSvet.' },
          START: { stage: 'STARTED', message: 'Специалист начал работу. Всё важное фиксируется в карте.' },
          READY: { stage: 'READY_FOR_PICKUP', message: 'Работа завершена — питомца можно забирать.' },
          COMPLETE: { stage: 'NEXT_STEP', message: 'Визит завершён. Следующий шаг сохранён в плане заботы.' }
        };
        const updated = await db.$transaction(async (tx) => {
          const item = await tx.appointment.update({ where: { id: appointment.id }, data: { state: states[action] } });
          await recordAppointmentStage(tx, config.organizationId, { appointmentId: appointment.id, petId: appointment.petId, stage: journey[action].stage, message: journey[action].message, actorId: account.current.userId, idempotencyKey: `appointment-stage:${appointment.id}:${journey[action].stage}` });
          return item;
        });
        await auditCommand({ actorId: account.current.userId, action: `appointment.${states[action].toLowerCase()}`, aggregateType: 'Appointment', aggregateId: appointment.id, idempotencyKey: key });
        json(response, 200, { appointment: { id: updated.id, state: updated.state } }); return;
      }
      json(response, 400, { error: 'UNKNOWN_APPOINTMENT_ACTION' }); return;
    }
    const staffConsultation = url.pathname.match(/^\/api\/v1\/staff\/consultations\/([^/]+)$/);
    if (request.method === 'PATCH' && staffConsultation) {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'VETERINARIAN'].includes(account.membership.role)) { json(response, 403, { error: 'CLINICAL_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { response?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const consultation = await db.consultation.findFirst({ where: { id: decodeURIComponent(staffConsultation[1]), organizationId: config.organizationId } });
      if (!consultation || consultation.state !== 'CONFIRMED' || consultation.paymentState !== 'CONFIRMED') { json(response, 409, { error: 'CONSULTATION_NOT_READY' }); return; }
      if (consultation.staffId !== account.current.userId && account.membership.role !== 'ADMIN') { json(response, 403, { error: 'ASSIGNED_STAFF_REQUIRED' }); return; }
      const appointment = await db.appointment.findFirst({ where: { id: consultation.appointmentId, organizationId: config.organizationId, state: 'IN_SERVICE' } });
      if (!appointment) { json(response, 409, { error: 'CONSULTATION_VISIT_NOT_STARTED' }); return; }
      const answer = String(input.response ?? '').trim();
      if (answer.length < 20 || answer.length > 6000) { json(response, 400, { error: 'CONSULTATION_RESPONSE_REQUIRED' }); return; }
      const result = await db.$transaction(async (tx) => {
        const completed = await tx.consultation.update({ where: { id: consultation.id }, data: { state: 'COMPLETED', response: answer, respondedAt: new Date() } });
        await tx.appointment.update({ where: { id: consultation.appointmentId }, data: { state: 'READY' } });
        await rememberPetEvent(tx, config.organizationId, { petId: appointment.petId, type: 'RECOMMENDATION', title: 'Ответ по консультации', summary: answer, sourceType: 'CONSULTATION', sourceId: consultation.id, facts: { question: consultation.question }, occurredAt: new Date(), verifiedBy: account.current.userId });
        await recordAppointmentStage(tx, config.organizationId, { appointmentId: appointment.id, petId: appointment.petId, stage: 'RECOMMENDATIONS_READY', message: 'Специалист подготовил ответ и рекомендации.', actorId: account.current.userId, idempotencyKey: `appointment-stage:${appointment.id}:RECOMMENDATIONS_READY` });
        return completed;
      });
      await auditCommand({ actorId: account.current.userId, action: 'consultation.completed', aggregateType: 'Consultation', aggregateId: result.id, idempotencyKey: key, payload: { appointmentId: result.appointmentId } });
      if (result.telegramChatId) await say(result.telegramChatId, 'Ответ по консультации готов и сохранён в личном кабинете VetSvet. Если состояние питомца ухудшается, не ждите сообщения — обратитесь за срочной помощью.');
      json(response, 200, { consultation: { id: result.id, state: result.state, response: result.response, respondedAt: result.respondedAt } }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/staff/clinical/encounters') {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'VETERINARIAN'].includes(account.membership.role)) { json(response, 403, { error: 'CLINICAL_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { appointmentId?: string; reason?: string; subjective?: string; objective?: string; assessment?: string; plan?: string; prescriptions?: { medicationName?: string; instructions?: string; durationDays?: number; reactions?: string[] }[]; followUpAt?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const appointment = await db.appointment.findFirst({ where: { id: String(input.appointmentId ?? ''), organizationId: config.organizationId } });
      if (!appointment || appointment.state !== 'IN_SERVICE') { json(response, 409, { error: 'CLINICAL_VISIT_NOT_READY' }); return; }
      if (appointment.staffId !== account.current.userId && account.membership.role !== 'ADMIN') { json(response, 403, { error: 'ASSIGNED_STAFF_REQUIRED' }); return; }
      const variant = await db.serviceVariant.findFirst({ where: { id: appointment.variantId, organizationId: config.organizationId }, include: { service: true } });
      if (!variant || variant.service.kind !== 'VETERINARY') { json(response, 400, { error: 'VETERINARY_APPOINTMENT_REQUIRED' }); return; }
      if (await db.encounter.findUnique({ where: { appointmentId: appointment.id } })) { json(response, 409, { error: 'ENCOUNTER_ALREADY_FINALIZED' }); return; }
      const clean = (value: unknown, limit = 4000) => String(value ?? '').trim().slice(0, limit);
      const reason = clean(input.reason, 500); const subjective = clean(input.subjective); const objective = clean(input.objective); const assessment = clean(input.assessment); const planText = clean(input.plan);
      if (reason.length < 3 || assessment.length < 10 || planText.length < 10) { json(response, 400, { error: 'CLINICAL_SUMMARY_REQUIRED' }); return; }
      const prescriptions = Array.isArray(input.prescriptions) ? input.prescriptions.map((item) => ({ medicationName: clean(item.medicationName, 240), instructions: clean(item.instructions, 1000), durationDays: Math.max(0, Math.min(365, Math.trunc(Number(item.durationDays ?? 0)))), reactions: Array.isArray(item.reactions) ? item.reactions.map((reaction) => clean(reaction, 300)).filter(Boolean).slice(0, 20) : [] })).filter((item) => item.medicationName && item.instructions).slice(0, 20) : [];
      const followUpAt = input.followUpAt ? new Date(input.followUpAt) : undefined;
      const existingCase = await db.clinicalCase.findFirst({ where: { organizationId: config.organizationId, ownerId: appointment.ownerId, petId: appointment.petId, status: 'OPEN' }, orderBy: { openedAt: 'desc' }, include: { encounters: { orderBy: { version: 'desc' }, take: 1 } } });
      const result = await db.$transaction(async (tx) => {
        const clinicalCase = existingCase ?? await tx.clinicalCase.create({ data: { organizationId: config.organizationId, ownerId: appointment.ownerId, petId: appointment.petId, status: 'OPEN', reason } });
        const version = (existingCase?.encounters[0]?.version ?? 0) + 1;
        const encounter = await tx.encounter.create({ data: { organizationId: config.organizationId, caseId: clinicalCase.id, appointmentId: appointment.id, petId: appointment.petId, version, state: 'FINALIZED', subjective: subjective || null, objective: objective || null, assessment, plan: planText, clinicianId: account.current.userId, finalizedAt: new Date(), prescriptions: { create: prescriptions.map((item) => ({ organizationId: config.organizationId, medicationName: item.medicationName, instructions: item.instructions, state: 'ACTIVE', prescriberId: account.current.userId, endsAt: item.durationDays ? new Date(Date.now() + item.durationDays * 86400000) : null, reactions: item.reactions })) } }, include: { prescriptions: true } });
        await tx.appointment.update({ where: { id: appointment.id }, data: { state: 'READY' } });
        if (followUpAt && !Number.isNaN(followUpAt.valueOf()) && followUpAt > new Date()) {
          const carePlan = await tx.carePlan.findFirst({ where: { organizationId: config.organizationId, ownerId: appointment.ownerId, petId: appointment.petId, state: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }) ?? await tx.carePlan.create({ data: { organizationId: config.organizationId, ownerId: appointment.ownerId, petId: appointment.petId, title: 'План лечения и наблюдения', state: 'ACTIVE' } });
          await tx.carePlanTask.create({ data: { carePlanId: carePlan.id, organizationId: config.organizationId, title: 'Контрольный приём', category: 'CLINICAL_FOLLOW_UP', dueAt: followUpAt, state: 'OPEN' } });
        }
        const assessmentNode = await rememberPetEvent(tx, config.organizationId, { petId: appointment.petId, type: 'ASSESSMENT', title: reason, summary: assessment, sourceType: 'ENCOUNTER', sourceId: encounter.id, facts: { objective }, occurredAt: encounter.finalizedAt ?? new Date(), verifiedBy: account.current.userId });
        const planNode = await rememberPetEvent(tx, config.organizationId, { petId: appointment.petId, type: 'RECOMMENDATION', title: 'План после приёма', summary: planText, sourceType: 'ENCOUNTER', sourceId: encounter.id, facts: { followUpAt: followUpAt?.toISOString() }, occurredAt: encounter.finalizedAt ?? new Date(), verifiedBy: account.current.userId });
        await linkPetMemories(tx, config.organizationId, { petId: appointment.petId, fromNodeId: assessmentNode.id, toNodeId: planNode.id, relation: 'LEADS_TO', explanation: 'Клиническая оценка врача объясняет следующий план действий.' });
        if (subjective) {
          const symptomNode = await rememberPetEvent(tx, config.organizationId, { petId: appointment.petId, type: 'SYMPTOM', title: 'Что заметил владелец', summary: subjective, sourceType: 'ENCOUNTER', sourceId: encounter.id, occurredAt: encounter.finalizedAt ?? new Date(), verifiedBy: account.current.userId });
          await linkPetMemories(tx, config.organizationId, { petId: appointment.petId, fromNodeId: symptomNode.id, toNodeId: assessmentNode.id, relation: 'ASSESSED_AS', explanation: 'Врач сопоставил жалобы владельца с клинической оценкой.' });
        }
        for (const prescription of encounter.prescriptions) {
          const medicationNode = await rememberPetEvent(tx, config.organizationId, { petId: appointment.petId, type: 'MEDICATION', title: prescription.medicationName, summary: prescription.instructions, sourceType: 'PRESCRIPTION', sourceId: prescription.id, facts: { startsAt: prescription.startsAt.toISOString(), endsAt: prescription.endsAt?.toISOString(), reactions: prescription.reactions }, occurredAt: prescription.startsAt, verifiedBy: account.current.userId });
          await linkPetMemories(tx, config.organizationId, { petId: appointment.petId, fromNodeId: planNode.id, toNodeId: medicationNode.id, relation: 'INCLUDES', explanation: 'Назначение является частью проверенного плана лечения.' });
        }
        if (followUpAt && !Number.isNaN(followUpAt.valueOf()) && followUpAt > new Date()) await tx.careRecommendation.upsert({ where: { idempotencyKey: `clinical-follow-up:${encounter.id}` }, update: {}, create: { organizationId: config.organizationId, ownerId: appointment.ownerId, petId: appointment.petId, triggerNodeId: planNode.id, kind: 'CLINICAL_FOLLOW_UP', title: 'Контрольный приём', explanation: `Врач указал контроль после визита ${reason}.`, expectedOutcome: 'Команда сверит самочувствие питомца и при необходимости скорректирует план.', priority: 'NORMAL', assignedRole: 'VETERINARIAN', dueAt: followUpAt, state: 'VERIFIED', reviewedBy: account.current.userId, reviewedAt: new Date(), idempotencyKey: `clinical-follow-up:${encounter.id}` } });
        await recordAppointmentStage(tx, config.organizationId, { appointmentId: appointment.id, petId: appointment.petId, stage: 'RECOMMENDATIONS_READY', message: 'Врач завершил запись — рекомендации готовы в личном кабинете.', actorId: account.current.userId, idempotencyKey: `appointment-stage:${appointment.id}:RECOMMENDATIONS_READY` });
        await recordAppointmentStage(tx, config.organizationId, { appointmentId: appointment.id, petId: appointment.petId, stage: 'READY_FOR_PICKUP', message: 'Приём завершён. Можно переходить к выдаче питомца.', actorId: account.current.userId, idempotencyKey: `appointment-stage:${appointment.id}:READY_FOR_PICKUP` });
        return encounter;
      });
      await auditCommand({ actorId: account.current.userId, action: 'clinical.encounter_finalized', aggregateType: 'Encounter', aggregateId: result.id, idempotencyKey: key, payload: { appointmentId: appointment.id, petId: appointment.petId } });
      json(response, 201, { encounter: { id: result.id, state: result.state, version: result.version, assessment: result.assessment, plan: result.plan } }); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/staff/hospital/dashboard') {
      const account = await currentStaff(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'VETERINARIAN', 'ASSISTANT'].includes(account.membership.role)) { json(response, 403, { error: 'HOSPITAL_ROLE_REQUIRED' }); return; }
      const [beds, admissions, lastHandoff] = await Promise.all([
        db.hospitalBed.findMany({ where: { organizationId: config.organizationId }, orderBy: [{ zone: 'asc' }, { label: 'asc' }] }),
        db.hospitalization.findMany({ where: { organizationId: config.organizationId, state: { in: ['ADMITTED', 'IN_TREATMENT', 'DISCHARGE_READY'] } }, include: { owner: true, pet: true, bed: true, tasks: { orderBy: { scheduledAt: 'asc' } }, observations: { orderBy: { recordedAt: 'desc' }, take: 5 } }, orderBy: { admittedAt: 'asc' } }),
        db.hospitalHandoff.findFirst({ where: { organizationId: config.organizationId }, orderBy: { createdAt: 'desc' } })
      ]);
      json(response, 200, { beds: beds.map((bed) => ({ id: bed.id, label: bed.label, zone: bed.zone, isolation: bed.isolation, state: bed.state, cleaningState: bed.cleaningState })), admissions: admissions.map((item) => ({ id: item.id, appointmentId: item.appointmentId, state: item.state, acuity: item.acuity, currentPlan: item.currentPlan, ownerUpdateState: item.ownerUpdateState, alerts: item.alerts, responsibleClinicianId: item.responsibleClinicianId, admittedAt: item.admittedAt, owner: item.owner.fullName, pet: item.pet.name, species: item.pet.species, bed: item.bed ? { id: item.bed.id, label: item.bed.label, zone: item.bed.zone } : undefined, tasks: item.tasks.map((task) => ({ id: task.id, title: task.title, taskType: task.taskType, instructions: task.instructions, scheduledAt: task.scheduledAt, state: task.state, assignedStaffId: task.assignedStaffId, administeredBy: task.administeredBy, administeredAt: task.administeredAt, missedReason: task.missedReason, notes: task.notes })), observations: item.observations.map((observation) => ({ id: observation.id, acuity: observation.acuity, vitals: observation.vitals, note: observation.note, recordedAt: observation.recordedAt })) })), lastHandoff: lastHandoff ? { summary: lastHandoff.summary, unresolved: lastHandoff.unresolved, createdAt: lastHandoff.createdAt } : undefined }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/staff/hospital/admissions') {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'VETERINARIAN'].includes(account.membership.role)) { json(response, 403, { error: 'CLINICAL_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { appointmentId?: string; bedId?: string; acuity?: string; currentPlan?: string; alerts?: string[] } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const [appointment, bed] = await Promise.all([
        db.appointment.findFirst({ where: { id: String(input.appointmentId ?? ''), organizationId: config.organizationId } }),
        db.hospitalBed.findFirst({ where: { id: String(input.bedId ?? ''), organizationId: config.organizationId } })
      ]);
      if (!appointment || !['IN_SERVICE', 'READY'].includes(appointment.state)) { json(response, 409, { error: 'APPOINTMENT_NOT_READY_FOR_ADMISSION' }); return; }
      if (appointment.staffId !== account.current.userId && account.membership.role !== 'ADMIN') { json(response, 403, { error: 'ASSIGNED_STAFF_REQUIRED' }); return; }
      const [variant, encounter, activeAdmission] = await Promise.all([
        db.serviceVariant.findFirst({ where: { id: appointment.variantId, organizationId: config.organizationId }, include: { service: true } }),
        db.encounter.findUnique({ where: { appointmentId: appointment.id } }),
        db.hospitalization.findFirst({ where: { organizationId: config.organizationId, petId: appointment.petId, state: { in: ['ADMITTED', 'IN_TREATMENT', 'DISCHARGE_READY'] } } })
      ]);
      if (!variant || variant.service.kind !== 'VETERINARY' || !encounter || encounter.state !== 'FINALIZED') { json(response, 409, { error: 'FINALIZED_CLINICAL_ENCOUNTER_REQUIRED' }); return; }
      if (activeAdmission) { json(response, 409, { error: 'PET_ALREADY_ADMITTED' }); return; }
      if (!bed || bed.state !== 'AVAILABLE' || bed.cleaningState !== 'READY') { json(response, 409, { error: 'HOSPITAL_BED_NOT_AVAILABLE' }); return; }
      const acuity = String(input.acuity ?? 'STABLE').toUpperCase(); const currentPlan = String(input.currentPlan ?? '').trim();
      if (!['STABLE', 'WATCH', 'CRITICAL'].includes(acuity) || currentPlan.length < 10 || currentPlan.length > 4000) { json(response, 400, { error: 'INVALID_ADMISSION_PLAN' }); return; }
      const alerts = Array.isArray(input.alerts) ? input.alerts.map((item) => String(item).trim()).filter(Boolean).slice(0, 20) : [];
      const admission = await db.$transaction(async (tx) => {
        const created = await tx.hospitalization.create({ data: { organizationId: config.organizationId, ownerId: appointment.ownerId, petId: appointment.petId, appointmentId: appointment.id, bedId: bed.id, responsibleClinicianId: account.current.userId, acuity, currentPlan, alerts, state: 'ADMITTED' } });
        await tx.hospitalBed.update({ where: { id: bed.id }, data: { state: 'OCCUPIED' } });
        await tx.appointment.update({ where: { id: appointment.id }, data: { state: 'COMPLETED' } });
        return created;
      });
      await auditCommand({ actorId: account.current.userId, action: 'hospital.admitted', aggregateType: 'Hospitalization', aggregateId: admission.id, idempotencyKey: key, payload: { petId: admission.petId, bedId: bed.id } });
      json(response, 201, { admission: { id: admission.id, state: admission.state, acuity: admission.acuity, bedId: admission.bedId } }); return;
    }
    const hospitalTaskCreate = url.pathname.match(/^\/api\/v1\/staff\/hospital\/admissions\/([^/]+)\/tasks$/);
    if (request.method === 'POST' && hospitalTaskCreate) {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'VETERINARIAN'].includes(account.membership.role)) { json(response, 403, { error: 'CLINICAL_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { title?: string; taskType?: string; instructions?: string; scheduledAt?: string; assignedStaffId?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const admission = await db.hospitalization.findFirst({ where: { id: decodeURIComponent(hospitalTaskCreate[1]), organizationId: config.organizationId, state: { in: ['ADMITTED', 'IN_TREATMENT'] } } });
      const title = String(input.title ?? '').trim(); const instructions = String(input.instructions ?? '').trim(); const scheduledAt = new Date(String(input.scheduledAt ?? ''));
      if (!admission || title.length < 3 || title.length > 240 || instructions.length > 2000 || Number.isNaN(scheduledAt.valueOf())) { json(response, 400, { error: 'INVALID_TREATMENT_TASK' }); return; }
      const task = await db.$transaction(async (tx) => {
        const created = await tx.treatmentTask.create({ data: { hospitalizationId: admission.id, organizationId: config.organizationId, title, taskType: String(input.taskType ?? 'TREATMENT').toUpperCase().slice(0, 40), instructions: instructions || null, scheduledAt, state: 'DUE', assignedStaffId: String(input.assignedStaffId ?? '').trim() || null } });
        await tx.hospitalization.update({ where: { id: admission.id }, data: { state: 'IN_TREATMENT' } });
        return created;
      });
      await auditCommand({ actorId: account.current.userId, action: 'hospital.treatment_scheduled', aggregateType: 'TreatmentTask', aggregateId: task.id, idempotencyKey: key, payload: { hospitalizationId: admission.id } });
      json(response, 201, { task: { id: task.id, state: task.state, scheduledAt: task.scheduledAt } }); return;
    }
    const hospitalTaskAction = url.pathname.match(/^\/api\/v1\/staff\/hospital\/tasks\/([^/]+)$/);
    if (request.method === 'PATCH' && hospitalTaskAction) {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'VETERINARIAN', 'ASSISTANT'].includes(account.membership.role)) { json(response, 403, { error: 'HOSPITAL_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { action?: string; notes?: string; missedReason?: string; vitals?: Record<string, string> } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const task = await db.treatmentTask.findFirst({ where: { id: decodeURIComponent(hospitalTaskAction[1]), organizationId: config.organizationId }, include: { hospitalization: true } });
      if (!task || task.state !== 'DUE' || !['ADMITTED', 'IN_TREATMENT'].includes(task.hospitalization.state)) { json(response, 409, { error: 'TREATMENT_TASK_NOT_DUE' }); return; }
      const action = String(input.action ?? '').toUpperCase(); const missedReason = String(input.missedReason ?? '').trim();
      if (!['ADMINISTER', 'SKIP'].includes(action) || (action === 'SKIP' && missedReason.length < 3)) { json(response, 400, { error: 'INVALID_TREATMENT_ACTION' }); return; }
      const updated = await db.treatmentTask.update({ where: { id: task.id }, data: { state: action === 'ADMINISTER' ? 'ADMINISTERED' : 'SKIPPED', administeredBy: account.current.userId, administeredAt: new Date(), missedReason: action === 'SKIP' ? missedReason.slice(0, 1000) : null, notes: String(input.notes ?? '').trim().slice(0, 2000) || null, vitals: input.vitals ?? undefined } });
      await auditCommand({ actorId: account.current.userId, action: action === 'ADMINISTER' ? 'hospital.treatment_administered' : 'hospital.treatment_skipped', aggregateType: 'TreatmentTask', aggregateId: task.id, idempotencyKey: key, payload: { hospitalizationId: task.hospitalizationId } });
      json(response, 200, { task: { id: updated.id, state: updated.state, administeredAt: updated.administeredAt } }); return;
    }
    const hospitalObservation = url.pathname.match(/^\/api\/v1\/staff\/hospital\/admissions\/([^/]+)\/observations$/);
    if (request.method === 'POST' && hospitalObservation) {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'VETERINARIAN', 'ASSISTANT'].includes(account.membership.role)) { json(response, 403, { error: 'HOSPITAL_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { acuity?: string; note?: string; temperature?: string; pulse?: string; respiration?: string; weight?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const admission = await db.hospitalization.findFirst({ where: { id: decodeURIComponent(hospitalObservation[1]), organizationId: config.organizationId, state: { in: ['ADMITTED', 'IN_TREATMENT'] } } });
      const acuity = String(input.acuity ?? '').toUpperCase(); const note = String(input.note ?? '').trim(); const vitals = { temperature: String(input.temperature ?? '').trim(), pulse: String(input.pulse ?? '').trim(), respiration: String(input.respiration ?? '').trim(), weight: String(input.weight ?? '').trim() };
      if (!admission || !['STABLE', 'WATCH', 'CRITICAL'].includes(acuity) || (!note && !Object.values(vitals).some(Boolean))) { json(response, 400, { error: 'OBSERVATION_REQUIRED' }); return; }
      const observation = await db.$transaction(async (tx) => {
        const created = await tx.hospitalObservation.create({ data: { hospitalizationId: admission.id, organizationId: config.organizationId, acuity, vitals, note: note.slice(0, 3000) || null, recordedBy: account.current.userId } });
        await tx.hospitalization.update({ where: { id: admission.id }, data: { acuity } });
        return created;
      });
      await auditCommand({ actorId: account.current.userId, action: 'hospital.observation_recorded', aggregateType: 'HospitalObservation', aggregateId: observation.id, idempotencyKey: key, payload: { hospitalizationId: admission.id, acuity } });
      json(response, 201, { observation: { id: observation.id, acuity: observation.acuity, recordedAt: observation.recordedAt } }); return;
    }
    const hospitalAdmissionAction = url.pathname.match(/^\/api\/v1\/staff\/hospital\/admissions\/([^/]+)$/);
    if (request.method === 'PATCH' && hospitalAdmissionAction) {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'VETERINARIAN'].includes(account.membership.role)) { json(response, 403, { error: 'CLINICAL_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { action?: string; dischargeSummary?: string; ownerUpdateState?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const admission = await db.hospitalization.findFirst({ where: { id: decodeURIComponent(hospitalAdmissionAction[1]), organizationId: config.organizationId }, include: { tasks: true } });
      if (!admission) { json(response, 404, { error: 'NOT_FOUND' }); return; }
      const action = String(input.action ?? '').toUpperCase();
      if (action === 'OWNER_UPDATED') {
        const updated = await db.hospitalization.update({ where: { id: admission.id }, data: { ownerUpdateState: 'UPDATED' } });
        await auditCommand({ actorId: account.current.userId, action: 'hospital.owner_updated', aggregateType: 'Hospitalization', aggregateId: admission.id, idempotencyKey: key });
        json(response, 200, { admission: { id: updated.id, ownerUpdateState: updated.ownerUpdateState } }); return;
      }
      if (action === 'READY_FOR_DISCHARGE') {
        if (!['ADMITTED', 'IN_TREATMENT'].includes(admission.state) || admission.tasks.some((task) => task.state === 'DUE')) { json(response, 409, { error: 'OUTSTANDING_TREATMENT_TASKS' }); return; }
        const summary = String(input.dischargeSummary ?? '').trim(); if (summary.length < 20 || summary.length > 6000) { json(response, 400, { error: 'DISCHARGE_SUMMARY_REQUIRED' }); return; }
        const updated = await db.hospitalization.update({ where: { id: admission.id }, data: { state: 'DISCHARGE_READY', dischargeSummary: summary, ownerUpdateState: 'UPDATED' } });
        await auditCommand({ actorId: account.current.userId, action: 'hospital.discharge_ready', aggregateType: 'Hospitalization', aggregateId: admission.id, idempotencyKey: key });
        json(response, 200, { admission: { id: updated.id, state: updated.state } }); return;
      }
      if (action === 'DISCHARGE') {
        if (admission.state !== 'DISCHARGE_READY' || !admission.dischargeSummary) { json(response, 409, { error: 'DISCHARGE_NOT_READY' }); return; }
        const updated = await db.$transaction(async (tx) => {
          const discharged = await tx.hospitalization.update({ where: { id: admission.id }, data: { state: 'DISCHARGED', dischargedAt: new Date(), dischargedBy: account.current.userId } });
          if (admission.bedId) await tx.hospitalBed.update({ where: { id: admission.bedId }, data: { state: 'CLEANING', cleaningState: 'DIRTY' } });
          return discharged;
        });
        await auditCommand({ actorId: account.current.userId, action: 'hospital.discharged', aggregateType: 'Hospitalization', aggregateId: admission.id, idempotencyKey: key, payload: { bedId: admission.bedId ?? undefined } });
        json(response, 200, { admission: { id: updated.id, state: updated.state, dischargedAt: updated.dischargedAt } }); return;
      }
      json(response, 400, { error: 'UNKNOWN_HOSPITAL_ACTION' }); return;
    }
    const hospitalBedAction = url.pathname.match(/^\/api\/v1\/staff\/hospital\/beds\/([^/]+)$/);
    if (request.method === 'PATCH' && hospitalBedAction) {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'ASSISTANT'].includes(account.membership.role)) { json(response, 403, { error: 'HOSPITAL_BED_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      const bed = await db.hospitalBed.findFirst({ where: { id: decodeURIComponent(hospitalBedAction[1]), organizationId: config.organizationId } });
      if (!bed || bed.state !== 'CLEANING' || bed.cleaningState !== 'DIRTY') { json(response, 409, { error: 'BED_NOT_WAITING_FOR_CLEANING' }); return; }
      const updated = await db.hospitalBed.update({ where: { id: bed.id }, data: { state: 'AVAILABLE', cleaningState: 'READY' } });
      await auditCommand({ actorId: account.current.userId, action: 'hospital.bed_cleaned', aggregateType: 'HospitalBed', aggregateId: bed.id, idempotencyKey: key });
      json(response, 200, { bed: { id: updated.id, state: updated.state, cleaningState: updated.cleaningState } }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/staff/hospital/handoffs') {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'VETERINARIAN', 'ASSISTANT'].includes(account.membership.role)) { json(response, 403, { error: 'HOSPITAL_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { summary?: string; unresolved?: string[] } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const summary = String(input.summary ?? '').trim(); const unresolved = Array.isArray(input.unresolved) ? input.unresolved.map((item) => String(item).trim()).filter(Boolean).slice(0, 30) : [];
      if (summary.length < 20 || summary.length > 6000) { json(response, 400, { error: 'HANDOFF_SUMMARY_REQUIRED' }); return; }
      const handoff = await db.hospitalHandoff.create({ data: { organizationId: config.organizationId, summary, unresolved, createdBy: account.current.userId } });
      await auditCommand({ actorId: account.current.userId, action: 'hospital.handoff_recorded', aggregateType: 'HospitalHandoff', aggregateId: handoff.id, idempotencyKey: key });
      json(response, 201, { handoff: { id: handoff.id, state: handoff.state, createdAt: handoff.createdAt } }); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/staff/grooming/dashboard') {
      const account = await currentStaff(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER', 'GROOMER', 'ASSISTANT'].includes(account.membership.role)) { json(response, 403, { error: 'GROOMING_ROLE_REQUIRED' }); return; }
      const since = new Date(Date.now() - 30 * 86400000);
      const [items, locations, visits, rebookTasks] = await Promise.all([
        db.inventoryItem.findMany({ where: { organizationId: config.organizationId, active: true, itemType: { in: ['CONSUMABLE', 'PRODUCT'] } }, include: { lots: true }, orderBy: { name: 'asc' } }),
        db.location.findMany({ where: { organizationId: config.organizationId, active: true }, orderBy: { name: 'asc' } }),
        db.groomingVisit.findMany({ where: { organizationId: config.organizationId, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 300 }),
        db.carePlanTask.count({ where: { organizationId: config.organizationId, category: 'GROOMING_REBOOK', state: { in: ['OPEN', 'IN_PROGRESS'] } } })
      ]);
      const visitIds = visits.map((visit) => visit.id); const appointmentIds = visits.map((visit) => visit.appointmentId);
      const [movements, invoices] = await Promise.all([
        db.stockMovement.findMany({ where: { organizationId: config.organizationId, referenceType: 'GROOMING_VISIT', referenceId: { in: visitIds } }, include: { item: true }, orderBy: { createdAt: 'desc' } }),
        db.invoice.findMany({ where: { organizationId: config.organizationId, appointmentId: { in: appointmentIds } } })
      ]);
      const now = Date.now(); const materialByVisit = new Map<string, { id: string; item: string; quantityMilli: number; unit: string; createdAt: Date }[]>();
      for (const movement of movements) { const rows = materialByVisit.get(movement.referenceId ?? '') ?? []; rows.push({ id: movement.id, item: movement.item.name, quantityMilli: movement.quantityMilli, unit: movement.item.unit, createdAt: movement.createdAt }); materialByVisit.set(movement.referenceId ?? '', rows); }
      const invoiceByAppointment = new Map(invoices.filter((invoice) => invoice.appointmentId).map((invoice) => [invoice.appointmentId!, invoice]));
      json(response, 200, {
        locations: locations.map((location) => ({ id: location.id, name: location.name })),
        items: items.map((item) => ({ id: item.id, name: item.name, unit: item.unit, sellPriceMinor: item.sellPriceMinor, availability: locations.map((location) => ({ locationId: location.id, quantityMilli: item.lots.filter((lot) => lot.locationId === location.id && lot.state === 'ACTIVE' && lot.storageState === 'AVAILABLE' && lot.quantityMilli > 0 && (!lot.expiryAt || lot.expiryAt.valueOf() > now)).reduce((sum, lot) => sum + lot.quantityMilli, 0) })).filter((row) => row.quantityMilli > 0) })),
        materialsByVisit: Object.fromEntries(materialByVisit),
        summary: { visits: visits.length, completed: visits.filter((visit) => visit.state === 'COMPLETE').length, inProgress: visits.filter((visit) => visit.state === 'IN_PROGRESS').length, collectedMinor: visits.reduce((sum, visit) => sum + (invoiceByAppointment.get(visit.appointmentId)?.paidMinor ?? 0), 0), outstandingMinor: visits.reduce((sum, visit) => { const invoice = invoiceByAppointment.get(visit.appointmentId); return sum + (invoice ? Math.max(0, invoice.totalMinor - invoice.paidMinor) : 0); }, 0), rebookOpen: rebookTasks }
      }); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/staff/inventory/dashboard') {
      const account = await currentStaff(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER', 'VETERINARIAN', 'ASSISTANT'].includes(account.membership.role)) { json(response, 403, { error: 'INVENTORY_ROLE_REQUIRED' }); return; }
      const [items, locations, movements] = await Promise.all([
        db.inventoryItem.findMany({ where: { organizationId: config.organizationId, active: true }, include: { lots: { orderBy: { expiryAt: 'asc' } } }, orderBy: { name: 'asc' } }),
        db.location.findMany({ where: { organizationId: config.organizationId, active: true }, orderBy: { name: 'asc' } }),
        db.stockMovement.findMany({ where: { organizationId: config.organizationId }, include: { item: true, lot: true }, orderBy: { createdAt: 'desc' }, take: 30 })
      ]);
      const now = Date.now(); const expiryWindow = now + 30 * 86400000;
      json(response, 200, { locations: locations.map((location) => ({ id: location.id, name: location.name })), items: items.map((item) => { const usableLots = item.lots.filter((lot) => lot.state === 'ACTIVE' && lot.storageState === 'AVAILABLE' && (!lot.expiryAt || lot.expiryAt.valueOf() > now)); const totalMilli = usableLots.reduce((sum, lot) => sum + lot.quantityMilli, 0); return { id: item.id, sku: item.sku, name: item.name, itemType: item.itemType, unit: item.unit, barcode: item.barcode, totalMilli, lowStockThresholdMilli: item.lowStockThresholdMilli, lowStock: totalMilli <= item.lowStockThresholdMilli, lots: item.lots.map((lot) => ({ id: lot.id, lotCode: lot.lotCode, locationId: lot.locationId, expiryAt: lot.expiryAt, quantityMilli: lot.quantityMilli, state: lot.state, storageState: lot.storageState, expiringSoon: Boolean(lot.expiryAt && lot.expiryAt.valueOf() <= expiryWindow) })) }; }), movements: movements.map((movement) => ({ id: movement.id, item: movement.item.name, lotCode: movement.lot.lotCode, direction: movement.direction, quantityMilli: movement.quantityMilli, reason: movement.reason, referenceType: movement.referenceType, referenceId: movement.referenceId, createdAt: movement.createdAt })) }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/staff/inventory/items') {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER'].includes(account.membership.role)) { json(response, 403, { error: 'INVENTORY_MANAGER_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { sku?: string; name?: string; itemType?: string; unit?: string; barcode?: string; lowStockThresholdMilli?: number; purchasePriceMinor?: number; sellPriceMinor?: number; storageRequirements?: Record<string, string> } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const sku = String(input.sku ?? '').trim().toUpperCase(); const name = String(input.name ?? '').trim(); const unit = String(input.unit ?? '').trim(); const itemType = String(input.itemType ?? '').trim().toUpperCase();
      if (!/^[A-Z0-9_.-]{2,40}$/.test(sku) || name.length < 2 || name.length > 240 || unit.length < 1 || unit.length > 40 || !['MEDICATION', 'CONSUMABLE', 'PRODUCT', 'FEED'].includes(itemType)) { json(response, 400, { error: 'INVALID_INVENTORY_ITEM' }); return; }
      const existing = await db.inventoryItem.findUnique({ where: { organizationId_sku: { organizationId: config.organizationId, sku } } });
      if (existing) { json(response, 409, { error: 'SKU_ALREADY_EXISTS' }); return; }
      const item = await db.inventoryItem.create({ data: { organizationId: config.organizationId, sku, name, unit, itemType, barcode: String(input.barcode ?? '').trim() || null, lowStockThresholdMilli: Math.max(0, Math.trunc(Number(input.lowStockThresholdMilli ?? 0))), purchasePriceMinor: Number.isFinite(Number(input.purchasePriceMinor)) ? Math.max(0, Math.trunc(Number(input.purchasePriceMinor))) : null, sellPriceMinor: Number.isFinite(Number(input.sellPriceMinor)) ? Math.max(0, Math.trunc(Number(input.sellPriceMinor))) : null, storageRequirements: input.storageRequirements ?? {} } });
      await auditCommand({ actorId: account.current.userId, action: 'inventory.item_created', aggregateType: 'InventoryItem', aggregateId: item.id, idempotencyKey: key, payload: { sku: item.sku } });
      json(response, 201, { item: { id: item.id, sku: item.sku, name: item.name } }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/staff/inventory/lots') {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER'].includes(account.membership.role)) { json(response, 403, { error: 'INVENTORY_MANAGER_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { itemId?: string; locationId?: string; lotCode?: string; expiryAt?: string; quantityMilli?: number } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const quantityMilli = Math.trunc(Number(input.quantityMilli)); const lotCode = String(input.lotCode ?? '').trim().toUpperCase(); const expiryAt = input.expiryAt ? new Date(input.expiryAt) : null;
      const [item, location] = await Promise.all([db.inventoryItem.findFirst({ where: { id: String(input.itemId ?? ''), organizationId: config.organizationId, active: true } }), db.location.findFirst({ where: { id: String(input.locationId ?? ''), organizationId: config.organizationId, active: true } })]);
      if (!item || !location || quantityMilli <= 0 || quantityMilli > 100_000_000 || lotCode.length < 2 || lotCode.length > 100 || (expiryAt && Number.isNaN(expiryAt.valueOf()))) { json(response, 400, { error: 'INVALID_STOCK_RECEIPT' }); return; }
      const existing = await db.stockLot.findUnique({ where: { organizationId_itemId_locationId_lotCode: { organizationId: config.organizationId, itemId: item.id, locationId: location.id, lotCode } } });
      if (existing && String(existing.expiryAt?.toISOString() ?? '') !== String(expiryAt?.toISOString() ?? '')) { json(response, 409, { error: 'LOT_EXPIRY_MISMATCH' }); return; }
      const result = await db.$transaction(async (tx) => {
        const lot = existing ? await tx.stockLot.update({ where: { id: existing.id }, data: { quantityMilli: { increment: quantityMilli }, state: 'ACTIVE', storageState: 'AVAILABLE' } }) : await tx.stockLot.create({ data: { organizationId: config.organizationId, itemId: item.id, locationId: location.id, lotCode, expiryAt, quantityMilli, createdBy: account.current.userId } });
        const movement = await tx.stockMovement.create({ data: { organizationId: config.organizationId, itemId: item.id, lotId: lot.id, locationId: location.id, direction: 'RECEIPT', quantityMilli, balanceAfterMilli: lot.quantityMilli, reason: 'Приёмка партии', performedBy: account.current.userId } });
        return { lot, movement };
      });
      await auditCommand({ actorId: account.current.userId, action: 'stock.received', aggregateType: 'StockMovement', aggregateId: result.movement.id, idempotencyKey: key, payload: { itemId: item.id, lotId: result.lot.id, quantityMilli } });
      json(response, 201, { lot: { id: result.lot.id, lotCode: result.lot.lotCode, quantityMilli: result.lot.quantityMilli } }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/staff/inventory/consume') {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'MANAGER', 'VETERINARIAN'].includes(account.membership.role)) { json(response, 403, { error: 'INVENTORY_CONSUMPTION_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { itemId?: string; locationId?: string; quantityMilli?: number; reason?: string; referenceType?: string; referenceId?: string; petId?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const quantityMilli = Math.trunc(Number(input.quantityMilli)); const reason = String(input.reason ?? '').trim();
      const [item, location] = await Promise.all([db.inventoryItem.findFirst({ where: { id: String(input.itemId ?? ''), organizationId: config.organizationId, active: true } }), db.location.findFirst({ where: { id: String(input.locationId ?? ''), organizationId: config.organizationId, active: true } })]);
      if (!item || !location || quantityMilli <= 0 || quantityMilli > 100_000_000 || reason.length < 3 || reason.length > 1000) { json(response, 400, { error: 'INVALID_STOCK_CONSUMPTION' }); return; }
      let petId = String(input.petId ?? '').trim() || undefined; const referenceType = String(input.referenceType ?? '').trim().toUpperCase() || undefined; const referenceId = String(input.referenceId ?? '').trim() || undefined;
      if (referenceType === 'ENCOUNTER' && referenceId) { const encounter = await db.encounter.findFirst({ where: { id: referenceId, organizationId: config.organizationId } }); if (!encounter) { json(response, 404, { error: 'REFERENCE_NOT_FOUND' }); return; } petId = encounter.petId; }
      if (referenceType === 'TREATMENT_TASK' && referenceId) { const task = await db.treatmentTask.findFirst({ where: { id: referenceId, organizationId: config.organizationId }, include: { hospitalization: true } }); if (!task) { json(response, 404, { error: 'REFERENCE_NOT_FOUND' }); return; } petId = task.hospitalization.petId; }
      try {
        const movements = await db.$transaction(async (tx) => {
          const candidates = await tx.stockLot.findMany({ where: { organizationId: config.organizationId, itemId: item.id, locationId: location.id, state: 'ACTIVE', storageState: 'AVAILABLE', quantityMilli: { gt: 0 } } });
          const now = Date.now(); const lots = candidates.filter((lot) => !lot.expiryAt || lot.expiryAt.valueOf() > now).sort((left, right) => (left.expiryAt?.valueOf() ?? Number.MAX_SAFE_INTEGER) - (right.expiryAt?.valueOf() ?? Number.MAX_SAFE_INTEGER));
          if (lots.reduce((sum, lot) => sum + lot.quantityMilli, 0) < quantityMilli) throw new Error('INSUFFICIENT_STOCK');
          let remaining = quantityMilli; const created: { id: string }[] = [];
          for (const lot of lots) {
            if (!remaining) break; const take = Math.min(remaining, lot.quantityMilli); const updated = await tx.stockLot.updateMany({ where: { id: lot.id, quantityMilli: { gte: take } }, data: { quantityMilli: { decrement: take } } });
            if (updated.count !== 1) throw new Error('STOCK_CHANGED');
            const movement = await tx.stockMovement.create({ data: { organizationId: config.organizationId, itemId: item.id, lotId: lot.id, locationId: location.id, direction: 'CONSUMPTION', quantityMilli: take, balanceAfterMilli: lot.quantityMilli - take, reason, referenceType, referenceId, petId, performedBy: account.current.userId } });
            created.push(movement); remaining -= take;
          }
          return created;
        }, { isolationLevel: 'Serializable' });
        await auditCommand({ actorId: account.current.userId, action: 'stock.consumed', aggregateType: 'InventoryItem', aggregateId: item.id, idempotencyKey: key, payload: { quantityMilli, referenceType, referenceId, movementIds: movements.map((movement) => movement.id) } });
        json(response, 201, { consumption: { itemId: item.id, quantityMilli, movementIds: movements.map((movement) => movement.id) } }); return;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        json(response, 409, { error: message === 'INSUFFICIENT_STOCK' ? 'INSUFFICIENT_STOCK' : 'STOCK_CHANGED_RETRY' }); return;
      }
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/staff/grooming/visits') {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'GROOMER'].includes(account.membership.role)) { json(response, 403, { error: 'GROOMING_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { appointmentId?: string; coatType?: string; sensitivities?: string; behaviorNotes?: string; preferredStyle?: string; recipeTitle?: string; recipeSteps?: string[] } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const appointment = await db.appointment.findFirst({ where: { id: String(input.appointmentId ?? ''), organizationId: config.organizationId } });
      if (!appointment || appointment.state !== 'IN_SERVICE' || (appointment.staffId !== account.current.userId && account.membership.role !== 'ADMIN')) { json(response, 409, { error: 'GROOMING_VISIT_NOT_READY' }); return; }
      const variant = await db.serviceVariant.findFirst({ where: { id: appointment.variantId, organizationId: config.organizationId }, include: { service: true } });
      if (!variant || variant.service.kind !== 'GROOMING') { json(response, 400, { error: 'GROOMING_APPOINTMENT_REQUIRED' }); return; }
      const existing = await db.groomingVisit.findUnique({ where: { appointmentId: appointment.id } });
      if (existing) { json(response, 409, { error: 'GROOMING_VISIT_EXISTS' }); return; }
      const trim = (value: unknown, limit = 1000) => String(value ?? '').trim().slice(0, limit) || null;
      const steps = Array.isArray(input.recipeSteps) ? input.recipeSteps.map((step) => String(step).trim()).filter(Boolean).slice(0, 20) : [];
      const petContext = await db.pet.findFirst({ where: { id: appointment.petId, organizationId: config.organizationId } });
      const restrictionValues = (value: unknown) => Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : value && typeof value === 'object' ? Object.entries(value as Record<string, unknown>).map(([name, detail]) => `${name}: ${String(detail)}`) : [];
      const medicalRestrictions = Array.from(new Set([...restrictionValues(petContext?.medicalAlerts), ...restrictionValues(petContext?.chronicConditions)]));
      const result = await db.$transaction(async (tx) => {
        await tx.groomingProfile.upsert({ where: { organizationId_petId: { organizationId: config.organizationId, petId: appointment.petId } }, update: { coatType: trim(input.coatType, 180), sensitivities: trim(input.sensitivities), behaviorNotes: trim(input.behaviorNotes), preferredStyle: trim(input.preferredStyle, 240), medicalRestrictions }, create: { organizationId: config.organizationId, petId: appointment.petId, coatType: trim(input.coatType, 180), sensitivities: trim(input.sensitivities), behaviorNotes: trim(input.behaviorNotes), preferredStyle: trim(input.preferredStyle, 240), medicalRestrictions } });
        if (steps.length) await tx.groomingRecipe.updateMany({ where: { organizationId: config.organizationId, petId: appointment.petId, isPreferred: true }, data: { isPreferred: false } });
        const recipe = steps.length ? await tx.groomingRecipe.create({ data: { organizationId: config.organizationId, petId: appointment.petId, title: trim(input.recipeTitle, 180) ?? 'Индивидуальный уход', steps, isPreferred: true } }) : await tx.groomingRecipe.findFirst({ where: { organizationId: config.organizationId, petId: appointment.petId, isPreferred: true }, orderBy: { createdAt: 'desc' } });
        const created = await tx.groomingVisit.create({ data: { organizationId: config.organizationId, appointmentId: appointment.id, petId: appointment.petId, recipeId: recipe?.id, state: 'IN_PROGRESS', currentStage: 'INTAKE', stageStartedAt: new Date(), stageLog: [], checklist: createGroomingChecklist() as Prisma.InputJsonValue, homeCare: [], beforeFileIds: [], afterFileIds: [], startedBy: account.current.userId } });
        await recordAppointmentStage(tx, config.organizationId, { appointmentId: appointment.id, petId: appointment.petId, stage: 'STARTED', message: 'Мастер начал уход с учётом карты питомца и медицинских ограничений.', actorId: account.current.userId, idempotencyKey: `appointment-stage:${appointment.id}:STARTED` });
        return created;
      });
      await auditCommand({ actorId: account.current.userId, action: 'grooming_visit.started', aggregateType: 'GroomingVisit', aggregateId: result.id, idempotencyKey: key, payload: { appointmentId: appointment.id } });
      json(response, 201, { visit: { id: result.id, state: result.state, appointmentId: result.appointmentId, medicalRestrictions } }); return;
    }
    const groomingProgress = url.pathname.match(/^\/api\/v1\/staff\/grooming\/visits\/([^/]+)\/progress$/);
    if (request.method === 'PATCH' && groomingProgress) {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'GROOMER'].includes(account.membership.role)) { json(response, 403, { error: 'GROOMING_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { action?: string; itemId?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const visit = await db.groomingVisit.findFirst({ where: { id: decodeURIComponent(groomingProgress[1]), organizationId: config.organizationId, state: 'IN_PROGRESS' } });
      if (!visit) { json(response, 409, { error: 'GROOMING_VISIT_NOT_OPEN' }); return; }
      const appointment = await db.appointment.findFirst({ where: { id: visit.appointmentId, organizationId: config.organizationId } });
      if (!appointment || (appointment.staffId !== account.current.userId && account.membership.role !== 'ADMIN')) { json(response, 403, { error: 'ASSIGNED_STAFF_REQUIRED' }); return; }
      try {
        const action = String(input.action ?? '').toUpperCase(); let update: Prisma.GroomingVisitUpdateInput;
        if (action === 'TOGGLE_CHECKLIST') update = { checklist: toggleGroomingChecklist(visit.checklist, String(input.itemId ?? '')) as Prisma.InputJsonValue };
        else if (action === 'ADVANCE_STAGE') { const advanced = advanceGroomingStage({ currentStage: visit.currentStage, stageStartedAt: visit.stageStartedAt, stageLog: visit.stageLog, checklist: visit.checklist }); update = { currentStage: advanced.currentStage, stageStartedAt: advanced.stageStartedAt, stageLog: advanced.stageLog as Prisma.InputJsonValue }; }
        else { json(response, 400, { error: 'GROOMING_PROGRESS_ACTION_REQUIRED' }); return; }
        const result = await db.groomingVisit.update({ where: { id: visit.id }, data: update });
        await auditCommand({ actorId: account.current.userId, action: action === 'ADVANCE_STAGE' ? 'grooming_stage.advanced' : 'grooming_checklist.updated', aggregateType: 'GroomingVisit', aggregateId: result.id, idempotencyKey: key, payload: { currentStage: result.currentStage, itemId: input.itemId } });
        json(response, 200, { visit: { id: result.id, currentStage: result.currentStage, stageStartedAt: result.stageStartedAt, stageLog: result.stageLog, checklist: normalizeGroomingChecklist(result.checklist) } }); return;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        json(response, message.includes('NOT_FOUND') ? 404 : 409, { error: message || 'GROOMING_PROGRESS_REJECTED' }); return;
      }
    }
    const groomingMaterials = url.pathname.match(/^\/api\/v1\/staff\/grooming\/visits\/([^/]+)\/materials$/);
    if (request.method === 'POST' && groomingMaterials) {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'GROOMER'].includes(account.membership.role)) { json(response, 403, { error: 'GROOMING_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      const repeated = await db.invoiceLine.findUnique({ where: { idempotencyKey: key } });
      if (repeated) { json(response, 200, { material: { invoiceLineId: repeated.id, totalMinor: repeated.totalMinor } }); return; }
      let input: { itemId?: string; locationId?: string; quantityMilli?: number } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const quantityMilli = Math.trunc(Number(input.quantityMilli));
      const visit = await db.groomingVisit.findFirst({ where: { id: decodeURIComponent(groomingMaterials[1]), organizationId: config.organizationId, state: 'IN_PROGRESS' } });
      if (!visit) { json(response, 409, { error: 'GROOMING_VISIT_NOT_OPEN' }); return; }
      const [appointment, item, location, invoice] = await Promise.all([
        db.appointment.findFirst({ where: { id: visit.appointmentId, organizationId: config.organizationId } }),
        db.inventoryItem.findFirst({ where: { id: String(input.itemId ?? ''), organizationId: config.organizationId, active: true, itemType: { in: ['CONSUMABLE', 'PRODUCT'] } } }),
        db.location.findFirst({ where: { id: String(input.locationId ?? ''), organizationId: config.organizationId, active: true } }),
        db.invoice.findFirst({ where: { organizationId: config.organizationId, appointmentId: visit.appointmentId } })
      ]);
      if (!appointment || (appointment.staffId !== account.current.userId && account.membership.role !== 'ADMIN')) { json(response, 403, { error: 'ASSIGNED_STAFF_REQUIRED' }); return; }
      if (!item || !location || !invoice || quantityMilli <= 0 || quantityMilli > 1_000_000) { json(response, 400, { error: 'INVALID_GROOMING_MATERIAL' }); return; }
      try {
        const result = await db.$transaction(async (tx) => {
          const candidates = await tx.stockLot.findMany({ where: { organizationId: config.organizationId, itemId: item.id, locationId: location.id, state: 'ACTIVE', storageState: 'AVAILABLE', quantityMilli: { gt: 0 } } });
          const now = Date.now(); const lots = candidates.filter((lot) => !lot.expiryAt || lot.expiryAt.valueOf() > now).sort((left, right) => (left.expiryAt?.valueOf() ?? Number.MAX_SAFE_INTEGER) - (right.expiryAt?.valueOf() ?? Number.MAX_SAFE_INTEGER));
          if (lots.reduce((sum, lot) => sum + lot.quantityMilli, 0) < quantityMilli) throw new Error('INSUFFICIENT_STOCK');
          let remaining = quantityMilli; const movementIds: string[] = [];
          for (const lot of lots) { if (!remaining) break; const take = Math.min(remaining, lot.quantityMilli); const updated = await tx.stockLot.updateMany({ where: { id: lot.id, quantityMilli: { gte: take } }, data: { quantityMilli: { decrement: take } } }); if (updated.count !== 1) throw new Error('STOCK_CHANGED'); const movement = await tx.stockMovement.create({ data: { organizationId: config.organizationId, itemId: item.id, lotId: lot.id, locationId: location.id, direction: 'CONSUMPTION', quantityMilli: take, balanceAfterMilli: lot.quantityMilli - take, reason: `Груминг · ${item.name}`, referenceType: 'GROOMING_VISIT', referenceId: visit.id, petId: visit.petId, performedBy: account.current.userId } }); movementIds.push(movement.id); remaining -= take; }
          const unitPriceMinor = item.sellPriceMinor ?? 0; const totalMinor = Math.round(unitPriceMinor * quantityMilli / 1000);
          const line = await tx.invoiceLine.create({ data: { organizationId: config.organizationId, invoiceId: invoice.id, lineType: 'MATERIAL', referenceId: item.id, description: item.name, quantityMilli, unitPriceMinor, totalMinor, costBasisMinor: item.purchasePriceMinor == null ? null : Math.round(item.purchasePriceMinor * quantityMilli / 1000), performerId: account.current.userId, idempotencyKey: key } });
          const nextTotal = invoice.totalMinor + totalMinor; const nextState = invoice.paidMinor >= nextTotal ? 'PAID' : invoice.paidMinor > 0 ? 'PARTIALLY_PAID' : 'ISSUED';
          await tx.invoice.update({ where: { id: invoice.id }, data: { totalMinor: nextTotal, state: nextState } });
          return { line, movementIds, nextTotal, nextState };
        }, { isolationLevel: 'Serializable' });
        await auditCommand({ actorId: account.current.userId, action: 'grooming_material.consumed', aggregateType: 'GroomingVisit', aggregateId: visit.id, idempotencyKey: key, payload: { itemId: item.id, quantityMilli, invoiceLineId: result.line.id, movementIds: result.movementIds } });
        json(response, 201, { material: { invoiceLineId: result.line.id, totalMinor: result.line.totalMinor, invoiceTotalMinor: result.nextTotal, invoiceState: result.nextState } }); return;
      } catch (error) { const message = error instanceof Error ? error.message : ''; json(response, 409, { error: message === 'INSUFFICIENT_STOCK' ? 'INSUFFICIENT_STOCK' : 'STOCK_CHANGED_RETRY' }); return; }
    }
    const groomingVisit = url.pathname.match(/^\/api\/v1\/staff\/grooming\/visits\/([^/]+)$/);
    if (request.method === 'PATCH' && groomingVisit) {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'GROOMER'].includes(account.membership.role)) { json(response, 403, { error: 'GROOMING_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { report?: string; homeCare?: string[]; nextCareAt?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const visit = await db.groomingVisit.findFirst({ where: { id: decodeURIComponent(groomingVisit[1]), organizationId: config.organizationId } });
      if (!visit || visit.state !== 'IN_PROGRESS') { json(response, 409, { error: 'GROOMING_VISIT_NOT_OPEN' }); return; }
      const report = String(input.report ?? '').trim(); if (report.length < 10 || report.length > 5000) { json(response, 400, { error: 'GROOMING_REPORT_REQUIRED' }); return; }
      if (!canCompleteGrooming(visit.currentStage, visit.checklist)) { json(response, 409, { error: 'GROOMING_CHECKLIST_INCOMPLETE' }); return; }
      const homeCare = Array.isArray(input.homeCare) ? input.homeCare.map((item) => String(item).trim()).filter(Boolean).slice(0, 12) : [];
      const appointment = await db.appointment.findFirst({ where: { id: visit.appointmentId, organizationId: config.organizationId } });
      if (!appointment || (appointment.staffId !== account.current.userId && account.membership.role !== 'ADMIN')) { json(response, 403, { error: 'ASSIGNED_STAFF_REQUIRED' }); return; }
      const nextCareAt = input.nextCareAt ? new Date(input.nextCareAt) : undefined;
      const result = await db.$transaction(async (tx) => {
        const completedAt = new Date(); const log = Array.isArray(visit.stageLog) ? visit.stageLog : [];
        const completed = await tx.groomingVisit.update({ where: { id: visit.id }, data: { state: 'COMPLETE', report, homeCare, nextCareAt: nextCareAt && !Number.isNaN(nextCareAt.valueOf()) ? nextCareAt : null, stageLog: [...log, { stage: 'FINISH', startedAt: visit.stageStartedAt.toISOString(), completedAt: completedAt.toISOString(), durationSeconds: Math.max(0, Math.round((completedAt.valueOf() - visit.stageStartedAt.valueOf()) / 1000)) }] as Prisma.InputJsonValue, completedBy: account.current.userId, completedAt } });
        await tx.appointment.update({ where: { id: appointment.id }, data: { state: 'READY' } });
        if (nextCareAt && !Number.isNaN(nextCareAt.valueOf()) && nextCareAt > new Date()) {
          const plan = await tx.carePlan.findFirst({ where: { organizationId: config.organizationId, ownerId: appointment.ownerId, petId: appointment.petId, state: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }) ?? await tx.carePlan.create({ data: { organizationId: config.organizationId, ownerId: appointment.ownerId, petId: appointment.petId, title: 'План ухода', state: 'ACTIVE' } });
          await tx.carePlanTask.create({ data: { carePlanId: plan.id, organizationId: config.organizationId, title: 'Запланировать следующий уход', category: 'GROOMING_REBOOK', dueAt: nextCareAt, state: 'OPEN' } });
        }
        const procedureNode = await rememberPetEvent(tx, config.organizationId, { petId: appointment.petId, type: 'PROCEDURE', title: 'Груминг и уход', summary: report, sourceType: 'GROOMING_VISIT', sourceId: completed.id, facts: { homeCare, nextCareAt: completed.nextCareAt?.toISOString() }, occurredAt: completed.completedAt ?? new Date(), verifiedBy: account.current.userId });
        const recommendationNode = homeCare.length ? await rememberPetEvent(tx, config.organizationId, { petId: appointment.petId, type: 'RECOMMENDATION', title: 'Домашний уход после груминга', summary: homeCare.join(' · '), sourceType: 'GROOMING_VISIT', sourceId: completed.id, occurredAt: completed.completedAt ?? new Date(), verifiedBy: account.current.userId }) : undefined;
        if (recommendationNode) await linkPetMemories(tx, config.organizationId, { petId: appointment.petId, fromNodeId: procedureNode.id, toNodeId: recommendationNode.id, relation: 'FOLLOWED_BY', explanation: 'Домашние рекомендации продолжают выполненный в студии уход.' });
        if (completed.nextCareAt) await tx.careRecommendation.upsert({ where: { idempotencyKey: `grooming-rebook:${completed.id}` }, update: { dueAt: completed.nextCareAt }, create: { organizationId: config.organizationId, ownerId: appointment.ownerId, petId: appointment.petId, triggerNodeId: recommendationNode?.id ?? procedureNode.id, kind: 'GROOMING_REBOOK', title: 'Повторить удачный уход', explanation: 'Мастер сохранил следующий ориентир после завершённого визита.', expectedOutcome: 'Команда предложит окно и повторит рецепт с учётом реакции питомца и медицинских ограничений.', priority: 'NORMAL', assignedRole: 'GROOMER', dueAt: completed.nextCareAt, state: 'VERIFIED', reviewedBy: account.current.userId, reviewedAt: new Date(), idempotencyKey: `grooming-rebook:${completed.id}` } });
        await recordAppointmentStage(tx, config.organizationId, { appointmentId: appointment.id, petId: appointment.petId, stage: 'RECOMMENDATIONS_READY', message: 'Отчёт мастера и домашний уход готовы.', actorId: account.current.userId, idempotencyKey: `appointment-stage:${appointment.id}:RECOMMENDATIONS_READY` });
        await recordAppointmentStage(tx, config.organizationId, { appointmentId: appointment.id, petId: appointment.petId, stage: 'READY_FOR_PICKUP', message: 'Уход завершён спокойно — питомца можно забирать.', actorId: account.current.userId, idempotencyKey: `appointment-stage:${appointment.id}:READY_FOR_PICKUP` });
        return completed;
      });
      await auditCommand({ actorId: account.current.userId, action: 'grooming_visit.completed', aggregateType: 'GroomingVisit', aggregateId: result.id, idempotencyKey: key, payload: { appointmentId: appointment.id } });
      json(response, 200, { visit: { id: result.id, state: result.state, report: result.report } }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/auth/sign-out') {
      const current = await session(request);
      if (current) await db.authSession.update({ where: { id: current.id }, data: { state: 'REVOKED', revokedAt: new Date() } });
      response.setHeader('set-cookie', 'vetsvet_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'); json(response, 200, { ok: true }); return;
    }
    if (request.method === 'GET' && (url.pathname === '/client/' || url.pathname === '/client')) {
      const current = await session(request); if (!current || current.mode !== 'CLIENT') { redirect(response, '/auth/'); return; }
      await serveClientHome(response); return;
    }
    if (request.method === 'GET' && url.pathname.startsWith('/client/')) { await serve(response, clientRoot, decodeURIComponent(url.pathname.slice(8))); return; }
    if (request.method === 'GET' && (url.pathname === '/staff/' || url.pathname === '/staff')) {
      const current = await session(request); if (!current || current.mode !== 'STAFF') { redirect(response, '/auth/?mode=staff'); return; }
      const membership = await db.staffMembership.findUnique({ where: { organizationId_userId: { organizationId: config.organizationId, userId: current.userId } } });
      if (!membership || membership.state !== 'ACTIVE') { redirect(response, '/auth/?mode=staff'); return; }
      await serveStaffHome(response); return;
    }
    if (request.method === 'GET' && url.pathname.startsWith('/staff/')) { await serve(response, staffRoot, decodeURIComponent(url.pathname.slice(7))); return; }
    if (request.method === 'GET' && (url.pathname === '/auth/' || url.pathname === '/auth' || url.pathname === '/auth/telegram.html')) { await serve(response, authRoot, 'index.html'); return; }
    if (request.method === 'GET' && (url.pathname === '/account/password' || url.pathname === '/account/password/')) {
      if (!await session(request)) { redirect(response, '/auth/'); return; }
      await serve(response, authRoot, 'password.html'); return;
    }
    if (request.method === 'GET' && url.pathname.startsWith('/Photo/')) { await serve(response, photoRoot, decodeURIComponent(url.pathname.slice(7))); return; }
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) { await serve(response, publicRoot, 'index.html'); return; }
    json(response, 404, { error: 'NOT_FOUND' });
  } catch (error) { console.error(error); json(response, 500, { error: 'INTERNAL_ERROR' }); }
});

ensureOrganization().then(ensureBookingFoundation).then(ensureDocumentFoundation).then(ensureGrowthFoundation).then(() => server.listen(config.port, '127.0.0.1', () => {
  console.log(`VetSvet production server on ${config.port}`);
  ensureBotCommandMenu().catch((error) => console.error('Telegram menu setup failed.', error));
  backfillBookingReminders().then(processBookingReminders).catch((error) => console.error('Booking reminder pass failed.', error));
  setInterval(() => processBookingReminders().catch((error) => console.error('Booking reminder pass failed.', error)), 60_000).unref();
  refreshPetIntelligence(db, config.organizationId).catch((error) => console.error('Care intelligence pass failed.', error));
  setInterval(() => refreshPetIntelligence(db, config.organizationId).catch((error) => console.error('Care intelligence pass failed.', error)), 300_000).unref();
})).catch((error) => { console.error(error); process.exit(1); });

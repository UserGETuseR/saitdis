import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const baseUrl = `http://127.0.0.1:${process.env.PORT ?? '4491'}`;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? 'smoke-webhook-secret';
const telegramUserId = '880001';
const telegramChatId = '880001';
const adminTelegramId = '990001';
const adminChatId = '990001';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log('VetSvet production channel: skipped (DATABASE_URL is not configured)');
  process.exit(0);
}
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
let updateId = 100;

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/healthz`)).ok) return; } catch { /* server is starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Production server did not become healthy.');
}

async function api(path: string, init: RequestInit = {}, cookie = '') {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...init.headers } });
  const data = await response.json().catch(() => ({}));
  assert.ok(response.ok, `${init.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return { response, data };
}

async function webhook(payload: Record<string, unknown>) {
  return api('/telegram/webhook', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': webhookSecret }, body: JSON.stringify({ update_id: updateId++, ...payload }) });
}

async function callback(data: string, from = telegramUserId, chat = telegramChatId) {
  return webhook({ callback_query: { id: `callback-${updateId}`, from: { id: Number(from), first_name: 'Smoke' }, data, message: { message_id: updateId, chat: { id: Number(chat) } } } });
}

function nextWorkingDay(offset: number) {
  for (let dayOffset = offset; dayOffset < offset + 7; dayOffset += 1) {
    const point = new Date(Date.now() + dayOffset * 86400000);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(point);
    if (new Date(`${day}T12:00:00+03:00`).getUTCDay() !== 0) return day;
  }
  throw new Error('No working day found.');
}

async function main() {
  const server = spawn(process.execPath, ['--import', 'tsx', 'apps/telegram-bot/src/production-server.ts'], { cwd: process.cwd(), env: { ...process.env, BOT_DRY_RUN: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverErrors = '';
  server.stderr.on('data', (chunk) => { serverErrors += String(chunk); });
  try {
  await waitForHealth();
  const login = `smoke_${Date.now()}`;
  const registration = await api('/api/auth/password/register', { method: 'POST', body: JSON.stringify({ login, password: 'Smoke-pass-2026!', fullName: 'Smoke Owner', mode: 'CLIENT' }) });
  const cookie = registration.response.headers.get('set-cookie')?.split(';')[0] ?? '';
  assert.ok(cookie.startsWith('vetsvet_session='));
  assert.equal((await api('/api/v1/auth/me', {}, cookie)).data.account.telegramLinked, false);

  const link = await api('/api/v1/auth/telegram/link/start', { method: 'POST', body: '{}' }, cookie);
  const start = String(link.data.telegramUrl).match(/start=l_([0-9a-f-]{36})_([A-Za-z0-9_-]+)/i);
  assert.ok(start);
  await webhook({ message: { message_id: updateId, from: { id: Number(telegramUserId), first_name: 'Smoke', last_name: 'Owner' }, chat: { id: Number(telegramChatId) }, text: `/start l_${start[1]}_${start[2]}` } });
  assert.equal((await api(`/api/auth/telegram/status?requestId=${link.data.requestId}`)).data.state, 'AUTHENTICATED');
  assert.equal((await api('/api/v1/auth/me', {}, cookie)).data.account.telegramLinked, true);

  await callback('bot:addpet');
  await webhook({ message: { message_id: updateId, from: { id: Number(telegramUserId), first_name: 'Smoke' }, chat: { id: Number(telegramChatId) }, text: 'Луна' } });
  await callback('bot:species:CAT');
  const owner = await db.owner.findFirstOrThrow({ where: { organizationId: process.env.VETSVET_ORGANIZATION_ID, telegramUserId } });
  const relation = await db.ownerPetRelation.findFirstOrThrow({ where: { ownerId: owner.id }, include: { pet: true } });
  assert.equal(relation.pet.name, 'Луна');

  const location = await db.location.findFirstOrThrow({ where: { organizationId: process.env.VETSVET_ORGANIZATION_ID, active: true } });
  const bookingVariant = await db.serviceVariant.findFirstOrThrow({ where: { organizationId: process.env.VETSVET_ORGANIZATION_ID, service: { kind: { not: 'CONSULTATION' } } }, include: { service: true } });
  const consultationVariant = await db.serviceVariant.findFirstOrThrow({ where: { organizationId: process.env.VETSVET_ORGANIZATION_ID, service: { kind: 'CONSULTATION' } }, include: { service: true } });
  await db.serviceVariant.update({ where: { id: bookingVariant.id }, data: { priceMinor: 120000 } });
  await db.serviceVariant.update({ where: { id: consultationVariant.id }, data: { priceMinor: 90000 } });

  const bookingDay = nextWorkingDay(2);
  const bookingAt = new Date(`${bookingDay}T10:00:00+03:00`);
  await callback('bot:booking'); await callback(`bot:pet:${relation.petId}`); await callback(`bot:service:${bookingVariant.id}`); await callback(`bot:day:${bookingDay}`); await callback(`bot:slot:${bookingAt.valueOf()}`); await callback('bot:confirm');
  const booking = await db.appointment.findFirstOrThrow({ where: { ownerId: owner.id, variantId: bookingVariant.id } });
  const bookingInvoice = await db.invoice.findUniqueOrThrow({ where: { appointmentId: booking.id } });
  assert.equal(booking.state, 'REQUESTED'); assert.equal(bookingInvoice.totalMinor, 120000);

  const consultationDay = nextWorkingDay(3);
  const consultationAt = new Date(`${consultationDay}T12:00:00+03:00`);
  await callback('bot:consultation'); await callback(`bot:pet:${relation.petId}`); await callback(`bot:service:${consultationVariant.id}`); await callback(`bot:day:${consultationDay}`); await callback(`bot:slot:${consultationAt.valueOf()}`);
  await webhook({ message: { message_id: updateId, from: { id: Number(telegramUserId), first_name: 'Smoke' }, chat: { id: Number(telegramChatId) }, text: 'Питомец вялый со вчерашнего вечера, аппетит снижен.' } });
  const consultation = await db.consultation.findFirstOrThrow({ where: { ownerId: owner.id }, include: { appointment: true } });
  assert.equal(consultation.paymentState, 'AWAITING_PROOF');

  await db.telegramAdminChat.create({ data: { singletonKey: `admin:${adminTelegramId}`, telegramUserId: adminTelegramId, chatId: adminChatId } });
  await webhook({ message: { message_id: updateId, from: { id: Number(telegramUserId), first_name: 'Smoke' }, chat: { id: Number(telegramChatId) }, photo: [{ file_id: 'smoke-proof', file_unique_id: 'smoke-proof', width: 100, height: 100 }] } });
  const consultationProof = await db.telegramPaymentProof.findFirstOrThrow({ where: { consultationId: consultation.id } });
  await callback(`payment:approve:${consultationProof.id}`, adminTelegramId, adminChatId);
  const paidConsultation = await db.consultation.findUniqueOrThrow({ where: { id: consultation.id } });
  const consultationInvoice = await db.invoice.findUniqueOrThrow({ where: { appointmentId: consultation.appointmentId } });
  assert.equal(paidConsultation.paymentState, 'CONFIRMED'); assert.equal(consultationInvoice.state, 'PAID');

  await webhook({ message: { message_id: updateId, from: { id: Number(telegramUserId), first_name: 'Smoke' }, chat: { id: Number(telegramChatId) }, photo: [{ file_id: 'smoke-booking-proof', file_unique_id: 'smoke-booking-proof', width: 100, height: 100 }] } });
  const bookingProof = await db.telegramPaymentProof.findFirstOrThrow({ where: { appointmentId: booking.id } });
  await callback(`payment:approve:${bookingProof.id}`, adminTelegramId, adminChatId);
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: bookingInvoice.id } })).state, 'PAID');
  assert.ok(await db.generatedDocument.count({ where: { ownerId: owner.id, appointmentId: { in: [booking.id, consultation.appointmentId] } } }) >= 2);

  console.log('VetSvet production channel: password, Telegram link, pet, booking, consultation and payment passed');
  } finally {
    server.kill('SIGTERM');
    await db.$disconnect();
    if (serverErrors) process.stderr.write(serverErrors);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

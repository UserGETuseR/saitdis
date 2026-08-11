import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';

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
  port: Number(process.env.PORT ?? 4400)
};
const db = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
const root = process.cwd();
const publicRoot = resolve(root, 'apps', 'public-web');
const clientRoot = resolve(root, 'apps', 'client-web');
const staffRoot = resolve(root, 'apps', 'staff-web');
const authRoot = resolve(root, 'apps', 'auth-web');
const photoRoot = resolve(root, 'Photo');
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

async function body(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const part of request) chunks.push(Buffer.isBuffer(part) ? part : Buffer.from(part));
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
function idempotencyKey(request: IncomingMessage) {
  const key = String(request.headers['idempotency-key'] ?? '').trim();
  return /^[A-Za-z0-9_.:-]{8,160}$/.test(key) ? key : undefined;
}
async function auditCommand(input: { actorId: string; action: string; aggregateType: string; aggregateId: string; idempotencyKey: string; payload?: Record<string, unknown> }) {
  const occurredAt = new Date();
  await db.$transaction([
    db.auditEvent.create({ data: { organizationId: config.organizationId, actorId: input.actorId, action: input.action, aggregateType: input.aggregateType, aggregateId: input.aggregateId, correlationId: input.idempotencyKey, metadata: input.payload ?? {} } }),
    db.outboxEvent.create({ data: { organizationId: config.organizationId, eventName: input.action, aggregateType: input.aggregateType, aggregateId: input.aggregateId, idempotencyKey: input.idempotencyKey, payload: input.payload ?? {}, occurredAt } })
  ]);
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
    response.end(html.replace('</body>', '<script src="/staff/app.js"></script></body>'));
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
  const result = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (!result.ok) throw new Error(`Telegram ${method} failed.`);
}
async function say(chatId: string, text: string, keyboard?: unknown) {
  await telegram('sendMessage', { chat_id: chatId, text, reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined });
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
  return location;
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
async function passwordHash(password: string) { const salt = randomBytes(16).toString('hex'); const derived = await scrypt(password, salt, 64); return `scrypt$${salt}$${Buffer.from(derived).toString('hex')}`; }
async function passwordMatches(password: string, encoded: string | null) { const [algorithm, salt, expected] = encoded?.split('$') ?? []; if (algorithm !== 'scrypt' || !salt || !expected) return false; const actual = Buffer.from(await scrypt(password, salt, 64)).toString('hex'); return sameSecret(actual, expected); }
async function createPasswordSession(response: ServerResponse, userId: string, mode: AuthMode) { const token = randomBytes(32).toString('base64url'); await db.authSession.create({ data: { userId, tokenHash: digest(token), mode, state: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000) } }); setSession(response, token); }

async function confirmTelegramLogin(recordId: string, secret: string, telegramUserId: string, chatId: string, fullName: string) {
  const record = await db.telegramLoginRequest.findUnique({ where: { id: recordId } });
  if (!record || record.state !== 'PENDING' || record.expiresAt <= new Date() || !sameSecret(record.tokenHash, digest(secret))) return false;
  const user = await db.userIdentity.upsert({ where: { telegramUserId }, update: {}, create: { telegramUserId } });
  if (record.mode === 'STAFF') {
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
    await ownerFor(telegramUserId, fullName);
    await db.telegramLoginRequest.update({ where: { id: record.id }, data: { state: 'CONFIRMED', telegramUserId, chatId, confirmedAt: new Date() } });
  }
  return true;
}

async function handleUpdate(update: TgUpdate) {
  const message = update.message;
  const callback = update.callback_query;
  if (callback?.message?.chat && callback.data) {
    const match = callback.data.match(/^payment:(approve|reject):([0-9a-f-]{36})$/i);
    if (!match) return;
    const admin = await adminFor(String(callback.message.chat.id), String(callback.from.id));
    if (!admin) { await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: 'Нет прав администратора.', show_alert: true }); return; }
    const proof = await db.telegramPaymentProof.findUnique({ where: { id: match[2] }, include: { consultation: true } });
    if (!proof || proof.state !== 'PENDING_REVIEW') { await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: 'Чек уже обработан.' }); return; }
    const approved = match[1] === 'approve';
    const consultationInvoice = proof.consultation?.appointmentId ? await db.invoice.findUnique({ where: { appointmentId: proof.consultation.appointmentId } }) : undefined;
    await db.$transaction([
      db.telegramPaymentProof.update({ where: { id: proof.id }, data: { state: approved ? 'CONFIRMED' : 'REJECTED', reviewedAt: new Date(), reviewedByChatId: admin.chatId } }),
      ...(proof.requestId ? [db.telegramRequest.update({ where: { id: proof.requestId }, data: { state: approved ? 'READY' : 'WAITING_PAYMENT' } })] : []),
      ...(proof.consultationId ? [db.consultation.update({ where: { id: proof.consultationId }, data: { paymentState: approved ? 'CONFIRMED' : 'AWAITING_PROOF', state: approved ? 'READY_FOR_SCHEDULING' : 'WAITING_PAYMENT' } })] : []),
      ...(consultationInvoice ? [db.invoice.update({ where: { id: consultationInvoice.id }, data: { state: approved ? 'PAID' : 'PENDING_PAYMENT_REVIEW', ...(approved ? { paidMinor: consultationInvoice.totalMinor } : {}) } })] : [])
    ]);
    await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: approved ? 'Оплата подтверждена.' : 'Оплата отклонена.' });
    await say(proof.chatId, approved ? 'Оплата подтверждена. Мы получили запрос и скоро вернёмся с ответом.' : 'Чек пока не удалось подтвердить. Проверьте перевод и отправьте новый скриншот.');
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
    await say(chatId, confirmed ? 'Готово. Вернитесь на сайт VetSvet — ваш личный профиль откроется автоматически.' : 'Эта ссылка недействительна, истекла или уже использована. Вернитесь на сайт и создайте новую.');
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
  if (text === '/start' || text === '/menu') {
    await say(chatId, 'VetSvet — забота рядом.\n\n/booking дата и пожелание — записаться\n/consultation вопрос — консультация\n/payment — как оплатить\n/emergency — срочная помощь\n\nДля команды: /invite РОЛЬ Имя (только администратор).');
    return;
  }
  if (text.startsWith('/booking')) {
    const request = await db.telegramRequest.create({ data: { telegramUserId, chatId, kind: 'APPOINTMENT', message: text.slice(8).trim() || 'Хочу записаться', state: 'NEW' } });
    const admins = await adminChats();
    await Promise.all(admins.map((admin) => say(admin.chatId, `Новая заявка на запись #${request.id.slice(0, 8)}\n${request.message}`)));
    await say(chatId, 'Заявка на запись принята. Команда уточнит свободное время и подтвердит её здесь.');
    return;
  }
  if (text.startsWith('/consultation')) {
    const request = await db.telegramRequest.create({ data: { telegramUserId, chatId, kind: 'CONSULTATION', message: text.slice(13).trim() || 'Нужна консультация', state: 'WAITING_PAYMENT' } });
    await say(chatId, `Запрос консультации #${request.id.slice(0, 8)} создан.\n\nПереведите согласованную с клиникой сумму по СБП на ${config.sbpPhone}, затем пришлите сюда скриншот чека — его подтвердит администратор.`);
    return;
  }
  if (text === '/payment') { await say(chatId, `Оплата консультации: перевод по СБП на ${config.sbpPhone}. После перевода отправьте сюда скриншот чека — его подтвердит администратор.`); return; }
  if (text === '/emergency') { await say(chatId, 'Если питомцу плохо прямо сейчас, не ждите ответа в чате: позвоните в клинику или обратитесь в ближайшую круглосуточную ветеринарную помощь.'); return; }
  if (message.photo?.length) {
    const consultation = await db.consultation.findFirst({ where: { organizationId: config.organizationId, telegramUserId, telegramChatId: chatId, state: { in: ['PAYMENT_LINKED', 'WAITING_PAYMENT'] }, paymentState: 'AWAITING_PROOF' }, orderBy: { createdAt: 'desc' } });
    const request = consultation ? undefined : await db.telegramRequest.findFirst({ where: { telegramUserId, state: 'WAITING_PAYMENT' }, orderBy: { createdAt: 'desc' } });
    const proof = await db.telegramPaymentProof.create({ data: { requestId: request?.id, consultationId: consultation?.id, telegramUserId, chatId, sourceMessageId: message.message_id, purpose: consultation || request ? 'CONSULTATION' : 'APPOINTMENT', state: 'PENDING_REVIEW' } });
    if (consultation) await db.consultation.update({ where: { id: consultation.id }, data: { paymentState: 'PENDING_REVIEW', state: 'PAYMENT_REVIEW' } });
    const admins = await adminChats();
    await Promise.all(admins.flatMap((admin) => [
      telegram('forwardMessage', { chat_id: admin.chatId, from_chat_id: chatId, message_id: message.message_id }),
      say(admin.chatId, `Чек #${proof.id.slice(0, 8)} — подтвердить перевод?`, [[{ text: '✓ Подтвердить', callback_data: `payment:approve:${proof.id}` }, { text: '✕ Отклонить', callback_data: `payment:reject:${proof.id}` }]])
    ]));
    await say(chatId, 'Чек получен и отправлен администратору на проверку.');
  }
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
  const user = await db.userIdentity.create({ data: { login, passwordHash: await passwordHash(input.password!), passwordUpdatedAt: new Date() } });
  if (mode === 'STAFF' && invite) {
    await db.$transaction([
      db.staffInvite.update({ where: { id: invite.id }, data: { state: 'ACCEPTED', acceptedAt: new Date(), acceptedByUserId: user.id } }),
      db.staffMembership.create({ data: { organizationId: config.organizationId, userId: user.id, role: invite.role, state: 'ACTIVE' } }),
      db.staffProfile.create({ data: { organizationId: config.organizationId, userId: user.id, employmentState: 'ACTIVE', specialties: [], locationIds: [] } })
    ]);
    await createPasswordSession(response, user.id, 'STAFF');
    json(response, 201, { account: { mode: 'STAFF' }, redirectTo: '/staff/' });
    return;
  }
  await db.owner.create({ data: { organizationId: config.organizationId, userId: user.id, fullName } });
  await createPasswordSession(response, user.id, 'CLIENT');
  json(response, 201, { account: { mode: 'CLIENT' }, redirectTo: '/client/' });
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
        json(response, 200, { account: { mode: 'STAFF', userId: current.userId, organizationId: config.organizationId, role: membership.role } });
        return;
      }
      const owner = await db.owner.findFirst({ where: { organizationId: config.organizationId, OR: [{ userId: current.userId }, { telegramUserId: current.user.telegramUserId ?? undefined }] } });
      json(response, 200, { account: { mode: 'CLIENT', userId: current.userId, organizationId: config.organizationId, owner } });
      return;
    }
    const dashboard = url.pathname.match(/^\/api\/v1\/client\/owners\/([^/]+)\/dashboard$/);
    if (request.method === 'GET' && dashboard) {
      const account = await currentOwner(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      const { owner } = account;
      if (!owner || owner.id !== decodeURIComponent(dashboard[1])) { json(response, 403, { error: 'FORBIDDEN' }); return; }
      const relations = await db.ownerPetRelation.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, include: { pet: true } });
      const petIds = relations.map((item) => item.pet.id);
      const [appointments, plans, groomingVisits, consultations, clinicalCases] = await Promise.all([
        db.appointment.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, orderBy: { startsAt: 'asc' }, take: 20 }),
        db.carePlan.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, include: { tasks: { orderBy: { dueAt: 'asc' } } } }),
        db.groomingVisit.findMany({ where: { organizationId: config.organizationId, petId: { in: petIds } }, orderBy: { createdAt: 'desc' }, take: 20 }),
        db.consultation.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
        db.clinicalCase.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id, petId: { in: petIds } }, include: { encounters: { where: { state: 'FINALIZED' }, include: { prescriptions: true }, orderBy: { finalizedAt: 'desc' } } }, orderBy: { openedAt: 'desc' }, take: 20 })
      ]);
      const variants = await db.serviceVariant.findMany({ where: { organizationId: config.organizationId, id: { in: appointments.map((item) => item.variantId) } }, include: { service: true } });
      const variantById = new Map(variants.map((item) => [item.id, item]));
      const groomingByAppointment = new Map(groomingVisits.map((item) => [item.appointmentId, item]));
      json(response, 200, { owner: { id: owner.id, fullName: owner.fullName, phone: owner.phone, email: owner.email }, pets: relations.map((item) => ({ id: item.pet.id, name: item.pet.name, species: item.pet.species, medicalAlerts: item.pet.medicalAlerts, appointments: appointments.filter((appointment) => appointment.petId === item.pet.id).map((appointment) => ({ id: appointment.id, state: appointment.state, startsAt: appointment.startsAt, endsAt: appointment.endsAt, service: variantById.get(appointment.variantId)?.service.publicName ?? 'Услуга VetSvet', variant: variantById.get(appointment.variantId)?.name ?? '', grooming: groomingByAppointment.get(appointment.id) ? { state: groomingByAppointment.get(appointment.id)!.state, report: groomingByAppointment.get(appointment.id)!.report, completedAt: groomingByAppointment.get(appointment.id)!.completedAt } : undefined })), careTasks: plans.filter((plan) => plan.petId === item.pet.id).flatMap((plan) => plan.tasks.map((task) => ({ id: task.id, title: task.title, state: task.state, dueAt: task.dueAt }))), clinicalHistory: clinicalCases.filter((clinicalCase) => clinicalCase.petId === item.pet.id).flatMap((clinicalCase) => clinicalCase.encounters.map((encounter) => ({ id: encounter.id, reason: clinicalCase.reason, assessment: encounter.assessment, plan: encounter.plan, finalizedAt: encounter.finalizedAt, prescriptions: encounter.prescriptions.map((prescription) => ({ medicationName: prescription.medicationName, instructions: prescription.instructions, state: prescription.state })) }))), timeline: [] })), consultations: consultations.map((item) => ({ id: item.id, petId: item.petId, appointmentId: item.appointmentId, question: item.question, state: item.state, paymentState: item.paymentState, response: item.response, respondedAt: item.respondedAt, createdAt: item.createdAt })), petCount: petIds.length });
      return;
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
    if (request.method === 'POST' && url.pathname === '/api/v1/client/appointments') {
      const account = await currentOwner(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { petId?: string; variantId?: string; locationId?: string; startsAt?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const [relation, variant, location] = await Promise.all([
        db.ownerPetRelation.findFirst({ where: { organizationId: config.organizationId, ownerId: account.owner.id, petId: String(input.petId ?? '') }, include: { pet: true } }),
        db.serviceVariant.findFirst({ where: { organizationId: config.organizationId, id: String(input.variantId ?? ''), service: { onlineBookable: true } }, include: { service: true } }),
        db.location.findFirst({ where: { organizationId: config.organizationId, id: String(input.locationId ?? ''), active: true } })
      ]);
      const startsAt = new Date(String(input.startsAt ?? ''));
      if (!relation || !variant || !location || Number.isNaN(startsAt.valueOf()) || startsAt <= new Date()) { json(response, 400, { error: 'INVALID_BOOKING_REQUEST' }); return; }
      const allowed = Array.isArray(variant.allowedSpecies) && variant.allowedSpecies.includes(relation.pet.species);
      if (!allowed) { json(response, 400, { error: 'SPECIES_NOT_ALLOWED' }); return; }
      if (variant.service.kind === 'CONSULTATION') { json(response, 400, { error: 'USE_CONSULTATION_WORKFLOW' }); return; }
      const endsAt = new Date(startsAt.valueOf() + variant.durationMinutes * 60_000);
      const conflict = await db.appointment.findFirst({ where: { organizationId: config.organizationId, petId: relation.petId, startsAt, state: { in: ['REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'READY'] } } });
      if (conflict) { json(response, 409, { error: 'DUPLICATE_APPOINTMENT_REQUEST' }); return; }
      const result = await db.$transaction(async (tx) => {
        const appointment = await tx.appointment.create({ data: { organizationId: config.organizationId, locationId: location.id, ownerId: account.owner.id, petId: relation.petId, variantId: variant.id, staffId: 'UNASSIGNED', startsAt, endsAt, state: 'REQUESTED' } });
        const invoice = await tx.invoice.create({ data: { organizationId: config.organizationId, ownerId: account.owner.id, appointmentId: appointment.id, state: variant.priceMinor > 0 ? 'ISSUED' : 'PENDING_QUOTE', totalMinor: variant.priceMinor, currency: variant.currency } });
        return { appointment, invoice };
      });
      await auditCommand({ actorId: account.current.userId, action: 'appointment.requested', aggregateType: 'Appointment', aggregateId: result.appointment.id, idempotencyKey: key, payload: { petId: relation.petId, variantId: variant.id } });
      json(response, 201, { appointment: { id: result.appointment.id, state: result.appointment.state, startsAt: result.appointment.startsAt, endsAt: result.appointment.endsAt }, invoice: { id: result.invoice.id, state: result.invoice.state, totalMinor: result.invoice.totalMinor, currency: result.invoice.currency } }); return;
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
        const invoice = await tx.invoice.create({ data: { organizationId: config.organizationId, ownerId: account.owner.id, appointmentId: appointment.id, state: 'PENDING_PAYMENT_REVIEW', totalMinor: variant.priceMinor, currency: variant.currency } });
        const consultation = await tx.consultation.create({ data: { organizationId: config.organizationId, ownerId: account.owner.id, petId: relation.petId, appointmentId: appointment.id, question, paymentTokenHash: digest(secret), paymentTokenExpiresAt: new Date(Date.now() + 48 * 60 * 60_000) } });
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
      const [owners, pets, variants, invoices, groomingVisits, consultations, encounters] = await Promise.all([
        db.owner.findMany({ where: { organizationId: config.organizationId, id: { in: appointments.map((item) => item.ownerId) } } }),
        db.pet.findMany({ where: { organizationId: config.organizationId, id: { in: appointments.map((item) => item.petId) } } }),
        db.serviceVariant.findMany({ where: { organizationId: config.organizationId, id: { in: appointments.map((item) => item.variantId) } }, include: { service: true } }),
        db.invoice.findMany({ where: { organizationId: config.organizationId, appointmentId: { in: appointments.map((item) => item.id) } } }),
        db.groomingVisit.findMany({ where: { organizationId: config.organizationId, appointmentId: { in: appointments.map((item) => item.id) } } }),
        db.consultation.findMany({ where: { organizationId: config.organizationId, appointmentId: { in: appointments.map((item) => item.id) } } }),
        db.encounter.findMany({ where: { organizationId: config.organizationId, appointmentId: { in: appointments.map((item) => item.id) } }, include: { prescriptions: true } })
      ]);
      const ownerById = new Map(owners.map((item) => [item.id, item])); const petById = new Map(pets.map((item) => [item.id, item])); const variantById = new Map(variants.map((item) => [item.id, item])); const invoiceByAppointment = new Map(invoices.filter((item) => item.appointmentId).map((item) => [item.appointmentId!, item])); const groomingByAppointment = new Map(groomingVisits.map((item) => [item.appointmentId, item])); const consultationByAppointment = new Map(consultations.map((item) => [item.appointmentId, item])); const encounterByAppointment = new Map(encounters.filter((item) => item.appointmentId).map((item) => [item.appointmentId!, item]));
      json(response, 200, { account: { role: account.membership.role }, appointments: appointments.map((item) => ({ id: item.id, state: item.state, startsAt: item.startsAt, endsAt: item.endsAt, staffId: item.staffId, owner: ownerById.get(item.ownerId)?.fullName ?? 'Владелец', pet: petById.get(item.petId)?.name ?? 'Питомец', species: petById.get(item.petId)?.species ?? 'OTHER', service: variantById.get(item.variantId)?.service.publicName ?? 'Услуга VetSvet', kind: variantById.get(item.variantId)?.service.kind ?? 'OTHER', variant: variantById.get(item.variantId)?.name ?? '', invoiceState: invoiceByAppointment.get(item.id)?.state ?? '—', encounter: encounterByAppointment.get(item.id) ? { id: encounterByAppointment.get(item.id)!.id, state: encounterByAppointment.get(item.id)!.state, assessment: encounterByAppointment.get(item.id)!.assessment, plan: encounterByAppointment.get(item.id)!.plan } : undefined, consultation: consultationByAppointment.get(item.id) ? { id: consultationByAppointment.get(item.id)!.id, state: consultationByAppointment.get(item.id)!.state, paymentState: consultationByAppointment.get(item.id)!.paymentState, question: consultationByAppointment.get(item.id)!.question, response: consultationByAppointment.get(item.id)!.response } : undefined, groomingVisit: groomingByAppointment.get(item.id) ? { id: groomingByAppointment.get(item.id)!.id, state: groomingByAppointment.get(item.id)!.state, report: groomingByAppointment.get(item.id)!.report } : undefined })) }); return;
    }
    const staffAppointment = url.pathname.match(/^\/api\/v1\/staff\/appointments\/([^/]+)$/);
    if (request.method === 'PATCH' && staffAppointment) {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { action?: string; note?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const appointment = await db.appointment.findFirst({ where: { id: decodeURIComponent(staffAppointment[1]), organizationId: config.organizationId } });
      if (!appointment) { json(response, 404, { error: 'NOT_FOUND' }); return; }
      const action = String(input.action ?? '').toUpperCase();
      if (action === 'CONFIRM') {
        if (appointment.state !== 'REQUESTED') { json(response, 409, { error: 'INVALID_APPOINTMENT_STATE' }); return; }
        const consultation = await db.consultation.findUnique({ where: { appointmentId: appointment.id } });
        if (consultation && consultation.paymentState !== 'CONFIRMED') { json(response, 409, { error: 'CONSULTATION_PAYMENT_REQUIRED' }); return; }
        const overlap = await db.appointment.findFirst({ where: { organizationId: config.organizationId, staffId: account.current.userId, state: { in: ['CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'READY'] }, startsAt: { lt: appointment.endsAt }, endsAt: { gt: appointment.startsAt } } });
        if (overlap) { json(response, 409, { error: 'STAFF_TIME_CONFLICT' }); return; }
        const updated = await db.appointment.update({ where: { id: appointment.id }, data: { state: 'CONFIRMED', staffId: account.current.userId } });
        if (consultation) await db.consultation.update({ where: { id: consultation.id }, data: { state: 'CONFIRMED', staffId: account.current.userId } });
        await auditCommand({ actorId: account.current.userId, action: 'appointment.confirmed', aggregateType: 'Appointment', aggregateId: appointment.id, idempotencyKey: key });
        json(response, 200, { appointment: { id: updated.id, state: updated.state, staffId: updated.staffId } }); return;
      }
      if (action === 'CANCEL') {
        if (!['REQUESTED', 'CONFIRMED'].includes(appointment.state)) { json(response, 409, { error: 'INVALID_APPOINTMENT_STATE' }); return; }
        const linkedConsultation = await db.consultation.findUnique({ where: { appointmentId: appointment.id } });
        const updated = await db.$transaction(async (tx) => {
          const cancelled = await tx.appointment.update({ where: { id: appointment.id }, data: { state: 'CANCELLED' } });
          if (linkedConsultation) await tx.consultation.update({ where: { id: linkedConsultation.id }, data: { state: 'CANCELLED' } });
          return cancelled;
        });
        await auditCommand({ actorId: account.current.userId, action: 'appointment.cancelled', aggregateType: 'Appointment', aggregateId: appointment.id, idempotencyKey: key, payload: { note: String(input.note ?? '').trim().slice(0, 500) } });
        json(response, 200, { appointment: { id: updated.id, state: updated.state } }); return;
      }
      const transitions: Record<string, string[]> = { CHECK_IN: ['CONFIRMED'], START: ['CHECKED_IN'], READY: ['IN_SERVICE'], COMPLETE: ['READY'] };
      if (action in transitions) {
        if (appointment.staffId !== account.current.userId && account.membership.role !== 'ADMIN') { json(response, 403, { error: 'ASSIGNED_STAFF_REQUIRED' }); return; }
        if (!transitions[action].includes(appointment.state)) { json(response, 409, { error: 'INVALID_APPOINTMENT_STATE' }); return; }
        const states: Record<string, string> = { CHECK_IN: 'CHECKED_IN', START: 'IN_SERVICE', READY: 'READY', COMPLETE: 'COMPLETED' };
        const updated = await db.appointment.update({ where: { id: appointment.id }, data: { state: states[action] } });
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
      let input: { appointmentId?: string; reason?: string; subjective?: string; objective?: string; assessment?: string; plan?: string; prescriptions?: { medicationName?: string; instructions?: string }[]; followUpAt?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const appointment = await db.appointment.findFirst({ where: { id: String(input.appointmentId ?? ''), organizationId: config.organizationId } });
      if (!appointment || appointment.state !== 'IN_SERVICE') { json(response, 409, { error: 'CLINICAL_VISIT_NOT_READY' }); return; }
      if (appointment.staffId !== account.current.userId && account.membership.role !== 'ADMIN') { json(response, 403, { error: 'ASSIGNED_STAFF_REQUIRED' }); return; }
      const variant = await db.serviceVariant.findFirst({ where: { id: appointment.variantId, organizationId: config.organizationId }, include: { service: true } });
      if (!variant || variant.service.kind !== 'VETERINARY') { json(response, 400, { error: 'VETERINARY_APPOINTMENT_REQUIRED' }); return; }
      if (await db.encounter.findUnique({ where: { appointmentId: appointment.id } })) { json(response, 409, { error: 'ENCOUNTER_ALREADY_FINALIZED' }); return; }
      const clean = (value: unknown, limit = 4000) => String(value ?? '').trim().slice(0, limit);
      const reason = clean(input.reason, 500); const subjective = clean(input.subjective); const objective = clean(input.objective); const assessment = clean(input.assessment); const planText = clean(input.plan);
      if (reason.length < 3 || assessment.length < 10 || planText.length < 10) { json(response, 400, { error: 'CLINICAL_SUMMARY_REQUIRED' }); return; }
      const prescriptions = Array.isArray(input.prescriptions) ? input.prescriptions.map((item) => ({ medicationName: clean(item.medicationName, 240), instructions: clean(item.instructions, 1000) })).filter((item) => item.medicationName && item.instructions).slice(0, 20) : [];
      const followUpAt = input.followUpAt ? new Date(input.followUpAt) : undefined;
      const existingCase = await db.clinicalCase.findFirst({ where: { organizationId: config.organizationId, ownerId: appointment.ownerId, petId: appointment.petId, status: 'OPEN' }, orderBy: { openedAt: 'desc' }, include: { encounters: { orderBy: { version: 'desc' }, take: 1 } } });
      const result = await db.$transaction(async (tx) => {
        const clinicalCase = existingCase ?? await tx.clinicalCase.create({ data: { organizationId: config.organizationId, ownerId: appointment.ownerId, petId: appointment.petId, status: 'OPEN', reason } });
        const version = (existingCase?.encounters[0]?.version ?? 0) + 1;
        const encounter = await tx.encounter.create({ data: { organizationId: config.organizationId, caseId: clinicalCase.id, appointmentId: appointment.id, petId: appointment.petId, version, state: 'FINALIZED', subjective: subjective || null, objective: objective || null, assessment, plan: planText, clinicianId: account.current.userId, finalizedAt: new Date(), prescriptions: { create: prescriptions.map((item) => ({ organizationId: config.organizationId, medicationName: item.medicationName, instructions: item.instructions, state: 'ACTIVE', prescriberId: account.current.userId })) } } });
        await tx.appointment.update({ where: { id: appointment.id }, data: { state: 'READY' } });
        if (followUpAt && !Number.isNaN(followUpAt.valueOf()) && followUpAt > new Date()) {
          const carePlan = await tx.carePlan.findFirst({ where: { organizationId: config.organizationId, ownerId: appointment.ownerId, petId: appointment.petId, state: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }) ?? await tx.carePlan.create({ data: { organizationId: config.organizationId, ownerId: appointment.ownerId, petId: appointment.petId, title: 'План лечения и наблюдения', state: 'ACTIVE' } });
          await tx.carePlanTask.create({ data: { carePlanId: carePlan.id, organizationId: config.organizationId, title: 'Контрольный приём', category: 'CLINICAL_FOLLOW_UP', dueAt: followUpAt, state: 'OPEN' } });
        }
        return encounter;
      });
      await auditCommand({ actorId: account.current.userId, action: 'clinical.encounter_finalized', aggregateType: 'Encounter', aggregateId: result.id, idempotencyKey: key, payload: { appointmentId: appointment.id, petId: appointment.petId } });
      json(response, 201, { encounter: { id: result.id, state: result.state, version: result.version, assessment: result.assessment, plan: result.plan } }); return;
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
      const result = await db.$transaction(async (tx) => {
        await tx.groomingProfile.upsert({ where: { organizationId_petId: { organizationId: config.organizationId, petId: appointment.petId } }, update: { coatType: trim(input.coatType, 180), sensitivities: trim(input.sensitivities), behaviorNotes: trim(input.behaviorNotes), preferredStyle: trim(input.preferredStyle, 240) }, create: { organizationId: config.organizationId, petId: appointment.petId, coatType: trim(input.coatType, 180), sensitivities: trim(input.sensitivities), behaviorNotes: trim(input.behaviorNotes), preferredStyle: trim(input.preferredStyle, 240) } });
        if (steps.length) await tx.groomingRecipe.updateMany({ where: { organizationId: config.organizationId, petId: appointment.petId, isPreferred: true }, data: { isPreferred: false } });
        const recipe = steps.length ? await tx.groomingRecipe.create({ data: { organizationId: config.organizationId, petId: appointment.petId, title: trim(input.recipeTitle, 180) ?? 'Индивидуальный уход', steps, isPreferred: true } }) : await tx.groomingRecipe.findFirst({ where: { organizationId: config.organizationId, petId: appointment.petId, isPreferred: true }, orderBy: { createdAt: 'desc' } });
        return tx.groomingVisit.create({ data: { organizationId: config.organizationId, appointmentId: appointment.id, petId: appointment.petId, recipeId: recipe?.id, state: 'IN_PROGRESS', beforeFileIds: [], afterFileIds: [], startedBy: account.current.userId } });
      });
      await auditCommand({ actorId: account.current.userId, action: 'grooming_visit.started', aggregateType: 'GroomingVisit', aggregateId: result.id, idempotencyKey: key, payload: { appointmentId: appointment.id } });
      json(response, 201, { visit: { id: result.id, state: result.state, appointmentId: result.appointmentId } }); return;
    }
    const groomingVisit = url.pathname.match(/^\/api\/v1\/staff\/grooming\/visits\/([^/]+)$/);
    if (request.method === 'PATCH' && groomingVisit) {
      const account = await currentStaff(request); const key = idempotencyKey(request);
      if (!account) { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      if (!['ADMIN', 'GROOMER'].includes(account.membership.role)) { json(response, 403, { error: 'GROOMING_ROLE_REQUIRED' }); return; }
      if (!key) { json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
      let input: { report?: string; nextCareAt?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
      const visit = await db.groomingVisit.findFirst({ where: { id: decodeURIComponent(groomingVisit[1]), organizationId: config.organizationId } });
      if (!visit || visit.state !== 'IN_PROGRESS') { json(response, 409, { error: 'GROOMING_VISIT_NOT_OPEN' }); return; }
      const report = String(input.report ?? '').trim(); if (report.length < 10 || report.length > 5000) { json(response, 400, { error: 'GROOMING_REPORT_REQUIRED' }); return; }
      const appointment = await db.appointment.findFirst({ where: { id: visit.appointmentId, organizationId: config.organizationId } });
      if (!appointment || (appointment.staffId !== account.current.userId && account.membership.role !== 'ADMIN')) { json(response, 403, { error: 'ASSIGNED_STAFF_REQUIRED' }); return; }
      const nextCareAt = input.nextCareAt ? new Date(input.nextCareAt) : undefined;
      const result = await db.$transaction(async (tx) => {
        const completed = await tx.groomingVisit.update({ where: { id: visit.id }, data: { state: 'COMPLETE', report, completedBy: account.current.userId, completedAt: new Date() } });
        await tx.appointment.update({ where: { id: appointment.id }, data: { state: 'READY' } });
        if (nextCareAt && !Number.isNaN(nextCareAt.valueOf()) && nextCareAt > new Date()) {
          const plan = await tx.carePlan.findFirst({ where: { organizationId: config.organizationId, ownerId: appointment.ownerId, petId: appointment.petId, state: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }) ?? await tx.carePlan.create({ data: { organizationId: config.organizationId, ownerId: appointment.ownerId, petId: appointment.petId, title: 'План ухода', state: 'ACTIVE' } });
          await tx.carePlanTask.create({ data: { carePlanId: plan.id, organizationId: config.organizationId, title: 'Запланировать следующий уход', category: 'GROOMING_REBOOK', dueAt: nextCareAt, state: 'OPEN' } });
        }
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

ensureOrganization().then(ensureBookingFoundation).then(() => server.listen(config.port, '127.0.0.1', () => console.log(`VetSvet production server on ${config.port}`))).catch((error) => { console.error(error); process.exit(1); });

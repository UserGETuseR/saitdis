import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Prisma, PrismaClient } from '@prisma/client';

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
  const eventPayload = (input.payload ?? {}) as Prisma.InputJsonValue;
  await db.$transaction([
    db.auditEvent.create({ data: { organizationId: config.organizationId, actorId: input.actorId, action: input.action, aggregateType: input.aggregateType, aggregateId: input.aggregateId, correlationId: input.idempotencyKey, metadata: eventPayload } }),
    db.outboxEvent.create({ data: { organizationId: config.organizationId, eventName: input.action, aggregateType: input.aggregateType, aggregateId: input.aggregateId, idempotencyKey: input.idempotencyKey, payload: eventPayload, occurredAt } })
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
    await db.$transaction(async (tx) => {
      await tx.telegramPaymentProof.update({ where: { id: proof.id }, data: { state: approved ? 'CONFIRMED' : 'REJECTED', reviewedAt: new Date(), reviewedByChatId: admin.chatId } });
      if (proof.requestId) await tx.telegramRequest.update({ where: { id: proof.requestId }, data: { state: approved ? 'READY' : 'WAITING_PAYMENT' } });
      if (proof.consultationId) await tx.consultation.update({ where: { id: proof.consultationId }, data: { paymentState: approved ? 'CONFIRMED' : 'AWAITING_PROOF', state: approved ? 'READY_FOR_SCHEDULING' : 'WAITING_PAYMENT' } });
      if (consultationInvoice) {
        if (approved && consultationInvoice.totalMinor > 0) {
          const payment = await tx.payment.create({ data: { organizationId: config.organizationId, invoiceId: consultationInvoice.id, provider: 'TELEGRAM_PROOF', providerTransactionId: proof.id, amountMinor: consultationInvoice.totalMinor, currency: consultationInvoice.currency, state: 'CONFIRMED', method: 'SBP_MANUAL_REVIEW', confirmedAt: new Date() } });
          await tx.fiscalReceipt.create({ data: { organizationId: config.organizationId, invoiceId: consultationInvoice.id, paymentId: payment.id, state: 'PENDING_PROVIDER', idempotencyKey: `telegram-proof:${proof.id}` } });
        }
        await tx.invoice.update({ where: { id: consultationInvoice.id }, data: { state: approved ? 'PAID' : 'PENDING_PAYMENT_REVIEW', ...(approved ? { paidMinor: consultationInvoice.totalMinor } : {}) } });
      }
    });
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
      const [appointments, plans, groomingVisits, consultations, clinicalCases, hospitalizations, invoices, documents, communications] = await Promise.all([
        db.appointment.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, orderBy: { startsAt: 'asc' }, take: 20 }),
        db.carePlan.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, include: { tasks: { orderBy: { dueAt: 'asc' } } } }),
        db.groomingVisit.findMany({ where: { organizationId: config.organizationId, petId: { in: petIds } }, orderBy: { createdAt: 'desc' }, take: 20 }),
        db.consultation.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
        db.clinicalCase.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id, petId: { in: petIds } }, include: { encounters: { where: { state: 'FINALIZED' }, include: { prescriptions: true }, orderBy: { finalizedAt: 'desc' } } }, orderBy: { openedAt: 'desc' }, take: 20 }),
        db.hospitalization.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, include: { bed: true, tasks: { orderBy: { scheduledAt: 'asc' } }, observations: { orderBy: { recordedAt: 'desc' }, take: 3 } }, orderBy: { admittedAt: 'desc' }, take: 20 }),
        db.invoice.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, include: { lines: true, payments: { orderBy: { createdAt: 'desc' } }, fiscalReceipts: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' }, take: 30 }),
        db.generatedDocument.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id, revokedAt: null }, orderBy: { createdAt: 'desc' }, take: 30 }),
        db.communicationLog.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, orderBy: { createdAt: 'desc' }, take: 50 })
      ]);
      const variants = await db.serviceVariant.findMany({ where: { organizationId: config.organizationId, id: { in: appointments.map((item) => item.variantId) } }, include: { service: true } });
      const variantById = new Map(variants.map((item) => [item.id, item]));
      const groomingByAppointment = new Map(groomingVisits.map((item) => [item.appointmentId, item]));
      const invoiceByAppointment = new Map(invoices.filter((item) => item.appointmentId).map((item) => [item.appointmentId!, item]));
      json(response, 200, { owner: { id: owner.id, fullName: owner.fullName, phone: owner.phone, email: owner.email, preferredChannel: owner.preferredChannel, marketingConsent: owner.marketingConsent }, pets: relations.map((item) => ({ id: item.pet.id, name: item.pet.name, species: item.pet.species, breed: item.pet.breed, medicalAlerts: item.pet.medicalAlerts, vaccinationDueAt: item.pet.vaccinationDueAt, appointments: appointments.filter((appointment) => appointment.petId === item.pet.id).map((appointment) => ({ id: appointment.id, state: appointment.state, startsAt: appointment.startsAt, endsAt: appointment.endsAt, service: variantById.get(appointment.variantId)?.service.publicName ?? 'Услуга VetSvet', variant: variantById.get(appointment.variantId)?.name ?? '', grooming: groomingByAppointment.get(appointment.id) ? { state: groomingByAppointment.get(appointment.id)!.state, report: groomingByAppointment.get(appointment.id)!.report, completedAt: groomingByAppointment.get(appointment.id)!.completedAt } : undefined })), careTasks: plans.filter((plan) => plan.petId === item.pet.id).flatMap((plan) => plan.tasks.map((task) => ({ id: task.id, title: task.title, state: task.state, dueAt: task.dueAt }))), clinicalHistory: clinicalCases.filter((clinicalCase) => clinicalCase.petId === item.pet.id).flatMap((clinicalCase) => clinicalCase.encounters.map((encounter) => ({ id: encounter.id, reason: clinicalCase.reason, assessment: encounter.assessment, plan: encounter.plan, finalizedAt: encounter.finalizedAt, prescriptions: encounter.prescriptions.map((prescription) => ({ medicationName: prescription.medicationName, instructions: prescription.instructions, state: prescription.state })) }))), timeline: [
        ...appointments.filter((appointment) => appointment.petId === item.pet.id).map((appointment) => ({ type: 'BOOKING', occurredAt: appointment.startsAt, title: variantById.get(appointment.variantId)?.service.publicName ?? 'Визит VetSvet', detail: appointment.state })),
        ...clinicalCases.filter((clinicalCase) => clinicalCase.petId === item.pet.id).flatMap((clinicalCase) => clinicalCase.encounters.map((encounter) => ({ type: 'HEALTH', occurredAt: encounter.finalizedAt ?? clinicalCase.openedAt, title: clinicalCase.reason, detail: encounter.assessment ?? 'Клиническая запись' }))),
        ...groomingVisits.filter((visit) => visit.petId === item.pet.id).map((visit) => ({ type: 'GROOMING', occurredAt: visit.completedAt ?? visit.createdAt, title: 'Уход и груминг', detail: visit.report ?? visit.state })),
        ...hospitalizations.filter((hospitalization) => hospitalization.petId === item.pet.id).map((hospitalization) => ({ type: 'HOSPITAL', occurredAt: hospitalization.dischargedAt ?? hospitalization.admittedAt, title: hospitalization.state === 'DISCHARGED' ? 'Выписка из стационара' : 'Стационар', detail: hospitalization.dischargeSummary ?? hospitalization.currentPlan ?? hospitalization.state })),
        ...documents.filter((document) => document.petId === item.pet.id).map((document) => ({ type: 'DOCUMENT', occurredAt: document.signedAt ?? document.createdAt, title: document.title, detail: document.state })),
        ...appointments.filter((appointment) => appointment.petId === item.pet.id).flatMap((appointment) => { const invoice = invoiceByAppointment.get(appointment.id); return invoice ? [{ type: 'FINANCE', occurredAt: invoice.createdAt, title: `Счёт ${(invoice.totalMinor / 100).toLocaleString('ru-RU')} ₽`, detail: invoice.state }] : []; }),
        ...communications.filter((communication) => !communication.petId || communication.petId === item.pet.id).map((communication) => ({ type: 'COMMUNICATION', occurredAt: communication.createdAt, title: communication.subject ?? 'Связь с VetSvet', detail: communication.body }))
      ].sort((left, right) => new Date(right.occurredAt).valueOf() - new Date(left.occurredAt).valueOf()).slice(0, 50) })), consultations: consultations.map((item) => ({ id: item.id, petId: item.petId, appointmentId: item.appointmentId, question: item.question, state: item.state, paymentState: item.paymentState, response: item.response, respondedAt: item.respondedAt, createdAt: item.createdAt })), hospitalizations: hospitalizations.map((item) => ({ id: item.id, petId: item.petId, state: item.state, acuity: item.acuity, currentPlan: item.currentPlan, ownerUpdateState: item.ownerUpdateState, alerts: item.alerts, bed: item.bed ? { label: item.bed.label, zone: item.bed.zone } : undefined, admittedAt: item.admittedAt, dischargedAt: item.dischargedAt, dischargeSummary: item.dischargeSummary, nextTasks: item.tasks.filter((task) => task.state === 'DUE').slice(0, 5).map((task) => ({ title: task.title, scheduledAt: task.scheduledAt })), lastObservation: item.observations[0] ? { acuity: item.observations[0].acuity, note: item.observations[0].note, recordedAt: item.observations[0].recordedAt } : undefined })), invoices: invoices.map((invoice) => ({ id: invoice.id, appointmentId: invoice.appointmentId, state: invoice.state, totalMinor: invoice.totalMinor, paidMinor: invoice.paidMinor, currency: invoice.currency, createdAt: invoice.createdAt, lines: invoice.lines.map((line) => ({ id: line.id, lineType: line.lineType, description: line.description, quantityMilli: line.quantityMilli, unitPriceMinor: line.unitPriceMinor, discountMinor: line.discountMinor, totalMinor: line.totalMinor })), payments: invoice.payments.map((payment) => ({ id: payment.id, amountMinor: payment.amountMinor, method: payment.method, state: payment.state, confirmedAt: payment.confirmedAt })), receiptState: invoice.fiscalReceipts[0]?.state })), documents: documents.map((document) => ({ id: document.id, petId: document.petId, appointmentId: document.appointmentId, invoiceId: document.invoiceId, kind: document.kind, title: document.title, documentVersion: document.documentVersion, state: document.state, contentHash: document.contentHash, createdAt: document.createdAt, signedAt: document.signedAt })), petCount: petIds.length });
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
        const invoice = await tx.invoice.create({ data: { organizationId: config.organizationId, ownerId: account.owner.id, appointmentId: appointment.id, state: variant.priceMinor > 0 ? 'ISSUED' : 'DRAFT', totalMinor: variant.priceMinor, currency: variant.currency, issuedAt: variant.priceMinor > 0 ? new Date() : null, lines: { create: { organizationId: config.organizationId, lineType: 'SERVICE', referenceId: variant.id, description: `${variant.service.publicName} · ${variant.name}`, unitPriceMinor: variant.priceMinor, totalMinor: variant.priceMinor } } } });
        const kind = variant.service.kind === 'GROOMING' ? 'GROOMING_CONSENT' : 'PROCEDURE_CONSENT';
        const template = await tx.printTemplate.findFirst({ where: { organizationId: config.organizationId, kind, state: 'PUBLISHED' }, orderBy: { version: 'desc' } });
        if (template) {
          const renderedBody = renderDocumentBody(template.body, { owner: account.owner.fullName, pet: relation.pet.name, service: variant.service.publicName, amount: `${(variant.priceMinor / 100).toLocaleString('ru-RU')} ₽` });
          await tx.generatedDocument.create({ data: { organizationId: config.organizationId, templateId: template.id, ownerId: account.owner.id, petId: relation.petId, appointmentId: appointment.id, invoiceId: invoice.id, kind: template.kind, title: template.title ?? 'Согласие VetSvet', documentVersion: `${template.kind}:v${template.version}`, renderedBody, contentHash: digest(renderedBody), createdBy: account.current.userId } });
        }
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
      json(response, 200, { account: { role: account.membership.role }, appointments: appointments.map((item) => ({ id: item.id, state: item.state, startsAt: item.startsAt, endsAt: item.endsAt, staffId: item.staffId, owner: ownerById.get(item.ownerId)?.fullName ?? 'Владелец', pet: petById.get(item.petId)?.name ?? 'Питомец', species: petById.get(item.petId)?.species ?? 'OTHER', service: variantById.get(item.variantId)?.service.publicName ?? 'Услуга VetSvet', kind: variantById.get(item.variantId)?.service.kind ?? 'OTHER', variant: variantById.get(item.variantId)?.name ?? '', invoiceState: invoiceByAppointment.get(item.id)?.state ?? '—', hospitalization: hospitalizationByAppointment.get(item.id) ? { id: hospitalizationByAppointment.get(item.id)!.id, state: hospitalizationByAppointment.get(item.id)!.state } : undefined, encounter: encounterByAppointment.get(item.id) ? { id: encounterByAppointment.get(item.id)!.id, state: encounterByAppointment.get(item.id)!.state, assessment: encounterByAppointment.get(item.id)!.assessment, plan: encounterByAppointment.get(item.id)!.plan } : undefined, consultation: consultationByAppointment.get(item.id) ? { id: consultationByAppointment.get(item.id)!.id, state: consultationByAppointment.get(item.id)!.state, paymentState: consultationByAppointment.get(item.id)!.paymentState, question: consultationByAppointment.get(item.id)!.question, response: consultationByAppointment.get(item.id)!.response } : undefined, groomingVisit: groomingByAppointment.get(item.id) ? { id: groomingByAppointment.get(item.id)!.id, state: groomingByAppointment.get(item.id)!.state, report: groomingByAppointment.get(item.id)!.report } : undefined })) }); return;
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
          const payment = await tx.payment.create({ data: { organizationId: config.organizationId, invoiceId: invoice.id, provider: 'MANUAL', providerTransactionId, amountMinor, currency: invoice.currency, state: 'CONFIRMED', method, confirmedAt: new Date() } });
          const paidMinor = invoice.paidMinor + amountMinor;
          const updated = await tx.invoice.update({ where: { id: invoice.id }, data: { paidMinor, state: invoiceState(invoice.totalMinor, paidMinor, true) } });
          const receipt = await tx.fiscalReceipt.create({ data: { organizationId: config.organizationId, invoiceId: invoice.id, paymentId: payment.id, state: 'PENDING_PROVIDER', idempotencyKey: `manual-payment:${key}` } });
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
      json(response, 200, { range: { days, from, to: now }, definitionsVersion: 'v1', revenue: { collectedMinor, outstandingMinor, averageTicketMinor: paidInvoiceIds.size ? Math.round(collectedMinor / paidInvoiceIds.size) : 0, byKind: Object.fromEntries(revenueByKind) }, booking: { total: appointments.length, requested: appointments.filter((appointment) => appointment.state === 'REQUESTED').length, completed: completed.length, cancelled: appointments.filter((appointment) => appointment.state === 'CANCELLED').length, conversionPercent: appointments.length ? Math.round(completed.length / appointments.length * 1000) / 10 : 0 }, clients: { total: owners.length, new: owners.filter((owner) => owner.createdAt >= from).length, returning: returningOwnerIds.size, activePets: pets.length }, consultations: { total: consultations.length, paid: consultations.filter((consultation) => consultation.paymentState === 'CONFIRMED').length, waitingPayment: consultations.filter((consultation) => consultation.paymentState !== 'CONFIRMED').length, answered: consultations.filter((consultation) => consultation.state === 'ANSWERED').length }, hospital: { admitted: hospitalizations.length, active: hospitalizations.filter((hospitalization) => ['ADMITTED', 'IN_TREATMENT', 'DISCHARGE_READY'].includes(hospitalization.state)).length, treatmentDue: treatmentTasks.filter((task) => task.state === 'DUE').length, treatmentCompleted: treatmentTasks.filter((task) => task.state === 'COMPLETED').length }, inventory: { stockValueMinor, lowStockItems: inventoryItems.filter((item) => usableLots.filter((lot) => lot.itemId === item.id).reduce((sum, lot) => sum + lot.quantityMilli, 0) <= item.lowStockThresholdMilli).length, expiringLots: usableLots.filter((lot) => lot.expiryAt && lot.expiryAt <= expiringAt).length }, staff: [...new Set(appointments.filter((appointment) => appointment.staffId !== 'UNASSIGNED').map((appointment) => appointment.staffId))].map((staffId) => ({ staffId, appointments: appointments.filter((appointment) => appointment.staffId === staffId).length, completed: completed.filter((appointment) => appointment.staffId === staffId).length })) }); return;
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
      let input: { action?: string; note?: string } = {}; try { input = JSON.parse(await body(request)); } catch { json(response, 400, { error: 'INVALID_REQUEST' }); return; }
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

ensureOrganization().then(ensureBookingFoundation).then(ensureDocumentFoundation).then(() => server.listen(config.port, '127.0.0.1', () => console.log(`VetSvet production server on ${config.port}`))).catch((error) => { console.error(error); process.exit(1); });

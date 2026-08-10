import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
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
  adminSetupSecret: required('VETSVET_ADMIN_SETUP_SECRET'),
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
function cookie(request: IncomingMessage, name: string) {
  return request.headers.cookie?.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}
async function session(request: IncomingMessage) {
  const token = cookie(request, 'vetsvet_session');
  if (!token) return undefined;
  return db.authSession.findFirst({ where: { tokenHash: digest(token), state: 'ACTIVE', expiresAt: { gt: new Date() } }, include: { user: true } });
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
async function ownerFor(telegramUserId: string, fullName: string) {
  return db.owner.upsert({ where: { organizationId_telegramUserId: { organizationId: config.organizationId, telegramUserId } }, update: { fullName }, create: { organizationId: config.organizationId, telegramUserId, fullName } });
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

async function confirmTelegramLogin(recordId: string, secret: string, telegramUserId: string, chatId: string, fullName: string) {
  const record = await db.telegramLoginRequest.findUnique({ where: { id: recordId } });
  if (!record || record.state !== 'PENDING' || record.expiresAt <= new Date() || !sameSecret(record.tokenHash, digest(secret))) return false;
  const user = await db.userIdentity.upsert({ where: { telegramUserId }, update: {}, create: { telegramUserId } });
  if (record.mode === 'STAFF') {
    const invite = record.staffInviteId ? await db.staffInvite.findUnique({ where: { id: record.staffInviteId } }) : undefined;
    if (!invite || invite.state !== 'PENDING' || invite.expiresAt <= new Date()) return false;
    await db.$transaction([
      db.staffInvite.update({ where: { id: invite.id }, data: { state: 'ACCEPTED', acceptedAt: new Date(), acceptedByUserId: user.id } }),
      db.staffMembership.upsert({ where: { organizationId_userId: { organizationId: config.organizationId, userId: user.id } }, update: { role: invite.role, state: 'ACTIVE' }, create: { organizationId: config.organizationId, userId: user.id, role: invite.role, state: 'ACTIVE' } }),
      db.staffProfile.upsert({ where: { organizationId_userId: { organizationId: config.organizationId, userId: user.id } }, update: { employmentState: 'ACTIVE' }, create: { organizationId: config.organizationId, userId: user.id, employmentState: 'ACTIVE', specialties: [], locationIds: [] } }),
      db.telegramLoginRequest.update({ where: { id: record.id }, data: { state: 'CONFIRMED', telegramUserId, chatId, confirmedAt: new Date() } })
    ]);
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
    const proof = await db.telegramPaymentProof.findUnique({ where: { id: match[2] } });
    if (!proof || proof.state !== 'PENDING_REVIEW') { await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: 'Чек уже обработан.' }); return; }
    const approved = match[1] === 'approve';
    await db.$transaction([
      db.telegramPaymentProof.update({ where: { id: proof.id }, data: { state: approved ? 'CONFIRMED' : 'REJECTED', reviewedAt: new Date(), reviewedByChatId: admin.chatId } }),
      ...(proof.requestId ? [db.telegramRequest.update({ where: { id: proof.requestId }, data: { state: approved ? 'READY' : 'WAITING_PAYMENT' } })] : [])
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
  const login = text.match(/^\/start\s+(?:l|login)_([0-9a-f-]{36})_([A-Za-z0-9_-]{16,})$/i);
  if (login) {
    const confirmed = await confirmTelegramLogin(login[1], login[2], telegramUserId, chatId, fullName);
    await say(chatId, confirmed ? 'Готово. Вернитесь на сайт VetSvet — ваш личный профиль откроется автоматически.' : 'Эта ссылка недействительна, истекла или уже использована. Вернитесь на сайт и создайте новую.');
    return;
  }
  const claim = text.match(/^\/admin\s+(.+)$/);
  if (claim && sameSecret(claim[1], config.adminSetupSecret)) {
    await db.telegramAdminChat.upsert({ where: { singletonKey: `admin:${telegramUserId}` }, update: { chatId, telegramUserId }, create: { singletonKey: `admin:${telegramUserId}`, chatId, telegramUserId } });
    await say(chatId, 'Вы подключены как администратор VetSvet. Ваш доступ не заменит другого администратора: заявки, чеки и приглашения будут приходить каждому из вас.');
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
    const request = await db.telegramRequest.findFirst({ where: { telegramUserId, state: 'WAITING_PAYMENT' }, orderBy: { createdAt: 'desc' } });
    const proof = await db.telegramPaymentProof.create({ data: { requestId: request?.id, telegramUserId, chatId, sourceMessageId: message.message_id, purpose: request ? 'CONSULTATION' : 'APPOINTMENT', state: 'PENDING_REVIEW' } });
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
    const invite = parsed ? await db.staffInvite.findUnique({ where: { id: parsed.id } }) : undefined;
    if (!parsed || !invite || invite.state !== 'PENDING' || invite.expiresAt <= new Date() || !sameSecret(invite.tokenHash, digest(parsed.token))) { json(response, 403, { error: 'INVITE_REQUIRED' }); return; }
    staffInviteId = invite.id;
  }
  const secret = randomBytes(16).toString('base64url');
  const expiresAt = new Date(Date.now() + 600000);
  const record = await db.telegramLoginRequest.create({ data: { tokenHash: digest(secret), mode, staffInviteId, expiresAt } });
  json(response, 201, { requestId: record.id, expiresAt, telegramUrl: `https://t.me/${config.botUsername}?start=l_${record.id}_${secret}` });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', config.publicUrl);
  try {
    if (request.method === 'GET' && url.pathname === '/healthz') { await db.$queryRawUnsafe('SELECT 1'); json(response, 200, { status: 'ok' }); return; }
    if (request.method === 'POST' && url.pathname === '/telegram/webhook') {
      if (request.headers['x-telegram-bot-api-secret-token'] !== config.webhookSecret) { json(response, 403, { error: 'FORBIDDEN' }); return; }
      await handleUpdate(JSON.parse(await body(request)) as TgUpdate); json(response, 200, { ok: true }); return;
    }
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
      response.setHeader('set-cookie', `vetsvet_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
      json(response, 200, { state: 'AUTHENTICATED', redirectTo: record.mode === 'STAFF' ? '/staff/' : '/client/' });
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
      const owner = await db.owner.findFirst({ where: { organizationId: config.organizationId, telegramUserId: current.user.telegramUserId ?? undefined } });
      json(response, 200, { account: { mode: 'CLIENT', userId: current.userId, organizationId: config.organizationId, owner } });
      return;
    }
    const dashboard = url.pathname.match(/^\/api\/v1\/client\/owners\/([^/]+)\/dashboard$/);
    if (request.method === 'GET' && dashboard) {
      const current = await session(request);
      if (!current || current.mode !== 'CLIENT') { json(response, 401, { error: 'UNAUTHORIZED' }); return; }
      const owner = await db.owner.findFirst({ where: { organizationId: config.organizationId, telegramUserId: current.user.telegramUserId ?? undefined } });
      if (!owner || owner.id !== decodeURIComponent(dashboard[1])) { json(response, 403, { error: 'FORBIDDEN' }); return; }
      const pets = await db.ownerPetRelation.findMany({ where: { organizationId: config.organizationId, ownerId: owner.id }, include: { pet: true } });
      json(response, 200, { owner: { id: owner.id, fullName: owner.fullName }, pets: pets.map((item) => ({ id: item.pet.id, name: item.pet.name, species: item.pet.species, appointments: [], careTasks: [], timeline: [] })) });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/auth/sign-out') {
      const current = await session(request);
      if (current) await db.authSession.update({ where: { id: current.id }, data: { state: 'REVOKED', revokedAt: new Date() } });
      response.setHeader('set-cookie', 'vetsvet_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'); json(response, 200, { ok: true }); return;
    }
    if (request.method === 'GET' && (url.pathname === '/client/' || url.pathname === '/client')) {
      const current = await session(request); if (!current || current.mode !== 'CLIENT') { redirect(response, '/auth/'); return; }
      await serve(response, clientRoot, 'index.html'); return;
    }
    if (request.method === 'GET' && url.pathname.startsWith('/client/')) { await serve(response, clientRoot, decodeURIComponent(url.pathname.slice(8))); return; }
    if (request.method === 'GET' && (url.pathname === '/staff/' || url.pathname === '/staff')) {
      const current = await session(request); if (!current || current.mode !== 'STAFF') { redirect(response, '/auth/?mode=staff'); return; }
      const membership = await db.staffMembership.findUnique({ where: { organizationId_userId: { organizationId: config.organizationId, userId: current.userId } } });
      if (!membership || membership.state !== 'ACTIVE') { redirect(response, '/auth/?mode=staff'); return; }
      await serve(response, staffRoot, 'index.html'); return;
    }
    if (request.method === 'GET' && url.pathname.startsWith('/staff/')) { await serve(response, staffRoot, decodeURIComponent(url.pathname.slice(7))); return; }
    if (request.method === 'GET' && (url.pathname === '/auth/' || url.pathname === '/auth' || url.pathname === '/auth/telegram.html')) { await serve(response, authRoot, 'index.html'); return; }
    if (request.method === 'GET' && url.pathname.startsWith('/Photo/')) { await serve(response, photoRoot, decodeURIComponent(url.pathname.slice(7))); return; }
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) { await serve(response, publicRoot, 'index.html'); return; }
    json(response, 404, { error: 'NOT_FOUND' });
  } catch (error) { console.error(error); json(response, 500, { error: 'INTERNAL_ERROR' }); }
});

ensureOrganization().then(() => server.listen(config.port, '127.0.0.1', () => console.log(`VetSvet production server on ${config.port}`))).catch((error) => { console.error(error); process.exit(1); });

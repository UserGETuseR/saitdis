/**
 * Local development entry point only. It deliberately uses in-memory adapters
 * and must never be deployed as a production clinical or payment service.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createFoundation } from './foundation';
import { DomainError } from './core/errors';
import type { Actor, CommandMeta } from './core/types';
import { createPersistenceRuntime } from './platform/persistence-runtime';

const port = Number(process.env.VETSVET_PORT ?? 4300);
const root = process.cwd();
const publicRoot = resolve(root, 'apps', 'public-web');
const clientRoot = resolve(root, 'apps', 'client-web');
const staffRoot = resolve(root, 'apps', 'staff-web');
const authRoot = resolve(root, 'apps', 'auth-web');
const photoRoot = resolve(root, 'Photo');
const app = createFoundation();
const persistence = createPersistenceRuntime();
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
const isProduction = process.env.NODE_ENV === 'production';
type AccountMode = 'CLIENT' | 'STAFF';
type AuthIntent = { mode: AccountMode; organizationId: string; phone: string; fullName?: string; userId: string; ownerId?: string };
type BrowserSession = { sessionId: string; tokenHash: string; userId: string; organizationId: string; mode: AccountMode; ownerId?: string; expiresAt: string };
const authIntents = new Map<string, AuthIntent>();
const browserSessions = new Map<string, BrowserSession>();
const identitiesByPhone = new Map<string, { userId: string; ownerId?: string; organizationId: string }>();
const LOCAL_ORGANIZATION_ID = 'vetsvet-local';
const LOCAL_ADMIN_ID = 'vetsvet-local-admin';
const LOCAL_STAFF_PHONE = process.env.VETSVET_LOCAL_STAFF_PHONE ?? '+79990000000';

function normalizePhone(value: unknown): string {
  if (typeof value !== 'string') throw new DomainError('VALIDATION', 'Phone is required.');
  const digits = value.replace(/\D/g, '');
  const normalized = digits.length === 11 && digits.startsWith('8') ? `+7${digits.slice(1)}` : digits.length === 11 && digits.startsWith('7') ? `+${digits}` : `+${digits}`;
  if (!/^\+\d{10,15}$/.test(normalized)) throw new DomainError('VALIDATION', 'Enter a valid phone number.');
  return normalized;
}

function cookieValue(request: IncomingMessage, name: string): string | undefined {
  const raw = request.headers.cookie ?? '';
  return raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function currentSession(request: IncomingMessage): BrowserSession | undefined {
  const token = cookieValue(request, 'vetsvet_session');
  if (!token) return undefined;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const session = browserSessions.get(tokenHash);
  if (!session || new Date(session.expiresAt) <= new Date() || app.auth.sessions.get(session.sessionId)?.state !== 'ACTIVE') return undefined;
  return session;
}

function setSessionCookie(response: ServerResponse, token: string): void {
  response.setHeader('set-cookie', `vetsvet_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${isProduction ? '; Secure' : ''}`);
}

function clearSessionCookie(response: ServerResponse): void {
  response.setHeader('set-cookie', `vetsvet_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction ? '; Secure' : ''}`);
}

function requireSession(request: IncomingMessage, mode?: AccountMode): BrowserSession {
  const session = currentSession(request);
  if (!session || (mode && session.mode !== mode)) throw new DomainError('FORBIDDEN', 'Sign in is required.');
  return session;
}

function redirect(response: ServerResponse, location: string): void {
  response.writeHead(302, { location, 'cache-control': 'no-store' }); response.end();
}

function seedLocalIdentity(): void {
  if (app.organizations.organizations.has(LOCAL_ORGANIZATION_ID)) return;
  const actor: Actor = { userId: LOCAL_ADMIN_ID, organizationId: LOCAL_ORGANIZATION_ID, source: 'STAFF_APP' };
  app.organizations.createOrganization({ legalName: 'VetSvet Local', displayName: 'ВетСвет' }, { actor, idempotencyKey: 'local-organization', correlationId: 'local-organization' });
  const staffId = 'vetsvet-local-staff';
  app.access.grantMembership({ userId: staffId, role: 'MANAGER' }, actor);
  identitiesByPhone.set(normalizePhone(LOCAL_STAFF_PHONE), { userId: staffId, organizationId: LOCAL_ORGANIZATION_ID });
}
seedLocalIdentity();

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>; }
  catch { throw new DomainError('VALIDATION', 'Request body must be valid JSON.'); }
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new DomainError('VALIDATION', `${name} is required.`);
  return value.trim();
}

function developmentActor(request: IncomingMessage, organizationId: string): Actor {
  return {
    userId: String(request.headers['x-vetsvet-user-id'] ?? 'local-owner'),
    organizationId,
    source: 'STAFF_APP',
  };
}

function staffActorFromSession(request: IncomingMessage, organizationId: string): Actor {
  const session = requireSession(request, 'STAFF');
  if (session.organizationId !== organizationId) throw new DomainError('FORBIDDEN', 'This organization is not available.');
  return { userId: session.userId, organizationId: session.organizationId, source: 'STAFF_APP' };
}

function command(request: IncomingMessage, organizationId: string): CommandMeta {
  return {
    actor: developmentActor(request, organizationId),
    idempotencyKey: String(request.headers['idempotency-key'] ?? crypto.randomUUID()),
    correlationId: String(request.headers['x-correlation-id'] ?? crypto.randomUUID()),
  };
}

function clientDashboard(organizationId: string, ownerId: string): Record<string, unknown> {
  const owner = app.ownerPets.owners.get(ownerId);
  if (!owner || owner.organizationId !== organizationId) throw new DomainError('NOT_FOUND', 'Owner is not available in this organization.');
  const pets = app.ownerPets.relations.filter((relation) => relation.organizationId === organizationId && relation.ownerId === ownerId).map((relation) => app.ownerPets.pets.get(relation.petId)).filter((pet): pet is NonNullable<typeof pet> => Boolean(pet));
  return { owner: { id: owner.id, fullName: owner.fullName }, pets: pets.map((pet) => ({ id: pet.id, name: pet.name, species: pet.species, appointments: [...app.booking.appointments.values()].filter((appointment) => appointment.organizationId === organizationId && appointment.petId === pet.id).map((appointment) => ({ id: appointment.id, startsAt: appointment.startsAt, state: appointment.state })), careTasks: [...app.carePlans.tasks.values()].filter((task) => task.organizationId === organizationId && task.status === 'OPEN' && app.carePlans.plans.get(task.carePlanId)?.petId === pet.id).map((task) => ({ id: task.id, title: task.title, dueAt: task.dueAt, category: task.category })), timeline: app.timeline.forPet(organizationId, pet.id).slice(0, 12).map((event) => ({ eventName: event.eventName, occurredAt: event.occurredAt })) })) };
}

function staffSummary(organizationId: string): Record<string, unknown> {
  const upcomingAppointments = [...app.booking.appointments.values()].filter((appointment) => appointment.organizationId === organizationId && !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appointment.state)).sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  return { appointments: upcomingAppointments.map((appointment) => ({ id: appointment.id, petId: appointment.petId, startsAt: appointment.startsAt, state: appointment.state, staffId: appointment.staffId })), surgery: [...app.surgery.cases.values()].filter((item) => item.organizationId === organizationId).map((item) => ({ id: item.id, petId: item.petId, procedure: item.procedure, state: item.state, scheduledAt: item.scheduledAt })), equipment: [...app.equipment.equipment.values()].filter((item) => item.organizationId === organizationId).map((item) => ({ id: item.id, name: item.name, state: item.state, locationId: item.locationId })), procurement: [...app.procurement.orders.values()].filter((item) => item.organizationId === organizationId).map((item) => ({ id: item.id, state: item.state, locationId: item.locationId, lines: item.lines.length })), specimens: [...app.specimens.specimens.values()].filter((item) => item.organizationId === organizationId).map((item) => ({ id: item.id, state: item.state, type: item.type, collectedAt: item.collectedAt })) };
}

async function serveFile(response: ServerResponse, rootPath: string, unsafePath: string): Promise<void> {
  const target = normalize(join(rootPath, unsafePath));
  if (!target.startsWith(rootPath)) { sendJson(response, 403, { error: 'Forbidden path.' }); return; }
  try {
    const file = await readFile(target);
    response.writeHead(200, { 'content-type': mime[extname(target).toLowerCase()] ?? 'application/octet-stream', 'cache-control': extname(target).toLowerCase() === '.html' ? 'no-store, max-age=0' : 'public, max-age=300' });
    response.end(file);
  } catch { sendJson(response, 404, { error: 'File not found.' }); }
}

const staffOperatingBoard = `<section class="card operating" aria-label="Операционный контур"><div class="card-head"><h2>Операционный контур · сегодня</h2><span class="count">6</span></div><p class="operating-sub">Путь пациента виден всей команде: подготовка, операционная, восстановление и безопасная передача домой.</p><div class="surgery-lane"><article class="surgery-stage"><span class="stage-kicker"><span>Запланировано</span><i class="stage-dot"></i></span><h3>Барс · 10:30</h3><p>Санация. Команда и операционная подтверждены.</p><button type="button" aria-label="Открыть план Барса"></button></article><article class="surgery-stage"><span class="stage-kicker"><span>Подготовка</span><i class="stage-dot"></i></span><h3>Рокки · 11:00</h3><p>Чек-лист 4 из 5. Ожидается предоперационная отметка.</p><button type="button" aria-label="Открыть подготовку Рокки"></button></article><article class="surgery-stage active"><span class="stage-kicker"><span>Готов</span><i class="stage-dot"></i></span><h3>Луна · 11:40</h3><p>Согласие, голодная пауза и чек-лист подтверждены.</p><button type="button" aria-label="Открыть готовый случай Луны"></button></article><article class="surgery-stage"><span class="stage-kicker"><span>Процедура</span><i class="stage-dot"></i></span><h3>Тиша · 12:10</h3><p>Анестезиологический лист активен. Витальные — 2 минуты назад.</p><button type="button" aria-label="Открыть лист Тиши"></button></article><article class="surgery-stage"><span class="stage-kicker"><span>Восстановление</span><i class="stage-dot"></i></span><h3>Бакс · 12:45</h3><p>Нужно документировать контроль восстановления.</p><button type="button" aria-label="Открыть восстановление Бакса"></button></article><article class="surgery-stage"><span class="stage-kicker"><span>К выписке</span><i class="stage-dot"></i></span><h3>Соня · 13:20</h3><p>Памятка и следующий контроль готовы к передаче.</p><button type="button" aria-label="Открыть выписку Сони"></button></article></div><p class="operating-note">Не просто статус: каждый переход требует нужной клинической отметки и остаётся в истории пациента.</p></section>`;

const staffDentalSnapshot = `<section class="card operating" aria-label="Стоматологический контур"><div class="card-head"><h2>Стоматология · карты пациентов</h2><span class="count">2</span></div><p class="operating-sub">Структурированная зубная карта делает результат понятным врачу, ассистенту и следующей смене.</p><div class="surgery-lane"><article class="surgery-stage active"><span class="stage-kicker"><span>Карта открыта</span><i class="stage-dot"></i></span><h3>Барс · зуб 204</h3><p>Находка подтверждена. План процедуры создан и ожидает фиксации результата.</p><button type="button" aria-label="Открыть зубную карту Барса"></button></article><article class="surgery-stage"><span class="stage-kicker"><span>Нужна отметка</span><i class="stage-dot"></i></span><h3>Луна · зуб 108</h3><p>Процедура в работе. Финализация будет доступна после клинической записи.</p><button type="button" aria-label="Открыть зубную карту Луны"></button></article><article class="surgery-stage"><span class="stage-kicker"><span>Версия 2</span><i class="stage-dot"></i></span><h3>Тиша · контроль</h3><p>Новая запись хранится отдельно: история предыдущего осмотра остаётся доступной.</p><button type="button" aria-label="Открыть контрольную карту Тиши"></button></article></div><p class="operating-note">Зубная карта — не декоративная схема: каждая находка, процедура и поправка имеет автора и время.</p></section>`;

const staffLabSnapshot = `<section class="card operating" aria-label="Лабораторная цепочка"><div class="card-head"><h2>Лаборатория · цепочка проб</h2><span class="count">3</span></div><p class="operating-sub">Каждая передача фиксируется. Этикетка использует служебный токен — без ФИО, телефона и диагноза.</p><div class="surgery-lane"><article class="surgery-stage active"><span class="stage-kicker"><span>Собрано</span><i class="stage-dot"></i></span><h3>S-8F31C2A1</h3><p>Кровь · пробирка EDTA · токен VS-••••. Готово к передаче.</p><button type="button" aria-label="Открыть собранную пробу"></button></article><article class="surgery-stage"><span class="stage-kicker"><span>В пути</span><i class="stage-dot"></i></span><h3>S-5B170A4E</h3><p>Внешняя лаборатория. В карточке есть время и ответственный за передачу.</p><button type="button" aria-label="Открыть пробу в пути"></button></article><article class="surgery-stage"><span class="stage-kicker"><span>Результат</span><i class="stage-dot"></i></span><h3>S-93D220B7</h3><p>Получено. Результат ожидает клинической оценки, не уходит владельцу автоматически.</p><button type="button" aria-label="Открыть результат пробы"></button></article></div><p class="operating-note">Сканирование открывает нужную служебную карточку, а не раскрывает чувствительные данные на физической наклейке.</p></section>`;

const staffProcurementSnapshot = `<section class="card operating" aria-label="Закупки и склад"><div class="card-head"><h2>Закупки · поступления</h2><span class="count">2</span></div><p class="operating-sub">Остаток меняется только после приёмки. Команда видит расхождения до того, как они станут проблемой на смене.</p><div class="surgery-lane"><article class="surgery-stage"><span class="stage-kicker"><span>На согласовании</span><i class="stage-dot"></i></span><h3>PO-0184</h3><p>Расходники для стационара. Заказ ждёт утверждения менеджером.</p><button type="button" aria-label="Открыть заказ PO-0184"></button></article><article class="surgery-stage active"><span class="stage-kicker"><span>Частично принято</span><i class="stage-dot"></i></span><h3>PO-0185 · 6 из 10</h3><p>Перчатки внесены на склад. Четыре единицы остаются ожидаемыми.</p><button type="button" aria-label="Открыть частично принятый заказ"></button></article><article class="surgery-stage"><span class="stage-kicker"><span>Получено</span><i class="stage-dot"></i></span><h3>PO-0181</h3><p>Поставка сверена. Движение остатков сохранено с привязкой к заказу.</p><button type="button" aria-label="Открыть полученный заказ"></button></article></div><p class="operating-note">Нельзя принять больше заказанного: расхождение фиксируется в документе, а не исчезает в ручной корректировке.</p></section>`;

async function serveStaffWorkspace(response: ServerResponse): Promise<void> {
  try {
    const html = await readFile(join(staffRoot, 'index.html'), 'utf8');
    const enhanced = html.replace('</head>', '<link rel="stylesheet" href="/staff/staff-enhancement.css"></head>').replace('</div></section></main>', `${staffOperatingBoard}${staffDentalSnapshot}${staffLabSnapshot}${staffProcurementSnapshot}</div></section></main>`);
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(enhanced);
  } catch { sendJson(response, 404, { error: 'Staff workspace was not found.' }); }
}

const server = createServer(async (request, response) => {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
  try {
    if (method === 'POST' && url.pathname === '/api/v1/auth/request-code') {
      if (isProduction) { sendJson(response, 503, { error: 'IDENTITY_DELIVERY_NOT_CONFIGURED', message: 'An approved OTP delivery provider is required in production.' }); return; }
      const body = await readJson(request); const phone = normalizePhone(body.phone); const mode = body.mode === 'STAFF' ? 'STAFF' : body.mode === 'CLIENT' ? 'CLIENT' : undefined;
      if (!mode) throw new DomainError('VALIDATION', 'mode must be CLIENT or STAFF.');
      const organizationId = typeof body.organizationId === 'string' ? body.organizationId : LOCAL_ORGANIZATION_ID;
      if (organizationId !== LOCAL_ORGANIZATION_ID || !app.organizations.organizations.has(organizationId)) throw new DomainError('NOT_FOUND', 'Organization is not available for local sign-in.');
      const existing = identitiesByPhone.get(phone);
      if (mode === 'STAFF' && (!existing || ![...app.access.memberships.values()].some((item) => item.organizationId === organizationId && item.userId === existing.userId && item.status === 'ACTIVE'))) throw new DomainError('FORBIDDEN', 'This phone is not invited to the staff workspace.');
      const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : undefined;
      if (mode === 'CLIENT' && !existing?.ownerId && !fullName) throw new DomainError('VALIDATION', 'Full name is required to create a client account.');
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const challenge = app.auth.requestOtp({ identity: phone, purpose: 'SIGN_IN', code });
      authIntents.set(challenge.id, { mode, organizationId, phone, fullName, userId: existing?.userId ?? randomUUID(), ownerId: existing?.ownerId });
      sendJson(response, 202, { challengeId: challenge.id, expiresAt: challenge.expiresAt, developmentCode: code }); return;
    }
    if (method === 'POST' && url.pathname === '/api/v1/auth/verify-code') {
      const body = await readJson(request); const challengeId = requiredString(body.challengeId, 'challengeId'); const code = requiredString(body.code, 'code');
      app.auth.verifyOtp(challengeId, code); const intent = authIntents.get(challengeId); if (!intent) throw new DomainError('NOT_FOUND', 'Sign-in request is not available.'); authIntents.delete(challengeId);
      let ownerId = intent.ownerId;
      if (intent.mode === 'CLIENT' && !ownerId) {
        const owner = app.ownerPets.createOwner({ fullName: intent.fullName ?? 'Новый владелец', phone: intent.phone }, { actor: { userId: LOCAL_ADMIN_ID, organizationId: intent.organizationId, source: 'STAFF_APP' }, idempotencyKey: `account:${intent.userId}`, correlationId: challengeId });
        ownerId = owner.id; identitiesByPhone.set(intent.phone, { userId: intent.userId, ownerId, organizationId: intent.organizationId });
      }
      const authSession = app.auth.createSession({ userId: intent.userId, deviceLabel: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'].slice(0, 120) : undefined });
      const token = randomBytes(32).toString('base64url'); const tokenHash = createHash('sha256').update(token).digest('hex');
      browserSessions.set(tokenHash, { sessionId: authSession.id, tokenHash, userId: intent.userId, organizationId: intent.organizationId, mode: intent.mode, ownerId, expiresAt: authSession.expiresAt }); setSessionCookie(response, token);
      sendJson(response, 200, { account: { mode: intent.mode, ownerId }, redirectTo: intent.mode === 'STAFF' ? '/staff/' : '/client/' }); return;
    }
    if (method === 'GET' && url.pathname === '/api/v1/auth/me') {
      const session = requireSession(request); const owner = session.ownerId ? app.ownerPets.owners.get(session.ownerId) : undefined;
      sendJson(response, 200, { account: { mode: session.mode, userId: session.userId, organizationId: session.organizationId, owner: owner ? { id: owner.id, fullName: owner.fullName, phone: owner.phone } : undefined } }); return;
    }
    if (method === 'POST' && url.pathname === '/api/v1/auth/sign-out') {
      const session = currentSession(request); if (session) { app.auth.revokeSession(session.sessionId, session.userId); browserSessions.delete(session.tokenHash); } clearSessionCookie(response); sendJson(response, 200, { ok: true }); return;
    }
    if (method === 'GET' && url.pathname === '/api/healthz') {
      let databaseReachable = persistence.mode === 'IN_MEMORY';
      if (persistence.mode === 'POSTGRES_PRISMA') { try { await persistence.client.$queryRawUnsafe('SELECT 1'); databaseReachable = true; } catch { databaseReachable = false; } }
      const productionNotReady = process.env.NODE_ENV === 'production' && (persistence.mode !== 'POSTGRES_PRISMA' || !databaseReachable);
      sendJson(response, productionNotReady ? 503 : 200, { status: productionNotReady ? 'not_ready' : 'ok', mode: process.env.NODE_ENV ?? 'development', application: 'VetSvet', persistence: persistence.mode, databaseReachable, persistenceDetail: persistence.mode === 'IN_MEMORY' ? persistence.reason : databaseReachable ? 'Prisma database connection verified.' : 'Prisma runtime is configured but PostgreSQL is unreachable.' }); return;
    }
    if (method === 'POST' && url.pathname === '/api/v1/bootstrap') {
      if (isProduction) throw new DomainError('FORBIDDEN', 'Bootstrap is available only in local development.');
      const body = await readJson(request);
      const organizationId = requiredString(body.organizationId, 'organizationId');
      const meta = command(request, organizationId);
      const organization = app.organizations.createOrganization({ legalName: requiredString(body.legalName, 'legalName'), displayName: requiredString(body.displayName, 'displayName') }, meta);
      const location = body.locationName ? app.organizations.createLocation({ name: requiredString(body.locationName, 'locationName'), timezone: typeof body.timezone === 'string' ? body.timezone : 'Europe/Moscow' }, { ...meta, idempotencyKey: `${meta.idempotencyKey}:location` }) : undefined;
      sendJson(response, 201, { organization, location }); return;
    }
    if (method === 'POST' && url.pathname === '/api/v1/owners') {
      const body = await readJson(request); const organizationId = requiredString(body.organizationId, 'organizationId');
      const actor = staffActorFromSession(request, organizationId);
      const owner = app.ownerPets.createOwner({ fullName: requiredString(body.fullName, 'fullName'), phone: typeof body.phone === 'string' ? body.phone : undefined }, { ...command(request, organizationId), actor });
      sendJson(response, 201, { owner }); return;
    }
    if (method === 'POST' && url.pathname === '/api/v1/pets') {
      const body = await readJson(request); const organizationId = requiredString(body.organizationId, 'organizationId');
      const species = requiredString(body.species, 'species');
      if (!['DOG', 'CAT', 'OTHER'].includes(species)) throw new DomainError('VALIDATION', 'species must be DOG, CAT or OTHER.');
      const actor = staffActorFromSession(request, organizationId);
      const pet = app.ownerPets.createPet({ ownerId: requiredString(body.ownerId, 'ownerId'), name: requiredString(body.name, 'name'), species: species as 'DOG' | 'CAT' | 'OTHER' }, { ...command(request, organizationId), actor });
      sendJson(response, 201, { pet }); return;
    }
    const dashboardMatch = url.pathname.match(/^\/api\/v1\/client\/owners\/([^/]+)\/dashboard$/);
    if (method === 'GET' && dashboardMatch) { const session = requireSession(request, 'CLIENT'); if (session.ownerId !== decodeURIComponent(dashboardMatch[1])) throw new DomainError('FORBIDDEN', 'Only your own account is available.'); sendJson(response, 200, clientDashboard(session.organizationId, session.ownerId)); return; }
    if (method === 'GET' && url.pathname === '/api/v1/staff/summary') { const session = requireSession(request, 'STAFF'); app.access.require(staffActorFromSession(request, session.organizationId), 'appointment:read'); sendJson(response, 200, staffSummary(session.organizationId)); return; }
    const petsMatch = url.pathname.match(/^\/api\/v1\/owners\/([^/]+)\/pets$/);
    if (method === 'GET' && petsMatch) {
      const session = requireSession(request, 'CLIENT'); const ownerId = decodeURIComponent(petsMatch[1]);
      if (session.ownerId !== ownerId) throw new DomainError('FORBIDDEN', 'Only your own pets are available.');
      sendJson(response, 200, { pets: (clientDashboard(session.organizationId, ownerId).pets as unknown[]) }); return;
    }
    if (method === 'GET' && url.pathname.startsWith('/Photo/')) { await serveFile(response, photoRoot, decodeURIComponent(url.pathname.slice('/Photo/'.length))); return; }
    if (method === 'GET' && (url.pathname === '/auth' || url.pathname === '/auth/')) { await serveFile(response, authRoot, 'index.html'); return; }
    if (method === 'GET' && url.pathname.startsWith('/auth/')) { await serveFile(response, authRoot, decodeURIComponent(url.pathname.slice('/auth/'.length))); return; }
    if (method === 'GET' && (url.pathname === '/client' || url.pathname === '/client/')) { if (!currentSession(request) || currentSession(request)?.mode !== 'CLIENT') { redirect(response, '/auth/'); return; } await serveFile(response, clientRoot, 'index.html'); return; }
    if (method === 'GET' && url.pathname.startsWith('/client/')) { await serveFile(response, clientRoot, decodeURIComponent(url.pathname.slice('/client/'.length))); return; }
    if (method === 'GET' && (url.pathname === '/staff' || url.pathname === '/staff/')) { if (!currentSession(request) || currentSession(request)?.mode !== 'STAFF') { redirect(response, '/auth/?mode=staff'); return; } await serveStaffWorkspace(response); return; }
    if (method === 'GET' && url.pathname.startsWith('/staff/')) { await serveFile(response, staffRoot, decodeURIComponent(url.pathname.slice('/staff/'.length))); return; }
    if (method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) { await serveFile(response, publicRoot, 'index.html'); return; }
    sendJson(response, 404, { error: 'Not found.' });
  } catch (error) {
    if (error instanceof DomainError) { sendJson(response, error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : error.code === 'CONFLICT' ? 409 : 422, { error: error.code, message: error.message }); return; }
    console.error('[VetSvet development server]', error);
    sendJson(response, 500, { error: 'INTERNAL_ERROR', message: 'Unexpected development server error.' });
  }
});

server.listen(port, '127.0.0.1', () => console.log(`VetSvet development environment running at http://127.0.0.1:${port}`));

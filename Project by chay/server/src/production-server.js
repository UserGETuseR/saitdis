"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const { createRepository } = require("./repository");
const { hashPassword, verifyPassword, newToken, tokenHash, privacyHash, parseCookies } = require("./security");

const PORT = Number(process.env.PORT || 4410);
const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_DAYS = Math.min(90, Math.max(1, Number(process.env.SESSION_DAYS || 30)));
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const repo = createRepository(DATABASE_URL);
const loginAttempts = new Map();
const STAFF = new Set(["master", "admin", "owner"]);
const ADMIN = new Set(["admin", "owner"]);

function json(res, status, body, extraHeaders = {}) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": data.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    ...extraHeaders,
  });
  res.end(data);
}

async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64 * 1024) throw Object.assign(new Error("Слишком большой запрос"), { status: 413 });
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error("Некорректный JSON"), { status: 400 }); }
}

function clientIp(req) {
  if (process.env.TRUST_PROXY === "1") return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
  return req.socket.remoteAddress;
}

function rateLimit(key, limit = 12, windowMs = 60_000) {
  const now = Date.now();
  const state = loginAttempts.get(key);
  if (!state || state.until < now) { loginAttempts.set(key, { count: 1, until: now + windowMs }); return; }
  state.count += 1;
  if (state.count > limit) throw Object.assign(new Error("Слишком много попыток. Попробуйте через минуту."), { status: 429 });
}

function cleanLogin(value) {
  const login = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,30}$/.test(login)) throw Object.assign(new Error("Логин: 3–30 символов, латиница, цифры и . _ -"), { status: 400 });
  return login;
}

function cleanName(value) {
  const name = String(value || "").trim();
  if (name.length < 2 || name.length > 100) throw Object.assign(new Error("Укажите имя"), { status: 400 });
  return name;
}

function cleanPassword(value) {
  const password = String(value || "");
  if (password.length < 8 || password.length > 128) throw Object.assign(new Error("Пароль должен содержать минимум 8 символов"), { status: 400 });
  return password;
}

function publicUser(row) { return repo.user(row); }
function avatarColor(seed) {
  const colors = ["#c4452f", "#c9a04e", "#7e9b6f", "#8a7b9c", "#2c6e7e", "#b5654a"];
  return colors[[...seed].reduce((n, ch) => n + ch.charCodeAt(0), 0) % colors.length];
}

function defaultProfile() { return { favoriteTea:"", intention:"Замедлиться и слышать себя.", meditationMinutes:0, breathSessions:0, practiceStreak:0, lastPracticeDate:null }; }

async function actor(req) {
  const token = parseCookies(req.headers.cookie).chay_session;
  if (!token) return null;
  const session = await repo.sessionByTokenHash(tokenHash(token));
  if (!session) return null;
  repo.touchSession(session.id).catch(() => {});
  return { id:session.user_id, name:session.name, login:session.login, email:session.email||"", role:session.role, avatarColor:session.avatar_color, profile:session.profile||{}, createdAt:+new Date(session.created_at), sessionId:session.id, sessionToken:token };
}

function requireActor(value) { if (!value) throw Object.assign(new Error("Необходимо войти"), { status: 401 }); return value; }
function requireRole(value, roles) { requireActor(value); if (!roles.has(value.role)) throw Object.assign(new Error("Недостаточно прав"), { status: 403 }); return value; }

async function startSession(req, res, userRow) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await repo.createSession({ userId:userRow.id, tokenHash:tokenHash(token), userAgent:String(req.headers["user-agent"]||"").slice(0,500), ipHash:privacyHash(clientIp(req)), expiresAt:expires });
  const cookie = `chay_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
  json(res, 200, { ok:true, user:publicUser(userRow) }, { "Set-Cookie": cookie });
}

function safeId(value, prefix) {
  const id = String(value || `${prefix}_${crypto.randomUUID()}`);
  if (!/^[a-zA-Z0-9_-]{5,100}$/.test(id)) throw Object.assign(new Error("Некорректный идентификатор"), { status: 400 });
  return id;
}

async function route(req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const who = await actor(req);

  if (req.method === "GET" && path === "/api/health") {
    await repo.health(); return json(res, 200, { ok:true, service:"chay-api", version:1 });
  }
  if (req.method === "GET" && path === "/api/auth/me") return json(res, 200, { ok:true, user:who ? { ...who, sessionToken:undefined } : null, cloud:true });

  if (req.method === "POST" && path === "/api/auth/register") {
    rateLimit(`register:${clientIp(req)}`, 8, 10 * 60_000);
    const data = await body(req); const login = cleanLogin(data.login); const name = cleanName(data.name); const password = cleanPassword(data.password);
    if (data.password2 !== undefined && data.password2 !== password) throw Object.assign(new Error("Пароли не совпадают"), { status:400 });
    const email = String(data.email || "").trim().toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw Object.assign(new Error("Некорректный e-mail"), { status:400 });
    if (await repo.userByLogin(login)) throw Object.assign(new Error("Такой логин уже занят"), { status:409 });
    const pass = await hashPassword(password);
    const row = await repo.createUser({ login,name,email,salt:pass.salt,hash:pass.hash,avatarColor:avatarColor(name+login),profile:defaultProfile() });
    await repo.audit(row.id,"register","user",row.id,null,{ login:row.login, role:row.role });
    return startSession(req,res,row);
  }

  if (req.method === "POST" && path === "/api/auth/login") {
    rateLimit(`login:${clientIp(req)}`, 12, 60_000);
    const data = await body(req); const login = cleanLogin(data.login); const password = String(data.password || "");
    const row = await repo.userByLogin(login);
    if (!row || !(await verifyPassword(password,row.password_salt,row.password_hash))) throw Object.assign(new Error("Неверный логин или пароль"), { status:401 });
    return startSession(req,res,row);
  }

  if (req.method === "POST" && path === "/api/auth/logout") {
    if (who) await repo.deleteSession(tokenHash(who.sessionToken));
    return json(res,200,{ok:true},{"Set-Cookie":"chay_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"});
  }

  if (req.method === "PATCH" && path === "/api/auth/me") {
    const current=requireActor(who); const data=await body(req);
    const patch={};
    if(data.name!==undefined)patch.name=cleanName(data.name);
    if(data.login!==undefined)patch.login=cleanLogin(data.login);
    if(data.email!==undefined){const email=String(data.email||"").trim().toLowerCase();if(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw Object.assign(new Error("Некорректный e-mail"),{status:400});patch.email=email;}
    if(data.avatarColor!==undefined&&/^#[0-9a-f]{6}$/i.test(data.avatarColor))patch.avatarColor=data.avatarColor;
    if(data.profile&&typeof data.profile==="object")patch.profile=data.profile;
    const row=await repo.updateOwn(current.id,patch); await repo.audit(current.id,"update","profile",current.id,null,patch);
    return json(res,200,{ok:true,user:publicUser(row)});
  }

  if (req.method === "PATCH" && path === "/api/auth/password") {
    const current=requireActor(who); const data=await body(req); const row=await repo.userById(current.id);
    if(!row || !(await verifyPassword(String(data.currentPassword||""),row.password_salt,row.password_hash))) throw Object.assign(new Error("Текущий пароль неверный"),{status:400});
    const next=cleanPassword(data.newPassword); const pass=await hashPassword(next); await repo.updatePassword(current.id,pass.salt,pass.hash,current.sessionId); await repo.audit(current.id,"password_change","user",current.id,null,null);
    return json(res,200,{ok:true});
  }

  if (req.method === "GET" && path === "/api/users") { requireRole(who,STAFF); return json(res,200,{ok:true,items:await repo.listUsers()}); }
  const roleMatch=path.match(/^\/api\/users\/([^/]+)\/role$/);
  if(req.method==="PATCH"&&roleMatch){const current=requireRole(who,ADMIN);const data=await body(req);if(!["client","master","admin"].includes(data.role))throw Object.assign(new Error("Некорректная роль"),{status:400});if(current.id===roleMatch[1]&&data.role!==current.role)throw Object.assign(new Error("Нельзя изменить собственную роль"),{status:400});const row=await repo.setRole(current.id,roleMatch[1],data.role);return json(res,200,{ok:true,user:publicUser(row)});}

  if(req.method==="POST"&&path==="/api/public/certificates"){
    rateLimit(`cert:${clientIp(req)}`,10,60*60_000);const data=await body(req);const phone=String(data.phone||"").trim();if(phone.replace(/\D/g,"").length<10)throw Object.assign(new Error("Укажите номер телефона"),{status:400});const amount=Number(data.amount);if(!Number.isFinite(amount)||amount<500||amount>100000)throw Object.assign(new Error("Сумма сертификата от 500 до 100 000 ₽"),{status:400});const id=safeId(data.id,"cer");const code=/^CHI-[A-Z0-9]{5,12}$/.test(String(data.code||""))?data.code:`CHI-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;await repo.createPublicCertificate({id,buyerId:who?.id,buyerName:cleanName(data.buyerName||who?.name),recipientName:cleanName(data.recipientName),phone:phone.slice(0,40),amount,wish:String(data.wish||"").slice(0,1000),code,createdAt:Number(data.createdAt)||Date.now()});return json(res,201,{ok:true,id,code,status:"new"});
  }

  if(req.method==="POST"&&path==="/api/public/orders"){
    rateLimit(`order:${clientIp(req)}`,30,60*60_000);const data=await body(req);const items=Array.isArray(data.items)?data.items.slice(0,50):[];if(!items.length)throw Object.assign(new Error("Корзина пуста"),{status:400});const total=Number(data.total)||0;if(total<0||total>1000000)throw Object.assign(new Error("Некорректная сумма"),{status:400});const id=safeId(data.id,"ord");await repo.createPublicOrder({id,userId:who?.id,userName:who?.name||String(data.userName||"Гость").slice(0,100),items,total,createdAt:Number(data.createdAt)||Date.now()});return json(res,201,{ok:true,id,status:"new"});
  }

  const recordMatch=path.match(/^\/api\/records\/([a-z_]+)(?:\/([^/]+))?$/);
  if(recordMatch){const name=recordMatch[1],id=recordMatch[2];const current=requireActor(who);const staffOnly=new Set(["messages","staff_requests","shift_reports","service_guides","inventory","shifts"]);if(staffOnly.has(name))requireRole(current,STAFF);if(req.method==="GET"&&!id)return json(res,200,{ok:true,items:await repo.records.list(name,current)});if(req.method==="PUT"&&!id){const data=await body(req);if(name==="certificates")requireRole(current,STAFF);if(["inventory","shifts"].includes(name))requireRole(current,ADMIN);if(name==="orders"&&current.role==="client")throw Object.assign(new Error("Недостаточно прав"),{status:403});await repo.records.upsert(name,data,current);return json(res,200,{ok:true,id:data.id});}if(req.method==="DELETE"&&id){if(["certificates","inventory","shifts"].includes(name))requireRole(current,ADMIN);else requireRole(current,STAFF);await repo.records.remove(name,id,current);return json(res,200,{ok:true});}}

  return json(res,404,{ok:false,error:"Маршрут не найден"});
}

const server=http.createServer((req,res)=>route(req,res).catch((error)=>{const status=Number(error.status)||(/duplicate key|unique constraint/i.test(error.message)?409:500);if(status>=500)console.error(new Date().toISOString(),error);json(res,status,{ok:false,error:status>=500?"Внутренняя ошибка сервера":error.message});}));
server.listen(PORT,"127.0.0.1",()=>console.log(`chay-api listening on 127.0.0.1:${PORT}`));

async function shutdown(signal){console.log(`${signal}: shutting down`);server.close(async()=>{await repo.close();process.exit(0);});setTimeout(()=>process.exit(1),10_000).unref();}
process.on("SIGTERM",()=>shutdown("SIGTERM"));process.on("SIGINT",()=>shutdown("SIGINT"));

import { randomBytes, scrypt, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';

const scryptAsync = promisify(scrypt);

const SESSION_COOKIE = 'od_admin_session';
const SCRYPT_KEYLEN = 64;

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_SECRET не задан или слишком короткий. См. .env.example');
  }
  return secret;
}

// --- Пароли (scrypt) -------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, SCRYPT_KEYLEN)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(':');
  if (!salt || !hashHex) return false;
  const derived = (await scryptAsync(password, salt, SCRYPT_KEYLEN)) as Buffer;
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

// --- Сессия (подписанный cookie) ------------------------------------------

interface SessionPayload {
  uid: string;
  username: string;
  exp: number; // unix ms
}

function base64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function sign(data: string): string {
  return base64url(createHmac('sha256', getSecret()).update(data).digest());
}

export function createSessionToken(uid: string, username: string): string {
  const hours = parseInt(process.env.AUTH_SESSION_HOURS ?? '12', 10) || 12;
  const payload: SessionPayload = {
    uid,
    username,
    exp: Date.now() + hours * 60 * 60 * 1000,
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as SessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(uid: string, username: string): Promise<void> {
  const token = createSessionToken(uid, username);
  const hours = parseInt(process.env.AUTH_SESSION_HOURS ?? '12', 10) || 12;
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: hours * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Возвращает данные администратора из cookie либо null. */
export async function getAdminSession(): Promise<{ uid: string; username: string } | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  return { uid: payload.uid, username: payload.username };
}

export { SESSION_COOKIE };

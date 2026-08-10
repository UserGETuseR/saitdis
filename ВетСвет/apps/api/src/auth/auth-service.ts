import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';

export type OtpChallenge = { id: UUID; identity: string; purpose: 'SIGN_IN' | 'VERIFY_CONTACT'; codeHash: string; attempts: number; expiresAt: ISODateTime; state: 'PENDING' | 'VERIFIED' | 'LOCKED' | 'EXPIRED'; createdAt: ISODateTime };
export type Session = { id: UUID; userId: UUID; createdAt: ISODateTime; expiresAt: ISODateTime; state: 'ACTIVE' | 'REVOKED'; deviceLabel?: string };
const hash = (value: string) => createHash('sha256').update(value).digest();

/** Provider-neutral OTP/session domain. Sending an SMS/email/Telegram code is
 * an adapter concern; only a hashed code and its lifecycle remain here. */
export class AuthService {
  readonly challenges = new Map<UUID, OtpChallenge>(); readonly sessions = new Map<UUID, Session>();
  requestOtp(input: { identity: string; purpose: OtpChallenge['purpose']; code: string; ttlSeconds?: number }, now = new Date()): OtpChallenge {
    if (!input.identity.trim() || !/^\d{4,12}$/.test(input.code)) throw new DomainError('VALIDATION', 'A contact identity and numeric one-time code are required.'); const ttl = input.ttlSeconds ?? 300; if (!Number.isSafeInteger(ttl) || ttl < 60 || ttl > 900) throw new DomainError('VALIDATION', 'OTP lifetime is invalid.');
    const challenge: OtpChallenge = { id: randomUUID(), identity: input.identity.trim(), purpose: input.purpose, codeHash: hash(input.code).toString('hex'), attempts: 0, expiresAt: iso(new Date(now.valueOf() + ttl * 1000)), state: 'PENDING', createdAt: iso(now) }; this.challenges.set(challenge.id, challenge); return challenge;
  }
  verifyOtp(challengeId: UUID, submittedCode: string, now = new Date()): OtpChallenge {
    const challenge = this.challenges.get(challengeId); if (!challenge) throw new DomainError('NOT_FOUND', 'OTP challenge is not available.'); if (challenge.state !== 'PENDING') throw new DomainError('CONFLICT', 'OTP challenge is no longer active.'); if (new Date(challenge.expiresAt) <= now) { challenge.state = 'EXPIRED'; throw new DomainError('CONFLICT', 'OTP challenge expired.'); }
    challenge.attempts += 1; const ok = /^[0-9]+$/.test(submittedCode) && timingSafeEqual(hash(submittedCode), Buffer.from(challenge.codeHash, 'hex')); if (!ok) { if (challenge.attempts >= 5) challenge.state = 'LOCKED'; throw new DomainError('FORBIDDEN', 'OTP code is invalid.'); } challenge.state = 'VERIFIED'; return challenge;
  }
  createSession(input: { userId: UUID; deviceLabel?: string; ttlDays?: number }, now = new Date()): Session { const ttl = input.ttlDays ?? 30; if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 90) throw new DomainError('VALIDATION', 'Session lifetime is invalid.'); const session = { id: randomUUID(), userId: input.userId, deviceLabel: input.deviceLabel?.trim(), state: 'ACTIVE' as const, createdAt: iso(now), expiresAt: iso(new Date(now.valueOf() + ttl * 86_400_000)) }; this.sessions.set(session.id, session); return session; }
  revokeSession(sessionId: UUID, userId: UUID): Session { const session = this.sessions.get(sessionId); if (!session || session.userId !== userId) throw new DomainError('NOT_FOUND', 'Session is not available.'); session.state = 'REVOKED'; return session; }
  revokeAll(userId: UUID): number { let revoked = 0; for (const session of this.sessions.values()) if (session.userId === userId && session.state === 'ACTIVE') { session.state = 'REVOKED'; revoked += 1; } return revoked; }
}

import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export type TelegramLogin = { id: string; tokenHash: string; state: 'PENDING' | 'CONFIRMED' | 'CONSUMED' | 'EXPIRED'; expiresAt: Date; telegramUserId?: string; chatId?: string };
export type PaymentProof = { id: string; ownerTelegramUserId: string; ownerChatId: string; sourceMessageId: number; purpose: 'CONSULTATION' | 'APPOINTMENT'; amountMinor?: number; state: 'PENDING_REVIEW' | 'CONFIRMED' | 'REJECTED'; reviewedByChatId?: string; reviewedAt?: Date; note?: string; createdAt: Date };
export type BotRequest = { id: string; ownerTelegramUserId: string; ownerChatId: string; kind: 'APPOINTMENT' | 'CONSULTATION'; message: string; state: 'NEW' | 'WAITING_PAYMENT' | 'READY' | 'CLOSED'; createdAt: Date; paymentProofId?: string };

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * State machine used by the Telegram adapter. It deliberately never treats a
 * screenshot as bank confirmation: only an explicitly configured admin can
 * move proof and consultation/appointment requests forward.
 */
export class TelegramWorkflowService {
  readonly logins = new Map<string, TelegramLogin>();
  readonly proofs = new Map<string, PaymentProof>();
  readonly requests = new Map<string, BotRequest>();

  createLogin(now = new Date()): { id: string; secret: string; expiresAt: Date } {
    const id = randomUUID(); const secret = randomBytes(24).toString('base64url'); const expiresAt = new Date(now.valueOf() + 10 * 60_000);
    this.logins.set(id, { id, tokenHash: digest(secret).toString('hex'), state: 'PENDING', expiresAt });
    return { id, secret, expiresAt };
  }

  confirmLogin(id: string, secret: string, identity: { telegramUserId: string; chatId: string }, now = new Date()): TelegramLogin {
    const login = this.getLogin(id, now); const actual = digest(secret); const expected = Buffer.from(login.tokenHash, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Telegram login link is invalid.');
    if (login.state !== 'PENDING') throw new Error('Telegram login link is no longer pending.');
    login.state = 'CONFIRMED'; login.telegramUserId = identity.telegramUserId; login.chatId = identity.chatId; return login;
  }

  consumeLogin(id: string, now = new Date()): { telegramUserId: string; chatId: string } {
    const login = this.getLogin(id, now); if (login.state !== 'CONFIRMED' || !login.telegramUserId || !login.chatId) throw new Error('Telegram login has not been confirmed.');
    login.state = 'CONSUMED'; return { telegramUserId: login.telegramUserId, chatId: login.chatId };
  }

  createRequest(input: { ownerTelegramUserId: string; ownerChatId: string; kind: BotRequest['kind']; message: string }, now = new Date()): BotRequest {
    if (!input.message.trim()) throw new Error('Request message is required.');
    const request: BotRequest = { id: randomUUID(), ownerTelegramUserId: input.ownerTelegramUserId, ownerChatId: input.ownerChatId, kind: input.kind, message: input.message.trim(), state: input.kind === 'CONSULTATION' ? 'WAITING_PAYMENT' : 'NEW', createdAt: now };
    this.requests.set(request.id, request); return request;
  }

  submitPaymentProof(input: { ownerTelegramUserId: string; ownerChatId: string; sourceMessageId: number; purpose: PaymentProof['purpose']; amountMinor?: number; requestId?: string }, now = new Date()): PaymentProof {
    if (!Number.isSafeInteger(input.sourceMessageId) || input.sourceMessageId < 1) throw new Error('Payment proof message id is required.');
    const proof: PaymentProof = { id: randomUUID(), ownerTelegramUserId: input.ownerTelegramUserId, ownerChatId: input.ownerChatId, sourceMessageId: input.sourceMessageId, purpose: input.purpose, amountMinor: input.amountMinor, state: 'PENDING_REVIEW', createdAt: now };
    this.proofs.set(proof.id, proof);
    if (input.requestId) { const request = this.requests.get(input.requestId); if (!request || request.ownerTelegramUserId !== input.ownerTelegramUserId || request.state !== 'WAITING_PAYMENT') throw new Error('A payment proof can only be attached to the owner’s pending request.'); request.paymentProofId = proof.id; }
    return proof;
  }

  reviewPaymentProof(input: { proofId: string; adminChatId: string; approve: boolean; note?: string }, now = new Date()): PaymentProof {
    const proof = this.proofs.get(input.proofId); if (!proof) throw new Error('Payment proof is unavailable.'); if (proof.state !== 'PENDING_REVIEW') throw new Error('Payment proof has already been reviewed.');
    proof.state = input.approve ? 'CONFIRMED' : 'REJECTED'; proof.reviewedByChatId = input.adminChatId; proof.reviewedAt = now; proof.note = input.note?.trim() || undefined;
    for (const request of this.requests.values()) if (request.paymentProofId === proof.id) request.state = input.approve ? 'READY' : 'WAITING_PAYMENT';
    return proof;
  }

  private getLogin(id: string, now: Date): TelegramLogin {
    const login = this.logins.get(id); if (!login) throw new Error('Telegram login is unavailable.'); if (login.expiresAt <= now) { login.state = 'EXPIRED'; throw new Error('Telegram login link expired.'); } return login;
  }
}

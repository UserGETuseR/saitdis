import { timingSafeEqual } from 'node:crypto';
import type { TelegramRuntimeConfig } from './runtime-config';

export type TelegramUpdate = { update_id: number; message?: { message_id: number; chat: { id: number }; text?: string; photo?: Array<{ file_id: string }>; document?: { file_id: string; mime_type?: string }; from?: { id: number } }; callback_query?: { id: string; data?: string; from: { id: number }; message?: { message_id: number; chat: { id: number } } } };
export type TelegramInboundAction =
  | { kind: 'START' | 'OPEN_CLIENT_APP' | 'UNSUPPORTED'; telegramUserId: string; chatId: string; updateId: number }
  | { kind: 'LOGIN_START'; telegramUserId: string; chatId: string; updateId: number; loginId: string; secret: string }
  | { kind: 'COMMAND'; telegramUserId: string; chatId: string; updateId: number; command: 'BOOKING' | 'CONSULTATION' | 'PAYMENT' | 'PROFILE' | 'EMERGENCY' }
  | { kind: 'PAYMENT_PROOF'; telegramUserId: string; chatId: string; updateId: number; messageId: number }
  | { kind: 'ADMIN_REVIEW'; telegramUserId: string; chatId: string; updateId: number; proofId: string; approve: boolean };

function secretsMatch(actual: string | undefined, expected: string | undefined): boolean {
  if (!expected) return false;
  const left = Buffer.from(actual ?? ''); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Webhook boundary: verifies Telegram secret before parsing business input, and
 * deduplicates by update id. Identity linking happens in the application API. */
export class TelegramWebhookService {
  private readonly processed = new Set<number>();
  constructor(private readonly config: TelegramRuntimeConfig) {}

  accept(update: TelegramUpdate, secretHeader?: string): TelegramInboundAction | undefined {
    if (!secretsMatch(secretHeader, this.config.webhookSecret)) throw new Error('Telegram webhook secret is invalid.');
    if (!Number.isSafeInteger(update.update_id) || this.processed.has(update.update_id)) return undefined;
    this.processed.add(update.update_id);
    const callback = update.callback_query;
    if (callback?.message?.chat && callback.data) {
      const review = callback.data.match(/^payment:(approve|reject):([0-9a-f-]{36})$/i);
      if (review) return { kind: 'ADMIN_REVIEW', telegramUserId: String(callback.from.id), chatId: String(callback.message.chat.id), updateId: update.update_id, approve: review[1] === 'approve', proofId: review[2] };
    }
    const message = update.message;
    if (!message?.from || !message.chat) return { kind: 'UNSUPPORTED', telegramUserId: '', chatId: '', updateId: update.update_id };
    const text = message.text?.trim() ?? '';
    const identity = { telegramUserId: String(message.from.id), chatId: String(message.chat.id), updateId: update.update_id };
    const login = text.match(/^\/start\s+login_([0-9a-f-]{36})_([A-Za-z0-9_-]{16,})$/i);
    if (login) return { kind: 'LOGIN_START', ...identity, loginId: login[1], secret: login[2] };
    if (message.photo?.length || message.document?.mime_type?.startsWith('image/')) return { kind: 'PAYMENT_PROOF', ...identity, messageId: message.message_id };
    const commands: Record<string, 'BOOKING' | 'CONSULTATION' | 'PAYMENT' | 'PROFILE' | 'EMERGENCY'> = { '/booking': 'BOOKING', '/consultation': 'CONSULTATION', '/payment': 'PAYMENT', '/profile': 'PROFILE', '/emergency': 'EMERGENCY' };
    if (commands[text]) return { kind: 'COMMAND', ...identity, command: commands[text] };
    const kind = text.startsWith('/start') ? 'START' : text === 'Открыть VetSvet' ? 'OPEN_CLIENT_APP' : 'UNSUPPORTED';
    return { kind, ...identity };
  }
}

export class TelegramTransport {
  constructor(private readonly config: TelegramRuntimeConfig, private readonly fetchImpl: typeof fetch = fetch) {}
  async sendSafeMessage(chatId: string, text: string): Promise<void> {
    if (!chatId || !text.trim()) throw new Error('Telegram message requires a target and non-empty text.');
    const response = await this.fetchImpl(`https://api.telegram.org/bot${this.config.token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: text.trim(), disable_web_page_preview: true }) });
    if (!response.ok) throw new Error(`Telegram provider returned HTTP ${response.status}.`);
  }
}

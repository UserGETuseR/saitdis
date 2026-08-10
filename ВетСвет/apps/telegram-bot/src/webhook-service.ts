import { timingSafeEqual } from 'node:crypto';
import type { TelegramRuntimeConfig } from './runtime-config';

export type TelegramUpdate = { update_id: number; message?: { message_id: number; chat: { id: number }; text?: string; from?: { id: number } } };
export type TelegramInboundAction = { kind: 'START' | 'OPEN_CLIENT_APP' | 'UNSUPPORTED'; telegramUserId: string; chatId: string; updateId: number };

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
    const message = update.message;
    if (!message?.from || !message.chat) return { kind: 'UNSUPPORTED', telegramUserId: '', chatId: '', updateId: update.update_id };
    const text = message.text?.trim() ?? '';
    const kind = text.startsWith('/start') ? 'START' : text === 'Открыть VetSvet' ? 'OPEN_CLIENT_APP' : 'UNSUPPORTED';
    return { kind, telegramUserId: String(message.from.id), chatId: String(message.chat.id), updateId: update.update_id };
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

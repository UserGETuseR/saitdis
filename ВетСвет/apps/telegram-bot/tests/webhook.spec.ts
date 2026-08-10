import assert from 'node:assert/strict';
import { TelegramWebhookService } from '../src/webhook-service';

const service = new TelegramWebhookService({ token: '123456:abcdefghijklmnopqrst', webhookSecret: 'top-secret' });
const update = { update_id: 9001, message: { message_id: 1, chat: { id: 18 }, from: { id: 42 }, text: '/start welcome' } };
assert.throws(() => service.accept(update, 'wrong'), /secret is invalid/);
assert.deepEqual(service.accept(update, 'top-secret'), { kind: 'START', telegramUserId: '42', chatId: '18', updateId: 9001 });
assert.equal(service.accept(update, 'top-secret'), undefined);
console.log('VetSvet Telegram webhook: 3/3 security checks passed');

import assert from 'node:assert/strict';
import { TelegramWebhookService } from '../src/webhook-service';

const service = new TelegramWebhookService({ token: '123456:abcdefghijklmnopqrst', webhookSecret: 'top-secret' });
const update = { update_id: 9001, message: { message_id: 1, chat: { id: 18 }, from: { id: 42 }, text: '/start welcome' } };
assert.throws(() => service.accept(update, 'wrong'), /secret is invalid/);
assert.deepEqual(service.accept(update, 'top-secret'), { kind: 'START', telegramUserId: '42', chatId: '18', updateId: 9001 });
assert.equal(service.accept(update, 'top-secret'), undefined);
assert.deepEqual(service.accept({ update_id: 9002, message: { message_id: 8, chat: { id: 18 }, from: { id: 42 }, text: '/booking' } }, 'top-secret'), { kind: 'COMMAND', command: 'BOOKING', telegramUserId: '42', chatId: '18', updateId: 9002 });
assert.deepEqual(service.accept({ update_id: 9003, message: { message_id: 9, chat: { id: 18 }, from: { id: 42 }, photo: [{ file_id: 'proof' }] } }, 'top-secret'), { kind: 'PAYMENT_PROOF', telegramUserId: '42', chatId: '18', messageId: 9, updateId: 9003 });
assert.deepEqual(service.accept({ update_id: 9004, callback_query: { id: 'c1', data: 'payment:approve:9dd11111-1111-4111-8111-111111111111', from: { id: 7 }, message: { message_id: 10, chat: { id: 99 } } } }, 'top-secret'), { kind: 'ADMIN_REVIEW', telegramUserId: '7', chatId: '99', proofId: '9dd11111-1111-4111-8111-111111111111', approve: true, updateId: 9004 });
console.log('VetSvet Telegram webhook: command, proof and review guards passed');

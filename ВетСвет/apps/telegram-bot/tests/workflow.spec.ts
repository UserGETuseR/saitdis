import assert from 'node:assert/strict';
import { TelegramWorkflowService } from '../src/workflow-service';

const flow = new TelegramWorkflowService(); const now = new Date('2026-08-10T12:00:00.000Z');
const login = flow.createLogin(now); assert.throws(() => flow.consumeLogin(login.id, now)); flow.confirmLogin(login.id, login.secret, { telegramUserId: 'tg-1', chatId: 'chat-1' }, now); assert.deepEqual(flow.consumeLogin(login.id, now), { telegramUserId: 'tg-1', chatId: 'chat-1' });
const request = flow.createRequest({ ownerTelegramUserId: 'tg-1', ownerChatId: 'chat-1', kind: 'CONSULTATION', message: 'Нужна консультация по состоянию питомца.' }, now); const proof = flow.submitPaymentProof({ ownerTelegramUserId: 'tg-1', ownerChatId: 'chat-1', sourceMessageId: 41, purpose: 'CONSULTATION', requestId: request.id }, now); assert.equal(flow.reviewPaymentProof({ proofId: proof.id, adminChatId: 'admin-chat', approve: true }, now).state, 'CONFIRMED'); assert.equal(flow.requests.get(request.id)?.state, 'READY');
console.log('VetSvet Telegram workflow: login and manual payment review passed');

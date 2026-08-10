import assert from 'node:assert/strict';
import { OutboxWorker, type OutboxStore, type PendingOutboxEvent } from '../src/outbox-worker';

void (async () => {
  const events: PendingOutboxEvent[] = [{ id: 'event-1', eventName: 'appointment.confirmed', aggregateType: 'Appointment', aggregateId: 'appointment-1', payload: {}, attempts: 0 }, { id: 'event-2', eventName: 'payment.succeeded', aggregateType: 'Payment', aggregateId: 'payment-1', payload: {}, attempts: 0 }];
  const published: string[] = []; const failures: string[] = [];
  const store: OutboxStore = { claim: async () => events, markPublished: async (id) => { published.push(id); }, markFailed: async (id) => { failures.push(id); } };
  const worker = new OutboxWorker(store, [{ supports: (name) => name === 'appointment.confirmed', handle: async () => undefined }]);
  const result = await worker.process();
  assert.deepEqual(result, { published: 1, failed: 0, ignored: 1 });
  assert.deepEqual(published, ['event-1', 'event-2']); assert.deepEqual(failures, []);
  console.log('VetSvet outbox worker: 3/3 delivery checks passed');
})();

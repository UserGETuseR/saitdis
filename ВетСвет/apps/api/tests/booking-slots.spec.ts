import assert from 'node:assert/strict';
import { buildBookingSlots, dateKeyInMoscow } from '../src/booking-slots';

const slots = buildBookingSlots({
  date: '2026-08-20',
  durationMinutes: 60,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 15,
  capacity: 2,
  now: new Date('2026-08-19T00:00:00.000Z'),
  busy: [
    { startsAt: '2026-08-20T07:00:00.000Z', endsAt: '2026-08-20T08:00:00.000Z' },
    { startsAt: '2026-08-20T07:30:00.000Z', endsAt: '2026-08-20T08:30:00.000Z' }
  ]
});

assert.ok(slots.length > 0);
assert.equal(slots.some((slot) => slot.startsAt === '2026-08-20T06:00:00.000Z'), true, '09:00 Moscow remains available with one occupied resource');
assert.equal(slots.some((slot) => slot.startsAt === '2026-08-20T07:00:00.000Z'), false, '10:00 Moscow is full after buffers are applied');
assert.equal(slots.every((slot) => slot.available > 0), true);
assert.equal(dateKeyInMoscow(new Date('2026-08-19T22:30:00.000Z')), '2026-08-20');
assert.deepEqual(buildBookingSlots({ date: 'bad', durationMinutes: 30, capacity: 1, busy: [] }), []);

console.log(`booking slots: ${slots.length} available windows verified`);

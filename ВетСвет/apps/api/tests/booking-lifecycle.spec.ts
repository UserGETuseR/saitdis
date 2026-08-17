import assert from 'node:assert/strict';
import { bookingHoldExpiresAt, canCancelBooking, canMarkNoShow, canRescheduleBooking, reminderPlan, waitlistPeriodMatches } from '../src/booking-lifecycle';

const now = new Date('2026-08-17T09:00:00+03:00');
assert.equal(bookingHoldExpiresAt(now).valueOf() - now.valueOf(), 7 * 60_000);
assert.deepEqual(reminderPlan(new Date('2026-08-19T12:00:00+03:00'), now).map((item) => item.kind), ['DAY_BEFORE', 'TWO_HOURS']);
assert.deepEqual(reminderPlan(new Date('2026-08-17T12:00:00+03:00'), now).map((item) => item.kind), ['TWO_HOURS']);
assert.equal(canCancelBooking('CONFIRMED', new Date('2026-08-18T12:00:00+03:00'), now), true);
assert.equal(canCancelBooking('IN_SERVICE', new Date('2026-08-18T12:00:00+03:00'), now), false);
assert.equal(canRescheduleBooking('REQUESTED', new Date('2026-08-18T12:00:00+03:00'), now), true);
assert.equal(canMarkNoShow('CONFIRMED', new Date('2026-08-17T08:55:00+03:00'), now), true);
assert.equal(canMarkNoShow('REQUESTED', new Date('2026-08-17T08:55:00+03:00'), now), false);
assert.equal(waitlistPeriodMatches('MORNING', new Date('2026-08-18T09:00:00+03:00')), true);
assert.equal(waitlistPeriodMatches('EVENING', new Date('2026-08-18T09:00:00+03:00')), false);
console.log('booking lifecycle: ok');

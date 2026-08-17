export const HOLD_MINUTES = 7;
export const WAITLIST_OFFER_MINUTES = 30;

export type BookingState = 'REQUESTED' | 'CONFIRMED' | 'CHECKED_IN' | 'IN_SERVICE' | 'READY' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export function bookingHoldExpiresAt(now = new Date()) {
  return new Date(now.valueOf() + HOLD_MINUTES * 60_000);
}

export function reminderPlan(startsAt: Date, now = new Date()) {
  return [
    { kind: 'DAY_BEFORE', scheduledAt: new Date(startsAt.valueOf() - 24 * 60 * 60_000) },
    { kind: 'TWO_HOURS', scheduledAt: new Date(startsAt.valueOf() - 2 * 60 * 60_000) }
  ].filter((item) => item.scheduledAt > now);
}

export function canCancelBooking(state: string, startsAt: Date, now = new Date()) {
  return ['REQUESTED', 'CONFIRMED'].includes(state) && startsAt > now;
}

export function canRescheduleBooking(state: string, startsAt: Date, now = new Date()) {
  return ['REQUESTED', 'CONFIRMED'].includes(state) && startsAt > now;
}

export function canMarkNoShow(state: string, startsAt: Date, now = new Date()) {
  return ['CONFIRMED', 'CHECKED_IN'].includes(state) && startsAt <= now;
}

export function waitlistPeriodMatches(period: string, startsAt: Date) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).format(startsAt));
  return period === 'ANY' || (period === 'MORNING' && hour < 13) || (period === 'AFTERNOON' && hour >= 13 && hour < 18) || (period === 'EVENING' && hour >= 18);
}

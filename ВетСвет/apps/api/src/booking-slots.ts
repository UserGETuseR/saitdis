export type BookingInterval = {
  startsAt: Date | string;
  endsAt: Date | string;
};

export type BookingSlot = {
  startsAt: string;
  endsAt: string;
  available: number;
};

type BookingSlotInput = {
  date: string;
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  capacity: number;
  busy: BookingInterval[];
  now?: Date;
  openHour?: number;
  closeHour?: number;
  stepMinutes?: number;
  minimumLeadMinutes?: number;
  timezoneOffset?: string;
};

const asDate = (value: Date | string) => value instanceof Date ? value : new Date(value);

export function buildBookingSlots(input: BookingSlotInput): BookingSlot[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return [];
  const duration = Math.max(5, Math.round(input.durationMinutes));
  const before = Math.max(0, Math.round(input.bufferBeforeMinutes ?? 0));
  const after = Math.max(0, Math.round(input.bufferAfterMinutes ?? 0));
  const capacity = Math.max(0, Math.floor(input.capacity));
  if (!capacity) return [];
  const openHour = input.openHour ?? 9;
  const closeHour = input.closeHour ?? 21;
  const step = Math.max(5, Math.round(input.stepMinutes ?? 30));
  const offset = input.timezoneOffset ?? '+03:00';
  const now = input.now ?? new Date();
  const earliest = now.valueOf() + Math.max(0, input.minimumLeadMinutes ?? 120) * 60_000;
  const open = new Date(`${input.date}T${String(openHour).padStart(2, '0')}:00:00${offset}`);
  const close = new Date(`${input.date}T${String(closeHour).padStart(2, '0')}:00:00${offset}`);
  if (Number.isNaN(open.valueOf()) || Number.isNaN(close.valueOf())) return [];
  const busy = input.busy.map((item) => ({ startsAt: asDate(item.startsAt), endsAt: asDate(item.endsAt) }))
    .filter((item) => !Number.isNaN(item.startsAt.valueOf()) && !Number.isNaN(item.endsAt.valueOf()));
  const result: BookingSlot[] = [];
  for (let cursor = open.valueOf(); cursor + duration * 60_000 <= close.valueOf(); cursor += step * 60_000) {
    if (cursor < earliest) continue;
    const startsAt = new Date(cursor);
    const endsAt = new Date(cursor + duration * 60_000);
    const occupiedFrom = cursor - before * 60_000;
    const occupiedUntil = endsAt.valueOf() + after * 60_000;
    const occupied = busy.filter((item) => item.startsAt.valueOf() < occupiedUntil && item.endsAt.valueOf() > occupiedFrom).length;
    const available = Math.max(0, capacity - occupied);
    if (available > 0) result.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), available });
  }
  return result;
}

export function dateKeyInMoscow(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

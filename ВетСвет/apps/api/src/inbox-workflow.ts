const urgent = /(не дыш|судорог|кровотеч|без созн|отрав|сбит|удуш|острая боль|живот раздул)/i;
const professional = /(симптом|рвот|понос|температур|лекар|анализ|назнач|рана|аппетит|вял|аллерг|кожа|ухо|глаз)/i;

export function classifyInboxMessage(message: string, now = new Date()) {
  const classification = urgent.test(message) ? 'URGENT' : professional.test(message) ? 'PROFESSIONAL' : 'ADMINISTRATIVE';
  const priority = classification === 'URGENT' ? 'CRITICAL' : classification === 'PROFESSIONAL' ? 'HIGH' : 'NORMAL';
  const slaMinutes = classification === 'URGENT' ? 5 : classification === 'PROFESSIONAL' ? 30 : 120;
  const assignedRole = classification === 'URGENT' || classification === 'PROFESSIONAL' ? 'VETERINARIAN' : 'RECEPTIONIST';
  return { classification, priority, slaMinutes, assignedRole, slaDueAt: new Date(now.valueOf() + slaMinutes * 60_000), emergencyNotice: classification === 'URGENT' };
}

export const canResolveInbox = (state: string, outcome: string) => ['OPEN', 'ASSIGNED', 'WAITING_OWNER'].includes(state) && outcome.trim().length >= 10;
export const inboxSlaState = (slaDueAt: Date, state: string, now = new Date()) => state === 'RESOLVED' ? 'DONE' : slaDueAt <= now ? 'BREACHED' : slaDueAt.valueOf() - now.valueOf() <= 15 * 60_000 ? 'AT_RISK' : 'ON_TRACK';

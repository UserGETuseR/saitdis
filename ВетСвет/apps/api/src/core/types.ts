export type UUID = string;
export type ISODateTime = string;

export type Actor = {
  userId: UUID;
  organizationId: UUID;
  membershipId?: UUID;
  source: 'STAFF_APP' | 'CLIENT_WEB' | 'TELEGRAM' | 'SYSTEM';
};

export type CommandMeta = {
  actor: Actor;
  idempotencyKey: string;
  correlationId: string;
  now?: Date;
};

export function iso(now: Date = new Date()): ISODateTime {
  return now.toISOString();
}

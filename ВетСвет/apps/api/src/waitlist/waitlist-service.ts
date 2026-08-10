import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { BookingService, type Appointment } from '../booking/booking-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type WaitlistEntry = { id: UUID; organizationId: UUID; ownerId: UUID; petId: UUID; variantId: UUID; locationId: UUID; staffId?: UUID; state: 'WAITING' | 'OFFERED' | 'BOOKED' | 'EXPIRED' | 'CANCELLED'; offerId?: UUID; createdAt: ISODateTime };
export type SlotOffer = { id: UUID; organizationId: UUID; entryId: UUID; startsAt: ISODateTime; expiresAt: ISODateTime; state: 'ACTIVE' | 'ACCEPTED' | 'EXPIRED'; createdAt: ISODateTime };

/** Slot offers are one-at-a-time leases; accepting a lease uses the official
 * booking service, so a waitlist cannot bypass availability or resources. */
export class WaitlistService {
  readonly entries = new Map<UUID, WaitlistEntry>(); readonly offers = new Map<UUID, SlotOffer>(); private readonly slotLocks = new Set<string>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService, private readonly booking: BookingService) {}
  join(input: { ownerId: UUID; petId: UUID; variantId: UUID; locationId: UUID; staffId?: UUID }, meta: CommandMeta): WaitlistEntry {
    this.access.require(meta.actor, 'appointment:write'); const entry: WaitlistEntry = { id: randomUUID(), organizationId: meta.actor.organizationId, ...input, state: 'WAITING', createdAt: iso(meta.now ?? new Date()) }; this.entries.set(entry.id, entry); this.journal.record(meta, { action: 'waitlist.joined', aggregateType: 'WaitlistEntry', aggregateId: entry.id, metadata: {} }, { eventName: 'waitlist.joined', aggregateType: 'WaitlistEntry', aggregateId: entry.id, payload: { petId: entry.petId } }); return entry;
  }
  offer(entryId: UUID, input: { startsAt: ISODateTime; expiresAt: ISODateTime }, meta: CommandMeta): SlotOffer {
    this.access.require(meta.actor, 'appointment:write'); const entry = this.getEntry(entryId, meta.actor.organizationId); const key = `${entry.locationId}:${entry.staffId ?? 'any'}:${input.startsAt}`;
    if (entry.state !== 'WAITING' || this.slotLocks.has(key) || new Date(input.expiresAt) <= new Date(meta.now ?? new Date())) throw new DomainError('CONFLICT', 'Slot cannot be offered right now.');
    const offer: SlotOffer = { id: randomUUID(), organizationId: entry.organizationId, entryId: entry.id, startsAt: input.startsAt, expiresAt: input.expiresAt, state: 'ACTIVE', createdAt: iso(meta.now ?? new Date()) }; this.offers.set(offer.id, offer); this.slotLocks.add(key); entry.state = 'OFFERED'; entry.offerId = offer.id; return offer;
  }
  accept(offerId: UUID, staffId: UUID, meta: CommandMeta): Appointment {
    this.access.require(meta.actor, 'appointment:write'); const offer = this.offers.get(offerId); if (!offer || offer.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Slot offer is not available.'); const entry = this.getEntry(offer.entryId, meta.actor.organizationId);
    if (offer.state !== 'ACTIVE' || new Date(offer.expiresAt) <= new Date(meta.now ?? new Date())) { offer.state = 'EXPIRED'; entry.state = 'EXPIRED'; throw new DomainError('CONFLICT', 'Slot offer expired.'); }
    const appointment = this.booking.createAppointment({ locationId: entry.locationId, ownerId: entry.ownerId, petId: entry.petId, variantId: entry.variantId, staffId, startsAt: offer.startsAt, initialState: 'CONFIRMED' }, meta); offer.state = 'ACCEPTED'; entry.state = 'BOOKED'; this.slotLocks.delete(`${entry.locationId}:${entry.staffId ?? 'any'}:${offer.startsAt}`); return appointment;
  }
  private getEntry(id: UUID, organizationId: UUID): WaitlistEntry { const entry = this.entries.get(id); if (!entry || entry.organizationId !== organizationId) throw new DomainError('NOT_FOUND', 'Waitlist entry is not available.'); return entry; }
}

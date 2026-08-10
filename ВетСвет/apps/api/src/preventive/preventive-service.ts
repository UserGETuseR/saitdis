import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { BookingService } from '../booking/booking-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type Vaccination = { id: UUID; organizationId: UUID; petId: UUID; name: string; lotNumber?: string; administeredAt: ISODateTime; nextDueAt?: ISODateTime; clinicianId: UUID; state: 'ADMINISTERED' | 'VOIDED'; createdAt: ISODateTime };
export class PreventiveService {
  readonly vaccinations = new Map<UUID, Vaccination>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService, private readonly booking: BookingService) {}
  recordVaccination(input: { petId: UUID; name: string; lotNumber?: string; administeredAt: ISODateTime; nextDueAt?: ISODateTime }, meta: CommandMeta): Vaccination {
    this.access.require(meta.actor, 'clinical:write'); const pet = this.booking.ownerPets.pets.get(input.petId); if (!pet || pet.organizationId !== meta.actor.organizationId || !input.name.trim() || Number.isNaN(new Date(input.administeredAt).valueOf())) throw new DomainError('VALIDATION', 'Pet, vaccine name and administration time are required.');
    const now = meta.now ?? new Date(); const record: Vaccination = { id: randomUUID(), organizationId: meta.actor.organizationId, petId: input.petId, name: input.name.trim(), lotNumber: input.lotNumber?.trim(), administeredAt: input.administeredAt, nextDueAt: input.nextDueAt, clinicianId: meta.actor.userId, state: 'ADMINISTERED', createdAt: iso(now) }; this.vaccinations.set(record.id, record); this.journal.record(meta, { action: 'vaccination.administered', aggregateType: 'Vaccination', aggregateId: record.id, metadata: {} }, { eventName: 'vaccination.administered', aggregateType: 'Vaccination', aggregateId: record.id, payload: { petId: record.petId } }, now); return record;
  }
  void(id: UUID, meta: CommandMeta): Vaccination { this.access.require(meta.actor, 'clinical:write'); const record = this.vaccinations.get(id); if (!record || record.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Vaccination is not available.'); if (record.state !== 'ADMINISTERED') throw new DomainError('CONFLICT', 'Vaccination is already voided.'); record.state = 'VOIDED'; return record; }
}

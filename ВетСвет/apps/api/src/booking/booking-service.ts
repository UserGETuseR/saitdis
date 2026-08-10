import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { AuditOutbox } from '../platform/audit-outbox';
import type { ServiceVariant } from '../catalog/catalog-service';
import { CatalogService } from '../catalog/catalog-service';
import { OwnerPetService, type Pet } from '../clients/owner-pet-service';

export const appointmentStates = ['DRAFT', 'REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'READY', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
export type AppointmentState = (typeof appointmentStates)[number];
export type Appointment = { id: UUID; organizationId: UUID; locationId: UUID; ownerId: UUID; petId: UUID; variantId: UUID; staffId: UUID; startsAt: ISODateTime; endsAt: ISODateTime; state: AppointmentState; createdAt: ISODateTime; cancelReason?: string };
export type StaffAvailability = { id: UUID; organizationId: UUID; locationId: UUID; staffId: UUID; startsAt: ISODateTime; endsAt: ISODateTime };

const transitions: Readonly<Record<AppointmentState, readonly AppointmentState[]>> = {
  DRAFT: ['REQUESTED', 'CANCELLED'], REQUESTED: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'], CHECKED_IN: ['IN_SERVICE', 'CANCELLED'], IN_SERVICE: ['READY'], READY: ['COMPLETED'], COMPLETED: [], CANCELLED: [], NO_SHOW: [],
};

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean { return startA < endB && endA > startB; }

export class BookingService {
  readonly appointments = new Map<UUID, Appointment>();
  readonly availability: StaffAvailability[] = [];
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService, private readonly catalog: CatalogService, readonly ownerPets: OwnerPetService) {}

  setStaffAvailability(input: Omit<StaffAvailability, 'id' | 'organizationId'>, meta: CommandMeta): StaffAvailability {
    this.access.require(meta.actor, 'appointment:write');
    const start = new Date(input.startsAt); const end = new Date(input.endsAt);
    if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || start >= end) throw new DomainError('VALIDATION', 'Availability needs a valid time range.');
    const slot = { id: randomUUID(), organizationId: meta.actor.organizationId, ...input };
    this.availability.push(slot);
    this.journal.record(meta, { action: 'staff_availability.created', aggregateType: 'StaffAvailability', aggregateId: slot.id, metadata: { staffId: slot.staffId } }, { eventName: 'staff_availability.created', aggregateType: 'StaffAvailability', aggregateId: slot.id, payload: { staffId: slot.staffId } });
    return slot;
  }

  createAppointment(input: { locationId: UUID; ownerId: UUID; petId: UUID; variantId: UUID; staffId: UUID; startsAt: ISODateTime; initialState?: 'REQUESTED' | 'CONFIRMED' }, meta: CommandMeta): Appointment {
    this.access.require(meta.actor, 'appointment:write');
    const variant = this.catalog.getVariant(input.variantId, meta.actor.organizationId);
    const pet = this.assertOwnerPet(input.ownerId, input.petId, meta.actor.organizationId);
    if (!variant.allowedSpecies.includes(pet.species)) throw new DomainError('VALIDATION', 'This service is not available for the pet species.');
    const start = new Date(input.startsAt);
    if (Number.isNaN(start.valueOf())) throw new DomainError('VALIDATION', 'Appointment start time is invalid.');
    const endsAt = new Date(start.valueOf() + variant.durationMinutes * 60_000);
    this.assertAvailable(input.locationId, input.staffId, variant, start, endsAt, meta.actor.organizationId);
    const now = meta.now ?? new Date();
    const appointment: Appointment = { id: randomUUID(), organizationId: meta.actor.organizationId, locationId: input.locationId, ownerId: input.ownerId, petId: input.petId, variantId: variant.id, staffId: input.staffId, startsAt: iso(start), endsAt: iso(endsAt), state: input.initialState ?? 'REQUESTED', createdAt: iso(now) };
    this.appointments.set(appointment.id, appointment);
    this.journal.record(meta, { action: 'appointment.created', aggregateType: 'Appointment', aggregateId: appointment.id, metadata: { state: appointment.state } }, { eventName: `appointment.${appointment.state.toLowerCase()}`, aggregateType: 'Appointment', aggregateId: appointment.id, payload: { petId: appointment.petId, variantId: appointment.variantId } }, now);
    return appointment;
  }

  transition(appointmentId: UUID, nextState: AppointmentState, meta: CommandMeta, cancelReason?: string): Appointment {
    this.access.require(meta.actor, 'appointment:write');
    const appointment = this.appointments.get(appointmentId);
    if (!appointment || appointment.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Appointment is not available in this organization.');
    if (!transitions[appointment.state].includes(nextState)) throw new DomainError('CONFLICT', `Cannot move appointment from ${appointment.state} to ${nextState}.`);
    const previousState = appointment.state;
    appointment.state = nextState;
    if (nextState === 'CANCELLED') appointment.cancelReason = cancelReason?.trim() || 'Not specified';
    const now = meta.now ?? new Date();
    this.journal.record(meta, { action: `appointment.${nextState.toLowerCase()}`, aggregateType: 'Appointment', aggregateId: appointment.id, metadata: { from: previousState, cancelReason: appointment.cancelReason } }, { eventName: `appointment.${nextState.toLowerCase()}`, aggregateType: 'Appointment', aggregateId: appointment.id, payload: { petId: appointment.petId } }, now);
    return appointment;
  }

  reschedule(appointmentId: UUID, input: { staffId: UUID; startsAt: ISODateTime }, meta: CommandMeta): Appointment {
    this.access.require(meta.actor, 'appointment:write'); const appointment = this.appointments.get(appointmentId);
    if (!appointment || appointment.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Appointment is not available in this organization.');
    if (!['REQUESTED', 'CONFIRMED'].includes(appointment.state)) throw new DomainError('CONFLICT', 'Only requested or confirmed appointments can be rescheduled.');
    const variant = this.catalog.getVariant(appointment.variantId, meta.actor.organizationId); const start = new Date(input.startsAt); const end = new Date(start.valueOf() + variant.durationMinutes * 60_000); this.assertAvailable(appointment.locationId, input.staffId, variant, start, end, meta.actor.organizationId);
    appointment.staffId = input.staffId; appointment.startsAt = iso(start); appointment.endsAt = iso(end); this.journal.record(meta, { action: 'appointment.rescheduled', aggregateType: 'Appointment', aggregateId: appointment.id, metadata: {} }, { eventName: 'appointment.rescheduled', aggregateType: 'Appointment', aggregateId: appointment.id, payload: { petId: appointment.petId } }); return appointment;
  }

  private assertOwnerPet(ownerId: UUID, petId: UUID, organizationId: UUID): Pet {
    const owner = this.ownerPets.owners.get(ownerId); const pet = this.ownerPets.pets.get(petId);
    const relation = this.ownerPets.relations.some((item) => item.organizationId === organizationId && item.ownerId === ownerId && item.petId === petId);
    if (!owner || !pet || owner.organizationId !== organizationId || pet.organizationId !== organizationId || !relation) throw new DomainError('NOT_FOUND', 'Pet is not available to this owner in this organization.');
    return pet;
  }

  private assertAvailable(locationId: UUID, staffId: UUID, variant: ServiceVariant, start: Date, end: Date, organizationId: UUID): void {
    const bufferedStart = new Date(start.valueOf() - variant.bufferBeforeMinutes * 60_000); const bufferedEnd = new Date(end.valueOf() + variant.bufferAfterMinutes * 60_000);
    const covered = this.availability.some((slot) => slot.organizationId === organizationId && slot.locationId === locationId && slot.staffId === staffId && new Date(slot.startsAt) <= bufferedStart && new Date(slot.endsAt) >= bufferedEnd);
    if (!covered) throw new DomainError('CONFLICT', 'Selected staff is not available for this service and time.');
    const active = [...this.appointments.values()].filter((item) => item.organizationId === organizationId && !['CANCELLED', 'NO_SHOW'].includes(item.state));
    if (active.some((item) => item.staffId === staffId && overlaps(bufferedStart, bufferedEnd, new Date(item.startsAt), new Date(item.endsAt)))) throw new DomainError('CONFLICT', 'Selected staff already has an overlapping appointment.');
    for (const resourceId of variant.requiredResourceIds) {
      const resource = this.catalog.resources.get(resourceId);
      if (!resource || resource.locationId !== locationId || !resource.isActive) throw new DomainError('CONFLICT', 'A required resource is unavailable at this location.');
      const usage = active.filter((item) => {
        const existingVariant = this.catalog.variants.get(item.variantId);
        return existingVariant?.requiredResourceIds.includes(resourceId) && overlaps(bufferedStart, bufferedEnd, new Date(item.startsAt), new Date(item.endsAt));
      }).length;
      if (usage >= resource.capacity) throw new DomainError('CONFLICT', 'A required resource is already fully booked.');
    }
  }
}

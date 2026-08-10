import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { BookingService } from '../booking/booking-service';
import { CatalogService } from '../catalog/catalog-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type GroomingProfile = { id: UUID; organizationId: UUID; petId: UUID; coatType?: string; sensitivities?: string; behaviorNotes?: string; preferredStyle?: string; updatedAt: ISODateTime };
export type GroomingRecipe = { id: UUID; organizationId: UUID; petId: UUID; title: string; steps: readonly string[]; notes?: string; isPreferred: boolean; createdAt: ISODateTime };
export type GroomingVisit = { id: UUID; organizationId: UUID; appointmentId: UUID; petId: UUID; recipeId?: UUID; state: 'IN_PROGRESS' | 'COMPLETE'; beforeFileIds: readonly UUID[]; afterFileIds: readonly UUID[]; report?: string; completedAt?: ISODateTime };

export class GroomingService {
  readonly profiles = new Map<string, GroomingProfile>();
  readonly recipes = new Map<UUID, GroomingRecipe>();
  readonly visits = new Map<UUID, GroomingVisit>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService, private readonly booking: BookingService, private readonly catalog: CatalogService) {}

  upsertProfile(input: { petId: UUID; coatType?: string; sensitivities?: string; behaviorNotes?: string; preferredStyle?: string }, meta: CommandMeta): GroomingProfile {
    this.access.require(meta.actor, 'grooming:write');
    const pet = this.booking.ownerPets.pets.get(input.petId);
    if (!pet || pet.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Pet is not available in this organization.');
    const now = meta.now ?? new Date(); const key = `${meta.actor.organizationId}:${input.petId}`;
    const profile: GroomingProfile = { id: this.profiles.get(key)?.id ?? randomUUID(), organizationId: meta.actor.organizationId, petId: input.petId, coatType: input.coatType?.trim(), sensitivities: input.sensitivities?.trim(), behaviorNotes: input.behaviorNotes?.trim(), preferredStyle: input.preferredStyle?.trim(), updatedAt: iso(now) };
    this.profiles.set(key, profile);
    this.journal.record(meta, { action: 'grooming_profile.saved', aggregateType: 'GroomingProfile', aggregateId: profile.id, metadata: { petId: profile.petId } }, { eventName: 'grooming_profile.saved', aggregateType: 'GroomingProfile', aggregateId: profile.id, payload: { petId: profile.petId } }, now);
    return profile;
  }

  createRecipe(input: { petId: UUID; title: string; steps: readonly string[]; notes?: string; isPreferred?: boolean }, meta: CommandMeta): GroomingRecipe {
    this.access.require(meta.actor, 'grooming:write');
    const profile = this.profiles.get(`${meta.actor.organizationId}:${input.petId}`);
    if (!profile) throw new DomainError('NOT_FOUND', 'Create a grooming profile before saving a recipe.');
    if (!input.title.trim() || input.steps.length === 0 || input.steps.some((step) => !step.trim())) throw new DomainError('VALIDATION', 'Recipe title and at least one complete step are required.');
    if (input.isPreferred) for (const recipe of this.recipes.values()) if (recipe.organizationId === meta.actor.organizationId && recipe.petId === input.petId) recipe.isPreferred = false;
    const now = meta.now ?? new Date();
    const recipe: GroomingRecipe = { id: randomUUID(), organizationId: meta.actor.organizationId, petId: input.petId, title: input.title.trim(), steps: input.steps.map((step) => step.trim()), notes: input.notes?.trim(), isPreferred: input.isPreferred ?? false, createdAt: iso(now) };
    this.recipes.set(recipe.id, recipe);
    this.journal.record(meta, { action: 'grooming_recipe.created', aggregateType: 'GroomingRecipe', aggregateId: recipe.id, metadata: { petId: recipe.petId } }, { eventName: 'grooming_recipe.created', aggregateType: 'GroomingRecipe', aggregateId: recipe.id, payload: { petId: recipe.petId } }, now);
    return recipe;
  }

  startVisit(input: { appointmentId: UUID; recipeId?: UUID; beforeFileIds?: readonly UUID[] }, meta: CommandMeta): GroomingVisit {
    this.access.require(meta.actor, 'grooming:write');
    const appointment = this.booking.appointments.get(input.appointmentId);
    if (!appointment || appointment.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Appointment is not available in this organization.');
    const service = this.catalog.services.get(this.catalog.getVariant(appointment.variantId, meta.actor.organizationId).serviceId);
    if (service?.kind !== 'GROOMING') throw new DomainError('VALIDATION', 'A grooming visit requires a grooming appointment.');
    if (appointment.state !== 'IN_SERVICE') throw new DomainError('CONFLICT', 'Grooming visit can start only when the appointment is in service.');
    if ([...this.visits.values()].some((visit) => visit.appointmentId === appointment.id)) throw new DomainError('CONFLICT', 'Grooming visit already exists for this appointment.');
    if (input.recipeId) { const recipe = this.recipes.get(input.recipeId); if (!recipe || recipe.organizationId !== meta.actor.organizationId || recipe.petId !== appointment.petId) throw new DomainError('NOT_FOUND', 'Recipe is not available for this pet.'); }
    const visit: GroomingVisit = { id: randomUUID(), organizationId: meta.actor.organizationId, appointmentId: appointment.id, petId: appointment.petId, recipeId: input.recipeId, state: 'IN_PROGRESS', beforeFileIds: input.beforeFileIds ?? [], afterFileIds: [] };
    this.visits.set(visit.id, visit);
    this.journal.record(meta, { action: 'grooming_visit.started', aggregateType: 'GroomingVisit', aggregateId: visit.id, metadata: { appointmentId: appointment.id } }, { eventName: 'grooming_visit.started', aggregateType: 'GroomingVisit', aggregateId: visit.id, payload: { petId: visit.petId } });
    return visit;
  }

  completeVisit(visitId: UUID, input: { report: string; afterFileIds?: readonly UUID[] }, meta: CommandMeta): GroomingVisit {
    this.access.require(meta.actor, 'grooming:write');
    const visit = this.visits.get(visitId);
    if (!visit || visit.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Grooming visit is not available in this organization.');
    if (visit.state !== 'IN_PROGRESS' || !input.report.trim()) throw new DomainError('CONFLICT', 'An in-progress visit and client report are required.');
    const now = meta.now ?? new Date(); visit.state = 'COMPLETE'; visit.report = input.report.trim(); visit.afterFileIds = input.afterFileIds ?? []; visit.completedAt = iso(now);
    this.journal.record(meta, { action: 'grooming_visit.completed', aggregateType: 'GroomingVisit', aggregateId: visit.id, metadata: { appointmentId: visit.appointmentId } }, { eventName: 'grooming_visit.completed', aggregateType: 'GroomingVisit', aggregateId: visit.id, payload: { petId: visit.petId } }, now);
    return visit;
  }
}

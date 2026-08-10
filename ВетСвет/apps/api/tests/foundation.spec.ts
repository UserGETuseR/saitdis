import assert from 'node:assert/strict';
import { DomainError } from '../src/core/errors';
import type { CommandMeta } from '../src/core/types';
import { createFoundation } from '../src/foundation';
import { readTelegramRuntimeConfig } from '../../telegram-bot/src/runtime-config';
import { rubles } from '../../../packages/contracts/src/money';

const at = new Date('2026-08-10T08:00:00.000Z');
function command(organizationId: string, key: string): CommandMeta {
  return { actor: { userId: 'owner-user', organizationId, source: 'STAFF_APP' }, idempotencyKey: key, correlationId: `trace-${key}`, now: at };
}

function testHappyPath(): void {
  const app = createFoundation();
  app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
  const location = app.organizations.createLocation({ name: 'Главная клиника', timezone: 'Europe/Moscow' }, command('org-a', 'create-location'));
  const owner = app.ownerPets.createOwner({ fullName: 'Анна Петрова', phone: '+79990000000' }, command('org-a', 'create-owner'));
  const pet = app.ownerPets.createPet({ ownerId: owner.id, name: 'Мишка', species: 'DOG' }, command('org-a', 'create-pet'));
  assert.equal(location.organizationId, 'org-a');
  assert.deepEqual(app.ownerPets.petHistoryFor(owner.id, command('org-a', 'read-pets')), [pet]);
  assert.deepEqual(app.journal.events.map((event) => event.eventName), ['organization.created', 'location.created', 'owner.created', 'pet.created']);
  assert.ok(app.journal.audits.every((audit) => audit.organizationId === 'org-a'));
}

function testIdempotency(): void {
  const app = createFoundation();
  app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
  const first = app.ownerPets.createOwner({ fullName: 'Анна Петрова' }, command('org-a', 'retry-owner'));
  const retry = app.ownerPets.createOwner({ fullName: 'Анна Петрова' }, command('org-a', 'retry-owner'));
  assert.equal(retry, first);
  assert.equal(app.ownerPets.owners.size, 1);
  assert.equal(app.journal.events.filter((event) => event.eventName === 'owner.created').length, 1);
}

function testTenantIsolation(): void {
  const app = createFoundation();
  app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org-a'));
  app.organizations.createOrganization({ legalName: 'ООО Другая клиника', displayName: 'Другая' }, command('org-b', 'create-org-b'));
  const owner = app.ownerPets.createOwner({ fullName: 'Анна Петрова' }, command('org-a', 'create-owner'));
  assert.throws(() => app.ownerPets.createPet({ ownerId: owner.id, name: 'Мишка', species: 'DOG' }, command('org-b', 'steal-pet')), (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND');
  assert.throws(() => app.ownerPets.petHistoryFor(owner.id, command('org-b', 'steal-read')), (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND');
}

function testRoleAuthorization(): void {
  const app = createFoundation();
  app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
  app.access.grantMembership({ userId: 'groomer-user', role: 'GROOMER' }, command('org-a', 'grant-groomer').actor, at);
  const groomerMeta: CommandMeta = { ...command('org-a', 'groomer-create-owner'), actor: { userId: 'groomer-user', organizationId: 'org-a', source: 'STAFF_APP' } };
  assert.throws(() => app.ownerPets.createOwner({ fullName: 'Анна Петрова' }, groomerMeta), (error: unknown) => error instanceof DomainError && error.code === 'FORBIDDEN');
}

function testTelegramSecretBoundary(): void {
  const config = readTelegramRuntimeConfig({ TELEGRAM_BOT_TOKEN: '123456:abcdefghijklmnopqrst' });
  assert.equal(config.token, '123456:abcdefghijklmnopqrst');
  assert.throws(() => readTelegramRuntimeConfig({}), /TELEGRAM_BOT_TOKEN is required/);
}

function testResourceAwareBookingStateMachine(): void {
  const app = createFoundation();
  app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
  const location = app.organizations.createLocation({ name: 'Главная клиника', timezone: 'Europe/Moscow' }, command('org-a', 'create-location'));
  const resource = app.catalog.createResource({ locationId: location.id, name: 'Груминг-стол №1', capacity: 1 }, command('org-a', 'resource'));
  const service = app.catalog.createService({ publicName: 'Комплексный груминг', internalName: 'GROOMING_FULL', kind: 'GROOMING' }, command('org-a', 'service'));
  const variant = app.catalog.createVariant({ serviceId: service.id, name: 'Для собак', durationMinutes: 90, bufferAfterMinutes: 15, price: rubles(450000), deposit: rubles(100000), allowedSpecies: ['DOG'], requiredResourceIds: [resource.id] }, command('org-a', 'variant'));
  const owner = app.ownerPets.createOwner({ fullName: 'Анна Петрова' }, command('org-a', 'owner'));
  const pet = app.ownerPets.createPet({ ownerId: owner.id, name: 'Мишка', species: 'DOG' }, command('org-a', 'pet'));
  app.booking.setStaffAvailability({ locationId: location.id, staffId: 'groomer-1', startsAt: '2026-08-11T08:00:00.000Z', endsAt: '2026-08-11T17:00:00.000Z' }, command('org-a', 'availability'));
  const appointment = app.booking.createAppointment({ locationId: location.id, ownerId: owner.id, petId: pet.id, variantId: variant.id, staffId: 'groomer-1', startsAt: '2026-08-11T10:00:00.000Z', initialState: 'CONFIRMED' }, command('org-a', 'appointment'));
  assert.equal(appointment.state, 'CONFIRMED');
  assert.throws(() => app.booking.createAppointment({ locationId: location.id, ownerId: owner.id, petId: pet.id, variantId: variant.id, staffId: 'groomer-1', startsAt: '2026-08-11T10:30:00.000Z' }, command('org-a', 'overlap')), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT');
  app.booking.transition(appointment.id, 'CHECKED_IN', command('org-a', 'checkin'));
  app.booking.transition(appointment.id, 'IN_SERVICE', command('org-a', 'start'));
  app.booking.transition(appointment.id, 'READY', command('org-a', 'ready'));
  app.booking.transition(appointment.id, 'COMPLETED', command('org-a', 'completed'));
  assert.equal(appointment.state, 'COMPLETED');
  assert.throws(() => app.booking.transition(appointment.id, 'CANCELLED', command('org-a', 'illegal-cancel')), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT');
}

function testInvoiceAndPaymentSafety(): void {
  const app = createFoundation();
  app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
  const location = app.organizations.createLocation({ name: 'Главная клиника', timezone: 'Europe/Moscow' }, command('org-a', 'location'));
  const service = app.catalog.createService({ publicName: 'Консультация', internalName: 'CONSULT', kind: 'CONSULTATION' }, command('org-a', 'service'));
  const variant = app.catalog.createVariant({ serviceId: service.id, name: 'Онлайн-консультация', durationMinutes: 30, price: rubles(150000), allowedSpecies: ['DOG'] }, command('org-a', 'variant'));
  const owner = app.ownerPets.createOwner({ fullName: 'Анна Петрова' }, command('org-a', 'owner'));
  const pet = app.ownerPets.createPet({ ownerId: owner.id, name: 'Мишка', species: 'DOG' }, command('org-a', 'pet'));
  app.booking.setStaffAvailability({ locationId: location.id, staffId: 'vet-1', startsAt: '2026-08-12T08:00:00.000Z', endsAt: '2026-08-12T17:00:00.000Z' }, command('org-a', 'availability'));
  const appointment = app.booking.createAppointment({ locationId: location.id, ownerId: owner.id, petId: pet.id, variantId: variant.id, staffId: 'vet-1', startsAt: '2026-08-12T10:00:00.000Z' }, command('org-a', 'appointment'));
  const invoice = app.finance.issueServiceInvoice(appointment.id, command('org-a', 'invoice'));
  const payment = app.finance.recordPayment({ invoiceId: invoice.id, provider: 'manual-test', providerTransactionId: 'transaction-001', amount: rubles(150000), state: 'SUCCEEDED' }, command('org-a', 'payment'));
  assert.equal(invoice.state, 'PAID');
  assert.equal(payment.amount.amountMinor, invoice.total.amountMinor);
  assert.throws(() => app.finance.recordPayment({ invoiceId: invoice.id, provider: 'manual-test', providerTransactionId: 'transaction-001', amount: rubles(150000), state: 'SUCCEEDED' }, command('org-a', 'payment-retry')), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT');
}

function testCompleteGroomingRevenueLoop(): void {
  const app = createFoundation();
  app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
  const location = app.organizations.createLocation({ name: 'Главная клиника', timezone: 'Europe/Moscow' }, command('org-a', 'location'));
  const service = app.catalog.createService({ publicName: 'Груминг', internalName: 'GROOMING', kind: 'GROOMING' }, command('org-a', 'service'));
  const variant = app.catalog.createVariant({ serviceId: service.id, name: 'Комплексный груминг', durationMinutes: 60, price: rubles(350000), allowedSpecies: ['DOG'] }, command('org-a', 'variant'));
  const owner = app.ownerPets.createOwner({ fullName: 'Анна Петрова' }, command('org-a', 'owner'));
  const pet = app.ownerPets.createPet({ ownerId: owner.id, name: 'Мишка', species: 'DOG' }, command('org-a', 'pet'));
  app.booking.setStaffAvailability({ locationId: location.id, staffId: 'groomer-1', startsAt: '2026-08-14T08:00:00.000Z', endsAt: '2026-08-14T17:00:00.000Z' }, command('org-a', 'availability'));
  const appointment = app.booking.createAppointment({ locationId: location.id, ownerId: owner.id, petId: pet.id, variantId: variant.id, staffId: 'groomer-1', startsAt: '2026-08-14T10:00:00.000Z', initialState: 'CONFIRMED' }, command('org-a', 'appointment'));
  const invoice = app.finance.issueServiceInvoice(appointment.id, command('org-a', 'invoice'));
  app.finance.recordPayment({ invoiceId: invoice.id, provider: 'manual-test', providerTransactionId: 'grooming-pay-001', amount: rubles(350000), state: 'SUCCEEDED' }, command('org-a', 'payment'));
  app.grooming.upsertProfile({ petId: pet.id, coatType: 'double coat', behaviorNotes: 'Спокойно переносит сушку', preferredStyle: 'Естественная форма' }, command('org-a', 'profile'));
  const recipe = app.grooming.createRecipe({ petId: pet.id, title: 'Летний уход Мишки', steps: ['Осмотр шерсти', 'Мытьё', 'Сушка', 'Оформление'] , isPreferred: true }, command('org-a', 'recipe'));
  app.booking.transition(appointment.id, 'CHECKED_IN', command('org-a', 'checkin'));
  app.booking.transition(appointment.id, 'IN_SERVICE', command('org-a', 'in-service'));
  const visit = app.grooming.startVisit({ appointmentId: appointment.id, recipeId: recipe.id, beforeFileIds: ['before-file'] }, command('org-a', 'grooming-start'));
  app.grooming.completeVisit(visit.id, { report: 'Мишка спокойно перенёс процедуру. Следующий уход — ориентировочно через 6–8 недель.', afterFileIds: ['after-file'] }, command('org-a', 'grooming-complete'));
  app.booking.transition(appointment.id, 'READY', command('org-a', 'ready'));
  app.booking.transition(appointment.id, 'COMPLETED', command('org-a', 'complete'));
  assert.equal(invoice.state, 'PAID');
  assert.equal(visit.state, 'COMPLETE');
  assert.equal(visit.afterFileIds.length, 1);
  assert.ok(app.journal.events.some((event) => event.eventName === 'grooming_visit.completed'));
}

function testTriageAndPaidConsultationLoop(): void {
  const app = createFoundation();
  app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
  app.access.grantMembership({ userId: 'vet-1', role: 'VETERINARIAN' }, command('org-a', 'grant-vet').actor, at);
  const location = app.organizations.createLocation({ name: 'Главная клиника', timezone: 'Europe/Moscow' }, command('org-a', 'location'));
  const service = app.catalog.createService({ publicName: 'Консультация ветеринара', internalName: 'CONSULTATION', kind: 'CONSULTATION' }, command('org-a', 'service'));
  const variant = app.catalog.createVariant({ serviceId: service.id, name: 'Консультация онлайн', durationMinutes: 30, price: rubles(120000), allowedSpecies: ['CAT'] }, command('org-a', 'variant'));
  const owner = app.ownerPets.createOwner({ fullName: 'Мария Волкова' }, command('org-a', 'owner'));
  const pet = app.ownerPets.createPet({ ownerId: owner.id, name: 'Тиша', species: 'CAT' }, command('org-a', 'pet'));
  const triage = app.triage.submit({ source: 'PUBLIC_WEB', complaint: 'Тиша вялая с утра' }, command('org-a', 'triage'));
  const vetMeta: CommandMeta = { ...command('org-a', 'triage-assess'), actor: { userId: 'vet-1', organizationId: 'org-a', source: 'STAFF_APP' } };
  app.triage.assess(triage.id, { disposition: 'CONSULTATION', assignedStaffId: 'vet-1' }, vetMeta);
  app.booking.setStaffAvailability({ locationId: location.id, staffId: 'vet-1', startsAt: '2026-08-15T08:00:00.000Z', endsAt: '2026-08-15T17:00:00.000Z' }, command('org-a', 'availability'));
  const appointment = app.booking.createAppointment({ locationId: location.id, ownerId: owner.id, petId: pet.id, variantId: variant.id, staffId: 'vet-1', startsAt: '2026-08-15T10:00:00.000Z' }, command('org-a', 'appointment'));
  const consultation = app.consultations.requestPaidConsultation({ appointmentId: appointment.id, question: 'Нужно ли приехать сегодня?' }, command('org-a', 'consultation'));
  app.finance.recordPayment({ invoiceId: consultation.invoiceId, provider: 'manual-test', providerTransactionId: 'consultation-pay-001', amount: rubles(120000), state: 'SUCCEEDED' }, command('org-a', 'payment'));
  app.consultations.makeReadyForReview(consultation.id, command('org-a', 'ready-for-review'));
  app.consultations.answer(consultation.id, 'Пожалуйста, приезжайте сегодня на очный осмотр. Если состояние резко ухудшится — используйте срочный маршрут.', { ...command('org-a', 'answer'), actor: { userId: 'vet-1', organizationId: 'org-a', source: 'STAFF_APP' } });
  assert.equal(triage.disposition, 'CONSULTATION');
  assert.equal(consultation.state, 'ANSWERED');
  assert.equal(consultation.clinicianId, 'vet-1');
}

function testClinicalRecordVersionsFilesAndConsent(): void {
  const app = createFoundation();
  app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
  app.access.grantMembership({ userId: 'vet-1', role: 'VETERINARIAN' }, command('org-a', 'grant-vet').actor, at);
  const owner = app.ownerPets.createOwner({ fullName: 'Светлана Иванова' }, command('org-a', 'owner'));
  const pet = app.ownerPets.createPet({ ownerId: owner.id, name: 'Рыжик', species: 'CAT' }, command('org-a', 'pet'));
  const vetMeta: CommandMeta = { ...command('org-a', 'case'), actor: { userId: 'vet-1', organizationId: 'org-a', source: 'STAFF_APP' } };
  const clinicalCase = app.clinical.openCase({ ownerId: owner.id, petId: pet.id, reason: 'Снижение аппетита' }, vetMeta);
  const encounter = app.clinical.startEncounter({ caseId: clinicalCase.id }, vetMeta);
  app.clinical.updateDraft(encounter.id, { subjective: 'Владелец отмечает снижение аппетита.', objective: 'Осмотр выполнен.', assessment: 'Требуется дальнейшая оценка специалистом.', plan: 'Назначен контрольный осмотр.' }, vetMeta);
  app.clinical.finalizeEncounter(encounter.id, vetMeta);
  const prescription = app.clinical.issuePrescription({ encounterId: encounter.id, medicationName: 'Тестовый препарат', instructions: 'Только по схеме, согласованной специалистом.' }, vetMeta);
  const amendment = app.clinical.amendEncounter(encounter.id, { ...vetMeta, idempotencyKey: 'amend' });
  assert.equal(encounter.state, 'AMENDED');
  assert.equal(amendment.version, 2);
  assert.equal(prescription.state, 'ISSUED');
  const file = app.files.createUploadIntent({ originalName: 'ryzhik-before.png', contentType: 'image/png', byteSize: 1200, checksum: 'a'.repeat(64), ownerId: owner.id, petId: pet.id }, command('org-a', 'file'));
  app.files.markScanned(file.id, true, command('org-a', 'scan'));
  const consent = app.documents.recordConsent({ ownerId: owner.id, petId: pet.id, documentVersion: '2026-08-01', purpose: 'Согласие на обработку данных для оказания услуги' }, command('org-a', 'consent'));
  app.documents.revokeConsent(consent.id, command('org-a', 'revoke-consent'));
  assert.equal(file.state, 'AVAILABLE');
  assert.equal(consent.state, 'REVOKED');
  assert.throws(() => app.clinical.updateDraft(encounter.id, { plan: 'Тихая перезапись' }, vetMeta), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT');
}

function testCarePlanPreferencesAndPetTimeline(): void {
  const app = createFoundation();
  app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
  app.access.grantMembership({ userId: 'vet-1', role: 'VETERINARIAN' }, command('org-a', 'grant-vet').actor, at);
  const owner = app.ownerPets.createOwner({ fullName: 'Павел Морозов' }, command('org-a', 'owner'));
  const pet = app.ownerPets.createPet({ ownerId: owner.id, name: 'Луна', species: 'DOG' }, command('org-a', 'pet'));
  const vetMeta: CommandMeta = { ...command('org-a', 'care-plan'), actor: { userId: 'vet-1', organizationId: 'org-a', source: 'STAFF_APP' } };
  const plan = app.carePlans.createPlan({ ownerId: owner.id, petId: pet.id, title: 'Профилактика Луны' }, vetMeta);
  const task = app.carePlans.addTask({ carePlanId: plan.id, title: 'Запланировать контрольный осмотр', category: 'FOLLOW_UP', dueAt: '2026-09-10T08:00:00.000Z' }, { ...vetMeta, idempotencyKey: 'care-task' });
  app.carePlans.finishTask(task.id, 'DONE', command('org-a', 'care-task-done'));
  const preference = app.notificationPreferences.set({ ownerId: owner.id, channel: 'TELEGRAM', category: 'MARKETING', enabled: false }, command('org-a', 'marketing-off'));
  const timeline = app.timeline.forPet('org-a', pet.id);
  assert.equal(task.status, 'DONE');
  assert.equal(preference.enabled, false);
  assert.ok(timeline.some((event) => event.eventName === 'care_plan_task.created'));
}

function testOperationalTasksIncidentsAndInventory(): void {
  const app = createFoundation();
  app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
  const task = app.operations.createTask({ title: 'Подтвердить report владельцу', priority: 'HIGH' }, command('org-a', 'task'));
  const incident = app.operations.reportIncident({ type: 'GROOMING', severity: 'LOW', description: 'Зафиксировано небольшое раздражение кожи, владелец уведомлён.' }, command('org-a', 'incident'));
  const item = app.inventory.createItem({ sku: 'SHAMPOO-SENSITIVE', name: 'Шампунь для чувствительной кожи', unit: 'ml' }, command('org-a', 'item'));
  app.inventory.move({ itemId: item.id, locationId: 'location-a', quantity: 1000, direction: 'RECEIPT', reason: 'Поставка' }, command('org-a', 'receipt'));
  app.inventory.move({ itemId: item.id, locationId: 'location-a', quantity: 120, direction: 'CONSUMPTION', reason: 'Груминг Мишки' }, command('org-a', 'consumption'));
  app.operations.finishTask(task.id, command('org-a', 'task-done'));
  assert.equal(task.state, 'DONE');
  assert.equal(incident.state, 'OPEN');
  assert.equal(app.inventory.balance(item.id, 'location-a', 'org-a'), 880);
  assert.throws(() => app.inventory.move({ itemId: item.id, locationId: 'location-a', quantity: 1000, direction: 'CONSUMPTION', reason: 'Ошибка' }, command('org-a', 'negative')), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT');
}

function testHospitalReferralAndSupportFlows(): void {
  const app = createFoundation();
  app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
  app.access.grantMembership({ userId: 'vet-1', role: 'VETERINARIAN' }, command('org-a', 'grant-vet').actor, at);
  const owner = app.ownerPets.createOwner({ fullName: 'Артём Соколов' }, command('org-a', 'owner'));
  const pet = app.ownerPets.createPet({ ownerId: owner.id, name: 'Бакс', species: 'DOG' }, command('org-a', 'pet'));
  const vetMeta: CommandMeta = { ...command('org-a', 'admit'), actor: { userId: 'vet-1', organizationId: 'org-a', source: 'STAFF_APP' } };
  const admission = app.hospital.admit({ ownerId: owner.id, petId: pet.id }, vetMeta);
  const treatment = app.hospital.addTreatmentTask({ hospitalizationId: admission.id, title: 'Контроль состояния', scheduledAt: '2026-08-16T11:00:00.000Z' }, { ...vetMeta, idempotencyKey: 'treatment' });
  app.hospital.administer(treatment.id, { ...vetMeta, idempotencyKey: 'administer' }); app.hospital.markDischargeReady(admission.id, { ...vetMeta, idempotencyKey: 'ready-discharge' }); app.hospital.discharge(admission.id, { ...vetMeta, idempotencyKey: 'discharge' });
  const consent = app.documents.recordConsent({ ownerId: owner.id, petId: pet.id, documentVersion: '2026-08', purpose: 'Передача выбранных данных в другую клинику' }, command('org-a', 'consent'));
  const referral = app.referrals.create({ ownerId: owner.id, petId: pet.id, recipientName: 'Профильный специалист', reason: 'Второе мнение', consentId: consent.id, expiresAt: '2026-09-01T00:00:00.000Z' }, { ...vetMeta, idempotencyKey: 'referral' }); app.referrals.send(referral.id, { ...vetMeta, idempotencyKey: 'send-referral' });
  const support = app.support.create({ ownerId: owner.id, subject: 'Нужна помощь с документами' }, command('org-a', 'support')); app.support.resolve(support.id, command('org-a', 'resolve-support'));
  assert.equal(admission.state, 'DISCHARGED'); assert.equal(treatment.state, 'ADMINISTERED'); assert.equal(referral.state, 'SENT'); assert.equal(support.state, 'RESOLVED');
}

function testGrowthAndPrivacySafeAnalytics(): void {
  const app = createFoundation(); app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
  const packageItem = app.growth.createPackage({ name: 'Груминг 4 визита', includedServiceVariantIds: ['variant-1'], credits: 4 }, command('org-a', 'package'));
  const balance = app.growth.grantPackage({ packageId: packageItem.id, ownerId: 'owner-a', petId: 'pet-a' }, command('org-a', 'grant-package'));
  app.growth.consumeCredit(balance.id, command('org-a', 'use-credit')); const points = app.growth.addLoyaltyPoints({ ownerId: 'owner-a', pointsDelta: 120, reason: 'Подтверждённая программа лояльности' }, command('org-a', 'points'));
  const event = app.analytics.track('booking.completed', { service_kind: 'grooming', elapsed_seconds: 83 });
  assert.equal(balance.remainingCredits, 3); assert.equal(points.pointsDelta, 120); assert.equal(event.name, 'booking.completed'); assert.throws(() => app.analytics.track('bad', { phone: '+7999' }), (error: unknown) => error instanceof DomainError && error.code === 'VALIDATION');
}

function testKnowledgeAndExperimentSafety(): void {
  const app = createFoundation(); app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
  const article = app.knowledge.createDraft({ title: 'Как подготовить питомца к грумингу', slug: 'prepare-for-grooming', body: 'Спокойно подготовьте питомца и сообщите команде о важных особенностях.' }, command('org-a', 'article'));
  app.knowledge.publish(article.id, command('org-a', 'publish')); app.flags.set('booking.card-order', true, command('org-a', 'flag'));
  assert.equal(app.knowledge.search('org-a', 'подготовьте').length, 1); assert.equal(app.flags.enabled('org-a', 'booking.card-order'), true);
  assert.throws(() => app.flags.set('clinical.new-triage', true, command('org-a', 'unsafe-flag')), (error: unknown) => error instanceof DomainError && error.code === 'FORBIDDEN');
}

function testPassportAndPrivacyAgency(): void {
  const app = createFoundation(); app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
  const owner = app.ownerPets.createOwner({ fullName: 'Ирина Голубева' }, command('org-a', 'owner')); const pet = app.ownerPets.createPet({ ownerId: owner.id, name: 'Соня', species: 'CAT' }, command('org-a', 'pet'));
  const share = app.passport.createShare({ ownerId: owner.id, petId: pet.id, scope: 'EMERGENCY_IDENTITY', expiresAt: '2026-09-01T00:00:00.000Z' }, command('org-a', 'passport'));
  assert.equal(app.passport.emergencyView(share.token).petId, pet.id); app.passport.revoke(share.id, command('org-a', 'revoke-passport')); assert.throws(() => app.passport.emergencyView(share.token), (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND');
  const request = app.privacy.request({ ownerId: owner.id, type: 'EXPORT' }, command('org-a', 'privacy')); app.privacy.complete(request.id, command('org-a', 'privacy-done')); assert.equal(request.state, 'COMPLETED');
}

function testHumanControlledAiDrafts(): void {
  const app = createFoundation(); app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org')); app.access.grantMembership({ userId: 'vet-1', role: 'VETERINARIAN' }, command('org-a', 'grant-vet').actor, at);
  const vetMeta: CommandMeta = { ...command('org-a', 'ai-draft'), actor: { userId: 'vet-1', organizationId: 'org-a', source: 'STAFF_APP' } }; const draft = app.ai.saveDraft({ targetType: 'CLINICAL_NOTE', targetId: 'encounter-1', provider: 'approved-provider', model: 'model-v1', content: 'Черновик структурированной записи.' }, vetMeta); app.ai.review(draft.id, 'APPROVED', vetMeta);
  assert.equal(draft.state, 'APPROVED'); assert.equal(draft.reviewedBy, 'vet-1');
}

function testWaitlistOfferAndReschedule(): void {
  const app = createFoundation(); app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
  const location = app.organizations.createLocation({ name: 'Главная клиника', timezone: 'Europe/Moscow' }, command('org-a', 'location')); const service = app.catalog.createService({ publicName: 'Уход', internalName: 'CARE', kind: 'GROOMING' }, command('org-a', 'service')); const variant = app.catalog.createVariant({ serviceId: service.id, name: 'Уход для собак', durationMinutes: 60, price: rubles(100000), allowedSpecies: ['DOG'] }, command('org-a', 'variant'));
  const owner = app.ownerPets.createOwner({ fullName: 'Марина К.' }, command('org-a', 'owner')); const pet = app.ownerPets.createPet({ ownerId: owner.id, name: 'Рэй', species: 'DOG' }, command('org-a', 'pet')); app.booking.setStaffAvailability({ locationId: location.id, staffId: 'groomer-1', startsAt: '2026-08-20T08:00:00.000Z', endsAt: '2026-08-20T18:00:00.000Z' }, command('org-a', 'availability'));
  const entry = app.waitlist.join({ ownerId: owner.id, petId: pet.id, variantId: variant.id, locationId: location.id, staffId: 'groomer-1' }, command('org-a', 'waitlist')); const offer = app.waitlist.offer(entry.id, { startsAt: '2026-08-20T11:00:00.000Z', expiresAt: '2026-08-20T12:00:00.000Z' }, { ...command('org-a', 'offer'), now: new Date('2026-08-20T10:00:00.000Z') }); const appointment = app.waitlist.accept(offer.id, 'groomer-1', { ...command('org-a', 'accept'), now: new Date('2026-08-20T10:10:00.000Z') });
  app.booking.reschedule(appointment.id, { staffId: 'groomer-1', startsAt: '2026-08-20T13:00:00.000Z' }, command('org-a', 'reschedule')); assert.equal(entry.state, 'BOOKED'); assert.equal(appointment.startsAt, '2026-08-20T13:00:00.000Z');
}

function testPreventiveAndDiagnosticsLifecycle(): void {
  const app = createFoundation(); app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org')); app.access.grantMembership({ userId: 'vet-1', role: 'VETERINARIAN' }, command('org-a', 'grant-vet').actor, at); const owner = app.ownerPets.createOwner({ fullName: 'Елена М.' }, command('org-a', 'owner')); const pet = app.ownerPets.createPet({ ownerId: owner.id, name: 'Кекс', species: 'CAT' }, command('org-a', 'pet')); const vetMeta: CommandMeta = { ...command('org-a', 'vaccine'), actor: { userId: 'vet-1', organizationId: 'org-a', source: 'STAFF_APP' } };
  const vaccination = app.preventive.recordVaccination({ petId: pet.id, name: 'Комплексная вакцина', lotNumber: 'LOT-2026', administeredAt: '2026-08-21T10:00:00.000Z', nextDueAt: '2027-08-21T10:00:00.000Z' }, vetMeta); const order = app.diagnostics.order({ petId: pet.id, testName: 'Общий анализ крови' }, vetMeta); app.diagnostics.collect(order.id, { ...vetMeta, idempotencyKey: 'collect' }); app.diagnostics.result(order.id, 'Результат готов для review специалистом.', { ...vetMeta, idempotencyKey: 'result' }); assert.equal(vaccination.state, 'ADMINISTERED'); assert.equal(order.state, 'RESULT_READY');
}

function testOwnerReportingWithoutPii(): void {
  const app = createFoundation(); app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
  const location = app.organizations.createLocation({ name: 'Главная клиника', timezone: 'Europe/Moscow' }, command('org-a', 'location')); const service = app.catalog.createService({ publicName: 'Консультация', internalName: 'CONSULT', kind: 'CONSULTATION' }, command('org-a', 'service')); const variant = app.catalog.createVariant({ serviceId: service.id, name: 'Консультация', durationMinutes: 30, price: rubles(200000), allowedSpecies: ['DOG'] }, command('org-a', 'variant')); const owner = app.ownerPets.createOwner({ fullName: 'Наталья С.' }, command('org-a', 'owner')); const pet = app.ownerPets.createPet({ ownerId: owner.id, name: 'Арчи', species: 'DOG' }, command('org-a', 'pet'));
  app.booking.setStaffAvailability({ locationId: location.id, staffId: 'vet-1', startsAt: '2026-08-24T08:00:00.000Z', endsAt: '2026-08-24T18:00:00.000Z' }, command('org-a', 'availability')); const appointment = app.booking.createAppointment({ locationId: location.id, ownerId: owner.id, petId: pet.id, variantId: variant.id, staffId: 'vet-1', startsAt: '2026-08-24T11:00:00.000Z', initialState: 'CONFIRMED' }, command('org-a', 'appointment')); const invoice = app.finance.issueServiceInvoice(appointment.id, command('org-a', 'invoice')); app.finance.recordPayment({ invoiceId: invoice.id, provider: 'manual-test', providerTransactionId: 'reporting-001', amount: rubles(200000), state: 'SUCCEEDED' }, command('org-a', 'payment'));
  const revenue = app.reporting.revenue('org-a'); const schedule = app.reporting.schedule('org-a'); assert.deepEqual(revenue, { issuedMinor: 200000, paidMinor: 200000, invoicesIssued: 1, invoicesPaid: 1, currency: 'RUB' }); assert.equal(schedule.confirmed, 1);
}

function testOtpAndSessionSafety(): void {
  const app = createFoundation(); const at = new Date('2026-08-25T10:00:00.000Z'); const challenge = app.auth.requestOtp({ identity: '+79990000000', purpose: 'SIGN_IN', code: '123456' }, at); assert.throws(() => app.auth.verifyOtp(challenge.id, '000000', at), (error: unknown) => error instanceof DomainError && error.code === 'FORBIDDEN'); app.auth.verifyOtp(challenge.id, '123456', at); const first = app.auth.createSession({ userId: 'user-1', deviceLabel: 'iPhone' }, at); app.auth.createSession({ userId: 'user-1', deviceLabel: 'MacBook' }, at); assert.equal(app.auth.revokeAll('user-1'), 2); assert.equal(first.state, 'REVOKED');
}

function testUnifiedInbox(): void {
  const app = createFoundation(); app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org')); const conversation = app.inbox.open({ channel: 'TELEGRAM', body: 'Хочу уточнить время записи.', ownerId: 'owner-1' }, command('org-a', 'inbox-open')); const reply = app.inbox.reply(conversation.id, 'Проверим доступные слоты и вернёмся с ответом.', command('org-a', 'inbox-reply')); app.inbox.resolve(conversation.id, command('org-a', 'inbox-resolve')); assert.equal(reply.direction, 'OUTBOUND'); assert.equal(conversation.state, 'RESOLVED');
}

function testSurgeryAndAnesthesiaSafety(): void {
  const app = createFoundation(); app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org')); app.access.grantMembership({ userId: 'vet-1', role: 'VETERINARIAN' }, command('org-a', 'grant-vet').actor, at);
  const owner = app.ownerPets.createOwner({ fullName: 'Ирина С.' }, command('org-a', 'owner')); const pet = app.ownerPets.createPet({ ownerId: owner.id, name: 'Барс', species: 'CAT' }, command('org-a', 'pet')); const vetMeta: CommandMeta = { ...command('org-a', 'surgery'), actor: { userId: 'vet-1', organizationId: 'org-a', source: 'STAFF_APP' } };
  app.competencies.upsertProfile({ userId: 'vet-1', employmentState: 'ACTIVE' }, command('org-a', 'surgery-profile')); app.competencies.grantCredential({ userId: 'vet-1', competency: 'SURGERY', permittedProcedureCodes: ['DENTAL_SANITATION'] }, command('org-a', 'surgery-credential'));
  const surgicalCase = app.surgery.schedule({ ownerId: owner.id, petId: pet.id, procedure: 'Санация ротовой полости', indication: 'Клинические показания после осмотра', surgeonId: 'vet-1', teamIds: ['assistant-1'], room: 'Операционная 1', scheduledAt: '2026-08-26T10:00:00.000Z', requiredCompetency: 'SURGERY', procedureCode: 'DENTAL_SANITATION' }, vetMeta);
  assert.throws(() => app.surgery.beginProcedure(surgicalCase.id, vetMeta), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT');
  app.surgery.recordPreparation(surgicalCase.id, { consentRecorded: true, fastingConfirmed: true, checklist: [{ key: 'identity', label: 'Пациент и сторона подтверждены', required: true, completed: true }, { key: 'equipment', label: 'Оборудование готово', required: true, completed: true }] }, { ...vetMeta, idempotencyKey: 'surgery-prep' }); app.surgery.markReady(surgicalCase.id, { ...vetMeta, idempotencyKey: 'surgery-ready' });
  const anesthesia = app.anesthesia.create({ surgicalCaseId: surgicalCase.id, preAssessment: 'Оценка проведена специалистом.', protocol: 'Протокол определён специалистом.', airway: 'Путь дыхания подготовлен.' }, { ...vetMeta, idempotencyKey: 'anesthesia-create' }); app.surgery.beginProcedure(surgicalCase.id, { ...vetMeta, idempotencyKey: 'surgery-start' }); app.anesthesia.start(anesthesia.id, { ...vetMeta, idempotencyKey: 'anesthesia-start' }); app.anesthesia.addMedication(anesthesia.id, { name: 'Препарат по назначению', dose: 'По протоколу' }, { ...vetMeta, idempotencyKey: 'anesthesia-med' }); app.anesthesia.addVitals(anesthesia.id, { heartRate: 110, spo2: 98 }, { ...vetMeta, idempotencyKey: 'anesthesia-vitals' });
  app.surgery.recordOperativeNote(surgicalCase.id, { note: 'Операционный протокол оформлен.' }, { ...vetMeta, idempotencyKey: 'operative-note' }); app.surgery.enterRecovery(surgicalCase.id, { ...vetMeta, idempotencyKey: 'recovery' }); app.anesthesia.enterRecovery(anesthesia.id, { ...vetMeta, idempotencyKey: 'anesthesia-recovery' }); app.anesthesia.close(anesthesia.id, { ...vetMeta, idempotencyKey: 'anesthesia-close' }); app.surgery.recordRecovery(surgicalCase.id, 'Восстановление документировано.', { ...vetMeta, idempotencyKey: 'recovery-note' }); app.surgery.markDischargeReady(surgicalCase.id, { ...vetMeta, idempotencyKey: 'discharge-ready' }); app.surgery.discharge(surgicalCase.id, { ...vetMeta, idempotencyKey: 'discharge' });
  assert.equal(surgicalCase.state, 'DISCHARGED'); assert.equal(anesthesia.state, 'CLOSED'); assert.equal(anesthesia.vitals.length, 1);
}

function testDentalChartLifecycle(): void {
  const app = createFoundation(); app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org')); app.access.grantMembership({ userId: 'vet-1', role: 'VETERINARIAN' }, command('org-a', 'grant-vet').actor, at);
  const owner = app.ownerPets.createOwner({ fullName: 'Марина В.' }, command('org-a', 'owner')); const pet = app.ownerPets.createPet({ ownerId: owner.id, name: 'Рыжик', species: 'CAT' }, command('org-a', 'pet')); const vetMeta: CommandMeta = { ...command('org-a', 'dental'), actor: { userId: 'vet-1', organizationId: 'org-a', source: 'STAFF_APP' } };
  const chart = app.dental.createChart({ ownerId: owner.id, petId: pet.id }, vetMeta); app.dental.recordFinding(chart.id, { toothCode: '204', condition: 'FRACTURE', note: 'Оценка специалиста.' }, { ...vetMeta, idempotencyKey: 'finding' }); const procedure = app.dental.planProcedure(chart.id, { toothCodes: ['204'], name: 'Процедура по клиническому плану' }, { ...vetMeta, idempotencyKey: 'plan-procedure' }); assert.throws(() => app.dental.finalizeChart(chart.id, { ...vetMeta, idempotencyKey: 'unsafe-finalize' }), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT'); app.dental.performProcedure(chart.id, procedure.id, 'Выполнение документировано.', { ...vetMeta, idempotencyKey: 'perform' }); app.dental.finalizeChart(chart.id, { ...vetMeta, idempotencyKey: 'finalize' }); const amendment = app.dental.amendChart(chart.id, { ...vetMeta, idempotencyKey: 'amend' });
  assert.equal(chart.state, 'AMENDED'); assert.equal(amendment.version, 2); assert.equal(procedure.status, 'PERFORMED');
}

function testEquipmentSafetyLifecycle(): void {
  const app = createFoundation(); app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org')); const location = app.organizations.createLocation({ name: 'Главная клиника', timezone: 'Europe/Moscow' }, command('org-a', 'location')); app.access.grantMembership({ userId: 'vet-1', role: 'VETERINARIAN' }, command('org-a', 'grant-vet').actor, at);
  const item = app.equipment.register({ locationId: location.id, name: 'Инфузионный насос №1', kind: 'INFUSION_PUMP', serialNumber: 'PUMP-001' }, command('org-a', 'equipment')); const vetMeta: CommandMeta = { ...command('org-a', 'unsafe-equipment'), actor: { userId: 'vet-1', organizationId: 'org-a', source: 'STAFF_APP' } }; app.equipment.reportUnsafe(item.id, 'Нужна проверка перед использованием.', vetMeta); assert.equal(app.equipment.availableAt(location.id, 'org-a').length, 0); assert.throws(() => app.equipment.completeMaintenance(item.id, 'Проверка завершена.', command('org-a', 'unsafe-return')), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT'); app.equipment.startMaintenance(item.id, 'Принято в обслуживание.', command('org-a', 'maintenance')); app.equipment.completeMaintenance(item.id, 'Проверка завершена.', command('org-a', 'maintenance-done')); assert.equal(item.state, 'ACTIVE');
}

function testOpaqueSpecimenChainOfCustody(): void {
  const app = createFoundation(); app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org')); app.access.grantMembership({ userId: 'vet-1', role: 'VETERINARIAN' }, command('org-a', 'grant-vet').actor, at); const owner = app.ownerPets.createOwner({ fullName: 'Светлана П.' }, command('org-a', 'owner')); const pet = app.ownerPets.createPet({ ownerId: owner.id, name: 'Соня', species: 'CAT' }, command('org-a', 'pet')); const vetMeta: CommandMeta = { ...command('org-a', 'specimen'), actor: { userId: 'vet-1', organizationId: 'org-a', source: 'STAFF_APP' } };
  const order = app.diagnostics.order({ petId: pet.id, testName: 'Лабораторный тест' }, vetMeta); const specimen = app.specimens.collect({ orderId: order.id, type: 'Кровь', container: 'Пробирка EDTA', location: 'Кабинет 1' }, { ...vetMeta, idempotencyKey: 'collect-specimen' }); const label = app.specimens.label(specimen.id, 'org-a'); assert.ok(label.opaqueToken.startsWith('vs_')); assert.equal(label.opaqueToken.includes(owner.fullName), false); assert.equal(label.patientShortIdentity.includes(pet.name), false); app.specimens.sendExternal(specimen.id, { location: 'Внешняя лаборатория', externalReference: 'LAB-001' }, { ...vetMeta, idempotencyKey: 'send-specimen' }); app.specimens.receive(specimen.id, 'Внешняя лаборатория', { ...vetMeta, idempotencyKey: 'receive-specimen' }); app.specimens.linkResult(specimen.id, 'Результат доступен для клинической оценки.', { ...vetMeta, idempotencyKey: 'link-result' }); assert.equal(specimen.state, 'RESULT_LINKED'); assert.equal(order.state, 'RESULT_READY');
}

function testProcurementToInventoryReceipt(): void {
  const app = createFoundation(); app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org')); const location = app.organizations.createLocation({ name: 'Главная клиника', timezone: 'Europe/Moscow' }, command('org-a', 'location')); const item = app.inventory.createItem({ sku: 'GLOVE-S', name: 'Перчатки S', unit: 'pair' }, command('org-a', 'item')); const supplier = app.procurement.createSupplier({ name: 'Поставщик расходников' }, command('org-a', 'supplier')); const order = app.procurement.createOrder({ supplierId: supplier.id, locationId: location.id, lines: [{ itemId: item.id, quantity: 10, unitPriceMinor: 1500 }] }, command('org-a', 'purchase-order')); app.procurement.approve(order.id, command('org-a', 'approve')); app.procurement.order(order.id, command('org-a', 'order')); app.procurement.receive(order.id, { lines: [{ lineId: order.lines[0].id, quantity: 6, discrepancyNote: 'Частичная поставка.' }] }, command('org-a', 'partial-receipt')); assert.equal(order.state, 'PARTIALLY_RECEIVED'); assert.equal(app.inventory.balance(item.id, location.id, 'org-a'), 6); assert.throws(() => app.procurement.receive(order.id, { lines: [{ lineId: order.lines[0].id, quantity: 5 }] }, command('org-a', 'over-receipt')), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT'); app.procurement.receive(order.id, { lines: [{ lineId: order.lines[0].id, quantity: 4 }] }, command('org-a', 'final-receipt')); assert.equal(order.state, 'RECEIVED'); assert.equal(app.inventory.balance(item.id, location.id, 'org-a'), 10);
}

async function testVersionedPrintQueue(): Promise<void> {
  const app = createFoundation(); app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org')); const template = app.printing.createTemplate({ kind: 'LAB_LABEL', body: 'Token: {{opaque_token}} · {{specimen_ref}}' }, command('org-a', 'print-template')); app.printing.publishTemplate(template.id, command('org-a', 'publish-template')); const job = await app.printing.request({ templateId: template.id, payload: { opaque_token: 'vs_safe', specimen_ref: 'S-100' } }, command('org-a', 'print-job')); assert.equal(template.version, 1); assert.equal(job.state, 'QUEUED'); assert.match(job.failureReason ?? '', /No PrinterProvider/);
}

function testExecutableChecklistSignOff(): void {
  const app = createFoundation(); app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org')); app.access.grantMembership({ userId: 'vet-1', role: 'VETERINARIAN' }, command('org-a', 'grant-vet').actor, at); const template = app.checklists.createTemplate({ purpose: 'surgery-prep', steps: [{ key: 'identity', label: 'Пациент подтверждён', required: true, evidenceRequired: true }, { key: 'room', label: 'Операционная готова', required: true, evidenceRequired: false }] }, command('org-a', 'checklist-template')); app.checklists.publish(template.id, command('org-a', 'checklist-publish')); const meta: CommandMeta = { ...command('org-a', 'checklist-run'), actor: { userId: 'vet-1', organizationId: 'org-a', source: 'STAFF_APP' } }; const run = app.checklists.start({ templateId: template.id, targetType: 'SURGICAL_CASE', targetId: 'case-1' }, meta); assert.throws(() => app.checklists.signOff(run.id, meta), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT'); app.checklists.completeStep(run.id, 'identity', 'Браслет и карта сверены.', { ...meta, idempotencyKey: 'step-1' }); app.checklists.completeStep(run.id, 'room', undefined, { ...meta, idempotencyKey: 'step-2' }); app.checklists.signOff(run.id, { ...meta, idempotencyKey: 'sign-off' }); assert.equal(run.state, 'SIGNED_OFF');
}

function testStaffCompetencyEligibility(): void {
  const app = createFoundation(); app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org')); const location = app.organizations.createLocation({ name: 'Главная клиника', timezone: 'Europe/Moscow' }, command('org-a', 'location')); app.competencies.upsertProfile({ userId: 'vet-1', employmentState: 'ACTIVE', locationIds: [location.id] }, command('org-a', 'profile')); app.competencies.grantCredential({ userId: 'vet-1', competency: 'SURGERY', expiresAt: '2026-12-01T00:00:00.000Z', permittedProcedureCodes: ['DENTAL_SANITATION'] }, command('org-a', 'credential')); app.competencies.assertEligible({ userId: 'vet-1', competency: 'SURGERY', procedureCode: 'DENTAL_SANITATION', locationId: location.id, at: new Date('2026-08-10') }, 'org-a'); assert.throws(() => app.competencies.assertEligible({ userId: 'vet-1', competency: 'SURGERY', procedureCode: 'OTHER', locationId: location.id, at: new Date('2026-08-10') }, 'org-a'), (error: unknown) => error instanceof DomainError && error.code === 'FORBIDDEN');
}

function testClientPrecheckOwnershipBoundary(): void {
  const app = createFoundation(); app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org')); app.booking.appointments.set('appointment-1', { id: 'appointment-1', organizationId: 'org-a', locationId: 'location-1', ownerId: 'owner-1', petId: 'pet-1', variantId: 'variant-1', staffId: 'staff-1', startsAt: '2026-08-30T10:00:00.000Z', endsAt: '2026-08-30T10:30:00.000Z', state: 'CONFIRMED', createdAt: '2026-08-10T08:00:00.000Z' }); const check = app.prechecks.open('appointment-1', command('org-a', 'open-precheck')); const otherClient: CommandMeta = { ...command('org-a', 'bad-submit'), actor: { userId: 'owner-2', organizationId: 'org-a', source: 'CLIENT_WEB' } }; assert.throws(() => app.prechecks.submit(check.id, { arrivalConfirmed: true }, otherClient), (error: unknown) => error instanceof DomainError && error.code === 'FORBIDDEN'); const ownClient: CommandMeta = { ...command('org-a', 'own-submit'), actor: { userId: 'owner-1', organizationId: 'org-a', source: 'CLIENT_WEB' } }; app.prechecks.submit(check.id, { arrivalConfirmed: true, ownerNote: 'Будем вовремя.' }, ownClient); app.prechecks.review(check.id, command('org-a', 'review-precheck')); assert.equal(check.state, 'REVIEWED');
}

async function main(): Promise<void> {
  testHappyPath(); testIdempotency(); testTenantIsolation(); testRoleAuthorization(); testTelegramSecretBoundary(); testResourceAwareBookingStateMachine(); testInvoiceAndPaymentSafety(); testCompleteGroomingRevenueLoop(); testTriageAndPaidConsultationLoop(); testClinicalRecordVersionsFilesAndConsent(); testCarePlanPreferencesAndPetTimeline(); testOperationalTasksIncidentsAndInventory(); testHospitalReferralAndSupportFlows(); testGrowthAndPrivacySafeAnalytics(); testKnowledgeAndExperimentSafety(); testPassportAndPrivacyAgency(); testHumanControlledAiDrafts(); testWaitlistOfferAndReschedule(); testPreventiveAndDiagnosticsLifecycle(); testOwnerReportingWithoutPii(); testOtpAndSessionSafety(); testUnifiedInbox(); testSurgeryAndAnesthesiaSafety(); testDentalChartLifecycle(); testEquipmentSafetyLifecycle(); testOpaqueSpecimenChainOfCustody(); testProcurementToInventoryReceipt(); testExecutableChecklistSignOff(); testStaffCompetencyEligibility(); testClientPrecheckOwnershipBoundary(); await testVersionedPrintQueue(); console.log('VetSvet foundation: 31/31 critical checks passed');
}
void main();

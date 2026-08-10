# Модель данных: фундамент

## Инварианты

- Любые бизнес-данные принадлежат `Organization`; операционные данные при необходимости имеют `Location`.
- `UserIdentity` отделён от `OwnerProfile` и `StaffMembership`.
- `Pet` — первичная предметная сущность. Его timeline — read-model над событиями доменов, а не общая таблица заметок.
- Деньги хранятся как `amount_minor + currency`; цены и медицинские документы не переписываются без следа.
- Все критичные команды имеют `idempotency_key`, `actor`, `correlation_id` и audit event.

## Ядро первой миграционной волны

```text
Organization 1─* Location
UserIdentity  1─* Session
UserIdentity  1─* StaffMembership *─1 Organization
UserIdentity  0..1 OwnerProfile   *─1 Organization
Household     1─* OwnerPetRelation *─1 Pet
Pet           1─* PetAlert / PetWeight / PetFile / PetTimelineEvent
Service       1─* ServiceVariant
Resource      *─* ServiceRequirement
Appointment   ── Owner / Pet / ServiceVariant / Location / Staff
Invoice       1─* InvoiceLine
PaymentAttempt *─1 Invoice
AuditEvent / OutboxEvent ── actor, organization, aggregate
```

## Состояния, а не набор случайных флагов

- `Appointment`: draft → requested → confirmed → checked_in → in_service → ready → completed; с явными cancel/no_show/reschedule переходами.
- `Invoice`, `Payment`, `Consultation`, `Document`, `Hospitalization`, `LabOrder`, `Prescription` получают собственные state machine на сервере.
- Для urgent intake используется отдельный `TriageCase`, который допускает минимальные данные до полноценной регистрации.

## Дальнейшее расширение без перелома модели

Потребуются first-class сущности для grooming recipe/report, clinical case/encounter, medication administration, stock movement, referral, incident, care plan, passport share token, surgery и anesthesia. Их нельзя прятать в один JSON-поле или в чат.
# Advanced clinical records

`SurgicalCase` and `AnesthesiaRecord` are separate aggregates. A surgical case owns consent and preparation evidence, room/team context, operative and recovery documentation; anesthesia owns its own assessment, protocol, medication timeline, events and vital-sign series. Both are tenant-scoped and linked to the same patient only through explicit identifiers. The operational workflow forbids procedure start without required preparation, and anesthesia monitoring cannot start until the matching surgical case is in procedure.

`DentalChart` is versioned separately from a general encounter. It has structured tooth findings and procedures, can only be finalized after planned procedures are resolved, and uses an amendment instead of overwriting finalized clinical documentation.

`Equipment` is a location-scoped physical resource. An unsafe item is removed from availability immediately, must pass through `MAINTENANCE`, and only then returns to `ACTIVE`; its serial number is unique within the organization.

`PhysicalIdentity` stores opaque, revocable scan tokens only. `LabOrder` and `Specimen` keep the sample chain of custody — collection, transport, receipt, rejection or result linkage — separately from the final clinical result.

`Supplier` and `PurchaseOrder` form the procurement boundary. A purchase-order line records quantity ordered versus accepted quantity; only receipt writes inventory stock.

`PrintTemplate` is versioned by document kind. `PrintJob` keeps payload, status and any external job id, while the default deployment adapter keeps jobs queued until a real printer provider is explicitly configured.

`StaffProfile` and `Credential` separate role from demonstrated current competency. A procedure can require a non-expired credential and location assignment, not merely a broad staff role.

`Precheck` is operational intake attached to an appointment. It records owner confirmation and staff review separately from an encounter and clinical notes.

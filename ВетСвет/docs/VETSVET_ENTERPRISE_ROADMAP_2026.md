# VetSvet Enterprise Roadmap 2026

Статус документа: рабочая карта реализации по
`VetSvet_Master_Vision_for_Codex_v2_FullScale.md`.

## 1. Что уже является фундаментом

VetSvet уже не макет: приложение имеет production-сервис, PostgreSQL/Prisma,
парольную и Telegram-аутентификацию, роли, владельцев и питомцев, запись,
консультации, счета и оплаты, клинические сущности, груминг, стационар, склад,
CRM, growth, аудит и outbox. Staff App получил 15 ролевых маршрутов и мобильную
навигацию.

Это сильный фундамент, но наличие пункта в меню, модели или одной операции API
не означает завершённость домена. Следующая стадия — не расширять витрину
пустыми карточками, а закрывать каждый бизнес-цикл от намерения пользователя до
подтверждённого результата.

## 2. Единое определение готовности

Каждый модуль получает статус `DONE` только если одновременно выполнены все
уровни:

1. **Домен:** инварианты, статусы, переходы и запрещённые переходы описаны.
2. **Данные:** миграция, индексы, tenant/location scope и история изменений.
3. **Безопасность:** RBAC/ABAC, отрицательные проверки ролей и изоляции клиник.
4. **API:** валидация, идемпотентность, пагинация, ошибки и versioned contract.
5. **UI:** список, поиск, фильтры, карточка, создание, редактирование и действия.
6. **UX-состояния:** loading, empty, error, offline, conflict и success.
7. **Мобильный цикл:** весь основной сценарий завершается на ширине 360 px.
8. **Интеграции:** уведомления, документы, платежи и Telegram связаны событиями.
9. **Наблюдаемость:** audit event, outbox, журнал ошибок и операционные метрики.
10. **Качество:** unit, integration, E2E, security и регрессия соседних контуров.

Нельзя считать модуль готовым, если интерфейс показывает данные, но действие не
доходит до базы; если API существует без доступного UI; если роль видит чужие
данные; если после перезапуска теряется состояние; если мобильный пользователь
не может завершить тот же цикл.

## 3. Карта текущей зрелости

| Контур | Текущий фундамент | До enterprise-готовности |
|---|---|---|
| Identity & access | Пароль, сессии, Telegram-link, приглашения, роли | Восстановление доступа, MFA-политики, управление сессиями, матрица полномочий, device history |
| Owners & pets | Owner/Pet/relations, client dashboard, создание питомца | Полные карточки, дубль-контроль, caregiver access, timeline, файлы, merge и consent history |
| Booking | Каталог, создание/rebook, staff status update | Ресурсы, длительность, конфликт-движок, waitlist, capacity, перенос/отмена, no-show и календарные виды |
| Grooming | Profile/recipe/visit и status API | Workspace визита, media before/after, checklist, report card, рекомендации, rebooking и revenue loop |
| Consultations | Заявка, payment link, staff statuses, Telegram flow | Triage, SLA, назначение специалиста, защищённый диалог, вложения, заключение, refund/escalation |
| Clinical core | Case/Encounter/Prescription/Consent/CarePlan | Полный SOAP, vitals, diagnosis/problem list, версии записей, подпись, discharge и longitudinal timeline |
| Diagnostics | LabOrder/Specimen | Каталог тестов, chain of custody, результаты, референсы, imaging, critical flags и owner delivery |
| Preventive care | Частично через care plan | Vaccination records, reminders, contraindications, parasite plans и preventive calendar |
| Hospital | Admission, bed, tasks, observations, handoff | Live board, MAR/treatment sheet, инфузии, oxygen, escalation rules, discharge и occupancy analytics |
| Surgery/dental/equipment | Модели присутствуют | Полные workflows, checklists, anesthesia timeline, sterilization, maintenance и safety locks |
| Inventory/pharmacy | Item/Lot/Movement, consume API | FEFO, reservations, counts, returns, write-offs, purchasing, receiving, suppliers и controlled-drug mode |
| Finance | Invoice/line/payment/receipt и dashboard | Estimates, deposits, refunds, cash shift, reconciliation, acquiring/fiscal adapters и immutable ledger |
| Documents | Templates/generated/print + consent base | Конструктор шаблонов, версии, подписи, пакеты документов, печать, delivery и legal retention |
| Inbox/tasks | CommunicationLog/OperationalTask | Настоящий omnichannel inbox, threads, assignment, SLA, templates, mentions и notification center |
| CRM/growth | CRM dashboard, tasks, packages, memberships, loyalty | Segments, campaigns, consent, journeys, referrals, reviews, cohort retention и attribution |
| Analytics | Несколько dashboard endpoints | Единые definitions, drill-down, периоды, locations, exports, scheduled reports и data quality |
| Client App | Dashboard, питомцы, booking, consult, docs/profile | Полная карта Master Vision, timeline, payments, messages, care plans, push/offline и accessibility |
| Telegram | Webhook, booking, consult/payment proof, login/link | Паритет ключевых циклов, Mini App, resumable states, admin routing, retries и support tooling |
| Platform | Prisma, audit/outbox, healthz, production service | Миграции вместо db push, jobs, backup restore drill, rate limits, tracing, SLO и incident playbooks |

## 4. Порядок реализации: вертикальные релизы

### Release 0 — Platform safety gate

Цель: сделать последующие модули безопасными для роста.

- Ввести миграции Prisma с журналом, rollback/recovery инструкцией и seed policy.
- Закрыть tenant/location scope во всех запросах; добавить deny-by-default RBAC.
- Формализовать state machine helper, idempotency keys и optimistic locking.
- Добавить rate limiting, security headers, upload policy и audit viewer.
- Настроить structured logs, error IDs, metrics, outbox worker health и алерты.
- Автоматизировать backup, проверку восстановления и release health checks.
- Создать общий UI kit: таблица, фильтры, drawer, form, timeline, status, skeleton,
  error boundary, confirm/undo, mobile action sheet.

Приёмка: миграция прогоняется на копии production; роли и tenant boundaries
имеют отрицательные integration tests; backup реально восстанавливается.

### Release 1 — Owner, Pet, Timeline

Цель: единая достоверная карточка владельца и питомца.

- Владельцы: поиск, контакты, consent, caregivers, долги, коммуникации, merge.
- Питомцы: профиль, особенности, аллергии, документы, фото, статусы и alerts.
- Timeline: записи, груминг, медицина, анализы, оплаты, сообщения и документы.
- Быстрое создание из reception; защита от дублей телефона/pet identity.
- Client App: редактирование профиля, совместный доступ, файлы и privacy controls.

Приёмка: сотрудник и владелец видят одну согласованную историю в пределах прав;
merge не теряет финансовые или медицинские ссылки.

### Release 2 — Schedule, Booking, Flowboard

Цель: запись становится реальным планировщиком мощности клиники.

- Calendar day/week/resource, кабинеты, специалисты, оборудование и breaks.
- Service rules: длительность, подготовка, варианты, цены, deposits, eligibility.
- Conflict engine, hold slot, waitlist, suggested alternatives и capacity heatmap.
- Полные cancel/reschedule/no-show/arrived/in-service/completed state machines.
- Telegram/Client App booking parity и автоматические подтверждения/напоминания.
- Flowboard приёма с быстрыми действиями и контекстом пациента.

Приёмка: два клиента не занимают один ресурс; повторный запрос идемпотентен;
перенос обновляет уведомления, оплату и очередь ожидания.

### Release 3 — Grooming Revenue Loop

Цель: закрыть первый North Star slice полностью.

- Grooming profile и versioned recipe с предпочтениями/ограничениями.
- Visit workspace: intake, checklist, фото до/после, материалы и таймер этапов.
- Report card владельцу, рекомендации домашнего ухода и next-best-date.
- Checkout: услуги/добавки/материалы, tips policy, invoice/payment/receipt.
- Rebook, package usage, loyalty и показатели возвращаемости мастера.

Приёмка: визит проходит путь booking → work → report → payment → rebook; отчёт
виден клиенту и в Telegram; списания склада и выручка совпадают.

### Release 4 — Paid Consultation & Unified Inbox

Цель: ни одно обращение не остаётся в тишине.

- Intake classification: administrative/professional/urgent с safety copy.
- Queue с SLA, приоритетом, назначением, reassign и escalation.
- Paywall/deposit, proof review, автоматические и ручные оплаты/refund.
- Защищённый thread, attachments, internal notes, templates и audit trail.
- Professional conclusion, owner delivery, follow-up task и conversion to visit.
- Telegram и Client App продолжают один и тот же conversation state.

Приёмка: вопрос проходит intake → triage → payment → specialist → answer →
delivery → follow-up; urgent flow никогда не маскируется платным чатом.

### Release 5 — Veterinary Encounter

Цель: клиническая запись становится юридически и медицински целостной.

- Case/problem list, complaint, history, structured vitals и alerts.
- SOAP workspace, diagnoses, procedures, prescriptions и charge capture.
- Draft/locked/amended lifecycle, author/signature, reason for amendment.
- Clinical templates без затирания авторского текста.
- Consent, estimate, discharge summary и care plan.
- Клиническая timeline и ограничение доступа по роли.

Приёмка: encounter проходит arrival → exam → orders → treatment → invoice →
discharge; подписанная версия неизменяема, исправление создаёт новую ревизию.

### Release 6 — Diagnostics, Preventive, Prescriptions

Цель: завершить медицинский цикл после осмотра.

- Lab catalog/order/specimen/chain of custody/result/critical acknowledgment.
- Imaging order, study metadata, report, attachments и external adapter boundary.
- Vaccinations, contraindications, parasite prevention и reminder schedules.
- Medication catalog, dosing safeguards, refill policy и interaction warnings.
- Результаты и понятные пояснения владельцу после clinician approval.

Приёмка: образец прослеживается; critical result подтверждается ответственным;
напоминание создаётся только из подтверждённой записи.

### Release 7 — Hospital, Surgery, Dental, Equipment

Цель: безопасная непрерывная работа смены.

- Live census/bed board, admission/discharge/transfer и isolation flags.
- Treatment sheet/MAR, observations, infusions, oxygen и overdue escalation.
- Shift handoff с обязательными рисками и acknowledgement.
- Surgery checklist, anesthesia events/monitoring/recovery и implant log.
- Dental charting и treatment plan.
- Equipment availability, maintenance, calibration и safety lock.

Приёмка: просроченная критичная процедура поднимает эскалацию; передача смены
не закрывается без подтверждения; занятое/неисправное оборудование недоступно.

### Release 8 — Inventory, Pharmacy, Purchasing

Цель: физический остаток и финансовое списание дают одну картину.

- Catalog/SKU/units/barcodes, lots, expiry, FEFO и location bins.
- Reservations from appointment/encounter, consume/return/waste/transfer/count.
- Min/max, supplier, purchase order, receiving и discrepancy handling.
- Pharmacy mode, prescription linkage и controlled-action audit.
- Mobile scan flow и offline-safe count session.

Приёмка: отрицательные остатки запрещены; повторное списание идемпотентно;
каждое движение имеет основание, автора, партию и стоимость.

### Release 9 — Finance, Cash, Fiscalization, Documents

Цель: деньги и обязательства прослеживаются до события.

- Estimate → approval → invoice → payment/deposit/refund → fiscal receipt.
- Cash shift, acquiring reconciliation, split payments и discrepancy queue.
- Immutable financial ledger и role separation для возвратов/коррекций.
- Document templates, versions, consent signatures, print/delivery history.
- Adapter contracts для платёжного и фискального провайдера.

Приёмка: сумма строк равна счёту и проводкам; refund требует основание/роль;
повторный callback провайдера не создаёт двойную оплату.

### Release 10 — CRM, Loyalty, Growth, Content

Цель: рост строится на подтверждённой пользе и согласиях.

- Dynamic segments, lifecycle journeys, consent and frequency caps.
- Packages/memberships/loyalty/referrals/reviews с финансовой сверкой.
- Rebooking, lapsed-client recovery и preventive campaigns.
- Content calendar, approval workflow и adapter boundary публикаций.
- Attribution and holdout groups без dark patterns.

Приёмка: коммуникация учитывает consent; начисления опираются на закрытые
операции; клиент видит понятные правила и баланс.

### Release 11 — Analytics & Owner Console

Цель: единая версия правды для руководителя.

- Metric dictionary: revenue, utilization, no-show, retention, clinical,
  hospital, staff, inventory and product funnel.
- Drill-down до исходной операции, periods, location/service/staff filters.
- Scheduled reports, exports, anomaly/data-quality indicators.
- Organization, locations, roles, services, pricing, templates and policies.

Приёмка: каждая цифра воспроизводится из source records; права применяются и к
агрегатам, и к drill-down.

### Release 12 — Client trust, Telegram Mini App, AI

Цель: единый спокойный опыт на всех каналах.

- Полный mobile/PWA цикл: pets, booking, consult, messages, payments,
  documents, care plans, notifications, offline/retry and accessibility.
- Telegram bot/Mini App parity, resumable conversations и support recovery.
- AI только после стабильных данных: intake, drafts, scribe, summary, handoff,
  search и charge capture suggestions.
- Human approval, provenance, confidence, redaction, prompt/response audit и
  запрет автономных медицинских решений.

Приёмка: смена канала не теряет контекст; AI-результат всегда маркирован,
проверяем и не изменяет медицинскую/финансовую запись без человека.

## 5. Как выполнять каждый релиз

Для каждого релиза применяется одинаковая последовательность:

1. Зафиксировать user journeys, state machines, RBAC и data contract.
2. Написать миграции и integration tests до подключения UI.
3. Реализовать API и события/outbox.
4. Собрать desktop и mobile интерфейс в существующем живом дизайне VetSvet.
5. Соединить Telegram/Client/Staff только через общий backend contract.
6. Прогнать happy path, ошибки, повторные запросы, restart persistence и роли.
7. Развернуть через backup → migration → restart → health → smoke → rollback gate.
8. Обновить матрицу зрелости только по фактическим доказательствам.

## 6. Ближайший рабочий пакет

Следующей разработкой должен стать **Release 1 + начало Release 2**, потому что
владельцы, питомцы и расписание являются общими зависимостями почти всех
последующих контуров.

Конкретный пакет:

- `/staff/#patients/owners`: таблица, поиск, фильтры, создание и owner drawer.
- `/staff/#patients/patients`: карточка питомца, alerts, caregivers и files.
- `/staff/#patients/timeline`: единая хронология с фильтрами источника.
- `/staff/#schedule/calendar`: day/week и resource columns.
- `/staff/#schedule/queue`: booking requests, approve/propose/cancel.
- API владельца/питомца/timeline и conflict-safe slot reservation.
- RBAC и tenant tests; mobile flows 360/390 px; production migration и smoke.

Только после его полного закрытия следующий пакет получает статус
`in progress`. Так VetSvet растёт не количеством пунктов меню, а количеством
законченных, проверяемых бизнес-циклов.

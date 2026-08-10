# VetSvet Master Vision — техническое задание и директива для Codex

Версия: 2.0 — Full Scale + Behavioral UX  
Назначение: главный документ для разработки платформы «ВетСвет».  
Статус: не MVP-описание, а конечная архитектура продукта. Этапы ниже задают порядок зависимостей, а не ограничивают объём. Версия 2.0 расширяет архитектуру психологией взаимодействия, UX-research, triage, хирургией, quality & safety, referral/mobile-care, offline continuity и дополнительными full-scale контурами.

---

# 0. ГЛАВНАЯ ДИРЕКТИВА CODEX

Ты разрабатываешь не сайт одного специалиста и не простого Telegram-бота.

Ты разрабатываешь **VetSvet — единую цифровую операционную систему ветеринарной клиники, груминга, клиентского сервиса и долгосрочной истории питомца**.

Ключевая идея продукта:

> Один владелец → один аккаунт → несколько питомцев → для каждого питомца единая непрерывная история здоровья, ухода, записей, консультаций, документов, платежей и коммуникаций.

Продукт должен поддерживать одновременно:
- груминг;
- ветеринарные услуги;
- платные дистанционные консультации;
- запись и управление расписанием;
- карточки клиентов и питомцев;
- полноценную медицинскую историю;
- диагностику;
- стационар;
- оборудование и ресурсы;
- склад и лекарственные препараты;
- счета, предоплаты, оплаты, возвраты и фискализацию;
- Telegram;
- единый центр сообщений;
- документы и согласия;
- автоматизации;
- CRM и маркетинг;
- программы лояльности, пакеты и подписки;
- аналитику;
- AI-ассистента сотрудника;
- много сотрудников;
- много кабинетов/ресурсов;
- несколько локаций в будущем;
- API и интеграции.

## Не урезать конечную модель ради быстрого MVP

Первый релиз может содержать только часть функций, но:
- схема данных;
- границы доменов;
- идентификаторы;
- права;
- события;
- API;
- аудит;
- модели платежей;
- модели документов;
- организация/локация;
- владелец/питомец

должны быть совместимы с конечным продуктом.

Не создавать одноразовую архитектуру, которую придётся выбрасывать при появлении второго врача, стационара, склада, филиала или приложения.

## Автономность Codex

Если репозиторий уже существует:
1. Сначала исследовать весь репозиторий.
2. Найти текущий стек, структуру, БД, авторизацию, деплой, UI, интеграции и существующие бизнес-сущности.
3. Сохранить работающие решения, если они не конфликтуют с архитектурой VetSvet.
4. Не переписывать стабильную систему без обоснованной причины.
5. Перед крупным изменением фиксировать Architecture Decision Record (ADR).

Если репозиторий пустой:
1. Создать production-ready основу.
2. Выбрать зрелый современный стек.
3. Не привязываться к экспериментальной технологии без причины.
4. Документировать архитектурные решения.

Если какая-либо внешняя интеграция требует ключей, договора, лицензии или юридического решения:
- не имитировать успешную интеграцию;
- создать чистый provider/adapter interface;
- сделать sandbox/mock только для development/test;
- production-функцию держать выключенной feature flag до подключения реального провайдера.

Если информации не хватает:
- выбирать безопасный и расширяемый инженерный default;
- записывать допущение в `/docs/DECISIONS_PENDING.md`;
- не останавливать разработку остальных независимых частей.

---

# 1. ПРОДУКТОВАЯ МОДЕЛЬ

VetSvet состоит из пяти основных поверхностей.

## 1.1 Public Web

Публичный сайт и точка привлечения новых клиентов.

Задачи:
- объяснить бренд и компетенции;
- показать ветеринарные и груминг-направления;
- показать услуги;
- предоставить понятный путь к записи;
- предоставить путь к платной консультации;
- дать вход в аккаунт;
- показывать полезный контент;
- обеспечивать SEO;
- приводить трафик из рекламы, карт, соцсетей и Telegram.

## 1.2 Client App

Личное пространство владельца питомца.

Доступ:
- web/PWA;
- Telegram Mini App;
- в будущем native iOS/Android на том же API.

## 1.3 Staff App

Основное рабочее приложение клиники.

Не «админка с таблицами», а операционная система рабочего дня:
- сегодня;
- очередь;
- расписание;
- пациенты;
- груминг;
- консультации;
- медицинские случаи;
- стационар;
- сообщения;
- задачи;
- склад;
- касса;
- аналитика.

## 1.4 Telegram Bot + Mini App

Bot:
- уведомления;
- входящие сообщения;
- быстрые действия;
- deep links;
- статусы;
- напоминания;
- готовность питомца;
- новые документы;
- ответы по организационным вопросам.

Mini App:
- полноценный Client App внутри Telegram;
- серверная проверка Telegram auth/init data;
- никаких доверенных клиентских данных без серверной валидации.

## 1.5 Admin / Owner Console

Управление:
- организацией;
- филиалами;
- пользователями;
- ролями;
- услугами;
- ценами;
- расписанием;
- политиками;
- документами;
- интеграциями;
- автоматизациями;
- AI;
- аналитикой;
- безопасностью.

---

# 2. ГЛАВНАЯ КОНКУРЕНТНАЯ ЦЕЛЬ

Нельзя честно гарантировать «лучше всех конкурентов» до реального использования и метрик.

Поэтому инженерная цель формулируется измеримо:

VetSvet должен объединить в одном продукте:

1. Клиническую глубину полноценной veterinary practice management system.
2. Простоту клиентской записи и CRM сервисного бизнеса.
3. Груминг-специфические pet profiles, grooming history, report cards, deposits, rebooking.
4. Современный pet-parent portal.
5. Платные консультации с оплатой до профессионального ответа.
6. AI-assisted workflow без замены врача.
7. Единый timeline питомца между грумингом и ветеринарией.
8. Resource-aware scheduling: специалист + помещение + оборудование + стационарное место.
9. Omnichannel communication.
10. Современный mobile-first интерфейс.

Главный дифференциатор:

> VetSvet не разделяет клиента на «груминг CRM», «ветеринарную CRM», «Telegram», «оплаты» и «медкарту». Центральной сущностью является питомец, вокруг которого живёт вся история отношений.

---

# 3. РОЛИ И ПРАВА

RBAC должен быть системным с первого дня.

Базовые роли:

### Client / Pet Owner
- свои данные;
- свои питомцы;
- записи;
- консультации;
- сообщения;
- документы;
- платежи;
- reports;
- история;
- согласия.

### Shared Caregiver
Совместный доступ к конкретному питомцу с ограничиваемыми правами.

### Groomer
- расписание;
- grooming visits;
- pet grooming profile;
- фото;
- grooming notes;
- report card;
- сообщения в рамках разрешений;
- checkout.

### Veterinarian
- медицинская история;
- encounter;
- SOAP/clinical notes;
- диагностика;
- назначения;
- вакцинация;
- стационар;
- консультации;
- документы;
- счета по разрешённым действиям.

### Veterinary Assistant / Nurse
- витальные показатели;
- задачи;
- процедуры;
- medication administration;
- стационар;
- оборудование;
- ограничения на диагнозы/назначения настраиваются правами.

### Reception / Administrator
- клиенты;
- запись;
- оплаты;
- звонки/сообщения;
- документы;
- check-in/check-out;
- без доступа к закрытым клиническим полям, если он не нужен.

### Inventory / Pharmacy
- закупки;
- партии;
- остатки;
- маркировка;
- списания;
- инвентаризация;
- поставщики.

### Manager
- операционные отчёты;
- сотрудники;
- цены;
- расписания;
- услуги;
- CRM;
- финансы согласно правам.

### Organization Owner
Полный бизнес-контроль.

### System Administrator
Технические настройки без автоматического права читать медицинские данные, если оно не выдано отдельно.

RBAC должен поддерживать:
- organization scope;
- location scope;
- role permissions;
- explicit permissions;
- temporary access;
- audit;
- принцип минимально необходимого доступа.

---

# 4. ОСНОВНЫЕ ДОМЕНЫ

## 4.1 Identity & Authentication

Поддержать:
- phone OTP;
- email;
- Telegram login;
- staff password/passkey-compatible architecture;
- MFA для сотрудников;
- session management;
- device/session revocation;
- account recovery;
- verified contacts.

Не связывать Client и Staff одной примитивной role-строкой. Использовать user identity + profiles/memberships/permissions.

---

# 5. OWNER / PET CRM

## 5.1 Owner Profile

Поля:
- ФИО;
- телефоны;
- email;
- Telegram identity;
- предпочитаемый канал;
- адрес;
- emergency contact;
- communication preferences;
- marketing consent;
- account status;
- tags;
- source/UTM;
- notes;
- relationships with pets;
- invoices;
- payments;
- debts/credit where permitted;
- lifetime activity.

## 5.2 Pet Profile

Центральная сущность системы.

Поля:
- имя;
- фотография;
- species;
- breed;
- sex;
- neuter/spay status;
- birth date / estimated age;
- color;
- microchip;
- tattoo/passport IDs;
- weight timeline;
- allergies;
- medical alerts;
- chronic conditions;
- behavioral alerts;
- feeding notes;
- medication notes;
- grooming characteristics;
- vaccination status;
- primary veterinarian;
- lifecycle status: active/deceased/inactive;
- owners/caregivers.

## 5.3 Pet Timeline

Один общий chronological feed:
- booking;
- grooming;
- consultation;
- veterinary encounter;
- vaccination;
- lab result;
- imaging;
- procedure;
- hospitalization;
- medication;
- invoice/payment;
- uploaded document;
- report card;
- owner update.

Фильтры:
- health;
- grooming;
- finance;
- communication;
- documents.

Timeline — read model, а не свалка данных. Исходные записи хранятся в своих доменах.

---

# 6. SERVICE CATALOG

Система услуг должна быть конфигурируемой.

Service:
- category;
- veterinary/grooming/retail/consultation;
- public name;
- internal name;
- description;
- duration;
- buffers;
- allowed staff roles;
- required resources;
- location availability;
- pricing policy;
- booking policy;
- deposit policy;
- cancellation policy;
- required intake form;
- required consent;
- availability online/offline;
- emergency eligibility;
- related add-ons.

ServiceVariant:
- species;
- breed;
- weight range;
- coat type;
- complexity;
- staff;
- location;
- duration;
- price rules.

Не хардкодить породы/вес/цены в UI.

---

# 7. SMART BOOKING ENGINE

Запись должна учитывать не только свободное время врача.

Availability = пересечение:
- рабочее время сотрудника;
- услуга;
- длительность;
- buffer before/after;
- локация;
- кабинет/место;
- оборудование;
- capacity;
- pet restrictions;
- предварительные условия;
- already booked resources;
- blackout/maintenance;
- индивидуальные booking rules.

Функции:
- real-time availability;
- request vs instant confirmation;
- waitlist;
- recurring bookings;
- reschedule;
- cancel;
- staff preference;
- no-preference booking;
- booking notes;
- deposits;
- full prepayment;
- reminder sequence;
- confirmation request;
- no-show state;
- late arrival state;
- check-in;
- in-service;
- ready;
- completed.

События:
- appointment.created
- appointment.confirmed
- appointment.rescheduled
- appointment.cancelled
- appointment.checked_in
- appointment.started
- appointment.ready
- appointment.completed
- appointment.no_show

---

# 8. GROOMING DOMAIN

Груминг — не просто тип Appointment.

## 8.1 Grooming Profile

Для каждого питомца:
- coat type;
- coat condition;
- sensitive areas;
- behavior;
- handling notes;
- bite/escape risk flags;
- preferred style;
- preferred length;
- tools/preferences;
- product sensitivities;
- shampoo/cosmetic history;
- drying preferences;
- nail notes;
- ear notes;
- previous complications;
- owner expectations.

## 8.2 Grooming Recipe

Повторяемая конфигурация прошлой успешной процедуры.

Позволяет:
- «повторить прошлый уход»;
- копировать настройки;
- быстро корректировать только различия.

## 8.3 Before / After

- controlled photo capture;
- side-by-side comparison;
- consent-aware gallery use;
- timeline;
- attachments to report.

AI не должен ставить диагноз по фото.
Допустимо:
- сортировать;
- подписывать;
- сравнивать визуально;
- помогать составить черновик описания;
- окончательную оценку делает специалист.

## 8.4 Grooming Visit Workspace

Во время визита:
- check-in;
- состояние шерсти/кожи;
- pre-existing issues;
- услуги;
- add-ons;
- заметки;
- время;
- фото;
- фактически использованные товары;
- price adjustments;
- incidents;
- ready-for-pickup;
- checkout.

## 8.5 Grooming Report Card

Клиент получает:
- фото;
- что сделано;
- состояние шерсти;
- рекомендации по уходу;
- комментарий;
- рекомендованный следующий интервал;
- кнопка Rebook;
- кнопка Repeat Last Service.

## 8.6 Grooming Revenue Engine

Поддержать:
- deposits;
- prepayment;
- add-ons;
- packages;
- memberships;
- bundles;
- repeat booking;
- targeted offers;
- loyalty;
- referral codes;
- tips — только если это соответствует выбранному платежному сценарию.

---

# 9. PAID CONSULTATION DOMAIN

Цель: профессиональное время специалиста перестаёт растворяться в бесплатной переписке.

## 9.1 Message Classification

Входящие запросы классифицируются:
- administrative;
- booking;
- grooming question;
- medical/professional question;
- urgent/emergency;
- billing;
- other.

AI может классифицировать, но решение должно быть объяснимым и переопределяемым сотрудником.

## 9.2 Free Administrative Layer

Бесплатно система отвечает на:
- часы работы;
- цены;
- статус записи;
- адрес;
- подготовку к визиту;
- свободные слоты;
- стандартные правила.

Ответы берутся из утверждённой knowledge base.

## 9.3 Professional Consultation Gate

Путь:
1. Пользователь описывает вопрос.
2. Выбирает питомца.
3. Заполняет structured intake.
4. Прикладывает фото/video/files.
5. Система проверяет emergency red flags.
6. Пользователь выбирает доступный формат.
7. Видит условия и цену.
8. Принимает нужные согласия.
9. Оплачивает.
10. Создаётся Consultation.
11. Специалист получает queue item.
12. Общение.
13. Заключение/summary.
14. Документ попадает в Pet Timeline.
15. Follow-up policy применяется автоматически.

## 9.4 Emergency Safety

Система не должна обещать ответ в чате при экстренном состоянии.

Должен существовать clinician-authored emergency ruleset:
- красные флаги;
- понятное сообщение;
- рекомендация немедленно обратиться за очной экстренной помощью;
- быстрый контакт/маршрут согласно настройкам организации.

AI не должен генерировать самостоятельное лечение в emergency flow.

## 9.5 Remote Care Policy

Все возможности удалённой ветеринарной помощи управляются policy config:
- allowed consultation types;
- what may be done remotely;
- required consent;
- required prior in-person relationship, если это потребуется правовой политикой;
- prescription eligibility;
- follow-up;
- record requirements.

Не хардкодить юридически спорные предположения.

---

# 10. VETERINARY CLINICAL CORE

## 10.1 Medical Case

Case объединяет проблему/эпизод лечения.

Содержит:
- problem;
- status;
- responsible clinician;
- encounters;
- diagnoses;
- diagnostics;
- prescriptions;
- procedures;
- tasks;
- communications;
- financial linkage;
- outcome.

## 10.2 Encounter

Структура:
- reason for visit;
- history/anamnesis;
- vitals;
- examination;
- findings;
- problem list;
- assessment;
- diagnosis/differentials;
- plan;
- procedures;
- medications;
- labs;
- imaging;
- recommendations;
- follow-up;
- clinician;
- timestamps.

Поддержать SOAP-compatible templates, но не ограничивать только SOAP.

## 10.3 Clinical Templates

Администратор/главврач должен уметь создавать шаблоны:
- dermatology;
- gastro;
- vaccination;
- general exam;
- ultrasound;
- post-op;
- grooming-associated exam;
- custom.

Templates versioned.

## 10.4 Clinical Record Integrity

После finalization:
- запись не переписывается незаметно;
- изменение создаёт amendment/version;
- хранится author/timestamp/reason;
- audit trail immutable.

## 10.5 Vitals

Timeline:
- weight;
- temperature;
- pulse;
- respiration;
- blood pressure;
- SpO2;
- other configurable metrics.

---

# 11. DIAGNOSTICS

## 11.1 Laboratory

Entities:
- LabOrder;
- LabOrderItem;
- Specimen;
- Result;
- ReferenceRange;
- ExternalLab;
- Device;
- Attachment.

Поддержать:
- ручной ввод;
- импорт;
- API adapters;
- PDF/image;
- structured results;
- trend charts;
- abnormal flags;
- result acknowledgement.

## 11.2 Imaging

- ultrasound;
- X-ray;
- other imaging.

Поддержать:
- study metadata;
- files;
- image series;
- report;
- clinician;
- date;
- external storage adapter;
- DICOM-compatible import layer, если оборудование это поддерживает.

Не предполагать API у существующего оборудования.
Сначала registry + import + adapters.

---

# 12. VACCINATION & PREVENTIVE CARE

- vaccine catalog;
- lot/batch;
- expiry;
- manufacturer;
- administration;
- route/site;
- clinician;
- certificate;
- next due date;
- reminders;
- vaccination plan;
- preventive tasks;
- deworming;
- parasite prevention;
- configurable wellness plans.

Client App:
- upcoming;
- overdue;
- completed;
- certificate download.

---

# 13. PRESCRIPTIONS & MEDICATIONS

Entities:
- MedicationCatalogItem;
- Prescription;
- PrescriptionItem;
- Dose;
- Route;
- Frequency;
- Duration;
- Instruction;
- Refill;
- Clinician;
- LegalStatus/config.

Medication workflows:
- prescribed;
- dispensed;
- administered;
- inventory movement;
- invoice linkage.

AI может подготовить черновик из врачебной диктовки, но не назначает препарат самостоятельно и не отправляет клиенту без approval.

---

# 14. HOSPITAL / INPATIENT

## 14.1 Hospital Board

Визуальный board:
- patient;
- cage/bed;
- responsible clinician;
- acuity/status;
- current plan;
- next task;
- due medications;
- infusions;
- owner update status;
- alerts.

## 14.2 Cage / Bed Management

- cages;
- capacity;
- location;
- status;
- cleaning;
- isolation properties;
- maintenance;
- reservation/assignment.

## 14.3 Treatment Sheet

- ordered treatment;
- scheduled times;
- assigned staff;
- performed time;
- performer;
- missed/late;
- reason;
- notes;
- vitals.

## 14.4 Infusion Management

Resource registry должен позволять создать инфузоматы как оборудование.

InfusionSession:
- patient;
- device;
- fluid/medication;
- ordered rate;
- started;
- paused;
- completed;
- actual observations;
- responsible staff.

Не реализовывать прямое управление конкретным инфузоматом, пока нет подтверждённого API/протокола производителя.
Но модель устройства, назначения и журнала должна быть готова.

## 14.5 Oxygen Resource

- oxygen station/equipment resource;
- patient assignment;
- usage log;
- maintenance;
- alerts.

## 14.6 Shift Handoff

Автоматическая краткая сводка:
- patients;
- due tasks;
- unresolved issues;
- medication schedule;
- critical alerts.

AI может подготовить draft handoff из структурированных данных.
Он не заменяет клиническую проверку.

---

# 15. RESOURCE & EQUIPMENT MANAGEMENT

Resource types:
- room;
- grooming table;
- bath;
- cage;
- ultrasound;
- oxygen device;
- infusion pump;
- diagnostic equipment;
- vehicle;
- other.

Поля:
- location;
- state;
- availability;
- schedule;
- maintenance;
- service history;
- calibration if needed;
- attachments/manuals;
- serial;
- asset tag;
- API integration capability.

Resource можно требовать для Service/Appointment/Procedure.

---

# 16. INVENTORY / PHARMACY / SUPPLY

## 16.1 Catalog

- SKU;
- name;
- type;
- medication/consumable/product/feed;
- unit;
- barcode;
- marking metadata;
- supplier;
- purchase price;
- sell price;
- tax metadata;
- storage requirements.

## 16.2 Lots

- batch/lot;
- serial where needed;
- expiry;
- quantity;
- purchase;
- location;
- marking identifiers;
- storage state.

## 16.3 Stock Movements

- receipt;
- consumption;
- sale;
- transfer;
- adjustment;
- waste;
- expiry;
- return.

Любое списание препарата из клинической процедуры должно иметь возможность автоматически:
1. уменьшить остаток;
2. добавить соответствующую строку в invoice;
3. сохранить связь с пациентом/encounter;
4. сохранить lot/traceability.

## 16.4 FEFO

Расход по сроку годности:
- first-expire-first-out;
- expiry alerts;
- low-stock alerts;
- reorder suggestions.

## 16.5 Purchasing

- supplier;
- purchase order;
- received quantity;
- discrepancy;
- purchase price;
- invoice document;
- batch entry.

## 16.6 Pharmacy Compliance Mode

Конфиг:
- internal-use only;
- retail enabled;
- license metadata;
- marking integration enabled;
- permitted operations.

Никакая кнопка продажи лекарств не должна включаться просто потому, что сущность `Medication` существует.

---

# 17. BILLING, PAYMENTS, CASH & FISCALIZATION

Отделить:
- Invoice;
- Payment;
- FiscalReceipt;
- ProviderTransaction.

## 17.1 Invoice

Состояния:
- draft;
- estimate;
- issued;
- partially_paid;
- paid;
- void;
- refunded.

InvoiceLine:
- service;
- product;
- medication;
- package redemption;
- membership benefit;
- discount;
- tax metadata;
- performer;
- cost basis.

## 17.2 Payments

Provider interface:
- create payment;
- confirm;
- webhook;
- refund;
- partial refund;
- status reconciliation.

Не хардкодить одного провайдера.

## 17.3 Deposits

Связь:
- Appointment deposit;
- Consultation prepayment;
- general account credit where allowed.

## 17.4 Fiscalization

Отдельный adapter:
- payment → fiscal event;
- receipt status;
- retry;
- idempotency;
- error queue;
- reconciliation.

Финансовая транзакция не считается полностью завершённой, пока система не знает состояние необходимой фискализации.

## 17.5 Checkout

На одном экране сотрудник должен видеть:
- услуги;
- товары;
- препараты;
- discounts;
- deposits;
- balance;
- payment method;
- receipt;
- next booking.

---

# 18. DOCUMENTS & CONSENTS

Document engine:
- templates;
- variables;
- versioning;
- PDF rendering;
- signature;
- storage;
- revocation/cancellation status;
- audit.

Types:
- veterinary service agreement;
- personal data processing;
- marketing consent;
- grooming consent;
- photo/media consent;
- procedure consent;
- anesthesia consent;
- hospitalization consent;
- remote consultation consent;
- estimate approval;
- discharge summary;
- vaccination certificate;
- prescription;
- invoice/receipt references;
- custom document.

Consent должен хранить:
- exact document version;
- signer;
- timestamp;
- source;
- related pet;
- related appointment/case;
- proof metadata.

---

# 19. UNIFIED COMMUNICATION HUB

Thread может быть связан с:
- Owner;
- Pet;
- Appointment;
- Consultation;
- Case;
- Invoice.

Channel adapters:
- in-app;
- Telegram;
- email;
- SMS;
- другие официальные API по мере подключения.

Не строить систему на browser scraping социальных сетей.

Features:
- two-way messages;
- attachments;
- internal notes;
- assignment;
- unread;
- priority;
- templates;
- business-hours auto reply;
- routing;
- tags;
- status;
- SLA/configured response windows.

Medical messages должны иметь возможность попадать в clinical record только после явного действия сотрудника, а не автоматически загрязнять медкарту.

---

# 20. TELEGRAM

## 20.1 Bot

Возможности:
- /start onboarding;
- account linking;
- open Mini App;
- appointment reminders;
- confirm/reschedule links;
- payment status;
- consultation updates;
- ready for pickup;
- new report;
- new lab result notification;
- vaccination reminders;
- rebooking;
- service campaigns;
- human handoff.

## 20.2 Mini App

Не отдельная система.
Использует тот же backend и UI domain packages, что Client Web.

## 20.3 Security

- validate Telegram init/auth data server-side;
- never trust user id from frontend body;
- map Telegram identity to internal User;
- support unlink/relink;
- log sensitive auth events.

## 20.4 Payments

Telegram payment implementation — отдельный provider decision.
Не связывать core billing с правилами одного канала.
Основной Invoice/Payment domain должен работать одинаково из web, staff и Telegram.

---

# 21. CLIENT APP — ПОЛНАЯ КАРТА ЭКРАНОВ

## Home
- upcoming appointment;
- pending consultation;
- important pet reminders;
- quick book;
- quick ask;
- payment due;
- latest report.

## My Pets
- cards;
- add pet;
- shared access.

## Pet
Tabs/sections:
- overview;
- timeline;
- health;
- grooming;
- vaccinations;
- medications;
- documents;
- invoices;
- reports.

## Book
- service category;
- pet;
- service;
- options;
- staff;
- date/time;
- intake;
- estimate;
- consent;
- deposit/payment;
- confirmation.

## Consultation
- select pet;
- problem;
- structured intake;
- attachments;
- format;
- emergency check;
- consent;
- payment;
- chat/call;
- result.

## Messages
- conversations;
- attachments;
- context.

## Payments
- invoices;
- deposits;
- receipts;
- refunds;
- packages;
- memberships.

## Documents
- signed;
- unsigned;
- certificates;
- reports.

## Profile
- account;
- contacts;
- notifications;
- privacy;
- permissions;
- shared caregivers.

---

# 22. STAFF APP — ПОЛНАЯ КАРТА ЭКРАНОВ

## Today Dashboard
- schedule;
- checked in;
- waiting;
- in service;
- hospital alerts;
- consultation queue;
- unpaid/problem payments;
- urgent messages;
- tasks.

## Schedule
Views:
- day;
- week;
- staff;
- rooms/resources;
- grooming;
- veterinary.

## Flowboard
Operational patient flow:
- scheduled;
- arrived;
- waiting;
- room;
- procedure;
- diagnostics;
- checkout;
- complete.

## Owners
- search;
- profile;
- pets;
- finance;
- messages.

## Patients
- search;
- alerts;
- history;
- timeline.

## Grooming Workspace
- today;
- profile;
- recipe;
- before;
- service;
- report;
- ready;
- checkout.

## Medical Workspace
- encounter;
- templates;
- vitals;
- diagnoses;
- plan;
- labs;
- imaging;
- prescription;
- invoice;
- follow-up.

## Consultation Queue
- new;
- paid;
- assigned;
- waiting;
- active;
- follow-up;
- completed.

## Hospital
- board;
- patient;
- treatment sheet;
- cages;
- equipment;
- shift handoff.

## Diagnostics
- orders;
- pending;
- results;
- abnormal;
- integrations.

## Inventory
- stock;
- lots;
- expiry;
- purchase;
- movement;
- marking;
- inventory count.

## Finance
- invoices;
- payments;
- refunds;
- cash;
- reconciliation.

## Inbox
- channels;
- assigned;
- medical;
- booking;
- billing;
- AI classification.

## Tasks
- personal;
- team;
- patient;
- overdue.

## Analytics
- business;
- clients;
- grooming;
- veterinary;
- staff;
- inventory.

---

# 23. AUTOMATION ENGINE

Не писать каждую автоматизацию в коде как отдельный cron.

Создать event-driven Automation Engine.

Trigger:
- domain event;
- time before/after event;
- schedule;
- condition.

Conditions:
- service type;
- pet;
- breed/species;
- owner tags;
- location;
- amount;
- visit history;
- last appointment;
- vaccine due;
- membership;
- consent;
- channel.

Actions:
- send message;
- create task;
- request confirmation;
- request payment;
- add tag;
- create reminder;
- enqueue campaign;
- notify staff;
- offer rebooking.

Examples:
- за N до визита → reminder;
- after grooming complete → report + rebook;
- vaccine due → notification;
- no visit for configured interval → return campaign;
- consultation paid → assign queue;
- lab result received → clinician task;
- inventory expiring → inventory alert.

Все действия idempotent.

---

# 24. AI LAYER

AI — assistant, а не autonomous veterinarian.

## 24.1 AI Use Cases

### Intake Assistant
Преобразует свободный текст клиента в structured intake draft.

### Message Classifier
Определяет intent и маршрутизирует.

### Staff Reply Draft
Готовит ответ на основе:
- message context;
- clinic policy;
- knowledge base;
- pet context where allowed.

Сотрудник подтверждает медицинские ответы.

### Scribe
Voice/audio → transcript → structured clinical draft.

### Medical Record Summary
Кратко суммирует длинную историю для сотрудника.

### Discharge Draft
Создаёт понятный владельцу draft на основе утверждённого clinical plan.

### Grooming Report Draft
Формирует текст report card из заметок грумера.

### Search Assistant
Natural language search по разрешённым данным.

### Shift Handoff Draft
Сводка стационара.

### Charge Capture Assistant
Может предложить потенциально забытые invoice lines, основываясь на реально задокументированных действиях.
Не добавляет их сам.

## 24.2 AI Safety Contract

Любой AI output содержит:
- generated_at;
- model/provider;
- prompt/version;
- source context references where possible;
- status: draft/accepted/rejected/edited;
- accepting user.

Правила:
1. AI не ставит диагноз клиенту самостоятельно.
2. AI не назначает лечение клиенту самостоятельно.
3. AI не выписывает рецепты самостоятельно.
4. AI не изменяет final clinical record без approval.
5. Emergency red flags ведут в safety flow.
6. AI не получает больше данных, чем разрешено текущему пользователю.
7. Внешний AI-provider подключается через abstraction layer.
8. Sensitive-data handling учитывает data residency/legal policy.
9. Logging не должен случайно сохранять полные персональные/медицинские данные в технические логи.

---

# 25. KNOWLEDGE BASE

Два уровня:

## Public Knowledge
- подготовка к грумингу;
- подготовка к визиту;
- стандартные правила;
- FAQ;
- услуги;
- цены;
- базовые памятки.

## Staff Knowledge
- SOP;
- внутренние протоколы;
- шаблоны;
- правила коммуникации;
- инструкции по оборудованию;
- internal checklists.

AI ответы должны использовать только утверждённые knowledge items соответствующего уровня.

Knowledge articles:
- versioned;
- author;
- approver;
- effective date;
- archived state.

---

# 26. CRM / RETENTION / GROWTH

## Segmentation
- new;
- active;
- lapsed;
- grooming-only;
- veterinary-only;
- mixed;
- high-frequency;
- package;
- membership;
- vaccination due;
- no-show;
- referral source.

## Rebooking
One-click repeat:
- same pet;
- same service;
- previous grooming recipe;
- preferred specialist;
- new time.

## Loyalty
Configurable:
- points;
- tier;
- discount;
- credits;
- benefits.

## Packages
- N services;
- value balance;
- validity;
- eligible services;
- pet-specific/family-specific.

## Memberships
- recurring plan;
- benefits;
- limits;
- renewal;
- pause/cancel policies.

## Referrals
- code/link;
- source;
- reward policy;
- fraud controls.

## Reviews
- post-visit satisfaction;
- internal negative-feedback route;
- external review request where platform rules/API allow.

---

# 27. CONTENT & SOCIAL PUBLISHING

Отдельный Content domain:
- draft;
- media;
- caption;
- channel variants;
- approval;
- scheduled publish;
- result/URL/status where provider supports it.

Adapters only through official APIs.

Не смешивать Social Publisher и private Client Messaging.

---

# 28. ANALYTICS

События продукта и бизнеса должны быть доступны без чтения production DB вручную.

## Revenue
- revenue;
- collected;
- outstanding;
- refunds;
- deposits;
- average ticket;
- gross margin where cost known;
- grooming/vet/retail split.

## Booking
- booking conversion;
- cancellations;
- no-show;
- rebooking;
- occupancy/utilization;
- lead time.

## Client
- new clients;
- returning;
- retention;
- lapsed;
- source;
- cohort behavior.

## Pet
- active pets;
- service frequency;
- grooming interval;
- preventive due.

## Consultation
- started intake;
- paid;
- abandoned;
- response queue;
- completion;
- follow-up.

## Staff
- appointments;
- revenue;
- utilization;
- task load;
- schedule occupancy.

## Inventory
- stock value;
- expiry;
- turnover;
- write-offs;
- missing stock;
- reorder.

## Product funnel
- landing;
- service view;
- booking start;
- booking complete;
- payment;
- visit;
- rebook.

Analytics events must avoid leaking PII.

---

# 29. PUBLIC WEBSITE

Pages:
- Home;
- Grooming;
- Veterinary;
- Consultation;
- Services;
- Prices / Price Calculator;
- Specialists;
- About / Approach;
- Technology / Equipment;
- Grooming Gallery;
- Knowledge Center;
- Reviews;
- Booking;
- Login;
- Contacts;
- Emergency information.

Requirements:
- mobile first;
- fast;
- accessible;
- server-rendered/SEO capable;
- unique metadata;
- structured content;
- sitemap;
- robots config;
- canonical URLs;
- OG/social previews;
- conversion events;
- UTM preservation into CRM source.

Не превращать публичный сайт в тяжёлую CRM bundle.

---

# 30. TENANT / ORGANIZATION READY ARCHITECTURE

Даже если на старте одна организация:

Все бизнес-сущности должны принадлежать Organization.
Локационные сущности — Location.

Не требуется сразу строить публичный SaaS onboarding.
Но нельзя зашить в код:
- один адрес;
- одного врача;
- одну кассу;
- один склад;
- одну локацию;
- одну валюту/налоговую конфигурацию;
- одну роль.

Multi-location:
- staff memberships;
- location schedules;
- location inventory;
- location resources;
- location pricing overrides;
- cross-location client/pet visibility controlled by policy.

---

# 31. АРХИТЕКТУРА BACKEND

Предпочтение: **modular monolith с жёсткими domain boundaries**, а не преждевременные микросервисы.

Причина:
- единая транзакционность для клиники;
- проще разворачивать;
- меньше distributed failure modes;
- при этом домены должны иметь интерфейсы и события, позволяющие позднее вынести сервисы.

Домены не должны напрямую менять таблицы друг друга.

Использовать:
- application services;
- repositories;
- domain services;
- event bus;
- transactional outbox для важных внешних событий;
- background workers;
- idempotency keys.

---

# 32. РЕКОМЕНДУЕМАЯ СТРУКТУРА MONOREPO

Если текущий репозиторий позволяет:

/apps
  /public-web
  /client-web
  /staff-web
  /api
  /worker
  /telegram-bot

/packages
  /ui
  /design-system
  /auth
  /contracts
  /domain
  /database
  /config
  /observability
  /testing
  /ai
  /integrations

/docs
  VETSVET_MASTER_VISION.md
  ARCHITECTURE.md
  DATA_MODEL.md
  SECURITY.md
  INTEGRATIONS.md
  ROADMAP.md
  DECISIONS_PENDING.md
  /adr

Если существующий repo структурирован иначе — адаптировать, не ломая его ради соответствия папкам.

---

# 33. DATA STORAGE

Core relational DB:
- PostgreSQL-class relational database.

Нужны:
- transactions;
- constraints;
- foreign keys;
- indexes;
- migrations;
- row ownership;
- audit metadata.

Object storage:
- photos;
- video;
- PDFs;
- lab files;
- imaging;
- signed documents.

Files:
- signed URLs;
- access checks;
- metadata;
- malware scanning hook;
- checksum;
- retention policy;
- thumbnails/previews.

Queue/cache:
- Redis-class solution or equivalent;
- jobs;
- rate limits;
- distributed locks where justified.

Search:
Сначала PostgreSQL full text / indexed search.
Выносить в отдельный search engine только при доказанной необходимости.

---

# 34. DATA RESIDENCY / PRIVACY ARCHITECTURE

Primary storage of Russian users' personal data должен быть спроектирован под размещение в РФ.

Обязательные архитектурные возможности:
- region-aware infrastructure;
- configurable external processors;
- consent versions;
- data export;
- correction;
- deletion/anonymization workflow where legally possible;
- retention policy;
- purpose limitation;
- access log;
- encrypted transport;
- secrets management;
- backup/restore;
- data processing inventory.

Не отправлять PII в analytics/logging по умолчанию.

---

# 35. SECURITY

## Authentication
- strong staff authentication;
- MFA;
- session expiry;
- revocation;
- brute-force/rate limiting.

## Authorization
Каждый endpoint проверяет authorization server-side.
Скрытый UI не является security boundary.

## Audit
Audit events:
- read access to sensitive records where feasible;
- create/update/finalize;
- prescription;
- invoice/payment/refund;
- role changes;
- export;
- document signature;
- AI acceptance;
- integration changes.

## Encryption
- TLS;
- encryption at rest where platform supports;
- secret vault/env management;
- no secrets in git.

## Uploads
- type/size validation;
- quarantine/scanning hook;
- private by default.

## Logs
- correlation id;
- actor;
- organization;
- action;
- error;
- no unnecessary PII payloads.

## Backups
- automated;
- encrypted;
- restore procedure;
- periodic restore test.

---

# 36. COMPLIANCE LAYER

Не рассыпать юридические правила по компонентам.

Создать configurable Compliance/Policy layer.

Примеры:
- remote consultation policy;
- pharmacy retail enabled;
- prescription rules;
- required agreements;
- consent requirements;
- fiscalization requirements;
- marking integration;
- data retention;
- photo usage;
- marketing communication;
- refund/cancellation policies.

Legal documents versioned.

Юридические решения, которые требуют проверки, фиксировать как pending configuration, а не как выдуманный факт.

---

# 37. EXTERNAL INTEGRATION ADAPTERS

Создать provider interfaces для:

- PaymentProvider;
- FiscalizationProvider;
- TelegramProvider;
- SMSProvider;
- EmailProvider;
- SocialProvider;
- LabProvider;
- ImagingProvider;
- MarkingProvider;
- CashRegisterProvider;
- TelephonyProvider;
- VideoConsultProvider;
- AIProvider;
- FileStorageProvider;
- AnalyticsProvider.

У каждого:
- health;
- credentials;
- webhook verification;
- idempotency;
- retry;
- dead-letter/error handling;
- status;
- audit.

---

# 38. EVENT MODEL

Ключевые события:

Identity:
- user.created
- user.verified

CRM:
- owner.created
- pet.created
- pet.updated

Booking:
- appointment.*

Grooming:
- grooming.started
- grooming.ready
- grooming.completed
- grooming.report_published

Consult:
- consultation.created
- consultation.payment_required
- consultation.paid
- consultation.assigned
- consultation.completed

Clinical:
- case.opened
- encounter.started
- encounter.finalized
- prescription.created
- vaccine.administered

Diagnostics:
- lab.ordered
- lab.result_received
- imaging.completed

Hospital:
- hospitalization.admitted
- treatment.due
- treatment.completed
- hospitalization.discharged

Inventory:
- stock.received
- stock.consumed
- stock.low
- stock.expiring

Finance:
- invoice.issued
- payment.completed
- payment.failed
- refund.completed
- receipt.completed
- receipt.failed

Communication:
- message.received
- message.sent

Automation listens to events without tightly coupling domains.

---

# 39. SEARCH

Глобальный Staff Search:
- phone;
- owner;
- pet;
- chip;
- appointment;
- invoice;
- consultation;
- case;
- medication;
- SKU.

Search результат должен учитывать права доступа.

---

# 40. NOTIFICATIONS

Notification object отдельно от Message.

Channels:
- in-app;
- Telegram;
- email;
- SMS;
- push future.

Функции:
- template;
- variables;
- locale;
- priority;
- scheduled time;
- delivery status;
- retry;
- opt-out/preference;
- transactional vs marketing.

---

# 41. DESIGN SYSTEM

Создать VetSvet Design System.

Principles:
- calm;
- premium;
- technological;
- warm;
- not childish;
- not overloaded with stereotypical paw icons;
- clinical information has high readability;
- grooming can be more visual but remains part of same brand.

Components:
- typography;
- color tokens;
- spacing;
- buttons;
- inputs;
- cards;
- pet avatar;
- timeline;
- status chips;
- alert banners;
- data tables;
- calendar;
- task row;
- report card;
- clinical form;
- upload;
- modal/drawer;
- command/search.

Mobile-first for Client.
Desktop/tablet-first but responsive for Staff.

---

# 42. ACCESSIBILITY & UX

- keyboard navigation;
- labels;
- contrast;
- error summaries;
- meaningful loading;
- skeletons;
- empty states;
- retry;
- offline/network error explanation;
- no critical action hidden behind hover only.

Medical alerts должны быть заметны, но не превращать интерфейс в постоянный красный шум.

---

# 43. MIGRATION OF EXISTING CLIENTS

Создать import pipeline:
- CSV/XLSX mapping;
- contacts;
- pets;
- notes;
- prior services where available;
- deduplication;
- merge preview;
- error report;
- import audit.

Claim Existing Profile:
- user verifies phone/email;
- system matches existing Owner;
- ambiguous match → staff review;
- pets attach after verification.

Не создавать дубль каждому старому клиенту при первой Telegram авторизации.

---

# 44. LAUNCH TRANSITION

Для старых клиентов:
- personalized invite/deep link;
- account claim;
- confirm pet data;
- sign current required consents;
- choose notification preference;
- book/rebook.

Рабочая политика может постепенно переводить запись в цифровой канал, при этом staff всегда может создать запись вручную от имени клиента.

---

# 45. ТРИ ГЛАВНЫХ VERTICAL SLICES

Codex не должен строить двадцать полуготовых модулей без end-to-end результата.

## Slice A — Grooming Revenue Loop

Новый клиент:
1. Public Web.
2. Sign in.
3. Create Owner.
4. Create Pet.
5. Select grooming service.
6. Quote.
7. Availability.
8. Intake.
9. Consent.
10. Deposit/payment.
11. Staff schedule.
12. Check-in.
13. Grooming workspace.
14. Before/after.
15. Checkout.
16. Report card.
17. Telegram notification.
18. One-click rebook.
19. Timeline.
20. Analytics.

Это первая полная проверка архитектуры.

## Slice B — Paid Professional Consultation

1. Incoming question.
2. Classification.
3. Pet selection.
4. Intake.
5. Emergency safety check.
6. Attachments.
7. Consultation offer.
8. Consent.
9. Payment.
10. Queue.
11. Staff response.
12. Structured result.
13. Timeline.
14. Follow-up.
15. Receipt.
16. Analytics.

## Slice C — Veterinary Encounter

1. Booking.
2. Check-in.
3. Medical case.
4. Encounter.
5. Vitals.
6. Clinical note.
7. Diagnostics/order.
8. Procedure/medication.
9. Inventory consumption.
10. Automatic invoice suggestion.
11. Payment.
12. Finalization.
13. Client summary.
14. Follow-up/reminder.

После этих трёх slices продукт уже имеет единый сквозной фундамент.

---

# 46. ПОРЯДОК РАЗРАБОТКИ

Это порядок зависимостей, НЕ ограничение масштаба.

## Phase 0 — Repository & Architecture Audit
- inspect repo;
- run tests/build;
- architecture map;
- existing domain inventory;
- risk list;
- ADR baseline;
- update master docs.

## Phase 1 — Platform Foundation
- organization/location;
- identity/auth;
- RBAC;
- owner/pet;
- service catalog;
- files;
- audit;
- notifications base;
- events/outbox;
- design system.

## Phase 2 — Booking + Finance Foundation
- schedule;
- resources;
- appointments;
- booking engine;
- invoice;
- payment provider abstraction;
- fiscal adapter abstraction;
- documents/consents.

## Phase 3 — Grooming
Полный Slice A.

## Phase 4 — Messaging + Telegram + Paid Consult
Полный Slice B.

## Phase 5 — Veterinary Clinical Core
Полный Slice C.

## Phase 6 — Diagnostics + Preventive + Prescriptions
- lab;
- imaging;
- vaccine;
- medication;
- prescriptions;
- documents.

## Phase 7 — Inventory / Pharmacy
- catalog;
- lots;
- expiry;
- purchase;
- stock movement;
- clinical consumption;
- marking adapter.

## Phase 8 — Hospital + Equipment
- hospitalization;
- cages;
- treatment board;
- infusion sessions;
- oxygen/resources;
- shift handoff.

## Phase 9 — CRM / Membership / Marketing
- rebooking;
- loyalty;
- packages;
- membership;
- campaigns;
- referral;
- reviews;
- social publishing.

## Phase 10 — AI
AI можно подключать раньше точечно, но к этому этапу должен существовать полный governance layer:
- scribe;
- summaries;
- reply drafts;
- intake;
- grooming reports;
- search;
- handoff;
- charge capture suggestion.

## Phase 11 — Advanced Analytics
- business dashboard;
- cohorts;
- utilization;
- inventory performance;
- funnel;
- revenue leakage.

## Phase 12 — Multi-location / Scale / Native
- multi-location operational polish;
- iOS/Android if justified;
- advanced integrations;
- public API;
- partner ecosystem.

Codex после завершения одной фазы должен продолжать следующую, если нет реального blocker.

---

# 47. DEFINITION OF DONE

Функция считается готовой, только если есть:

1. DB/schema migration.
2. Domain rules.
3. API.
4. Authorization.
5. Audit where required.
6. UI.
7. Loading/empty/error states.
8. Validation.
9. Tests critical logic.
10. E2E для критического пути.
11. Observability.
12. Documentation.
13. No secrets.
14. No fake production integration.
15. Mobile/responsive behavior for client-facing UI.
16. Migration/backward compatibility consideration.

---

# 48. TEST STRATEGY

## Unit
- pricing rules;
- booking constraints;
- permissions;
- state machines;
- inventory math;
- finance math;
- automation conditions.

## Integration
- DB;
- transactions;
- event/outbox;
- providers;
- webhooks;
- file authorization.

## E2E
Обязательные критические flows:
- registration;
- pet creation;
- grooming booking/payment/completion/rebook;
- consultation payment/completion;
- veterinary encounter;
- invoice/refund;
- RBAC;
- document consent;
- hospital medication administration;
- inventory consumption.

## Security
- IDOR;
- role escalation;
- webhook spoofing;
- upload abuse;
- auth/session;
- rate limit;
- sensitive logging.

---

# 49. STATE MACHINES

Не управлять критическими сущностями набором случайных boolean.

Appointment state machine.
Consultation state machine.
Invoice state machine.
Payment state machine.
Hospitalization state machine.
Document state machine.
Lab order state machine.
Prescription state machine.

Переходы валидируются backend.

---

# 50. IDEMPOTENCY & FINANCIAL SAFETY

Обязательная idempotency для:
- payment create/callback;
- refund;
- fiscal receipt;
- external webhook;
- inventory consumption;
- automation action;
- message send where provider supports dedupe.

Webhook:
- verify signature;
- store raw event safely;
- deduplicate;
- process async;
- retry;
- expose failed event queue.

---

# 51. OBSERVABILITY

- structured logs;
- error tracking;
- metrics;
- traces for critical flows;
- queue health;
- integration health;
- webhook failures;
- payment mismatch;
- fiscal mismatch;
- failed notifications;
- AI provider failures.

Admin health screen:
- DB;
- queue;
- storage;
- Telegram;
- payments;
- fiscal;
- marking;
- email/SMS;
- AI.

---

# 52. WHAT NOT TO DO

1. Не строить «просто красивый сайт + Google Calendar».
2. Не хранить всё в таблице `users`.
3. Не делать Pet простым JSON полем внутри Client.
4. Не смешивать медицинскую запись и свободный чат.
5. Не связывать Payment напрямую с одним провайдером.
6. Не считать скрытую кнопку системой прав.
7. Не давать AI самостоятельно менять медкарту.
8. Не доверять Telegram user ID от frontend без проверки.
9. Не делать десятки cron scripts вместо automation engine.
10. Не хардкодить одного врача и одну локацию.
11. Не делать microservices только ради слова microservices.
12. Не сохранять PII в обычных analytics events.
13. Не делать social scraping вместо официальных API.
14. Не притворяться, что внешняя интеграция работает, если нет credentials/API.
15. Не удалять историю clinical records.
16. Не использовать float для денег.
17. Не хранить деньги без currency/minor units.
18. Не проводить stock movement без transaction/audit.
19. Не добавлять юридически спорную возможность как «разрешённую по умолчанию».
20. Не останавливать весь проект из-за отсутствия одной внешней интеграции.

---

# 53. ENGINEERING DATA RULES

- UUID/robust globally unique IDs where appropriate.
- Timestamps stored consistently.
- Money in integer minor units / decimal-safe type.
- Explicit currency.
- Soft delete only where appropriate.
- Clinical finalized data uses version/amendment, not silent overwrite.
- Unique constraints for provider transaction IDs.
- Organization ownership on business data.
- Optimistic/pessimistic locking where concurrency matters.
- Immutable audit IDs.
- Separate public IDs if exposing sequential DB IDs creates risk.

---

# 54. API

API-first.

- versionable contracts;
- typed schemas;
- OpenAPI or equivalent generated contract;
- consistent errors;
- pagination;
- filtering;
- sorting;
- idempotency headers for critical commands;
- request correlation IDs.

Client Web, Staff, Telegram должны использовать один официальный application API, а не ходить напрямую в БД.

---

# 55. MOBILE / PWA / NATIVE FUTURE

Client Web:
- installable PWA;
- responsive;
- touch-first;
- camera uploads;
- share links;
- notifications where supported.

Staff:
- tablet-friendly;
- fast actions;
- voice input;
- camera/scanner support.

Native apps не должны требовать переписывать backend.
API and auth должны быть готовы заранее.

---

# 56. VETSVET PASSPORT — FUTURE DIFFERENTIATOR

Спроектировать возможность, не обязательно реализовывать первой:

Цифровой паспорт питомца:
- QR/NFC share token;
- owner-controlled emergency view;
- basic identity;
- emergency contacts;
- selected medical alerts;
- vaccination/certificate references;
- lost-pet mode;
- temporary sharing with another clinic/caregiver.

Важно:
- private by default;
- revocable share tokens;
- granular disclosure;
- no public full medical history.

---

# 57. CARE PLAN — FUTURE DIFFERENTIATOR

Pet Care Plan объединяет:
- veterinary preventive tasks;
- vaccine schedule;
- grooming schedule;
- follow-ups;
- medications;
- recurring care;
- reminders.

Клиент видит не набор разрозненных записей, а «что дальше нужно моему питомцу».

---

# 58. REVENUE PROTECTION

VetSvet должен предотвращать потерю выручки:

- consultation paywall;
- deposits;
- no-show handling;
- abandoned booking recovery;
- automatic rebooking;
- outstanding invoice reminders;
- charge capture suggestions;
- package/membership renewal;
- lapsed client campaigns;
- invoice reconciliation;
- inventory-to-invoice linkage.

Каждая функция должна иметь audit и понятную отмену.

---

# 59. CLIENT TRUST

Цель — не «вытрясти оплату», а сделать цену профессиональной работы прозрачной.

Client UX:
- объясняет, за что оплата;
- показывает услугу и результат;
- показывает статус;
- хранит документы;
- сохраняет историю;
- не просит одни данные повторно;
- не заставляет звонить для обычных операций.

---

# 60. FIRST CODEX SESSION — КОНКРЕТНО ЧТО ДЕЛАТЬ

Codex, начни с этого:

1. Полностью исследуй текущий репозиторий.
2. Запусти проект и тесты.
3. Создай `/docs/VETSVET_MASTER_VISION.md` из этого документа.
4. Создай `/docs/ARCHITECTURE.md`.
5. Создай `/docs/DATA_MODEL.md`.
6. Создай `/docs/ROADMAP.md`.
7. Создай `/docs/DECISIONS_PENDING.md`.
8. Создай ADR для главных архитектурных решений.
9. Сопоставь существующий код со всеми доменами выше:
   - implemented;
   - partial;
   - missing;
   - conflicting.
10. Исправь критические фундаментальные конфликты.
11. Реализуй Organization + Location + Identity + RBAC + Owner + Pet как устойчивое ядро.
12. Реализуй event/outbox foundation.
13. Реализуй Service Catalog + Resources.
14. Реализуй Booking Engine.
15. Реализуй Invoice/Payment abstractions.
16. После этого собери **полный Grooming Revenue Loop** end-to-end.
17. Затем **Paid Professional Consultation Loop**.
18. Затем **Veterinary Encounter Loop**.
19. Продолжай по фазам, не ожидая отдельной команды после каждого маленького компонента, если нет реального blocker.
20. После каждого значимого блока:
    - тесты;
    - миграции;
    - документация;
    - обновление ROADMAP;
    - список известных ограничений.

---

# 61. ГЛАВНАЯ ПРОВЕРКА ЛЮБОГО РЕШЕНИЯ

Перед добавлением любой функции спроси:

1. Улучшает ли она путь владельца?
2. Сохраняет ли она единую историю питомца?
3. Экономит ли она время специалиста?
4. Защищает ли она профессиональное время от бесплатной рутины?
5. Повышает ли она качество и прослеживаемость клинической работы?
6. Уменьшает ли потерю выручки?
7. Не создаёт ли она тупик для будущих сотрудников/локаций?
8. Соблюдает ли она security/audit/privacy requirements?
9. Можно ли её интегрировать через официальный API?
10. Есть ли у критического действия понятный источник истины?

Если ответ «нет» — пересмотреть дизайн.

---

# 62. КОНЕЧНАЯ КАРТИНА

VetSvet должен стать системой, в которой:

### Клиент
может открыть приложение и увидеть всю цифровую жизнь своего питомца.

### Грумер
знает прошлую процедуру и предпочтения до начала работы.

### Ветеринар
видит полноценную клиническую историю, диагностику, лекарства, визиты и динамику.

### Администратор
управляет записью, платежами и коммуникацией без хаоса в мессенджерах.

### Стационар
работает по цифровому treatment board с преемственностью смен.

### Склад
знает остатки, партии, сроки и связи с реальным использованием.

### Руководитель
видит экономику и загрузку.

### AI
убирает ввод текста и рутину, но не подменяет профессиональное решение.

### Telegram
становится удобной дверью в VetSvet, а не отдельной базой данных.

### Каждое действие
в конечном итоге связано с владельцем, питомцем, услугой, специалистом и историей.

---

# 63. NORTH STAR

**VetSvet — не CRM вокруг расписания.  
VetSvet — цифровая система жизни питомца вокруг профессионального ухода и ветеринарной помощи.**

Архитектура должна быть достаточно глубокой для полноценной клиники и достаточно простой в интерфейсе, чтобы владелец животного пользовался ей без обучения.

Строй максимум конечного продукта.  
Не сокращай vision.  
Разделяй большой объём на правильные зависимые модули.  
Доводи ключевые vertical slices до реальной end-to-end работы.
---

# 64. BEHAVIORAL UX ARCHITECTURE — ПСИХОЛОГИЯ ВЗАИМОДЕЙСТВИЯ

Этот раздел является обязательной частью продукта, а не рекомендацией для дизайнеров.

VetSvet должен проектироваться как система, которая учитывает:
- состояние владельца;
- уровень тревоги;
- срочность;
- степень доверия;
- когнитивную нагрузку;
- ожидание результата;
- финансовое решение;
- прошлый опыт с клиникой;
- частоту использования;
- степень знакомства с медицинской терминологией.

Цель Behavioral UX:
1. уменьшать неопределённость;
2. давать ощущение контроля;
3. делать следующий шаг очевидным;
4. не заставлять человека повторять уже известное системе;
5. не создавать искусственную срочность;
6. не превращать медицинскую тревогу в инструмент продажи;
7. объяснять оплату как стоимость профессиональной работы;
8. формировать привычку возвращаться в VetSvet как в главное цифровое место питомца;
9. поддерживать доверие до, во время и после услуги.

Behavioral UX не должен использовать dark patterns.

Запрещено:
- скрывать цену до последнего шага без необходимости;
- заранее выбирать платные add-ons без согласия;
- усложнять отмену;
- маскировать рекламу под клиническую рекомендацию;
- использовать тревожные формулировки ради продажи;
- создавать искусственный countdown;
- делать отказ визуально унизительным;
- прятать важные ограничения мелким текстом;
- использовать guilt/shame copy;
- создавать ложные признаки срочности;
- выдавать AI-рекомендацию за решение врача.

---

# 65. EMOTIONAL STATE MODEL

Нельзя проектировать Client App для абстрактного «пользователя».

Определить основные состояния.

## 65.1 Routine Care
Пример:
- груминг;
- вакцинация;
- профилактика;
- повторная запись.

UX:
- быстрый;
- визуальный;
- мало текста;
- высокий уровень self-service;
- one-tap repeat;
- pet photo;
- ясная стоимость;
- позитивный feedback.

## 65.2 Concerned Owner
Пользователь заметил проблему, но ситуация не определена.

UX:
- спокойный;
- конкретный;
- не диагностировать;
- дать structured intake;
- сообщить следующий шаг;
- показать ожидаемое время реакции;
- сохранить заполненное;
- не перегружать медицинскими терминами.

## 65.3 Urgent / High Anxiety
UX:
- минимум навигационных развилок;
- emergency routing;
- крупный primary action;
- ясный текст;
- отсутствие маркетинга;
- отсутствие upsell;
- не заставлять создавать полный профиль перед safety action;
- контакт/маршрут должен быть доступен максимально быстро.

## 65.4 Waiting for Care
Пример:
питомец находится на груминге, процедуре или в стационаре.

Главная психологическая проблема — информационный вакуум.

UX должен показывать:
- текущий статус;
- что уже произошло;
- что происходит сейчас, если это допустимо;
- ожидаемый следующий milestone;
- сообщения;
- важные изменения;
- кто отвечает за случай;
- когда следующий update.

Не обещать точное время, если система его не знает.

## 65.5 Receiving Results
Результат анализа/заключения не должен отображаться как холодный raw data dump.

Должны существовать два слоя:
1. профессиональные данные;
2. понятное клиентское представление, утверждённое специалистом.

Критические/требующие обсуждения результаты могут требовать clinician-controlled release workflow.

## 65.6 Billing / Financial Stress
UX:
- itemized estimate;
- что обязательно;
- что дополнительно;
- что уже оплачено;
- deposit;
- возможное изменение стоимости;
- кто может изменить estimate;
- подтверждение до значимого увеличения суммы там, где это применимо;
- отсутствие скрытых платежей.

## 65.7 Complaint / Loss of Trust
UX:
- не заставлять человека искать форму;
- acknowledgment;
- номер обращения;
- ответственный;
- status;
- history;
- resolution;
- возможность human escalation.

## 65.8 End of Life / Loss
Если питомец помечен deceased:
- немедленно прекратить обычные reminder/rebooking/marketing automation;
- не показывать «пора на груминг»;
- не предлагать пакет;
- аккуратная архивация;
- доступ к документам сохраняется согласно policy;
- optional memorial state;
- communication tone должен переключаться;
- удаление/скрытие фотографии не должно быть принудительным.

---

# 66. TRUST ARCHITECTURE

Доверие должно быть инженерной сущностью.

На каждом значимом экране пользователь должен понимать:
- где он находится;
- что сейчас произойдёт;
- кто получит информацию;
- платно ли действие;
- когда ждать результат;
- что можно отменить;
- что является AI;
- что утверждено человеком;
- какой специалист отвечает;
- где посмотреть историю.

## Trust Signals

Использовать реальные сигналы:
- профиль специалиста;
- подтверждённая квалификация;
- дата и время записи;
- статус;
- имя автора заключения;
- timestamp;
- version;
- источник документа;
- подтверждение оплаты;
- история изменений, где уместно.

Не использовать декоративные fake trust badges.

## AI Disclosure

Если текст создан AI:
- staff должен видеть это явно;
- клиент не должен получать неутверждённый клинический AI draft;
- при публикации AI-assisted текста источник клинического решения всё равно специалист.

---

# 67. PROGRESSIVE ONBOARDING

Не требовать полный профиль до первой полезности.

Принцип:
**progressive profiling**.

Первый вход:
- телефон / Telegram / email;
- минимальная идентификация;
- создать/выбрать питомца;
- выполнить нужную задачу.

Дополнительные данные запрашивать только:
- когда они нужны для конкретной услуги;
- с объяснением зачем;
- с возможностью сохранить для следующих визитов.

Не заставлять клиента:
- заполнять паспортные данные без причины;
- повторять телефон;
- повторять породу/дату рождения питомца в каждой форме;
- повторно загружать уже действующий документ.

Поддержать:
- autosave;
- resume later;
- prefill;
- import from existing client;
- claim existing account.

---

# 68. CHOICE ARCHITECTURE

У пользователя не должно быть «меню из 80 услуг».

Использовать:
- service discovery by intent;
- pet-aware recommendations;
- common paths;
- search;
- filters;
- progressive disclosure.

Пример intent:
- «Хочу привести в порядок шерсть»
- «Нужна консультация»
- «Питомец плохо себя чувствует»
- «Нужно обследование»
- «Повторить прошлый визит»

После intent система показывает релевантный subset.

Запрещено:
- скрывать остальные услуги так, чтобы пользователь не мог их найти;
- выдавать коммерчески выгодный вариант за единственно медицински правильный.

---

# 69. PAYMENT & VALUE UX

Платёжный интерфейс должен объяснять value.

Перед оплатой показывать:
- название услуги;
- что входит;
- формат;
- стоимость;
- deposit/full payment;
- cancellation/refund policy;
- ожидаемый deliverable;
- когда начинается оказание услуги.

Для консультации:
не «Заплатите 1500 ₽, чтобы написать врачу»,
а логика:
- специалист изучит историю;
- просмотрит приложенные материалы;
- даст ответ в выбранном формате;
- результат сохранится в истории питомца.

Конкретные тексты и цены конфигурируемы.

## Estimate Psychology

Estimate должен иметь:
- total;
- required items;
- optional items;
- already approved;
- pending approval;
- possible range where clinically justified;
- change history.

Значимое изменение estimate должно иметь понятный approval flow.

---

# 70. STATUS > SILENCE

Во всех длительных процессах пользователь должен видеть состояние.

Примеры:
- payment processing;
- consultation awaiting specialist;
- lab awaiting result;
- grooming in progress;
- pet ready;
- hospital update pending;
- refund processing;
- document awaiting signature.

Создать универсальный Status Timeline component.

Status должен отвечать:
1. что произошло;
2. что сейчас;
3. что дальше;
4. требуется ли действие пользователя.

Не использовать бесконечный spinner там, где процесс асинхронный.

---

# 71. NOTIFICATION PSYCHOLOGY

Notification не является бесплатным рекламным каналом.

Категории:
- critical operational;
- time-sensitive care;
- transactional;
- informational;
- marketing.

Пользователь управляет категориями.

Не отправлять одну и ту же информацию многократно по нескольким каналам без policy.

Не помещать чувствительные медицинские детали в lock-screen notification.

Пример:
хорошо: «По Ричи появился новый результат. Откройте VetSvet.»
плохо: подробный диагноз в push preview.

Notification должен deep-link в правильный контекст.

---

# 72. FORGIVING UX

Каждая нефатальная ошибка должна быть восстанавливаемой.

Обязательное:
- autosave forms;
- undo где возможно;
- draft state;
- retry без повторного заполнения;
- сохранять uploaded files при validation error;
- review before irreversible action;
- понятные error messages;
- server-side duplicate protection.

Пользователь не должен терять 10 минут формы из-за одного неверного поля.

---

# 73. CLIENT AGENCY

Пользователь должен ощущать контроль.

Поддержать:
- просмотр будущих действий;
- изменение notification preferences;
- reschedule/cancel по policy;
- download/export доступных документов;
- revoke shared caregiver;
- revoke temporary Pet Passport link;
- manage payment methods;
- privacy choices;
- human support escalation.

Принцип:
система помогает человеку принять решение, а не принимает коммерческое решение вместо него.

---

# 74. STAFF COGNITIVE LOAD

Staff App проектируется под работу в условиях:
- звонка;
- животного перед сотрудником;
- перчаток;
- эмоционального владельца;
- параллельных задач;
- срочных событий.

Поэтому:
- минимальное количество кликов для частых действий;
- keyboard shortcuts;
- command palette;
- barcode/QR scan;
- speech input;
- sensible defaults;
- templates;
- role-specific home;
- sticky patient identity;
- visible critical alerts;
- крупные touch targets на tablet;
- no duplicate entry.

Не заставлять врача выбирать пациента повторно внутри одного encounter.

Не показывать финансовый dashboard поверх clinical workspace без необходимости.

---

# 75. COGNITIVE SAFETY IN CLINICAL UI

Опасные действия визуально и логически отличать от обычных.

Примеры:
- finalizing clinical note;
- prescription;
- medication administration;
- patient discharge;
- euthanasia record;
- refund;
- deleting/voiding invoice;
- changing patient identity.

Для high-risk action:
- contextual confirmation;
- correct patient prominently visible;
- pet name + species + owner;
- optional photo;
- dose/unit clarity;
- reason where needed.

Нельзя строить безопасность только на красном цвете.

---

# 76. MICROCOPY SYSTEM

Создать `/docs/CONTENT_DESIGN.md`.

Для каждого UI-текста определить:
- audience;
- context;
- emotional state;
- action;
- tone;
- forbidden ambiguity.

Tone VetSvet:
- спокойный;
- ясный;
- уважительный;
- профессиональный;
- человечный;
- без сюсюканья;
- без запугивания;
- без бюрократической тяжести.

Медицинский текст:
- профессиональный внутри Staff;
- понятный, но не упрощающий смысл до искажения — в Client App.

Кнопки называют результат:
- «Записаться»
- «Оплатить консультацию»
- «Подтвердить перенос»
а не:
- «Далее»
- «ОК»
если действие можно назвать точнее.

---

# 77. ACCESSIBILITY AS PRODUCT QUALITY

Целевой минимум публичного сайта и Client Web:
WCAG 2.2 AA.

Staff App также следует этим принципам настолько, насколько применимо.

Обязательное:
- semantic HTML;
- keyboard navigation;
- visible focus;
- screen reader labels;
- target size;
- contrast;
- text scaling;
- no color-only status;
- no drag-only action;
- accessible forms;
- descriptive errors;
- consistent help;
- reduced motion;
- subtitles/transcripts where content requires;
- timezone/locale-aware date/time.

Accessibility включается в Definition of Done.

---

# 78. MOTION & VISUAL PSYCHOLOGY

Анимация должна:
- показывать причинно-следственную связь;
- подтверждать действие;
- объяснять transition;
- создавать premium feel.

Она не должна:
- замедлять urgent flow;
- скрывать данные;
- заставлять ждать;
- использоваться как медицинский сигнал без текста;
- вызывать motion overload.

Respect `prefers-reduced-motion`.

## Visual Emotional Balance

Груминг:
- допускается больше изображения;
- before/after;
- tactile/visual delight.

Clinical:
- ясность;
- hierarchy;
- low ambiguity.

Emergency:
- почти без декоративного motion.

Один brand system, разные intensity modes.

---

# 79. UX RESEARCH SYSTEM

Не считать наши представления о владельцах фактом.

Создать постоянный research loop.

## Personas are hypotheses

Минимальные группы:
- новый владелец;
- постоянный grooming client;
- владелец пожилого питомца;
- multiple-pet household;
- тревожный urgent user;
- пользователь 55+;
- пользователь с низкой digital literacy;
- сотрудник reception;
- groomer;
- veterinarian;
- nurse/assistant;
- manager.

## Research methods
- moderated usability tests;
- task completion tests;
- interviews;
- contextual observation staff workflow;
- funnel analysis;
- support ticket analysis;
- search query analysis;
- post-task micro-surveys.

## Core UX Metrics
- task completion rate;
- booking completion time;
- booking abandonment;
- form error rate;
- support contact rate per task;
- rebooking rate;
- consultation conversion;
- payment failure recovery;
- staff clicks/time per workflow;
- medical record completion delay;
- notification opt-out;
- CSAT;
- CES;
- complaint resolution time.

Не оптимизировать только conversion.

---

# 80. EXPERIMENTATION ETHICS

Feature flags и A/B framework допускаются.

Нельзя экспериментировать:
- с emergency information visibility;
- с сокрытием цены;
- с медицинской безопасностью;
- с consent validity;
- с искусственной тревогой;
- с доступом к приватности.

Допустимо тестировать:
- порядок карточек;
- wording;
- визуальное представление;
- onboarding flow;
- rebooking presentation;
- non-clinical reminders.

Все эксперименты:
- event-defined;
- measurable;
- reversible;
- privacy-safe.

---

# 81. SERVICE BLUEPRINT

Для каждой ключевой услуги создать blueprint из 5 дорожек:

1. Client actions.
2. Client-visible system.
3. Staff actions.
4. Backstage automation.
5. External providers/resources.

Пример Grooming:
client booking → deposit → reminder → arrival → service → ready → checkout → report → rebook.

Blueprint выявляет разрывы между красивым экраном и реальной операционной системой.

Хранить:
`/docs/service-blueprints/`

---

# 82. TRIAGE DOMAIN

В первой версии triage был частью консультации. В full-scale системе это отдельный домен.

TriageCase:
- source;
- owner/pet;
- complaint;
- structured symptoms;
- onset;
- severity indicators;
- attachments;
- triage level;
- disposition;
- assigned staff;
- timestamps;
- audit.

Sources:
- online intake;
- call;
- reception;
- walk-in;
- Telegram;
- existing patient message.

Disposition:
- emergency now;
- urgent same-day;
- scheduled;
- consultation;
- grooming/non-medical;
- information only;
- other.

Важно:
triage logic должна быть clinician-authored/configured.
AI может извлекать признаки и предлагать classification, но не является финальным клиническим решением.

Triage должен работать даже без полной регистрации пользователя в safety-critical сценарии.

---

# 83. WAITLIST & CAPACITY OPTIMIZATION

Полноценный waitlist:
- service;
- pet;
- preferred staff;
- acceptable dates;
- time ranges;
- urgency;
- location;
- auto-offer;
- offer expiry;
- next candidate.

Если слот освобождается:
Automation Engine может предложить его подходящим клиентам.

Не создавать race condition:
слот резервируется transactional/temporarily while offer is accepted.

Capacity:
- staff capacity;
- room capacity;
- cage capacity;
- grooming capacity;
- equipment capacity.

---

# 84. SURGERY DOMAIN

Full-scale veterinary platform должна иметь surgery module.

SurgicalCase:
- procedure;
- diagnosis/indication;
- surgeon;
- team;
- room;
- scheduled time;
- pre-op checklist;
- consent;
- estimate;
- fasting/preparation;
- implants/materials if relevant;
- operative note;
- complications;
- recovery;
- discharge;
- follow-up.

Surgery Board:
- planned;
- prepared;
- ready;
- in procedure;
- recovery;
- discharge-ready.

---

# 85. ANESTHESIA DOMAIN

Separate AnesthesiaRecord:
- patient;
- procedure;
- pre-anesthetic assessment;
- protocol;
- medications;
- airway;
- monitoring;
- vitals time series;
- events;
- interventions;
- recovery;
- responsible staff.

UI:
- time-oriented;
- rapid data entry;
- visible trends;
- abnormal-state alerts;
- no accidental patient switch.

Если монитор/API отсутствует:
ручной ввод + import layer.

Если API появится:
DeviceAdapter.

---

# 86. DENTAL DOMAIN

Опционально, но архитектурно включить.

DentalChart:
- tooth map;
- findings;
- procedures;
- images;
- notes;
- treatment plan;
- invoice integration.

Не делать tooth chart как generic text field.

---

# 87. REFERRAL & SECOND-OPINION NETWORK

VetSvet должен уметь отправить и получить referral.

Referral:
- referring organization/specialist;
- receiving organization/specialist;
- pet;
- reason;
- urgency;
- shared records;
- owner consent;
- status;
- reply;
- outcome.

Flows:
- outbound referral;
- inbound referral;
- second opinion;
- diagnostic-only referral.

Sharing:
- time-limited link;
- explicit file set;
- revocation;
- audit.

Не давать внешней стороне полный доступ к аккаунту владельца.

---

# 88. HOME VISITS / MOBILE PRACTICE

Поддержать выездные услуги.

Appointment:
- service address;
- geo zone;
- travel buffer;
- travel fee;
- assigned staff;
- mobile kit/resource;
- route group.

Future Route Planner:
- cluster appointments;
- travel estimates;
- capacity;
- delays;
- client ETA notifications.

Staff Mobile Mode:
- offline cache;
- pet record;
- forms;
- photos;
- invoice;
- payment;
- sync.

---

# 89. CLINICAL QUALITY & SAFETY

Создать Quality domain.

## Incident
- patient;
- appointment/case;
- type;
- severity;
- description;
- immediate action;
- reporter;
- reviewer;
- root cause;
- corrective action;
- status.

Типы могут включать:
- grooming incident;
- medication error;
- equipment issue;
- fall/escape/bite;
- communication failure;
- payment/document error;
- privacy incident;
- other.

## Quality Review
- case review;
- anonymized learning;
- action items;
- SOP update.

Не смешивать incident report и медицинскую запись, но связывать их.

---

# 90. SOP / CHECKLIST ENGINE

Knowledge Base расширить executable checklists.

Checklist Template:
- service/procedure;
- role;
- version;
- steps;
- required/optional;
- evidence;
- sign-off.

Использование:
- surgery prep;
- anesthesia;
- discharge;
- cage cleaning;
- equipment maintenance;
- opening/closing;
- medication receipt;
- emergency setup.

Checklist completion auditable.

---

# 91. STAFF & COMPETENCY MANAGEMENT

В первой версии были роли, но не управление компетенциями.

Staff Profile:
- role;
- specialties;
- qualifications;
- certificates;
- credential expiry;
- permitted procedures;
- locations;
- employment status;
- schedules;
- competencies.

Service/Procedure может требовать:
- role;
- competence;
- current credential.

System предупреждает о просроченной квалификации.

Дополнительно:
- shift planning;
- workload;
- leave/unavailability;
- time clock adapter;
- payroll/accounting adapter future.

---

# 92. INTERNAL TEAM COLLABORATION

Не использовать клиентский чат как внутренний Slack.

Internal:
- patient notes;
- mentions;
- task comments;
- shift notes;
- case discussion;
- handoff.

Различать:
- clinical record;
- internal operational note;
- client-visible message.

Каждый тип имеет разные правила хранения и видимости.

---

# 93. DIGITAL CHECK-IN / PRECHECK

До визита:
- confirm appointment;
- update contacts;
- confirm pet data;
- intake;
- upload documents;
- consent;
- estimate/deposit;
- arrival instructions.

При прибытии:
- receptionist check-in;
или
- QR/self check-in/kiosk.

Self check-in не должен заменять emergency triage.

---

# 94. PHYSICAL-DIGITAL IDENTITY

QR/barcode layer:

Объекты:
- patient;
- cage;
- sample;
- inventory item;
- medication lot;
- equipment;
- document.

Use cases:
- scan patient at treatment station;
- scan cage;
- scan specimen;
- scan medication;
- scan inventory;
- open equipment card.

Никогда не помещать чувствительные данные напрямую в QR.
QR содержит opaque identifier/token.

---

# 95. SAMPLE CHAIN OF CUSTODY

Для лаборатории:

Specimen:
- unique ID;
- patient;
- order;
- type;
- collected by;
- time;
- container;
- status;
- location;
- sent externally;
- received;
- rejected reason;
- result linkage.

Label printing:
- barcode/QR;
- patient short identity;
- specimen;
- date/time.

Ошибки идентификации образца должны регистрироваться как quality incident.

---

# 96. CLIENT-FACING CARE PLAN

Развить раздел Future Differentiator в полноценный модуль.

CarePlan:
- goals;
- preventive schedule;
- vaccinations;
- grooming;
- medication;
- follow-up;
- diagnostics;
- recurring tasks;
- owner tasks;
- clinician tasks.

Client Home должен отвечать:
**«Что дальше нужно моему питомцу?»**

Не только:
«Вот история того, что уже было».

---

# 97. JOURNEY MEMORY

VetSvet должен помнить контекст предыдущего взаимодействия.

Примеры:
- last grooming recipe;
- preferred staff;
- preferred time;
- previously rejected add-on;
- notification preference;
- last consultation issue;
- recently uploaded valid document;
- payment method;
- active care plan.

Использовать память для удобства, а не скрытой манипуляции.

---

# 98. HOUSEHOLD / FAMILY MODEL

Owner ≠ единственный человек вокруг питомца.

Household:
- members;
- pets;
- relationships;
- billing owner;
- communication permissions;
- medical decision permissions;
- pickup permissions.

Примеры:
- супруг;
- взрослый ребёнок;
- pet sitter;
- временный caregiver.

Права granular и revocable.

---

# 99. PET OWNERSHIP TRANSFER

Поддержать:
- transfer request;
- old owner confirmation/policy;
- new owner;
- historical record visibility policy;
- billing separation;
- contact update;
- audit.

Не переписывать старую историю новым владельцем.

---

# 100. LOST / FOUND MODE

VetSvet Passport расширить:

Lost mode:
- owner activates;
- public safe profile;
- contact relay;
- optional location where found;
- no disclosure of private medical record;
- revoke when found.

Found report:
- token/QR;
- message relay;
- spam/rate protection.

---

# 101. E-COMMERCE / RETAIL

Если бизнес продаёт разрешённые товары:

Store:
- grooming products;
- care products;
- feed where permitted;
- approved OTC items where permitted;
- merchandise;
- service gift certificates.

Flows:
- pickup;
- reservation;
- payment;
- inventory;
- fiscalization;
- marking where applicable.

Клиническая рекомендация и retail promotion должны быть визуально различимы.

---

# 102. REFILL REQUESTS

Client App:
- request refill;
- select prescription/medication;
- questionnaire if required;
- status;
- payment/pickup where permitted.

Staff:
- review;
- approve/decline;
- reason;
- prescription linkage;
- inventory;
- notification.

Никакого auto-approval AI.

---

# 103. INSURANCE / CLAIMS ADAPTER

Не предполагать конкретную страховую систему.

Создать Insurance domain:
- policy;
- insurer;
- coverage metadata;
- claim;
- supporting documents;
- invoice linkage;
- status;
- reimbursement.

Provider adapter для будущих интеграций.

Это позволяет работать с pet insurance, если соответствующий рынок/партнёры будут подключены.

---

# 104. ACCOUNTING / ERP INTEGRATION

Finance operational ≠ бухгалтерия.

Создать AccountingProvider.

Export/integration:
- invoices;
- payments;
- refunds;
- cash shifts;
- inventory purchases;
- counterparties;
- tax metadata.

Предусмотреть 1C adapter как отдельную реализацию, а не вшивать 1C semantics в core domain.

---

# 105. REFERRAL / PARTNER CRM

Источник клиента:
- organic;
- maps;
- ads;
- breeder;
- shelter;
- partner;
- veterinary colleague;
- client referral;
- campaign.

Partner:
- contact;
- type;
- attribution;
- referral count;
- cases;
- policy/reward where legally and ethically permitted.

Медицинское направление не должно искажаться коммерческим вознаграждением.

---

# 106. CALL CENTER / TELEPHONY

TelephonyProvider:
- inbound/outbound call;
- caller match;
- missed call;
- call outcome;
- recording reference where lawful;
- callback task.

Incoming call:
если phone match найден:
Staff App может показать owner/pet context.

Не загружать полный clinical record автоматически сотруднику без права доступа.

---

# 107. SUPPORT & SERVICE DESK

Отдельный SupportCase:
- type;
- owner;
- issue;
- priority;
- assignee;
- SLA;
- messages;
- resolution;
- root cause/tag.

Отличать:
- медицинскую консультацию;
- complaint;
- техническую проблему;
- billing support.

Это важно при масштабировании: всё не должно попадать врачу.

---

# 108. SERVICE RECOVERY SYSTEM

После ошибки/негативного опыта:

1. зафиксировать проблему;
2. acknowledgment;
3. owner;
4. investigation;
5. proposed resolution;
6. approval if financial;
7. client communication;
8. follow-up satisfaction;
9. internal learning.

CRM не должна автоматически просить публичный отзыв у клиента с незакрытым серьёзным complaint.

Не использовать deceptive review gating.

---

# 109. END-OF-LIFE CARE WORKFLOW

Sensitive module.

Возможные состояния:
- palliative/supportive plan;
- quality-of-life tracking if clinician chooses;
- end-of-life appointment;
- consent/documents;
- aftercare choices;
- discharge/records;
- deceased status.

После deceased:
Automation Engine triggers:
- stop standard reminders;
- stop marketing;
- stop grooming campaigns;
- stop vaccine reminders;
- preserve permitted records;
- optional condolence workflow approved by clinic.

Не автоматизировать эмоциональное сообщение без тщательно утверждённого template/policy.

---

# 110. BUSINESS INTELLIGENCE / DATA WAREHOUSE

Для full scale не полагаться только на transactional reports.

Создать analytics pipeline:
- privacy-safe event stream;
- ETL/ELT;
- warehouse;
- semantic metrics layer;
- dashboards.

Domains:
- revenue;
- utilization;
- retention;
- lifetime value;
- inventory;
- clinical operations;
- hospital;
- acquisition;
- staff;
- waitlist;
- consultations;
- customer experience.

Metrics definitions versioned.

Один термин («rebooking rate») должен иметь одну формулу.

---

# 111. PROFITABILITY & UNIT ECONOMICS

Помимо revenue:

Service economics:
- revenue;
- discounts;
- labor time;
- consumables;
- medication;
- payment fee;
- resource time;
- gross contribution.

Pet/Client lifetime:
- first visit;
- acquisition source;
- total revenue;
- service mix;
- retention;
- rebooking;
- outstanding debt.

Не использовать эти данные для дискриминации в клинической помощи.

---

# 112. DEMAND FORECASTING

Future analytics:
- appointment demand;
- seasonal grooming load;
- vaccine reminders;
- staff capacity;
- inventory consumption;
- stockout risk.

ML predictions:
- advisory only;
- confidence;
- historical basis;
- override.

Не превращать prediction в автоматическое клиническое решение.

---

# 113. OFFLINE & DEGRADED MODE

Клиника не должна становиться полностью неработоспособной из-за временного интернета.

Определить degraded workflows:
- view today's cached schedule;
- critical patient identifiers;
- offline notes draft;
- local queue for non-financial actions;
- print emergency fallback;
- later sync.

Особая осторожность:
payments, stock and final medical writes cannot silently duplicate.

Sync engine:
- conflict detection;
- server authority;
- idempotency;
- explicit unresolved conflicts.

---

# 114. BUSINESS CONTINUITY / DISASTER RECOVERY

Документ:
`/docs/BUSINESS_CONTINUITY.md`

Определить:
- critical services;
- backup schedule;
- RPO;
- RTO;
- restore test;
- provider outage;
- payment outage;
- Telegram outage;
- storage outage;
- DB outage;
- internet outage;
- local contingency.

Runbooks:
- restore;
- integration failover;
- webhook backlog;
- credential compromise;
- data incident.

---

# 115. RELEASE ENGINEERING

Production:
- environments: dev/staging/prod;
- CI;
- automated migrations;
- rollback plan;
- feature flags;
- secret rotation;
- dependency scanning;
- backup before risky migrations;
- observability release markers.

Не выкатывать schema changes, которые ломают старый client version без compatibility window.

---

# 116. PRODUCT TELEMETRY

Собирать:
- performance;
- errors;
- task events;
- funnel events.

Не собирать:
- raw clinical note;
- raw chat;
- full owner name;
- lab result values

в generic product analytics без отдельной необходимости и правовой архитектуры.

---

# 117. PERFORMANCE BUDGETS

Public Web:
- fast first render;
- image optimization;
- lazy loading;
- no massive app bundle.

Client:
- critical screens fast on mobile network.

Staff:
- search;
- schedule;
- patient open;
- save note

должны иметь performance targets.

Фактические target values определить после измерения инфраструктуры и UX tests, а не выдумывать.

---

# 118. INTERNATIONALIZATION

Даже если запуск русскоязычный:
- i18n-ready strings;
- timezone-safe;
- locale formatting;
- currency abstraction;
- measurement units;
- date/time;
- plural rules.

Не хранить UI copy в бизнес-логике.

---

# 119. PRINTING / LABELING

До сих пор план был digital-first, но клиника физическая.

Print service:
- lab labels;
- cage cards;
- prescriptions;
- invoice;
- consent copy;
- discharge;
- vaccination documents;
- inventory labels;
- QR.

PrinterProvider abstraction.

Шаблоны versioned.

---

# 120. ROOM / WALLBOARD MODES

Optional staff displays:
- hospital whiteboard;
- treatment board;
- grooming status;
- waiting queue.

Privacy mode:
на публично видимом экране не показывать лишние ФИО/диагнозы.

---

# 121. DEVICE & SENSOR ADAPTERS

Equipment Registry расширить integration capabilities:

Possible future:
- scale;
- lab analyzer;
- ultrasound;
- anesthesia monitor;
- temperature sensor;
- medication fridge sensor;
- infusion equipment;
- oxygen monitoring.

Universal principle:
1. device identity;
2. capability;
3. inbound data;
4. timestamp;
5. patient association;
6. validation;
7. audit.

Никакого direct device control без safety review и официально подтверждённого protocol/API.

---

# 122. DATA INTEROPERABILITY

Создать canonical exchange layer.

Export bundles:
- pet demographics;
- owner contact where authorized;
- clinical summaries;
- vaccination;
- labs;
- imaging references;
- medication;
- documents.

Formats:
- human-readable PDF;
- structured JSON/API;
- provider-specific adapters.

Не объявлять соответствие конкретному внешнему медицинскому стандарту без подтверждения.

---

# 123. DATA PROVENANCE

Для медицинского/диагностического datum хранить:
- author/source;
- source system/device;
- original timestamp;
- imported timestamp;
- corrected/version;
- confidence/verification status if machine-imported.

Клиническое значение без происхождения ухудшает доверие.

---

# 124. CONSENT RECEIPT

Пользователь должен иметь возможность понять:
- что подписал;
- когда;
- для чего;
- какая версия;
- до какого момента действует;
- как отозвать там, где отзыв применим.

Client App показывает human-readable Consent Center.

---

# 125. PRIVACY CENTER

Client:
- active sessions;
- linked Telegram;
- caregivers;
- permissions;
- communication consent;
- marketing consent;
- exported data requests;
- privacy requests.

Staff:
- organization policy;
- DPA/processor registry;
- data retention config;
- export approvals;
- suspicious access reports.

---

# 126. SUPPORT ACCESS / BREAK-GLASS

Для редкого emergency admin access:

Break-glass:
- reason required;
- limited duration;
- explicit audit;
- alert;
- post-review.

Support engineer не получает неограниченный постоянный clinical read access.

---

# 127. FRAUD / ABUSE / SPAM

Protection:
- rate limits;
- OTP abuse;
- fake booking;
- payment fraud signals;
- Telegram spam;
- mass file upload;
- referral abuse;
- promo abuse.

Не блокировать safety-critical access непрозрачным ML без human recovery route.

---

# 128. CLINICAL SEARCH & DECISION SUPPORT

В будущем Staff App может иметь decision-support tooling.

Разрешённая архитектура:
- approved clinic protocols;
- drug reference data from licensed/authorized source;
- dosage calculators with explicit inputs;
- contraindication alerts if source data supports;
- interaction warnings.

Каждая рекомендация:
- source/version;
- date;
- clinician override;
- no silent autoprescription.

Нельзя генерировать медицинские нормативы из модели без валидированного источника.

---

# 129. CALCULATORS

Clinical calculators:
- explicit formula/source;
- units;
- validation;
- result explanation;
- audit where used clinically.

Money calculators:
- deterministic;
- decimal-safe;
- test-covered.

Никакого LLM arithmetic для критических расчётов.

---

# 130. TRAINING MODE / SANDBOX

Новые сотрудники должны обучаться без риска изменить реальные записи.

Sandbox/training:
- synthetic patients;
- fake payments;
- fake stock;
- fake appointments.

Visual distinction from production.

---

# 131. IN-APP HELP

Context help:
- short explanation;
- SOP link;
- keyboard shortcuts;
- role-aware help.

Help location consistent.

Не открывать огромный manual для каждого вопроса.

Staff can search Knowledge Base without leaving patient context.

---

# 132. PRODUCT OPERATING MODEL

Создать product governance:

Backlog categories:
- Safety;
- Clinical;
- Revenue;
- Client Experience;
- Staff Efficiency;
- Infrastructure;
- Compliance;
- Growth.

Priority не определяется только revenue.

Любой feature request содержит:
- problem;
- user;
- evidence;
- risk;
- metric;
- dependencies;
- data impact;
- security impact;
- UX impact.

---

# 133. DESIGN REVIEW GATE

Перед production значимый client/staff flow проходит:

1. product review;
2. UX review;
3. accessibility review;
4. clinical safety review, если применимо;
5. privacy/security review;
6. analytics review;
7. implementation QA.

High-risk clinical flow:
обязательно тестируется с реальным профильным специалистом.

---

# 134. UX DEFINITION OF DONE

Экран не готов только потому, что «красивый».

Готов, если:
- primary task понятен;
- edge cases;
- loading;
- empty;
- error;
- offline/degraded;
- permissions;
- keyboard;
- mobile/tablet;
- accessibility;
- copy;
- analytics;
- recovery;
- confirmation;
- sensitive-data behavior;
- AI disclosure;
- usability test or justified pattern.

---

# 135. CLIENT JOURNEY — END TO END

VetSvet должен проектировать единый lifecycle:

1. Discovery.
2. Trust/Evaluation.
3. First action.
4. Account recognition.
5. Pet creation/claim.
6. Booking/consult.
7. Pre-check.
8. Payment/deposit.
9. Preparation.
10. Arrival/check-in.
11. Care.
12. Status updates.
13. Checkout.
14. Report/result.
15. Follow-up.
16. Care Plan.
17. Rebooking.
18. Long-term history.
19. Urgent episode.
20. Referral/hospital if needed.
21. Recovery/maintenance.
22. End-of-life/archive if когда-либо потребуется.

На каждом этапе определить:
- emotion;
- question in user's head;
- information needed;
- primary action;
- failure mode;
- automation;
- responsible role;
- success metric.

Хранить:
`/docs/CLIENT_JOURNEY.md`

---

# 136. STAFF JOURNEY — END TO END

От входа сотрудника до окончания смены:

1. Start shift.
2. Review today.
3. Alerts.
4. First patient.
5. Check-in.
6. Service/encounter.
7. Diagnostics/procedures.
8. Documentation.
9. Billing.
10. Client handoff.
11. Follow-up.
12. Hospital tasks.
13. Messages/tasks.
14. Inventory exceptions.
15. Shift handoff.
16. End shift.

Для каждой роли оптимизировать отдельно.

---

# 137. FULL-SCALE MODULE MAP

VetSvet 2.0 включает домены:

CORE
- Identity
- Organization
- Location
- RBAC
- Audit
- Files
- Events
- Notifications

CLIENT
- Household
- Owner
- Pet
- Passport
- Care Plan
- Portal
- Privacy Center

COMMERCIAL
- Services
- Booking
- Waitlist
- Pricing
- Invoice
- Payment
- Fiscal
- Packages
- Membership
- Loyalty
- Retail

GROOMING
- Grooming Profile
- Recipe
- Visit
- Report
- Before/After

CLINICAL
- Triage
- Case
- Encounter
- Vitals
- Diagnosis
- Procedure
- Prescription
- Vaccination
- Diagnostics
- Imaging
- Dental
- Surgery
- Anesthesia
- Hospital
- End-of-life

OPERATIONS
- Tasks
- Flowboard
- Resources
- Equipment
- Inventory
- Pharmacy
- Procurement
- Incident
- SOP
- Staff Competency

COMMUNICATION
- Inbox
- Telegram
- Telephony
- Support Desk
- Referral
- Notifications

GROWTH
- CRM
- Campaigns
- Referral Marketing
- Reviews
- Social Publishing
- Content

INTELLIGENCE
- AI
- Search
- Analytics
- Warehouse
- Forecasting
- Decision Support

PLATFORM
- Integrations
- Compliance
- Security
- Privacy
- Offline
- DR
- Release Engineering
- Feature Flags
- Experimentation
- i18n
- Print
- Device adapters.

---

# 138. UPDATED PHASE ORDER — FULL SCALE

Сохраняется принцип: фазы — dependencies, не scope limitation.

## Phase A — Foundation
Core + organization + identity + RBAC + pet + audit + events + files.

## Phase B — UX Foundation
Design System + Behavioral UX + Content Design + Accessibility + research instrumentation.

## Phase C — Revenue Core
Services + booking + waitlist + resources + payments + fiscal + consent.

## Phase D — Grooming Complete
Full grooming lifecycle.

## Phase E — Communication & Consultation
Inbox + Telegram + triage + paid consultation + support routing.

## Phase F — Clinical Core
Case + encounter + vitals + diagnostics + treatment + prescriptions.

## Phase G — Advanced Clinical
Surgery + anesthesia + dental + hospital + preventive + referral.

## Phase H — Pharmacy & Physical Operations
Inventory + marking adapters + procurement + equipment + QR/sample chain.

## Phase I — CRM & Retention
Care Plan + membership + packages + loyalty + rebooking + campaigns.

## Phase J — Scale Operations
Staff competency + SOP + incident + quality + multi-location + telephony.

## Phase K — Intelligence
AI + warehouse + forecasting + decision support.

## Phase L — Extended Ecosystem
Home visits + insurance + accounting + e-commerce + partner network + native apps + device integrations.

Codex должен доводить end-to-end slices параллельно этой последовательности, а не строить isolated modules.

---

# 139. FULL-SCALE CODEX DIRECTIVE

После чтения версии 2.0 Codex должен:

1. Обновить architecture map.
2. Создать/обновить:
   - `CLIENT_JOURNEY.md`
   - `STAFF_JOURNEY.md`
   - `CONTENT_DESIGN.md`
   - `UX_PRINCIPLES.md`
   - `ACCESSIBILITY.md`
   - `SERVICE_BLUEPRINTS.md`
   - `CLINICAL_SAFETY.md`
   - `BUSINESS_CONTINUITY.md`
3. Включить Behavioral UX requirements в design system.
4. Добавить Emotional State в проектирование user flows, но не хранить «психологический диагноз» пользователя.
5. Реализовать UX analytics events без PII.
6. Добавить triage как отдельный domain.
7. Добавить surgery/anesthesia/referral/quality как first-class domain boundaries.
8. Проверить missing physical workflows: labels, samples, equipment, printing, offline.
9. Пересмотреть DB model на поддержку Household, CarePlan, Referral, Incident, Surgery, Anesthesia, SupportCase.
10. Не реализовывать весь новый список как пустые menu items.
11. Сначала расширить contracts/data model/architecture, затем доводить vertical slices.
12. Каждый новый сложный модуль должен иметь реальный workflow, permissions, audit, tests и UI.
13. Все UX assumptions фиксировать как hypotheses и проверять исследованиями.
14. Не считать «premium design» синонимом тяжёлых 3D/анимаций. Performance и clarity приоритетны.
15. Разрешается использовать сильный визуальный дизайн, 3D, motion и интерактивность там, где они не мешают задаче.
16. Emergency, clinical documentation и payment confirmation всегда выигрывают у декоративной сложности.
17. Продолжать реализацию максимального объёма vision, если отсутствует реальный blocker.

---

# 140. PRODUCT PHILOSOPHY — FINAL

VetSvet должен давать разные ощущения разным ролям:

### Владельцу
«Здесь знают моего питомца. Мне не надо ничего объяснять заново. Я понимаю, что происходит и что делать дальше.»

### Грумеру
«Я знаю прошлый результат и могу быстро повторить или улучшить его.»

### Ветеринару
«У меня есть информация, контекст и инструменты, но система не мешает мне работать.»

### Администратору
«Я не ловлю клиентов по мессенджерам и не переношу данные руками.»

### Ассистенту
«Я вижу следующие действия и не теряю назначения.»

### Руководителю
«Я понимаю реальную работу, качество, загрузку, деньги и риски.»

### Для бренда
«VetSvet ощущается не как CRM, которую дали клиенту посмотреть, а как современный цифровой сервис вокруг питомца.»

Конечный принцип:

> **Красивый дизайн привлекает внимание.  
> Понятное взаимодействие создаёт доверие.  
> Память о питомце создаёт привязанность к продукту.  
> Хорошая операционная система создаёт качество.  
> Клиническая глубина создаёт профессиональную ценность.  
> Всё вместе создаёт VetSvet.**

---

# 141. RESEARCH / IMPLEMENTATION BASELINE

При проектировании и реализации сверяться с актуальными официальными материалами и каждый раз проверять их текущую версию.

Основные ориентиры:
- W3C Web Content Accessibility Guidelines (WCAG) 2.2.
- W3C Cognitive Accessibility guidance: error prevention, forms, consistent help, redundant entry.
- Apple Human Interface Guidelines: Design Principles, Privacy, Notifications, Machine Learning.
- GOV.UK Service Manual: structuring forms and asking only necessary questions.
- Vetmanager official current product/docs for Russian veterinary clinical, inventory, marking, fiscal and client workflows.
- ezyVet official product/docs for advanced veterinary practice, emergency/referral, clinical and automated billing workflows.
- Digitail official product/docs for treatment area, pet parent experience, AI-assisted clinical workflow.
- MoeGo official product/docs for grooming workflow and pet-parent experience.
- Gingr official product/docs for customer portal, pet report cards, capacity, packages and membership.

Competitive functionality is evidence of an existing market pattern, not proof that its UX is optimal.
VetSvet must validate its own implementation through real user and staff research.

---

# 142. V2 NORTH STAR

**VetSvet — цифровая операционная система всей жизни питомца и всей работы современной ветеринарно-груминговой организации.**

Она должна быть одновременно:
- клинически глубокой;
- коммерчески сильной;
- психологически понятной;
- красивой;
- быстрой;
- безопасной;
- масштабируемой;
- человечной;
- технологичной.

Нельзя выбирать между «красивым продуктом» и «серьёзной клинической системой».

Цель VetSvet — сделать оба слоя одним продуктом.

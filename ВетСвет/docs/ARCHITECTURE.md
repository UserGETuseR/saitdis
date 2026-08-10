# Архитектура VetSvet

## Решение

Стартуем как **модульный монолит** с жёсткими доменными границами и API-first контрактом. Это даёт одну транзакционную систему для записи, денег, истории питомца и аудита без ложной сложности микросервисов. Модули можно выделять позднее, когда появится реальная нагрузка или независимый цикл поставки.

```text
Public Web / Client PWA / Staff App / Telegram Mini App
                        │
                  Official Application API
                        │
 ┌──────────────────────┴──────────────────────────┐
 │ Core │ Client │ Booking │ Commerce │ Grooming    │
 │ Clinical │ Communication │ Operations │ Growth    │
 └──────────────────────┬──────────────────────────┘
                        │
 PostgreSQL · Redis/jobs · private object storage · transactional outbox
                        │
 providers via adapters: payment · fiscal · Telegram · SMS/email · AI
```

## Целевые приложения

| Поверхность | Назначение | Приоритет интерфейса |
| --- | --- | --- |
| `public-web` | бренд, услуги, доверие, SEO и первый вход в запись | mobile-first, быстрый, эмоционально тёплый |
| `client-web` | кабинет владельца и PWA | touch-first, предсказуемый, личный |
| `staff-web` | приём, груминг, расписание, документы, операции | desktop/tablet-first, минимум кликов |
| `api` | авторизация, доменная логика, единые контракты | безопасность, идемпотентность, аудит |
| `worker` | outbox, уведомления, интеграции, фоновые задачи | повторяемость и наблюдаемость |
| `telegram-bot` | безопасная дверь в систему | ни одного отдельного источника данных |

## Базовый стек

- TypeScript во всех клиентских и серверных приложениях.
- Next.js для SSR/SEO публичной части и PWA-клиента; отдельное staff-приложение с общими контрактами.
- PostgreSQL для предметных данных; Redis для очередей, rate limit и коротких блокировок; приватное S3-совместимое хранилище для файлов.
- Zod/OpenAPI-совместимые типизированные контракты; UUID, денежные значения в minor units, неизменяемый audit log.

Конкретные провайдеры платежей, ОФД, SMS, Telegram и файлов подключаются только через адаптеры и feature flags. Никаких «псевдо-интеграций» до появления легальных оснований, ключей и договорённостей.

## Непересекаемые домены

- **Core**: organization, location, identity, RBAC, audit, files, outbox, notifications.
- **Client**: household, owner, pet, shared caregiver, passport, care plan, privacy center.
- **Commercial**: catalog, pricing, resources, booking, waitlist, invoice, payment, fiscal.
- **Grooming**: profile, recipe, visit, report, before/after.
- **Clinical**: triage, case, encounter, diagnostics, prescriptions, hospital, referral, surgery/anesthesia.
- **Operations**: tasks, inventory, equipment, incidents, SOP and competencies.

Кросс-доменное взаимодействие идёт через application services и события outbox; UI не ходит напрямую к БД.

## Безопасность по умолчанию

- Сервер проверяет каждое разрешение и принадлежность организации/локации.
- Для сотрудников — MFA-готовая архитектура, отзыв сессий и отдельные membership/permissions, а не одна role-строка.
- Файлы закрыты и выдаются по коротким подписанным ссылкам после проверки доступа.
- Медицинские записи после финализации исправляются только через version/amendment, не тихой перезаписью.
- Каждое финансовое действие и webhook идемпотентны, аудируются и обрабатываются асинхронно.
- Каждый HTTP command получает свой уникальный `Idempotency-Key`; middleware возвращает прежний результат повтора до входа в domain service. Один ключ нельзя использовать для двух разных команд.

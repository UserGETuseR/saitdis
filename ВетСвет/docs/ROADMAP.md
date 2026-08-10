# Дорожная карта VetSvet

Фазы определяют зависимости, а не уменьшают vision. В каждой фазе выпускается хотя бы один реальный целостный путь, а не коллекция пустых экранов.

## A. Platform Foundation — в работе

- [x] Полный vision изучен и закреплён как первоисточник.
- [x] Отделён VetSvet от существующего магазина в корне.
- [x] Созданы архитектурный, data/UX и product фундамент.
- [x] Development-ядро: организация, локация, RBAC, owner и pet с tenant isolation.
- [x] Audit/outbox foundation, приватные file intents и versioned consents.
- [ ] PostgreSQL repositories, migrations, private S3 adapter, Redis queue и production auth.
- [ ] API contracts, migrations, тестовый контур и наблюдаемость.

## B. UX Foundation

- [ ] Бренд-токены, типографика, сетка, motion-принципы и дизайн-система.
- [ ] Живой публичный сайт VetSvet — быстрый, доступный, без декоративной перегрузки.
- [ ] Клиентский onboarding, emergency route, формы, статусы, пустые/error-состояния.
- [ ] Privacy-safe UX events и исследовательский loop.

## C. Revenue Core

- [x] Development-модель catalog, pricing rules, resource-aware booking и state machine записи.
- [ ] Waitlist, перенос, отмена, deposits и реальный availability read model.
- [x] Invoice/payment abstraction и consent model; реальные providers остаются закрыты feature flag до подключения.

## D. Первые реальные vertical slices

1. **Grooming Revenue Loop**: discovery → запись → депозит → приём → процедура → фото/отчёт → расчёт → rebook → timeline.
2. **Paid Consultation Loop**: структурированный запрос → оплата → назначение → специалист → ответ → история и follow-up. *(ядро реализовано, UI/API продолжаются)*
3. **Veterinary Encounter Loop**: triage → приём → клиническая запись → назначения/документы → оплата → Care Plan. *(clinical state/versioning реализованы, Care Plan впереди)*

## E–L. Полная система

Далее — коммуникации/Telegram, clinical core, advanced clinical, pharmacy/physical operations, CRM/retention, multi-location operations, intelligence и extended ecosystem. Новый домен добавляется только с реальным workflow, правами, аудитом, тестами и UI.

# ОГОНЬ ДУШИ — сайт доставки блюд на мангале

Production-ready сайт доставки для заведения «ОГОНЬ ДУШИ» (Краснодар): каталог с
категориями, корзина с весовыми и порционными товарами, оформление заказа без
регистрации, серверный расчёт цены, уведомления владельцу и защищённая
админ-панель для управления меню, заказами, доставкой, акциями и контактами.

## Стек

- **Next.js 15** (App Router) + **React 19** + **TypeScript** (strict).
- **Prisma ORM** + **SQLite** (локально) / **PostgreSQL** (production).
- **Zod** — валидация на сервере.
- Серверный расчёт цены (единственный источник правды), корзина в `localStorage`
  с синхронизацией цен через API.
- Авторизация администратора: scrypt-хеш пароля + подписанный HMAC cookie.
- Уведомления: Telegram (fetch) и Email (SMTP через адаптер).
- Онлайн-оплата: адаптер провайдера (по умолчанию выключен).
- Тесты: **Vitest** (расчёты корзины) + **Playwright** (E2E).
- Стили: собственная дизайн-система на CSS-переменных (без внешних зависимостей).

## Требования

- Node.js 20+ (проверено на Node 24).
- npm 10+.

## Установка и запуск

```bash
npm install
cp .env.example .env        # заполните переменные (см. ниже)
npm run prisma:push         # создать схему БД (SQLite: prisma/dev.db)
npm run db:seed             # заполнить меню + создать администратора
npm run dev                 # http://localhost:3000
```

Витрина: <http://localhost:3000>
Админка: <http://localhost:3000/admin>

### Данные администратора по умолчанию (только для локальной разработки)

После `db:seed` создаётся администратор `admin` / `admin12345`.
**Обязательно смените пароль перед публикацией** (см. ниже).

## Скрипты

| Команда | Назначение |
|---|---|
| `npm run dev` | Режим разработки |
| `npm run build` | Production-сборка (`prisma generate` + `next build`) |
| `npm run start` | Запуск production-сборки |
| `npm run typecheck` | Проверка типов (`tsc --noEmit`) |
| `npm run lint` | ESLint |
| `npm run test` | Unit-тесты (Vitest) |
| `npm run e2e` | E2E-тесты (Playwright) |
| `npm run prisma:push` | Синхронизировать схему с БД |
| `npm run prisma:migrate` | Миграции (для production) |
| `npm run db:seed` | Заполнить БД начальными данными |
| `npm run admin:create -- <логин> <пароль>` | Создать/обновить администратора |

## Переменные окружения

Полный список — в [`.env.example`](.env.example). Ключевые:

- `DATABASE_URL` — строка подключения (SQLite `file:./dev.db` или PostgreSQL).
- `NEXT_PUBLIC_SITE_URL` — базовый URL (canonical, sitemap, ссылки в уведомлениях).
- `AUTH_SECRET` — секрет для подписи admin-сессии (длинная случайная строка).
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — Telegram-уведомления.
- `SMTP_*`, `ORDER_NOTIFY_EMAIL` — Email-уведомления.
- `PAYMENT_*` — эквайринг (по умолчанию `PAYMENT_PROVIDER=none`).
- `MAP_*`, `NEXT_PUBLIC_MAP_*` — карта 2ГИС/встраивание.

Секреты **не** коммитятся: `.env` в `.gitignore`.

## Переключение на PostgreSQL (production)

1. В [`prisma/schema.prisma`](prisma/schema.prisma) замените
   `provider = "sqlite"` на `provider = "postgresql"`.
2. Укажите `DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public"`.
3. `npx prisma migrate dev --name init` (создаст миграции) или `prisma db push`.
4. `npm run db:seed`.

Статусы и типы хранятся строками (не Prisma enum), поэтому переключение СУБД не
требует изменения кода приложения.

## Создание администратора

```bash
npm run admin:create -- myadmin "надёжный-пароль-8+"
```

Пароль хешируется scrypt. Смена пароля — повторный запуск с тем же логином.

## Настройка Telegram

1. Создайте бота у [@BotFather](https://t.me/BotFather), получите `TELEGRAM_BOT_TOKEN`.
2. Узнайте `TELEGRAM_CHAT_ID` (напишите боту, откройте
   `https://api.telegram.org/bot<TOKEN>/getUpdates`, возьмите `chat.id`;
   для группы добавьте бота в группу).
3. Заполните переменные в `.env`, перезапустите приложение.
4. Статус подключения виден в админке → **Интеграции**.

При ошибке Telegram заказ всё равно сохраняется; статус уведомления виден в заказе,
есть кнопка «Отправить повторно».

## Настройка Email (опционально)

1. Установите пакет: `npm i nodemailer`.
2. Заполните `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`,
   `ORDER_NOTIFY_EMAIL`.
3. Email-канал станет активным (см. **Интеграции**).

## Настройка онлайн-оплаты

По умолчанию `PAYMENT_PROVIDER=none` — на витрине доступны оплата при получении и
перевод. Для подключения эквайринга:

1. Заключите договор с провайдером (ЮKassa, Тинькофф и т.п.).
2. Реализуйте методы адаптера в [`src/lib/payments/index.ts`](src/lib/payments/index.ts)
   (`init` и `verifyWebhook`) под API провайдера.
3. Задайте `PAYMENT_PROVIDER`, `PAYMENT_MERCHANT_ID`, `PAYMENT_SECRET_KEY`,
   `PAYMENT_WEBHOOK_SECRET`.
4. Webhook: `POST /api/webhooks/payment` — проверяет подпись и идемпотентен.
5. Проверьте тестовый платёж, возврат и повторную доставку webhook.

Цена и номер заказа формируются **только на сервере**; данные карт не хранятся.

## Настройка карты (2ГИС)

- Без ключа: показывается адрес и внешняя кнопка построения маршрута.
- С картой: в админке → **Настройки** укажите `URL встраиваемой карты`
  (iframe-ссылка 2ГИС/Яндекс) и `URL маршрута`.

## Как это работает

- **Расчёт веса.** Весовые товары имеют цену за базовый вес (обычно 100 г).
  Итог = `basePrice × выбранныйВес / базовыйВес`, вес округляется к шагу (100 г),
  ограничен min/max. Логика — [`src/lib/pricing.ts`](src/lib/pricing.ts) (чистые
  функции, покрыты Vitest).
- **Корзина.** Хранится в `localStorage`, при загрузке синхронизирует цены и
  наличие с сервером (`POST /api/cart/price`). Клиентская цена никогда не
  используется для заказа.
- **Доставка.** От порога (1500 ₽) — бесплатно; ниже порога или вне зоны —
  «уточнит оператор». Самовывоз — без доставки.
- **Заказ.** `POST /api/orders`: rate-limit по IP, Zod-валидация, серверный
  пересчёт, идемпотентность по `idempotencyKey`, генерация номера, снимок позиций.
- **Уведомления.** После заказа — Telegram + Email; ошибка канала не отменяет заказ.

## Загрузка фотографий

1. Админка → **Меню** → выберите товар → блок **Фото** → загрузите изображение
   (JPEG/PNG/WebP/AVIF, до 5 МБ).
2. Файлы сохраняются в `public/uploads` со случайным безопасным именем.
3. В production используйте постоянное хранилище (том/диск) или подключите
   объектное хранилище (S3), заменив [`src/lib/uploads.ts`](src/lib/uploads.ts).

## Изменение меню

- **Товар:** Меню → «Изменить» (цена, вес, состав, наличие, флаги, фото) или
  «+ Добавить товар».
- **Наличие:** кнопка «Снять с продажи» / «В наличие».
- **Скрыть/показать** в витрине: кнопка «Скрыть» / «Показать».
- **Категории:** раздел «Категории» (порядок, скрытие).
- **Позиции, требующие подтверждения** (`needsConfirmation`) скрыты из витрины и
  помечены в админке; после проверки снимите флаг и «скрыт».

## Deployment

1. Настройте PostgreSQL и заполните `.env` (production-значения, `AUTH_SECRET`).
2. `npm ci && npm run build`.
3. Примените миграции: `npx prisma migrate deploy`.
4. `npm run db:seed` (один раз) и/или создайте администратора.
5. `npm run start` за реверс-прокси (nginx) с HTTPS.
6. Обеспечьте постоянный том для `public/uploads` и SQLite (если используется).

Подходит для VPS/Node-хостинга. Для serverless нужно вынести `public/uploads` в
объектное хранилище.

## Backup и восстановление

- **SQLite:** резервная копия файла `prisma/dev.db` (останавливать сервис не
  обязательно, но желательно): `cp prisma/dev.db backups/dev-$(date +%F).db`.
- **PostgreSQL:** `pg_dump "$DATABASE_URL" > backup.sql`;
  восстановление — `psql "$DATABASE_URL" < backup.sql`.
- **Загруженные фото:** резерв каталога `public/uploads`.

## Структура

```
prisma/            schema.prisma, seed.ts
scripts/           create-admin.ts
src/
  app/
    (site)/        витрина: главная, checkout, order, legal
    admin/         админка ((protected) + login) и server actions
    api/           cart/price, orders, webhooks/payment, admin/*
  components/      cart, catalog, checkout, site, admin
  lib/             pricing, orders, settings, auth, notify, payments, …
tests/unit/        Vitest (расчёты корзины)
tests/e2e/         Playwright
docs/              CLIENT_CONFIRMATION_CHECKLIST.md
```

## Что требует подтверждения у клиента

См. [`docs/CLIENT_CONFIRMATION_CHECKLIST.md`](docs/CLIENT_CONFIRMATION_CHECKLIST.md).
Спорные позиции (телятина, баранина, перепела, скумбрия, два хачапури) по умолчанию
**не опубликованы** и ждут проверки в админке.

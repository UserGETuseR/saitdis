-- ============================================================
-- «Чайная история» · схема Supabase (Postgres)
-- Переносит локальную модель данных на сервер: профили, склад,
-- заказы, позиции заказов, смены. Готово к мультиаренде (несколько
-- чайных) через поле tenant_id — фундамент для «системы №1 в РФ».
--
-- Применение: Supabase → SQL Editor → выполнить этот файл.
-- Пароли/аутентификацию держит сам Supabase Auth (bcrypt+JWT) —
-- таблица profiles только расширяет auth.users прикладными полями.
-- ============================================================

-- ───────────────────────── Аренда (чайные) ─────────────────────────
create table if not exists tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text,
  created_at  timestamptz not null default now()
);

-- ───────────────────────── Профили ─────────────────────────
-- role: 'client' | 'master' | 'admin' | 'owner'
create table if not exists profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  tenant_id       uuid references tenants(id),
  login           text unique not null,
  name            text not null,
  email           text,
  role            text not null default 'client' check (role in ('client','master','admin','owner')),
  avatar_color    text default '#c4452f',
  -- духовный/лояльный прогресс
  stamps          int  not null default 0,
  meditation_min  int  not null default 0,
  breath_sessions int  not null default 0,
  practice_streak int  not null default 0,
  last_practice   date,
  favorite_tea    text,
  intention       text,
  philosophy      text,
  specialties     text[],
  discovered_teas text[] default '{}',
  discovered_mush text[] default '{}',
  created_at      timestamptz not null default now()
);

-- ───────────────────────── Склад ─────────────────────────
create table if not exists inventory (
  id          text not null,                       -- teaId | mushId из каталога
  tenant_id   uuid references tenants(id),
  kind        text not null check (kind in ('tea','mushroom')),
  name        text not null,
  unit        text not null,
  stock       numeric not null default 0,
  par         numeric not null default 0,
  cat         text,
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, id)
);

-- ───────────────────────── Заказы ─────────────────────────
create table if not exists orders (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id),
  user_id     uuid references profiles(id),         -- null = гость без аккаунта
  user_name   text not null default 'Гость',
  master_id   uuid references profiles(id),
  channel     text not null default 'self' check (channel in ('self','pos')),
  status      text not null default 'new' check (status in ('new','brewing','done','cancelled')),
  total       numeric not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  tea_id      text,
  mushroom_id text,
  name        text not null,
  sub         text,
  price       numeric not null default 0
);

-- ───────────────────────── Смены ─────────────────────────
create table if not exists shifts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id),
  date        date not null,
  slot        text not null check (slot in ('morning','evening')),
  user_id     uuid references profiles(id),
  user_name   text not null,
  status      text not null default 'planned' check (status in ('planned','open','closed')),
  unique (tenant_id, date, slot, user_id)
);

-- индексы под частые выборки
create index if not exists idx_orders_tenant_created on orders(tenant_id, created_at desc);
create index if not exists idx_orders_user on orders(user_id);
create index if not exists idx_shifts_tenant_date on shifts(tenant_id, date);

-- ============================================================
-- RLS (Row Level Security) — каждый видит только своё/свою чайную.
-- Включаем и описываем базовые политики. Доработать под бизнес-логику.
-- ============================================================
alter table profiles    enable row level security;
alter table orders      enable row level security;
alter table order_items enable row level security;
alter table inventory   enable row level security;
alter table shifts      enable row level security;

-- helper: текущий tenant пользователя
create or replace function current_tenant() returns uuid language sql stable as $$
  select tenant_id from profiles where id = auth.uid()
$$;

-- helper: роль пользователя
create or replace function current_role_name() returns text language sql stable as $$
  select role from profiles where id = auth.uid()
$$;

-- Профиль: свой профиль читать/править; персонал чайной видит профили своей аренды
create policy profiles_self_rw on profiles
  for all using (id = auth.uid() or tenant_id = current_tenant())
  with check (id = auth.uid() or current_role_name() in ('admin','owner'));

-- Заказы: гость видит свои; персонал — все заказы своей чайной
create policy orders_read on orders
  for select using (user_id = auth.uid() or tenant_id = current_tenant());
create policy orders_write on orders
  for all using (tenant_id = current_tenant())
  with check (tenant_id = current_tenant());

create policy order_items_rw on order_items
  for all using (exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or o.tenant_id = current_tenant())));

-- Склад/смены: только персонал своей чайной
create policy inventory_rw on inventory
  for all using (tenant_id = current_tenant())
  with check (current_role_name() in ('admin','owner'));

create policy shifts_rw on shifts
  for all using (tenant_id = current_tenant())
  with check (current_role_name() in ('admin','owner'));

-- ============================================================
-- Триггер: автосоздание профиля при регистрации в Supabase Auth.
-- login/имя берём из user_metadata, переданного при signUp.
-- ============================================================
create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, login, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'login', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'name', 'Гость'),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'client')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

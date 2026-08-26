begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists chay_branches (
  id text primary key,
  city text not null unique,
  chapter text not null,
  subtitle text not null,
  accent text not null default '#B85C2C',
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into chay_branches(id,city,chapter,subtitle,accent,position,active) values
  ('sochi','Сочи','Морской свет','Чай после солнца · первая глава сети','#B85C2C',10,true),
  ('rostov','Ростов','Тёплый ритм','Разговор, который не хочется торопить','#2E3F35',20,true),
  ('krasnodar','Краснодар','Южный сад','Спокойная щедрость большого стола','#5A7560',30,true),
  ('moscow','Москва','Тихий фокус','Пауза внутри большого города','#0E0E0E',40,true)
on conflict(id) do update set city=excluded.city,chapter=excluded.chapter,subtitle=excluded.subtitle,accent=excluded.accent,position=excluded.position,active=excluded.active,updated_at=now();

create table if not exists chay_users (
  id text primary key default gen_random_uuid()::text,
  login citext not null unique,
  name text not null,
  email citext,
  phone text not null default '',
  role text not null default 'client' check (role in ('client','master','admin','owner')),
  branch_id text references chay_branches(id),
  password_salt text not null,
  password_hash text not null,
  avatar_color text not null default '#c4452f',
  profile jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table chay_users add column if not exists phone text not null default '';
create unique index if not exists chay_users_phone_unique on chay_users(phone) where phone<>'';
alter table chay_users add column if not exists branch_id text references chay_branches(id);
update chay_users set branch_id='sochi' where branch_id is null and role<>'owner';
update chay_users set branch_id=null where role='owner';
create index if not exists chay_users_branch on chay_users(branch_id,role) where active=true;

create unique index if not exists chay_users_email_unique
  on chay_users (email) where email is not null and email <> '';

create table if not exists chay_sessions (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references chay_users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  ip_hash text,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists chay_sessions_user on chay_sessions(user_id, expires_at desc);

create table if not exists chay_messages (
  id text primary key,
  from_id text references chay_users(id) on delete set null,
  target_id text references chay_users(id) on delete set null,
  branch_id text references chay_branches(id),
  from_name text not null,
  from_role text not null,
  audience text not null check (audience in ('team','master','admin','owner','management','client')),
  subject text not null,
  body text not null,
  status text not null default 'open' check (status in ('open','resolved','archived')),
  entity_id text,
  read_by jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table chay_messages add column if not exists target_id text references chay_users(id) on delete set null;
alter table chay_messages add column if not exists branch_id text references chay_branches(id);
update chay_messages set branch_id='sochi' where branch_id is null;
create index if not exists chay_messages_created on chay_messages(created_at desc);
create index if not exists chay_messages_target on chay_messages(target_id, created_at desc);
create index if not exists chay_messages_branch on chay_messages(branch_id,created_at desc);

create table if not exists chay_staff_requests (
  id text primary key,
  type text not null,
  title text not null,
  details text not null default '',
  urgency text not null default 'normal' check (urgency in ('normal','high','critical')),
  from_id text references chay_users(id) on delete set null,
  from_name text not null,
  from_role text not null,
  branch_id text references chay_branches(id),
  assigned_role text not null check (assigned_role in ('master','admin','owner')),
  assigned_label text,
  status text not null default 'new' check (status in ('new','in_progress','done','cancelled')),
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table chay_staff_requests add column if not exists branch_id text references chay_branches(id);
update chay_staff_requests set branch_id='sochi' where branch_id is null;
create index if not exists chay_staff_requests_queue on chay_staff_requests(assigned_role, status, created_at desc);

create table if not exists chay_shift_reports (
  id text primary key,
  user_id text references chay_users(id) on delete set null,
  user_name text not null,
  role text not null,
  branch_id text references chay_branches(id),
  shift_label text not null,
  note text not null default '',
  checks jsonb not null default '{}'::jsonb,
  completed int not null default 0,
  total int not null default 0,
  status text not null default 'attention' check (status in ('attention','complete','approved')),
  approved_by text references chay_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table chay_shift_reports add column if not exists branch_id text references chay_branches(id);
update chay_shift_reports set branch_id='sochi' where branch_id is null;
create index if not exists chay_shift_reports_created on chay_shift_reports(created_at desc);

create table if not exists chay_certificates (
  id text primary key,
  buyer_id text references chay_users(id) on delete set null,
  branch_id text references chay_branches(id),
  buyer_name text not null,
  recipient_name text not null,
  phone text not null,
  amount numeric(12,2) not null check (amount > 0),
  wish text not null default '',
  code citext not null unique,
  status text not null default 'new' check (status in ('new','contacted','awaiting_payment','confirmed','issued','redeemed','cancelled')),
  contact_note text not null default '',
  status_history jsonb not null default '[]'::jsonb,
  confirmed_by text references chay_users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table chay_certificates add column if not exists contact_note text not null default '';
alter table chay_certificates add column if not exists status_history jsonb not null default '[]'::jsonb;
alter table chay_certificates add column if not exists branch_id text references chay_branches(id);
update chay_certificates set branch_id='sochi' where branch_id is null;
alter table chay_certificates drop constraint if exists chay_certificates_status_check;
alter table chay_certificates add constraint chay_certificates_status_check check (status in ('new','contacted','awaiting_payment','confirmed','issued','redeemed','cancelled'));
update chay_certificates set status_history=jsonb_build_array(jsonb_build_object('status',status,'at',extract(epoch from created_at)*1000,'by','Система')) where jsonb_array_length(status_history)=0;
create index if not exists chay_certificates_queue on chay_certificates(status, created_at desc);

create table if not exists chay_guides (
  id text primary key,
  title text not null,
  tag text not null,
  body text not null,
  position int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists chay_inventory (
  id text primary key,
  branch_id text not null default 'sochi' references chay_branches(id),
  catalog_id text not null,
  kind text not null check (kind in ('tea','mushroom','drink','supply','other')),
  name text not null,
  unit text not null,
  stock numeric(14,3) not null default 0,
  par numeric(14,3) not null default 0,
  cat text,
  updated_at timestamptz not null default now(),
  updated_by text references chay_users(id) on delete set null
);
alter table chay_inventory add column if not exists branch_id text references chay_branches(id);
alter table chay_inventory add column if not exists catalog_id text;
update chay_inventory set branch_id='sochi' where branch_id is null;
update chay_inventory set catalog_id=id where catalog_id is null;
alter table chay_inventory alter column branch_id set default 'sochi';
alter table chay_inventory alter column branch_id set not null;
alter table chay_inventory alter column catalog_id set not null;
create index if not exists chay_inventory_branch on chay_inventory(branch_id,kind,name);
create unique index if not exists chay_inventory_branch_catalog on chay_inventory(branch_id,catalog_id);

create table if not exists chay_inventory_movements (
  id text primary key,
  inventory_id text not null references chay_inventory(id) on delete restrict,
  branch_id text not null references chay_branches(id),
  catalog_id text not null,
  movement_type text not null check (movement_type in ('receipt','writeoff','sale','stocktake','correction','transfer_in','transfer_out')),
  quantity numeric(14,3) not null check (quantity <> 0),
  stock_before numeric(14,3) not null,
  stock_after numeric(14,3) not null check (stock_after >= 0),
  reason text not null default '',
  document_ref text,
  actor_id text references chay_users(id) on delete set null,
  actor_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists chay_inventory_movements_branch on chay_inventory_movements(branch_id,created_at desc);
create index if not exists chay_inventory_movements_item on chay_inventory_movements(inventory_id,created_at desc);

create table if not exists chay_publications (
  id text primary key,
  branch_id text not null references chay_branches(id),
  author_id text references chay_users(id) on delete set null,
  author_name text not null,
  title text not null,
  slug text not null unique,
  excerpt text not null default '',
  body text not null,
  cover_url text not null default '',
  kind text not null default 'news' check (kind in ('news','story','tea','event')),
  audience text not null default 'public' check (audience in ('public','team')),
  status text not null default 'draft' check (status in ('draft','review','published','archived')),
  featured boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chay_publications_public on chay_publications(status,audience,published_at desc);
create index if not exists chay_publications_branch on chay_publications(branch_id,status,updated_at desc);

create table if not exists chay_orders (
  id text primary key,
  user_id text references chay_users(id) on delete set null,
  branch_id text not null default 'sochi' references chay_branches(id),
  user_name text not null default 'Гость',
  master_id text references chay_users(id) on delete set null,
  channel text not null default 'self' check (channel in ('self','pos','certificate')),
  status text not null default 'new' check (status in ('new','brewing','done','cancelled')),
  items jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null default 0,
  fulfillment text not null default 'pickup' check (fulfillment in ('pickup','delivery')),
  contact_phone text not null default '',
  delivery_address text not null default '',
  scheduled_at timestamptz,
  notification_channel text not null default 'in_app' check (notification_channel in ('in_app','call','telegram')),
  customer_note text not null default '',
  loyalty_credited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table chay_orders add column if not exists loyalty_credited_at timestamptz;
alter table chay_orders add column if not exists fulfillment text not null default 'pickup';
alter table chay_orders add column if not exists contact_phone text not null default '';
alter table chay_orders add column if not exists delivery_address text not null default '';
alter table chay_orders add column if not exists scheduled_at timestamptz;
alter table chay_orders add column if not exists notification_channel text not null default 'in_app';
alter table chay_orders add column if not exists customer_note text not null default '';
alter table chay_orders add column if not exists branch_id text references chay_branches(id);
update chay_orders set branch_id='sochi' where branch_id is null;
alter table chay_orders alter column branch_id set default 'sochi';
alter table chay_orders alter column branch_id set not null;
create index if not exists chay_orders_queue on chay_orders(status, created_at desc);
create index if not exists chay_orders_user on chay_orders(user_id, created_at desc);
create index if not exists chay_orders_branch on chay_orders(branch_id,status,created_at desc);

create table if not exists chay_notifications (
  id text primary key default gen_random_uuid()::text,
  user_id text references chay_users(id) on delete cascade,
  branch_id text references chay_branches(id),
  phone text not null default '',
  kind text not null default 'order',
  title text not null,
  body text not null default '',
  status text not null default 'new' check (status in ('new','read')),
  channel text not null default 'in_app' check (channel in ('in_app','call','telegram')),
  entity_type text,
  entity_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists chay_notifications_user on chay_notifications(user_id,status,created_at desc);
create index if not exists chay_notifications_branch on chay_notifications(branch_id,status,created_at desc);

create table if not exists chay_loyalty_accounts (
  user_id text primary key references chay_users(id) on delete cascade,
  stamps int not null default 0 check (stamps >= 0),
  rewards int not null default 0 check (rewards >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists chay_loyalty_events (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references chay_users(id) on delete cascade,
  delta int not null check (delta <> 0),
  balance_after int not null check (balance_after >= 0),
  kind text not null check (kind in ('order','manual','redeem','migration')),
  source_key text unique,
  note text not null default '',
  actor_id text references chay_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists chay_loyalty_events_user on chay_loyalty_events(user_id, created_at desc);

create table if not exists chay_integration_outbox (
  id bigserial primary key,
  integration text not null default '1c',
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  payload jsonb not null,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chay_outbox_queue on chay_integration_outbox(integration,status,next_attempt_at);

create table if not exists chay_shifts (
  id text primary key,
  branch_id text not null default 'sochi' references chay_branches(id),
  shift_date date not null,
  slot text not null check (slot in ('morning','evening')),
  user_id text references chay_users(id) on delete cascade,
  user_name text not null,
  status text not null default 'planned' check (status in ('planned','open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(branch_id, shift_date, slot, user_id)
);
alter table chay_shifts add column if not exists branch_id text references chay_branches(id);
update chay_shifts set branch_id='sochi' where branch_id is null;
alter table chay_shifts alter column branch_id set default 'sochi';
alter table chay_shifts alter column branch_id set not null;
create index if not exists chay_shifts_branch on chay_shifts(branch_id,shift_date,slot);

create table if not exists chay_audit_log (
  id bigserial primary key,
  actor_id text references chay_users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists chay_audit_created on chay_audit_log(created_at desc);

insert into chay_guides(id,title,tag,body,position) values
  ('welcome','Первое приветствие','контакт','Поздоровайтесь глазами, дайте гостю освоиться и только затем предложите помощь. Не начинайте с продажи.',10),
  ('choice','Гость не знает, чего хочет','подбор','Спросите не о сорте, а о состоянии: хочется собраться, замедлиться, согреться или попробовать новое.',20),
  ('conversation','Сложный разговор','забота','Сначала признайте чувство гостя, затем коротко повторите проблему своими словами и предложите один понятный следующий шаг.',30),
  ('handoff','Передача смены','команда','Зафиксируйте незакрытые заказы, остатки ниже нормы, договорённости с гостями и любые происшествия.',40)
on conflict (id) do update set title=excluded.title, tag=excluded.tag, body=excluded.body, position=excluded.position, updated_at=now();

grant usage on schema public to chay_app;
grant select, insert, update, delete on all tables in schema public to chay_app;
grant usage, select on all sequences in schema public to chay_app;
alter default privileges in schema public grant select, insert, update, delete on tables to chay_app;
alter default privileges in schema public grant usage, select on sequences to chay_app;

commit;

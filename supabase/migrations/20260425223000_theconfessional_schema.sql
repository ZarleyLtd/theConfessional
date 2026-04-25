create schema if not exists "theConfessional";

create table if not exists "theConfessional".config_names (
  name text primary key
);

create table if not exists "theConfessional".product_icons (
  id bigserial primary key,
  product text not null,
  image text not null,
  unique (product, image)
);

create table if not exists "theConfessional".bills (
  bill_date date primary key,
  open boolean,
  total_paid numeric,
  image_path text,
  image_mime text,
  created_at timestamptz not null default now()
);

create table if not exists "theConfessional".bill_items (
  id bigserial primary key,
  bill_date date not null references "theConfessional".bills (bill_date) on delete cascade,
  row_index integer not null,
  category text not null default '',
  description text not null default '',
  quantity integer not null default 0,
  unit_price numeric not null default 0,
  total_price numeric not null default 0,
  unique (bill_date, row_index)
);

create index if not exists bill_items_bill_date_idx
  on "theConfessional".bill_items (bill_date, row_index);

create table if not exists "theConfessional".claims (
  id bigserial primary key,
  bill_date date not null references "theConfessional".bills (bill_date) on delete cascade,
  user_name text not null,
  row_index integer not null,
  unit_index integer not null,
  created_at timestamptz not null default now(),
  unique (bill_date, row_index, unit_index)
);

create index if not exists claims_bill_date_idx
  on "theConfessional".claims (bill_date);

create table if not exists "theConfessional".upload_jobs (
  job_id text primary key,
  analysis jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists upload_jobs_created_at_idx
  on "theConfessional".upload_jobs (created_at);

grant usage on schema "theConfessional" to anon, authenticated, service_role;
grant all on all tables in schema "theConfessional" to anon, authenticated, service_role;
grant all on all sequences in schema "theConfessional" to anon, authenticated, service_role;

alter default privileges for role postgres in schema "theConfessional"
grant all on tables to anon, authenticated, service_role;

alter default privileges for role postgres in schema "theConfessional"
grant all on sequences to anon, authenticated, service_role;

alter table "theConfessional".config_names enable row level security;
alter table "theConfessional".product_icons enable row level security;
alter table "theConfessional".bills enable row level security;
alter table "theConfessional".bill_items enable row level security;
alter table "theConfessional".claims enable row level security;
alter table "theConfessional".upload_jobs enable row level security;

create table if not exists "theConfessional".payments (
  id bigserial primary key,
  payment_date date not null,
  user_name text not null,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists payments_user_name_idx
  on "theConfessional".payments (user_name);

create index if not exists payments_payment_date_idx
  on "theConfessional".payments (payment_date);

grant all on "theConfessional".payments to anon, authenticated, service_role;
grant all on "theConfessional".payments_id_seq to anon, authenticated, service_role;

alter table "theConfessional".payments enable row level security;

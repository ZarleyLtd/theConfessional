create table if not exists "theConfessional".opening_balances (
  user_name text primary key,
  as_of_date date not null,
  balance numeric not null,
  display_order integer not null default 0
);

grant all on "theConfessional".opening_balances to anon, authenticated, service_role;

alter table "theConfessional".opening_balances enable row level security;

-- Balances as of 2025-12-18; bills from 2025-12-19 onward feed the ledger.
insert into "theConfessional".opening_balances (user_name, as_of_date, balance, display_order)
values
  ('Greg', '2025-12-18', -1.49, 1),
  ('Boc', '2025-12-18', 37.73, 2),
  ('Brian', '2025-12-18', -180.48, 3),
  ('Duggie', '2025-12-18', 78.09, 4),
  ('Barry', '2025-12-18', 7.61, 5),
  ('Berndt', '2025-12-18', 50.32, 6),
  ('Brendan', '2025-12-18', 24.59, 7),
  ('Stephan', '2025-12-18', 0.00, 8),
  ('Cormac', '2025-12-18', -1.94, 9),
  ('Tony', '2025-12-18', 0.00, 10),
  ('Gary', '2025-12-18', -8.57, 11),
  ('Ray', '2025-12-18', 0.00, 12)
on conflict (user_name) do update set
  as_of_date = excluded.as_of_date,
  balance = excluded.balance,
  display_order = excluded.display_order;

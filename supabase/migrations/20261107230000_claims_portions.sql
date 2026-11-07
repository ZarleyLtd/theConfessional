-- Allow multiple users to claim equal portions of a single unit.
-- Full claims remain portion_count = 1, portion_index = 0.

alter table "theConfessional".claims
  add column if not exists portion_count integer not null default 1,
  add column if not exists portion_index integer not null default 0;

update "theConfessional".claims
set
  portion_count = coalesce(portion_count, 1),
  portion_index = coalesce(portion_index, 0)
where portion_count is null
   or portion_index is null
   or portion_count < 1;

alter table "theConfessional".claims
  drop constraint if exists claims_bill_date_row_index_unit_index_key;

alter table "theConfessional".claims
  drop constraint if exists claims_bill_date_row_index_unit_index_portion_index_key;

alter table "theConfessional".claims
  add constraint claims_bill_date_row_index_unit_index_portion_index_key
  unique (bill_date, row_index, unit_index, portion_index);

alter table "theConfessional".claims
  drop constraint if exists claims_portion_count_check;

alter table "theConfessional".claims
  add constraint claims_portion_count_check
  check (portion_count >= 1 and portion_count <= 10);

alter table "theConfessional".claims
  drop constraint if exists claims_portion_index_check;

alter table "theConfessional".claims
  add constraint claims_portion_index_check
  check (portion_index >= 0 and portion_index < portion_count);

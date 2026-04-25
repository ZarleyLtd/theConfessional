insert into storage.buckets (id, name, public)
values ('theConfessional', 'theConfessional', false)
on conflict (id) do nothing;

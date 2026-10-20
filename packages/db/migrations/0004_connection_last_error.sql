-- Surfaces sync failures (e.g. expired login) in the UI. Written by the server only.
alter table public.connection add column last_error text;
grant select (last_error) on public.connection to authenticated;

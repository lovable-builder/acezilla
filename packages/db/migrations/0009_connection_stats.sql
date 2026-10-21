-- What a push-based connector (WooCommerce) has told us so far: plugin version, orders received/counted/skipped.
alter table connection add column if not exists stats jsonb;
grant select (stats) on connection to authenticated;

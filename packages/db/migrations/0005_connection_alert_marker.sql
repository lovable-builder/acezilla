-- Remembers the last alert emailed for a connection so the daily job does not repeat itself. Server-only.
alter table public.connection add column last_alert_kind text, add column last_alert_at timestamptz;

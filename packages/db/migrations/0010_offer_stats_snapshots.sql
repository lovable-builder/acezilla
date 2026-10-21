-- Daily snapshots of marketplace offer counters (Allegro visits and watchers are running totals, so changes are measured between days).
create table offer_stats_snapshots (
  workspace_id uuid not null references workspace on delete cascade,
  platform text not null default 'allegro',
  offer_id text not null,
  day date not null,
  name text, price numeric, visits int, watchers int,
  primary key (workspace_id, platform, offer_id, day)
);
alter table offer_stats_snapshots enable row level security;
create policy ws_member_read on offer_stats_snapshots for select to authenticated using (private.is_member(workspace_id));

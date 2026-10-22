-- Allegro Ads report rows uploaded by a person: ad cost per clicked offer for a date range.
-- Allegro's billing data has no offer on ad charges, so this is the only exact source. Read-only for members; written by the server.
create table offer_ad_report (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  workspace_id uuid not null references workspace on delete cascade,
  platform text not null default 'allegro',
  offer_id text not null,
  offer_name text,
  campaigns text,
  date_from date not null,
  date_to date not null,
  cost_gross numeric not null check (cost_gross >= 0),
  impressions int not null default 0,
  clicks int not null default 0,
  units int not null default 0,
  sales_gross numeric not null default 0,
  created_at timestamptz not null default now(),
  check (date_to >= date_from and date_to - date_from <= 400)
);
create index on offer_ad_report (workspace_id, platform, date_from, date_to);
create index on offer_ad_report (batch_id);
alter table offer_ad_report enable row level security;
create policy ws_member_read on offer_ad_report for select to authenticated using (private.is_member(workspace_id));

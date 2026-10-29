-- Competitor ads: the competitors a workspace watches (each tagged with a category) and the ads saved from them.
-- Entered by hand from the platforms' public ad libraries. Written by the server; workspace members can read them.
create table competitor (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace on delete cascade,
  name text not null,
  website text,
  category text not null default '',
  notes text,
  created_at timestamptz not null default now()
);
create index on competitor (workspace_id);
alter table competitor enable row level security;
create policy ws_member_read on competitor for select to authenticated using (private.is_member(workspace_id));

create table competitor_ad (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace on delete cascade,
  competitor_id uuid not null references competitor on delete cascade,
  platform text not null default 'meta',
  link text,
  started_on date,
  ended_on date,
  still_running boolean not null default true,
  variants int not null default 1 check (variants >= 1),
  angle text not null default 'other',
  headline text,
  notes text,
  image_path text,
  created_at timestamptz not null default now()
);
create index on competitor_ad (workspace_id);
create index on competitor_ad (competitor_id);
alter table competitor_ad enable row level security;
create policy ws_member_read on competitor_ad for select to authenticated using (private.is_member(workspace_id));

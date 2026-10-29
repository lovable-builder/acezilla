-- Google Search Console: the websites a workspace chose and the words people searched on Google (last 28 days, best 1000 per site).
-- Written by the server; workspace members can read them. Deleting a site (or disconnecting) removes its words.
create table search_site (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace on delete cascade,
  connection_id uuid not null references connection on delete cascade,
  external_id text not null,
  name text not null,
  unique (workspace_id, external_id)
);
alter table search_site enable row level security;
create policy ws_member_read on search_site for select to authenticated using (private.is_member(workspace_id));

create table search_query (
  workspace_id uuid not null references workspace on delete cascade,
  site_id uuid not null references search_site on delete cascade,
  query text not null,
  clicks bigint not null default 0,
  impressions bigint not null default 0,
  position numeric not null default 0,
  period_start date not null,
  period_end date not null,
  primary key (site_id, query)
);
alter table search_query enable row level security;
create policy ws_member_read on search_query for select to authenticated using (private.is_member(workspace_id));

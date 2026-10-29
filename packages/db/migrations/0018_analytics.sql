-- Google Analytics 4: the properties a workspace chose, and their daily traffic per channel.
-- Written by the server; workspace members can read them. Deleting a property removes its daily rows.
create table analytics_property (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace on delete cascade,
  connection_id uuid not null references connection on delete cascade,
  external_id text not null,
  name text not null,
  currency text,
  unique (workspace_id, external_id)
);
alter table analytics_property enable row level security;
create policy ws_member_read on analytics_property for select to authenticated using (private.is_member(workspace_id));

create table analytics_daily (
  workspace_id uuid not null references workspace on delete cascade,
  property_id uuid not null references analytics_property on delete cascade,
  date date not null,
  channel text not null,
  sessions bigint not null default 0,
  conversions numeric not null default 0,
  revenue numeric not null default 0,
  primary key (property_id, date, channel)
);
alter table analytics_daily enable row level security;
create policy ws_member_read on analytics_daily for select to authenticated using (private.is_member(workspace_id));

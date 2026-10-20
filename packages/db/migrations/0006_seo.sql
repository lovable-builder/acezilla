-- SEO audit service. Workspace members can read their own data; audits are written by the server (service role).
-- The only client-side write is marking a drafted fix done/dismissed.

create table seo_site (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace on delete cascade,
  url text not null, host text not null, name text,
  monitoring boolean not null default true,
  last_audit_at timestamptz, created_at timestamptz not null default now(),
  unique (workspace_id, host)
);
create table seo_audit (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references seo_site on delete cascade,
  workspace_id uuid not null references workspace on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  trigger text not null default 'manual' check (trigger in ('manual','weekly')),
  scores jsonb, summary text, pages_crawled int, error text,
  started_at timestamptz, finished_at timestamptz, created_at timestamptz not null default now()
);
create table seo_page (
  id bigint generated always as identity primary key,
  audit_id uuid not null references seo_audit on delete cascade,
  workspace_id uuid not null references workspace on delete cascade,
  url text not null, data jsonb not null
);
create table seo_finding (
  id bigint generated always as identity primary key,
  audit_id uuid not null references seo_audit on delete cascade,
  workspace_id uuid not null references workspace on delete cascade,
  dimension text not null check (dimension in ('seo','geo','aeo')),
  grp text not null, signal text not null, finding text not null,
  status text not null check (status in ('good','attention','missing','not_measured')),
  weight int not null, page_url text, fix_kind text
);
create table seo_fix (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references seo_audit on delete cascade,
  workspace_id uuid not null references workspace on delete cascade,
  kind text not null, page_url text, signal text, current text, proposed text not null, rationale text,
  status text not null default 'pending' check (status in ('pending','done','dismissed')),
  created_at timestamptz not null default now()
);

create index on seo_site (workspace_id);
create index on seo_audit (site_id, created_at desc);
create index on seo_audit (workspace_id);
create index on seo_page (audit_id);       create index on seo_page (workspace_id);
create index on seo_finding (audit_id);    create index on seo_finding (workspace_id);
create index on seo_fix (audit_id);        create index on seo_fix (workspace_id);

do $$ declare t text; begin
  foreach t in array array['seo_site','seo_audit','seo_page','seo_finding','seo_fix'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy ws_member_read on public.%I for select to authenticated using (private.is_member(workspace_id))', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Members with a buying role may mark a fix done or dismissed (status only).
grant update (status) on seo_fix to authenticated;
create policy writer_update_status on seo_fix for update to authenticated
  using (private.can_write(workspace_id)) with check (private.can_write(workspace_id));

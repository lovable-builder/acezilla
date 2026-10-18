-- acezilla core schema. Every tenant table carries workspace_id and is protected by RLS.
-- Reads: workspace members (authenticated). Writes: service role (worker/server), except approval decisions.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table org (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table workspace (id uuid primary key default gen_random_uuid(), org_id uuid not null references org on delete cascade, name text not null, currency text not null default 'USD', created_at timestamptz not null default now());
create table org_member (org_id uuid not null references org on delete cascade, user_id uuid not null references auth.users on delete cascade, role text not null check (role in ('owner','admin','buyer','client')), primary key (org_id, user_id));

create table connection (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, platform text not null, scopes text[] not null default '{}', token_secret_id uuid, status text not null default 'active', last_sync_at timestamptz);
create table ad_account (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, connection_id uuid references connection on delete cascade, platform text not null, external_id text not null, name text, currency text, unique (workspace_id, platform, external_id));

create table campaign (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, ad_account_id uuid not null references ad_account on delete cascade, platform text not null, external_id text not null, name text, objective text, status text, daily_budget numeric, raw jsonb, unique (workspace_id, platform, external_id));
create table ad_group (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, campaign_id uuid not null references campaign on delete cascade, platform text not null, external_id text not null, name text, status text, raw jsonb, unique (workspace_id, platform, external_id));
create table creative (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, platform text not null, external_id text not null, kind text, thumb_url text, raw jsonb, unique (workspace_id, platform, external_id));
create table ad (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, ad_group_id uuid not null references ad_group on delete cascade, creative_id uuid references creative on delete set null, platform text not null, external_id text not null, name text, status text, raw jsonb, unique (workspace_id, platform, external_id));

-- Unpartitioned for now (partition by month once volume warrants it).
create table insight_daily (
  workspace_id uuid not null references workspace on delete cascade, ad_id uuid not null references ad on delete cascade, date date not null,
  spend numeric not null default 0, impressions bigint not null default 0, clicks bigint not null default 0, conversions numeric not null default 0, revenue numeric not null default 0,
  video_p25 bigint, video_p50 bigint, video_p75 bigint, video_p100 bigint,
  primary key (ad_id, date)
);

create table "order" (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, external_id text not null, created_at timestamptz not null, revenue numeric not null, customer_id text, utm jsonb, click_ids jsonb, unique (workspace_id, external_id));

create table plan (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, name text not null, created_at timestamptz not null default now());
create table flight (id uuid primary key default gen_random_uuid(), plan_id uuid not null references plan on delete cascade, workspace_id uuid not null references workspace on delete cascade, name text, starts_on date, ends_on date, platforms text[]);
create table budget_allocation (id uuid primary key default gen_random_uuid(), plan_id uuid not null references plan on delete cascade, workspace_id uuid not null references workspace on delete cascade, platform text not null, amount numeric not null);

create table rule (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, name text not null, scope text, condition jsonb not null, action jsonb not null, enabled boolean not null default true);
create table rule_run (id uuid primary key default gen_random_uuid(), rule_id uuid not null references rule on delete cascade, workspace_id uuid not null references workspace on delete cascade, ran_at timestamptz not null default now(), matched int not null default 0);

create table suggestion (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, source text not null check (source in ('rule','copilot','anomaly','builder')), payload jsonb not null, impact numeric, confidence numeric, created_at timestamptz not null default now());
create table approval (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, suggestion_id uuid not null references suggestion on delete cascade, approver uuid references auth.users on delete set null, status text not null default 'pending' check (status in ('pending','approved','rejected')), reason text, decided_at timestamptz, pushed_at timestamptz, idempotency_key text unique);
create table audit_log (id bigint generated always as identity primary key, workspace_id uuid not null references workspace on delete cascade, actor uuid, action text not null, detail jsonb, ok boolean, at timestamptz not null default now());

-- FK / tenant indexes
create index on workspace (org_id);
create index on org_member (user_id);
create index on connection (workspace_id);
create index on ad_account (workspace_id);   create index on ad_account (connection_id);
create index on campaign (workspace_id);     create index on campaign (ad_account_id);
create index on ad_group (workspace_id);     create index on ad_group (campaign_id);
create index on creative (workspace_id);
create index on ad (workspace_id);           create index on ad (ad_group_id);  create index on ad (creative_id);
create index on insight_daily (workspace_id, date);
create index on "order" (workspace_id, created_at);
create index on plan (workspace_id);
create index on flight (plan_id);            create index on flight (workspace_id);
create index on budget_allocation (plan_id); create index on budget_allocation (workspace_id);
create index on rule (workspace_id);
create index on rule_run (rule_id);          create index on rule_run (workspace_id);
create index on suggestion (workspace_id, created_at);
create index on approval (workspace_id, status); create index on approval (suggestion_id); create index on approval (approver);
create index on audit_log (workspace_id, at);

-- Membership helpers live in a non-exposed schema (SECURITY DEFINER avoids RLS recursion on org_member).
create function private.is_org_member(o uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_member m where m.org_id = o and m.user_id = (select auth.uid()));
$$;
create function private.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace w join public.org_member m on m.org_id = w.org_id
                 where w.id = ws and m.user_id = (select auth.uid()));
$$;
revoke all on function private.is_org_member(uuid), private.is_member(uuid) from public, anon;
grant execute on function private.is_org_member(uuid), private.is_member(uuid) to authenticated;

-- RLS: enable everywhere; members can read their workspace's rows.
do $$ declare t text; begin
  foreach t in array array['connection','ad_account','campaign','ad_group','creative','ad','insight_daily','order','plan','flight','budget_allocation','rule','rule_run','suggestion','approval','audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy ws_member_read on public.%I for select to authenticated using (private.is_member(workspace_id))', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

alter table org enable row level security;
alter table workspace enable row level security;
alter table org_member enable row level security;
create policy org_read on org for select to authenticated using (private.is_org_member(id));
create policy workspace_read on workspace for select to authenticated using (private.is_org_member(org_id));
create policy member_read on org_member for select to authenticated using (private.is_org_member(org_id));
grant select on org, workspace, org_member to authenticated;

-- Approval decisions: members may only set decision columns, and must record themselves as approver.
-- The push itself (pushed_at) is service-role only.
revoke update on approval from authenticated;
grant update (status, reason, decided_at, approver) on approval to authenticated;
create policy approval_decide on approval for update to authenticated
  using (private.is_member(workspace_id))
  with check (private.is_member(workspace_id) and approver = (select auth.uid()));

-- Sign-up bootstrap: each new user gets an org, a first workspace and owner membership.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o uuid;
begin
  insert into public.org (name) values (coalesce(split_part(new.email, '@', 1), 'My') || '''s agency') returning id into o;
  insert into public.org_member (org_id, user_id, role) values (o, new.id, 'owner');
  insert into public.workspace (org_id, name) values (o, 'My store');
  return new;
end $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

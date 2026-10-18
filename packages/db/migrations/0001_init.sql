-- acezilla core schema. Every tenant table carries workspace_id and is protected by RLS.

create table org (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz default now());
create table workspace (id uuid primary key default gen_random_uuid(), org_id uuid not null references org on delete cascade, name text not null, currency text not null default 'USD', created_at timestamptz default now());
create table org_member (org_id uuid references org on delete cascade, user_id uuid references auth.users on delete cascade, role text not null check (role in ('owner','admin','buyer','client')), primary key (org_id, user_id));

create table connection (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, platform text not null, scopes text[] not null default '{}', token_secret_id uuid, status text not null default 'active', last_sync_at timestamptz);
create table ad_account (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, connection_id uuid references connection on delete cascade, platform text not null, external_id text not null, name text, currency text, unique (platform, external_id));

create table campaign (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, ad_account_id uuid not null references ad_account on delete cascade, platform text not null, external_id text not null, name text, objective text, status text, daily_budget numeric, raw jsonb, unique (platform, external_id));
create table ad_group (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, campaign_id uuid not null references campaign on delete cascade, platform text not null, external_id text not null, name text, status text, raw jsonb, unique (platform, external_id));
create table creative (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, platform text not null, external_id text not null, kind text, thumb_url text, raw jsonb, unique (platform, external_id));
create table ad (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, ad_group_id uuid not null references ad_group on delete cascade, creative_id uuid references creative, platform text not null, external_id text not null, name text, status text, raw jsonb, unique (platform, external_id));

create table insight_daily (
  workspace_id uuid not null references workspace on delete cascade, ad_id uuid not null references ad on delete cascade, date date not null,
  spend numeric not null default 0, impressions bigint not null default 0, clicks bigint not null default 0, conversions numeric not null default 0, revenue numeric not null default 0,
  video_p25 bigint, video_p50 bigint, video_p75 bigint, video_p100 bigint,
  primary key (ad_id, date)
) partition by range (date);
create table insight_daily_default partition of insight_daily default;

create table "order" (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, external_id text not null, created_at timestamptz not null, revenue numeric not null, customer_id text, utm jsonb, click_ids jsonb, unique (workspace_id, external_id));

create table plan (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, name text not null, created_at timestamptz default now());
create table flight (id uuid primary key default gen_random_uuid(), plan_id uuid not null references plan on delete cascade, workspace_id uuid not null references workspace on delete cascade, name text, starts_on date, ends_on date, platforms text[]);
create table budget_allocation (id uuid primary key default gen_random_uuid(), plan_id uuid not null references plan on delete cascade, workspace_id uuid not null references workspace on delete cascade, platform text not null, amount numeric not null);

create table rule (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, name text not null, scope text, condition jsonb not null, action jsonb not null, enabled boolean not null default true);
create table rule_run (id uuid primary key default gen_random_uuid(), rule_id uuid not null references rule on delete cascade, workspace_id uuid not null references workspace on delete cascade, ran_at timestamptz default now(), matched int not null default 0);

create table suggestion (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, source text not null check (source in ('rule','copilot','anomaly','builder')), payload jsonb not null, impact numeric, confidence numeric, created_at timestamptz default now());
create table approval (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspace on delete cascade, suggestion_id uuid not null references suggestion on delete cascade, approver uuid references auth.users, status text not null default 'pending' check (status in ('pending','approved','rejected')), reason text, decided_at timestamptz, pushed_at timestamptz, idempotency_key text unique);
create table audit_log (id bigint generated always as identity primary key, workspace_id uuid not null references workspace on delete cascade, actor uuid, action text not null, detail jsonb, ok boolean, at timestamptz default now());

-- RLS: a user sees a workspace's rows only if they belong to its org.
create function is_member(ws uuid) returns boolean language sql stable security definer as $$
  select exists (select 1 from workspace w join org_member m on m.org_id = w.org_id where w.id = ws and m.user_id = auth.uid());
$$;

do $$ declare t text; begin
  foreach t in array array['connection','ad_account','campaign','ad_group','creative','ad','insight_daily','order','plan','flight','budget_allocation','rule','rule_run','suggestion','approval','audit_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy ws_member on %I for select using (is_member(workspace_id))', t);
  end loop;
end $$;

-- Writes: members may decide approvals; everything else is written by the service role (worker/server).
create policy approval_decide on approval for update using (is_member(workspace_id)) with check (is_member(workspace_id));
alter table org enable row level security;
alter table workspace enable row level security;
alter table org_member enable row level security;
create policy org_read on org for select using (exists (select 1 from org_member m where m.org_id = id and m.user_id = auth.uid()));
create policy ws_read on workspace for select using (is_member(id));
create policy member_read on org_member for select using (user_id = auth.uid());

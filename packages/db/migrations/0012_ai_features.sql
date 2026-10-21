-- AI features: a per-workspace daily usage cap, cached weekly summaries, and campaign drafts (suggest-only: nothing is sent to an ad platform).
create table ai_usage (
  workspace_id uuid not null references workspace on delete cascade,
  day date not null default current_date,
  kind text not null,
  count int not null default 0,
  primary key (workspace_id, day, kind)
);
alter table ai_usage enable row level security;
revoke all on ai_usage from anon, authenticated;

-- Atomically counts one use and says whether it is still within today's limit.
create function ai_usage_bump(p_ws uuid, p_kind text, p_limit int) returns boolean
language plpgsql security invoker set search_path = public as $$
declare c int;
begin
  insert into ai_usage (workspace_id, day, kind, count) values (p_ws, current_date, p_kind, 1)
  on conflict (workspace_id, day, kind) do update set count = ai_usage.count + 1 where ai_usage.count < p_limit
  returning count into c;
  return c is not null;
end $$;
revoke all on function ai_usage_bump(uuid, text, int) from public, anon, authenticated;

create table ai_summary (
  workspace_id uuid not null references workspace on delete cascade,
  kind text not null default 'weekly',
  day date not null default current_date,
  content jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, kind, day)
);
alter table ai_summary enable row level security;
create policy ws_member_read on ai_summary for select to authenticated using (private.is_member(workspace_id));

create table campaign_draft (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace on delete cascade,
  created_by uuid,
  platform text not null check (platform in ('meta','google','tiktok')),
  title text not null,
  brief jsonb not null,
  output jsonb not null,
  status text not null default 'draft' check (status in ('draft','approved')),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index on campaign_draft (workspace_id, created_at desc);
alter table campaign_draft enable row level security;
create policy ws_member_read on campaign_draft for select to authenticated using (private.is_member(workspace_id));

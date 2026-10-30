-- Strategy map: the plan a workspace chose (goal, stage, margin, budget, channels, budget shares) and the steps and weekly
-- tasks it has ticked off. Written by the server; workspace members can read them. margin stays null until the person saves it.
create table strategy_plan (
  workspace_id uuid primary key references workspace on delete cascade,
  goal text not null default 'sales',
  stage text not null default 'growing',
  margin numeric,
  cushion numeric not null default 0.2,
  aov numeric,
  budget numeric not null default 0,
  nodes text[] not null default '{}',
  shares jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table strategy_plan enable row level security;
create policy ws_member_read on strategy_plan for select to authenticated using (private.is_member(workspace_id));

create table strategy_step (
  workspace_id uuid not null references workspace on delete cascade,
  key text not null,
  done_at timestamptz not null default now(),
  primary key (workspace_id, key)
);
alter table strategy_step enable row level security;
create policy ws_member_read on strategy_step for select to authenticated using (private.is_member(workspace_id));

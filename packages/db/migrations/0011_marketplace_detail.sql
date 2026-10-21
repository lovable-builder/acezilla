-- Marketplace (Allegro) detail behind per-offer profit: order lines, per-offer fees, the seller's cost of goods, and the VAT setting.
-- Written by the server (sync and settings actions); members can read their own workspace's rows.
create table order_line (
  workspace_id uuid not null references workspace on delete cascade,
  platform text not null,
  line_key text not null,
  order_id text not null,
  offer_id text not null,
  name text,
  qty int not null,
  unit_price numeric not null,
  bought_at timestamptz not null,
  primary key (workspace_id, platform, line_key)
);
create index on order_line (workspace_id, platform, bought_at);

create table marketplace_fee (
  workspace_id uuid not null references workspace on delete cascade,
  platform text not null,
  entry_id text not null,
  occurred_at timestamptz not null,
  type_name text,
  category text not null check (category in ('commission','ads','delivery','fulfillment','other')),
  offer_id text,
  amount numeric not null,
  primary key (workspace_id, platform, entry_id)
);
create index on marketplace_fee (workspace_id, platform, occurred_at);

create table offer_cost (
  workspace_id uuid not null references workspace on delete cascade,
  platform text not null,
  offer_id text not null,
  unit_cost numeric not null check (unit_cost >= 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, platform, offer_id)
);

create table marketplace_setting (
  workspace_id uuid primary key references workspace on delete cascade,
  vat_rate numeric not null default 0 check (vat_rate >= 0 and vat_rate <= 0.5),
  updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['order_line','marketplace_fee','offer_cost','marketplace_setting'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy ws_member_read on public.%I for select to authenticated using (private.is_member(workspace_id))', t);
  end loop;
end $$;

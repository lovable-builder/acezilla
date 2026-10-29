-- Google Merchant Center: the accounts a workspace chose, each product's approval status in Google Shopping,
-- and daily clicks and impressions for free listings and ads. Written by the server; workspace members can read them.
-- Deleting an account (or disconnecting) removes its products and daily rows.
create table merchant_account (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace on delete cascade,
  connection_id uuid not null references connection on delete cascade,
  external_id text not null,
  name text not null,
  currency text,
  unique (workspace_id, external_id)
);
alter table merchant_account enable row level security;
create policy ws_member_read on merchant_account for select to authenticated using (private.is_member(workspace_id));

create table merchant_product (
  workspace_id uuid not null references workspace on delete cascade,
  account_id uuid not null references merchant_account on delete cascade,
  product_id text not null,
  offer_id text not null default '',
  title text not null default '',
  status text not null default 'unknown',
  click_potential text not null default '',
  issues jsonb not null default '[]',
  primary key (account_id, product_id)
);
alter table merchant_product enable row level security;
create policy ws_member_read on merchant_product for select to authenticated using (private.is_member(workspace_id));

create table merchant_daily (
  workspace_id uuid not null references workspace on delete cascade,
  account_id uuid not null references merchant_account on delete cascade,
  date date not null,
  source text not null check (source in ('free','ads')),
  clicks bigint not null default 0,
  impressions bigint not null default 0,
  conversions numeric not null default 0,
  conversion_value numeric not null default 0,
  primary key (account_id, date, source)
);
alter table merchant_daily enable row level security;
create policy ws_member_read on merchant_daily for select to authenticated using (private.is_member(workspace_id));

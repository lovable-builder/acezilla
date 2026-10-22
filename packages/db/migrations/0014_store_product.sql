-- The product catalogue of a connected store (WooCommerce), pushed by the plugin. Includes products that never sold.
-- Written by the server; workspace members can read it.
create table store_product (
  workspace_id uuid not null references workspace on delete cascade,
  platform text not null,
  external_id text not null,
  name text not null,
  sku text,
  price numeric,
  status text not null default 'publish',
  stock_status text,
  product_type text,
  total_sales int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, platform, external_id)
);
alter table store_product enable row level security;
create policy ws_member_read on store_product for select to authenticated using (private.is_member(workspace_id));

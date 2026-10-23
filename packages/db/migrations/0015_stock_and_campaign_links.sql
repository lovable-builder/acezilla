-- Stock levels (WooCommerce products, Allegro offers) and the link between an ad campaign and the product it sells.
-- A link is a person's answer; without one, the app suggests a match from names. Members read, the server writes.
alter table store_product add column stock_qty int;
alter table offer_stats_snapshots add column stock int;
create table campaign_product (
  workspace_id uuid not null references workspace on delete cascade,
  campaign_id uuid not null,
  product_channel text not null,
  product_id text not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, campaign_id)
);
alter table campaign_product enable row level security;
create policy ws_member_read on campaign_product for select to authenticated using (private.is_member(workspace_id));

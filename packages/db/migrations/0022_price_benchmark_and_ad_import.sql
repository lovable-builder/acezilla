-- Google's benchmark price per product (what other merchants charge for the same item), read from Merchant Center.
-- Written by the server; workspace members can read it. Removed with its account.
create table merchant_price (
  workspace_id uuid not null references workspace on delete cascade,
  account_id uuid not null references merchant_account on delete cascade,
  product_id text not null,
  offer_id text not null default '',
  title text not null default '',
  brand text not null default '',
  price numeric not null,
  benchmark numeric not null,
  currency text not null default '',
  primary key (account_id, product_id)
);
alter table merchant_price enable row level security;
create policy ws_member_read on merchant_price for select to authenticated using (private.is_member(workspace_id));

-- Ads imported from a public ad library keep the library's key, so importing again updates the same row.
alter table competitor_ad add column external_id text;
create unique index competitor_ad_external_key on competitor_ad (competitor_id, external_id) where external_id is not null;

-- All of a listing's photos (main first), so a campaign draft can use any of them. A JSON array of https addresses.
alter table store_product add column images jsonb;
alter table offer_stats_snapshots add column images jsonb;

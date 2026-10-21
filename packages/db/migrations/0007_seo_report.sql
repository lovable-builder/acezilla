-- Extra per-audit analysis (keywords, broken links), saved next to the scores.
alter table seo_audit add column if not exists report jsonb;

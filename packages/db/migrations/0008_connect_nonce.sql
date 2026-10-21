-- One-time tokens for connections that finish with a server-to-server callback (WooCommerce).
-- Only the hash of the token is stored. Server-only: no policies, so the browser can never read or write it.
create table connect_nonce (
  token_hash text primary key,
  workspace_id uuid not null references workspace on delete cascade,
  platform text not null,
  store_url text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on connect_nonce (workspace_id);
alter table connect_nonce enable row level security;
revoke all on connect_nonce from anon, authenticated;

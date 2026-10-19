alter table public.connection
  add column token_enc text,
  add column external_user_id text,
  add column token_expires_at timestamptz;

-- Tokens are written and read by the server (service role) only; the browser client can never select them.
revoke select on public.connection from authenticated;
grant select (id, workspace_id, platform, scopes, status, last_sync_at, external_user_id, token_expires_at)
  on public.connection to authenticated;

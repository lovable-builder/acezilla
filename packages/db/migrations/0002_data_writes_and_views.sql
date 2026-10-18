-- Phase 1: members with a buying role may load data (demo/CSV) into their own workspace.
-- Real platform connections, suggestions, approvals and audit_log stay server-only.

create function private.can_write(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace w join public.org_member m on m.org_id = w.org_id
                 where w.id = ws and m.user_id = (select auth.uid()) and m.role in ('owner','admin','buyer'));
$$;
revoke all on function private.can_write(uuid) from public, anon;
grant execute on function private.can_write(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['ad_account','campaign','ad_group','creative','ad','insight_daily','order']
  loop
    execute format('create policy writer_insert on public.%I for insert to authenticated with check (private.can_write(workspace_id))', t);
    execute format('create policy writer_update on public.%I for update to authenticated using (private.can_write(workspace_id)) with check (private.can_write(workspace_id))', t);
    execute format('create policy writer_delete on public.%I for delete to authenticated using (private.can_write(workspace_id))', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Only mock/csv connections are client-writable; OAuth platforms are written by the server.
create policy writer_insert_local on connection for insert to authenticated
  with check (private.can_write(workspace_id) and platform in ('mock','csv'));
create policy writer_update_local on connection for update to authenticated
  using (private.can_write(workspace_id) and platform in ('mock','csv'))
  with check (private.can_write(workspace_id) and platform in ('mock','csv'));
create policy writer_delete_local on connection for delete to authenticated
  using (private.can_write(workspace_id) and platform in ('mock','csv'));
grant insert, update, delete on connection to authenticated;

-- Dashboard rollup (security_invoker so RLS of the caller applies).
create view campaign_daily with (security_invoker = true) as
select i.workspace_id, c.id as campaign_id, c.name as campaign_name, c.platform, c.status, c.objective, i.date,
       sum(i.spend) as spend, sum(i.impressions) as impressions, sum(i.clicks) as clicks,
       sum(i.conversions) as conversions, sum(i.revenue) as revenue
from public.insight_daily i
join public.ad a on a.id = i.ad_id
join public.ad_group g on g.id = a.ad_group_id
join public.campaign c on c.id = g.campaign_id
group by i.workspace_id, c.id, c.name, c.platform, c.status, c.objective, i.date;
grant select on campaign_daily to authenticated;

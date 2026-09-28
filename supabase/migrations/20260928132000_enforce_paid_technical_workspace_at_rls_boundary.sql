-- Enforce paid technical workspace features at the database/RLS boundary.
-- Frontend badges and routing remain UX; RLS is the actual authorization layer.

create or replace function public.marc_has_paid_feature(p_feature text, p_user uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
  v_plan text;
begin
  if v_uid is null or p_user is null or p_user <> v_uid then return false; end if;
  if public.marc_is_master(v_uid) then return true; end if;
  v_plan := public.marc_effective_plan(v_uid);
  return v_plan in ('coder','premium');
end
$function$;

revoke execute on function public.marc_has_paid_feature(text,uuid) from public,anon;
grant execute on function public.marc_has_paid_feature(text,uuid) to authenticated;

create or replace function public.marc_effective_plan(p_user uuid)
returns text
language plpgsql
stable
set search_path=''
as $function$
begin
  if auth.uid() is null then return 'free'; end if;
  if p_user is null or p_user <> auth.uid() then
    if public.marc_is_master(auth.uid()) then
      return private.marc_effective_plan_impl(p_user);
    end if;
    return 'free';
  end if;
  return private.marc_effective_plan_impl(auth.uid());
end
$function$;

revoke execute on function public.marc_effective_plan(uuid) from public,anon;
grant execute on function public.marc_effective_plan(uuid) to authenticated;

drop policy if exists marc_assets_owner_select on public.marc_assets;
drop policy if exists marc_assets_owner_or_master_select on public.marc_assets;
drop policy if exists marc_assets_owner_insert on public.marc_assets;
drop policy if exists marc_assets_owner_update on public.marc_assets;
drop policy if exists marc_assets_owner_delete on public.marc_assets;

create policy marc_assets_paid_select on public.marc_assets
for select to authenticated
using (user_id=auth.uid() and public.marc_has_paid_feature('assets',auth.uid()));
create policy marc_assets_paid_insert on public.marc_assets
for insert to authenticated
with check (user_id=auth.uid() and public.marc_has_paid_feature('assets',auth.uid()));
create policy marc_assets_paid_update on public.marc_assets
for update to authenticated
using (user_id=auth.uid() and public.marc_has_paid_feature('assets',auth.uid()))
with check (user_id=auth.uid() and public.marc_has_paid_feature('assets',auth.uid()));
create policy marc_assets_paid_delete on public.marc_assets
for delete to authenticated
using (user_id=auth.uid() and public.marc_has_paid_feature('assets',auth.uid()));

drop policy if exists service_orders_owner_all on public.marc_service_orders;
create policy service_orders_paid_all on public.marc_service_orders
for all to authenticated
using (user_id=auth.uid() and public.marc_has_paid_feature('service_orders',auth.uid()))
with check (user_id=auth.uid() and public.marc_has_paid_feature('service_orders',auth.uid()));

drop policy if exists maintenance_plans_owner_all on public.marc_maintenance_plans;
create policy maintenance_plans_paid_all on public.marc_maintenance_plans
for all to authenticated
using (user_id=auth.uid() and public.marc_has_paid_feature('maintenance',auth.uid()))
with check (user_id=auth.uid() and public.marc_has_paid_feature('maintenance',auth.uid()));

drop policy if exists maintenance_occurrences_owner_all on public.marc_maintenance_occurrences;
create policy maintenance_occurrences_paid_all on public.marc_maintenance_occurrences
for all to authenticated
using (user_id=auth.uid() and public.marc_has_paid_feature('maintenance',auth.uid()))
with check (user_id=auth.uid() and public.marc_has_paid_feature('maintenance',auth.uid()));

drop policy if exists marc_contracts_owner_all on public.marc_contracts;
create policy marc_contracts_paid_all on public.marc_contracts
for all to authenticated
using (user_id=auth.uid() and public.marc_has_paid_feature('contracts',auth.uid()))
with check (user_id=auth.uid() and public.marc_has_paid_feature('contracts',auth.uid()));

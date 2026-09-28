-- Align the server-enforced Free inventory limit with the product rule and
-- harden remaining SECURITY DEFINER search paths.

update public.marc_saas_plans
set inventory_items=50, updated_at=now()
where code='free';

alter function public.marc_cash_open(numeric,text) set search_path='';
alter function public.marc_cash_open(numeric,text,text) set search_path='';
alter function public.marc_request_plan_upgrade(text,text) set search_path='';
alter function public.marc_enforce_saas_limits() set search_path='';

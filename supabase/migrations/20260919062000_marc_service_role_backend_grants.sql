-- Backend grants for M.A.R.C. Worker using Supabase secret key.
-- The secret key maps to service_role and is used only inside the Cloudflare Worker.
-- RLS remains enabled for user-facing authenticated access.

grant all on table
  public.marc_accounts,
  public.marc_clients,
  public.marc_inventory,
  public.marc_inventory_movements,
  public.marc_quotes,
  public.marc_quote_items,
  public.marc_conversations,
  public.marc_messages,
  public.marc_integrations,
  public.marc_trials,
  public.marc_usage_counters,
  public.marc_audit_log
to service_role;

grant select on table
  public.marc_subscriptions,
  public.marc_user_roles
to service_role;

grant all on table
  public.marc_channel_identities,
  public.marc_link_tokens
to service_role;

grant execute on function public.marc_adjust_inventory(uuid,text,numeric,text,text) to service_role;
grant execute on function public.marc_save_quote(uuid,uuid,text,text,boolean,numeric,text,jsonb,text) to service_role;

-- M.A.R.C. core permissions
-- RLS remains the authorization boundary: authenticated users only receive rows
-- belonging to auth.uid(). These grants only make the exposed Data API usable.

revoke all on table
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
  public.marc_payment_events,
  public.marc_audit_log
from public, anon;

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
  public.marc_usage_counters
to authenticated;

grant select on table public.marc_subscriptions to authenticated;
grant insert on table public.marc_audit_log to authenticated;

alter table public.marc_accounts enable row level security;
alter table public.marc_clients enable row level security;
alter table public.marc_inventory enable row level security;
alter table public.marc_inventory_movements enable row level security;
alter table public.marc_quotes enable row level security;
alter table public.marc_quote_items enable row level security;
alter table public.marc_conversations enable row level security;
alter table public.marc_messages enable row level security;
alter table public.marc_integrations enable row level security;
alter table public.marc_trials enable row level security;
alter table public.marc_subscriptions enable row level security;
alter table public.marc_usage_counters enable row level security;
alter table public.marc_payment_events enable row level security;
alter table public.marc_audit_log enable row level security;

-- Restore the minimum direct table privileges required by the cash staff UI.
-- RLS policies remain the authorization boundary; only authenticated users receive access.
revoke all on table public.marc_cash_staff from anon;
grant select, insert, update on table public.marc_cash_staff to authenticated;

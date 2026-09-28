-- Enforce paid-module entitlements at the database boundary.
-- Frontend visibility is UX only; RLS is the authorization boundary.

-- Technical agenda
drop policy if exists appointments_owner_all on public.marc_appointments;
create policy appointments_paid_all
on public.marc_appointments
for all to authenticated
using (
  user_id = auth.uid()
  and public.marc_has_paid_feature('agenda', auth.uid())
)
with check (
  user_id = auth.uid()
  and public.marc_has_paid_feature('agenda', auth.uid())
);

-- Technical reports
drop policy if exists technical_reports_owner_all on public.technical_reports;
drop policy if exists technical_reports_owner_select on public.technical_reports;
drop policy if exists technical_reports_owner_insert on public.technical_reports;
drop policy if exists technical_reports_owner_update on public.technical_reports;
drop policy if exists technical_reports_owner_delete on public.technical_reports;
create policy technical_reports_paid_all
on public.technical_reports
for all to authenticated
using (
  user_id = auth.uid()
  and public.marc_has_paid_feature('technical_reports', auth.uid())
)
with check (
  user_id = auth.uid()
  and public.marc_has_paid_feature('technical_reports', auth.uid())
);

-- Business workspace
drop policy if exists suppliers_owner_all on public.marc_suppliers;
drop policy if exists marc_suppliers_owner_all on public.marc_suppliers;
create policy marc_suppliers_paid_all
on public.marc_suppliers
for all to authenticated
using (
  user_id = auth.uid()
  and public.marc_has_paid_feature('suppliers', auth.uid())
)
with check (
  user_id = auth.uid()
  and public.marc_has_paid_feature('suppliers', auth.uid())
);

drop policy if exists purchases_owner_all on public.marc_purchases;
drop policy if exists marc_purchases_owner_all on public.marc_purchases;
create policy marc_purchases_paid_all
on public.marc_purchases
for all to authenticated
using (
  user_id = auth.uid()
  and public.marc_has_paid_feature('purchases', auth.uid())
)
with check (
  user_id = auth.uid()
  and public.marc_has_paid_feature('purchases', auth.uid())
);

drop policy if exists receivables_owner_all on public.marc_receivables;
drop policy if exists marc_receivables_owner_all on public.marc_receivables;
create policy marc_receivables_paid_all
on public.marc_receivables
for all to authenticated
using (
  user_id = auth.uid()
  and public.marc_has_paid_feature('receivables', auth.uid())
)
with check (
  user_id = auth.uid()
  and public.marc_has_paid_feature('receivables', auth.uid())
);

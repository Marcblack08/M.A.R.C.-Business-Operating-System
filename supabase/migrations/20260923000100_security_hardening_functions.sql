-- Security hardening: pin function search paths and restrict RPC execution.
-- Safe for existing data; no table data is modified.

alter function public.set_servicios_updated_at()
  set search_path = pg_catalog;

alter function public.touch_technical_reports_updated_at()
  set search_path = pg_catalog;

create or replace function public.marc_cash_open(
  p_opening_amount numeric default 0,
  p_notes text default null
)
returns public.marc_cash_registers
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  r public.marc_cash_registers;
begin
  if p_opening_amount < 0 then
    raise exception 'El monto inicial no puede ser negativo';
  end if;

  if exists (
    select 1
    from public.marc_cash_registers
    where user_id = (select auth.uid())
      and status = 'OPEN'
  ) then
    raise exception 'Ya existe una caja abierta';
  end if;

  insert into public.marc_cash_registers(
    user_id, opening_amount, expected_amount, notes
  )
  values(
    (select auth.uid()),
    coalesce(p_opening_amount,0),
    coalesce(p_opening_amount,0),
    p_notes
  )
  returning * into r;

  return r;
end
$function$;

create or replace function public.marc_cash_close(
  p_closing_amount numeric,
  p_notes text default null
)
returns public.marc_cash_registers
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  r public.marc_cash_registers;
  expected numeric(14,2);
begin
  if p_closing_amount < 0 then
    raise exception 'El efectivo contado no puede ser negativo';
  end if;

  select *
    into r
    from public.marc_cash_registers
   where user_id = (select auth.uid())
     and status = 'OPEN'
   order by opened_at desc
   limit 1
   for update;

  if r.id is null then
    raise exception 'No hay una caja abierta';
  end if;

  select
    r.opening_amount +
    coalesce(sum(
      case when type = 'INCOME' then amount else -amount end
    ),0)
    into expected
    from public.marc_cash_movements
   where cash_register_id = r.id
     and user_id = (select auth.uid());

  update public.marc_cash_registers
     set status = 'CLOSED',
         expected_amount = expected,
         closing_amount = p_closing_amount,
         difference = p_closing_amount - expected,
         closed_at = now(),
         notes = coalesce(p_notes,notes),
         updated_at = now()
   where id = r.id
   returning * into r;

  return r;
end
$function$;

revoke execute on function public.marc_cash_open(numeric,text) from public;
revoke execute on function public.marc_cash_close(numeric,text) from public;
grant execute on function public.marc_cash_open(numeric,text) to authenticated;
grant execute on function public.marc_cash_close(numeric,text) to authenticated;
grant execute on function public.marc_cash_open(numeric,text) to service_role;
grant execute on function public.marc_cash_close(numeric,text) to service_role;

-- This RPC intentionally remains SECURITY DEFINER because it atomically
-- decrements inventory and records the cash movement after checking the caller.
alter function public.marc_register_product_sale(
  uuid, uuid, numeric, numeric, text, text, text
) set search_path = '';

revoke execute on function public.marc_register_product_sale(
  uuid, uuid, numeric, numeric, text, text, text
) from public;
revoke execute on function public.marc_register_product_sale(
  uuid, uuid, numeric, numeric, text, text, text
) from anon;
grant execute on function public.marc_register_product_sale(
  uuid, uuid, numeric, numeric, text, text, text
) to authenticated;

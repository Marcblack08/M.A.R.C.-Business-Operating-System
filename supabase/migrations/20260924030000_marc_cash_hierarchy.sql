-- Hierarchical cash opening types for M.A.R.C.
-- Existing cash registers remain compatible and default to FULL.

alter table public.marc_cash_registers
  add column if not exists cash_type text not null default 'FULL';

alter table public.marc_cash_registers
  drop constraint if exists marc_cash_registers_cash_type_check;

alter table public.marc_cash_registers
  add constraint marc_cash_registers_cash_type_check
  check (cash_type in ('FULL','SALES'));

create or replace function public.marc_cash_open(
  p_opening_amount numeric default 0,
  p_notes text default null,
  p_cash_type text default 'FULL'
)
returns public.marc_cash_registers
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_existing public.marc_cash_registers;
  v_row public.marc_cash_registers;
  v_type text := upper(trim(coalesce(p_cash_type,'FULL')));
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if v_type not in ('FULL','SALES') then raise exception 'Tipo de caja no válido'; end if;

  select owner_user_id into v_owner_id
  from public.marc_cash_staff
  where auth_user_id=v_uid and active=true
  limit 1;

  if v_owner_id is null then
    if exists (
      select 1 from public.marc_user_roles
      where user_id=v_uid and role='MASTER' and active=true
    ) then
      v_owner_id := v_uid;
    else
      raise exception 'No tienes un acceso de caja activo';
    end if;
  end if;

  if p_opening_amount is null or p_opening_amount < 0 then
    raise exception 'El efectivo inicial no puede ser negativo';
  end if;

  perform pg_advisory_xact_lock(hashtext('marc_cash_open:' || v_owner_id::text));

  select * into v_existing
  from public.marc_cash_registers
  where user_id=v_owner_id and status='OPEN'
  order by opened_at desc
  limit 1 for update;

  if v_existing.id is not null then
    raise exception 'Ya existe una caja abierta';
  end if;

  insert into public.marc_cash_registers(
    user_id,status,cash_type,opening_amount,expected_amount,opened_by,notes
  ) values (
    v_owner_id,'OPEN',v_type,round(p_opening_amount,2),round(p_opening_amount,2),v_uid,
    nullif(trim(coalesce(p_notes,'')),'')
  ) returning * into v_row;

  return v_row;
end
$function$;

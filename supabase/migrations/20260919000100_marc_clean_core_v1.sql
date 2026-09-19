-- M.A.R.C. clean core v1 (applied in Supabase)
-- See project migration history for the applied DDL.


-- Agent inventory operation: atomic stock movement under RLS.
create or replace function public.marc_adjust_inventory(
  p_inventory_id uuid,
  p_type text,
  p_quantity numeric,
  p_reason text default null,
  p_reference text default null
) returns public.marc_inventory
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_row public.marc_inventory;
  v_before numeric;
  v_after numeric;
  v_movement numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_quantity <= 0 then raise exception 'La cantidad debe ser mayor que 0'; end if;
  if p_type not in ('ENTRADA','SALIDA','AJUSTE') then raise exception 'Tipo de movimiento inválido'; end if;
  select * into v_row from public.marc_inventory where id=p_inventory_id and user_id=auth.uid() for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  v_before:=v_row.stock;
  if p_type='ENTRADA' then v_after:=v_before+p_quantity; v_movement:=p_quantity;
  elsif p_type='SALIDA' then v_after:=v_before-p_quantity; if v_after<0 then raise exception 'Stock insuficiente'; end if; v_movement:=p_quantity;
  else v_after:=p_quantity; v_movement:=abs(v_after-v_before);
  end if;
  update public.marc_inventory set stock=v_after,updated_at=now() where id=p_inventory_id and user_id=auth.uid() returning * into v_row;
  insert into public.marc_inventory_movements(user_id,inventory_id,type,quantity,stock_before,stock_after,reason,reference)
  values(auth.uid(),p_inventory_id,p_type,greatest(v_movement,0),v_before,v_after,p_reason,p_reference);
  return v_row;
end;
$$;
revoke all on function public.marc_adjust_inventory(uuid,text,numeric,text,text) from public, anon;
grant execute on function public.marc_adjust_inventory(uuid,text,numeric,text,text) to authenticated;

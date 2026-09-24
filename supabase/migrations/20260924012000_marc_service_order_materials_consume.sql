alter table public.marc_service_orders add column if not exists materials_consumed boolean not null default false;

create or replace function public.marc_consume_service_order_materials(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_consumed boolean;
  r record;
begin
  if v_user is null then raise exception 'No autenticado'; end if;
  select materials_consumed into v_consumed
  from public.marc_service_orders
  where id=p_order_id and user_id=v_user
  for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if v_consumed then return jsonb_build_object('ok',true,'already_consumed',true); end if;

  for r in
    select inventory_id, name, quantity
    from public.marc_service_order_materials
    where service_order_id=p_order_id and user_id=v_user and inventory_id is not null
  loop
    if not exists (select 1 from public.marc_inventory where id=r.inventory_id and user_id=v_user and active=true) then
      raise exception 'Producto de inventario no encontrado: %', r.name;
    end if;
    update public.marc_inventory
      set stock=greatest(0,coalesce(stock,0)-r.quantity)
      where id=r.inventory_id and user_id=v_user and active=true and coalesce(stock,0)>=r.quantity;
    if not found then raise exception 'Stock insuficiente para: %', r.name; end if;
  end loop;

  update public.marc_service_orders set materials_consumed=true, updated_at=now() where id=p_order_id and user_id=v_user;
  return jsonb_build_object('ok',true,'already_consumed',false);
end;
$$;

revoke all on function public.marc_consume_service_order_materials(uuid) from public;
grant execute on function public.marc_consume_service_order_materials(uuid) to authenticated;
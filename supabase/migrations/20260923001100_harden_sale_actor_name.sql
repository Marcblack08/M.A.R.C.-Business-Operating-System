-- Harden product-sale actor attribution.
-- The caller-provided p_created_by_name is intentionally ignored.
-- The RPC derives the actor name from the authenticated user/staff record.

create or replace function public.marc_register_product_sale(
  p_cash_register_id uuid, p_product_id uuid, p_quantity numeric, p_amount numeric,
  p_concept text, p_reference text, p_created_by_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_stock numeric;
  v_movement uuid;
  v_actor_name text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select r.user_id into v_owner
    from public.marc_cash_registers r
   where r.id = p_cash_register_id and r.status = 'OPEN'
   for update;

  if v_owner is null then raise exception 'La caja no está abierta'; end if;

  if not (
    v_owner = v_uid or exists (
      select 1 from public.marc_cash_staff s
       where s.owner_user_id = v_owner and s.auth_user_id = v_uid and s.active = true
    )
  ) then raise exception 'Sin autorización para esta caja'; end if;

  if p_quantity is null or p_quantity <= 0 or p_amount is null or p_amount <= 0 then
    raise exception 'Cantidad y monto deben ser mayores que cero';
  end if;

  select i.stock into v_stock
    from public.marc_inventory i
   where i.id = p_product_id and i.user_id = v_owner and i.active = true
   for update;

  if not found then raise exception 'Producto no encontrado'; end if;
  if coalesce(v_stock,0) < p_quantity then
    raise exception 'Stock insuficiente. Disponible: %', coalesce(v_stock,0);
  end if;

  select coalesce(
    nullif(trim(s.display_name),''),
    nullif(trim(u.raw_user_meta_data->>'full_name'),''),
    nullif(trim(u.raw_user_meta_data->>'name'),''),
    nullif(trim(u.email),''),
    'Usuario'
  )
    into v_actor_name
    from auth.users u
    left join public.marc_cash_staff s
      on s.auth_user_id = u.id
     and s.owner_user_id = v_owner
     and s.active = true
   where u.id = v_uid
   limit 1;

  v_actor_name := left(coalesce(v_actor_name,'Usuario'),120);

  update public.marc_inventory
     set stock = coalesce(stock,0) - p_quantity, updated_at = now()
   where id = p_product_id and user_id = v_owner;

  insert into public.marc_cash_movements(
    user_id,cash_register_id,type,amount,concept,reference,created_by,created_by_name,product_id,product_quantity
  ) values (
    v_owner,p_cash_register_id,'INCOME',p_amount,p_concept,nullif(p_reference,''),
    v_uid,v_actor_name,p_product_id,p_quantity
  ) returning id into v_movement;

  return v_movement;
end;
$function$;

revoke execute on function public.marc_register_product_sale(uuid,uuid,numeric,numeric,text,text,text) from public, anon;
grant execute on function public.marc_register_product_sale(uuid,uuid,numeric,numeric,text,text,text) to authenticated;

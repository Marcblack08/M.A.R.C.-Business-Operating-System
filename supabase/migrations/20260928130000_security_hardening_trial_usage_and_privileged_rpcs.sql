-- Security hardening: prevent client-side trial/usage tampering and close public execution of privileged RPCs.

drop policy if exists marc_trials_self on public.marc_trials;
create policy marc_trials_select_own
on public.marc_trials for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists marc_usage_self on public.marc_usage_counters;
create policy marc_usage_select_own
on public.marc_usage_counters for select to authenticated
using ((select auth.uid()) = user_id);

revoke execute on function public.marc_can_use_feature(uuid,text) from public, anon;
grant execute on function public.marc_can_use_feature(uuid,text) to authenticated;

revoke execute on function public.marc_cash_open(numeric,text,text) from public, anon;
grant execute on function public.marc_cash_open(numeric,text,text) to authenticated;

revoke execute on function public.marc_create_sale(text,uuid,numeric,text,text,jsonb) from public, anon;
grant execute on function public.marc_create_sale(text,uuid,numeric,text,text,jsonb) to authenticated;

revoke execute on function public.marc_request_plan_upgrade(text,text) from public, anon;
grant execute on function public.marc_request_plan_upgrade(text,text) to authenticated;

create or replace function public.marc_can_use_feature(p_user uuid, p_feature text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_feature text := lower(trim(coalesce(p_feature,'')));
  v_ok boolean := false;
begin
  if v_uid is null or p_user is null or p_user <> v_uid then return false; end if;
  v_plan := public.marc_effective_plan(v_uid);
  if v_plan='master' then return true; end if;
  if v_feature='white_label' then
    select white_label into v_ok from public.marc_saas_plans where code=v_plan;
  elsif v_feature='digital_signature' then
    select digital_signature into v_ok from public.marc_saas_plans where code=v_plan;
  elsif v_feature='portal_client' then
    select portal_client into v_ok from public.marc_saas_plans where code=v_plan;
  elsif v_feature='multi_user' then
    select multi_user into v_ok from public.marc_saas_plans where code=v_plan;
  elsif v_feature='api_access' then
    select api_access into v_ok from public.marc_saas_plans where code=v_plan;
  else
    v_ok := false;
  end if;
  return coalesce(v_ok,false);
end
$function$;

create or replace function public.marc_create_sale(
  p_number text, p_client_id uuid, p_discount numeric, p_payment_method text,
  p_notes text, p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_sale uuid;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  item jsonb;
  v_product uuid;
  v_qty numeric;
  v_stock numeric;
  v_price numeric;
  v_cost numeric;
  v_name text;
begin
  if v_user is null then raise exception 'No autenticado'; end if;
  if p_client_id is not null and not exists (
    select 1 from public.marc_clients where id=p_client_id and user_id=v_user
  ) then raise exception 'Cliente no válido'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'La venta no tiene productos';
  end if;
  for item in select * from jsonb_array_elements(p_items) loop
    v_product := nullif(item->>'inventory_id','')::uuid;
    v_qty := greatest(coalesce((item->>'quantity')::numeric,0),0);
    if v_qty<=0 then raise exception 'Cantidad inválida'; end if;
    select name,stock,price,cost into v_name,v_stock,v_price,v_cost
    from public.marc_inventory where id=v_product and user_id=v_user and active=true for update;
    if not found then raise exception 'Producto no encontrado'; end if;
    if v_stock < v_qty then raise exception 'Stock insuficiente para %',v_name; end if;
    v_subtotal := v_subtotal + (v_qty * coalesce(v_price,0));
  end loop;
  v_total := greatest(v_subtotal - greatest(coalesce(p_discount,0),0),0);
  insert into public.marc_sales(user_id,number,client_id,subtotal,discount,total,payment_method,status,notes)
  values(v_user,p_number,p_client_id,v_subtotal,greatest(coalesce(p_discount,0),0),v_total,
         coalesce(nullif(p_payment_method,''),'EFECTIVO'),'COMPLETADA',p_notes)
  returning id into v_sale;
  for item in select * from jsonb_array_elements(p_items) loop
    v_product := nullif(item->>'inventory_id','')::uuid;
    v_qty := (item->>'quantity')::numeric;
    select name,price,cost,stock into v_name,v_price,v_cost,v_stock
    from public.marc_inventory where id=v_product and user_id=v_user for update;
    insert into public.marc_sale_items(user_id,sale_id,inventory_id,name,quantity,unit_price,unit_cost)
    values(v_user,v_sale,v_product,v_name,v_qty,coalesce(v_price,0),coalesce(v_cost,0));
    update public.marc_inventory set stock=stock-v_qty,updated_at=now()
    where id=v_product and user_id=v_user;
    insert into public.movimientos_inventario(
      user_id,producto_id,tipo,cantidad,stock_anterior,stock_nuevo,motivo,referencia
    ) values(v_user,v_product,'SALIDA',v_qty,v_stock,v_stock-v_qty,'Venta',p_number);
  end loop;
  if upper(coalesce(p_payment_method,''))='CREDITO' then
    insert into public.marc_receivables(
      user_id,sale_id,client_id,description,total,paid,due_at,status
    ) values(v_user,v_sale,p_client_id,'Venta '||p_number,v_total,0,now()+interval '30 days','PENDIENTE');
  end if;
  return v_sale;
end
$function$;

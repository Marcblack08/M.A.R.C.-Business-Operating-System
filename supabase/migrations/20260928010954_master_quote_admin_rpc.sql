-- M.A.R.C. MASTER: secure direct editing of an existing quote.
create or replace function public.marc_master_update_quote(
  p_quote_id uuid,
  p_client_id uuid default null,
  p_title text default 'Cotización',
  p_status text default 'BORRADOR',
  p_tax_enabled boolean default false,
  p_tax_rate numeric default 18,
  p_notes text default null,
  p_items jsonb default '[]'::jsonb
)
returns public.marc_quotes
language plpgsql
security invoker
set search_path = public, pg_catalog
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner_uid uuid;
  v_quote public.marc_quotes;
  v_old_status text;
  v_sub numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_cost_total numeric := 0;
  v_profit numeric := 0;
  v_profit_margin numeric := 0;
  v_item jsonb;
  v_type text;
  v_inventory_id uuid;
  v_name text;
  v_quantity numeric;
  v_unit text;
  v_unit_price numeric;
  v_material_cost numeric;
  v_transport_cost numeric;
  v_labor_cost numeric;
  v_other_cost numeric;
  v_inventory_cost numeric;
  v_material_provider text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not public.marc_is_master(v_uid) then raise exception 'MARC_MASTER_REQUIRED'; end if;
  if p_quote_id is null then raise exception 'Cotización requerida'; end if;
  if p_status not in ('BORRADOR','ENVIADA','ACEPTADA','RECHAZADA','ANULADA','COBRADA') then raise exception 'Estado de cotización inválido'; end if;
  if p_tax_rate < 0 or p_tax_rate > 100 then raise exception 'Porcentaje de IGV inválido'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'La cotización necesita al menos una partida'; end if;

  select user_id,status into v_owner_uid,v_old_status
  from public.marc_quotes
  where id=p_quote_id
  for update;

  if not found then raise exception 'Cotización no encontrada'; end if;
  if v_old_status in ('COBRADA','ANULADA') and p_status <> v_old_status then
    raise exception 'Una cotización % no puede cambiar de estado',v_old_status;
  end if;
  if v_old_status='ACEPTADA' and p_status='BORRADOR' then
    raise exception 'Una cotización aceptada no puede volver a borrador';
  end if;

  if p_client_id is not null and not exists (
    select 1 from public.marc_clients c
    where c.id=p_client_id and c.user_id=v_owner_uid
  ) then raise exception 'Cliente no válido'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_type := upper(coalesce(v_item->>'item_type',v_item->>'type','TRABAJO'));
    if v_type not in ('PRODUCTO','TRABAJO') then raise exception 'Tipo de partida inválido'; end if;
    v_inventory_id := nullif(v_item->>'inventory_id','')::uuid;
    v_quantity := coalesce((v_item->>'quantity')::numeric,1);
    if v_quantity <= 0 then raise exception 'La cantidad debe ser mayor que 0'; end if;
    v_unit_price := coalesce((v_item->>'unit_price')::numeric,0);
    v_material_provider := upper(coalesce(v_item->>'material_provider',case when v_type='PRODUCTO' then 'MARC' else 'CLIENT' end));
    if v_material_provider not in ('MARC','CLIENT','MIXTO') then raise exception 'Proveedor de material inválido'; end if;
    v_transport_cost := greatest(0,coalesce((v_item->>'transport_cost')::numeric,0));
    v_labor_cost := greatest(0,coalesce((v_item->>'labor_cost')::numeric,0));
    v_other_cost := greatest(0,coalesce((v_item->>'other_cost')::numeric,0));

    if v_type='PRODUCTO' then
      if v_inventory_id is null then raise exception 'Cada producto necesita inventory_id'; end if;
      select name,unit,price,cost into v_name,v_unit,v_unit_price,v_inventory_cost
      from public.marc_inventory
      where id=v_inventory_id and user_id=v_owner_uid and active=true;
      if not found then raise exception 'Producto de inventario no válido'; end if;
      if v_material_provider='CLIENT' then v_material_cost:=0;
      elsif v_material_provider='MIXTO' then v_material_cost:=greatest(0,coalesce((v_item->>'cost')::numeric,v_inventory_cost,0));
      else v_material_cost:=greatest(0,coalesce(v_inventory_cost,0)); end if;
    else
      v_name := nullif(trim(v_item->>'name'),'');
      if v_name is null or v_unit_price <= 0 then raise exception 'Trabajo inválido: necesita nombre y precio'; end if;
      v_unit := coalesce(v_item->>'unit','UND');
      v_material_cost := case when v_material_provider='CLIENT' then 0 else greatest(0,coalesce((v_item->>'cost')::numeric,0)) end;
    end if;

    v_sub := v_sub + v_quantity*v_unit_price;
    v_cost_total := v_cost_total + v_quantity*v_material_cost + v_transport_cost + v_labor_cost + v_other_cost;
  end loop;

  v_tax := case when p_tax_enabled then round(v_sub*p_tax_rate/100,2) else 0 end;
  v_total := v_sub+v_tax;
  v_profit := v_sub-v_cost_total;
  v_profit_margin := case when v_sub>0 then round((v_profit/v_sub)*100,2) else 0 end;

  update public.marc_quotes
  set client_id=p_client_id,
      title=coalesce(nullif(trim(p_title),''),'Cotización'),
      status=p_status,
      tax_enabled=p_tax_enabled,
      tax_rate=p_tax_rate,
      subtotal=v_sub,
      tax=v_tax,
      total=v_total,
      cost_total=v_cost_total,
      profit=v_profit,
      profit_margin=v_profit_margin,
      notes=p_notes,
      updated_at=now()
  where id=p_quote_id and user_id=v_owner_uid
  returning * into v_quote;

  if v_quote.id is null then raise exception 'No se pudo actualizar la cotización'; end if;

  delete from public.marc_quote_items where quote_id=v_quote.id and user_id=v_owner_uid;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_type := upper(coalesce(v_item->>'item_type',v_item->>'type','TRABAJO'));
    v_inventory_id := nullif(v_item->>'inventory_id','')::uuid;
    v_quantity := coalesce((v_item->>'quantity')::numeric,1);
    v_unit := coalesce(v_item->>'unit','UND');
    v_unit_price := coalesce((v_item->>'unit_price')::numeric,0);
    v_material_provider := upper(coalesce(v_item->>'material_provider',case when v_type='PRODUCTO' then 'MARC' else 'CLIENT' end));
    v_transport_cost := greatest(0,coalesce((v_item->>'transport_cost')::numeric,0));
    v_labor_cost := greatest(0,coalesce((v_item->>'labor_cost')::numeric,0));
    v_other_cost := greatest(0,coalesce((v_item->>'other_cost')::numeric,0));

    if v_type='PRODUCTO' then
      select name,unit,price,cost into v_name,v_unit,v_unit_price,v_inventory_cost
      from public.marc_inventory where id=v_inventory_id and user_id=v_owner_uid and active=true;
      if v_material_provider='CLIENT' then v_material_cost:=0;
      elsif v_material_provider='MIXTO' then v_material_cost:=greatest(0,coalesce((v_item->>'cost')::numeric,v_inventory_cost,0));
      else v_material_cost:=greatest(0,coalesce(v_inventory_cost,0)); end if;
    else
      v_name:=nullif(trim(v_item->>'name'),'');
      v_material_cost:=case when v_material_provider='CLIENT' then 0 else greatest(0,coalesce((v_item->>'cost')::numeric,0)) end;
    end if;

    insert into public.marc_quote_items(
      quote_id,user_id,inventory_id,item_type,name,description,quantity,unit,unit_price,cost,line_total,
      material_provider,transport_cost,labor_cost,other_cost
    ) values (
      v_quote.id,v_owner_uid,v_inventory_id,v_type,v_name,
      nullif(v_item->>'description',''),v_quantity,v_unit,v_unit_price,v_material_cost,v_quantity*v_unit_price,
      v_material_provider,v_transport_cost,v_labor_cost,v_other_cost
    );
  end loop;

  insert into public.marc_audit_log(user_id,entity_type,entity_id,action,source,metadata)
  values(v_uid,'QUOTE',v_quote.id,'MASTER_UPDATE','WEB',
    jsonb_build_object('owner_user_id',v_owner_uid,'number',v_quote.number,'total',v_total));

  return v_quote;
end;
$function$;

revoke all on function public.marc_master_update_quote(uuid,uuid,text,text,boolean,numeric,text,jsonb) from public, anon;
grant execute on function public.marc_master_update_quote(uuid,uuid,text,text,boolean,numeric,text,jsonb) to authenticated;

drop policy if exists "marc_quotes_self" on public.marc_quotes;
create policy "marc_quotes_owner_or_master"
on public.marc_quotes for all to authenticated
using ((select auth.uid())=user_id or public.marc_is_master((select auth.uid())))
with check ((select auth.uid())=user_id or public.marc_is_master((select auth.uid())));

drop policy if exists "marc_quote_items_self" on public.marc_quote_items;
create policy "marc_quote_items_owner_or_master"
on public.marc_quote_items for all to authenticated
using ((select auth.uid())=user_id or public.marc_is_master((select auth.uid())))
with check ((select auth.uid())=user_id or public.marc_is_master((select auth.uid())));

drop policy if exists "marc_clients_self" on public.marc_clients;
create policy "marc_clients_owner_or_master"
on public.marc_clients for all to authenticated
using ((select auth.uid())=user_id or public.marc_is_master((select auth.uid())))
with check ((select auth.uid())=user_id or public.marc_is_master((select auth.uid())));

drop policy if exists "marc_inventory_self" on public.marc_inventory;
create policy "marc_inventory_owner_or_master"
on public.marc_inventory for all to authenticated
using ((select auth.uid())=user_id or public.marc_is_master((select auth.uid())))
with check ((select auth.uid())=user_id or public.marc_is_master((select auth.uid())));

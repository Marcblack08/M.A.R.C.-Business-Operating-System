
create or replace function public.marc_import_inventory_batch(
  p_items jsonb,
  p_update_existing boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  uid uuid := auth.uid();
  item jsonb;
  v_name text;
  v_sku text;
  v_brand text;
  v_model text;
  v_category text;
  v_unit text;
  v_cost numeric;
  v_price numeric;
  v_stock numeric;
  v_min_stock numeric;
  v_id uuid;
  was_inactive boolean;
  created_count integer := 0;
  updated_count integer := 0;
  reactivated_count integer := 0;
  processed_count integer := 0;
  seen text[] := '{}';
  item_key text;
begin
  if uid is null then raise exception 'No autenticado'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'p_items debe ser un arreglo JSON'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'No hay productos para importar'; end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'La importación supera el máximo de 500 productos por lote'; end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    v_name := nullif(trim(item->>'name'), '');
    if v_name is null then continue; end if;

    v_sku := nullif(trim(item->>'sku'), '');
    v_brand := nullif(trim(item->>'brand'), '');
    v_model := nullif(trim(item->>'model'), '');
    v_category := nullif(trim(item->>'category'), '');
    v_unit := coalesce(nullif(trim(item->>'unit'), ''), 'UND');

    begin
      v_cost := case when coalesce(trim(item->>'cost'),'') ~ '^-?[0-9]+([.,][0-9]+)?$'
        then replace(trim(item->>'cost'), ',', '.')::numeric else 0 end;
    exception when others then v_cost := 0; end;

    begin
      v_price := case when coalesce(trim(item->>'price'),'') ~ '^-?[0-9]+([.,][0-9]+)?$'
        then replace(trim(item->>'price'), ',', '.')::numeric else 0 end;
    exception when others then v_price := 0; end;

    begin
      v_stock := case when coalesce(trim(item->>'stock'),'') ~ '^-?[0-9]+([.,][0-9]+)?$'
        then replace(trim(item->>'stock'), ',', '.')::numeric else 0 end;
    exception when others then v_stock := 0; end;

    begin
      v_min_stock := case when coalesce(trim(item->>'min_stock'),'') ~ '^-?[0-9]+([.,][0-9]+)?$'
        then replace(trim(item->>'min_stock'), ',', '.')::numeric else 0 end;
    exception when others then v_min_stock := 0; end;

    item_key := lower(coalesce(v_sku,'') || '|' || v_name || '|' || coalesce(v_brand,'') || '|' || coalesce(v_model,''));
    if item_key = any(seen) then continue; end if;
    seen := array_append(seen, item_key);

    v_id := null;

    if p_update_existing then
      if v_sku is not null then
        select id, active into v_id, was_inactive
        from public.marc_inventory
        where user_id = uid
          and lower(coalesce(sku,'')) = lower(v_sku)
          and lower(name) = lower(v_name)
          and coalesce(lower(brand),'') = coalesce(lower(v_brand),'')
          and coalesce(lower(model),'') = coalesce(lower(v_model),'')
        order by created_at
        limit 1;
      else
        select id, active into v_id, was_inactive
        from public.marc_inventory
        where user_id = uid
          and lower(name) = lower(v_name)
          and coalesce(lower(brand),'') = coalesce(lower(v_brand),'')
          and coalesce(lower(model),'') = coalesce(lower(v_model),'')
          and sku is null
        order by created_at
        limit 1;
      end if;
    end if;

    if v_id is not null then
      update public.marc_inventory
      set sku=v_sku,name=v_name,brand=v_brand,model=v_model,category=v_category,
          unit=v_unit,cost=v_cost,price=v_price,active=true,updated_at=now()
      where id=v_id and user_id=uid;

      updated_count := updated_count + 1;
      if was_inactive = false then
        -- Existing active product: normal update.
        null;
      else
        reactivated_count := reactivated_count + 1;
      end if;
    else
      insert into public.marc_inventory(
        user_id,sku,name,brand,model,category,unit,cost,price,stock,min_stock,active,created_at,updated_at
      )
      values(
        uid,v_sku,v_name,v_brand,v_model,v_category,v_unit,v_cost,v_price,v_stock,v_min_stock,true,now(),now()
      );
      created_count := created_count + 1;
    end if;

    processed_count := processed_count + 1;
  end loop;

  insert into public.marc_audit_log(user_id,entity_type,entity_id,action,source,metadata)
  values(
    uid,'INVENTORY',null,'IMPORT_BATCH','WEB',
    jsonb_build_object(
      'processed',processed_count,
      'created',created_count,
      'updated',updated_count,
      'reactivated',reactivated_count
    )
  );

  return jsonb_build_object(
    'status','IMPORTED',
    'total',processed_count,
    'created',created_count,
    'updated',updated_count,
    'reactivated',reactivated_count
  );
end;
$$;

revoke all on function public.marc_import_inventory_batch(jsonb,boolean) from public, anon;
grant execute on function public.marc_import_inventory_batch(jsonb,boolean) to authenticated;

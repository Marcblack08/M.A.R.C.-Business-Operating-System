-- M.A.R.C. financial cost attribution v1
alter table public.marc_quote_items
  add column if not exists material_provider text not null default 'MARC';

alter table public.marc_quote_items
  drop constraint if exists marc_quote_items_material_provider_check;
alter table public.marc_quote_items
  add constraint marc_quote_items_material_provider_check
  check (material_provider in ('MARC','CLIENT','MIXTO'));

alter table public.marc_quote_items add column if not exists transport_cost numeric not null default 0;
alter table public.marc_quote_items add column if not exists labor_cost numeric not null default 0;
alter table public.marc_quote_items add column if not exists other_cost numeric not null default 0;

alter table public.marc_quote_items drop constraint if exists marc_quote_items_transport_cost_check;
alter table public.marc_quote_items add constraint marc_quote_items_transport_cost_check check (transport_cost >= 0);
alter table public.marc_quote_items drop constraint if exists marc_quote_items_labor_cost_check;
alter table public.marc_quote_items add constraint marc_quote_items_labor_cost_check check (labor_cost >= 0);
alter table public.marc_quote_items drop constraint if exists marc_quote_items_other_cost_check;
alter table public.marc_quote_items add constraint marc_quote_items_other_cost_check check (other_cost >= 0);

alter table public.marc_quotes add column if not exists cost_total numeric not null default 0;
alter table public.marc_quotes add column if not exists profit numeric not null default 0;
alter table public.marc_quotes add column if not exists profit_margin numeric not null default 0;

drop function if exists public.marc_save_quote(uuid,uuid,text,text,boolean,numeric,text,jsonb,text);

create function public.marc_save_quote(
  p_quote_id uuid default null,
  p_client_id uuid default null,
  p_title text default 'Cotización',
  p_status text default 'BORRADOR',
  p_tax_enabled boolean default false,
  p_tax_rate numeric default 18,
  p_notes text default null,
  p_items jsonb default '[]'::jsonb,
  p_source text default 'WEB'
) returns public.marc_quotes
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_quote public.marc_quotes;
  v_old_status text;
  v_sub numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_cost_total numeric := 0;
  v_profit numeric := 0;
  v_profit_margin numeric := 0;
  v_number text;
  v_prefix text := 'COT-' || to_char(now(), 'YYYYMM');
  v_next int;
  v_item jsonb;
  v_type text;
  v_inventory_id uuid;
  v_name text;
  v_description text;
  v_quantity numeric;
  v_unit text;
  v_unit_price numeric;
  v_material_cost numeric;
  v_transport_cost numeric;
  v_labor_cost numeric;
  v_other_cost numeric;
  v_inventory_cost numeric;
  v_material_provider text;
  v_trial_count int := 0;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_source not in ('WEB','AI_AGENT','TELEGRAM') then raise exception 'Fuente inválida'; end if;
  if p_status not in ('BORRADOR','ENVIADA','ACEPTADA','RECHAZADA','ANULADA','COBRADA') then raise exception 'Estado de cotización inválido'; end if;
  if p_tax_rate < 0 or p_tax_rate > 100 then raise exception 'Porcentaje de IGV inválido'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'La cotización necesita al menos una partida'; end if;

  if p_quote_id is not null then
    select status into v_old_status from public.marc_quotes where id=p_quote_id and user_id=v_uid for update;
    if not found then raise exception 'Cotización no encontrada'; end if;
    if v_old_status in ('COBRADA','ANULADA') and p_status <> v_old_status then raise exception 'Una cotización % no puede cambiar de estado',v_old_status; end if;
    if v_old_status='ACEPTADA' and p_status='BORRADOR' then raise exception 'Una cotización aceptada no puede volver a borrador'; end if;
  else
    if not exists(select 1 from public.marc_subscriptions where user_id=v_uid and status='active') then
      if not exists(select 1 from public.marc_trials where user_id=v_uid and status='ACTIVE' and ends_at>now()) then raise exception 'TRIAL_EXPIRED'; end if;
      select count(*) into v_trial_count from public.marc_quotes q join public.marc_trials t on t.user_id=q.user_id where q.user_id=v_uid and t.status='ACTIVE' and q.created_at>=t.started_at;
      if v_trial_count >= 5 then raise exception 'TRIAL_QUOTE_LIMIT'; end if;
    end if;
    perform pg_advisory_xact_lock(hashtext(v_uid::text || ':' || v_prefix));
    select coalesce(max((regexp_match(number,'([0-9]+)$'))[1]::int),0)+1 into v_next from public.marc_quotes where user_id=v_uid and number like v_prefix || '-%';
    v_number := v_prefix || '-' || lpad(v_next::text,4,'0');
  end if;

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
      from public.marc_inventory where id=v_inventory_id and user_id=v_uid and active=true;
      if not found then raise exception 'Producto de inventario no válido'; end if;

      if v_material_provider='CLIENT' then
        v_material_cost := 0;
      elsif v_material_provider='MIXTO' then
        v_material_cost := greatest(0,coalesce((v_item->>'cost')::numeric,v_inventory_cost,0));
      else
        v_material_cost := greatest(0,coalesce(v_inventory_cost,0));
      end if;
    else
      v_name := nullif(trim(v_item->>'name'),'');
      if v_name is null or v_unit_price <= 0 then raise exception 'Trabajo inválido: necesita nombre y precio'; end if;
      if v_material_provider='CLIENT' then
        v_material_cost := 0;
      else
        v_material_cost := greatest(0,coalesce((v_item->>'cost')::numeric,0));
      end if;
      v_unit := coalesce(v_item->>'unit','UND');
    end if;

    v_sub := v_sub + (v_quantity * v_unit_price);
    v_cost_total := v_cost_total + (v_quantity * v_material_cost) + v_transport_cost + v_labor_cost + v_other_cost;
  end loop;

  v_tax := case when p_tax_enabled then round(v_sub * p_tax_rate / 100,2) else 0 end;
  v_total := v_sub + v_tax;
  v_profit := v_sub - v_cost_total;
  v_profit_margin := case when v_sub > 0 then round((v_profit / v_sub) * 100,2) else 0 end;

  if p_quote_id is null then
    insert into public.marc_quotes(user_id,number,client_id,title,status,currency,tax_enabled,tax_rate,subtotal,tax,total,cost_total,profit,profit_margin,notes)
    values(v_uid,v_number,p_client_id,coalesce(nullif(trim(p_title),''),'Cotización'),p_status,'PEN',p_tax_enabled,p_tax_rate,v_sub,v_tax,v_total,v_cost_total,v_profit,v_profit_margin,p_notes)
    returning * into v_quote;
    insert into public.marc_audit_log(user_id,entity_type,entity_id,action,source,metadata)
    values(v_uid,'QUOTE',v_quote.id,'CREATE',p_source,jsonb_build_object('number',v_quote.number,'total',v_total,'cost_total',v_cost_total,'profit',v_profit,'items',jsonb_array_length(p_items)));
  else
    update public.marc_quotes set
      client_id=p_client_id,title=coalesce(nullif(trim(p_title),''),'Cotización'),status=p_status,
      tax_enabled=p_tax_enabled,tax_rate=p_tax_rate,subtotal=v_sub,tax=v_tax,total=v_total,
      cost_total=v_cost_total,profit=v_profit,profit_margin=v_profit_margin,notes=p_notes,updated_at=now()
    where id=p_quote_id and user_id=v_uid returning * into v_quote;
    if v_quote.id is null then raise exception 'No se pudo actualizar la cotización'; end if;
    delete from public.marc_quote_items where quote_id=v_quote.id and user_id=v_uid;
    insert into public.marc_audit_log(user_id,entity_type,entity_id,action,source,metadata)
    values(v_uid,'QUOTE',v_quote.id,'UPDATE',p_source,jsonb_build_object('status',p_status,'total',v_total,'cost_total',v_cost_total,'profit',v_profit,'items',jsonb_array_length(p_items)));
  end if;

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
      from public.marc_inventory where id=v_inventory_id and user_id=v_uid and active=true;
      if v_material_provider='CLIENT' then
        v_material_cost:=0;
      elsif v_material_provider='MIXTO' then
        v_material_cost:=greatest(0,coalesce((v_item->>'cost')::numeric,v_inventory_cost,0));
      else
        v_material_cost:=greatest(0,coalesce(v_inventory_cost,0));
      end if;
    else
      v_name := nullif(trim(v_item->>'name'),'');
      v_material_cost := case when v_material_provider='CLIENT' then 0 else greatest(0,coalesce((v_item->>'cost')::numeric,0)) end;
    end if;

    insert into public.marc_quote_items(
      quote_id,user_id,inventory_id,item_type,name,description,quantity,unit,unit_price,cost,line_total,
      material_provider,transport_cost,labor_cost,other_cost
    )
    values(
      v_quote.id,v_uid,v_inventory_id,v_type,v_name,nullif(v_item->>'description',''),v_quantity,v_unit,v_unit_price,v_material_cost,v_quantity*v_unit_price,
      v_material_provider,v_transport_cost,v_labor_cost,v_other_cost
    );
  end loop;

  return v_quote;
end;
$$;

revoke all on function public.marc_save_quote(uuid,uuid,text,text,boolean,numeric,text,jsonb,text) from public, anon;
grant execute on function public.marc_save_quote(uuid,uuid,text,text,boolean,numeric,text,jsonb,text) to authenticated;

update public.marc_quotes q
set cost_total=coalesce(x.cost_total,0),
    profit=coalesce(q.subtotal,0)-coalesce(x.cost_total,0),
    profit_margin=case when coalesce(q.subtotal,0)>0 then round(((coalesce(q.subtotal,0)-coalesce(x.cost_total,0))/q.subtotal)*100,2) else 0 end,
    updated_at=now()
from (
  select quote_id,sum((quantity*cost)+transport_cost+labor_cost+other_cost) cost_total
  from public.marc_quote_items group by quote_id
) x
where q.id=x.quote_id;

update public.marc_quotes
set cost_total=coalesce(cost_total,0),
    profit=coalesce(profit,0),
    profit_margin=coalesce(profit_margin,0)
where cost_total is null or profit is null or profit_margin is null;

alter table public.marc_inventory add column if not exists serial_tracking boolean not null default false;

create table if not exists public.marc_inventory_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inventory_id uuid not null references public.marc_inventory(id) on delete cascade,
  serial_number text not null,
  image_url text,
  status text not null default 'IN_STOCK' check(status in ('IN_STOCK','SOLD','RESERVED','DAMAGED','REMOVED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, inventory_id, serial_number)
);
alter table public.marc_inventory_instances enable row level security;
drop policy if exists "instances select own" on public.marc_inventory_instances;
create policy "instances select own" on public.marc_inventory_instances for select to authenticated using(auth.uid()=user_id);
drop policy if exists "instances insert own" on public.marc_inventory_instances;
create policy "instances insert own" on public.marc_inventory_instances for insert to authenticated with check(auth.uid()=user_id);
drop policy if exists "instances update own" on public.marc_inventory_instances;
create policy "instances update own" on public.marc_inventory_instances for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "instances delete own" on public.marc_inventory_instances;
create policy "instances delete own" on public.marc_inventory_instances for delete to authenticated using(auth.uid()=user_id);
create index if not exists marc_inventory_instances_inventory_idx on public.marc_inventory_instances(user_id,inventory_id,status);

create or replace function public.marc_save_inventory_instances(p_inventory_id uuid,p_instances jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_catalog as $$
declare uid uuid:=auth.uid(); item jsonb; v_serial text; v_image_url text; inserted_count integer:=0; current_stock numeric:=0;
begin
 if uid is null then raise exception 'No autenticado'; end if;
 if jsonb_typeof(p_instances)<>'array' or jsonb_array_length(p_instances)=0 then raise exception 'No hay unidades para guardar'; end if;
 if jsonb_array_length(p_instances)>100 then raise exception 'Máximo 100 unidades por lote'; end if;
 perform 1 from public.marc_inventory where id=p_inventory_id and user_id=uid and active=true for update;
 if not found then raise exception 'Producto de inventario no encontrado'; end if;
 for item in select value from jsonb_array_elements(p_instances) loop
  v_serial:=nullif(trim(item->>'serial_number'),'');
  if v_serial is null then raise exception 'Cada unidad debe tener número de serie'; end if;
  v_serial:=left(v_serial,180); v_image_url:=nullif(trim(item->>'image_url'),'');
  insert into public.marc_inventory_instances(user_id,inventory_id,serial_number,image_url) values(uid,p_inventory_id,v_serial,v_image_url) on conflict(user_id,inventory_id,serial_number) do nothing;
  if found then inserted_count:=inserted_count+1; end if;
 end loop;
 select count(*)::numeric into current_stock from public.marc_inventory_instances where user_id=uid and inventory_id=p_inventory_id and status='IN_STOCK';
 update public.marc_inventory set stock=current_stock,serial_tracking=true,updated_at=now() where id=p_inventory_id and user_id=uid;
 insert into public.marc_audit_log(user_id,entity_type,entity_id,action,source,metadata) values(uid,'INVENTORY',p_inventory_id,'ADD_SERIALIZED_STOCK','WEB',jsonb_build_object('inserted',inserted_count,'stock',current_stock));
 return jsonb_build_object('inserted',inserted_count,'stock',current_stock);
end $$;
revoke all on function public.marc_save_inventory_instances(uuid,jsonb) from public,anon;
grant execute on function public.marc_save_inventory_instances(uuid,jsonb) to authenticated;

-- M.A.R.C. Service Operations Suite
-- 2026-09-25
create extension if not exists pgcrypto;

create table if not exists public.marc_service_orders (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 client_id uuid references public.marc_clients(id) on delete set null, number text not null, title text not null,
 service_type text, description text, diagnosis text, work_performed text, recommendations text, location text,
 scheduled_at timestamptz, started_at timestamptz, completed_at timestamptz, technician text,
 status text not null default 'PENDIENTE' check(status in('PENDIENTE','PROGRAMADA','EN_PROCESO','TERMINADA','ENTREGADA','CANCELADA')),
 labor_cost numeric(12,2) not null default 0, transport_cost numeric(12,2) not null default 0,
 materials_cost numeric(12,2) not null default 0, total numeric(12,2) not null default 0,
 revenue numeric(12,2) not null default 0, other_cost numeric(12,2) not null default 0,
 profit numeric(12,2) not null default 0, margin_pct numeric(7,2) not null default 0,
 priority text not null default 'NORMAL' check(priority in('BAJA','NORMAL','ALTA','URGENTE')),
 customer_signature_path text, customer_signature_name text, customer_signature_document text,
 customer_signature_result text, customer_signature_notes text, customer_signature_at timestamptz,
 notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,number)
);
create index if not exists marc_service_orders_user_status_idx on public.marc_service_orders(user_id,status);
create index if not exists marc_service_orders_user_date_idx on public.marc_service_orders(user_id,scheduled_at desc);
create index if not exists marc_service_orders_client_idx on public.marc_service_orders(user_id,client_id);
alter table public.marc_service_orders enable row level security;
drop policy if exists service_orders_owner_all on public.marc_service_orders;
create policy service_orders_owner_all on public.marc_service_orders for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
grant select,insert,update,delete on public.marc_service_orders to authenticated;

create table if not exists public.marc_service_order_materials (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 service_order_id uuid not null references public.marc_service_orders(id) on delete cascade,
 inventory_id uuid references public.marc_inventory(id) on delete set null, name text not null,
 quantity numeric(12,3) not null check(quantity>0), unit_cost numeric(12,2) not null default 0,
 total numeric(14,2) generated always as(quantity*unit_cost) stored, consumed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists marc_service_order_materials_order_idx on public.marc_service_order_materials(user_id,service_order_id);
alter table public.marc_service_order_materials enable row level security;
drop policy if exists service_order_materials_owner_all on public.marc_service_order_materials;
create policy service_order_materials_owner_all on public.marc_service_order_materials for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
grant select,insert,update,delete on public.marc_service_order_materials to authenticated;

create table if not exists public.marc_service_order_photos (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 service_order_id uuid not null references public.marc_service_orders(id) on delete cascade, storage_path text not null,
 photo_type text not null default 'DURANTE' check(photo_type in('ANTES','DURANTE','DESPUES')), caption text,
 taken_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index if not exists marc_service_order_photos_order_idx on public.marc_service_order_photos(user_id,service_order_id,created_at desc);
alter table public.marc_service_order_photos enable row level security;
drop policy if exists service_order_photos_owner_all on public.marc_service_order_photos;
create policy service_order_photos_owner_all on public.marc_service_order_photos for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
grant select,insert,update,delete on public.marc_service_order_photos to authenticated;

create table if not exists public.marc_service_checklists (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 service_order_id uuid not null references public.marc_service_orders(id) on delete cascade, item text not null,
 result text not null default 'PENDIENTE' check(result in('PENDIENTE','OK','NO_OK','NA')), notes text,
 sort_order integer not null default 0, checked_at timestamptz, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists marc_service_checklists_order_idx on public.marc_service_checklists(user_id,service_order_id,sort_order);
alter table public.marc_service_checklists enable row level security;
drop policy if exists service_checklists_owner_all on public.marc_service_checklists;
create policy service_checklists_owner_all on public.marc_service_checklists for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
grant select,insert,update,delete on public.marc_service_checklists to authenticated;

create table if not exists public.marc_service_order_documents (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 service_order_id uuid not null references public.marc_service_orders(id) on delete cascade,
 document_type text not null default 'INFORME_TECNICO', title text not null, storage_path text,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.marc_service_order_documents enable row level security;
drop policy if exists service_order_documents_owner_all on public.marc_service_order_documents;
create policy service_order_documents_owner_all on public.marc_service_order_documents for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
grant select,insert,update,delete on public.marc_service_order_documents to authenticated;

create table if not exists public.marc_appointments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 client_id uuid references public.marc_clients(id) on delete set null,
 service_order_id uuid references public.marc_service_orders(id) on delete set null,
 title text not null, description text, start_at timestamptz not null, end_at timestamptz,
 status text not null default 'PROGRAMADA' check(status in('PROGRAMADA','CONFIRMADA','EN_CURSO','COMPLETADA','CANCELADA','NO_ASISTIO')),
 technician text, location text, reminder_minutes integer not null default 60 check(reminder_minutes>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists marc_appointments_calendar_idx on public.marc_appointments(user_id,start_at);
alter table public.marc_appointments enable row level security;
drop policy if exists appointments_owner_all on public.marc_appointments;
create policy appointments_owner_all on public.marc_appointments for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
grant select,insert,update,delete on public.marc_appointments to authenticated;

create table if not exists public.marc_maintenance_plans (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 client_id uuid references public.marc_clients(id) on delete set null,
 service_order_id uuid references public.marc_service_orders(id) on delete set null,
 title text not null, service_type text, interval_months integer not null default 6 check(interval_months>0 and interval_months<=120),
 next_due_at timestamptz not null, last_completed_at timestamptz, technician text, location text,
 active boolean not null default true, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists marc_maintenance_plans_due_idx on public.marc_maintenance_plans(user_id,next_due_at) where active;
alter table public.marc_maintenance_plans enable row level security;
drop policy if exists maintenance_plans_owner_all on public.marc_maintenance_plans;
create policy maintenance_plans_owner_all on public.marc_maintenance_plans for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
grant select,insert,update,delete on public.marc_maintenance_plans to authenticated;

create table if not exists public.marc_maintenance_occurrences (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 plan_id uuid not null references public.marc_maintenance_plans(id) on delete cascade, scheduled_at timestamptz not null,
 completed_at timestamptz, status text not null default 'PROGRAMADA' check(status in('PROGRAMADA','COMPLETADA','CANCELADA','VENCIDA')),
 service_order_id uuid references public.marc_service_orders(id) on delete set null, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists marc_maintenance_occurrences_idx on public.marc_maintenance_occurrences(user_id,scheduled_at);
alter table public.marc_maintenance_occurrences enable row level security;
drop policy if exists maintenance_occurrences_owner_all on public.marc_maintenance_occurrences;
create policy maintenance_occurrences_owner_all on public.marc_maintenance_occurrences for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
grant select,insert,update,delete on public.marc_maintenance_occurrences to authenticated;

alter table public.marc_clients add column if not exists secondary_phone text;
alter table public.marc_clients add column if not exists contact_role text;
alter table public.marc_clients add column if not exists tax_name text;
alter table public.marc_clients add column if not exists tax_address text;
alter table public.marc_clients add column if not exists preferred_channel text default 'WHATSAPP';
alter table public.marc_clients add column if not exists service_notes text;
alter table public.marc_clients add column if not exists tags jsonb not null default '[]'::jsonb;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('service-order-photos','service-order-photos',false,10485760,array['image/jpeg','image/png','image/webp','image/heic'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists service_order_photos_storage_insert on storage.objects;
drop policy if exists service_order_photos_storage_select on storage.objects;
drop policy if exists service_order_photos_storage_update on storage.objects;
drop policy if exists service_order_photos_storage_delete on storage.objects;
create policy service_order_photos_storage_insert on storage.objects for insert to authenticated with check(bucket_id='service-order-photos' and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy service_order_photos_storage_select on storage.objects for select to authenticated using(bucket_id='service-order-photos' and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy service_order_photos_storage_update on storage.objects for update to authenticated using(bucket_id='service-order-photos' and (storage.foldername(name))[1]=(select auth.uid()::text)) with check(bucket_id='service-order-photos' and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy service_order_photos_storage_delete on storage.objects for delete to authenticated using(bucket_id='service-order-photos' and (storage.foldername(name))[1]=(select auth.uid()::text));

create or replace function public.marc_consume_service_order_materials(p_order_id uuid)
returns jsonb language plpgsql set search_path=public as $$
declare v_user uuid:=auth.uid(); v_order public.marc_service_orders%rowtype; r record; v_after numeric; v_count integer:=0;
begin
 if v_user is null then raise exception 'No autenticado'; end if;
 select * into v_order from public.marc_service_orders where id=p_order_id and user_id=v_user;
 if not found then raise exception 'Orden no encontrada'; end if;
 for r in select m.*,i.stock from public.marc_service_order_materials m join public.marc_inventory i on i.id=m.inventory_id and i.user_id=v_user where m.service_order_id=p_order_id and m.user_id=v_user and m.inventory_id is not null and m.consumed_at is null for update
 loop
  if r.stock<r.quantity then raise exception 'Stock insuficiente para %: disponible %, requerido %',r.name,r.stock,r.quantity; end if;
  v_after:=r.stock-r.quantity;
  update public.marc_inventory set stock=v_after,updated_at=now() where id=r.inventory_id and user_id=v_user;
  insert into public.marc_inventory_movements(user_id,inventory_id,type,quantity,stock_before,stock_after,reason,reference) values(v_user,r.inventory_id,'SALIDA',r.quantity,r.stock,v_after,'Consumo en orden de trabajo',v_order.number);
  update public.marc_service_order_materials set consumed_at=now(),updated_at=now() where id=r.id and user_id=v_user;
  v_count:=v_count+1;
 end loop;
 return jsonb_build_object('consumed',v_count,'order_id',p_order_id);
end; $$;
grant execute on function public.marc_consume_service_order_materials(uuid) to authenticated;

create or replace function public.marc_complete_maintenance(p_occurrence_id uuid,p_service_order_id uuid default null)
returns jsonb language plpgsql set search_path=public as $$
declare v_user uuid:=auth.uid(); o public.marc_maintenance_occurrences%rowtype; p public.marc_maintenance_plans%rowtype; v_next timestamptz;
begin
 select * into o from public.marc_maintenance_occurrences where id=p_occurrence_id and user_id=v_user for update;
 if not found then raise exception 'Mantenimiento no encontrado'; end if;
 select * into p from public.marc_maintenance_plans where id=o.plan_id and user_id=v_user for update;
 if not found then raise exception 'Plan de mantenimiento no encontrado'; end if;
 v_next:=o.scheduled_at+make_interval(months=>p.interval_months);
 update public.marc_maintenance_occurrences set status='COMPLETADA',completed_at=now(),service_order_id=coalesce(p_service_order_id,service_order_id),updated_at=now() where id=o.id;
 update public.marc_maintenance_plans set last_completed_at=now(),next_due_at=v_next,updated_at=now() where id=p.id;
 insert into public.marc_maintenance_occurrences(user_id,plan_id,scheduled_at,status) values(v_user,p.id,v_next,'PROGRAMADA');
 return jsonb_build_object('next_due_at',v_next);
end; $$;
grant execute on function public.marc_complete_maintenance(uuid,uuid) to authenticated;

-- Foreign-key covering indexes
create index if not exists marc_service_order_materials_inventory_idx on public.marc_service_order_materials(inventory_id);
create index if not exists marc_service_checklists_service_order_fk_idx on public.marc_service_checklists(service_order_id);
create index if not exists marc_service_order_documents_service_order_fk_idx on public.marc_service_order_documents(service_order_id);
create index if not exists marc_service_order_documents_user_fk_idx on public.marc_service_order_documents(user_id);
create index if not exists marc_appointments_client_fk_idx on public.marc_appointments(client_id);
create index if not exists marc_appointments_service_order_fk_idx on public.marc_appointments(service_order_id);
create index if not exists marc_maintenance_plans_client_fk_idx on public.marc_maintenance_plans(client_id);
create index if not exists marc_maintenance_plans_service_order_fk_idx on public.marc_maintenance_plans(service_order_id);
create index if not exists marc_maintenance_occurrences_plan_fk_idx on public.marc_maintenance_occurrences(plan_id);
create index if not exists marc_maintenance_occurrences_service_order_fk_idx on public.marc_maintenance_occurrences(service_order_id);

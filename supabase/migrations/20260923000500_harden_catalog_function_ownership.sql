-- Security hardening: enforce ownership in the overloaded catalog metadata function.
create or replace function public.aplicar_informacion_general_catalogo(
  p_catalogo_id uuid,
  p_proveedor_nombre text default null,
  p_rubro text default null,
  p_telefono text default null,
  p_delivery boolean default false,
  p_delivery_detalle text default null
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  update public.catalogos_pdf
     set proveedor_nombre = nullif(trim(p_proveedor_nombre),''),
         rubro = nullif(trim(p_rubro),''),
         proveedor_telefono = nullif(trim(p_telefono),''),
         proveedor_delivery = coalesce(p_delivery,false),
         proveedor_delivery_detalle = nullif(trim(p_delivery_detalle),'')
   where id = p_catalogo_id and user_id = v_uid;

  update public.catalogo_items
     set datos_extra = coalesce(datos_extra,'{}'::jsonb) ||
       jsonb_build_object(
         'proveedor', coalesce(nullif(trim(p_proveedor_nombre),''), datos_extra->>'proveedor'),
         'rubro', nullif(trim(p_rubro),''),
         'proveedor_telefono', nullif(trim(p_telefono),''),
         'proveedor_delivery', coalesce(p_delivery,false),
         'proveedor_delivery_detalle', nullif(trim(p_delivery_detalle),'')
       )
   where catalogo_id = p_catalogo_id and user_id = v_uid;
end;
$function$;

revoke execute on function public.aplicar_informacion_general_catalogo(uuid,text,text,text,boolean,text) from public, anon;
grant execute on function public.aplicar_informacion_general_catalogo(uuid,text,text,text,boolean,text) to authenticated;

revoke execute on function public.propagate_catalog_general_info() from public, anon, authenticated;

-- Security hardening: remove anonymous/public API surface from owner-scoped data
-- Applied to production Supabase as migration 20260923000200_lockdown_anon_surface.

alter policy clientes_delete_own on public.clientes to authenticated;
alter policy clientes_insert_own on public.clientes to authenticated;
alter policy clientes_select_own on public.clientes to authenticated;
alter policy clientes_update_own on public.clientes to authenticated;

alter policy cotizacion_items_delete_own on public.cotizacion_items to authenticated;
alter policy cotizacion_items_insert_own on public.cotizacion_items to authenticated;
alter policy cotizacion_items_owner on public.cotizacion_items to authenticated;
alter policy cotizacion_items_select_own on public.cotizacion_items to authenticated;
alter policy cotizacion_items_update_own on public.cotizacion_items to authenticated;

alter policy cotizaciones_delete_own on public.cotizaciones to authenticated;
alter policy cotizaciones_insert_own on public.cotizaciones to authenticated;
alter policy cotizaciones_owner on public.cotizaciones to authenticated;
alter policy cotizaciones_select_own on public.cotizaciones to authenticated;
alter policy cotizaciones_update_own on public.cotizaciones to authenticated;

alter policy marc_ad_campaigns_delete_own on public.marc_ad_campaigns to authenticated;
alter policy marc_ad_campaigns_insert_own on public.marc_ad_campaigns to authenticated;
alter policy marc_ad_campaigns_select_own on public.marc_ad_campaigns to authenticated;
alter policy marc_ad_campaigns_update_own on public.marc_ad_campaigns to authenticated;

alter policy marc_conversation_context_insert_own on public.marc_conversation_context to authenticated;
alter policy marc_conversation_context_select_own on public.marc_conversation_context to authenticated;
alter policy marc_conversation_context_update_own on public.marc_conversation_context to authenticated;

alter policy productos_delete_own on public.productos to authenticated;
alter policy productos_insert_own on public.productos to authenticated;
alter policy productos_select_own on public.productos to authenticated;
alter policy productos_update_own on public.productos to authenticated;

revoke all on table public.clientes, public.cotizacion_items, public.cotizaciones, public.marc_ad_campaigns, public.marc_conversation_context, public.productos from anon;
grant select, insert, update, delete on table public.clientes, public.cotizacion_items, public.cotizaciones, public.marc_ad_campaigns, public.marc_conversation_context, public.productos to authenticated;

revoke execute on function public.marc_can_publish_social() from public, anon;
grant execute on function public.marc_can_publish_social() to authenticated;

revoke execute on function public.registrar_movimiento_inventario(uuid,text,numeric,text,text) from public, anon;
grant execute on function public.registrar_movimiento_inventario(uuid,text,numeric,text,text) to authenticated;

revoke execute on function public.aplicar_informacion_general_catalogo(uuid) from public, anon;
grant execute on function public.aplicar_informacion_general_catalogo(uuid) to authenticated;
revoke execute on function public.aplicar_informacion_general_catalogo(uuid,text,text,text,boolean,text) from public, anon;
grant execute on function public.aplicar_informacion_general_catalogo(uuid,text,text,text,boolean,text) to authenticated;

revoke execute on function public.propagate_catalog_general_info() from public, anon;
grant execute on function public.propagate_catalog_general_info() to authenticated;

revoke execute on function public.set_servicios_updated_at() from public, anon, authenticated;
revoke execute on function public.touch_technical_reports_updated_at() from public, anon, authenticated;

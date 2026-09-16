-- M.A.R.C. — estados comerciales de cotizaciones
-- Flujo: BORRADOR -> APROBADO -> ENVIADO -> FINALIZADO -> COBRADO.
-- Se conservan estados históricos para no romper registros existentes.

alter table public.cotizaciones
  add column if not exists cobrado_at timestamptz;

alter table public.cotizaciones
  drop constraint if exists cotizaciones_estado_chk;

alter table public.cotizaciones
  add constraint cotizaciones_estado_chk
  check (estado = any (array[
    'BORRADOR'::text,
    'APROBADO'::text,
    'ENVIADO'::text,
    'FINALIZADO'::text,
    'COBRADO'::text,
    'ENVIADA'::text,
    'ACEPTADA'::text,
    'RECHAZADA'::text,
    'ANULADA'::text
  ]));

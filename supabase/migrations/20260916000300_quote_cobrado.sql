-- M.A.R.C. — estado COBRADO para cotizaciones
-- COBRADO indica que el importe de la cotización fue recibido.

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

# M.A.R.C. — Agent Core

La conversación web ya puede actuar como capa operativa sobre el núcleo limpio de M.A.R.C.

## Flujo

`Usuario → autenticación → plan de intención → herramienta → Supabase/RLS → verificación → respuesta`

El Worker valida el access token de Supabase antes de tocar datos. Las operaciones de negocio usan exclusivamente el `user_id` autenticado.

## Herramientas actuales

- `SEARCH_CLIENTS`: busca clientes por nombre, contacto, correo, teléfono o documento.
- `SEARCH_INVENTORY`: consulta productos activos, precio, costo y stock.
- `LIST_QUOTES`: consulta las cotizaciones recientes.
- `CREATE_CLIENT`: registra un cliente y deja trazabilidad en auditoría.
- `CREATE_QUOTE`: resuelve cliente y productos, crea la cotización y sus partidas, calcula subtotal/impuesto/total y registra auditoría.
- `ADJUST_INVENTORY`: entrada, salida o ajuste de stock mediante RPC transaccional.

## Seguridad

- No se usa service role en el navegador ni en el agente.
- El Worker recibe el JWT de la sesión y lo valida con Supabase Auth.
- Las tablas nuevas permanecen protegidas por RLS.
- Las escrituras del agente exigen coincidencia con el usuario autenticado.
- Las acciones de IA cuentan contra el límite de prueba de 30 acciones.
- Las operaciones de inventario se registran en `marc_inventory_movements`.
- Las acciones principales se registran en `marc_audit_log`.

## Próximo contrato de herramientas

Telegram reutilizará estas mismas operaciones. No se debe crear una lógica paralela para el bot: Web y Telegram deben llamar al mismo núcleo de acciones.

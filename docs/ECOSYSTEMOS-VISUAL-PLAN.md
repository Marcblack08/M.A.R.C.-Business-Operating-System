# M.A.R.C. — Línea de trabajo: Ecosistemas y limpieza visual

## Objetivo
Separar claramente M.A.R.C. en:
- 🛠️ Ecosistema Técnico
- 🏪 Ecosistema Tienda / Negocio
- 🔄 Ecosistema Mixto

La interfaz debe mostrar únicamente las funciones relevantes para el ecosistema activo.

## Regla de seguridad
Esta línea de trabajo NO modifica `main` hasta terminar y validar.

## Limpieza visual
Se retirarán los bloques decorativos basados en imágenes de la interfaz:
- imagen grande del login;
- imagen grande del hero del Inicio;
- otros paneles puramente decorativos que dupliquen información.

Se conservarán las imágenes funcionales:
- fotos de órdenes de trabajo;
- fotos antes/durante/después;
- imágenes de productos cuando sean útiles;
- documentos y archivos adjuntos.

## Arquitectura propuesta
### Técnico
Inicio · Trabajos · Agenda · Clientes · Cotizaciones · Inventario · Caja · Informes · IA

### Tienda / Negocio
Inicio · Ventas · Productos · Compras · Proveedores · Clientes · Caja · Reportes · IA

### Mixto
Servicios + Negocio, con navegación agrupada.

## Principio de implementación
1. Crear selector de ecosistema.
2. Guardar la elección por usuario.
3. Generar navegación y dashboard según ecosistema.
4. Ocultar módulos irrelevantes sin borrar sus funciones.
5. Mantener un núcleo común: autenticación, usuarios, clientes, IA, configuración y seguridad.
6. Probar login antes de cualquier integración a `main`.

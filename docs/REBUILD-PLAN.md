# M.A.R.C. — Reinicio arquitectónico

Esta rama es una base limpia para reconstruir M.A.R.C. desde cero.

## Regla de esta etapa

No se conserva ninguna función de negocio de la versión anterior.

Se conserva únicamente la definición de comunicaciones futuras entre M.A.R.C. y:
- Sakit
- Q
- Sumasa
- Clover

No se inventan endpoints, credenciales, protocolos ni capacidades que todavía no hayan sido definidos.

## Funciones que se diseñarán después

1. Identidad y acceso.
2. Núcleo M.A.R.C.
3. Motor de comunicaciones.
4. Registro y auditoría de mensajes.
5. Orquestación de tareas entre sistemas.
6. Seguridad y permisos.
7. Gestión documental.
8. Inteligencia artificial.
9. Integraciones externas.
10. Panel web/PWA.
11. Observabilidad, errores y métricas.
12. Backups y recuperación.

Cada función deberá tener:
- objetivo;
- entradas y salidas;
- permisos;
- dependencia;
- API;
- modelo de datos;
- manejo de errores;
- pruebas;
- criterio de aceptación.

## Principio

Primero arquitectura y contratos. Después código.

# Contratos de comunicación

Esta carpeta representa exclusivamente las interfaces de comunicación que deberán definirse.

## Sistemas

- M.A.R.C.
- Sakit
- Q
- Sumasa
- Clover

Actualmente el repositorio no contiene implementaciones verificables para Sakit, Q, Sumasa o Clover. Por tanto, esta etapa no inventa integraciones.

## Contrato mínimo futuro

Cada sistema deberá declarar:
- identificador;
- versión del contrato;
- endpoint o canal;
- autenticación;
- eventos enviados;
- eventos recibidos;
- esquema de mensaje;
- idempotencia;
- timeout;
- reintentos;
- trazabilidad;
- manejo de errores;
- límites de frecuencia.

## Estado

Todas las integraciones: PENDIENTE DE ESPECIFICACIÓN.

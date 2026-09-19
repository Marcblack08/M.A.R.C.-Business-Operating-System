# M.A.R.C. — Prueba gratuita y monetización

## Objetivo de la prueba

La prueba de 7 días debe demostrar valor real, no funcionar como una versión mutilada.

La persona debe poder experimentar el flujo principal de M.A.R.C.:

**preguntar → entender → consultar datos → ejecutar una acción → obtener resultado → registrar la operación**

La prueba termina por tiempo o por consumo, lo que ocurra primero.

## Duración

- 7 días desde la verificación de la cuenta.
- No empieza al abrir el formulario de registro.
- Una cuenta que ya consumió una prueba no recibe una nueva prueba automáticamente.

## Qué incluye la prueba

### Conversación
- Chat web con M.A.R.C.
- Chat mediante Telegram.
- Preguntas sobre la información autorizada del negocio.
- Acciones guiadas por conversación.

### Clientes
- Hasta 25 clientes durante la prueba.

### Inventario
- Hasta 50 productos.
- Consulta de stock.
- Alta/edición de productos.
- Movimientos básicos.

### Cotizaciones
- Hasta 5 cotizaciones.
- Productos tomados del inventario.
- Conceptos de trabajo/servicio introducidos por texto o voz.
- Cálculo de totales.
- Generación de PDF.

### Comunicaciones
- Hasta 20 operaciones/comunicaciones registradas.
- Acceso a los canales configurados y autorizados.
- Sakit, Q, Sumasa y Clover solo estarán disponibles cuando exista un contrato de integración activo.

### IA
- Hasta 30 acciones de IA durante la prueba.
- El contador deberá distinguir entre conversación simple y acciones que consumen herramientas/cómputo.
- No mostrar límites técnicos innecesarios al usuario; mostrar progreso de uso de forma comprensible.

## Lo que la prueba NO debe hacer

No debe permitir:
- uso masivo;
- automatizaciones masivas;
- creación ilimitada de datos;
- abuso de APIs;
- exportaciones masivas;
- múltiples organizaciones como método para evadir límites;
- acceso a integraciones no autorizadas.

## Regla de consumo

El límite de prueba es el mínimo entre:

1. 7 días;
2. límites funcionales del plan de prueba;
3. límites de uso de IA;
4. límites de seguridad/antiabuso.

## Antiabuso

La prueba debe asociarse a la identidad de la cuenta y no únicamente al correo.

Se registrará:
- usuario;
- correo verificado;
- teléfono cuando sea requerido;
- fecha de alta;
- fecha de inicio de prueba;
- identificador de prueba;
- canal de acceso;
- señales de riesgo;
- consumo.

El sistema podrá impedir nuevas pruebas cuando existan señales suficientes de que ya se consumió una prueba.

No se debe depender de una única señal como dirección IP o dominio de correo.

## Protección contra registros automatizados

El alta debe incluir:
- verificación de correo;
- protección anti-bot;
- rate limiting;
- límites de creación de cuentas;
- detección de patrones anómalos.

## Experiencia del usuario

La aplicación mostrará un estado de prueba claro:

**Prueba Pro**
- 5 días restantes
- 3/5 cotizaciones
- 21/30 acciones IA
- 18/25 clientes
- 34/50 productos

No mostrar una pantalla agresiva de venta durante el uso normal.

## Conversión

### Día 1
Enseñar el valor con datos de ejemplo o con los primeros datos reales del usuario.

### Días 2–4
El usuario debe completar operaciones reales.

### Día 5
Mostrar un resumen de valor:
- operaciones realizadas;
- cotizaciones creadas;
- tiempo/acciones automatizadas;
- pendientes detectados.

No inventar ahorro monetario. Solo mostrar métricas que el sistema pueda medir.

### Día 6
Recordatorio discreto de vencimiento y acceso a planes.

### Día 7
La prueba termina o se convierte en pago si existe una suscripción activa.

## Estado después de la prueba

Si no paga:
- no borrar inmediatamente los datos;
- cambiar la cuenta a estado limitado;
- permitir acceso a lectura y a la gestión de suscripción;
- conservar los datos durante el periodo de retención definido por la política del producto;
- bloquear operaciones que requieran un plan activo.

## Plan inicial propuesto

### M.A.R.C. Pro
- Chat web y Telegram.
- Clientes.
- Inventario.
- Cotizaciones.
- Comunicaciones.
- IA transversal.
- Mayor volumen de operaciones.
- Integraciones según disponibilidad.

### M.A.R.C. Business
- Todo Pro.
- Múltiples usuarios.
- Roles y permisos.
- Mayor volumen.
- Automatizaciones.
- Integraciones empresariales.
- Auditoría avanzada.

Los precios exactos se definirán después de validar el costo real de IA, almacenamiento, mensajería, pagos y soporte.

## Modelo de datos mínimo

### subscriptions
- id
- user_id
- plan
- status
- provider
- provider_subscription_id
- started_at
- current_period_start
- current_period_end
- canceled_at

### trials
- id
- user_id
- status
- started_at
- ends_at
- used_at
- source
- risk_level

### usage_counters
- id
- user_id
- period_start
- period_end
- ai_actions
- quotes
- communications
- clients
- inventory_items

### payment_events
- id
- user_id
- provider
- provider_event_id
- event_type
- status
- amount
- currency
- created_at

## Principio comercial

No venderemos mensajes.

Venderemos la capacidad de M.A.R.C. para **convertir conversaciones en operaciones útiles para el negocio**.

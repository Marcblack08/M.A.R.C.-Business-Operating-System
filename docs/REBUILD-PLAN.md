# M.A.R.C. — Plan de reconstrucción

## Objetivo

Reconstruir M.A.R.C. como una aplicación empresarial simple, modular y centrada en las operaciones reales. La nueva versión no reutiliza la estructura de módulos de la aplicación anterior.

La regla es:

**menos secciones, más capacidad dentro de cada sección.**

## Navegación principal aprobada

### 1. Inicio

Será el centro de operaciones.

Debe mostrar:
- resumen de actividad;
- pendientes;
- cotizaciones recientes;
- clientes recientes;
- inventario crítico;
- comunicaciones recientes;
- accesos rápidos;
- botón para realizar una pregunta o acción mediante M.A.R.C.

No habrá una sección independiente llamada "IA - Asistente".

La IA será una capacidad transversal accesible desde el Inicio y desde los formularios donde resulte útil.

### 2. Clientes

Gestión completa de clientes.

Debe permitir:
- crear, editar y buscar clientes;
- datos de contacto;
- documentos y archivos asociados;
- historial de cotizaciones;
- historial de comunicaciones;
- notas;
- actividad relacionada.

### 3. Inventario

Productos e inventario se fusionan en una sola sección.

No existirá una sección independiente "Productos".

Inventario deberá incluir:
- alta y edición de productos;
- código;
- nombre;
- marca;
- modelo;
- categoría;
- unidad;
- costo;
- precio de venta;
- existencia;
- stock mínimo;
- movimientos;
- proveedores cuando sean necesarios;
- fotos y documentos del producto;
- búsqueda y filtros;
- lectura/captura por voz o IA cuando sea útil.

La misma entidad de producto será la base del control de inventario.

### 4. Cotizaciones

Módulo principal de generación de proformas/cotizaciones.

Debe permitir:
- seleccionar cliente;
- incorporar productos desde Inventario;
- escribir o dictar trabajos/servicios directamente dentro de la cotización;
- cantidades;
- precios;
- descuentos;
- impuestos configurables;
- totales;
- condiciones;
- notas;
- adjuntos;
- generación de PDF;
- historial de estados.

No habrá una sección independiente "Servicios".

Los trabajos y servicios serán conceptos de una cotización, introducidos manualmente o por voz/IA cuando corresponda.

### 5. Comunicaciones

Canal central de comunicación de M.A.R.C.

Aquí se concentrará:
- comunicación con Sakit;
- comunicación con Q;
- comunicación con Sumasa;
- comunicación con Clover;
- preguntas;
- solicitudes;
- respuestas;
- estados de cada comunicación;
- historial;
- trazabilidad.

M.A.R.C. podrá interpretar una petición y convertirla en una acción o consulta para el sistema correspondiente, siempre que exista un contrato definido.

La comunicación será contextualizable a un cliente, cotización, producto/inventario o tarea.

### 6. Configuración

Una sola sección para:
- datos de empresa;
- usuario y seguridad;
- preferencias;
- moneda e impuestos;
- permisos;
- integraciones;
- canales;
- configuración de M.A.R.C.;
- gestión de sesión.

## Funciones eliminadas como secciones independientes

### Informes técnicos
ELIMINADO.

Los datos necesarios podrán existir como documentos, notas, archivos o información asociada a clientes/cotizaciones, pero no habrá un módulo independiente de informes técnicos.

### IA - Asistente
ELIMINADO COMO SECCIÓN.

La IA seguirá existiendo como capacidad transversal:
- preguntas desde Inicio;
- comandos dentro de Comunicaciones;
- dictado en Cotizaciones;
- ayuda contextual en Clientes;
- captura y clasificación en Inventario.

### Productos
ELIMINADO COMO SECCIÓN.

Queda integrado dentro de Inventario.

### Servicios
ELIMINADO COMO SECCIÓN.

Los trabajos/servicios se introducen dentro de Cotizaciones.

### Documentos
ELIMINADO COMO SECCIÓN PRINCIPAL.

Los archivos se gestionarán de forma contextual:
- cliente;
- cotización;
- producto;
- comunicación.

## Funciones transversales

### Voz

La voz no tendrá un módulo propio.

Se utilizará donde aporte valor:
- crear/editar datos;
- dictar una cotización;
- hacer preguntas;
- enviar instrucciones por Comunicaciones.

### IA

La IA no será una pantalla aislada. Será un motor transversal con permisos limitados.

Ejemplos:
- interpretar una orden;
- transformar voz en campos estructurados;
- resumir una comunicación;
- buscar información;
- detectar inconsistencias;
- preparar una cotización;
- clasificar información.

### Archivos

Los archivos serán adjuntos contextuales y no un módulo independiente.

### Auditoría

Cada acción importante deberá poder quedar registrada:
- usuario;
- fecha/hora;
- entidad;
- acción;
- resultado;
- origen;
- identificador de correlación.

## Arquitectura funcional mínima

La primera versión funcional deberá contener solamente:

**Inicio → Clientes → Inventario → Cotizaciones → Comunicaciones → Configuración**

Con autenticación por correo y contraseña.

No se agregará un nuevo módulo sin demostrar primero que no puede resolverse correctamente dentro de uno de estos seis espacios.

## Prioridad de construcción

1. Autenticación y seguridad.
2. Núcleo de datos.
3. Inicio.
4. Clientes.
5. Inventario/Productos.
6. Cotizaciones.
7. Comunicaciones.
8. Integraciones M.A.R.C. ↔ Sakit/Q/Sumasa/Clover.
9. IA transversal.
10. Voz.
11. Auditoría, pruebas y observabilidad.
12. PWA y optimización final.

## Integraciones externas

Los únicos sistemas previstos en esta etapa son:
- Sakit
- Q
- Sumasa
- Clover

No se inventarán endpoints, credenciales, formatos ni capacidades. Cada integración debe tener un contrato documentado antes de implementarse.


## 7. Telegram + modelo de pago

M.A.R.C. también será un producto comercial accesible mediante Telegram.

### Telegram como canal, no como sistema independiente

Telegram no tendrá una lógica de negocio separada.

El bot se conectará al mismo núcleo de M.A.R.C. que utiliza la plataforma web.

El usuario deberá poder:
- iniciar una conversación con M.A.R.C.;
- hacer preguntas;
- consultar información autorizada;
- pedir acciones;
- dictar instrucciones;
- consultar clientes;
- consultar inventario;
- preparar cotizaciones;
- comunicarse con Sakit, Q, Sumasa y Clover cuando exista el contrato correspondiente;
- recibir confirmaciones y resultados.

La web y Telegram deberán compartir:
- identidad;
- cuenta;
- permisos;
- historial;
- contexto;
- suscripción;
- límites de uso.

### Vinculación de cuentas

Debe existir un mecanismo seguro para vincular:
- cuenta M.A.R.C. web;
- cuenta Telegram.

No se debe confiar únicamente en el nombre visible de Telegram.

La vinculación deberá utilizar un identificador y un flujo temporal verificable.

### Monetización

M.A.R.C. será de pago.

La arquitectura de monetización deberá separar:
- identidad del usuario;
- plan contratado;
- estado de la suscripción;
- límites del plan;
- consumo;
- pagos;
- facturación;
- estado de acceso.

Se diseñará el producto como SaaS, con planes configurables y posibilidad de prueba inicial.

### Pagos en Telegram

Para vender el acceso digital de M.A.R.C. dentro de Telegram, la implementación deberá utilizar Telegram Stars y la moneda XTR, conforme al flujo de pagos de Telegram. Telegram también documenta suscripciones periódicas de 30 días para pagos en Stars. 

El bot deberá contemplar:
- selección de plan;
- factura;
- confirmación de pago;
- activación de suscripción;
- renovación;
- cancelación;
- reembolso cuando corresponda;
- /terms;
- /support;
- registro de pagos;
- comprobación de transacciones.

### Pago desde la web

También se podrá contratar M.A.R.C. desde la plataforma web mediante un proveedor de pagos externo que se defina posteriormente.

La suscripción web y la suscripción adquirida mediante Telegram deberán converger en un mismo registro de suscripción de M.A.R.C.

### Control de acceso

El núcleo deberá poder determinar en cada solicitud:
- usuario;
- plan;
- estado de pago;
- fecha de vencimiento;
- límites;
- consumo;
- permisos;
- canal de origen.

No se debe bloquear el acceso solamente por venir desde Telegram o desde la web. El acceso dependerá de la cuenta y del estado de la suscripción.

### Arquitectura conceptual

Web / Telegram -> Gateway de acceso -> Núcleo M.A.R.C. -> herramientas -> datos / integraciones

La IA será una capacidad del núcleo, no el producto completo.

### Telegram no debe duplicar módulos

El usuario no verá en Telegram menús equivalentes a toda la aplicación web.

La conversación será el principal mecanismo:
- preguntar;
- ordenar;
- confirmar;
- recibir resultado.

Cuando una tarea requiera una interfaz gráfica compleja, M.A.R.C. podrá enviar un enlace seguro a la plataforma web.

### Requisitos comerciales

Antes del lanzamiento deberán existir:
- términos y condiciones;
- política de privacidad;
- soporte;
- política de cancelación/reembolso;
- identificación del plan;
- control de suscripción;
- registro de pagos;
- límites antiabuso;
- protección contra uso automatizado no autorizado.

## Principio de diseño

**Si una función puede vivir naturalmente dentro de un módulo existente, no se crea otro módulo.**

Primero arquitectura y contratos. Después implementación.

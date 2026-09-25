# M.A.R.C. — Línea de trabajo: Ecosistemas

## Objetivo
Separar M.A.R.C. en tres experiencias sin duplicar el núcleo:
- Técnico
- Tienda / Negocio
- Técnico + Negocio

## Regla de seguridad
Esta rama es experimental. No modifica main ni debe desplegarse sobre producción hasta validar login, sesión, navegación, Supabase y cada módulo.

## Núcleo compartido
- autenticación y sesión
- usuarios y permisos
- clientes
- IA
- archivos/documentos
- suscripciones
- notificaciones
- configuración
- seguridad

## Ecosistema Técnico
- órdenes de trabajo
- agenda técnica
- mantenimientos
- fotos/firma/checklists
- materiales
- costeo y utilidad
- informes técnicos
- cotizaciones
- inventario
- caja

## Ecosistema Tienda / Negocio
- ventas
- productos
- inventario
- compras
- proveedores
- clientes
- caja/POS
- cuentas por cobrar
- reportes
- rentabilidad

## Ecosistema Mixto
Activa ambos conjuntos sin duplicar clientes, inventario, caja ni usuarios.

## Rediseño visual
La interfaz debe dejar de depender de grandes bloques decorativos de imagen. Debe ser funcional primero, limpia, rápida en móvil y modular.

### No eliminar
Las imágenes funcionales deben permanecer:
- fotos de evidencia de una orden de trabajo
- fotos de productos
- documentos adjuntos
- firma digital
- imágenes cargadas como evidencia

### Sí retirar del shell
- hero/mascot decorativo de gran tamaño
- banners decorativos sin función
- fondos pesados basados en imágenes
- elementos duplicados de marca que ocupen espacio

## Orden de implementación
1. Mantener main intacto.
2. Crear selector de ecosistema.
3. Crear navegación por ecosistema.
4. Crear dashboard específico por ecosistema.
5. Limpiar el shell visual.
6. Probar autenticación antes de integrar.
7. Probar cada módulo.
8. Solo después preparar PR hacia main.

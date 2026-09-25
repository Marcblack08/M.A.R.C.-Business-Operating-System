/* M.A.R.C. Ecosystems — laboratory configuration
   NOT imported by index.html. Safe architecture work only. */
window.MARC_ECOSYSTEMS = Object.freeze({
  technician:{id:"technician",label:"Técnico",navigation:["home","service_orders","agenda","clients","quotes","inventory","cash","reports","ai"],primary:["Órdenes de trabajo","Agenda técnica","Clientes","Cotizaciones"]},
  business:{id:"business",label:"Tienda / Negocio",navigation:["home","sales","inventory","purchases","suppliers","clients","cash","reports","ai"],primary:["Ventas","Productos","Inventario","Caja"]},
  hybrid:{id:"hybrid",label:"Técnico + Negocio",navigation:["home","service_orders","agenda","sales","inventory","purchases","suppliers","clients","quotes","cash","reports","ai"],primary:["Servicios","Ventas","Inventario","Clientes"]}
});
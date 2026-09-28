/* M.A.R.C. WORKSPACES — distinct navigation for Store, Technical and Premium Mixed */
(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const catalog={
    technician:[
      {view:"service_orders",icon:"🛠",title:"Órdenes",desc:"Trabajos y rentabilidad",tone:"cyan",paid:true},
      {view:"agenda",icon:"📅",title:"Agenda",desc:"Visitas y mantenimientos",tone:"teal"},
      {view:"clients",icon:"👥",title:"Clientes",desc:"Historial de servicios",tone:"blue"},
      {view:"assets",icon:"🧰",title:"Equipos",desc:"Activos y garantías",tone:"orange",paid:true},
      {view:"maintenance",icon:"🔧",title:"Mantenimientos",desc:"Preventivo y correctivo",tone:"red",paid:true},
      {view:"inventory",icon:"📦",title:"Materiales",desc:"Repuestos y existencias",tone:"green"},
      {view:"quotes",icon:"🧾",title:"Cotizaciones",desc:"Presupuestos técnicos",tone:"violet"},
      {view:"contracts",icon:"📄",title:"Contratos",desc:"Servicios recurrentes",tone:"slate",paid:true},
      {view:"finances",icon:"💰",title:"Rentabilidad",desc:"Costos, ingresos y margen",tone:"gold",paid:true},
      {view:"reports",icon:"📊",title:"Reportes",desc:"Indicadores operativos",tone:"purple"},
      {view:"settings",icon:"⚙",title:"Configuración",desc:"Empresa y documentos",tone:"dark"}
    ],
    business:[
      {view:"cash",icon:"▣",title:"Caja",desc:"Turnos y cierres",tone:"green"},
      {view:"sales",icon:"🛒",title:"Ventas",desc:"POS y cobros",tone:"blue"},
      {view:"inventory",icon:"▦",title:"Inventario",desc:"Productos y stock",tone:"orange"},
      {view:"clients",icon:"👥",title:"Clientes",desc:"Compras e historial",tone:"purple"},
      {view:"quotes",icon:"🧾",title:"Cotizaciones",desc:"Propuestas comerciales",tone:"pink"},
      {view:"suppliers",icon:"🏭",title:"Proveedores",desc:"Abastecimiento",tone:"slate",paid:true},
      {view:"purchases",icon:"📥",title:"Compras",desc:"Entradas y costos",tone:"teal",paid:true},
      {view:"receivables",icon:"💳",title:"Cobros",desc:"Créditos y vencimientos",tone:"red",paid:true},
      {view:"reports",icon:"📊",title:"Reportes",desc:"Ventas y operación",tone:"violet"},
      {view:"settings",icon:"⚙",title:"Configuración",desc:"Empresa y sistema",tone:"dark"}
    ],
    mixed:[
      {view:"cash",icon:"▣",title:"Caja",desc:"Dinero y turnos",tone:"green"},
      {view:"sales",icon:"🛒",title:"Ventas",desc:"Comercio y cobros",tone:"blue"},
      {view:"service_orders",icon:"🛠",title:"Servicios",desc:"Órdenes y trabajos",tone:"cyan"},
      {view:"quotes",icon:"🧾",title:"Cotizaciones",desc:"Ventas y servicios",tone:"violet"},
      {view:"inventory",icon:"▦",title:"Inventario",desc:"Productos + materiales",tone:"orange"},
      {view:"clients",icon:"👥",title:"Clientes",desc:"Relación completa",tone:"purple"},
      {view:"agenda",icon:"📅",title:"Agenda",desc:"Operación y visitas",tone:"teal"},
      {view:"assets",icon:"🧰",title:"Activos",desc:"Equipos y garantías",tone:"slate",paid:true},
      {view:"maintenance",icon:"🔧",title:"Mantenimiento",desc:"Servicios recurrentes",tone:"red",paid:true},
      {view:"suppliers",icon:"🏭",title:"Proveedores",desc:"Compras y materiales",tone:"gold"},
      {view:"purchases",icon:"📥",title:"Compras",desc:"Costos y abastecimiento",tone:"green"},
      {view:"receivables",icon:"💳",title:"Cobros",desc:"Cuentas por cobrar",tone:"pink"},
      {view:"contracts",icon:"📄",title:"Contratos",desc:"Servicios y renovaciones",tone:"slate"},
      {view:"finances",icon:"◈",title:"Finanzas",desc:"Resultado empresarial",tone:"gold"},
      {view:"reports",icon:"📊",title:"Centro ejecutivo",desc:"KPIs y análisis",tone:"purple"},
      {view:"settings",icon:"⚙",title:"Configuración",desc:"Empresa y sistema",tone:"dark"}
    ]
  };
  const meta={
    technician:{name:"Ecosistema Técnico",short:"TÉCNICO",icon:"🛠️",desc:"Una central de trabajo para servicios, equipos y mantenimientos."},
    business:{name:"Tienda / Negocio",short:"TIENDA",icon:"🏪",desc:"Un espacio comercial para vender, cobrar y controlar stock."},
    mixed:{name:"M.A.R.C. Business",short:"PREMIUM",icon:"✦",desc:"Una operación empresarial donde comercio y servicios están conectados."}
  };
  let current="home",launcherReady=false,homeLauncherReady=false;

  function ecosystem(){
    const key=document.documentElement.dataset.ecosystem||window.st?.ecosystem||"technician";
    return catalog[key]?key:"technician";
  }
  function modules(){return catalog[ecosystem()]}
  function clickView(view){
    const b=$('.sidebar nav button[data-view="'+view+'"]');
    if(b&&!b.hidden){b.click();return true}
    return false;
  }
  const groupMap={
    technician:{
      service_orders:"Operación técnica",agenda:"Operación técnica",maintenance:"Operación técnica",assets:"Operación técnica",
      clients:"Gestión de clientes",inventory:"Materiales y recursos",quotes:"Gestión comercial",contracts:"Gestión comercial",
      finances:"Control y rentabilidad",reports:"Control y rentabilidad",settings:"Sistema"
    },
    business:{
      cash:"Ventas y caja",sales:"Ventas y caja",quotes:"Ventas y caja",clients:"Ventas y caja",
      inventory:"Inventario y abastecimiento",suppliers:"Inventario y abastecimiento",purchases:"Inventario y abastecimiento",
      receivables:"Administración",reports:"Administración",settings:"Sistema"
    },
    mixed:{
      cash:"Comercio",sales:"Comercio",quotes:"Comercio",clients:"Relación con clientes",receivables:"Comercio",
      service_orders:"Servicios",agenda:"Servicios",assets:"Servicios",maintenance:"Servicios",contracts:"Servicios",
      inventory:"Recursos",suppliers:"Recursos",purchases:"Recursos",finances:"Control empresarial",reports:"Control empresarial",
      settings:"Sistema"
    }
  };
  function moduleGroup(view){return groupMap[ecosystem()]?.[view]||"Módulos";}
  function moduleCard(m){
    return '<button type="button" class="marc-module-card '+m.tone+(m.paid?' paid-feature':'')+'" data-marc-module="'+m.view+'">'+(m.paid?'<span class="mm-paid-badge" aria-label="Función de pago">♛ PAGO</span>':'')+'<span class="mm-icon">'+m.icon+'</span><b>'+m.title+'</b><small>'+m.desc+'</small></button>';
  }
  function groupedModulesMarkup(){
    const groups=[];
    modules().forEach(m=>{
      const g=moduleGroup(m.view);
      let bucket=groups.find(x=>x.name===g);
      if(!bucket){bucket={name:g,items:[]};groups.push(bucket)}
      bucket.items.push(m);
    });
    return groups.map(g=>'<section class="marc-module-group" data-module-group="'+g.name+'"><div class="marc-module-group-head"><span></span><b>'+g.name+'</b><i>'+g.items.length+' módulos</i></div><div class="marc-module-grid">'+g.items.map(moduleCard).join("")+'</div></section>').join("");
  }
  function buildOverlay(){
    if(!$("#app"))return;
    let el=$("#marcModuleOverlay");
    if(!el){
      el=document.createElement("div");el.id="marcModuleOverlay";el.className="marc-module-overlay";document.body.appendChild(el);
      el.addEventListener("click",e=>{
        if(e.target===el||e.target.closest("#marcModuleClose")){el.classList.remove("open");return}
        const logout=e.target.closest("#marcImmersiveLogout");
        if(logout){document.querySelector("#logout")?.click();el.classList.remove("open");return}
        const b=e.target.closest("[data-marc-module]");
        if(!b)return;
        el.classList.remove("open");clickView(b.dataset.marcModule);
      });
    }
    const m=meta[ecosystem()];
    el.innerHTML='<section class="marc-module-panel" role="dialog" aria-modal="true" aria-labelledby="marcModuleTitle"><div class="marc-module-head"><div><span class="marc-module-kicker">'+m.short+' · ESPACIO DE TRABAJO</span><h2 id="marcModuleTitle">'+m.name+'</h2><p>'+m.desc+'</p></div><button type="button" class="marc-module-close" id="marcModuleClose" aria-label="Cerrar módulos">×</button></div><div class="marc-module-groups">'+groupedModulesMarkup()+'</div><div class="marc-module-session"><button type="button" id="marcImmersiveLogout" class="marc-session-exit">↪ Cerrar sesión</button></div></section>';
  }
  function openModules(){buildOverlay();$("#marcModuleOverlay")?.classList.add("open")}
  function closeModules(){$("#marcModuleOverlay")?.classList.remove("open")}
  function buildTopControls(){
    const brand=$(".brand-head");if(!brand)return;
    let controls=$(".marc-immersive-controls");
    if(!controls){
      controls=document.createElement("div");controls.className="marc-immersive-controls";
      controls.innerHTML='<button type="button" class="marc-immersive-back" id="marcImmersiveBack" title="Volver al inicio"><span>←</span></button><button type="button" class="marc-immersive-home" id="marcImmersiveHome" title="Inicio"><span>⌂</span></button><button type="button" class="marc-immersive-modules" id="marcImmersiveModules" title="Módulos"><span>☷</span></button><div class="marc-immersive-title"><span class="mit-icon" id="marcImmersiveIcon">⌂</span><div><b id="marcImmersiveName">Inicio</b><small id="marcImmersiveWorkspace">Área de trabajo</small></div></div>';
      brand.parentNode.insertBefore(controls,brand);
      $("#marcImmersiveBack").onclick=()=>clickView("home");
      $("#marcImmersiveHome").onclick=()=>clickView("home");
      $("#marcImmersiveModules").onclick=openModules;
    }
  }
  function installHomeLauncher(){
    const content=$("#content");if(!content||current!=="home"||homeLauncherReady)return;
    const shell=content.querySelector(".business-dashboard,.mixed-dashboard,.tech-home,.dashboard-shell");if(!shell)return;
    // El dashboard Mixto Premium ya contiene sus accesos principales; no dupliques
    // el catálogo "Command center" encima del contenido.
    if(ecosystem()==="mixed"){homeLauncherReady=true;return}
    const old=shell.querySelector(".marc-home-launcher");if(old)old.remove();
    const box=document.createElement("section");box.className="marc-home-launcher";
    const m=meta[ecosystem()];
    if(ecosystem()==="mixed"){
      const premiumViews=["cash","sales","service_orders","inventory","clients","finances"];
      const premium=modules().filter(x=>premiumViews.includes(x.view));
      box.classList.add("marc-premium-launcher");
      box.innerHTML='<div class="marc-premium-launcher-head"><div><span class="marc-module-kicker">M.A.R.C. · PREMIUM BUSINESS</span><h2>Command center.</h2><p>'+m.desc+' Elige una acción o abre el mapa completo de módulos.</p></div><button type="button" class="marc-premium-all" data-open-all-modules>Ver todos los módulos <span>↗</span></button></div><div class="marc-premium-grid">'+premium.map(moduleCard).join("")+'</div><div class="marc-premium-divider"><span>Flujo empresarial conectado</span><i></i><b>6 accesos directos</b></div>';
      box.addEventListener("click",e=>{
        const all=e.target.closest("[data-open-all-modules]");
        if(all){e.preventDefault();openModules();return}
        const b=e.target.closest("[data-marc-module]");
        if(b)clickView(b.dataset.marcModule);
      });
    }else{
      box.innerHTML='<div class="marc-home-launcher-head"><div><span class="marc-module-kicker">'+m.short+' · M.A.R.C.</span><h2>Herramientas de '+(ecosystem()==="business"?"tienda":"trabajo técnico")+'</h2><p>'+m.desc+'</p></div></div><div class="marc-home-launcher-groups">'+groupedModulesMarkup()+'</div>';
      box.addEventListener("click",e=>{const b=e.target.closest("[data-marc-module]");if(b)clickView(b.dataset.marcModule)});
    }
    shell.insertBefore(box,shell.firstChild);
    homeLauncherReady=true;
  }
  function sync(){
    buildTopControls();
    const page=$("#page")?.textContent?.trim()||"Inicio";
    const map={"Inicio":"home","Clientes":"clients","Inventario":"inventory","Proveedores":"suppliers","Cotizaciones":"quotes","Órdenes de trabajo":"service_orders","Agenda técnica":"agenda","Cierre de caja":"cash","Caja":"cash","Ventas / POS":"sales","Compras":"purchases","Créditos y cobros":"receivables","Equipos y activos":"assets","Mantenimientos":"maintenance","Contratos":"contracts","Finanzas":"finances","Reportes":"reports","Configuración":"settings"};
    const next=map[page]||"home";
    if(next!==current){current=next;homeLauncherReady=false}
    const app=$("#app");app?.classList.add("marc-immersive");
    const m=meta[ecosystem()];
    const name=$("#marcImmersiveName"),icon=$("#marcImmersiveIcon"),ws=$("#marcImmersiveWorkspace");
    if(name)name.textContent=next==="home"?(ecosystem()==="mixed"?"Business":"Inicio"):(modules().find(x=>x.view===current)?.title||page);
    if(icon)icon.textContent=next==="home"?m.icon:(modules().find(x=>x.view===current)?.icon||"•");
    if(ws)ws.textContent=m.short+" · Área de trabajo";
    document.documentElement.dataset.ecosystem=ecosystem();
    buildOverlay();
    if(current==="home")setTimeout(installHomeLauncher,40);
  }
  let syncQueued=false;
  function queueSync(){if(syncQueued)return;syncQueued=true;requestAnimationFrame(()=>{syncQueued=false;sync()})}
  function init(){
    buildOverlay();buildTopControls();
    const content=$("#content");if(content)new MutationObserver(queueSync).observe(content,{childList:true,subtree:true});
    const page=$("#page")||document.body;new MutationObserver(queueSync).observe(page,{childList:true,characterData:true,subtree:true});
    document.documentElement.addEventListener("ecosystemchange",queueSync);
    document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeModules();return}if(e.key==="Home"&&e.altKey){e.preventDefault();clickView("home")}});
    sync();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
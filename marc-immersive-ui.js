/* M.A.R.C. IMMERSIVE NAVIGATION — 2026-09-23 */
(()=>{
  const modules=[
    {view:"home",icon:"⌂",title:"Inicio",desc:"Centro de operaciones",tone:"blue"},
    {view:"cash",icon:"▣",title:"Caja",desc:"Turnos, ingresos y cierres",tone:"green"},
    {view:"inventory",icon:"▦",title:"Inventario",desc:"Productos y existencias",tone:"orange"},
    {view:"clients",icon:"◉",title:"Clientes",desc:"Contactos e historial",tone:"purple"},
    {view:"quotes",icon:"▤",title:"Cotizaciones",desc:"Propuestas y PDF",tone:"pink"},
    {view:"marketing",icon:"✦",title:"Publicidad",desc:"Campañas y anuncios",tone:"cyan"},
    {view:"suppliers",icon:"🏭",title:"Proveedores",desc:"Compras y abastecimiento",tone:"slate"},
    {view:"settings",icon:"⚙",title:"Configuración",desc:"Empresa y sistema",tone:"red"}
  ];
  const $=(s,r=document)=>r.querySelector(s);
  let current="home",launcherReady=false,homeLauncherReady=false;

  function clickView(view){
    const b=$('.sidebar nav button[data-view="'+view+'"]');
    if(b){b.click();return true}
    return false;
  }

  function moduleCard(m){
    return '<button type="button" class="marc-module-card '+m.tone+'" data-marc-module="'+m.view+'">'+
      '<span class="mm-icon">'+m.icon+'</span><b>'+m.title+'</b><small>'+m.desc+'</small></button>';
  }

  function buildOverlay(){
    if(launcherReady||!$("#app"))return;
    const el=document.createElement("div");
    el.id="marcModuleOverlay";
    el.className="marc-module-overlay";
    el.innerHTML='<section class="marc-module-panel" role="dialog" aria-modal="true" aria-labelledby="marcModuleTitle">'+
      '<div class="marc-module-head"><div><h2 id="marcModuleTitle">Módulos de M.A.R.C.</h2><p>Elige dónde quieres trabajar. Cada área ocupa toda la pantalla.</p></div>'+
      '<button type="button" class="marc-module-close" id="marcModuleClose" aria-label="Cerrar módulos">×</button></div>'+
      '<div class="marc-module-grid">'+modules.filter(m=>m.view!=="home").map(moduleCard).join("")+'</div><div class="marc-module-session"><button type="button" id="marcImmersiveLogout" class="marc-session-exit">↪ Cerrar sesión</button></div></section>';
    document.body.appendChild(el);
    el.addEventListener("click",e=>{
      if(e.target===el||e.target.closest("#marcModuleClose")){el.classList.remove("open");return}
      const logout=e.target.closest("#marcImmersiveLogout");
      if(logout){document.querySelector("#logout")?.click();el.classList.remove("open");return}
      const b=e.target.closest("[data-marc-module]");
      if(!b)return;
      const v=b.dataset.marcModule;
      el.classList.remove("open");
      clickView(v);
    });
    launcherReady=true;
  }

  function openModules(){buildOverlay();$("#marcModuleOverlay")?.classList.add("open")}
  function closeModules(){$("#marcModuleOverlay")?.classList.remove("open")}

  function buildTopControls(){
    if($(".marc-immersive-controls"))return;
    const brand=$(".brand-head");
    if(!brand)return;
    const controls=document.createElement("div");
    controls.className="marc-immersive-controls";
    controls.innerHTML='<button type="button" class="marc-immersive-back" id="marcImmersiveBack" title="Volver al inicio"><span>←</span><span class="label">Volver</span></button>'+
      '<button type="button" class="marc-immersive-home" id="marcImmersiveHome" title="Ir al inicio"><span>⌂</span><span class="label">Inicio</span></button>'+
      '<button type="button" class="marc-immersive-modules" id="marcImmersiveModules" title="Abrir módulos"><span>☷</span><span class="label">Módulos</span></button>'+
      '<div class="marc-immersive-title"><span class="mit-icon" id="marcImmersiveIcon">⌂</span><div><b id="marcImmersiveName">Inicio</b><small>Área de trabajo</small></div></div>';
    brand.parentNode.insertBefore(controls,brand);
    $("#marcImmersiveBack").onclick=()=>clickView("home");
    $("#marcImmersiveHome").onclick=()=>clickView("home");
    $("#marcImmersiveModules").onclick=openModules;
  }

  function installHomeLauncher(){
    const content=$("#content");
    if(!content||current!=="home"||homeLauncherReady)return;
    const shell=content.querySelector(".dashboard-shell");
    if(!shell)return;
    const box=document.createElement("section");
    box.className="marc-home-launcher";
    box.innerHTML='<div class="marc-home-launcher-head"><div><h2>¿Qué quieres hacer?</h2><p>Entra con un toque al área que necesitas. M.A.R.C. mantiene todo conectado.</p></div></div>'+
      '<div class="marc-home-launcher-grid">'+modules.filter(m=>m.view!=="home").map(moduleCard).join("")+'</div>';
    shell.insertBefore(box,shell.firstChild);
    box.addEventListener("click",e=>{
      const b=e.target.closest("[data-marc-module]");
      if(b)clickView(b.dataset.marcModule);
    });
    homeLauncherReady=true;
  }

  function sync(){
    buildTopControls();
    const page=$("#page")?.textContent?.trim()||"Inicio";
    const map={
      "Inicio":"home","Clientes":"clients","Inventario":"inventory","Proveedores":"suppliers",
      "Cotizaciones":"quotes","Publicidad":"marketing","Cierre de caja":"cash","Configuración":"settings"
    };
    const next=map[page]||"home";
    if(next!==current){current=next;homeLauncherReady=false}
    const app=$("#app");
    const immersive=true;
    app?.classList.toggle("marc-immersive",immersive);
    const m=modules.find(x=>x.view===current)||modules[0];
    const name=$("#marcImmersiveName"),icon=$("#marcImmersiveIcon");
    if(name)name.textContent=m.title;
    if(icon)icon.textContent=m.icon;
    if(current==="home")setTimeout(installHomeLauncher,30);
  }

  function init(){
    buildOverlay();
    buildTopControls();
    const content=$("#content");
    if(content){
      new MutationObserver(()=>{requestAnimationFrame(sync)}).observe(content,{childList:true,subtree:true});
    }
    new MutationObserver(()=>{requestAnimationFrame(sync)}).observe($("#page")||document.body,{childList:true,characterData:true,subtree:true});
    document.addEventListener("keydown",e=>{
      if(e.key==="Escape"){closeModules();return}
      if(e.key==="Home"&&e.altKey){e.preventDefault();clickView("home")}
    });
    sync();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();

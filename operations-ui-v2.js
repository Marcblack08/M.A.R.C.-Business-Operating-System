/* M.A.R.C. · Operations UI v3 */
(()=>{"use strict";
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)],later=(fn,ms=50)=>setTimeout(fn,ms);
let lastView="",bound=false;
function activeView(){return $(".sidebar nav button.active")?.dataset.view||""}
function toggleMore(force){
  let panel=$(".ops-mobile-more"),back=$(".ops-mobile-more-backdrop");
  if(force===false){panel?.remove();back?.remove();return}
  if(panel){panel.remove();back?.remove();return}
  back=document.createElement("div");back.className="ops-mobile-more-backdrop";back.onclick=()=>toggleMore(false);
  panel=document.createElement("div");panel.className="ops-mobile-more";
  const items=[["clients","♙","Clientes"],["suppliers","🏭","Proveedores"],["marketing","✦","Publicidad"],["settings","⚙","Configuración"]];
  panel.innerHTML=items.map(x=>'<button type="button" data-more-view="'+x[0]+'"><span>'+x[1]+'</span><span>'+x[2]+'</span></button>').join("");
  panel.onclick=e=>{const b=e.target.closest("[data-more-view]");if(!b)return;toggleMore(false);document.querySelector('.sidebar nav button[data-view="'+b.dataset.moreView+'"]')?.click()};
  document.body.append(back,panel);
}
function addMobileMore(){
  const nav=$("#mobileNav");if(!nav||nav.querySelector(".mobile-more-trigger"))return;
  const b=document.createElement("button");b.type="button";b.className="mobile-more-trigger";b.innerHTML="<span>☰</span><b>Más</b>";
  b.onclick=e=>{e.preventDefault();e.stopPropagation();toggleMore()};nav.appendChild(b);
}
function enhanceInventory(){
  const root=$("#content");if(!root||!root.querySelector("#rows")||!root.querySelector("#importPdf"))return;
  const head=root.querySelector(".head");
  if(head&&!root.querySelector(".inventory-ops-header")){
    const actions=head.querySelector(":scope>div:last-child"),wrap=document.createElement("div");wrap.className="inventory-ops-header";
    wrap.innerHTML='<div><span class="inventory-ops-badge">▣</span><div><b>Inventario inteligente</b><small>Productos, stock, fotos y catálogos en un solo lugar.</small></div></div><div class="inventory-ops-tools"></div>';
    const tools=wrap.querySelector(".inventory-ops-tools");actions?.querySelectorAll("button").forEach(b=>{if(b.id==="new"||b.id==="importPdf")tools.appendChild(b)});head.after(wrap);
  }
  const table=root.querySelector(".card.table");
  if(table&&!root.querySelector(".inventory-filter-chips")){
    const chips=document.createElement("div");chips.className="inventory-filter-chips";
    chips.innerHTML='<button class="inventory-filter-chip active" data-stock-filter="all">Todos</button><button class="inventory-filter-chip" data-stock-filter="ok">Disponibles</button><button class="inventory-filter-chip" data-stock-filter="low">Stock bajo</button><button class="inventory-filter-chip" data-stock-filter="out">Agotados</button>';
    table.querySelector(".toolbar")?.after(chips);
    chips.onclick=e=>{const b=e.target.closest("[data-stock-filter]");if(!b)return;chips.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));applyInventoryFilter(b.dataset.stockFilter)};
  }
}
function applyInventoryFilter(filter){
  const root=$("#content");if(!root)return;const q=String(root.querySelector("#search")?.value||"").toLowerCase().trim();
  root.querySelectorAll("#rows tr").forEach(tr=>{const t=tr.textContent.toLowerCase();let ok=t.includes(q);if(filter==="low")ok=ok&&(t.includes("bajo")||t.includes("stock bajo"));if(filter==="out")ok=ok&&(t.includes("agotado")||t.includes("sin stock"));if(filter==="ok")ok=ok&&(t.includes("disponible")||t.includes("en stock"));tr.style.display=ok?"":"none"});
}
function enhanceSuppliers(){
  const root=$("#content");if(!root||!root.querySelector("#scSupplierList"))return;
  const card=root.querySelector("#scSupplierList")?.closest(".card");
  if(card&&!root.querySelector(".supplier-ops-toolbar")){
    const bar=document.createElement("div");bar.className="supplier-ops-toolbar";
    bar.innerHTML='<input class="supplier-ops-search" id="supplierOpsSearch" autocomplete="off" placeholder="Buscar proveedor por nombre, contacto, teléfono o correo…"><button class="secondary" id="supplierOpsClear" type="button">Limpiar</button><button class="primary" id="supplierOpsNew" type="button">＋ Nuevo proveedor</button>';
    card.querySelector(".toolbar")?.replaceWith(bar);
    $("#supplierOpsNew")?.addEventListener("click",()=>$("#scNewSupplier")?.click());
    const filter=()=>{const q=String($("#supplierOpsSearch")?.value||"").toLowerCase().trim();root.querySelectorAll("#scSupplierList .client-card").forEach(x=>x.style.display=!q||x.textContent.toLowerCase().includes(q)?"":"none")};
    $("#supplierOpsClear")?.addEventListener("click",()=>{$("#supplierOpsSearch").value="";filter()});$("#supplierOpsSearch")?.addEventListener("input",filter);
  }
  root.querySelectorAll("#scSupplierList .client-card,#scCatalogList .client-card").forEach(x=>x.classList.add("supplier-card-v2"));
}
function enhanceCash(){
  const root=$("#content");if(!root||!root.querySelector(".cash-kpis"))return;const kpis=root.querySelector(".cash-kpis");
  if(!root.querySelector(".cash-ops-summary")){
    const open=String(root.querySelector(".cash-kpi strong")?.textContent||"").toUpperCase()==="ABIERTA",s=document.createElement("div");s.className="cash-ops-summary";
    s.innerHTML='<div><b>'+(open?"Caja operativa":"Caja lista para abrir")+'</b><small>'+(open?"Registra ingresos, egresos y ventas con trazabilidad.":"Abre una caja para comenzar a registrar operaciones.")+'</small></div>';kpis.before(s);
  }
  root.querySelectorAll("#cashIncome,#cashExpense,#openCashTop,#closeCashTop,#downloadCashExcel,#downloadCashExcel2,#cashStaff").forEach(b=>{if(b.dataset.opsBound)return;b.dataset.opsBound="1";b.addEventListener("click",()=>{b.classList.add("ops-clicked");later(()=>b.classList.remove("ops-clicked"),260)},{passive:true})});
}
function improveButtonReliability(){
  if(bound)return;bound=true;
  document.addEventListener("click",e=>{const b=e.target.closest?.("button");if(!b||b.disabled||b.dataset.allowRapid==="1"||b.dataset.noLock==="1")return;const important=b.classList.contains("primary")||b.classList.contains("danger")||b.id?.startsWith("cash")||b.dataset.action;if(!important)return;if(b.dataset.opsLock==="1"){e.preventDefault();e.stopImmediatePropagation();return}b.dataset.opsLock="1";later(()=>{if(document.contains(b))b.dataset.opsLock="0"},650)},true);
}
function enhance(){addMobileMore();enhanceInventory();enhanceSuppliers();enhanceCash();const v=activeView();if(v!==lastView){lastView=v;later(()=>$("#content")?.classList.remove("view-switching"),260)}}
function boot(){improveButtonReliability();const observer=new MutationObserver(enhance);observer.observe(document.body,{childList:true,subtree:true});later(enhance,120);window.addEventListener("resize",()=>{if(window.innerWidth>760)toggleMore(false)})}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
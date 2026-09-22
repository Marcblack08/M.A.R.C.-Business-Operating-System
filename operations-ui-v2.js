/* M.A.R.C. · Operations UI v2
   Branch-only enhancement layer. No backend/schema replacement. */
(()=>{"use strict";
const wait=(fn,ms=40)=>setTimeout(fn,ms);
const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let lastView="";
function activeView(){return document.querySelector(".sidebar nav button.active")?.dataset.view||""}

function enhanceInventory(){
 const root=document.querySelector("#content"); if(!root||!root.querySelector("#rows")||!root.querySelector("#importPdf"))return;
 if(root.querySelector(".inventory-ops-header"))return;
 const actions=root.querySelector(".head>div:last-child");
 if(actions){
   const wrap=document.createElement("div");wrap.className="inventory-ops-header";
   wrap.innerHTML='<div><span class="inventory-ops-badge">▣</span><div><b>Inventario inteligente</b><small>Gestiona productos, stock, fotos y catálogos desde un solo lugar.</small></div></div><div class="inventory-ops-tools"></div>';
   const tools=wrap.querySelector(".inventory-ops-tools");
   [...actions.querySelectorAll("button")].forEach(b=>{if(b.id==="new"||b.id==="importPdf")tools.appendChild(b)});
   root.querySelector(".head").after(wrap);
 }
 const table=root.querySelector(".card.table");
 if(table&&!root.querySelector(".inventory-filter-chips")){
   const chips=document.createElement("div");chips.className="inventory-filter-chips";
   chips.innerHTML='<button class="inventory-filter-chip active" data-stock-filter="all">Todos</button><button class="inventory-filter-chip" data-stock-filter="ok">Disponibles</button><button class="inventory-filter-chip" data-stock-filter="low">Stock bajo</button><button class="inventory-filter-chip" data-stock-filter="out">Agotados</button>';
   table.querySelector(".toolbar")?.after(chips);
   chips.addEventListener("click",e=>{
     const b=e.target.closest("[data-stock-filter]");if(!b)return;
     chips.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));
     const filter=b.dataset.stockFilter,q=String(root.querySelector("#search")?.value||"").toLowerCase();
     const rows=[...root.querySelectorAll("#rows tr")];
     rows.forEach(tr=>{
       const text=tr.textContent.toLowerCase();
       let show=text.includes(q);
       if(filter==="low")show=show&&text.includes("bajo");
       if(filter==="out")show=show&&text.includes("agotado");
       if(filter==="ok")show=show&&text.includes("disponible");
       tr.style.display=show?"":"none";
     });
   });
 }
}

function enhanceSuppliers(){
 const root=document.querySelector("#content");if(!root||!root.querySelector("#scSupplierList"))return;
 if(root.querySelector(".supplier-ops-toolbar"))return;
 const firstCard=root.querySelector("#scSupplierList")?.closest(".card");
 if(firstCard){
   const bar=document.createElement("div");bar.className="supplier-ops-toolbar";
   bar.innerHTML='<input class="supplier-ops-search" id="supplierOpsSearch" placeholder="Buscar proveedor por nombre, contacto, teléfono o correo…"><button class="secondary" id="supplierOpsClear">Limpiar</button><button class="primary" id="supplierOpsNew">＋ Nuevo proveedor</button>';
   firstCard.querySelector(".toolbar")?.replaceWith(bar);
   document.querySelector("#supplierOpsNew").onclick=()=>document.querySelector("#scNewSupplier")?.click();
   document.querySelector("#supplierOpsClear").onclick=()=>{const i=document.querySelector("#supplierOpsSearch");if(i)i.value="";filter()};
   const filter=()=>{
     const q=String(document.querySelector("#supplierOpsSearch")?.value||"").toLowerCase().trim();
     root.querySelectorAll("#scSupplierList .client-card").forEach(card=>card.style.display=!q||card.textContent.toLowerCase().includes(q)?"":"none");
   };
   document.querySelector("#supplierOpsSearch").oninput=filter;
 }
 // Make catalog cards visually stronger and prevent accidental double taps.
 root.querySelectorAll("#scSupplierList .client-card,#scCatalogList .client-card").forEach(card=>card.classList.add("supplier-card-v2"));
}

function enhanceCash(){
 const root=document.querySelector("#content");if(!root||!root.querySelector(".cash-kpis"))return;
 if(root.querySelector(".cash-ops-summary"))return;
 const kpis=root.querySelector(".cash-kpis");
 const summary=document.createElement("div");summary.className="cash-ops-summary";
 const open=root.querySelector(".cash-kpi strong")?.textContent==="ABIERTA";
 summary.innerHTML='<div class="cash-ops-summary-text"><b>'+ (open?"Caja operativa":"Caja lista para abrir") +'</b><small>'+ (open?"Registra ingresos y egresos y mantén el cierre bajo control.":"Abre una caja para comenzar a registrar operaciones.") +'</small></div>';
 kpis.before(summary);
 summary.style.cssText="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;padding:12px 15px;border:1px solid rgba(11,115,230,.14);border-radius:15px;background:linear-gradient(135deg,rgba(11,115,230,.05),rgba(25,184,216,.035));";
 // add confirmation feedback to all important cash actions
 root.querySelectorAll("#cashIncome,#cashExpense,#openCashTop,#closeCashTop,#downloadCashExcel,#downloadCashExcel2,#cashStaff").forEach(btn=>{
   if(btn.dataset.opsBound)return;btn.dataset.opsBound="1";
   btn.addEventListener("click",()=>{btn.classList.add("ops-clicked");wait(()=>btn.classList.remove("ops-clicked"),250)},{passive:true});
 });
}

function improveButtonReliability(){
 // Guard against double-submit/double-tap on action buttons without touching existing handlers.
 document.addEventListener("click",e=>{
   const b=e.target.closest("button");
   if(!b||b.disabled||b.type==="button"&&b.dataset.allowRapid==="1")return;
   const important=b.classList.contains("primary")||b.classList.contains("danger")||b.id?.startsWith("cash")||b.dataset.action;
   if(!important)return;
   if(b.dataset.opsLock==="1"){e.preventDefault();e.stopImmediatePropagation();return}
   if(b.dataset.noLock==="1")return;
   b.dataset.opsLock="1";
   wait(()=>{if(document.contains(b))b.dataset.opsLock="0"},700);
 },true);
}
function boot(){
 improveButtonReliability();
 const observer=new MutationObserver(()=>{
   const v=activeView();
   if(v!==lastView){lastView=v;wait(()=>{enhanceInventory();enhanceSuppliers();enhanceCash()})}
   else{enhanceInventory();enhanceSuppliers();enhanceCash()}
 });
 observer.observe(document.body,{childList:true,subtree:true});
 wait(()=>{lastView=activeView();enhanceInventory();enhanceSuppliers();enhanceCash()},120);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
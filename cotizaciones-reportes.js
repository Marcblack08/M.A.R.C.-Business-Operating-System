/* M.A.R.C. — organización de cotizaciones + informes por cliente */
(function(){
'use strict';
const sb=()=>window.supabaseClient;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>'S/ '+Number(v||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
const dateKey=v=>{const d=new Date(v);if(Number.isNaN(d.getTime()))return '';return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(d)};
const dateShort=v=>{const d=new Date(v);if(Number.isNaN(d.getTime()))return '—';return new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Lima'}).format(d)};
const dateLong=v=>{const d=new Date(v);if(Number.isNaN(d.getTime()))return '—';return new Intl.DateTimeFormat('es-PE',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Lima'}).format(d)};
const clientName=q=>String(q?.cliente_snapshot?.nombre_razon_social||'Venta directa').trim()||'Venta directa';
let quoteRows=[];
let quoteFilters={search:'',day:'',client:'all'};
let quoteBusy=false;

function styles(){
 if(document.getElementById('marc-reportes-style'))return;
 const s=document.createElement('style');s.id='marc-reportes-style';s.textContent=`
 .marc-q-reportbar{display:grid;grid-template-columns:minmax(190px,1.7fr) minmax(150px,1fr) minmax(170px,1fr) auto;gap:9px;align-items:end;margin:0 0 13px;padding:12px;border:1px solid #dce8f2;border-radius:14px;background:linear-gradient(135deg,#f8fbff,#eef6fd)}
 .marc-q-reportbar label{display:grid;gap:5px;color:#55708b;font-size:10px;font-weight:800}.marc-q-reportbar input,.marc-q-reportbar select{width:100%;box-sizing:border-box;border:1px solid #cdddea;border-radius:9px;background:#fff;color:#173b5d;padding:9px;font-size:11px}
 .marc-q-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:13px}.marc-q-kpi{background:#fff;border:1px solid #dce8f2;border-radius:13px;padding:11px 13px}.marc-q-kpi small{display:block;color:#7088a0;font-size:9px;font-weight:800;text-transform:uppercase}.marc-q-kpi b{display:block;color:#12385e;font-size:19px;margin-top:3px}
 .marc-day-title{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 3px 7px;color:#23496c;font-size:12px;font-weight:800}.marc-day-title span{color:#7890a7;font-size:10px;font-weight:600}
 .marc-q-table td{vertical-align:middle}.marc-q-date{font-size:10px;color:#607c97;white-space:nowrap}.marc-q-client{font-weight:700;color:#173b5d}.marc-q-client small{display:block;color:#7c92a7;font-weight:500;margin-top:2px}.marc-q-actions{white-space:nowrap}.marc-q-actions button{margin:2px}.marc-q-empty{padding:38px 15px;text-align:center;color:#7189a1;font-size:12px;background:#fff;border:1px dashed #cfdeea;border-radius:12px}
 .marc-client-report{position:fixed;inset:0;z-index:300;background:#071d38aa;backdrop-filter:blur(6px);display:grid;place-items:center;padding:14px}.marc-client-report-box{width:min(900px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:20px;box-shadow:0 20px 70px #061c35aa}.marc-client-report-head{padding:20px 22px;background:linear-gradient(135deg,#062d54,#087cf5);color:#fff;display:flex;justify-content:space-between;gap:15px}.marc-client-report-head h2{margin:3px 0 0;font-size:21px}.marc-client-report-head p{margin:0;color:#dceeff;font-size:10px}.marc-client-close{border:0;background:#ffffff22;color:#fff;border-radius:10px;width:35px;height:35px;font-size:22px}.marc-client-body{padding:18px}.marc-client-info{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:15px}.marc-client-info>div{border:1px solid #dce7f0;border-radius:12px;padding:11px;background:#f8fbfe}.marc-client-info small{display:block;color:#7189a1;font-size:9px;font-weight:800;text-transform:uppercase}.marc-client-info b{display:block;color:#173b5d;margin-top:3px;font-size:13px}.marc-client-section{margin-top:16px}.marc-client-section h3{margin:0 0 8px;color:#244a6e;font-size:13px}.marc-client-report table{width:100%;border-collapse:collapse}.marc-client-report th,.marc-client-report td{padding:8px;border-bottom:1px solid #e4edf4;text-align:left;font-size:10px}.marc-client-report th{color:#59748e;background:#f2f7fb}.marc-client-total{display:flex;justify-content:flex-end;gap:15px;align-items:center;margin-top:13px;font-size:12px;color:#5e7892}.marc-client-total strong{font-size:18px;color:#087cf5}.marc-client-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.marc-client-report-btn{margin-left:5px!important}
 @media(max-width:800px){.marc-q-reportbar{grid-template-columns:1fr 1fr}.marc-q-reportbar .marc-q-refresh{grid-column:1/-1}.marc-q-kpis{grid-template-columns:1fr 1fr}.marc-client-info{grid-template-columns:1fr 1fr}.marc-client-report-box{max-height:95vh}}
 @media(max-width:520px){.marc-q-reportbar{grid-template-columns:1fr}.marc-q-kpis{grid-template-columns:1fr 1fr}.marc-client-info{grid-template-columns:1fr}.marc-client-report th:nth-child(3),.marc-client-report td:nth-child(3){display:none}}
 `;document.head.appendChild(s);
}
async function currentUser(){const s=sb();if(!s)throw Error('No hay conexión con Supabase');const r=await s.auth.getUser();if(r.error||!r.data?.user)throw Error('Necesita iniciar sesión');return r.data.user}
async function loadQuotes(){const u=await currentUser();const r=await sb().from('cotizaciones').select('*').eq('user_id',u.id).order('created_at',{ascending:false});if(r.error)throw Error(r.error.message);return r.data||[]}
function filteredQuotes(){
 const z=quoteFilters.search.trim().toLowerCase();
 return quoteRows.filter(q=>{const name=clientName(q);const text=`${q.numero||''} ${name} ${q.ubicacion||''}`.toLowerCase();return (!z||text.includes(z))&&(!quoteFilters.day||dateKey(q.created_at)===quoteFilters.day)&&(quoteFilters.client==='all'||name===quoteFilters.client)});
}
function groupDays(rows){const m=new Map();rows.forEach(q=>{const k=dateKey(q.created_at)||'sin-fecha';if(!m.has(k))m.set(k,[]);m.get(k).push(q)});return [...m.entries()].sort((a,b)=>b[0].localeCompare(a[0]))}
function actionButtons(q){return `<span class="marc-q-actions"><button class="table-action" data-vpdf="${esc(q.id)}">PDF</button><button class="table-action" data-report-edit="${esc(q.id)}">✏ Editar</button><button class="table-action marc-delete-btn" data-delete-quote="${esc(q.id)}">🗑</button></span>`}
function drawQuoteReport(){
 const box=document.querySelector('#qv3list');if(!box)return;
 const rows=filteredQuotes(),days=groupDays(rows),total=rows.reduce((a,q)=>a+Number(q.total||0),0),clients=new Set(rows.map(clientName)).size;
 const old=box.querySelector('.marc-q-report-root');if(old)old.remove();
 const root=document.createElement('div');root.className='marc-q-report-root';
 root.innerHTML=`<div class="marc-q-kpis"><div class="marc-q-kpi"><small>Cotizaciones</small><b>${rows.length}</b></div><div class="marc-q-kpi"><small>Clientes</small><b>${clients}</b></div><div class="marc-q-kpi"><small>Total cotizado</small><b>${money(total)}</b></div><div class="marc-q-kpi"><small>Días con actividad</small><b>${days.length}</b></div></div>`;
 if(!rows.length){root.innerHTML+=`<div class="marc-q-empty">No hay cotizaciones que coincidan con los filtros.</div>`;box.innerHTML='';box.appendChild(root);return}
 let html='';days.forEach(([day,items])=>{const dayTotal=items.reduce((a,q)=>a+Number(q.total||0),0);html+=`<div class="marc-day-title"><span>📅 ${day==='sin-fecha'?'Sin fecha':dateLong(items[0].created_at)}</span><span>${items.length} cotización(es) · ${money(dayTotal)}</span></div><div class="table-scroll"><table class="marc-q-table"><thead><tr><th>Fecha</th><th>Número</th><th>Cliente</th><th>Ubicación</th><th>Total</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${items.map(q=>`<tr><td class="marc-q-date">${dateShort(q.created_at)}</td><td><b>${esc(q.numero)}</b></td><td class="marc-q-client">${esc(clientName(q))}<small>${esc(q.cliente_snapshot?.documento||'')}</small></td><td>${esc(q.ubicacion||'—')}</td><td><b>${money(q.total)}</b></td><td>${esc(q.estado||'BORRADOR')}</td><td>${actionButtons(q)}</td></tr>`).join('')}</tbody></table></div>`});
 root.innerHTML+=html;box.innerHTML='';box.appendChild(root);
 root.querySelectorAll('[data-report-edit]').forEach(b=>b.onclick=()=>window.MARC_EDIT_QUOTE?.(b.dataset.reportEdit));
 root.querySelectorAll('[data-vpdf]').forEach(b=>b.onclick=e=>{e.preventDefault();window.MARC_GENERATE_QUOTE_PDF?.(b.dataset.vpdf)});
 root.querySelectorAll('[data-delete-quote]').forEach(b=>b.onclick=()=>window.MARC_DELETE_QUOTE?.(b.dataset.deleteQuote,b));
}
function mountQuoteControls(){
 const list=document.querySelector('#qv3list');if(!list||list.dataset.marcReports==='1')return;list.dataset.marcReports='1';styles();
 const panel=list.closest('.panel');if(!panel)return;
 const toolbar=panel.querySelector('.table-toolbar');if(toolbar)toolbar.style.display='none';
 const bar=document.createElement('div');bar.className='marc-q-reportbar';bar.innerHTML=`<label>Buscar<input id="marcQSearch" placeholder="Número, cliente o ubicación"></label><label>Ver por día<input id="marcQDay" type="date"></label><label>Cliente<select id="marcQClient"><option value="all">Todos los clientes</option></select></label><button class="btn btn-secondary marc-q-refresh" id="marcQRefresh">↻ Actualizar</button>`;
 list.parentElement.insertBefore(bar,list);
 bar.querySelector('#marcQSearch').oninput=e=>{quoteFilters.search=e.target.value;drawQuoteReport()};
 bar.querySelector('#marcQDay').oninput=e=>{quoteFilters.day=e.target.value;drawQuoteReport()};
 bar.querySelector('#marcQClient').onchange=e=>{quoteFilters.client=e.target.value;drawQuoteReport()};
 bar.querySelector('#marcQRefresh').onclick=async()=>{await refreshQuotes();};
 refreshQuotes();
}
async function refreshQuotes(){if(quoteBusy)return;quoteBusy=true;try{quoteRows=await loadQuotes();const sel=document.querySelector('#marcQClient');if(sel){const keep=quoteFilters.client;const names=[...new Set(quoteRows.map(clientName))].sort((a,b)=>a.localeCompare(b,'es'));sel.innerHTML='<option value="all">Todos los clientes</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');sel.value=names.includes(keep)?keep:'all';quoteFilters.client=sel.value}drawQuoteReport()}catch(e){const box=document.querySelector('#qv3list');if(box)box.innerHTML=`<div class="marc-q-empty">No se pudo cargar el resumen: ${esc(e.message)}</div>`}finally{quoteBusy=false}}
function watchQuotes(){
 if(location.hash.replace(/^#/,'')!=='quotes')return;mountQuoteControls();
}
function openClientReport(client){
 document.querySelector('#marcClientReport')?.remove();
 const modal=document.createElement('div');modal.id='marcClientReport';modal.className='marc-client-report';modal.innerHTML=`<div class="marc-client-report-box"><header class="marc-client-report-head"><div><p>INFORME DEL CLIENTE</p><h2>${esc(client.nombre_razon_social)}</h2></div><button class="marc-client-close" type="button">×</button></header><div class="marc-client-body"><div class="marc-client-info"><div><small>Documento</small><b>${esc(client.tipo_documento||'—')} ${esc(client.documento||'—')}</b></div><div><small>Contacto</small><b>${esc(client.nombre_contacto||'—')}</b></div><div><small>Teléfono</small><b>${esc(client.telefono||'—')}</b></div><div><small>Correo</small><b>${esc(client.correo||'—')}</b></div></div><div id="marcClientReportContent"><div class="marc-q-empty">Cargando historial…</div></div></div></div>`;document.body.appendChild(modal);modal.querySelector('.marc-client-close').onclick=()=>modal.remove();modal.addEventListener('click',e=>{if(e.target===modal)modal.remove()});loadClientHistory(client,modal.querySelector('#marcClientReportContent'));
}
async function loadClientHistory(client,box){
 try{const u=await currentUser();const r=await sb().from('cotizaciones').select('*').eq('user_id',u.id).order('created_at',{ascending:false});if(r.error)throw Error(r.error.message);const all=r.data||[];const name=String(client.nombre_razon_social||'').trim().toLowerCase();const rows=all.filter(q=>String(q.cliente_id||'')===String(client.id)||clientName(q).toLowerCase()===name);const total=rows.reduce((a,q)=>a+Number(q.total||0),0);const days=new Set(rows.map(q=>dateKey(q.created_at)).filter(Boolean)).size;box.innerHTML=`<div class="marc-client-info"><div><small>Cotizaciones</small><b>${rows.length}</b></div><div><small>Total cotizado</small><b>${money(total)}</b></div><div><small>Días con actividad</small><b>${days}</b></div><div><small>Última cotización</small><b>${rows[0]?dateShort(rows[0].created_at):'—'}</b></div></div><div class="marc-client-section"><h3>Historial de cotizaciones</h3>${rows.length?`<div class="table-scroll"><table><thead><tr><th>Fecha</th><th>Cotización</th><th>Ubicación</th><th>Estado</th><th>Total</th><th></th></tr></thead><tbody>${rows.map(q=>`<tr><td>${dateShort(q.created_at)}</td><td><b>${esc(q.numero)}</b></td><td>${esc(q.ubicacion||'—')}</td><td>${esc(q.estado||'BORRADOR')}</td><td><b>${money(q.total)}</b></td><td><button class="table-action" data-vpdf="${esc(q.id)}">PDF</button></td></tr>`).join('')}</tbody></table></div><div class="marc-client-total"><span>Total histórico</span><strong>${money(total)}</strong></div>`:'<div class="marc-q-empty">Este cliente todavía no tiene cotizaciones asociadas.</div>'}</div>`;box.querySelectorAll('[data-vpdf]').forEach(b=>b.onclick=()=>window.MARC_GENERATE_QUOTE_PDF?.(b.dataset.vpdf))}catch(e){box.innerHTML=`<div class="marc-q-empty">No se pudo cargar el informe: ${esc(e.message)}</div>`}
}
function mountClientButtons(){
 if(location.hash.replace(/^#/,'')!=='clients')return;
 document.querySelectorAll('#clientsTableWrap tbody tr').forEach(tr=>{if(tr.querySelector('.marc-client-report-btn'))return;const edit=tr.querySelector('.client-edit');if(!edit)return;const id=edit.dataset.id;tr.querySelector('td:last-child')?.insertAdjacentHTML('afterbegin',`<button type="button" class="table-action marc-client-report-btn" data-client-report="${esc(id)}">▣ Informe</button>`);tr.querySelector('[data-client-report]')?.addEventListener('click',async()=>{const u=await currentUser();const r=await sb().from('clientes').select('id,tipo_documento,documento,nombre_razon_social,nombre_contacto,telefono,correo,direccion,notas').eq('id',id).eq('user_id',u.id).single();if(r.data)openClientReport(r.data)});});
}
const obs=new MutationObserver(()=>{setTimeout(()=>{styles();watchQuotes();mountClientButtons()},40)});
obs.observe(document.body,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(()=>{styles();watchQuotes();mountClientButtons()},100));
setTimeout(()=>{styles();watchQuotes();mountClientButtons()},500);
})();

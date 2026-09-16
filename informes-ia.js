/* M.A.R.C. — IA para informes técnicos: redacción + reutilización de cotizaciones */
(function(){'use strict';
const sb=()=>window.supabaseClient;const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let selectedClient=null;
function addStyles(){if(document.getElementById('marc-tr-ai-css'))return;const s=document.createElement('style');s.id='marc-tr-ai-css';s.textContent='.tr-ai-line{display:flex;justify-content:space-between;align-items:center;gap:8px}.tr-ai-btn{border:1px solid #b8dcfb;background:#eef8ff;color:#087cf5;border-radius:8px;padding:5px 8px;font-size:9px;font-weight:800;cursor:pointer}.tr-ai-btn:disabled{opacity:.55}.tr-ai-status{font-size:9px;color:#087cf5;margin-top:4px;min-height:12px}.tr-from-quote{display:flex;gap:7px;align-items:center;margin-top:7px;flex-wrap:wrap}.tr-from-quote button{border:1px solid #b8dcfb;background:#eef8ff;color:#087cf5;border-radius:8px;padding:6px 9px;font-size:9px;font-weight:800;cursor:pointer}';document.head.appendChild(s)}
async function currentUser(){const r=await sb().auth.getUser();if(r.error||!r.data?.user)throw Error('Sesión no disponible');return r.data.user}
function context(){const m=document.getElementById('trModal');if(!m)return'';const client=m.querySelector('#trClient'),quote=m.querySelector('#trQuote');return JSON.stringify({cliente:client?.selectedOptions?.[0]?.textContent||'',cotizacion:quote?.selectedOptions?.[0]?.textContent||'',ubicacion:m.querySelector('#trLocation')?.value||'',equipo:m.querySelector('#trEquipment')?.value||'',problema:m.querySelector('#trProblem')?.value||'',diagnostico:m.querySelector('#trDiagnosis')?.value||'',trabajo:m.querySelector('#trWork')?.value||'',materiales:m.querySelector('#trMaterials')?.value||''})}
async function improve(text,ctx){const r=await fetch('/api/improve-quote-description',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({description:text,context:ctx})});const j=await r.json();if(!r.ok||!j.descripcion)throw Error(j.error||'No se pudo mejorar la redacción.');return j.descripcion}
async function improveField(btn,ta){const original=ta.value.trim();if(!original){alert('Primero escribe algo en este campo.');return}btn.disabled=true;const old=btn.textContent;btn.textContent='⏳ Mejorando…';try{ta.value=await improve(original,context())}catch(e){alert(e.message)}finally{btn.disabled=false;btn.textContent=old}}
async function loadQuote(id){const u=await currentUser();const q=await sb().from('cotizaciones').select('*').eq('id',id).eq('user_id',u.id).maybeSingle();if(q.error)throw Error(q.error.message);if(!q.data)throw Error('No se encontró la cotización.');const items=await sb().from('cotizacion_items').select('*').eq('cotizacion_id',id).eq('user_id',u.id).order('orden');if(items.error)throw Error(items.error.message);return{quote:q.data,items:items.data||[]}}
async function fromQuote(){const m=document.getElementById('trModal'),sel=m?.querySelector('#trQuote');if(!m||!sel?.value){alert('Selecciona primero una cotización.');return}const btn=m.querySelector('#trFromQuote');btn.disabled=true;btn.textContent='⏳ Cargando…';try{const {quote,items}=await loadQuote(sel.value);const set=(id,v)=>{const e=m.querySelector(id);if(e&&v!==null&&v!==undefined)e.value=v};set('#trLocation',quote.ubicacion||'');set('#trTitle',`Informe técnico — ${quote.numero||'Cotización'}`);const lines=items.map(x=>`${x.cantidad||1} ${x.unidad||'UND'} — ${x.nombre||''}${x.descripcion?' — '+x.descripcion:''}`).join('\n');if(lines)set('#trWork',lines);if(quote.observaciones)set('#trObservations',quote.observaciones);const st=m.querySelector('#trAiStatus');if(st)st.textContent=`✓ Datos recuperados de ${quote.numero||'la cotización'}: ${items.length} partida(s). Puedes mejorar la redacción con IA.`;selectedClient=quote.cliente_id||null;const c=m.querySelector('#trClient');if(c&&quote.cliente_id)c.value=quote.cliente_id}catch(e){alert(e.message)}finally{btn.disabled=false;btn.textContent='🧠 Usar cotización y preparar informe'}}
function enhanceModal(){addStyles();const m=document.getElementById('trModal');if(!m||m.dataset.aiReady==='1')return;m.dataset.aiReady='1';const quote=m.querySelector('#trQuote');if(quote){const wrap=document.createElement('div');wrap.className='tr-from-quote';wrap.innerHTML='<button type="button" id="trFromQuote">🧠 Usar cotización y preparar informe</button><span id="trAiStatus" class="tr-ai-status"></span>';quote.closest('.tr-field')?.appendChild(wrap);wrap.querySelector('#trFromQuote').onclick=fromQuote}['trDiagnosis','trWork','trMaterials','trRecommendations','trConclusions','trObservations'].forEach(id=>{const ta=m.querySelector('#'+id);if(!ta)return;const label=ta.parentElement.querySelector('label');if(!label)return;const line=document.createElement('div');line.className='tr-ai-line';line.innerHTML=`<span>${esc(label.textContent)}</span><button type="button" class="tr-ai-btn">✨ Mejorar con IA</button>`;label.replaceWith(line);line.querySelector('button').onclick=()=>improveField(line.querySelector('button'),ta)})}
function waitFor(selector,timeout=4000){return new Promise(resolve=>{const found=document.querySelector(selector);if(found)return resolve(found);const start=Date.now();const ob=new MutationObserver(()=>{const el=document.querySelector(selector);if(el){ob.disconnect();resolve(el)}else if(Date.now()-start>=timeout){ob.disconnect();resolve(null)}});ob.observe(document.body,{childList:true,subtree:true});setTimeout(()=>{ob.disconnect();resolve(document.querySelector(selector)||null)},timeout)})}
async function openReportsShell(){
  if(typeof window.reportsPage!=='function')throw Error('El módulo de informes técnicos no está disponible.');
  const html=window.reportsPage();
  const content=document.getElementById('content');
  if(content&&typeof html==='string')content.innerHTML=html;
  await waitFor('#trNew');
}
window.openTechnicalReportForClient=async function(clientId){
  selectedClient=clientId||null;
  try{
    await openReportsShell();
    const btn=document.querySelector('#trNew');
    if(!btn)throw Error('No se pudo abrir el creador de informes técnicos.');
    btn.click();
    const sel=await waitFor('#trClient');
    if(selectedClient&&sel){sel.value=String(selectedClient);sel.dispatchEvent(new Event('change',{bubbles:true}))}
  }catch(e){alert(e.message)}
};
window.openTechnicalReportById=async function(id){
  try{
    await openReportsShell();
    const btn=await waitFor(`[data-tr-edit="${CSS.escape(String(id))}"]`);
    if(!btn)throw Error('No se encontró el informe técnico.');
    btn.click();
  }catch(e){alert(e.message)}
};
const ob=new MutationObserver(()=>enhanceModal());ob.observe(document.body,{childList:true,subtree:true});setTimeout(enhanceModal,300);
})();

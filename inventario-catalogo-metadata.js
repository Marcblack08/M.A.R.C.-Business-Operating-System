/* M.A.R.C. — Metadatos del inventario desde PDF de proveedor */
(()=>{
'use strict';
const sb=window.supabaseClient;if(!sb)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories=['CCTV','Cámaras','DVR / NVR','Discos duros','Almacenamiento','Redes','Computación','Accesorios de computación','Cableado','Conectores','Fuentes de poder','Audio / Video','Seguridad electrónica','Eléctrico','Ferretería','Construcción','Pintura','Automatización','Otros'];
let lastInfo=null;
function enhanceGeneralModal(){
 const m=document.querySelector('#marcCatGeneralModal');if(!m||m.querySelector('#mgiCategoriaInventario'))return;
 const rubro=m.querySelector('#mgiRubro')?.closest('label');if(!rubro)return;
 const box=document.createElement('label');box.id='marcInventoryCategoryBox';
 box.innerHTML=`Categoría predeterminada de inventario *<select id="mgiCategoriaInventario"><option value="">Seleccionar categoría…</option>${categories.map(x=>`<option>${esc(x)}</option>`).join('')}<option value="__CUSTOM__">Otra / escribir...</option></select><input id="mgiCategoriaCustom" placeholder="Ej.: Accesorios USB" style="display:none;margin-top:6px"><small>Se aplicará como categoría de respaldo a los productos del PDF que no tengan una categoría propia detectada.</small>`;
 rubro.parentElement?.appendChild(box);
 const sel=box.querySelector('#mgiCategoriaInventario'),custom=box.querySelector('#mgiCategoriaCustom');
 sel.onchange=()=>custom.style.display=sel.value==='__CUSTOM__'?'':'none';
 m.querySelector('[data-ok]')?.addEventListener('click',()=>setTimeout(()=>{
   const categoria=sel.value==='__CUSTOM__'?custom.value.trim():sel.value;
   if(!categoria){alert('Selecciona una categoría predeterminada de inventario.');return;}
   const info=window.__MARC_CATALOG_GENERAL||{};info.categoria=categoria;window.__MARC_CATALOG_GENERAL=info;
 },0),true);
}
async function propagate(){
 const info=window.__MARC_CATALOG_GENERAL;if(!info?.proveedor||!info?.categoria)return;
 const u=(await sb.auth.getUser()).data?.user;if(!u)return;
 const input=document.querySelector('#cat4Input'),file=input?.files?.[0];if(!file)return;
 const c=await sb.from('catalogos_pdf').select('id').eq('user_id',u.id).eq('nombre',file.name).order('created_at',{ascending:false}).limit(1).maybeSingle();if(c.error||!c.data)return;
 const id=c.data.id;
 await sb.from('catalogos_pdf').update({informacion_general:{...info},proveedor_nombre:info.proveedor,rubro:info.rubro||null}).eq('id',id).eq('user_id',u.id);
 const r=await sb.from('catalogo_items').select('id,datos_extra,categoria,proveedor').eq('catalogo_id',id).eq('user_id',u.id);if(r.error)return;
 for(const x of r.data||[]){const extra={...(x.datos_extra||{}),informacion_general:{...(x.datos_extra?.informacion_general||{}),proveedor:info.proveedor,categoria:info.categoria,rubro:info.rubro||null}};await sb.from('catalogo_items').update({proveedor:x.proveedor||info.proveedor,categoria:x.categoria||info.categoria,datos_extra:extra}).eq('id',x.id).eq('user_id',u.id)}
}
function enhanceEditor(){
 const m=document.querySelector('#catEditorModal'),rows=document.querySelector('#catEditorRows');if(!m||!rows)return;
 if(!m.querySelector('.marc-inventory-metadata-banner')){const row=rows.querySelector('.cat-editor-row');if(!row)return;const p=row.querySelector('[data-k="proveedor"]')?.value||'',c=row.querySelector('[data-k="categoria"]')?.value||'';const b=document.createElement('div');b.className='marc-inventory-metadata-banner';b.innerHTML=`<b>Catálogo:</b> proveedor <strong>${esc(p||'—')}</strong> · categoría predeterminada <strong>${esc(c||'—')}</strong><br><small>La categoría/proveedor se pueden corregir por producto antes de importar.</small>`;m.querySelector('.cat-editor-tools')?.after(b)}
}
function css(){if(document.querySelector('#marc-inventory-meta-css'))return;const s=document.createElement('style');s.id='marc-inventory-meta-css';s.textContent='#marcInventoryCategoryBox{display:grid;gap:5px;margin-top:10px;font-size:10px;font-weight:700;color:#52708e}#marcInventoryCategoryBox select,#marcInventoryCategoryBox input{border:1px solid #d2e1ed;border-radius:9px;padding:10px;background:#fff;color:#183b60;font-size:12px}#marcInventoryCategoryBox small{font-size:9px;font-weight:400;color:#7891a8}.marc-inventory-metadata-banner{margin:10px 0;padding:10px 12px;border:1px solid #cfe2f3;background:#f5fbff;border-radius:12px;color:#385977;font-size:11px}.marc-inventory-metadata-banner small{color:#6d86a0}';document.head.appendChild(s)}
function start(){css();new MutationObserver(()=>{enhanceGeneralModal();enhanceEditor()}).observe(document.body,{childList:true,subtree:true});enhanceGeneralModal();enhanceEditor();setInterval(()=>{if(window.__MARC_CATALOG_GENERAL?.categoria&&window.__MARC_CATALOG_GENERAL!==lastInfo){lastInfo=window.__MARC_CATALOG_GENERAL;propagate().catch(()=>{})}},1800)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else setTimeout(start,300);
})();

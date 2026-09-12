/* M.A.R.C. — Catálogos PDF. Motor único, robusto y página por página. */
(function(){
'use strict';
const BUCKET='catalog-pdfs';
const esc=v=>String(v??'').replace(/[&<>\'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const num=v=>{let s=String(v??'').replace(/[^0-9.,-]/g,'').trim();if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(',','.');const n=Number(s);return Number.isFinite(n)?n:0};
let running=false;
const baseRender=window.render;
window.render=function(section='dashboard'){
 const old=document.querySelector('#catalogPanel');
 if(section!=='inventory'){if(old)old.hidden=true;return baseRender(section)}
 baseRender(section);setTimeout(()=>{const p=mount();if(p)p.hidden=false},0);
};
function mount(){
 const main=document.querySelector('.main');if(!main)return null;let p=document.querySelector('#catalogPanel');if(p)return p;
 p=document.createElement('section');p.id='catalogPanel';p.className='panel catalog-panel';
 p.innerHTML=`<div class="cat-head"><div><p class="eyebrow">M.A.R.C. / CATÁLOGOS</p><h2>Catálogos PDF</h2><p>Lectura segura, una página a la vez.</p></div><div class="cat-engine"><b>Motor único</b><span>Texto + visión IA</span></div></div><div class="cat-upload-grid"><label class="cat-upload"><input id="ownCatalogFile" type="file" accept="application/pdf,.pdf"><span>📘</span><b>Mi catálogo</b><small>Precio → venta</small><strong>Seleccionar PDF</strong></label><label class="cat-upload"><input id="supplierCatalogFile" type="file" accept="application/pdf,.pdf"><span>🏢</span><b>Catálogo de proveedor</b><small>Precio → compra</small><strong>Seleccionar PDF</strong></label></div><div id="catalogProgress" class="cat-progress" hidden></div><div id="catalogList" class="cat-list">Cargando catálogos...</div><div id="catalogItems" class="cat-items" hidden></div>`;
 main.appendChild(p);
 p.querySelector('#ownCatalogFile').onchange=e=>handle(e.target.files?.[0],'PROPIO');
 p.querySelector('#supplierCatalogFile').onchange=e=>handle(e.target.files?.[0],'PROVEEDOR');
 load();return p;
}
async function user(){const r=await supabaseClient.auth.getUser();if(r.error||!r.data.user)throw Error('Tu sesión expiró.');return r.data.user}
function progress(t){const e=document.querySelector('#catalogProgress');if(e){e.hidden=false;e.textContent=t}}
async function load(){
 const w=document.querySelector('#catalogList');if(!w)return;
 try{const u=await user();const r=await supabaseClient.from('catalogos_pdf').select('id,nombre,tipo,proveedor,paginas,estado,paginas_procesadas,productos_encontrados,error_detalle').eq('user_id',u.id).order('created_at',{ascending:false});if(r.error)throw r.error;const rows=r.data||[];
 w.innerHTML=rows.length?rows.map(c=>{const s=String(c.estado||'').toLowerCase();const p=Number(c.paginas_procesadas||0);let info='';if(s==='procesando')info=`Página ${p}/${c.paginas||'?'} · ${c.productos_encontrados||0} productos`;else if(s==='procesado')info=`✓ ${c.productos_encontrados||0} productos listos`;else info=`⚠ ${esc(c.error_detalle||`Detenido en página ${p+1}`)}`;return `<article class="cat-row"><div class="cat-file">PDF</div><div class="cat-main"><b>${esc(c.nombre)}</b><span>${c.tipo==='PROVEEDOR'?'Proveedor':'Propio'} · ${c.paginas||'?'} páginas</span><small>${info}</small></div>${s==='procesado'?`<button type="button" class="btn btn-secondary cat-view" data-id="${c.id}">📦 Revisar</button>`:''}${s==='procesando'||s==='error'?`<button type="button" class="btn btn-secondary cat-resume" data-id="${c.id}">▶ ${s==='error'?'Reintentar':'Continuar'}</button>`:''}<button type="button" class="cat-delete" data-id="${c.id}">×</button></article>`}).join(''):'<div class="cat-empty"><b>📚 No hay catálogos</b><span>Selecciona un PDF arriba.</span></div>';
 w.querySelectorAll('.cat-view').forEach(b=>b.onclick=()=>showItems(b.dataset.id));w.querySelectorAll('.cat-resume').forEach(b=>b.onclick=()=>resume(b.dataset.id));w.querySelectorAll('.cat-delete').forEach(b=>b.onclick=()=>removeCatalog(b.dataset.id));
 }catch(e){w.innerHTML=`<div class="cat-empty">${esc(e.message)}</div>`}
}
async function handle(file,tipo){
 if(!file)return;if(file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name)){alert('Selecciona un PDF.');return}if(file.size>95*1024*1024){alert('El PDF supera 95 MB.');return}
 try{const u=await user();progress('Subiendo '+file.name+'...');const path=`${u.id}/${crypto.randomUUID()}.pdf`;let r=await supabaseClient.storage.from(BUCKET).upload(path,file,{contentType:'application/pdf',upsert:false});if(r.error)throw r.error;r=await supabaseClient.from('catalogos_pdf').insert({user_id:u.id,nombre:file.name,tipo,archivo_path:path,tamano_bytes:file.size,estado:'PROCESANDO',paginas_procesadas:0,bloques_total:0,bloque_actual:0,productos_encontrados:0,error_detalle:null}).select('id').single();if(r.error){await supabaseClient.storage.from(BUCKET).remove([path]);throw r.error}await process(file,r.data.id,tipo,0);await load()}catch(e){progress('Error: '+e.message);await load()}
}
async function pdfjs(){if(window.pdfjsLib)return;await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=resolve;s.onerror=()=>reject(Error('No se pudo cargar PDF.js.'));document.head.appendChild(s)});if(!window.pdfjsLib)throw Error('No se pudo cargar PDF.js.');window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
async function analyzeImage(page,tipo,pagina){
 const v0=page.getViewport({scale:1});
 const scale=Math.min(1.25,Math.max(1.0,1200/Math.max(v0.width,1)));
 const v=page.getViewport({scale});
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);
 const ctx=canvas.getContext('2d',{alpha:false});await page.render({canvasContext:ctx,viewport:v}).promise;
 let image=canvas.toDataURL('image/jpeg',.56);canvas.width=1;canvas.height=1;
 let last='';
 for(let attempt=1;attempt<=3;attempt++){
   try{
     progress(`🧠 IA leyendo página ${pagina} · intento ${attempt}/3`);
     const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),65000);
     const r=await fetch('/api/analyze-catalog-page',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,tipo,pagina}),signal:controller.signal});
     clearTimeout(timer);
     const j=await r.json().catch(()=>({}));
     if(r.ok&&Array.isArray(j.items))return j.items;
     last=j.detail||j.error||`HTTP ${r.status}`;
     if(r.status===413){
       const c=document.createElement('canvas');c.width=Math.ceil(v.width*.72);c.height=Math.ceil(v.height*.72);const x=c.getContext('2d',{alpha:false});x.drawImage(await pageCanvas(page,v),0,0,c.width,c.height);image=c.toDataURL('image/jpeg',.45);c.width=1;c.height=1;
     }
   }catch(e){last=e?.name==='AbortError'?'La IA tardó demasiado':String(e?.message||e)}
   if(attempt<3)await sleep(attempt*1800);
 }
 throw Error(last||'La IA no respondió');
}
async function pageCanvas(page,v){const c=document.createElement('canvas');c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);const x=c.getContext('2d',{alpha:false});await page.render({canvasContext:x,viewport:v}).promise;return c}
async function process(file,id,tipo,start=0){
 if(running){progress('Ya hay otro catálogo en proceso.');return}running=true;
 try{await pdfjs();const pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;const q=await supabaseClient.from('catalogos_pdf').select('productos_encontrados,paginas_procesadas').eq('id',id).single();if(q.error)throw q.error;let total=Number(q.data?.productos_encontrados||0);let lastGood=Math.max(Number(start||0),Number(q.data?.paginas_procesadas||0));let r=await supabaseClient.from('catalogos_pdf').update({paginas:pdf.numPages,bloques_total:pdf.numPages,estado:'PROCESANDO',error_detalle:null}).eq('id',id);if(r.error)throw r.error;
 for(let n=lastGood+1;n<=pdf.numPages;n++){
   const started=Date.now();progress(`📄 Preparando página ${n}/${pdf.numPages} · ${total} productos`);
   try{
     const page=await pdf.getPage(n);const tc=await page.getTextContent({normalizeWhitespace:true});const text=(tc.items||[]).map(x=>String(x.str||'')).join('\n').replace(/[ \t]+/g,' ').trim();
     let items=[];
     if(text.length>=40)items=parseText(text,tipo,n);
     if(!items.length)items=await analyzeImage(page,tipo,n);
     items=normalize(items,tipo,n);
     if(items.length){const u=await user();total+=await saveItems(items,id,u.id)}
     lastGood=n;
     r=await supabaseClient.from('catalogos_pdf').update({bloque_actual:n,paginas_procesadas:n,productos_encontrados:total,error_detalle:null,updated_at:new Date().toISOString()}).eq('id',id);if(r.error)throw r.error;
     progress(`✓ Página ${n}/${pdf.numPages} · ${items.length} productos · ${Math.round((Date.now()-started)/1000)} s`);
     await load();
   }catch(pageError){
     const msg=`Página ${n}: ${String(pageError.message||pageError)}`;
     await supabaseClient.from('catalogos_pdf').update({estado:'ERROR',bloque_actual:n,paginas_procesadas:lastGood,productos_encontrados:total,error_detalle:msg,updated_at:new Date().toISOString()}).eq('id',id);
     progress(`⛔ Página ${n} detenida. No se marca como leída. Pulsa Reintentar.`);await load();return;
   }
 }
 r=await supabaseClient.from('catalogos_pdf').update({estado:'PROCESADO',paginas_procesadas:pdf.numPages,bloque_actual:pdf.numPages,bloques_total:pdf.numPages,productos_encontrados:total,error_detalle:null,updated_at:new Date().toISOString()}).eq('id',id);if(r.error)throw r.error;progress(`✓ Catálogo terminado · ${total} productos`);await load();
 }catch(e){await supabaseClient.from('catalogos_pdf').update({estado:'ERROR',error_detalle:String(e.message||e),updated_at:new Date().toISOString()}).eq('id',id);progress('Error: '+String(e.message||e));await load()}finally{running=false}
}
function parseText(text,tipo,pagina){
 const lines=text.split('\n').map(clean).filter(Boolean),out=[],re=/\b((?:AD|PRO)(?:\s+PRO)?-[A-Z0-9]+)\b/i;
 for(let i=0;i<lines.length;i++){
   const m=lines[i].match(re);if(!m)continue;const code=m[1].toUpperCase();let block=[];
   for(let j=i;j<Math.min(i+10,lines.length);j++){if(j>i&&re.test(lines[j]))break;block.push(lines[j]);if(/\d{1,5}[.,]\d{2}(?:\s|$)/.test(lines[j]))break}
   const pi=block.findIndex(x=>/\d{1,5}[.,]\d{2}(?:\s|$)/.test(x));if(pi<0)continue;const price=num(block[pi]);let before=block.slice(0,pi).join(' ');let name=clean((before.split(code)[0]||''));if(!name&&i>0){const prev=lines[i-1];if(prev&&!re.test(prev)&&!/^[0-9]+(?:[.,][0-9]+)?$/.test(prev))name=prev}if(!name)name='Producto';
   out.push({codigo:code,nombre:name,marca:'Aldeepro',modelo:code,categoria:category(name),descripcion:clean(before.replace(name,'').replace(code,'')),precio_compra:tipo==='PROVEEDOR'?price:0,precio_venta:tipo==='PROPIO'?price:0,unidad:'UND',datos_extra:{fuente:'PDF',pagina,tipo,precio_fuente:price}})
 }
 const seen=new Set();return out.filter(x=>!seen.has(x.codigo)&&(seen.add(x.codigo),true))
}
function category(n){const s=clean(n).toUpperCase();if(/AUDIFONO|AURICULAR/.test(s))return'Audífonos';if(/CARGADOR/.test(s))return'Cargadores';if(/CABLE/.test(s))return'Cables';if(/MOUSE/.test(s))return'Periféricos';if(/ADAPTER|ADAPTADOR/.test(s))return'Adaptadores';if(/SOPORTE/.test(s))return'Soportes';if(/MICR[ÓO]FONO/.test(s))return'Micrófonos';if(/PARLANTE/.test(s))return'Parlantes';if(/SMART ?WATCH/.test(s))return'Smart Watch';if(/POWER ?BANK/.test(s))return'Power Bank';if(/MEMORIA/.test(s))return'Memorias';if(/USB/.test(s))return'USB';if(/TECLADO/.test(s))return'Teclados';return'Accesorios'}
function normalize(items,tipo,pagina){return(Array.isArray(items)?items:[]).map(x=>{const p=num(x.precio_fuente??x.precio_compra??x.precio_venta),extra=x.datos_extra&&typeof x.datos_extra==='object'?x.datos_extra:{};return{codigo:clean(x.codigo),nombre:clean(x.nombre)||'Producto sin nombre',marca:clean(x.marca)||'Aldeepro',modelo:clean(x.modelo)||clean(x.codigo),categoria:clean(x.categoria)||category(x.nombre),descripcion:clean(x.descripcion),precio_compra:tipo==='PROVEEDOR'?p:num(x.precio_compra),precio_venta:tipo==='PROPIO'?p:num(x.precio_venta),unidad:clean(x.unidad)||'UND',datos_extra:{...extra,fuente:'PDF',pagina,tipo,precio_fuente:p}}}).filter(x=>x.codigo||x.nombre)}
async function saveItems(items,id,uid){const codes=items.map(x=>x.codigo).filter(Boolean);let existing=new Set();if(codes.length){const q=await supabaseClient.from('catalogo_items').select('codigo').eq('catalogo_id',id).eq('user_id',uid).in('codigo',codes);if(q.error)throw q.error;(q.data||[]).forEach(x=>existing.add(String(x.codigo).toLowerCase()))}const seen=new Set(),rows=[];for(const x of items){const key=(x.codigo||`${x.nombre}|${x.modelo}`).toLowerCase();if(seen.has(key)||existing.has(String(x.codigo||'').toLowerCase()))continue;seen.add(key);rows.push({user_id:uid,catalogo_id:id,codigo:x.codigo||null,nombre:x.nombre,marca:x.marca,modelo:x.modelo,categoria:x.categoria,descripcion:x.descripcion,precio_compra:x.precio_compra,precio_venta:x.precio_venta,unidad:x.unidad,datos_extra:x.datos_extra})}if(!rows.length)return 0;const q=await supabaseClient.from('catalogo_items').insert(rows);if(q.error)throw q.error;return rows.length}
async function resume(id){try{const u=await user();const q=await supabaseClient.from('catalogos_pdf').select('*').eq('id',id).eq('user_id',u.id).single();if(q.error)throw q.error;const s=await supabaseClient.storage.from(BUCKET).createSignedUrl(q.data.archivo_path,3600);if(s.error)throw s.error;const r=await fetch(s.data.signedUrl);if(!r.ok)throw Error('No se pudo recuperar el PDF.');await process(new File([await r.blob()],q.data.nombre,{type:'application/pdf'}),id,q.data.tipo,Number(q.data.paginas_procesadas||0))}catch(e){progress('Error: '+e.message);await load()}}
async function showItems(id){const box=document.querySelector('#catalogItems');if(!box)return;box.hidden=false;try{const u=await user();const q=await supabaseClient.from('catalogo_items').select('id,codigo,nombre,marca,modelo,categoria,descripcion,precio_compra,precio_venta,unidad').eq('catalogo_id',id).eq('user_id',u.id).order('created_at');if(q.error)throw q.error;const items=q.data||[];box.innerHTML=`<div class="cat-items-head"><div><p class="eyebrow">PRODUCTOS DETECTADOS</p><h3>${items.length} productos</h3></div><button type="button" class="cat-close">×</button></div><div class="cat-import-bar"><label><input id="catAll" type="checkbox" checked> Seleccionar todos</label><button id="catImport" type="button" class="btn btn-primary">📥 Importar a Productos</button></div><div class="cat-table"><table><thead><tr><th></th><th>Código</th><th>Producto</th><th>Marca</th><th>Modelo</th><th>Compra</th><th>Venta</th></tr></thead><tbody>${items.map(x=>`<tr><td><input class="cat-check" type="checkbox" value="${x.id}" checked></td><td>${esc(x.codigo||'—')}</td><td>${esc(x.nombre||'—')}</td><td>${esc(x.marca||'—')}</td><td>${esc(x.modelo||'—')}</td><td>${x.precio_compra?'S/ '+Number(x.precio_compra).toFixed(2):'—'}</td><td>${x.precio_venta?'S/ '+Number(x.precio_venta).toFixed(2):'—'}</td></tr>`).join('')}</tbody></table></div>`;box.querySelector('.cat-close').onclick=()=>box.hidden=true;const checks=[...box.querySelectorAll('.cat-check')];box.querySelector('#catAll').onchange=e=>checks.forEach(x=>x.checked=e.target.checked);box.querySelector('#catImport').onclick=()=>importProducts(items)}catch(e){box.innerHTML=`<div class="cat-empty">${esc(e.message)}</div>`}}
async function importProducts(items){const box=document.querySelector('#catalogItems'),ids=new Set([...box.querySelectorAll('.cat-check:checked')].map(x=>x.value));if(!ids.size)return;try{const u=await user(),sel=items.filter(x=>ids.has(x.id)),codes=sel.map(x=>x.codigo).filter(Boolean);let q=codes.length?await supabaseClient.from('productos').select('codigo').eq('user_id',u.id).in('codigo',codes):{data:[],error:null};if(q.error)throw q.error;const ex=new Set((q.data||[]).map(x=>String(x.codigo).toLowerCase())),seen=new Set(),rows=[];for(const x of sel){let code=clean(x.codigo);if(code&&ex.has(code.toLowerCase()))continue;if(!code)code='IMP-'+Date.now().toString().slice(-7);if(seen.has(code.toLowerCase()))continue;seen.add(code.toLowerCase());rows.push({user_id:u.id,codigo:code,nombre:clean(x.nombre)||'Producto',marca:clean(x.marca)||null,modelo:clean(x.modelo)||null,categoria:clean(x.categoria)||null,descripcion:clean(x.descripcion)||null,unidad:clean(x.unidad)||'UND',precio_compra:Number(x.precio_compra||0),precio_venta:Number(x.precio_venta||0),stock:0,stock_minimo:0,activo:true})}if(rows.length){q=await supabaseClient.from('productos').insert(rows);if(q.error)throw q.error}alert(`Importados ${rows.length} productos a Productos.`);box.hidden=true;window.render('products')}catch(e){alert('No se pudo importar: '+e.message)}}
async function removeCatalog(id){if(!confirm('¿Eliminar el catálogo y sus productos detectados?'))return;try{const u=await user();const c=await supabaseClient.from('catalogos_pdf').select('archivo_path').eq('id',id).eq('user_id',u.id).single();if(c.error)throw c.error;let q=await supabaseClient.from('catalogo_items').delete().eq('catalogo_id',id).eq('user_id',u.id);if(q.error)throw q.error;q=await supabaseClient.from('catalogos_pdf').delete().eq('id',id).eq('user_id',u.id);if(q.error)throw q.error;if(c.data?.archivo_path)await supabaseClient.storage.from(BUCKET).remove([c.data.archivo_path]);await load()}catch(e){alert('No se pudo eliminar: '+e.message)}}
const css=document.createElement('style');css.textContent=`#catalogPanel{margin:0 26px 40px;position:relative;z-index:2}.cat-head{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:18px 20px}.cat-head h2{margin:0 0 5px;color:#12365d}.cat-head p:not(.eyebrow){margin:0;color:#6f86a0}.cat-engine{padding:11px 14px;border:1px solid #dbe8f4;border-radius:12px;background:#f6fbff;display:grid;gap:3px}.cat-engine b{color:#0b63b8}.cat-engine span{font-size:10px;color:#6c849c}.cat-upload-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:0 20px 18px}.cat-upload{border:1.5px dashed #b9cde1;border-radius:15px;padding:17px;display:grid;grid-template-columns:40px 1fr;gap:2px 10px;cursor:pointer;background:#fff}.cat-upload input{position:absolute;width:1px;height:1px;opacity:0}.cat-upload span{grid-row:1/4;font-size:29px}.cat-upload b{color:#173b62}.cat-upload small{color:#7b91a8}.cat-upload strong{color:#087cf5;font-size:12px}.cat-progress{margin:0 20px 14px;padding:12px 14px;border-radius:11px;background:#eef7ff;color:#17629c;font-size:11px}.cat-list{display:grid;gap:8px;padding:0 20px 20px}.cat-row{display:grid;grid-template-columns:42px 1fr auto auto auto;gap:9px;align-items:center;border:1px solid #e0eaf3;border-radius:12px;padding:9px;background:#fff}.cat-file{width:38px;height:38px;border-radius:9px;background:#eaf4ff;color:#087cf5;display:grid;place-items:center;font-size:10px;font-weight:800}.cat-main{min-width:0;display:grid;gap:2px}.cat-main b{color:#21496f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cat-main span,.cat-main small{font-size:10px;color:#7b90a6}.cat-delete{border:0;background:#f3f6f9;color:#7890a7;border-radius:7px;width:29px;height:29px;font-size:17px}.cat-empty{text-align:center;padding:30px;color:#7891ad;display:grid;gap:4px}.cat-items{margin:0 20px 20px;background:#fff;border:1px solid #dce7f1;border-radius:15px;overflow:hidden}.cat-items-head{display:flex;justify-content:space-between;align-items:center;padding:15px;border-bottom:1px solid #e5edf5}.cat-items-head h3{margin:0;color:#183e65}.cat-close{border:0;background:#eef4f9;width:32px;height:32px;border-radius:8px;font-size:19px}.cat-import-bar{display:flex;justify-content:space-between;align-items:center;padding:11px 15px;background:#f8fbfd;border-bottom:1px solid #e5edf5}.cat-table{overflow:auto}.cat-table table{width:100%;border-collapse:collapse;font-size:11px}.cat-table th,.cat-table td{padding:8px;border-bottom:1px solid #edf2f6;text-align:left;white-space:nowrap}@media(max-width:760px){#catalogPanel{margin:0 12px 30px}.cat-head{display:block;padding:15px}.cat-engine{margin-top:10px}.cat-upload-grid{grid-template-columns:1fr;padding:0 12px 14px}.cat-list{padding:0 12px 14px}.cat-row{grid-template-columns:38px 1fr auto}.cat-row .cat-view,.cat-row .cat-resume{grid-column:2}.cat-delete{grid-column:3;grid-row:1}.cat-import-bar{display:grid;gap:9px}.cat-import-bar button{width:100%}.cat-items{margin:0 12px 14px}}`;document.head.appendChild(css);
window.addEventListener('load',()=>setTimeout(()=>{if(document.querySelector('.nav-item[data-section="inventory"].active')){const p=mount();if(p)p.hidden=false}},200));
})();
/* M.A.R.C. — Motor V5.2: lectura nativa + OCR + IA visual */
(()=>{
'use strict';
const BUCKET='catalog-pdfs'; let running=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const num=v=>{let s=String(v??'').replace(/[^0-9.,-]/g,'');if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(',','.');const n=Number(s);return Number.isFinite(n)?n:0};
const cat=s=>{s=clean(s).toUpperCase();if(/AUDIFONO|AURICULAR|EARPHONE/.test(s))return'Audífonos';if(/CARGADOR/.test(s))return'Cargadores';if(/CABLE/.test(s))return'Cables';if(/MOUSE|TECLADO/.test(s))return'Periféricos';if(/SOPORTE/.test(s))return'Soportes';if(/ADAPTADOR|ADAPTER/.test(s))return'Adaptadores';if(/MICROFONO|MICRÓFONO/.test(s))return'Micrófonos';if(/PARLANTE|SPEAKER/.test(s))return'Parlantes';if(/MEMORIA|USB/.test(s))return'Memorias';if(/WATCH|RELOJ/.test(s))return'Smartwatch';if(/POWER BANK/.test(s))return'Power banks';return'Accesorios'};
const CODE=/\b(?:AD|PRO)(?:-[A-Z0-9]+)+\b/ig;
const PRICE=/(?:S\.?\/\.?\s*)?(\d{1,5}(?:[.,]\d{1,2}))(?!\d)/;
async function getUser(){const r=await supabaseClient.auth.getUser();if(r.error||!r.data.user)throw new Error('Tu sesión expiró.');return r.data.user}
async function pdfjs(){if(window.pdfjsLib)return window.pdfjsLib;const p=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');p.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';window.pdfjsLib=p;return p}
async function nativeText(page){const tc=await page.getTextContent();return (tc.items||[]).map(x=>String(x.str||'').trim()).filter(Boolean).join('\n')}
async function render(page){const b=page.getViewport({scale:1}),scale=Math.min(2,Math.max(1.45,2100/Math.max(b.width,1))),v=page.getViewport({scale}),c=document.createElement('canvas');c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);await page.render({canvasContext:c.getContext('2d',{alpha:false}),viewport:v}).promise;const d=c.toDataURL('image/jpeg',.9);c.width=1;c.height=1;return d}
async function ocr(image){if(!window.Tesseract){await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=ok;s.onerror=()=>no(new Error('No se pudo cargar OCR.'));document.head.appendChild(s)})}const w=await window.Tesseract.createWorker('spa');try{const r=await w.recognize(image);return String(r?.data?.text||'')}finally{await w.terminate()}}
function parseTable(raw,type,page,confidence='PDF texto nativo'){
 const lines=String(raw||'').split(/\r?\n/).map(clean).filter(Boolean);const hits=[];
 lines.forEach((line,i)=>{let m;CODE.lastIndex=0;while((m=CODE.exec(line))){hits.push({i,start:m.index,end:m.index+m[0].length,code:m[0].toUpperCase()})}});
 const out=[];for(let h=0;h<hits.length;h++){
  const cur=hits[h],next=hits[h+1];let block=lines.slice(cur.i,next?next.i:Math.min(lines.length,cur.i+8));
  let first=block[0]||'', before=first.slice(0,cur.start).trim(), after=first.slice(cur.end).trim();
  let parts=[];if(before)parts.push(before);if(after)parts.push(after);for(const z of block.slice(1))parts.push(z);
  let price=0,priceIndex=-1;
  for(let k=parts.length-1;k>=0;k--){const pm=parts[k].match(PRICE);if(pm){const candidate=num(pm[1]);if(candidate>0){price=candidate;priceIndex=k;break}}}
  if(!price)continue;
  const meta=parts.slice(0,priceIndex<0?parts.length:priceIndex).join(' ');
  const categoryMatch=meta.match(/^(TECLADO|AUDIFONO|AUDÍFONO|CARGADOR(?: DE AUTO)?|SOPORTE DEL CELULAR|CABLE(?: DEL| DE)? DATOS|MICRÓFONO INALÁMBRICO|MICROFONO INALAMBRICO|ADAPTER|ADAPTADOR|MOUSE|PARLANTE(?: ACUÁTICO)?|SMART WATCH|POWER BANK|USB PRO|USB|MEMORIA)\b/i);
  const category=categoryMatch?clean(categoryMatch[0]):'';
  let name=category||meta;
  if(!name)name='Producto '+cur.code;
  let details=meta.replace(categoryMatch?.[0]||'','').trim().replace(/^[,:;-]+|[,:;-]+$/g,'');
  details=details.replace(/^(BLANCO Y NEGRO|BLANCO,NEGRO|NEGRO,PLATA|NEGRO,VERDE,ROSADO)\b/i,'').trim();
  let qty=1;const qm=meta.match(/\b(\d{1,4})\s*(?:UNIDADES|UND|PCS|PZAS?)\b/i);if(qm)qty=Number(qm[1])||1;
  const presentation=qty>1?'CAJA':'UND';
  out.push({codigo:cur.code,nombre:name,marca:/ALDEEPO/i.test(raw)?'Aldeepo':'',modelo:cur.code,categoria:cat(category||name),descripcion:details,precio_compra:type==='PROVEEDOR'?price:0,precio_venta:type==='PROPIO'?price:0,unidad:qty>1?'CJ':'UND',datos_extra:{fuente:'PDF',pagina:page,tipo:type,precio_fuente:price,cantidad_paquete:qty,presentacion,confianza}});
 }
 const seen=new Set();return out.filter(x=>{const k=x.codigo+'|'+x.precio_compra+'|'+x.precio_venta;if(seen.has(k))return false;seen.add(k);return true});
}
async function ai(image,type,page,ocrText=''){const r=await fetch('/api/analyze-catalog-page',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,tipo:type,pagina:page,ocr_text:ocrText.slice(0,12000)})});const j=await r.json().catch(()=>({}));if(!r.ok||!Array.isArray(j.items))throw new Error(j.error||'IA no disponible');return j.items.map(x=>{const q=Math.max(1,Number(x.cantidad_paquete||1));const price=num(x.precio_fuente);const presentation=clean(x.presentacion)||(q>1?'CAJA':'UND');return{codigo:clean(x.codigo).toUpperCase(),nombre:clean(x.nombre),marca:clean(x.marca),modelo:clean(x.modelo)||clean(x.codigo).toUpperCase(),categoria:clean(x.categoria)||cat(x.nombre),descripcion:clean(x.descripcion),precio_compra:type==='PROVEEDOR'?price:0,precio_venta:type==='PROPIO'?price:0,unidad:presentation.toUpperCase()==='CAJA'||q>1?'CJ':(clean(x.unidad)||'UND'),datos_extra:{fuente:'PDF',pagina:page,tipo:type,precio_fuente:price,cantidad_paquete:q,presentacion:presentation,variante:clean(x.variante||''),unidad_precio:clean(x.unidad_precio||''),confianza:'IA visual + OCR'}}}).filter(x=>x.codigo&&x.nombre)}
async function save(items,id,uid){if(!items.length)return 0;const rows=items.map(x=>({user_id:uid,catalogo_id:id,codigo:x.codigo||null,nombre:x.nombre||'Producto sin nombre',marca:x.marca||null,modelo:x.modelo||null,categoria:x.categoria||'Accesorios',descripcion:x.descripcion||null,precio_compra:Number(x.precio_compra||0),precio_venta:Number(x.precio_venta||0),unidad:x.unidad||'UND',datos_extra:x.datos_extra||{}}));const r=await supabaseClient.from('catalogo_items').insert(rows);if(r.error)throw r.error;return rows.length}
function setStatus(t){const e=document.querySelector('#cat4Progress');if(e)e.textContent=t}
async function reprocess(id,button){if(running)return;running=true;if(button){button.disabled=true;button.textContent='Procesando…'};try{const uid=(await getUser()).id;const c=await supabaseClient.from('catalogos_pdf').select('id,nombre,tipo,archivo_path').eq('id',id).eq('user_id',uid).single();if(c.error)throw c.error;const del=await supabaseClient.from('catalogo_items').delete().eq('catalogo_id',id).eq('user_id',uid);if(del.error)throw del.error;await supabaseClient.from('catalogos_pdf').update({paginas_procesadas:0,bloques_total:0,bloque_actual:0,productos_encontrados:0,estado:'PROCESANDO',error_detalle:null}).eq('id',id).eq('user_id',uid);setStatus('V5.2 · descargando PDF…');const d=await supabaseClient.storage.from(BUCKET).download(c.data.archivo_path);if(d.error)throw d.error;const pdf=await (await pdfjs()).getDocument({data:new Uint8Array(await d.data.arrayBuffer())}).promise;let total=0;for(let n=1;n<=pdf.numPages;n++){setStatus(`V5.2 · leyendo página ${n}/${pdf.numPages} · ${total} productos`);const page=await pdf.getPage(n);let text='';try{text=await nativeText(page)}catch{}let items=parseTable(text,c.data.tipo,n,'PDF texto nativo');
 if(!items.length){let image=null;try{image=await render(page);const raw=await ocr(image);items=parseTable(raw,c.data.tipo,n,'OCR');if(!items.length)items=await ai(image,c.data.tipo,n,raw)}catch(e){console.warn('V5.2 página',n,e)}}
 if(items.length)total+=await save(items,id,uid);await supabaseClient.from('catalogos_pdf').update({paginas:pdf.numPages,paginas_procesadas:n,bloques_total:pdf.numPages,bloque_actual:n,productos_encontrados:total,estado:'PROCESANDO',error_detalle:null}).eq('id',id).eq('user_id',uid);page.cleanup?.()}
 await supabaseClient.from('catalogos_pdf').update({paginas:pdf.numPages,paginas_procesadas:pdf.numPages,productos_encontrados:total,estado:'PROCESADO',error_detalle:total?'':'No se encontraron filas de productos en el PDF'}).eq('id',id).eq('user_id',uid);setStatus(`✓ V5.2 terminado · ${total} productos. Revisa y corrige antes de inventario.`);if(typeof window.render==='function')window.render('inventory')}
 catch(e){console.error(e);setStatus(`Error V5.2: ${e.message||e}`);alert(`No se pudo reprocesar el catálogo.\n\n${e.message||e}`)}finally{running=false;if(button){button.disabled=false;button.textContent='Releer catálogo'}}}
function enhance(){const list=document.querySelector('#cat4List');if(!list)return;list.querySelectorAll('.cat4-row').forEach(row=>{if(row.querySelector('.cat4-v5'))return;const del=row.querySelector('.cat4-delete');const small=row.querySelector('.cat4-main small');if(!del||!/Procesado/i.test(small?.textContent||''))return;const b=document.createElement('button');b.type='button';b.className='btn btn-secondary cat4-v5';b.textContent='Releer catálogo';b.onclick=()=>reprocess(del.dataset.id,b);del.before(b)})}
const start=()=>{enhance();new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true})};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else setTimeout(start,400);window.MARC_REPROCESS_CATALOG=reprocess;
})();

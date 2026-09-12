/* M.A.R.C. V7 — lector documental híbrido
   Método nuevo:
   1) PDF con texto: extracción determinista, sin LLM para leer filas.
   2) PDF escaneado: OCR visual por página usando la ruta de producto ya operativa.
   3) Cada página se guarda inmediatamente y puede reanudarse.
*/
(function(){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const money=v=>{let s=String(v??'').replace(/S\/?/gi,'').replace(/[^0-9,.-]/g,'').trim();if(!s)return 0;if(s.includes('.')&&s.includes(','))s=s.replace(/\./g,'').replace(',','.');else if(s.includes(',')&&!s.includes('.'))s=s.replace(',','.');const n=Number(s);return Number.isFinite(n)?n:0};
  const codeRe=/\b(?:AD|PRO|HIK|DS|IPC|DVR|NVR|CPE|TL|TP|UBNT|Ubiquiti)[-_][A-Z0-9][A-Z0-9._/-]*\b/gi;
  const oldRender=window.render;
  window.render=function(section='dashboard'){
    if(section!=='inventory')return oldRender(section);
    const c=document.querySelector('#content');if(!c)return;
    c.innerHTML=`<div class="page-head"><div><p class="eyebrow">M.A.R.C. / CATÁLOGOS</p><h1>Catálogos PDF</h1><p>V7 · Lector documental híbrido. Los PDF con texto se leen sin IA; los escaneados usan OCR visual página por página.</p></div></div><section class="panel pv7"><div class="pv7-grid"><label class="pv7-upload"><input id="pv7Own" type="file" accept="application/pdf,.pdf"><span>📘</span><strong>Mi catálogo</strong><small>Catálogo propio</small><b>Seleccionar PDF</b></label><label class="pv7-upload"><input id="pv7Supplier" type="file" accept="application/pdf,.pdf"><span>🏢</span><strong>Catálogo de proveedor</strong><small>Queda separado para comparar</small><b>Seleccionar PDF</b></label></div><div id="pv7Progress" class="pv7-progress" hidden></div><div id="pv7List">Cargando...</div><div id="pv7Items" hidden></div></section>`;
    document.querySelector('#pv7Own').onchange=e=>upload(e.target.files[0],'PROPIO');
    document.querySelector('#pv7Supplier').onchange=e=>upload(e.target.files[0],'PROVEEDOR');
    load();
  };
  const progress=t=>{const e=document.querySelector('#pv7Progress');if(e){e.hidden=false;e.textContent=t}};
  async function user(){const r=await supabaseClient.auth.getUser();if(r.error||!r.data.user)throw Error('Tu sesión expiró.');return r.data.user}
  async function pdfjs(){if(window.pdfjsLib)return;await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=res;s.onerror=()=>rej(Error('No se pudo cargar PDF.js'));document.head.appendChild(s)})}
  const size=n=>n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
  const state=c=>{const e=String(c.estado||'').toUpperCase(),p=Number(c.paginas||0),d=Number(c.paginas_procesadas||0),n=Number(c.productos_encontrados||0);if(e==='PROCESANDO')return `Leyendo página ${d}/${p} · ${n} productos`;if(e==='PROCESADO')return `✓ Terminado · ${n} productos`;return `⚠ ${c.error_detalle||'requiere continuar'}`};
  async function load(){const w=document.querySelector('#pv7List');if(!w)return;try{const u=await user();const r=await supabaseClient.from('catalogos_pdf').select('id,nombre,tipo,tamano_bytes,paginas,estado,paginas_procesadas,productos_encontrados,error_detalle,archivo_path').eq('user_id',u.id).order('created_at',{ascending:false});if(r.error)throw r.error;w.innerHTML=(r.data||[]).map(c=>`<article class="pv7-row"><div class="pv7-icon">PDF</div><div class="pv7-main"><strong>${esc(c.nombre)}</strong><span>${c.tipo==='PROVEEDOR'?'Proveedor':'Propio'} · ${size(c.tamano_bytes)} · ${c.paginas||0} páginas</span><small>${esc(state(c))}</small></div><button class="pv7-read" data-id="${c.id}">${String(c.estado).toUpperCase()==='PROCESADO'?'🔄 Releer V7':'▶ Continuar'}</button><button class="pv7-view" data-id="${c.id}">📦 Productos</button></article>`).join('')||'<div>No hay catálogos.</div>';w.querySelectorAll('.pv7-read').forEach(b=>b.onclick=()=>reprocess(b.dataset.id));w.querySelectorAll('.pv7-view').forEach(b=>b.onclick=()=>view(b.dataset.id))}catch(e){w.innerHTML=esc(e.message)}}
  async function upload(file,tipo){if(!file)return;if(file.size>50*1024*1024){alert('El PDF supera 50 MB.');return}try{const u=await user();progress(`⬆️ Subiendo ${file.name}...`);const path=`${u.id}/${crypto.randomUUID()}.pdf`;let r=await supabaseClient.storage.from('catalog-pdfs').upload(path,file,{contentType:'application/pdf',upsert:false});if(r.error)throw r.error;r=await supabaseClient.from('catalogos_pdf').insert({user_id:u.id,nombre:file.name,tipo,archivo_path:path,tamano_bytes:file.size,estado:'PROCESANDO',paginas_procesadas:0,bloques_total:0,bloque_actual:0,productos_encontrados:0,error_detalle:null}).select('id').single();if(r.error)throw r.error;await process(file,r.data.id,tipo,0,true);await load()}catch(e){progress('❌ '+e.message);await load()}}
  async function stored(c){const s=await supabaseClient.storage.from('catalog-pdfs').createSignedUrl(c.archivo_path,3600);if(s.error)throw s.error;const r=await fetch(s.data.signedUrl);if(!r.ok)throw Error('No se pudo recuperar el PDF');return new File([await r.blob()],c.nombre,{type:'application/pdf'})}
  async function render(page,scale=2.2){const base=page.getViewport({scale:1});const s=Math.min(scale,2200/Math.max(base.width,1));const v=page.getViewport({scale:s});const canvas=document.createElement('canvas');canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);await page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport:v}).promise;return canvas}
  function normalize(x){return {codigo:clean(x?.codigo),nombre:clean(x?.nombre),marca:clean(x?.marca),modelo:clean(x?.modelo),categoria:clean(x?.categoria),descripcion:clean(x?.descripcion),precio_compra:money(x?.precio_compra),precio_venta:money(x?.precio_venta),unidad:clean(x?.unidad)||'UND'}}
  function dedupe(a){const out=[],seen=new Set();for(const raw of a||[]){const x=normalize(raw);if(!x.codigo&&!x.nombre&&!x.modelo)continue;const k=(x.codigo+'|'+x.modelo+'|'+x.nombre).toUpperCase();if(seen.has(k))continue;seen.add(k);out.push(x)}return out}
  function textRows(items){
    const rows=[];let cur=[];
    for(const it of items||[]){const s=clean(it.str);if(!s)continue;const y=Number(it.transform?.[5]||0);const last=cur[cur.length-1];if(last&&Math.abs(last.y-y)<=4){last.parts.push(s)}else{last={y,parts:[s]};cur.push(last)}}
    cur.sort((a,b)=>b.y-a.y);return cur.map(r=>clean(r.parts.join(' '))).filter(Boolean);
  }
  function parseText(rows,pageNo){
    const out=[];
    for(let i=0;i<rows.length;i++){
      const line=rows[i];
      const cm=line.match(codeRe); if(!cm)continue;
      const code=cm[0];
      let before=clean(line.slice(0,line.toUpperCase().indexOf(code.toUpperCase())));
      let after=clean(line.slice(line.toUpperCase().indexOf(code.toUpperCase())+code.length));
      const nums=[...after.matchAll(/(?:S\.?\/)?\s*\d+(?:[.,]\d{1,2})?(?!\d)/g)];
      let price=0;
      if(nums.length){const m=nums[nums.length-1];price=money(m[0]);after=clean(after.slice(0,m.index));}
      if(!price){const m=before.match(/(?:S\.?\/)?\s*\d+(?:[.,]\d{1,2})?\s*$/);if(m){price=money(m[0]);before=clean(before.slice(0,m.index));}}
      let name=before;
      if(!name){const prev=rows[i-1]||'';if(prev&&!codeRe.test(prev))name=clean(prev)}
      if(!name)name=code;
      const desc=after||'';
      out.push({codigo:code,nombre:name,marca:'',modelo:code,categoria:'',descripcion:desc,precio_compra:price,precio_venta:price,unidad:'UND',datos_extra:{pagina:pageNo,origen:'PDF_TEXT_DETERMINISTIC'}});
    }
    return dedupe(out);
  }
  async function ocrImage(image){
    const r=await fetch('/api/analyze-product',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(j.detail||j.error||'OCR visual no disponible');
    const raw=j.text||j.data||j.response||j;
    let d=raw; if(typeof raw==='string'){try{d=JSON.parse(raw)}catch{const o={};raw.split(/\n|;/).forEach(line=>{const m=line.match(/^\s*(codigo|código|sku|nombre|producto|marca|modelo|categoria|categoría|descripcion|descripción|precio_compra|precio venta|precio_venta|precio)\s*:\s*(.+)$/i);if(m){const k=m[1].toLowerCase().replace('código','codigo').replace('categoría','categoria').replace('descripción','descripcion').replace('precio venta','precio_venta');o[k]=m[2].trim()}});d=o}}
    return [normalize(d)];
  }
  async function scannedPage(page){
    const full=await render(page,2.4);const images=[full.toDataURL('image/jpeg',0.9)];
    /* Las páginas escaneadas pueden contener varios productos: se prueban 4 zonas con el OCR visual ya operativo. */
    const base=page.getViewport({scale:1}), v=page.getViewport({scale:2.2}), bands=[];
    for(let i=0;i<4;i++){const y1=i/4,y2=(i+1)/4,c=document.createElement('canvas');c.width=Math.ceil(v.width);c.height=Math.ceil(v.height*(y2-y1));await page.render({canvasContext:c.getContext('2d',{alpha:false}),viewport:v,transform:[1,0,0,1,0,-Math.floor(v.height*y1)]}).promise;bands.push(c.toDataURL('image/jpeg',0.9));c.width=1;c.height=1}
    let all=[];progress('🔬 OCR visual de página completa...');try{all.push(...await ocrImage(images[0]))}catch{}
    for(let i=0;i<bands.length;i++){progress(`🔬 OCR zona ${i+1}/4...`);try{all.push(...await ocrImage(bands[i]))}catch{}}
    return dedupe(all);
  }
  async function process(file,id,tipo,start=0,reset=false){
    await pdfjs();const pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    if(reset){await supabaseClient.from('catalogo_items').delete().eq('catalogo_id',id);await supabaseClient.from('catalogos_pdf').update({paginas:pdf.numPages,estado:'PROCESANDO',paginas_procesadas:0,bloques_total:pdf.numPages,bloque_actual:0,productos_encontrados:0,error_detalle:null}).eq('id',id);start=0}
    const q=await supabaseClient.from('catalogos_pdf').select('productos_encontrados,paginas_procesadas').eq('id',id).single();let total=Number(q.data?.productos_encontrados||0);if(!reset&&q.data?.paginas_procesadas)start=Math.max(start,Number(q.data.paginas_procesadas));
    for(let n=start+1;n<=pdf.numPages;n++){
      try{
        progress(`⏳ Página ${n}/${pdf.numPages}...`);const page=await pdf.getPage(n);const tc=await page.getTextContent({normalizeWhitespace:true,disableCombineTextItems:false});const rows=textRows(tc.items||[]);let items=parseText(rows,n);let mode='PDF_TEXT_DETERMINISTIC';
        if(items.length===0){mode='OCR_VISUAL';items=await scannedPage(page)}
        if(items.length===0)throw Error('No se detectó ningún producto en la página.');
        const u=await user();const vals=items.map(x=>({...x,datos_extra:{...(x.datos_extra||{}),pagina:n,origen:mode,tipo_fuente:tipo}}));const added=await save(vals,id,u.id);total+=added;
        await supabaseClient.from('catalogos_pdf').update({paginas:pdf.numPages,paginas_procesadas:n,bloque_actual:n,productos_encontrados:total,estado:'PROCESANDO',error_detalle:null,updated_at:new Date().toISOString()}).eq('id',id);
        progress(`✓ Página ${n}/${pdf.numPages} · ${added} nuevos · total ${total} · ${mode==='OCR_VISUAL'?'OCR visual':'lectura de texto'}`);
        await new Promise(r=>setTimeout(r,200));
      }catch(e){await supabaseClient.from('catalogos_pdf').update({estado:'ERROR',paginas_procesadas:Math.max(0,n-1),productos_encontrados:total,error_detalle:`Página ${n}: ${e.message}`,updated_at:new Date().toISOString()}).eq('id',id);progress(`❌ Página ${n}: ${e.message}`);throw e}
    }
    await supabaseClient.from('catalogos_pdf').update({estado:'PROCESADO',paginas_procesadas:pdf.numPages,bloque_actual:pdf.numPages,bloques_total:pdf.numPages,productos_encontrados:total,error_detalle:null,updated_at:new Date().toISOString()}).eq('id',id);progress(`✅ Catálogo terminado · ${total} productos`);
  }
  async function save(items,id,userId){const vals=dedupe(items).map(v=>({user_id:userId,catalogo_id:id,codigo:v.codigo,nombre:v.nombre,marca:v.marca,modelo:v.modelo,categoria:v.categoria,descripcion:v.descripcion,precio_compra:v.precio_compra,precio_venta:v.precio_venta,unidad:v.unidad,datos_extra:v.datos_extra||{}}));if(!vals.length)return 0;const codes=vals.map(x=>x.codigo).filter(Boolean);let existing=new Set();if(codes.length){const q=await supabaseClient.from('catalogo_items').select('codigo').eq('catalogo_id',id).in('codigo',codes);if(!q.error)(q.data||[]).forEach(x=>existing.add(String(x.codigo)))}const unique=vals.filter(x=>!x.codigo||!existing.has(String(x.codigo)));if(!unique.length)return 0;const r=await supabaseClient.from('catalogo_items').insert(unique);if(r.error)throw r.error;return unique.length}
  async function reprocess(id){const u=await user();const q=await supabaseClient.from('catalogos_pdf').select('*').eq('id',id).eq('user_id',u.id).single();if(q.error)throw q.error;const all=String(q.data.estado).toUpperCase()==='PROCESADO';if(all&&!confirm('Se volverá a leer todo el PDF con V7. ¿Continuar?'))return;await process(await stored(q.data),id,q.data.tipo,all?0:Number(q.data.paginas_procesadas||0),all);await load()}
  async function view(id){const b=document.querySelector('#pv7Items');if(!b)return;const r=await supabaseClient.from('catalogo_items').select('codigo,nombre,marca,modelo,categoria,precio_compra,precio_venta,unidad,datos_extra').eq('catalogo_id',id).order('created_at',{ascending:true});const a=r.data||[];b.hidden=false;b.innerHTML=`<div class="pv7-items"><button id="pv7Close">×</button><h3>${a.length} productos detectados</h3><div class="pv7-scroll"><table><thead><tr><th>Página</th><th>Código</th><th>Producto</th><th>Modelo</th><th>Precio</th></tr></thead><tbody>${a.map(x=>`<tr><td>${esc(x.datos_extra?.pagina||'—')}</td><td>${esc(x.codigo||'')}</td><td>${esc(x.nombre||'')}</td><td>${esc(x.modelo||'')}</td><td>${x.precio_venta||x.precio_compra?esc(String(x.precio_venta||x.precio_compra)):'—'}</td></tr>`).join('')}</tbody></table></div></div>`;b.querySelector('#pv7Close').onclick=()=>b.hidden=true}
  const st=document.createElement('style');st.textContent='.pv7{margin-top:16px}.pv7-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.pv7-upload{position:relative;min-height:145px;border:1.5px dashed #b9d1e5;border-radius:16px;background:#f7fbff;padding:20px;display:flex;flex-direction:column;justify-content:center;cursor:pointer}.pv7-upload input{position:absolute;inset:0;opacity:0}.pv7-upload span{font-size:28px}.pv7-upload strong{font-size:15px;color:#234b73}.pv7-upload small{display:block;margin:4px 0 12px}.pv7-upload b{color:#087cf5}.pv7-progress{margin:16px 0;padding:13px 16px;border-radius:12px;background:#eef6ff;font-weight:600}.pv7-row{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #e5edf5}.pv7-icon{width:44px;height:44px;border-radius:10px;display:grid;place-items:center;background:#eaf3ff;color:#087cf5;font-weight:800}.pv7-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}.pv7-main strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pv7-main span,.pv7-main small{color:#66788a}.pv7-row button{border:0;border-radius:9px;padding:9px 11px;background:#eef6ff;color:#0868cf;cursor:pointer}.pv7-items{position:fixed;inset:7%;background:#fff;z-index:1000;border-radius:16px;box-shadow:0 20px 70px #0003;padding:20px}.pv7-items>button{float:right;border:0;background:#eee;border-radius:50%;width:32px;height:32px}.pv7-scroll{max-height:75vh;overflow:auto}.pv7-scroll table{width:100%;border-collapse:collapse}.pv7-scroll th,.pv7-scroll td{padding:9px;border-bottom:1px solid #edf1f5;text-align:left;font-size:13px}@media(max-width:700px){.pv7-grid{grid-template-columns:1fr}.pv7-row{flex-wrap:wrap}.pv7-row .pv7-main{width:calc(100% - 58px)}.pv7-items{inset:2%}}';document.head.appendChild(st);
})();
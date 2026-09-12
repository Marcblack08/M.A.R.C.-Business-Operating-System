/* M.A.R.C. — Catálogos PDF: propios y proveedores */
(function(){
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const oldRender=window.render;
  window.render=function(section='dashboard'){
    if(section!=='inventory') return oldRender(section);
    const content=document.querySelector('#content'); if(!content)return;
    oldRender(section);
    setTimeout(injectCatalogPanel,0);
  };
  function injectCatalogPanel(){
    const page=document.querySelector('#content'); if(!page || document.querySelector('#catalogPanel'))return;
    const panel=document.createElement('section');panel.id='catalogPanel';panel.className='panel catalog-panel';
    panel.innerHTML=`<div class="catalog-head"><div><p class="eyebrow">M.A.R.C. / CATÁLOGOS</p><h2>Catálogos PDF</h2><p>Sube tu catálogo completo o el catálogo de un proveedor. M.A.R.C. guardará el PDF y extraerá productos, códigos, marcas, modelos y precios.</p></div></div><div class="catalog-upload-grid"><label class="catalog-upload own"><input id="ownCatalogFile" type="file" accept="application/pdf,.pdf"><span class="catalog-upload-icon">📘</span><strong>Mi catálogo</strong><small>Catálogo propio de Tecnovigilancia Marc</small><b>Seleccionar PDF</b></label><label class="catalog-upload supplier"><input id="supplierCatalogFile" type="file" accept="application/pdf,.pdf"><span class="catalog-upload-icon">🏢</span><strong>Catálogo de proveedor</strong><small>Guarda el proveedor por separado</small><b>Seleccionar PDF</b></label></div><div id="catalogProgress" class="catalog-progress" hidden></div><div id="catalogList" class="catalog-list"><div class="catalog-loading">Cargando catálogos...</div></div>`;
    page.appendChild(panel);loadCatalogs();
    panel.querySelector('#ownCatalogFile').onchange=e=>handlePdf(e.target.files[0],'PROPIO');
    panel.querySelector('#supplierCatalogFile').onchange=e=>handlePdf(e.target.files[0],'PROVEEDOR');
  }
  async function getUser(){const {data:{user},error}=await supabaseClient.auth.getUser();if(error||!user)throw new Error('Tu sesión expiró.');return user;}
  async function loadCatalogs(){
    const wrap=document.querySelector('#catalogList');if(!wrap)return;
    try{const user=await getUser();const {data,error}=await supabaseClient.from('catalogos_pdf').select('id,nombre,tipo,proveedor,tamano_bytes,paginas,estado,created_at').eq('user_id',user.id).order('created_at',{ascending:false});if(error)throw error;const rows=data||[];if(!rows.length){wrap.innerHTML='<div class="catalog-empty"><div>📚</div><strong>Aún no tienes catálogos</strong><span>Sube un PDF arriba para crear tu biblioteca de catálogos.</span></div>';return;}wrap.innerHTML=rows.map(c=>`<article class="catalog-row"><div class="catalog-file-icon">PDF</div><div class="catalog-row-main"><strong>${esc(c.nombre)}</strong><span>${c.tipo==='PROVEEDOR'?'Proveedor':'Catálogo propio'}${c.proveedor?' · '+esc(c.proveedor):''} · ${formatSize(c.tamano_bytes)}${c.paginas?' · '+c.paginas+' páginas':''}</span></div><mark class="catalog-status ${String(c.estado).toLowerCase()}">${esc(c.estado)}</mark><button class="table-action catalog-delete" data-id="${c.id}" title="Eliminar">×</button></article>`).join('');wrap.querySelectorAll('.catalog-delete').forEach(b=>b.onclick=()=>deleteCatalog(b.dataset.id));}catch(e){wrap.innerHTML=`<div class="catalog-empty">${esc(e.message)}</div>`;}}
  function formatSize(n){n=Number(n||0);if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';return (n/1048576).toFixed(1)+' MB';}
  async function handlePdf(file,tipo){
    if(!file)return;if(file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name)){alert('Selecciona un archivo PDF.');return;}if(file.size>50*1024*1024){alert('El PDF supera el límite de 50 MB.');return;}
    const progress=document.querySelector('#catalogProgress');if(progress){progress.hidden=false;progress.textContent='Preparando '+file.name+'...';}
    try{
      const user=await getUser();const path=`${user.id}/${crypto.randomUUID()}.pdf`;
      const up=await supabaseClient.storage.from('catalog-pdfs').upload(path,file,{contentType:'application/pdf',upsert:false});if(up.error)throw up.error;
      const insert=await supabaseClient.from('catalogos_pdf').insert({user_id:user.id,nombre:file.name,tipo,archivo_path:path,tamano_bytes:file.size,estado:'PROCESANDO'}).select('id').single();if(insert.error){await supabaseClient.storage.from('catalog-pdfs').remove([path]);throw insert.error;}
      const catalogId=insert.data.id;
      try{await processPdf(file,catalogId,tipo,file.name,progress);}catch(aiError){await supabaseClient.from('catalogos_pdf').update({estado:'ERROR',updated_at:new Date().toISOString()}).eq('id',catalogId);throw aiError;}
      await loadCatalogs();
    }catch(e){if(progress)progress.textContent='Error: '+e.message;else alert(e.message);}
  }
  async function processPdf(file,catalogId,tipo,name,progress){
    if(!window.pdfjsLib){await loadPdfJs();}
    const bytes=new Uint8Array(await file.arrayBuffer());const pdf=await pdfjsLib.getDocument({data:bytes}).promise;const chunks=[];let buffer='';
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p);const tc=await page.getTextContent();const text=tc.items.map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();
      if(text){buffer+=`\n[PÁGINA ${p}]\n${text}`;if(buffer.length>=11000){chunks.push(buffer);buffer='';}}
      if(progress)progress.textContent=`Leyendo PDF... página ${p} de ${pdf.numPages}`;
    }
    if(buffer.trim())chunks.push(buffer);await supabaseClient.from('catalogos_pdf').update({paginas:pdf.numPages,updated_at:new Date().toISOString()}).eq('id',catalogId);
    if(!chunks.length)throw new Error('El PDF no contiene texto seleccionable. Este bloque todavía no procesa PDFs escaneados por imagen.');
    let total=0;
    for(let i=0;i<chunks.length;i++){
      if(progress)progress.textContent=`M.A.R.C. analizando catálogo... bloque ${i+1} de ${chunks.length}`;
      const r=await fetch('/api/analyze-catalog',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:chunks[i],tipo})});const j=await r.json();if(!r.ok)throw new Error(j.error||'No se pudo analizar el catálogo.');
      const items=Array.isArray(j.items)?j.items:[];if(items.length){const payload=items.map(x=>({user_id:await getUserId(),catalogo_id:catalogId,codigo:clean(x.codigo),nombre:clean(x.nombre),marca:clean(x.marca),modelo:clean(x.modelo),categoria:clean(x.categoria),descripcion:clean(x.descripcion),precio_compra:num(x.precio_compra),precio_venta:num(x.precio_venta),unidad:clean(x.unidad)||'UND',datos_extra:x.datos_extra||{}}));const {error}=await supabaseClient.from('catalogo_items').insert(payload);if(error)throw error;total+=items.length;}
    }
    await supabaseClient.from('catalogos_pdf').update({estado:'PROCESADO',updated_at:new Date().toISOString()}).eq('id',catalogId);if(progress)progress.textContent=`✓ Catálogo procesado: ${total} productos encontrados.`;
  }
  let cachedUserId=null;async function getUserId(){if(cachedUserId)return cachedUserId;cachedUserId=(await getUser()).id;return cachedUserId;}
  const clean=v=>{const s=String(v??'').trim();return s||null};const num=v=>{const n=Number(String(v??'').replace(',','.').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  function loadPdfJs(){return new Promise((resolve,reject)=>{if(window.pdfjsLib)return resolve();const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';s.type='module';s.onload=()=>{setTimeout(()=>{if(window.pdfjsLib)resolve();else reject(new Error('No se pudo cargar el lector PDF.'));},500)};s.onerror=()=>reject(new Error('No se pudo cargar el lector PDF.'));document.head.appendChild(s);});}
  async function deleteCatalog(id){if(!confirm('¿Eliminar este catálogo y los datos extraídos?'))return;try{const user=await getUser();const {data,error}=await supabaseClient.from('catalogos_pdf').select('archivo_path').eq('id',id).eq('user_id',user.id).single();if(error)throw error;await supabaseClient.storage.from('catalog-pdfs').remove([data.archivo_path]);const r=await supabaseClient.from('catalogos_pdf').delete().eq('id',id).eq('user_id',user.id);if(r.error)throw r.error;loadCatalogs();}catch(e){alert(e.message);}}
  const style=document.createElement('style');style.textContent='.catalog-panel{margin-top:16px}.catalog-head h2{margin:0;color:#173b62;font-size:20px}.catalog-head p:last-child{margin:5px 0 15px;color:#7891ad;font-size:11px;max-width:760px}.catalog-upload-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.catalog-upload{position:relative;min-height:145px;border:1.5px dashed #b9d1e5;border-radius:16px;background:#f7fbff;padding:20px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;cursor:pointer;transition:.2s}.catalog-upload:hover{border-color:#087cf5;transform:translateY(-1px)}.catalog-upload input{position:absolute;inset:0;opacity:0;cursor:pointer}.catalog-upload-icon{font-size:28px;margin-bottom:7px}.catalog-upload strong{font-size:15px;color:#234b73}.catalog-upload small{font-size:10px;color:#7891ad;margin:4px 0 12px}.catalog-upload b{font-size:10px;color:#087cf5}.catalog-progress{margin-top:12px;padding:12px;border-radius:10px;background:#edf7ff;color:#326080;font-size:11px}.catalog-list{margin-top:15px;display:grid;gap:8px}.catalog-row{display:flex;align-items:center;gap:11px;border:1px solid #e0eaf3;border-radius:12px;padding:10px;background:#fff}.catalog-file-icon{width:42px;height:42px;border-radius:10px;background:#edf5fc;color:#087cf5;display:grid;place-items:center;font-size:10px;font-weight:800}.catalog-row-main{flex:1;min-width:0;display:grid;gap:3px}.catalog-row-main strong{font-size:12px;color:#234b73;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.catalog-row-main span{font-size:9px;color:#7891ad}.catalog-status{font-size:9px;padding:4px 7px;border-radius:8px;background:#e9f8ef;color:#237445}.catalog-status.procesando{background:#fff4df;color:#9a6500}.catalog-status.error{background:#ffecef;color:#b33b4c}.catalog-empty{padding:30px;text-align:center;color:#7891ad;font-size:11px;display:grid;gap:5px}.catalog-empty div{font-size:30px}.catalog-empty strong{color:#365a7e;font-size:14px}.catalog-loading{text-align:center;padding:20px;color:#7891ad;font-size:10px}@media(max-width:650px){.catalog-upload-grid{grid-template-columns:1fr}.catalog-row{align-items:flex-start}.catalog-status{margin-left:auto}}';document.head.appendChild(style);
})();
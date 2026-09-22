(function(){
  const supa=()=>window.supabaseClient||window.__MARC_SUPABASE||null;
  const getClient=()=>{try{return window.supabase?.createClient?null:null}catch(e){return null}};
  // app.js keeps the authenticated Supabase client private. We reuse its browser
  // session through the public config and a dedicated client for this feature.
  let client=null;
  function sb(){
    if(client)return client;
    if(!window.MARC_CONFIG||!window.supabase?.createClient)return null;
    client=window.supabase.createClient(window.MARC_CONFIG.supabaseUrl,window.MARC_CONFIG.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    return client;
  }
  const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const money=v=>new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(Number(v||0));
  const toast=(t,type)=>{try{if(typeof window.toast==="function")return window.toast(t,type);if(typeof window.showToast==="function")return window.showToast(t,type)}catch(e){};try{console.info("[MARC]",t)}catch(e){};};
  const supplierSalePrice=(item,supplier)=>{const base=Number(item.supplier_price??item.supplier_cost??0),pct=Number(item.markup_pct??supplier?.default_markup_pct??0);return base+(base*pct/100)};

  async function supplierCenter(){
    const S=sb(); if(!S)return;
    const {data:{session}}=await S.auth.getSession();
    if(!session)return;
    const root=document.querySelector("#content");
    root.innerHTML='<div class="head"><div><div class="eyebrow2">PROVEEDORES Y CATÁLOGOS</div><h1>Centro de abastecimiento.</h1><p>Guarda catálogos de proveedores, revisa productos y pásalos a Inventario o Publicidad sin duplicar información.</p></div><button id="scBack" class="secondary">← Inventario</button></div>'+
      '<section class="inventory-summary"><div><span>PROVEEDORES</span><strong id="scSuppliers">0</strong><small>Contactos activos</small></div><div><span>CATÁLOGOS</span><strong id="scCatalogs">0</strong><small>Documentos registrados</small></div><div><span>PRODUCTOS DETECTADOS</span><strong id="scItems">0</strong><small>Productos de proveedores</small></div></section>'+
      '<section class="card table"><div class="toolbar"><div><b>Proveedores</b><small> · administra tus fuentes de compra</small></div><button id="scNewSupplier" class="primary">＋ Nuevo proveedor</button></div><div id="scSupplierList" class="client-cards"></div></section>'+
      '<section class="card table" style="margin-top:14px"><div class="toolbar"><div><b>Catálogos</b><small> · PDF, Excel, imágenes o enlaces</small></div><button id="scNewCatalog" class="secondary">＋ Registrar catálogo</button></div><div id="scCatalogList" class="client-cards"></div></section>';

    document.querySelector("#scBack").onclick=()=>window.view("inventory");
    document.querySelector("#scNewSupplier").onclick=()=>newSupplier();
    document.querySelector("#scNewCatalog").onclick=()=>newCatalog();
    await loadCenter();
  }

  async function loadCenter(){
    const S=sb(); if(!S)return;
    const [s,c,i]=await Promise.all([
      S.from("marc_suppliers").select("*").eq("active",true).order("name"),
      S.from("marc_supplier_catalogs").select("*").order("created_at",{ascending:false}),
      S.from("marc_supplier_catalog_items").select("id,name,sku,supplier_price,supplier_cost,markup_pct,status,catalog_id,supplier_id,inventory_id,image_url,brand,model,category").order("created_at",{ascending:false})
    ]);
    if(s.error||c.error||i.error){console.error(s.error||c.error||i.error);return}
    document.querySelector("#scSuppliers").textContent=(s.data||[]).length;
    document.querySelector("#scCatalogs").textContent=(c.data||[]).length;
    document.querySelector("#scItems").textContent=(i.data||[]).length;
    const suppliers=s.data||[], catalogs=c.data||[], items=i.data||[];
    document.querySelector("#scSupplierList").innerHTML=suppliers.map(x=>{
      const count=catalogs.filter(v=>v.supplier_id===x.id).length;
      return '<article class="client-card"><div class="client-card-top"><div class="client-avatar">'+esc((x.name||"P").slice(0,2).toUpperCase())+'</div><div class="client-card-name"><h3>'+esc(x.name)+'</h3><small>'+esc(x.contact_name||x.phone||x.email||"Sin contacto")+'</small></div></div><div class="client-details"><div><span>Catálogos</span><b>'+count+'</b></div><div><span>Web</span><b>'+esc(x.website||"—")+'</b></div></div><div class="client-card-actions"><button class="secondary" data-supplier="'+x.id+'">Ver catálogos</button><button class="secondary scEditSupplier" data-supplier-id="'+x.id+'">Editar</button></div></article>'
    }).join("")||'<div class="empty-state"><span>＋</span><b>Aún no hay proveedores</b><small>Registra tu primer proveedor.</small></div>';
    document.querySelector("#scCatalogList").innerHTML=catalogs.map(x=>{
      const supplier=suppliers.find(v=>v.id===x.supplier_id);
      const its=items.filter(v=>v.catalog_id===x.id);
      const ready=its.filter(v=>v.status==="APPROVED"||v.status==="IMPORTED").length;
      return '<article class="client-card"><div class="client-card-top"><div class="client-avatar">'+esc(x.source_type==="EXCEL"?"XLS":"PDF")+'</div><div class="client-card-name"><h3>'+esc(x.name)+'</h3><small>'+esc(supplier?.name||"Proveedor no asignado")+'</small></div><span class="badge '+(x.status==="READY"?"ok":"low")+'">'+esc(x.status)+'</span></div><div class="client-details"><div><span>Productos</span><b>'+its.length+'</b></div><div><span>Listos</span><b>'+ready+'</b></div><div><span>Origen</span><b>'+esc(x.source_type)+'</b></div></div><div class="client-card-actions"><button class="primary scOpenCatalog" data-catalog="'+x.id+'">Ver productos</button><button class="secondary scReanalyze" data-catalog="'+x.id+'">↻ Reanalizar</button><button class="danger scDeleteCatalog" data-catalog="'+x.id+'">🗑 Eliminar catálogo</button></div></article>'
    }).join("")||'<div class="empty-state"><span>📄</span><b>Aún no hay catálogos</b><small>Registra un catálogo para empezar.</small></div>';

    document.querySelectorAll("[data-supplier]").forEach(b=>b.onclick=()=>filterCatalogs(b.dataset.supplier));
    document.querySelectorAll(".scEditSupplier").forEach(b=>b.onclick=()=>editSupplier(b.dataset.supplierId));
    document.querySelectorAll(".scOpenCatalog").forEach(b=>b.onclick=()=>catalogProducts(b.dataset.catalog));
    document.querySelectorAll(".scReanalyze").forEach(b=>b.onclick=()=>reanalyzeCatalog(b.dataset.catalog));
    document.querySelectorAll(".scDeleteCatalog").forEach(b=>b.onclick=()=>deleteCatalog(b.dataset.catalog));
  }

  async function newSupplier(existing=null){
    const S=sb(); const {data:{session}}=await S.auth.getSession(); if(!session)return;
    const body='<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">'+
      '<label>Nombre del proveedor *<input id="scSupName" class="input" value="'+esc(existing?.name||'')+'"></label>'+
      '<label>Persona de contacto<input id="scSupContact" class="input" value="'+esc(existing?.contact_name||'')+'"></label>'+
      '<label>Teléfono / WhatsApp<input id="scSupPhone" class="input" value="'+esc(existing?.phone||'')+'"></label>'+
      '<label>Correo<input id="scSupEmail" class="input" value="'+esc(existing?.email||'')+'"></label>'+
      '<label>Web<input id="scSupWeb" class="input" value="'+esc(existing?.website||'')+'"></label>'+
      '<label>Aumento predeterminado (%)<input id="scSupMarkup" class="input" type="number" min="0" max="1000" step="0.1" value="'+Number(existing?.default_markup_pct??20)+'"></label>'+
      '<label style="grid-column:1/-1">Notas<textarea id="scSupNotes" class="input" rows="3">'+esc(existing?.notes||'')+'</textarea></label></div>'+
      '<div style="margin-top:12px;padding:12px;border-radius:12px;background:rgba(37,99,235,.08);font-size:13px">Este porcentaje se suma al precio del proveedor para calcular tu precio sugerido. Cada producto puede tener un porcentaje diferente.</div>';
    scModal(existing?'Editar proveedor':'Nuevo proveedor',body,'<button id="scSupCancel" class="secondary">Cancelar</button><button id="scSupSave" class="primary">Guardar</button>');
    document.querySelector("#scSupCancel").onclick=()=>document.querySelector("#modal").innerHTML="";
    document.querySelector("#scSupSave").onclick=async()=>{
      const name=document.querySelector("#scSupName").value.trim(),markup=Number(document.querySelector("#scSupMarkup").value||0);
      if(!name)return alert("El nombre del proveedor es obligatorio.");
      if(markup<0||markup>1000)return alert("El aumento debe estar entre 0% y 1000%.");
      const payload={name,contact_name:document.querySelector("#scSupContact").value.trim()||null,phone:document.querySelector("#scSupPhone").value.trim()||null,email:document.querySelector("#scSupEmail").value.trim()||null,website:document.querySelector("#scSupWeb").value.trim()||null,default_markup_pct:markup,notes:document.querySelector("#scSupNotes").value.trim()||null,updated_at:new Date().toISOString()};
      const r=existing?await S.from("marc_suppliers").update(payload).eq("id",existing.id).eq("user_id",session.user.id):await S.from("marc_suppliers").insert({...payload,user_id:session.user.id});
      if(r.error)return alert(r.error.message);
      document.querySelector("#modal").innerHTML="";await loadCenter();toast(existing?"Proveedor actualizado.":"Proveedor creado.","ok");
    };
  }
  async function editSupplier(id){
    const S=sb();const {data:{session}}=await S.auth.getSession();if(!session)return;
    const r=await S.from("marc_suppliers").select("*").eq("id",id).eq("user_id",session.user.id).maybeSingle();
    if(r.error)return alert(r.error.message);if(r.data)return newSupplier(r.data);
  }

  async function newCatalog(){
    const S=sb(); const {data:{session}}=await S.auth.getSession();
    const {data:suppliers,error:supErr}=await S.from("marc_suppliers").select("id,name").eq("user_id",session.user.id).eq("active",true).order("name");
    if(supErr)return alert("No se pudieron cargar los proveedores: "+supErr.message);
    const supplierOptions=(suppliers||[]).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join("");
    const body='<div style="display:grid;gap:16px">'+
      '<label style="display:grid;gap:7px"><span style="font-weight:700">Proveedor</span><select id="scCatalogSupplier" class="input"><option value="">Sin proveedor</option>'+supplierOptions+'</select></label>'+
      '<label style="display:grid;gap:7px"><span style="font-weight:700">Nombre del catálogo</span><input id="scCatalogName" class="input" value="Catálogo de proveedor" placeholder="Ej. Catálogo Hikvision 2026"></label>'+
      '<div style="border:2px dashed rgba(37,99,235,.45);border-radius:18px;padding:22px;text-align:center;background:rgba(37,99,235,.05)">'+
        '<div style="font-size:34px;margin-bottom:8px">📄</div><b style="display:block;font-size:17px">Sube el catálogo del proveedor</b>'+
        '<small style="display:block;margin:6px 0 16px;opacity:.72">Selecciona el tipo de archivo. El PDF se analiza para detectar productos y fotografías.</small>'+
        '<input id="scCatalogPdf" type="file" accept="application/pdf,.pdf" style="display:none">'+
        '<input id="scCatalogExcel" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" style="display:none">'+
        '<input id="scCatalogImage" type="file" accept="image/*" style="display:none">'+
        '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">'+
          '<button id="scChoosePdf" type="button" class="primary">📄 Subir PDF</button>'+
          '<button id="scChooseExcel" type="button" class="secondary">📊 Subir Excel</button>'+
          '<button id="scChooseImage" type="button" class="secondary">🖼️ Subir foto</button>'+
        '</div>'+
        '<div id="scCatalogFileName" style="margin-top:12px;font-size:13px;opacity:.8">Ningún archivo seleccionado</div>'+
      '</div>'+
      '<div id="scUploadProgress" style="display:none;font-size:13px;opacity:.8">Preparando catálogo…</div>'+
    '</div>';
    scModal("Registrar catálogo",body,'<button id="scCatalogCancel" class="secondary">Cancelar</button><button id="scCatalogUpload" class="primary">⬆️ Subir y analizar</button>');
    const pdfInput=document.querySelector("#scCatalogPdf"),excelInput=document.querySelector("#scCatalogExcel"),imageInput=document.querySelector("#scCatalogImage"),fileName=document.querySelector("#scCatalogFileName");
    let selectedFile=null;
    const choose=input=>{input.value="";input.click()};
    document.querySelector("#scChoosePdf").onclick=()=>choose(pdfInput);
    document.querySelector("#scChooseExcel").onclick=()=>choose(excelInput);
    document.querySelector("#scChooseImage").onclick=()=>choose(imageInput);
    [pdfInput,excelInput,imageInput].forEach(input=>input.onchange=()=>{if(input.files?.[0]){selectedFile=input.files[0];fileName.textContent="📎 "+selectedFile.name+" · "+Math.max(1,selectedFile.size/1024/1024).toFixed(2)+" MB"}});
    document.querySelector("#scCatalogCancel").onclick=()=>document.querySelector("#modal").innerHTML="";
    document.querySelector("#scCatalogUpload").onclick=async()=>{
      const file=selectedFile;
      const name=document.querySelector("#scCatalogName").value.trim();
      const supplierId=document.querySelector("#scCatalogSupplier").value||null;
      if(!name)return alert("Escribe el nombre del catálogo.");
      if(!file)return alert("Selecciona primero el PDF, Excel o imagen.");
      const btn=document.querySelector("#scCatalogUpload"),progress=document.querySelector("#scUploadProgress");
      btn.disabled=true;progress.style.display="block";progress.textContent="Subiendo "+file.name+"…";
      try{
        const path=session.user.id+"/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
        const sourceType=file.type==="application/pdf"||/\.pdf$/i.test(file.name)?"PDF":/\.xlsx?$/i.test(file.name)?"EXCEL":"OTHER";
        const up=await S.storage.from("catalog-pdfs").upload(path,file,{upsert:false,contentType:file.type||"application/octet-stream"});
        if(up.error)throw up.error;
        progress.textContent=sourceType==="PDF"?"Archivo guardado. Analizando productos y fotografías del PDF…":"Archivo guardado. Analizando productos…";
        const ins=await S.from("marc_supplier_catalogs").insert({user_id:session.user.id,supplier_id:supplierId,name,source_type:sourceType,storage_path:path,file_name:file.name,file_size_bytes:file.size,status:"UPLOADED"}).select().single();
        if(ins.error)throw ins.error;
        await analyzeCatalog(ins.data,file);
        document.querySelector("#modal").innerHTML="";
        await loadCenter();
      }catch(e){
        console.error(e);btn.disabled=false;progress.textContent="No se pudo completar la carga.";
        alert("No se pudo subir el catálogo: "+(e.message||e));
      }
    };
  }

  function chooseFile(){
    return new Promise(resolve=>{
      const i=document.createElement("input");i.type="file";i.accept=".pdf,.xlsx,.xls,image/*";i.onchange=()=>resolve(i.files?.[0]||null);i.click();
    });
  }

  async function filterCatalogs(supplierId){
    const S=sb(); if(!S)return;
    const {data:{session}}=await S.auth.getSession(); if(!session)return;
    const root=document.querySelector("#content"); if(!root)return;
    const supplier=await S.from("marc_suppliers").select("*").eq("id",supplierId).eq("user_id",session.user.id).maybeSingle();
    if(supplier.error)return alert("No se pudo cargar el proveedor: "+supplier.error.message);
    if(!supplier.data)return alert("Proveedor no encontrado.");
    const catalogs=await S.from("marc_supplier_catalogs").select("*").eq("supplier_id",supplierId).eq("user_id",session.user.id).order("created_at",{ascending:false});
    if(catalogs.error)return alert("No se pudieron cargar los catálogos: "+catalogs.error.message);
    const list=catalogs.data||[];
    root.innerHTML='<div class="head"><div><div class="eyebrow2">PROVEEDOR</div><h1>'+esc(supplier.data.name)+'</h1><p>Catálogos registrados y productos detectados de este proveedor.</p></div><button id="scBackSuppliers" class="secondary">← Proveedores</button></div>'+
      '<section class="inventory-summary"><div><span>CATÁLOGOS</span><strong>'+list.length+'</strong><small>Documentos registrados</small></div><div><span>CONTACTO</span><strong style="font-size:18px">'+esc(supplier.data.phone||supplier.data.email||"—")+'</strong><small>'+esc(supplier.data.contact_name||"Sin contacto")+'</small></div><div><span>AUMENTO</span><strong>'+Number(supplier.data.default_markup_pct||0)+'%</strong><small>Predeterminado</small></div></section>'+
      '<section class="card table"><div class="toolbar"><div><b>Catálogos de '+esc(supplier.data.name)+'</b></div><button id="scSupplierNewCatalog" class="primary">＋ Registrar catálogo</button></div><div id="scSupplierCatalogList" class="client-cards"></div></section>';
    document.querySelector("#scBackSuppliers").onclick=()=>supplierCenter();
    document.querySelector("#scSupplierNewCatalog").onclick=()=>newCatalog();
    const listEl=document.querySelector("#scSupplierCatalogList");
    listEl.innerHTML=list.map(x=>'<article class="client-card"><div class="client-card-top"><div class="client-avatar">'+esc(x.source_type==="EXCEL"?"XLS":"PDF")+'</div><div class="client-card-name"><h3>'+esc(x.name)+'</h3><small>'+esc(x.status||"UPLOADED")+'</small></div></div><div class="client-card-actions"><button class="primary scOpenCatalog" data-catalog="'+x.id+'">Ver productos</button><button class="secondary scReanalyze" data-catalog="'+x.id+'">↻ Reanalizar</button><button class="danger scDeleteCatalog" data-catalog="'+x.id+'">🗑 Eliminar</button></div></article>').join("")||'<div class="empty-state"><span>📄</span><b>Sin catálogos</b><small>Este proveedor todavía no tiene catálogos registrados.</small></div>';
    listEl.querySelectorAll(".scOpenCatalog").forEach(b=>b.onclick=()=>catalogProducts(b.dataset.catalog));
    listEl.querySelectorAll(".scReanalyze").forEach(b=>b.onclick=()=>reanalyzeCatalog(b.dataset.catalog));
    listEl.querySelectorAll(".scDeleteCatalog").forEach(b=>b.onclick=()=>deleteCatalog(b.dataset.catalog));
  }

  function scModal(title,body,actions=""){
    let root=document.querySelector("#modal")||document.body;
    root.innerHTML='<div id="scModalOverlay" style="position:fixed;inset:0;background:rgba(2,8,23,.72);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px"><div style="width:min(980px,100%);max-height:92vh;overflow:auto;background:var(--card,#fff);color:inherit;border:1px solid rgba(127,127,127,.18);border-radius:22px;box-shadow:0 25px 80px rgba(0,0,0,.35);padding:22px"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px"><div><div class="eyebrow2">M.A.R.C. · CENTRO DE ABASTECIMIENTO</div><h2 style="margin:4px 0 0">'+esc(title)+'</h2></div><button id="scModalClose" class="icon" type="button">×</button></div><div id="scModalBody">'+body+'</div><div id="scModalActions" style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">'+actions+'</div></div></div>';
    document.querySelector("#scModalClose").onclick=()=>root.innerHTML="";
    document.querySelector("#scModalOverlay").onclick=e=>{if(e.target.id==="scModalOverlay")root.innerHTML=""};
    return document.querySelector("#scModalBody");
  }

  async function saveCatalogItem(item, patch){
    const S=sb(); const {data:{session}}=await S.auth.getSession(); if(!session)return false;
    const allowed=["name","sku","description","brand","model","category","unit","supplier_cost","supplier_price","currency","stock_text","status","markup_pct","image_url"];
    const payload={};
    allowed.forEach(k=>{if(Object.prototype.hasOwnProperty.call(patch,k))payload[k]=patch[k]});
    payload.updated_at=new Date().toISOString();
    const r=await S.from("marc_supplier_catalog_items").update(payload).eq("id",item.id).eq("user_id",session.user.id);
    if(r.error){alert("No se pudo guardar el producto: "+r.error.message);return false}
    return true;
  }

  async function uploadSupplierProductPhoto(file, catalogId, itemId="new"){
    if(!file)return null;
    const S=sb(); const {data:{session}}=await S.auth.getSession(); if(!session)return null;
    const ext=(file.name.match(/\\.([a-z0-9]+)$/i)?.[1]||"jpg").toLowerCase();
    const path=session.user.id+"/supplier-product-images/"+catalogId+"/"+itemId+"-"+Date.now()+"."+ext;
    const up=await S.storage.from("inventory-images").upload(path,file,{upsert:false,contentType:file.type||"image/jpeg",cacheControl:"31536000"});
    if(up.error)throw up.error;
    return S.storage.from("inventory-images").getPublicUrl(path).data?.publicUrl||null;
  }

  async function addSupplierCatalogProduct(catalogId){
    const S=sb(); const {data:{session}}=await S.auth.getSession(); if(!session)return;
    const cr=await S.from("marc_supplier_catalogs").select("supplier_id").eq("id",catalogId).eq("user_id",session.user.id).maybeSingle();
    if(cr.error)return alert(cr.error.message);
    let photo=null;
    const body='<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">'+
      '<label style="grid-column:1/-1;display:grid;gap:6px"><span>Foto del producto</span><input id="scNewPhoto" type="file" accept="image/*" capture="environment" class="input"><small style="opacity:.7">En celular puedes abrir directamente la cámara.</small></label>'+
      '<label>Nombre del producto *<input id="scNewName" class="input"></label>'+
      '<label>SKU / Código<input id="scNewSku" class="input"></label>'+
      '<label>Marca<input id="scNewBrand" class="input"></label>'+
      '<label>Modelo<input id="scNewModel" class="input"></label>'+
      '<label>Categoría<input id="scNewCategory" class="input" placeholder="Ej. Cámaras, discos, redes…"></label>'+
      '<label>Unidad<input id="scNewUnit" class="input" value="UND"></label>'+
      '<label>Precio proveedor<input id="scNewPrice" class="input" type="number" min="0" step="0.01"></label>'+
      '<label>Aumento de este producto (%)<input id="scNewMarkup" class="input" type="number" min="0" max="1000" step="0.1" placeholder="Usar proveedor"></label>'+
      '<label style="grid-column:1/-1">Descripción<textarea id="scNewDescription" class="input" rows="3"></textarea></label></div>';
    scModal("Agregar producto del proveedor",body,'<button id="scNewCancel" class="secondary">Cancelar</button><button id="scNewSave" class="primary">Guardar producto</button>');
    document.querySelector("#scNewCancel").onclick=()=>catalogProducts(catalogId);
    document.querySelector("#scNewSave").onclick=async()=>{
      const name=document.querySelector("#scNewName").value.trim(); if(!name)return alert("El nombre es obligatorio.");
      const photoFile=document.querySelector("#scNewPhoto").files?.[0]||null;
      const n=v=>{const s=String(v??"").trim();if(!s)return null;const x=Number(s);return Number.isFinite(x)?x:null};
      const btn=document.querySelector("#scNewSave");btn.disabled=true;btn.textContent="Guardando…";
      try{
        if(photoFile)photo=await uploadSupplierProductPhoto(photoFile,catalogId);
        const r=await S.from("marc_supplier_catalog_items").insert({
          user_id:session.user.id,catalog_id:catalogId,supplier_id:cr.data?.supplier_id||null,name,
          sku:document.querySelector("#scNewSku").value.trim()||null,
          brand:document.querySelector("#scNewBrand").value.trim()||null,
          model:document.querySelector("#scNewModel").value.trim()||null,
          category:document.querySelector("#scNewCategory").value.trim()||null,
          unit:document.querySelector("#scNewUnit").value.trim()||"UND",
          supplier_price:n(document.querySelector("#scNewPrice").value),
          markup_pct:n(document.querySelector("#scNewMarkup").value),
          description:document.querySelector("#scNewDescription").value.trim()||null,
          image_url:photo,status:"REVIEW",source_metadata:{manual:true,source:"CAMERA_OR_UPLOAD"}
        });
        if(r.error)throw r.error;
        toast("Producto guardado en el catálogo.","ok");await catalogProducts(catalogId);
      }catch(e){alert("No se pudo guardar el producto: "+(e.message||e));btn.disabled=false;btn.textContent="Guardar producto"}
    };
  }

  async function editCatalogItem(item, catalogId){
    const body='<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">'+
      '<label style="grid-column:1/-1;display:grid;gap:6px"><span>Foto del producto</span><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'+(item.image_url?'<img src="'+esc(item.image_url)+'" style="width:90px;height:90px;object-fit:contain;border-radius:12px;border:1px solid rgba(127,127,127,.18)">' : '<span style="width:90px;height:90px;display:grid;place-items:center;border-radius:12px;background:rgba(127,127,127,.08)">📷</span>')+'<input id="scEditPhoto" type="file" accept="image/*" capture="environment" class="input"><small style="opacity:.7">En celular puedes tomar una nueva foto directamente.</small></div></label>'+
      '<label style="display:grid;gap:6px"><span>Nombre *</span><input id="scEditName" class="input" value="'+esc(item.name||"")+'"></label>'+
      '<label style="display:grid;gap:6px"><span>SKU / Código</span><input id="scEditSku" class="input" value="'+esc(item.sku||"")+'"></label>'+
      '<label style="display:grid;gap:6px"><span>Marca</span><input id="scEditBrand" class="input" value="'+esc(item.brand||"")+'"></label>'+
      '<label style="display:grid;gap:6px"><span>Modelo</span><input id="scEditModel" class="input" value="'+esc(item.model||"")+'"></label>'+
      '<label style="display:grid;gap:6px"><span>Categoría</span><input id="scEditCategory" class="input" value="'+esc(item.category||"")+'"></label>'+
      '<label style="display:grid;gap:6px"><span>Unidad</span><input id="scEditUnit" class="input" value="'+esc(item.unit||"UND")+'"></label>'+
      '<label style="display:grid;gap:6px"><span>Precio proveedor</span><input id="scEditSupplierPrice" class="input" type="number" step="0.01" value="'+esc(item.supplier_price??"")+'"></label>'+
      '<label style="display:grid;gap:6px"><span>Costo proveedor</span><input id="scEditSupplierCost" class="input" type="number" step="0.01" value="'+esc(item.supplier_cost??"")+'"></label>'+
      '<label style="display:grid;gap:6px"><span>Stock / presentación</span><input id="scEditStock" class="input" value="'+esc(item.stock_text||"")+'"></label>'+
      '<label style="display:grid;gap:6px"><span>Aumento de este producto (%)</span><input id="scEditMarkup" class="input" type="number" min="0" max="1000" step="0.1" value="'+esc(item.markup_pct??"")+'" placeholder="Usar proveedor"></label><label style="display:grid;gap:6px"><span>Estado</span><select id="scEditStatus" class="input"><option value="REVIEW" '+(item.status==="REVIEW"?"selected":"")+'>REVISAR</option><option value="APPROVED" '+(item.status==="APPROVED"?"selected":"")+'>APROBADO</option><option value="IMPORTED" '+(item.status==="IMPORTED"?"selected":"")+'>IMPORTADO</option></select></label>'+
      '<label style="display:grid;gap:6px;grid-column:1/-1"><span>Descripción</span><textarea id="scEditDescription" class="input" rows="4">'+esc(item.description||"")+'</textarea></label>'+
      '</div>';
    scModal("Editar producto del proveedor",body,'<button id="scEditCancel" class="secondary">Cancelar</button><button id="scEditSave" class="primary">Guardar cambios</button>');
    document.querySelector("#scEditCancel").onclick=()=>catalogProducts(catalogId);
    document.querySelector("#scEditSave").onclick=async()=>{
      const name=document.querySelector("#scEditName").value.trim();
      if(!name)return alert("El nombre del producto es obligatorio.");
      const n=v=>{const s=String(v??"").trim();if(!s)return null;const x=Number(s);return Number.isFinite(x)?x:null};
      const photoFile=document.querySelector("#scEditPhoto").files?.[0]||null;
      let photoUrl=item.image_url||null;
      try{if(photoFile)photoUrl=await uploadSupplierProductPhoto(photoFile,catalogId,item.id)}catch(e){return alert("No se pudo subir la foto: "+(e.message||e))}
      const ok=await saveCatalogItem(item,{
        name,
        sku:document.querySelector("#scEditSku").value.trim()||null,
        brand:document.querySelector("#scEditBrand").value.trim()||null,
        model:document.querySelector("#scEditModel").value.trim()||null,
        category:document.querySelector("#scEditCategory").value.trim()||null,
        unit:document.querySelector("#scEditUnit").value.trim()||"UND",
        supplier_price:n(document.querySelector("#scEditSupplierPrice").value),
        supplier_cost:n(document.querySelector("#scEditSupplierCost").value),
        stock_text:document.querySelector("#scEditStock").value.trim()||null,
        status:document.querySelector("#scEditStatus").value,
        markup_pct:n(document.querySelector("#scEditMarkup").value),
        image_url:photoUrl,
        description:document.querySelector("#scEditDescription").value.trim()||null
      });
      if(ok){toast("Producto actualizado.");await catalogProducts(catalogId)}
    };
  }

  async function deleteCatalog(catalogId){
    const S=sb();
    const {data:{session}}=await S.auth.getSession();
    if(!session)return;
    const r=await S.from("marc_supplier_catalogs").select("id,name,file_name,storage_path").eq("id",catalogId).eq("user_id",session.user.id).maybeSingle();
    if(r.error)return alert("No se pudo consultar el catálogo: "+r.error.message);
    if(!r.data)return alert("El catálogo no existe o no tienes permiso para eliminarlo.");
    const catalog=r.data;
    const ok=confirm("¿Eliminar COMPLETAMENTE el catálogo «"+String(catalog.name||catalog.file_name||"Catálogo")+"»?\\n\\nSe eliminarán todos los productos detectados y el archivo original. Los productos que ya hayas importado al Inventario NO se eliminarán.");
    if(!ok)return;

    // Primero eliminamos el archivo original. Si falla, detenemos la operación
    // para no dejar un catálogo incompleto en la base de datos.
    if(catalog.storage_path){
      const sr=await S.storage.from("catalog-pdfs").remove([catalog.storage_path]);
      if(sr.error)return alert("No se pudo eliminar el archivo del catálogo: "+sr.error.message);
    }

    const ir=await S.from("marc_supplier_catalog_items").delete().eq("catalog_id",catalogId).eq("user_id",session.user.id);
    if(ir.error)return alert("Archivo eliminado, pero no se pudieron eliminar los productos del catálogo: "+ir.error.message);

    const cr=await S.from("marc_supplier_catalogs").delete().eq("id",catalogId).eq("user_id",session.user.id);
    if(cr.error)return alert("Productos eliminados, pero no se pudo eliminar el catálogo: "+cr.error.message);

    toast("Catálogo eliminado completamente.");
    await loadCenter();
  }

  async function deleteCatalogItem(item, catalogId){
    if(!confirm("¿Eliminar «"+String(item.name||"Producto")+"» del catálogo? Esta acción no elimina nada de tu Inventario."))return;
    const S=sb(); const {data:{session}}=await S.auth.getSession(); if(!session)return;
    const r=await S.from("marc_supplier_catalog_items").delete().eq("id",item.id).eq("user_id",session.user.id);
    if(r.error)return alert("No se pudo eliminar: "+r.error.message);
    toast("Producto eliminado del catálogo.");
    await catalogProducts(catalogId);
  }

  async function catalogProducts(catalogId){
    const S=sb();
    const {data,error}=await S.from("marc_supplier_catalog_items").select("*").eq("catalog_id",catalogId).order("category").order("name");
    if(error)return alert(error.message);
    const items=data||[];
    if(!items.length){return addSupplierCatalogProduct(catalogId);}
    const catRow=await S.from("marc_supplier_catalogs").select("supplier_id,marc_suppliers(name,default_markup_pct)").eq("id",catalogId).maybeSingle();
    const supplier=catRow.data?.marc_suppliers||null;
    const categories=[...new Set(items.map(x=>String(x.category||"Sin categoría").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
    const body='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><input id="scCatSearch" class="input" placeholder="Buscar producto, SKU, marca o modelo…" style="flex:1;min-width:220px"><select id="scCatFilter" class="input"><option value="">Todas las categorías</option>'+categories.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('')+'</select></div>'+
      '<div style="padding:10px 12px;margin-bottom:12px;border-radius:12px;background:rgba(37,99,235,.08);font-size:13px">Proveedor: <b>'+esc(supplier?.name||"Sin proveedor")+'</b> · Aumento predeterminado: <b>'+Number(supplier?.default_markup_pct||0).toFixed(1)+'%</b>. El precio sugerido es solo de referencia hasta usarlo en una cotización.</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px"><button id="scAddProduct" class="primary">📷 Agregar producto</button><button id="scSelectAll" class="secondary">Seleccionar visibles</button><button id="scClearAll" class="secondary">Quitar selección</button><button id="scImportSelected" class="primary">Importar a Inventario</button><button id="scApproveSelected" class="secondary">Aprobar</button><button id="scDeleteSelected" class="danger">Eliminar</button><button id="scPublishSelected" class="secondary">Crear publicaciones</button></div><div id="scCatTable" style="overflow:auto"></div>';
    scModal("Productos del proveedor · "+items.length,body,'<button id="scDone" class="primary">Listo</button>');
    document.querySelector("#scDone").onclick=()=>document.querySelector("#modal").innerHTML="";
    const selected=()=>[...document.querySelectorAll(".scItemCheck:checked")].map(x=>items.find(i=>i.id===x.value)).filter(Boolean);
    const render=()=>{
      const q=String(document.querySelector("#scCatSearch").value||"").toLowerCase().trim(),cat=document.querySelector("#scCatFilter").value;
      const visible=items.filter(x=>{const hay=[x.name,x.sku,x.brand,x.model,x.category].filter(Boolean).join(" ").toLowerCase();return(!q||hay.includes(q))&&(!cat||String(x.category||"Sin categoría")===cat)});
      const rows=visible.map(x=>{const base=Number(x.supplier_price??x.supplier_cost??0),pct=Number(x.markup_pct??supplier?.default_markup_pct??0),sell=base+(base*pct/100);return '<tr><td><input type="checkbox" class="scItemCheck" value="'+x.id+'"></td><td><b>'+esc(x.name)+'</b><br><small>'+esc([x.brand,x.model,x.sku].filter(Boolean).join(" · "))+'</small></td><td>'+money(base)+'</td><td><b>'+money(sell)+'</b><small style="display:block;opacity:.65">+'+pct.toFixed(1)+'%</small></td><td>'+esc(x.category||"Sin categoría")+'</td><td><span class="badge '+(x.status==="IMPORTED"||x.status==="APPROVED"?"ok":"low")+'">'+esc(x.status)+'</span></td><td><button class="secondary scEditOne" data-id="'+x.id+'">Editar</button> <button class="danger scDeleteOne" data-id="'+x.id+'">Eliminar</button></td></tr>'}).join('');
      document.querySelector("#scCatTable").innerHTML='<table style="width:100%;border-collapse:collapse"><thead><tr><th></th><th>Producto</th><th>Proveedor</th><th>Venta sugerida</th><th>Categoría</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'+rows+'</tbody></table>';
      document.querySelector("#scAddProduct").onclick=()=>addSupplierCatalogProduct(catalogId);
      document.querySelector("#scSelectAll").onclick=()=>document.querySelectorAll("#scCatTable .scItemCheck").forEach(x=>x.checked=true);
      document.querySelector("#scClearAll").onclick=()=>document.querySelectorAll("#scCatTable .scItemCheck").forEach(x=>x.checked=false);
      document.querySelectorAll(".scEditOne").forEach(b=>b.onclick=()=>{const item=items.find(i=>i.id===b.dataset.id);if(item)editCatalogItem(item,catalogId)});
      document.querySelectorAll(".scDeleteOne").forEach(b=>b.onclick=()=>{const item=items.find(i=>i.id===b.dataset.id);if(item)deleteCatalogItem(item,catalogId)});
    };
    document.querySelector("#scCatSearch").oninput=render;document.querySelector("#scCatFilter").onchange=render;render();
    document.querySelector("#scImportSelected").onclick=async()=>{const chosen=selected();if(!chosen.length)return alert("Selecciona al menos un producto.");for(const item of chosen)await importCatalogItem(item,supplier);await catalogProducts(catalogId)};
    document.querySelector("#scApproveSelected").onclick=async()=>{const chosen=selected();if(!chosen.length)return alert("Selecciona al menos un producto.");const r=await S.from("marc_supplier_catalog_items").update({status:"APPROVED",updated_at:new Date().toISOString()}).in("id",chosen.map(x=>x.id));if(r.error)return alert(r.error.message);await catalogProducts(catalogId)};
    document.querySelector("#scDeleteSelected").onclick=async()=>{const chosen=selected();if(!chosen.length)return alert("Selecciona al menos un producto.");if(!confirm("¿Eliminar "+chosen.length+" producto(s)?"))return;const r=await S.from("marc_supplier_catalog_items").delete().in("id",chosen.map(x=>x.id));if(r.error)return alert(r.error.message);await catalogProducts(catalogId)};
    document.querySelector("#scPublishSelected").onclick=async()=>{for(const item of selected())await createPublicationDraft(item)};
  }

  async function reanalyzeCatalog(catalogId){
    const S=sb(); const {data:{session}}=await S.auth.getSession(); if(!session)return;
    const r=await S.from("marc_supplier_catalogs").select("*").eq("id",catalogId).eq("user_id",session.user.id).maybeSingle();
    if(r.error)return alert("No se pudo cargar el catálogo: "+r.error.message);
    const catalog=r.data;
    if(!catalog?.storage_path)return alert("Este catálogo no tiene el archivo original guardado.");
    if(!confirm("Se volverá a leer el archivo original con el nuevo detector. Los productos detectados actualmente se reemplazarán solo después de que el nuevo análisis termine correctamente. ¿Continuar?"))return;
    const progress=scModal("Reanalizando catálogo",'<div style="display:grid;gap:12px"><div style="font-size:42px;text-align:center">🔎</div><b style="text-align:center">Analizando nuevamente el archivo original…</b><small id="scReanalyzeStatus" style="text-align:center;opacity:.72">Preparando lectura inteligente.</small></div>','<button id="scReanalyzeCancel" class="secondary">Cerrar</button>');
    document.querySelector("#scReanalyzeCancel").onclick=()=>document.querySelector("#modal").innerHTML="";
    try{
      await S.from("marc_supplier_catalogs").update({status:"ANALYZING",ai_provider:catalog.source_type==="EXCEL"?"XLSX-PARSER-V2":"PDF-JS-V2"}).eq("id",catalog.id);
      const dl=await S.storage.from("catalog-pdfs").download(catalog.storage_path);
      if(dl.error)throw dl.error;
      if(!dl.data)throw new Error("El archivo original no pudo recuperarse del almacenamiento.");
      // Supabase Storage devuelve un Blob sin nombre. El analizador necesita el nombre
      // para identificar PDF/XLSX, por eso lo convertimos nuevamente en File.
      const fileType=catalog.source_type==="EXCEL"
        ?"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        :"application/pdf";
      const originalFile=new File([dl.data],catalog.file_name||("catalogo-"+catalog.id+(catalog.source_type==="EXCEL"?".xlsx":".pdf")),{type:dl.data.type||fileType});
      document.querySelector("#scReanalyzeStatus").textContent="Archivo recuperado. Aplicando el nuevo detector…";
      await analyzeCatalog(catalog,originalFile,true);
      document.querySelector("#modal").innerHTML="";
      await loadCenter();
      toast("Catálogo reanalizado correctamente.");
    }catch(e){
      console.error(e);
      await S.from("marc_supplier_catalogs").update({status:"ERROR"}).eq("id",catalog.id);
      document.querySelector("#modal").innerHTML="";
      alert("No se pudo reanalizar el catálogo: "+(e.message||e));
      await loadCenter();
    }
  }

  async function analyzeCatalog(catalog,file,replaceExisting=false){
    const S=sb();
    await S.from("marc_supplier_catalogs").update({status:"ANALYZING",ai_provider:file.name.match(/\.xlsx?$/i)?"XLSX-PARSER":"PDF-JS"}).eq("id",catalog.id);
    try{
      let items=[];
      if(/\.xlsx?$/i.test(file.name)) items=await parseExcelCatalog(file);
      else if(file.type==="application/pdf"||/\.pdf$/i.test(file.name)) items=await parsePdfCatalog(file);
      else throw new Error("El análisis automático funciona con Excel y PDF.");
      if(!items.length)throw new Error("No se detectaron productos.");
      const {data:{session}}=await S.auth.getSession();
      for(const item of items){
        if(item.image_data_url){
          try{
            const blob=await (await fetch(item.image_data_url)).blob();
            const ext=blob.type==="image/jpeg"?"jpg":"png";
            const path=session.user.id+"/catalog-images/"+catalog.id+"/"+Date.now()+"-"+Math.random().toString(36).slice(2,8)+"."+ext;
            const up=await S.storage.from("inventory-images").upload(path,blob,{upsert:false,contentType:blob.type||"image/png",cacheControl:"31536000"});
            if(!up.error){
              const pub=S.storage.from("inventory-images").getPublicUrl(path);
              item.image_url=pub.data?.publicUrl||null;
            }else console.warn("No se pudo subir imagen del PDF",up.error);
          }catch(e){console.warn("No se pudo procesar imagen del PDF",e)}
        }
        delete item.image_data_url;
      }
      if(replaceExisting){
        const del=await S.from("marc_supplier_catalog_items").delete().eq("catalog_id",catalog.id).eq("user_id",session.user.id);
        if(del.error)throw del.error;
      }
      const payload=items.map(x=>({...x,user_id:session.user.id,catalog_id:catalog.id,supplier_id:catalog.supplier_id,status:"REVIEW"}));
      const ins=await S.from("marc_supplier_catalog_items").insert(payload);
      if(ins.error)throw ins.error;
      await S.from("marc_supplier_catalogs").update({status:"READY",imported_at:new Date().toISOString()}).eq("id",catalog.id);
      alert("Análisis terminado: "+items.length+" productos detectados.");
    }catch(e){
      console.error(e);
      await S.from("marc_supplier_catalogs").update({status:"ERROR"}).eq("id",catalog.id);
      throw e;
    }
  }

  function normalizeHeader(v){return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");}
  function num(v){if(v===null||v===undefined||v==="")return null; const n=Number(String(v).replace(/[^0-9,.-]/g,"").replace(/,(?=\d{3}(?:\D|$))/g,"").replace(",", "."));return Number.isFinite(n)?n:null;}
  function pickField(row,map,names){for(const n of names){const k=map[normalizeHeader(n)];if(k&&row[k]!==undefined&&row[k]!==null&&String(row[k]).trim()!=="")return row[k];}return null;}
  async function parseExcelCatalog(file){
    if(!window.XLSX)throw new Error("No está disponible el lector de Excel.");
    const wb=XLSX.read(await file.arrayBuffer(),{type:"array"}),out=[];
    wb.SheetNames.forEach(sheet=>{const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{defval:""});if(!rows.length)return;const map={};Object.keys(rows[0]).forEach(k=>map[normalizeHeader(k)]=k);
      rows.forEach((r,idx)=>{const name=pickField(r,map,["nombre","producto","descripcion","articulo","item"]);if(!name)return;const sku=pickField(r,map,["sku","codigo","part number","pn"]),brand=pickField(r,map,["marca","brand"]),model=pickField(r,map,["modelo","model"]),cat=pickField(r,map,["categoria","category","rubro"]),unit=pickField(r,map,["unidad","unit"])||"UND",cost=num(pickField(r,map,["precio compra","costo","cost","precio proveedor"])),price=num(pickField(r,map,["precio venta","precio","venta","price","pvp"])),stock=pickField(r,map,["stock","existencia","cantidad"]),desc=pickField(r,map,["descripcion","detalle","description"]);
      out.push({sku:sku?String(sku):null,name:String(name).trim(),description:desc?String(desc):null,brand:brand?String(brand):null,model:model?String(model):null,category:cat?String(cat):null,unit:String(unit),supplier_cost:cost,supplier_price:price,currency:"PEN",stock_text:stock!==null?String(stock):null,ai_confidence:price||sku?0.95:0.75,source_metadata:{sheet,row:idx+2}});});
    }); return out;
  }
  async function pdfImageDataUrl(image){
    if(!image||!image.data||!image.width||!image.height)return null;
    const canvas=document.createElement("canvas");canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext("2d");if(!ctx)return null;
    let src=image.data;
    if(image.kind===pdfjsLib.ImageKind?.RGB_24BPP){
      const rgba=new Uint8ClampedArray(image.width*image.height*4);
      for(let i=0,j=0;i<src.length;i+=3,j+=4){rgba[j]=src[i];rgba[j+1]=src[i+1];rgba[j+2]=src[i+2];rgba[j+3]=255;}
      src=rgba;
    }else if(image.kind===pdfjsLib.ImageKind?.GRAYSCALE_1BPP||image.kind===pdfjsLib.ImageKind?.GRAYSCALE_8BPP){
      const rgba=new Uint8ClampedArray(image.width*image.height*4);
      for(let i=0,j=0;i<image.width*image.height;i++,j+=4){const v=src[i]||0;rgba[j]=v;rgba[j+1]=v;rgba[j+2]=v;rgba[j+3]=255;}
      src=rgba;
    }else if(src.length===image.width*image.height*3){
      const rgba=new Uint8ClampedArray(image.width*image.height*4);
      for(let i=0,j=0;i<src.length;i+=3,j+=4){rgba[j]=src[i];rgba[j+1]=src[i+1];rgba[j+2]=src[i+2];rgba[j+3]=255;}
      src=rgba;
    }
    if(src.length!==image.width*image.height*4)return null;
    try{ctx.putImageData(new ImageData(src,image.width,image.height),0,0);return canvas.toDataURL("image/png",0.9)}catch(e){console.warn("No se pudo convertir imagen PDF",e);return null}
  }
  function pdfMatrixMultiply(m,n){
    return [
      m[0]*n[0]+m[2]*n[1],
      m[1]*n[0]+m[3]*n[1],
      m[0]*n[2]+m[2]*n[3],
      m[1]*n[2]+m[3]*n[3],
      m[0]*n[4]+m[2]*n[5]+m[4],
      m[1]*n[4]+m[3]*n[5]+m[5]
    ];
  }
  function pdfMatrixPoint(m,x,y){return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]}
  async function extractPdfImagesWithBoxes(page){
    const op=await page.getOperatorList(),images=[],OPS=pdfjsLib.OPS||{},stack=[],identity=[1,0,0,1,0,0];
    let matrix=identity.slice();
    for(let i=0;i<op.fnArray.length;i++){
      const fn=op.fnArray[i],args=op.argsArray[i];
      if(fn===OPS.save){stack.push(matrix.slice());continue}
      if(fn===OPS.restore){matrix=stack.pop()||identity.slice();continue}
      if(fn===OPS.transform&&args?.length>=6){matrix=pdfMatrixMultiply(matrix,args);continue}
      if(fn!==OPS.paintImageXObject&&fn!==OPS.paintImageMaskXObject)continue;
      const key=args?.[0];if(!key||!page.objs?.has?.(key))continue;
      try{
        const image=page.objs.get(key),dataUrl=await pdfImageDataUrl(image);
        if(!dataUrl)continue;
        const w=Number(image.width||0),h=Number(image.height||0);if(!w||!h)continue;
        const pts=[[0,0],[w,0],[0,h],[w,h]].map(p=>pdfMatrixPoint(matrix,p[0],p[1]));
        const vp=page.getViewport({scale:1});
        const vpts=pts.map(p=>vp.convertToViewportPoint(p[0],p[1]));
        const xs=vpts.map(p=>p[0]),ys=vpts.map(p=>p[1]);
        images.push({dataUrl,x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2,width:Math.abs(Math.max(...xs)-Math.min(...xs)),height:Math.abs(Math.max(...ys)-Math.min(...ys))});
      }catch(e){console.warn("Imagen PDF no disponible",e)}
    }
    return images;
  }
  function pdfProductRows(tc){
    const rows=[];
    (tc.items||[]).forEach(item=>{
      const text=String(item.str||"").trim();if(!text)return;
      const t=item.transform||[1,0,0,1,0,0],y=Number(t[5]||0);
      let row=rows.find(r=>Math.abs(r.y-y)<5);
      if(!row){row={y,texts:[],items:[]};rows.push(row)}
      row.texts.push(text);row.items.push(item);
    });
    return rows.map(r=>({y:r.y,text:r.texts.join(" ").replace(/\s+/g," ").trim()})).filter(r=>r.text);
  }
  function catalogProductKey(value){
    return String(value||"")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g,"")
      .replace(/[^a-z0-9]+/g," ")
      .trim()
      .replace(/\\s+/g," ");
  }
  function cleanCatalogProductText(text){
    let s=String(text||"").replace(/[\t\r\n]+/g," ").replace(/\s+/g," ").trim();
    s=s.replace(/(?:S\/\.?|S\.?|PEN|USD|US\$)\s*\d+(?:[.,]\d{1,2})?/gi," ");
    s=s.replace(/\b(?:PVP|PRECIO|OFERTA|PROMO(?:CION)?|DESDE)\b/gi," ");
    s=s.replace(/(^|\s)\d+(?:[.,]\d{1,2})?(?=\s*$)/g," ");
    return s.replace(/[|•·]+/g," ").replace(/\s+/g," ").trim();
  }
  function isNoiseCatalogText(text){
    const s=String(text||"").trim();
    if(!s)return true;
    if(/^(?:p[aá]gina|page|www\\.|http|tel[eé]fono|fax|correo|email|precio|pvp|total|subtotal|iva|igv|catalogo|cat[aá]logo|descripci[oó]n|producto|c[oó]digo|sku|modelo|marca)$/i.test(s))return true;
    return false;
  }
  function isLikelyPdfProductText(text){
    const raw=String(text||"").trim();
    const clean=cleanCatalogProductText(raw);
    if(clean.length<4||isNoiseCatalogText(clean))return false;
    const letters=(clean.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g)||[]).length;
    return letters>=3;
  }
  function pdfRowPrice(text){
    const s=String(text||"");
    const m=s.match(/(?:S\/\.?|S\.?|PEN|USD|US\$)?\s*\d+(?:[.,]\d{1,2})?(?=\s*$)/i);
    if(m)return num(m[0]);
    const all=s.match(/(?:S\/\.?|S\.?|PEN|USD|US\$)\s*\d+(?:[.,]\d{1,2})?/gi);
    return all?.length?num(all[all.length-1]):null;
  }
    function mergeCatalogCandidates(candidates){
    const groups=[];
    for(const c of candidates){
      const key=c.sku?catalogProductKey(c.sku):catalogProductKey(c.name);
      // Un mismo producto puede ocupar varias líneas del PDF (nombre, modelo,
      // precio, descripción). La proximidad de filas NO debe impedir la unión:
      // eso estaba inflando 131 -> 221. La página sigue siendo parte de la clave
      // para no fusionar productos legítimamente repetidos en páginas distintas.
      let g=key?groups.find(x=>{
        if(x.page!==c.page||x.key!==key)return false;
        // Si dos fichas comparten nombre/código y precio pero tienen fotografías
        // diferentes, pueden ser productos distintos. No los fusionamos.
        if(c.imageIndex!==null&&c.imageIndex!==undefined &&
           x.imageIndex!==null&&x.imageIndex!==undefined &&
           c.imageIndex!==x.imageIndex)return false;
        return true;
      }):null;
      if(!g&&c.imageIndex!==null&&c.imageIndex!==undefined)
        g=groups.find(x=>x.page===c.page&&x.imageIndex===c.imageIndex);
      if(!g){
        g={...c,key,prices:[],descriptions:[]};
        if(c.supplier_price!=null)g.prices.push(c.supplier_price);
        if(c.description)g.descriptions.push(c.description);
        groups.push(g);
      }else{
        if(c.supplier_price!=null)g.prices.push(c.supplier_price);
        if(c.description)g.descriptions.push(c.description);
        if((c.name||"").length>(g.name||"").length)g.name=c.name;
        if(!g.sku&&c.sku)g.sku=c.sku;
        if(!g.image_data_url&&c.image_data_url)g.image_data_url=c.image_data_url;
        if(c.ai_confidence>g.ai_confidence)g.ai_confidence=c.ai_confidence;
      }
    }
    const out=[];
    for(const g of groups){
      const name=String(g.name||"").trim();
      if(isNoiseCatalogText(name))continue;
      const prices=g.prices.filter(Number.isFinite);
      const price=prices.length?Math.max(...prices):null;
      const desc=[...new Set(g.descriptions.map(x=>String(x).trim()).filter(Boolean))].join(" · ").slice(0,800);
      out.push({
        sku:g.sku||null,name:name.slice(0,180),description:desc||null,
        brand:g.brand||null,model:g.model||null,category:g.category||null,
        unit:g.unit||"UND",supplier_cost:g.supplier_cost??null,
        supplier_price:price,currency:"PEN",stock_text:g.stock_text||null,
        image_data_url:g.image_data_url||null,
        ai_confidence:Number(g.ai_confidence||0.55),
        source_metadata:{...(g.source_metadata||{}),merged_prices:prices.length}
      });
    }
    const final=[],seen=new Set();
    for(const x of out){
      const page=x.source_metadata?.page??"";
      const key=[page,x.sku?catalogProductKey(x.sku):"",catalogProductKey(x.name),x.supplier_price??""].join("|");
      if(seen.has(key))continue;
      seen.add(key);
      final.push(x);
    }
    return final;
  }

  async function parsePdfCatalog(file){
    if(!window.pdfjsLib)throw new Error("No está disponible el lector PDF.");

    // PROVEEDORES usa exactamente el mismo motor de lectura PDF de INVENTARIO.
    // No duplicamos la lógica ni usamos heurísticas por cantidad de imágenes:
    // si Inventario puede leer una página directamente, Proveedores usa ese
    // mismo resultado. Solo las páginas que Inventario no puede resolver pasan
    // al mismo analizador avanzado que ya utiliza Inventario.
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
    const sharedReader=window.MARC_PDF_CATALOG_READER;
    const {data:{session}}=await sb().auth.getSession();
    const detected=[];
    const failedPages=[];
    const CONCURRENCY=4;

    let pendingId=null;
    let pendingPromise=null;
    const ensurePendingId=async()=>{
      if(pendingId)return pendingId;
      if(pendingPromise)return pendingPromise;
      pendingPromise=fetch("/api/inventory/pdf-start",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          Authorization:"Bearer "+(session?.access_token||"")
        },
        body:JSON.stringify({filename:file.name,totalPages:pdf.numPages})
      }).then(async r=>{
        const j=await r.json();
        if(!r.ok)throw new Error(j.message||j.error||"No se pudo iniciar el análisis avanzado.");
        if(!j.pendingId)throw new Error("No se recibió la sesión de análisis avanzado.");
        pendingId=j.pendingId;
        return pendingId;
      }).finally(()=>{pendingPromise=null});
      return pendingPromise;
    };

    const analyzeAdvancedPage=async(page,pageNumber)=>{
      const pendingForPage=await ensurePendingId();
      const text=sharedReader?.extractPageText
        ?await sharedReader.extractPageText(page)
        :"";
      let viewport=page.getViewport({scale:1.25});
      if(viewport.width>1600)viewport=page.getViewport({scale:1.25*(1600/viewport.width)});
      const canvas=document.createElement("canvas");
      const ctx=canvas.getContext("2d",{alpha:false});
      if(!ctx)throw new Error("No se pudo crear el visor de página.");
      canvas.width=Math.ceil(viewport.width);
      canvas.height=Math.ceil(viewport.height);
      await page.render({canvasContext:ctx,viewport}).promise;
      const image=canvas.toDataURL("image/jpeg",0.72);

      let lastError=null;
      for(let retry=0;retry<2;retry++){
        try{
          const r=await fetch("/api/inventory/pdf-page",{
            method:"POST",
            headers:{
              "Content-Type":"application/json",
              Authorization:"Bearer "+(session?.access_token||"")
            },
            body:JSON.stringify({
              pendingId:pendingForPage,
              pageNumber,
              totalPages:pdf.numPages,
              text,
              image
            })
          });
          const j=await r.json();
          if(!r.ok)throw new Error(j.message||j.error||("No se pudo analizar la página "+pageNumber));
          return Array.isArray(j.items)?j.items:[];
        }catch(e){
          lastError=e;
          if(retry===0)console.warn("Reintentando análisis de P"+pageNumber,e);
        }
      }
      throw lastError||new Error("No se pudo analizar la página "+pageNumber);
    };

    const attachSupplierImages=async(page,items,pageNumber)=>{
      if(!items.length)return;
      let images=[];
      try{images=await extractPdfImagesWithBoxes(page)}catch(e){console.warn("No se pudieron extraer imágenes de P"+pageNumber,e)}
      if(!images.length)return;

      items.forEach((item,index)=>{
        let best=-1,bestDist=Infinity;
        images.forEach((im,idx)=>{
          const d=Math.abs(Number(im.y||0)-Number(item.pdf_y||item.y||0));
          if(d<bestDist){bestDist=d;best=idx}
        });
        const matched=best>=0&&bestDist<160?images[best]:null;
        if(matched){
          item.image_data_url=matched.dataUrl||item.image_data_url||null;
          item.source_metadata=Object.assign({},item.source_metadata||{},{
            image_detected:true,
            image_index:best,
            image_match_distance:Math.round(bestDist)
          });
        }
        item.source_metadata=Object.assign({},item.source_metadata||{},{
          page:pageNumber,
          source_row:index,
          reader:item.source_metadata?.reader||"INVENTARIO_COMPARTIDO"
        });
      });
    };

    for(let batchStart=1;batchStart<=pdf.numPages;batchStart+=CONCURRENCY){
      const batch=[];
      for(let i=0;i<CONCURRENCY&&batchStart+i<=pdf.numPages;i++)batch.push(batchStart+i);

      const settled=await Promise.allSettled(batch.map(async pageNumber=>{
        const page=await pdf.getPage(pageNumber);

        // EXACTAMENTE igual que Inventario:
        // 1. lector local compartido;
        // 2. si funciona, se acepta inmediatamente;
        // 3. solo si no funciona, se usa Gemini/analizador avanzado.
        const local=sharedReader?.extractRows
          ?await sharedReader.extractRows(page)
          :{rows:[],text:"",usedLocal:false};

        if(local.usedLocal&&local.rows.length){
          const items=local.rows.map((row,index)=>({
            ...row,
            page_number:row.page_number||pageNumber,
            source_metadata:Object.assign({},row.source_metadata||{},{
              page:pageNumber,
              source_row:index,
              reader:"INVENTARIO_COMPARTIDO"
            })
          }));
          await attachSupplierImages(page,items,pageNumber);
          return {pageNumber,items,mode:"LECTURA DIRECTA"};
        }

        // EXACTAMENTE el mismo camino de respaldo de Inventario.
        const analyzed=await analyzeAdvancedPage(page,pageNumber);
        const items=Array.isArray(analyzed)?analyzed.map((row,index)=>({
          ...row,
          page_number:row.page_number||pageNumber,
          source_metadata:Object.assign({},row.source_metadata||{},{
            page:pageNumber,
            source_row:index,
            reader:"INVENTARIO_AVANZADO"
          })
        })):[];
        await attachSupplierImages(page,items,pageNumber);
        return {pageNumber,items,mode:"GEMINI"};
      }));

      settled.forEach((r,idx)=>{
        if(r.status==="fulfilled"){
          const result=r.value;
          detected.push(...result.items);
        }else{
          failedPages.push({
            pageNumber:batch[idx],
            error:r.reason?.message||"Error desconocido"
          });
        }
      });

      const progressEl=document.querySelector("#scReanalyzeStatus");
      if(progressEl){
        const done=Math.min(batchStart+batch.length-1,pdf.numPages);
        progressEl.textContent="Leyendo páginas "+done+"/"+pdf.numPages+" · "+detected.length+" productos detectados";
      }
    }

    if(failedPages.length){
      throw new Error(
        "No se pudieron analizar todas las páginas: "+
        failedPages.map(x=>"P"+x.pageNumber).join(", ")+
        ". No se reemplazó el catálogo."
      );
    }

    // El lector de Inventario ya hace su propia consolidación por página.
    // Aquí solo adaptamos el resultado al esquema de proveedores y aplicamos
    // la consolidación específica del catálogo, sin volver a interpretar PDF.
    const normalized=detected.map((row,index)=>{
      const price=row.price??row.supplier_price??null;
      const cost=row.cost??row.supplier_cost??null;
      const name=cleanCatalogProductText(row.name||row.product||row.description||"");
      return {
        page_number:Number(row.page_number||row.source_metadata?.page||1),
        sku:row.sku?String(row.sku).trim():null,
        name:name.slice(0,180),
        description:String(row.description||row.name||"").slice(0,800)||null,
        brand:row.brand?String(row.brand).trim():null,
        model:row.model?String(row.model).trim():null,
        category:row.category?String(row.category).trim():null,
        unit:row.unit||"UND",
        supplier_cost:Number.isFinite(Number(cost))?Number(cost):null,
        supplier_price:Number.isFinite(Number(price))?Number(price):null,
        currency:row.currency||"PEN",
        stock_text:row.stock_text?String(row.stock_text):null,
        image_data_url:row.image_data_url||null,
        ai_confidence:Number(row.ai_confidence??0.9),
        source_metadata:Object.assign({},row.source_metadata||{},{
          page:Number(row.page_number||row.source_metadata?.page||1),
          reader:row.source_metadata?.reader||"INVENTARIO_COMPARTIDO",
          source_index:index
        })
      };
    }).filter(x=>x.name&&!isNoiseCatalogText(x.name));

    // El lector compartido de Inventario ya entrega las filas de productos consolidadas.
    // En Proveedores NO volvemos a agrupar por nombre: eso estaba convirtiendo
    // 136 productos leídos correctamente en solo 49 al fusionar variantes del
    // mismo nombre dentro de una misma página.
    // Cada fila detectada por el lector se conserva como un producto del catálogo.
    const result=normalized.slice(0,2000);
    if(!result.length){
      throw new Error("El PDF no contiene productos reconocibles.");
    }
    return result;
  }

  async function importCatalogItem(item,supplier=null){
    const S=sb(); const {data:{session}}=await S.auth.getSession(); let existing=null;
    if(item.sku){const r=await S.from("marc_inventory").select("*").eq("user_id",session.user.id).eq("sku",item.sku).maybeSingle();existing=r.data;}
    const base=Number(item.supplier_price||item.supplier_cost||0),markup=Number(item.markup_pct??supplier?.default_markup_pct??0),sell=base+(base*markup/100); const payload={sku:item.sku||null,name:item.name,brand:item.brand||null,model:item.model||null,category:item.category||null,unit:item.unit||"UND",cost:base,price:sell,stock:0,min_stock:0,image_url:item.image_url||null,active:true};
    const r=existing?await S.from("marc_inventory").update(payload).eq("id",existing.id).select().single():await S.from("marc_inventory").insert({...payload,user_id:session.user.id}).select().single();
    if(r.error)return alert("No se pudo importar a Inventario: "+r.error.message);
    await S.from("marc_supplier_catalog_items").update({inventory_id:r.data.id,status:"IMPORTED"}).eq("id",item.id);
    alert("Producto importado a Inventario: "+item.name);
  }

  async function getPublicationPlan(){
    const S=sb();
    const {data:{session}}=await S.auth.getSession();
    if(!session)return {plan:"NONE",active:false};
    const r=await S.from("marc_subscriptions").select("plan,status,current_period_end").eq("user_id",session.user.id).eq("status","active").order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(r.error)return {plan:"NONE",active:false,error:r.error.message};
    const plan=String(r.data?.plan||"").toUpperCase();
    return {plan,active:!!r.data,canPublish:!!r.data&&plan==="MASTER",end:r.data?.current_period_end||null};
  }
  function publicationUpgradeMessage(){
    alert("La publicación y programación automática en redes sociales están reservadas para el plan MASTER. En planes inferiores puedes preparar y guardar borradores.");
  }
  async function createPublicationDraft(item){
    const S=sb(); const {data:{session}}=await S.auth.getSession();
    const options="1. FACEBOOK\\n2. INSTAGRAM\\n3. TIKTOK\\n4. WHATSAPP\\n5. LINKEDIN";
    const n=Number(prompt("¿Dónde quieres preparar la publicación?\\n"+options,"2")||0);
    const platform=["FACEBOOK","INSTAGRAM","TIKTOK","WHATSAPP","LINKEDIN"][n-1];
    if(!platform)return;
    const body="Producto: "+item.name+"\\n"+[item.brand,item.model,item.sku].filter(Boolean).join(" · ")+"\\nPrecio proveedor: "+money(item.supplier_price||item.supplier_cost);
    const r=await S.from("marc_publications").insert({user_id:session.user.id,inventory_id:item.inventory_id||null,platform,status:"DRAFT",title:item.name,headline:item.name,body,short_text:"Consulta disponibilidad y precio.",hashtags:[],media_url:item.image_url||null,media_type:"IMAGE"}).select().single();
    if(r.error)return alert("No se pudo crear el borrador: "+r.error.message);
    const p=await getPublicationPlan();
    if(p.canPublish){
      const action=prompt("MASTER activo. Escribe 1 para guardar borrador o 2 para programar publicación:","1");
      if(String(action)==="2")return schedulePublication(r.data.id,platform);
    }
    alert("Borrador creado para "+platform+". Puedes editarlo en Publicidad. La publicación real está bloqueada hasta tener MASTER y una cuenta social conectada.");
    if(window.view)window.view("marketing");
  }
  async function schedulePublication(publicationId,platform){
    const S=sb();
    const p=await getPublicationPlan();
    if(!p.canPublish)return publicationUpgradeMessage();
    const when=prompt("Fecha y hora de publicación (YYYY-MM-DD HH:MM)","");
    if(!when)return;
    const iso=when.replace(" ","T")+":00";
    const d=new Date(iso);
    if(Number.isNaN(d.getTime()))return alert("Fecha no válida.");
    const u=await S.from("marc_publications").update({status:"SCHEDULED",scheduled_for:d.toISOString()}).eq("id",publicationId).eq("user_id",(await S.auth.getSession()).data.session.user.id);
    if(u.error)return alert("No se pudo programar: "+u.error.message);
    const session=(await S.auth.getSession()).data.session;
    const j=await S.from("marc_publication_jobs").insert({publication_id:publicationId,user_id:session.user.id,status:"PENDING",run_after:d.toISOString()});
    if(j.error)return alert("La publicación quedó programada, pero no se pudo crear el trabajo automático: "+j.error.message);
    alert("Publicación programada para "+platform+". La ejecución automática de la red social requiere conectar la cuenta correspondiente.");
    if(window.view)window.view("marketing");
  }

  async function socialConnectionsPanel(){
    const S=sb(); const {data:{session}}=await S.auth.getSession(); if(!session)return;
    const plan=await getPublicationPlan();
    const r=await S.from("marc_social_connections").select("id,platform,account_name,status,scopes,connected_at,updated_at,last_error").eq("user_id",session.user.id).order("platform");
    if(r.error)return alert(r.error.message);
    const rows=(r.data||[]);
    const platforms=["FACEBOOK","INSTAGRAM","TIKTOK","WHATSAPP","LINKEDIN"];
    const body='<div style="display:grid;gap:10px">'+platforms.map(p=>{const x=rows.find(v=>v.platform===p);const ok=x?.status==="CONNECTED";return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;border:1px solid rgba(127,127,127,.18);border-radius:14px"><div><b>'+p+'</b><small style="display:block;opacity:.7">'+(ok?(esc(x.account_name||"Cuenta conectada")):"Sin conectar")+'</small></div><span class="badge '+(ok?"ok":"low")+'">'+(ok?"CONECTADA":"DESCONECTADA")+'</span><button class="'+(ok?"secondary":"primary")+'" data-social="'+p+'">'+(ok?"Desconectar":"Conectar")+'</button></div>'}).join("")+'</div>'+(plan.canPublish?'<p style="margin-top:14px">Plan MASTER activo: podrás publicar/programar cuando la API de la red esté conectada.</p>':'<p style="margin-top:14px">Las cuentas pueden prepararse, pero la publicación automática requiere el plan MASTER.</p>');
    scModal("Cuentas sociales",body,'<button id="scSocialClose" class="primary">Listo</button>');
    document.querySelector("#scSocialClose").onclick=()=>document.querySelector("#modal").innerHTML="";
    document.querySelectorAll("[data-social]").forEach(b=>b.onclick=()=>socialConnectionAction(b.dataset.social,rows.find(v=>v.platform===b.dataset.social)));
  }
  async function socialConnectionAction(platform,current){
    const S=sb(); const {data:{session}}=await S.auth.getSession();
    if(current?.status==="CONNECTED"){
      if(!confirm("¿Desconectar "+platform+"?"))return;
      const r=await S.from("marc_social_connections").update({status:"DISCONNECTED",token_ref:null,external_account_id:null,account_name:null,last_error:null}).eq("id",current.id).eq("user_id",session.user.id);
      if(r.error)return alert(r.error.message);
      return socialConnectionsPanel();
    }
    if(platform==="FACEBOOK"||platform==="INSTAGRAM"){
      const p=await getPublicationPlan();
      if(!p.canPublish)return publicationUpgradeMessage();
      window.location.href="/api/social/meta/connect";
      return;
    }
    alert("La conexión OAuth de "+platform+" se incorporará con el mismo sistema seguro. Por ahora M.A.R.C. ya tiene preparado el registro de la cuenta sin guardar tokens directamente en la base de datos.");
  }

  function install(){
    const content=document.querySelector("#content");
    if(!content)return;
    const obs=new MutationObserver(()=>{
      if(document.querySelector("#importPdf")&&!document.querySelector("#supplierCenterBtn")){
        const b=document.createElement("button");
        b.id="supplierCenterBtn";b.className="secondary";b.textContent="🏭 Proveedores y catálogos";
        b.onclick=supplierCenter;
        const anchor=document.querySelector("#importPdf");anchor.parentElement.insertBefore(b,anchor);
      }
    });
    obs.observe(content,{childList:true,subtree:true});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
  window.marcSupplierCenter=supplierCenter;
})();
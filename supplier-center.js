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
  const toast=t=>window.toast?window.toast(t):null;

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
      S.from("marc_supplier_catalog_items").select("id,name,sku,supplier_price,status,catalog_id,inventory_id,image_url,brand,model").order("created_at",{ascending:false})
    ]);
    if(s.error||c.error||i.error){console.error(s.error||c.error||i.error);return}
    document.querySelector("#scSuppliers").textContent=(s.data||[]).length;
    document.querySelector("#scCatalogs").textContent=(c.data||[]).length;
    document.querySelector("#scItems").textContent=(i.data||[]).length;
    const suppliers=s.data||[], catalogs=c.data||[], items=i.data||[];
    document.querySelector("#scSupplierList").innerHTML=suppliers.map(x=>{
      const count=catalogs.filter(v=>v.supplier_id===x.id).length;
      return '<article class="client-card"><div class="client-card-top"><div class="client-avatar">'+esc((x.name||"P").slice(0,2).toUpperCase())+'</div><div class="client-card-name"><h3>'+esc(x.name)+'</h3><small>'+esc(x.contact_name||x.phone||x.email||"Sin contacto")+'</small></div></div><div class="client-details"><div><span>Catálogos</span><b>'+count+'</b></div><div><span>Web</span><b>'+esc(x.website||"—")+'</b></div></div><div class="client-card-actions"><button class="secondary" data-supplier="'+x.id+'">Ver catálogos</button></div></article>'
    }).join("")||'<div class="empty-state"><span>＋</span><b>Aún no hay proveedores</b><small>Registra tu primer proveedor.</small></div>';
    document.querySelector("#scCatalogList").innerHTML=catalogs.map(x=>{
      const supplier=suppliers.find(v=>v.id===x.supplier_id);
      const its=items.filter(v=>v.catalog_id===x.id);
      const ready=its.filter(v=>v.status==="APPROVED"||v.status==="IMPORTED").length;
      return '<article class="client-card"><div class="client-card-top"><div class="client-avatar">PDF</div><div class="client-card-name"><h3>'+esc(x.name)+'</h3><small>'+esc(supplier?.name||"Proveedor no asignado")+'</small></div><span class="badge '+(x.status==="READY"?"ok":"low")+'">'+esc(x.status)+'</span></div><div class="client-details"><div><span>Productos</span><b>'+its.length+'</b></div><div><span>Listos</span><b>'+ready+'</b></div><div><span>Origen</span><b>'+esc(x.source_type)+'</b></div></div><div class="client-card-actions"><button class="primary" data-catalog="'+x.id+'">Ver productos</button></div></article>'
    }).join("")||'<div class="empty-state"><span>📄</span><b>Aún no hay catálogos</b><small>Registra un catálogo para empezar.</small></div>';

    document.querySelectorAll("[data-supplier]").forEach(b=>b.onclick=()=>filterCatalogs(b.dataset.supplier));
    document.querySelectorAll("[data-catalog]").forEach(b=>b.onclick=()=>catalogProducts(b.dataset.catalog));
  }

  async function newSupplier(){
    const name=prompt("Nombre del proveedor"); if(!name?.trim())return;
    const contact=prompt("Persona de contacto","")||null;
    const phone=prompt("Teléfono","")||null;
    const email=prompt("Correo","")||null;
    const S=sb(); const {data:{session}}=await S.auth.getSession();
    const r=await S.from("marc_suppliers").insert({user_id:session.user.id,name:name.trim(),contact_name:contact,phone,email}).select().single();
    if(r.error)return alert(r.error.message);
    await loadCenter();
  }

  async function newCatalog(){
    const S=sb(); const {data:{session}}=await S.auth.getSession();
    const {data:suppliers}=await S.from("marc_suppliers").select("id,name").eq("user_id",session.user.id).eq("active",true).order("name");
    const names=(suppliers||[]).map((x,i)=>(i+1)+". "+x.name).join("\n");
    const pick=prompt("Selecciona proveedor por número:\n"+names+"\n\n0 = sin proveedor");
    const n=Number(pick||0); const supplier=(suppliers||[])[n-1];
    const name=prompt("Nombre del catálogo","Catálogo de proveedor"); if(!name?.trim())return;
    const file=await chooseFile();
    if(!file)return;
    const path=session.user.id+"/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const up=await S.storage.from("catalog-pdfs").upload(path,file,{upsert:false,contentType:file.type||"application/octet-stream"});
    if(up.error)return alert("No se pudo guardar el catálogo: "+up.error.message);
    const ins=await S.from("marc_supplier_catalogs").insert({user_id:session.user.id,supplier_id:supplier?.id||null,name:name.trim(),source_type:file.type==="application/pdf"?"PDF":file.name.match(/\.xlsx?$/i)?"EXCEL":"OTHER",storage_path:path,file_name:file.name,file_size_bytes:file.size,status:"UPLOADED"}).select().single();
    if(ins.error)return alert(ins.error.message);
    alert("Catálogo guardado. El siguiente paso es analizarlo y detectar sus productos.");
    await loadCenter();
  }

  function chooseFile(){
    return new Promise(resolve=>{
      const i=document.createElement("input");i.type="file";i.accept=".pdf,.xlsx,.xls,image/*";i.onchange=()=>resolve(i.files?.[0]||null);i.click();
    });
  }

  async function filterCatalogs(supplierId){
    const S=sb(); const {data}=await S.from("marc_supplier_catalogs").select("*").eq("supplier_id",supplierId).order("created_at",{ascending:false});
    const names=(data||[]).map(x=>x.name).join("\n");
    alert(names||"Este proveedor todavía no tiene catálogos.");
  }

  async function catalogProducts(catalogId){
    const S=sb(); const {data,error}=await S.from("marc_supplier_catalog_items").select("*").eq("catalog_id",catalogId).order("created_at",{ascending:true});
    if(error)return alert(error.message);
    const title=data?.length?data.map((x,i)=>(i+1)+". "+x.name+" | "+money(x.supplier_price)+" | "+x.status).join("\n"):"No hay productos detectados todavía.";
    const pick=prompt("Productos del catálogo:\n"+title+"\n\nEscribe el número para abrirlo en Publicidad, o Cancelar.");
    const n=Number(pick||0); const item=(data||[])[n-1];
    if(item)await createPublicationDraft(item);
  }

  async function createPublicationDraft(item){
    const S=sb(); const {data:{session}}=await S.auth.getSession();
    const body="Producto: "+item.name+"\n"+[item.brand,item.model,item.sku].filter(Boolean).join(" · ")+"\nPrecio proveedor: "+money(item.supplier_price);
    const r=await S.from("marc_publications").insert({user_id:session.user.id,platform:"WHATSAPP",status:"DRAFT",title:item.name,headline:item.name,body,short_text:"Consulta disponibilidad y precio.",hashtags:[],media_url:item.image_url||null,media_type:"IMAGE"}).select().single();
    if(r.error)return alert(r.error.message);
    alert("Borrador de publicación creado. Ahora puedes completarlo desde Publicidad.");
    if(window.view)window.view("marketing");
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
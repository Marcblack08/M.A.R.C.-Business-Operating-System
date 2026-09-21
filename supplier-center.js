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
    await analyzeCatalog(ins.data, file);
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

  function scModal(title,body,actions=""){
    let root=document.querySelector("#modal")||document.body;
    root.innerHTML='<div id="scModalOverlay" style="position:fixed;inset:0;background:rgba(2,8,23,.72);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px"><div style="width:min(980px,100%);max-height:92vh;overflow:auto;background:var(--card,#fff);color:inherit;border:1px solid rgba(127,127,127,.18);border-radius:22px;box-shadow:0 25px 80px rgba(0,0,0,.35);padding:22px"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px"><div><div class="eyebrow2">M.A.R.C. · CENTRO DE ABASTECIMIENTO</div><h2 style="margin:4px 0 0">'+esc(title)+'</h2></div><button id="scModalClose" class="icon" type="button">×</button></div><div id="scModalBody">'+body+'</div><div id="scModalActions" style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">'+actions+'</div></div></div>';
    document.querySelector("#scModalClose").onclick=()=>root.innerHTML="";
    document.querySelector("#scModalOverlay").onclick=e=>{if(e.target.id==="scModalOverlay")root.innerHTML=""};
    return document.querySelector("#scModalBody");
  }

  async function catalogProducts(catalogId){
    const S=sb(); const {data,error}=await S.from("marc_supplier_catalog_items").select("*").eq("catalog_id",catalogId).order("created_at",{ascending:true});
    if(error)return alert(error.message);
    const items=data||[];
    if(!items.length){alert("Este catálogo todavía no tiene productos detectados.");return;}
    const rows=items.map((x,i)=>'<tr><td><input type="checkbox" class="scItemCheck" value="'+x.id+'"></td><td><b>'+esc(x.name)+'</b><br><small>'+esc([x.brand,x.model,x.sku].filter(Boolean).join(" · "))+'</small></td><td>'+money(x.supplier_price||x.supplier_cost)+'</td><td><span class="badge '+(x.status==="IMPORTED"?"ok":"low")+'">'+esc(x.status)+'</span></td><td><button class="secondary scPublishOne" data-id="'+x.id+'">Publicidad</button></td></tr>').join("");
    scModal("Productos detectados",'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px"><button id="scSelectAll" class="secondary">Seleccionar todo</button><button id="scImportSelected" class="primary">Importar seleccionados</button><button id="scPublishSelected" class="secondary">Crear publicaciones</button></div><div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th></th><th>Producto</th><th>Precio</th><th>Estado</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>','<button id="scDone" class="primary">Listo</button>');
    document.querySelector("#scDone").onclick=()=>document.querySelector("#modal").innerHTML="";
    document.querySelector("#scSelectAll").onclick=()=>document.querySelectorAll(".scItemCheck").forEach(x=>x.checked=true);
    const selected=()=>[...document.querySelectorAll(".scItemCheck:checked")].map(x=>items.find(i=>i.id===x.value)).filter(Boolean);
    document.querySelector("#scImportSelected").onclick=async()=>{for(const item of selected())await importCatalogItem(item);document.querySelector("#modal").innerHTML="";await loadCenter()};
    document.querySelector("#scPublishSelected").onclick=async()=>{for(const item of selected())await createPublicationDraft(item);document.querySelector("#modal").innerHTML="";await loadCenter()};
    document.querySelectorAll(".scPublishOne").forEach(b=>b.onclick=async()=>{const item=items.find(i=>i.id===b.dataset.id);if(item)await createPublicationDraft(item)});
  }

  async function analyzeCatalog(catalog,file){
    const S=sb();
    await S.from("marc_supplier_catalogs").update({status:"ANALYZING",ai_provider:file.name.match(/\.xlsx?$/i)?"XLSX-PARSER":"PDF-JS"}).eq("id",catalog.id);
    try{
      let items=[];
      if(/\.xlsx?$/i.test(file.name)) items=await parseExcelCatalog(file);
      else if(file.type==="application/pdf"||/\.pdf$/i.test(file.name)) items=await parsePdfCatalog(file);
      else throw new Error("El análisis automático funciona con Excel y PDF.");
      if(!items.length)throw new Error("No se detectaron productos.");
      const {data:{session}}=await S.auth.getSession();
      const payload=items.map(x=>({...x,user_id:session.user.id,catalog_id:catalog.id,supplier_id:catalog.supplier_id,status:"REVIEW"}));
      const ins=await S.from("marc_supplier_catalog_items").insert(payload);
      if(ins.error)throw ins.error;
      await S.from("marc_supplier_catalogs").update({status:"READY",imported_at:new Date().toISOString()}).eq("id",catalog.id);
      alert("Análisis terminado: "+items.length+" productos detectados.");
    }catch(e){
      console.error(e); await S.from("marc_supplier_catalogs").update({status:"ERROR"}).eq("id",catalog.id);
      alert("No se pudo analizar el catálogo: "+(e.message||e));
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
  async function parsePdfCatalog(file){
    if(!window.pdfjsLib)throw new Error("No está disponible el lector PDF.");
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise,out=[];
    for(let p=1;p<=pdf.numPages;p++){const tc=await (await pdf.getPage(p)).getTextContent(),line=tc.items.map(x=>x.str).join(" ");const parts=line.split(/\s{2,}|\|/);parts.forEach(x=>{const prices=x.match(/(?:S\.?\s*)?\d+(?:[.,]\d{1,2})?/g);if(!prices)return;const price=num(prices[prices.length-1]),name=x.replace(/(?:S\.?\s*)?\d+(?:[.,]\d{1,2})?/g," ").replace(/\s+/g," ").trim();if(name.length>=3)out.push({sku:null,name:name.slice(0,180),description:x,brand:null,model:null,category:null,unit:"UND",supplier_cost:null,supplier_price:price,currency:"PEN",stock_text:null,ai_confidence:0.55,source_metadata:{page:p}});});}
    return out.slice(0,2000);
  }
  async function importCatalogItem(item){
    const S=sb(); const {data:{session}}=await S.auth.getSession(); let existing=null;
    if(item.sku){const r=await S.from("marc_inventory").select("*").eq("user_id",session.user.id).eq("sku",item.sku).maybeSingle();existing=r.data;}
    const payload={sku:item.sku||null,name:item.name,brand:item.brand||null,model:item.model||null,category:item.category||null,unit:item.unit||"UND",cost:Number(item.supplier_cost||item.supplier_price||0),price:Number(item.supplier_price||item.supplier_cost||0),stock:0,min_stock:0,image_url:item.image_url||null,active:true};
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
    alert("La conexión OAuth de "+platform+" todavía debe configurarse con las credenciales oficiales de esa plataforma. M.A.R.C. ya tiene el registro y el estado de conexión preparados, sin guardar tokens directamente en la base de datos.");
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
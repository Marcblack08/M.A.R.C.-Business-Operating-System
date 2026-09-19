(()=>{const C=window.MARC_CONFIG,S=window.supabase.createClient(C.supabaseUrl,C.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});const st={u:null,session:null,view:"home",cid:null,entering:false};const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)],esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])),money=v=>new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(Number(v||0)),toast=(t,c="")=>{const e=document.createElement("div");e.className="toast "+c;e.textContent=t;$("#toast").appendChild(e);setTimeout(()=>e.remove(),2600)},initials=n=>String(n||"M").split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join("");let authMode="login";
function msg(t,c=""){const e=$("#authMsg");e.textContent=t;e.className="msg "+c}
function mode(m){authMode=m;$("#authForm").reset();$("#confirmBox").classList.toggle("hidden",m!=="signup");$("#confirm").required=m==="signup";$("#forgot").classList.toggle("hidden",m!=="login");$("#switchAuth").textContent=m==="signup"?"Ya tengo una cuenta":m==="reset"?"Volver al inicio de sesión":"Crear una cuenta";$("#authTitle").textContent=m==="signup"?"Crea tu cuenta":m==="reset"?"Recupera tu contraseña":"Inicia sesión en M.A.R.C.";$("#authSub").textContent=m==="signup"?"Empieza tu prueba gratuita de 7 días.":m==="reset"?"Te enviaremos un enlace seguro.":"Convierte conversaciones en operaciones reales de tu negocio.";$("#authSubmit").textContent=m==="signup"?"Crear cuenta":m==="reset"?"Enviar enlace":"Iniciar sesión";$("#password").disabled=m==="reset";$("#password").required=m!=="reset";msg("")}
async function ensure(){const u=st.u;if(!u)return;await S.from("marc_accounts").upsert({id:u.id,display_name:u.email?.split("@")[0]||"Usuario"},{onConflict:"id"});const {data:t}=await S.from("marc_trials").select("id").eq("user_id",u.id).maybeSingle();if(!t)await S.from("marc_trials").insert({user_id:u.id});const {data:c}=await S.from("marc_conversations").select("id").eq("user_id",u.id).eq("channel","WEB").order("updated_at",{ascending:false}).limit(1).maybeSingle();st.cid=c?.id||(await S.from("marc_conversations").insert({user_id:u.id,channel:"WEB",title:"Conversación principal"}).select("id").single()).data?.id}
async function enter(s){st.session=s;if(st.entering||(st.u?.id===s.user?.id&&!$("#auth").classList.contains("hidden")))return;st.entering=true;try{st.u=s.user;$("#auth").classList.add("hidden");$("#app").classList.remove("hidden");const n=st.u.email?.split("@")[0]||"Usuario";$("#name").textContent=n;$("#mail").textContent=st.u.email;$("#avatar").textContent=initials(n);await ensure();await trial();await chatLoad();await view("home")}finally{st.entering=false}}
async function submit(e){e.preventDefault();try{$("#authSubmit").disabled=true;msg("Procesando…");const email=$("#email").value.trim(),p=$("#password").value;if(authMode==="reset"){const {error}=await S.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error;msg("Revisa tu correo.","ok");return}if(authMode==="signup"){if(p!==$("#confirm").value)throw new Error("Las contraseñas no coinciden.");const {data,error}=await S.auth.signUp({email,password:p});if(error)throw error;if(!data.session){msg("Cuenta creada. Revisa tu correo.","ok");return}await enter(data.session)}else{const {data,error}=await S.auth.signInWithPassword({email,password:p});if(error)throw error;await enter(data.session)}}catch(e){msg(e.message||"No se pudo completar.","error")}finally{$("#authSubmit").disabled=false}}
async function trial(){const {data:t}=await S.from("marc_trials").select("started_at,ends_at").eq("user_id",st.u.id).maybeSingle();const end=new Date(t?.ends_at||Date.now()).getTime(),start=new Date(t?.started_at||Date.now()).getTime(),now=Date.now(),left=Math.max(0,end-now),days=Math.ceil(left/864e5);$("#trialDays").textContent=days+" días";$("#trialBar").style.width=Math.max(3,100-(left/Math.max(1,end-start)*100))+"%";const [c,i,q]=await Promise.all([S.from("marc_clients").select("id",{count:"exact",head:true}).eq("user_id",st.u.id),S.from("marc_inventory").select("id",{count:"exact",head:true}).eq("user_id",st.u.id),S.from("marc_quotes").select("id",{count:"exact",head:true}).eq("user_id",st.u.id)]);$("#usage").textContent=(c.count||0)+"/25 clientes · "+(i.count||0)+"/50 productos · "+(q.count||0)+"/5 cotizaciones"}
async function chatLoad(){const box=$("#messages");box.innerHTML="";const {data}=await S.from("marc_messages").select("role,content").eq("conversation_id",st.cid).order("created_at",{ascending:true}).limit(60);if(!data?.length)addBubble("a","Hola. Soy M.A.R.C. Dime qué quieres hacer.");else data.forEach(x=>addBubble(x.role==="USER"?"u":"a",x.content))}
function addBubble(type,text){const e=document.createElement("div");e.className="bubble "+type;e.textContent=text;$("#messages").appendChild(e);$("#messages").scrollTop=$("#messages").scrollHeight}
async function chatSend(text){if(!text.trim())return;addBubble("u",text);await S.from("marc_messages").insert({conversation_id:st.cid,user_id:st.u.id,role:"USER",content:text});const loading=document.createElement("div");loading.className="bubble a";loading.textContent="Pensando…";$("#messages").appendChild(loading);try{const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+st.session?.access_token},body:JSON.stringify({message:text,conversationId:st.cid})}),j=await r.json();const reply=r.ok?(j.text||"No pude responder."):j.message||j.error||"El núcleo de IA no está disponible.";loading.textContent=reply;await S.from("marc_messages").insert({conversation_id:st.cid,user_id:st.u.id,role:"ASSISTANT",content:reply,action_type:"CHAT"})}catch(e){loading.textContent="No pude conectar con el núcleo de IA. La plataforma sigue disponible."}}
function openChat(){$("#chat").classList.add("open")}function closeChat(){$("#chat").classList.remove("open")}
function title(x){$("#page").textContent={home:"Inicio",clients:"Clientes",inventory:"Inventario",quotes:"Cotizaciones",communications:"Comunicaciones",settings:"Configuración"}[x]||"Inicio";$$(".sidebar nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===x))}
async function view(x){st.view=x;title(x);$("#sidebar").classList.remove("open");if(x==="home")return home();if(x==="clients")return clients();if(x==="inventory")return inventory();if(x==="quotes")return quotes();if(x==="communications")return communications();return settings()}
async function home(){const c=$("#content"),[cl,iv,qt]=await Promise.all([S.from("marc_clients").select("*",{count:"exact"}).eq("user_id",st.u.id),S.from("marc_inventory").select("*").eq("user_id",st.u.id).eq("active",true).order("name"),S.from("marc_quotes").select("*").eq("user_id",st.u.id).order("created_at",{ascending:false}).limit(6)]);const low=(iv.data||[]).filter(x=>Number(x.stock)<=Number(x.min_stock));c.innerHTML=`<div class="head"><div><div class="eyebrow2">CENTRO DE OPERACIONES</div><h1>Tu negocio, desde una sola conversación.</h1><p>M.A.R.C. conecta clientes, inventario, cotizaciones y comunicaciones.</p></div><button id="askHome" class="primary">✦ Preguntar</button></div><div class="grid4"><div class="card kpi"><small>Clientes</small><strong>${cl.count||0}</strong><em>Base operativa</em></div><div class="card kpi"><small>Productos</small><strong>${iv.data?.length||0}</strong><em>En inventario</em></div><div class="card kpi"><small>Stock bajo</small><strong>${low.length}</strong><em>Requieren atención</em></div><div class="card kpi"><small>Cotizaciones</small><strong>${qt.data?.length||0}</strong><em>Recientes</em></div></div><div class="cols"><section class="card panel"><h3>Acciones rápidas</h3><p>Las operaciones frecuentes están a un toque.</p><div class="quick"><button data-q="client"><b>＋ Nuevo cliente</b><small>Guardar un contacto</small></button><button data-q="inventory"><b>＋ Producto</b><small>Agregar al inventario</small></button><button data-q="quote"><b>＋ Cotización</b><small>Preparar una propuesta</small></button><button data-q="chat"><b>✦ Preguntar</b><small>Hablar con M.A.R.C.</small></button></div></section><section class="card panel"><h3>Inventario crítico</h3><p>Productos que merecen atención.</p><div class="list">${low.slice(0,5).map(x=>`<div class="row"><div><b>${esc(x.name)}</b><small>${esc([x.brand,x.model].filter(Boolean).join(" · "))}</small></div><span class="badge ${Number(x.stock)<=0?"out":"low"}">${Number(x.stock)<=0?"Agotado":x.stock}</span></div>`).join("")||'<div class="empty">Todo en orden.</div>'}</div></section></div><section class="card panel" style="margin-top:13px"><h3>Actividad reciente</h3><div class="list">${(qt.data||[]).map(x=>`<div class="row"><div><b>${esc(x.number)} · ${esc(x.title)}</b><small>${esc(x.status)}</small></div><b>${money(x.total)}</b></div>`).join("")||'<div class="empty">Crea tu primera cotización.</div>'}</div></section>`;$("#askHome").onclick=openChat;$$(".quick button",c).forEach(b=>b.onclick=()=>b.dataset.q==="client"?clientModal():b.dataset.q==="inventory"?inventoryModal():b.dataset.q==="quote"?quoteModal():openChat())}
async function clients(){const {data}=await S.from("marc_clients").select("*").eq("user_id",st.u.id).order("name");const c=$("#content");c.innerHTML=`<div class="head"><div><div class="eyebrow2">CLIENTES</div><h1>Relaciones y contexto.</h1><p>Los clientes son memoria operativa de M.A.R.C.</p></div><button id="new" class="primary">＋ Nuevo cliente</button></div><section class="card table"><div class="toolbar"><div class="search"><input id="search" placeholder="Buscar…"></div><button id="ask" class="secondary">Preguntar</button></div><div class="scroll"><table class="data"><thead><tr><th>Cliente</th><th>Contacto</th><th>Correo</th><th>Teléfono</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></section>`;const rows=$("#rows"),draw=list=>rows.innerHTML=list.map(x=>`<tr><td><b>${esc(x.name)}</b><br><small>${esc(x.document_number||"")}</small></td><td>${esc(x.contact_name||"—")}</td><td>${esc(x.email||"—")}</td><td>${esc(x.phone||"—")}</td><td><button class="secondary" data-id="${x.id}">Editar</button></td></tr>`).join("")||'<tr><td colspan="5" class="empty">Aún no tienes clientes.</td></tr>';draw(data||[]);$("#search").oninput=e=>{const q=e.target.value.toLowerCase();draw((data||[]).filter(x=>[x.name,x.email,x.phone,x.document_number].some(v=>String(v||"").toLowerCase().includes(q))))};$("#new").onclick=()=>clientModal();$("#ask").onclick=()=>openChat();$$("[data-id]",c).forEach(b=>b.onclick=()=>clientModal((data||[]).find(x=>x.id===b.dataset.id)))}
async function inventory(){const {data}=await S.from("marc_inventory").select("*").eq("user_id",st.u.id).eq("active",true).order("name");const c=$("#content");c.innerHTML=`<div class="head"><div><div class="eyebrow2">INVENTARIO</div><h1>Productos + stock.</h1><p>Todo producto vive dentro del inventario.</p></div><button id="new" class="primary">＋ Nuevo producto</button></div><section class="card table"><div class="toolbar"><div class="search"><input id="search" placeholder="Buscar producto…"></div><button id="ask" class="secondary">Preguntar</button></div><div class="scroll"><table class="data"><thead><tr><th>Producto</th><th>Marca/modelo</th><th>Stock</th><th>Precio</th><th>Estado</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></section>`;const rows=$("#rows"),draw=list=>rows.innerHTML=list.map(x=>{const s=Number(x.stock),m=Number(x.min_stock),cls=s<=0?"out":s<=m?"low":"ok";return`<tr><td><b>${esc(x.name)}</b><br><small>${esc(x.sku||"Sin código")}</small></td><td>${esc([x.brand,x.model].filter(Boolean).join(" · ")||"—")}</td><td><b>${s}</b> ${esc(x.unit)}</td><td>${money(x.price)}</td><td><span class="badge ${cls}">${s<=0?"Agotado":s<=m?"Bajo":"Disponible"}</span></td><td><button class="secondary" data-id="${x.id}">Editar</button></td></tr>`}).join("")||'<tr><td colspan="6" class="empty">Agrega tu primer producto.</td></tr>';draw(data||[]);$("#search").oninput=e=>{const q=e.target.value.toLowerCase();draw((data||[]).filter(x=>[x.name,x.sku,x.brand,x.model,x.category].some(v=>String(v||"").toLowerCase().includes(q))))};$("#new").onclick=()=>inventoryModal();$("#ask").onclick=openChat;$$("[data-id]",c).forEach(b=>b.onclick=()=>inventoryModal((data||[]).find(x=>x.id===b.dataset.id)))}
async function quotes(){const {data,error}=await S.from("marc_quotes").select("*,marc_clients(name)").eq("user_id",st.u.id).order("created_at",{ascending:false});if(error)return toast(error.message,"err");const rows=data||[];const c=$("#content");c.innerHTML=`<div class="head"><div><div class="eyebrow2">COTIZACIONES</div><h1>Convierte una orden en propuesta.</h1><p>Productos del inventario y trabajos escritos o dictados.</p></div><button id="new" class="primary">＋ Nueva cotización</button></div><section class="card table"><div class="toolbar"><div class="search"><input id="search" placeholder="Buscar número, cliente o título…"></div><select id="statusFilter" class="secondary" style="min-width:130px"><option value="">Todos</option><option>BORRADOR</option><option>ENVIADA</option><option>ACEPTADA</option><option>RECHAZADA</option><option>ANULADA</option><option>COBRADA</option></select><button id="ask" class="secondary">Preguntar</button></div><div class="scroll"><table class="data"><thead><tr><th>Número</th><th>Cliente</th><th>Título</th><th>Estado</th><th>Total</th><th>Fecha</th><th></th></tr></thead><tbody id="qrows"></tbody></table></div></section>`;const body=$("#qrows");const draw=()=>{const q=($("#search").value||"").toLowerCase(),sf=$("#statusFilter").value;const list=rows.filter(x=>(!sf||x.status===sf)&&[x.number,x.title,x.marc_clients?.name].some(v=>String(v||"").toLowerCase().includes(q)));body.innerHTML=list.map(x=>`<tr><td><b>${esc(x.number)}</b></td><td>${esc(x.marc_clients?.name||"Sin cliente")}</td><td>${esc(x.title)}</td><td><span class="badge">${esc(x.status)}</span></td><td><b>${money(x.total)}</b></td><td>${new Date(x.created_at).toLocaleDateString("es-PE")}</td><td><button class="secondary" data-open="${x.id}">Abrir</button></td></tr>`).join("")||'<tr><td colspan="7" class="empty">No hay cotizaciones que coincidan.</td></tr>';$("[data-open]",c).forEach(b=>b.onclick=()=>quoteModal(rows.find(x=>x.id===b.dataset.open)))};$("#new").onclick=()=>quoteModal();$("#ask").onclick=openChat;$("#search").oninput=draw;$("#statusFilter").onchange=draw;draw()}
async function communications(){const c=$("#content");c.innerHTML=`<div class="head"><div><div class="eyebrow2">COMUNICACIONES</div><h1>M.A.R.C. como centro de enlace.</h1><p>Las conexiones con Sakit, Q, Sumasa y Clover se activarán cuando sus contratos estén definidos.</p></div><button id="goChat" class="primary">✦ Preguntar</button></div><div class="commgrid">${["SAKIT","Q","SUMASA","CLOVER"].map(x=>`<section class="card comm"><h3>${x}</h3><p>Canal reservado. Falta definir autenticación, eventos, permisos y formato de mensajes.</p><span class="badge">Pendiente</span><div style="margin-top:10px"><button class="secondary" data-sys="${x}">Preparar conexión</button></div></section>`).join("")}</div><section class="card panel" style="margin-top:13px"><h3>Canales</h3><p>El mismo núcleo operará por web y Telegram.</p><div class="list"><div class="row"><div><b>Web</b><small>Chat dentro de M.A.R.C.</small></div><span class="badge ok">Activo</span></div><div class="row"><div><b>Telegram</b><small>Bot con la misma cuenta y suscripción.</small></div><span class="badge">Próximo</span></div></div></section>`;$("#goChat").onclick=openChat;$$("[data-sys]",c).forEach(b=>b.onclick=()=>{openChat();$("#chatInput").value="Quiero conectar "+b.dataset.sys;$("#chatInput").focus()})}
async function telegramStatus(){
  try{
    const r=await fetch("/api/telegram/status",{headers:{Authorization:"Bearer "+st.session?.access_token}});
    const j=await r.json();
    if(!r.ok)throw new Error(j.message||j.error||"No se pudo consultar Telegram.");
    return j;
  }catch(e){
    return {error:e.message||"No se pudo consultar Telegram."};
  }
}
async function connectTelegram(){
  const b=$("#connectTelegram");
  if(b)b.disabled=true;
  try{
    const r=await fetch("/api/telegram/link",{method:"POST",headers:{Authorization:"Bearer "+st.session?.access_token,"Content-Type":"application/json"}});
    const j=await r.json();
    if(!r.ok)throw new Error(j.message||j.error||"No se pudo generar el enlace.");
    if(j.deepLink){
      window.location.href=j.deepLink;
      toast("Abriendo Telegram…","ok");
    }
  }catch(e){toast(e.message||"No se pudo conectar Telegram.","err")}
  finally{if(b)b.disabled=false}
}
async function refreshTelegramSettings(){
  const box=$("#telegramState"),connect=$("#connectTelegram"),unlink=$("#unlinkTelegram");
  if(!box)return;
  const s=await telegramStatus();
  if(s.error){
    box.innerHTML='<span class="badge">No disponible</span><small>'+esc(s.error)+'</small>';
    return;
  }
  if(s.linked){
    box.innerHTML='<span class="badge ok">Conectado</span><small>Telegram comparte tu cuenta, datos, suscripción y límites de M.A.R.C.</small>';
    if(connect)connect.classList.add("hidden");
    if(unlink)unlink.classList.remove("hidden");
  }else{
    box.innerHTML='<span class="badge">No conectado</span><small>Conéctalo una sola vez. No tendrás que pagar otra suscripción.</small>';
    if(connect)connect.classList.remove("hidden");
    if(unlink)unlink.classList.add("hidden");
  }
}
async function unlinkTelegram(){
  if(!confirm("¿Desconectar Telegram de esta cuenta?"))return;
  try{
    const r=await fetch("/api/telegram/unlink",{method:"POST",headers:{Authorization:"Bearer "+st.session?.access_token}});
    const j=await r.json();
    if(!r.ok)throw new Error(j.message||j.error||"No se pudo desconectar Telegram.");
    toast("Telegram desconectado","ok");
    await refreshTelegramSettings();
  }catch(e){toast(e.message||"No se pudo desconectar.","err")}
}
async function settings(){
  const {data:a}=await S.from("marc_accounts").select("*").eq("id",st.u.id).single();
  const {data:sub}=await S.from("marc_subscriptions").select("plan,status,current_period_end,provider").eq("user_id",st.u.id).eq("status","active").order("current_period_end",{ascending:false}).limit(1).maybeSingle();
  $("#content").innerHTML=`<div class="head"><div><div class="eyebrow2">CONFIGURACIÓN</div><h1>Cuenta y conexiones.</h1><p>La suscripción pertenece a tu cuenta M.A.R.C.; los canales solo la utilizan.</p></div></div>
  <div class="settings">
    <section class="card panel">
      <div class="eyebrow2">SUSCRIPCIÓN</div>
      <h3 style="font-size:17px;margin:0">${sub?"M.A.R.C. "+esc(sub.plan):"Prueba gratuita"}</h3>
      <p>${sub?"Suscripción activa · "+esc(sub.provider||"Proveedor"): "Web + chat + clientes + inventario + cotizaciones."}</p>
      <div class="quick">
        <div class="card panel"><b style="font-size:9px">${sub?"ACTIVA":"7 DÍAS"}</b><small>${sub?"Mismo acceso en Web y Telegram":"Prueba"}</small></div>
        <div class="card panel"><b style="font-size:9px">Telegram</b><small id="telegramMini">${sub?"Disponible al conectar":"Disponible al conectar"}</small></div>
      </div>
      <button class="primary" id="plans">Ver planes</button>
    </section>
    <section class="card panel">
      <div class="eyebrow2">TELEGRAM</div>
      <h3 style="margin:0">Una cuenta, dos canales.</h3>
      <p>Compra en la web una sola vez. Después de vincular Telegram, M.A.R.C. reconoce la misma suscripción, clientes, inventario, cotizaciones y límites de IA.</p>
      <div id="telegramState" class="list" style="margin:12px 0"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="primary" id="connectTelegram">Conectar Telegram</button>
        <button class="secondary hidden" id="unlinkTelegram">Desconectar</button>
        <button class="secondary" id="refreshTelegram">Actualizar estado</button>
      </div>
    </section>
    <section class="card panel">
      <div class="eyebrow2">CUENTA</div>
      <h3 style="margin:0">${esc(a?.display_name||"Usuario")}</h3>
      <p>${esc(st.u.email||"")}</p>
      <button id="out2" class="secondary">Cerrar sesión</button>
    </section>
  </div>`;
  $("#out2").onclick=()=>S.auth.signOut();
  $("#plans").onclick=()=>toast("El checkout se conecta después de validar precios y proveedor de pago.","");
  $("#connectTelegram").onclick=connectTelegram;
  $("#unlinkTelegram").onclick=unlinkTelegram;
  $("#refreshTelegram").onclick=refreshTelegramSettings;
  await refreshTelegramSettings();
}
function modal(html){$("#modal").innerHTML='<div class="modal">'+html+"</div>";const close=()=>$("#modal").innerHTML="";return close}
function clientModal(x=null){const close=modal(`<div class="modal-head"><div><h2>${x?"Editar":"Nuevo"} cliente</h2><p>Disponible para el contexto de M.A.R.C.</p></div><button class="close" id="x">×</button></div><form id="f"><div class="form-grid"><label>Nombre / razón social<input name="name" required value="${esc(x?.name)}"></label><label>Documento<input name="document_number" value="${esc(x?.document_number)}"></label><label>Contacto<input name="contact_name" value="${esc(x?.contact_name)}"></label><label>Teléfono<input name="phone" value="${esc(x?.phone)}"></label><label>Correo<input name="email" type="email" value="${esc(x?.email)}"></label><label>Dirección<input name="address" value="${esc(x?.address)}"></label><label style="grid-column:1/-1">Notas<textarea name="notes" rows="3">${esc(x?.notes)}</textarea></label></div><div class="modal-actions"><button type="button" class="secondary" id="cancel">Cancelar</button><button class="primary">Guardar</button></div></form>`);$("#x").onclick=close;$("#cancel").onclick=close;$("#f").onsubmit=async e=>{e.preventDefault();const d=new FormData(e.currentTarget),p={user_id:st.u.id,name:d.get("name").trim(),document_type:"OTRO",document_number:d.get("document_number")||null,contact_name:d.get("contact_name")||null,phone:d.get("phone")||null,email:d.get("email")||null,address:d.get("address")||null,notes:d.get("notes")||null,updated_at:new Date().toISOString()};const r=x?await S.from("marc_clients").update(p).eq("id",x.id).eq("user_id",st.u.id):await S.from("marc_clients").insert(p);if(r.error)return toast(r.error.message,"err");close();toast("Cliente guardado","ok");await trial();clients()}}
function inventoryModal(x=null){const close=modal(`<div class="modal-head"><div><h2>${x?"Editar":"Nuevo"} producto</h2><p>Productos + inventario, juntos.</p></div><button class="close" id="x">×</button></div><form id="f"><div class="form-grid"><label>Nombre<input name="name" required value="${esc(x?.name)}"></label><label>Código / SKU<input name="sku" value="${esc(x?.sku)}"></label><label>Marca<input name="brand" value="${esc(x?.brand)}"></label><label>Modelo<input name="model" value="${esc(x?.model)}"></label><label>Categoría<input name="category" value="${esc(x?.category)}"></label><label>Unidad<input name="unit" value="${esc(x?.unit||"UND")}"></label><label>Costo<input name="cost" type="number" min="0" step="0.01" value="${x?.cost??0}"></label><label>Precio<input name="price" type="number" min="0" step="0.01" value="${x?.price??0}"></label><label>Stock<input name="stock" type="number" min="0" step="0.01" value="${x?.stock??0}"></label><label>Mínimo<input name="min_stock" type="number" min="0" step="0.01" value="${x?.min_stock??0}"></label></div><div class="modal-actions"><button type="button" class="secondary" id="cancel">Cancelar</button><button class="primary">Guardar</button></div></form>`);$("#x").onclick=close;$("#cancel").onclick=close;$("#f").onsubmit=async e=>{e.preventDefault();const d=new FormData(e.currentTarget),p={user_id:st.u.id,name:d.get("name").trim(),sku:d.get("sku")||null,brand:d.get("brand")||null,model:d.get("model")||null,category:d.get("category")||null,unit:d.get("unit")||"UND",cost:Number(d.get("cost")||0),price:Number(d.get("price")||0),stock:Number(d.get("stock")||0),min_stock:Number(d.get("min_stock")||0),updated_at:new Date().toISOString()};const r=x?await S.from("marc_inventory").update(p).eq("id",x.id).eq("user_id",st.u.id):await S.from("marc_inventory").insert(p);if(r.error)return toast(r.error.message,"err");close();toast("Producto guardado","ok");await trial();inventory()}}
async function quoteModal(existing=null){
  const cls=(await S.from("marc_clients").select("id,name").eq("user_id",st.u.id).order("name")).data||[];
  const inv=(await S.from("marc_inventory").select("id,name,brand,model,price,cost,unit,stock").eq("user_id",st.u.id).eq("active",true).order("name")).data||[];
  let lines=[];
  let quote=existing;
  if(existing){
    const {data}=await S.from("marc_quote_items").select("*").eq("quote_id",existing.id).eq("user_id",st.u.id).order("created_at");
    lines=(data||[]).map(x=>({id:x.id,type:x.item_type,inventory_id:x.inventory_id||"",name:x.name||"",description:x.description||"",qty:Number(x.quantity||1),price:Number(x.unit_price||0),cost:Number(x.cost||0),unit:x.unit||"UND"}));
  }
  const close=modal(
    '<div class="modal-head"><div><h2>'+(quote?"Cotización "+esc(quote.number):"Nueva cotización")+'</h2><p>Productos del inventario + trabajos libres.</p></div><button class="close" id="x">×</button></div>'+
    '<form id="f"><div class="form-grid">'+
    '<label>Cliente<select name="client_id"><option value="">Sin cliente</option>'+cls.map(x=>'<option value="'+x.id+'" '+(quote?.client_id===x.id?"selected":"")+'>'+esc(x.name)+'</option>').join("")+'</select></label>'+
    '<label>Título<input name="title" required value="'+esc(quote?.title||"Nueva cotización")+'"></label>'+
    '<label>IGV <select name="tax_enabled"><option value="false" '+(!quote?.tax_enabled?"selected":"")+'>No incluir</option><option value="true" '+(quote?.tax_enabled?"selected":"")+'>Incluir</option></select></label>'+
    '<label>% IGV<input name="tax_rate" type="number" min="0" max="100" step="0.01" value="'+(quote?.tax_rate??18)+'"></label>'+
    '<label>Estado<select name="status"><option value="BORRADOR" '+((quote?.status||"BORRADOR")==="BORRADOR"?"selected":"")+'>Borrador</option><option value="ENVIADA" '+((quote?.status||"BORRADOR")==="ENVIADA"?"selected":"")+'>Enviada</option><option value="ACEPTADA" '+((quote?.status||"BORRADOR")==="ACEPTADA"?"selected":"")+'>Aceptada</option><option value="RECHAZADA" '+((quote?.status||"BORRADOR")==="RECHAZADA"?"selected":"")+'>Rechazada</option><option value="ANULADA" '+((quote?.status||"BORRADOR")==="ANULADA"?"selected":"")+'>Anulada</option><option value="COBRADA" '+((quote?.status||"BORRADOR")==="COBRADA"?"selected":"")+'>Cobrada</option></select></label>'+
    '</div>'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin:9px 0 5px"><b style="font-size:9px">PARTIDAS</b><button type="button" id="add" class="secondary">＋ Línea</button></div>'+
    '<div id="lines"></div><label>Notas<textarea name="notes" rows="3">'+esc(quote?.notes||"")+'</textarea></label>'+
    '<div id="summary" class="quote-summary"></div>'+
    '<div class="modal-actions"><button type="button" class="secondary" id="cancel">Cerrar</button><button type="button" class="secondary" id="print">Imprimir</button><button class="primary">'+(quote?"Guardar cambios":"Guardar cotización")+'</button></div></form>'
  );
  $("#x").onclick=close;$("#cancel").onclick=close;
  const box=$("#lines");
  if(!lines.length)lines=[{type:"PRODUCTO",inventory_id:"",name:"",description:"",qty:1,price:0,cost:0,unit:"UND"}];

  const productOptions=(selected)=>'<option value="">Seleccionar producto…</option>'+inv.map(x=>'<option value="'+x.id+'" '+(selected===x.id?"selected":"")+'>'+esc(x.name+(x.brand?" · "+x.brand:"")+(x.model?" · "+x.model:""))+' — '+money(x.price)+' · stock '+x.stock+'</option>').join("");
  const draw=()=>{
    box.innerHTML=lines.map((x,i)=>{
      const isP=x.type==="PRODUCTO";
      return '<div class="quote-line" data-line="'+i+'">'+
        '<div class="quote-line-top"><select data-i="'+i+'" data-k="type"><option value="PRODUCTO" '+(isP?"selected":"")+'>Producto</option><option value="TRABAJO" '+(!isP?"selected":"")+'>Trabajo</option></select>'+
        (isP?'<select data-i="'+i+'" data-k="inventory_id">'+productOptions(x.inventory_id)+'</select>':'<input data-i="'+i+'" data-k="name" placeholder="Descripción del trabajo" value="'+esc(x.name)+'">')+
        '<button type="button" data-r="'+i+'" class="close">×</button></div>'+
        '<div class="quote-line-fields"><input data-i="'+i+'" data-k="qty" type="number" min="0.01" step="0.01" value="'+x.qty+'" placeholder="Cant.">'+
        '<input data-i="'+i+'" data-k="price" type="number" min="0" step="0.01" value="'+x.price+'" placeholder="Precio unitario">'+
        '<input data-i="'+i+'" data-k="description" placeholder="Descripción (opcional)" value="'+esc(x.description)+'"></div>'+
      '</div>';
    }).join("");
    updateSummary();
  };
  const updateSummary=()=>{
    const sub=lines.reduce((a,x)=>a+Number(x.qty||0)*Number(x.price||0),0);
    const enabled=$("#f [name=tax_enabled]").value==="true",rate=Number($("#f [name=tax_rate]").value||18),tax=enabled?sub*rate/100:0,total=sub+tax;
    $("#summary").innerHTML='<div><span>Subtotal</span><b>'+money(sub)+'</b></div><div><span>IGV ('+rate+'%)</span><b>'+money(tax)+'</b></div><div class="grand"><span>Total</span><b>'+money(total)+'</b></div>';
  };
  box.onchange=e=>{
    const i=e.target.dataset.i;if(i==null)return;const k=e.target.dataset.k;
    if(k==="type"){lines[i].type=e.target.value; if(e.target.value==="TRABAJO"){lines[i].inventory_id="";} draw(); return;}
    lines[i][k]=e.target.value;
    if(k==="inventory_id"){
      const p=inv.find(x=>x.id===e.target.value);if(p){lines[i].name=p.name;lines[i].price=Number(p.price||0);lines[i].cost=Number(p.cost||0);lines[i].unit=p.unit||"UND";}
    }
    updateSummary();
  };
  box.oninput=e=>{
    const i=e.target.dataset.i;if(i==null)return;const k=e.target.dataset.k;
    lines[i][k]=(k==="description"||k==="name")?e.target.value:Number(e.target.value||0);updateSummary();
  };
  box.onclick=e=>{if(e.target.dataset.r!=null){lines.splice(Number(e.target.dataset.r),1);if(!lines.length)lines.push({type:"PRODUCTO",inventory_id:"",name:"",description:"",qty:1,price:0,cost:0,unit:"UND"});draw();}};
  $("#add").onclick=()=>{lines.push({type:"PRODUCTO",inventory_id:"",name:"",description:"",qty:1,price:0,cost:0,unit:"UND"});draw();};
  $("#f [name=tax_enabled]").onchange=updateSummary;$("#f [name=tax_rate]").oninput=updateSummary;
  $("#print").onclick=async()=>printQuote(existing?.id);
  draw();

  $("#f").onsubmit=async e=>{
    e.preventDefault();
    const d=new FormData(e.currentTarget);
    const valid=lines.filter(x=>x.type==="PRODUCTO"?!!x.inventory_id:!!String(x.name||"").trim());
    if(!valid.length)return toast("Agrega al menos una partida.","err");
    if(valid.some(x=>Number(x.qty)<=0||Number(x.price)<0))return toast("Revisa cantidades y precios.","err");
    if(valid.some(x=>x.type==="TRABAJO"&&!Number(x.price)))return toast("Cada trabajo debe tener precio.","err");
    const taxEnabled=d.get("tax_enabled")==="true",taxRate=Number(d.get("tax_rate")||18),status=d.get("status")||"BORRADOR";
    const items=valid.map(x=>({inventory_id:x.type==="PRODUCTO"?x.inventory_id:null,item_type:x.type,name:x.name,description:x.description||null,quantity:Number(x.qty),unit:x.unit||"UND",unit_price:Number(x.price),cost:Number(x.cost||0)}));
    const {data,error}=await S.rpc("marc_save_quote",{p_quote_id:quote?.id||null,p_client_id:d.get("client_id")||null,p_title:d.get("title")||"Cotización",p_status:status,p_tax_enabled:taxEnabled,p_tax_rate:taxRate,p_notes:d.get("notes")||null,p_items:items,p_source:"WEB"});
    if(error){
      const msg=String(error.message||"");
      if(msg.includes("TRIAL_QUOTE_LIMIT"))return toast("Llegaste al límite de 5 cotizaciones de la prueba.","err");
      if(msg.includes("TRIAL_EXPIRED"))return toast("Tu prueba terminó. Activa un plan para continuar.","err");
      return toast(error.message,"err");
    }
    close();toast(quote?"Cotización actualizada":"Cotización guardada","ok");await trial();quotes();
  };
}

async function printQuote(id){
  if(!id){toast("Guarda la cotización antes de imprimir.","err");return;}
  const q=(await S.from("marc_quotes").select("*,marc_clients(name,document_type,document_number,email,phone,address)").eq("id",id).eq("user_id",st.u.id).single()).data;
  if(!q)return toast("No se encontró la cotización.","err");
  const items=(await S.from("marc_quote_items").select("*").eq("quote_id",id).eq("user_id",st.u.id).order("created_at")).data||[];
  const client=q.marc_clients||{};
  const rows=items.map(x=>"<tr><td>"+esc(x.name)+"</td><td>"+esc(x.description||"")+"</td><td>"+x.quantity+"</td><td>"+money(x.unit_price)+"</td><td>"+money(x.line_total)+"</td></tr>").join("");
  const w=window.open("","_blank","width=900,height=1100");
  if(!w)return toast("El navegador bloqueó la ventana de impresión.","err");
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(q.number)}</title>
  <style>
  body{font-family:Arial,sans-serif;color:#172033;margin:40px}
  h1{margin:0;font-size:30px}.muted{color:#677085}
  .top{display:flex;justify-content:space-between;border-bottom:2px solid #172033;padding-bottom:18px;margin-bottom:24px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
  .box{border:1px solid #dfe4ec;border-radius:10px;padding:14px}
  table{width:100%;border-collapse:collapse;margin-top:20px}
  th,td{padding:10px;border-bottom:1px solid #e8ebf0;text-align:left}
  th{background:#f6f8fb}.totals{margin-left:auto;width:300px;margin-top:22px}
  .totals div{display:flex;justify-content:space-between;padding:6px}
  .grand{font-size:18px;font-weight:700;border-top:2px solid #172033;margin-top:6px;padding-top:10px}
  @media print{body{margin:15mm}}
  </style></head><body>
  <div class="top"><div><div class="muted">M.A.R.C. · COTIZACIÓN</div><h1>${esc(q.number)}</h1><div class="muted">${new Date(q.created_at).toLocaleDateString("es-PE")}</div></div>
  <div style="text-align:right"><b>${esc(q.title)}</b><div class="muted">Estado: ${esc(q.status)}</div></div></div>
  <div class="grid"><div class="box"><b>Cliente</b><p>${esc(client.name||"Sin cliente")}</p>
  <div class="muted">${esc(client.document_type&&client.document_number?client.document_type+" "+client.document_number:"")}</div>
  <div>${esc(client.email||"")}</div><div>${esc(client.phone||"")}</div><div>${esc(client.address||"")}</div></div>
  <div class="box"><b>Condiciones</b><p>Moneda: ${esc(q.currency||"PEN")}</p><p>IGV: ${q.tax_enabled?esc(q.tax_rate)+"%":"No incluido"}</p></div></div>
  <table><thead><tr><th>Concepto</th><th>Descripción</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="totals"><div><span>Subtotal</span><b>${money(q.subtotal)}</b></div><div><span>IGV</span><b>${money(q.tax)}</b></div>
  <div class="grand"><span>Total</span><b>${money(q.total)}</b></div></div>
  <h3>Notas</h3><p>${esc(q.notes||"Sin observaciones.")}</p>
  <script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`;
  w.document.open();w.document.write(html);w.document.close();
}
function wire(){mode("login");$("#authForm").onsubmit=submit;$("#switchAuth").onclick=()=>mode(authMode==="signup"?"login":"signup");$("#forgot").onclick=()=>mode("reset");$("#togglePass").onclick=()=>{const x=$("#password");x.type=x.type==="password"?"text":"password";$("#togglePass").textContent=x.type==="password"?"Mostrar":"Ocultar"};$("#logout").onclick=()=>S.auth.signOut();$("#askTop").onclick=openChat;$("#closeChat").onclick=closeChat;$("#menu").onclick=()=>$("#sidebar").classList.toggle("open");$$(".sidebar nav button").forEach(b=>b.onclick=()=>view(b.dataset.view));$("#chatForm").onsubmit=e=>{e.preventDefault();const v=$("#chatInput").value.trim();if(v){$("#chatInput").value="";chatSend(v)}};$("#chatInput").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("#chatForm").requestSubmit()}};$$(".chips button").forEach(b=>b.onclick=()=>{$("#chatInput").value=b.dataset.q;$("#chatInput").focus()});S.auth.onAuthStateChange((ev,s)=>{st.session=s||null;if(s)enter(s);else if(ev==="SIGNED_OUT"){st.u=null;st.session=null;$("#app").classList.add("hidden");$("#auth").classList.remove("hidden")}});S.auth.getSession().then(({data})=>data.session&&enter(data.session))}
wire()})();
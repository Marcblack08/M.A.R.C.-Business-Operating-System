(()=>{const C=window.MARC_CONFIG,S=window.supabase.createClient(C.supabaseUrl,C.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});const st={u:null,session:null,view:"home",cid:null,authEpoch:0};const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)],esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c)),money=v=>new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(Number(v||0)),toast=(t,c="")=>{const e=document.createElement("div");e.className="toast "+c;e.textContent=t;$("#toast").appendChild(e);setTimeout(()=>e.remove(),2600)},initials=n=>String(n||"M").split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join("");let authMode="login";
function msg(t,c=""){const e=$("#authMsg");e.textContent=t;e.className="msg "+c}
function mode(m){authMode=m;$("#authForm").reset();const needsConfirm=m==="signup"||m==="update";$("#confirmBox").classList.toggle("hidden",!needsConfirm);$("#confirm").required=needsConfirm;$("#forgot").classList.toggle("hidden",m!=="login");$("#switchAuth").textContent=m==="signup"?"Ya tengo una cuenta":(m==="update"?"Volver al inicio de sesión":m==="reset"?"Volver al inicio de sesión":"Crear una cuenta");$("#authTitle").textContent=m==="signup"?"Crea tu cuenta":m==="reset"?"Recupera tu contraseña":m==="update"?"Crea una nueva contraseña":"Inicia sesión en M.A.R.C.";$("#authSub").textContent=m==="signup"?"Empieza tu prueba gratuita de 7 días.":m==="reset"?"Te enviaremos un enlace seguro.":m==="update"?"Elige una contraseña nueva para proteger tu cuenta.":"Convierte conversaciones en operaciones reales de tu negocio.";$("#authSubmit").textContent=m==="signup"?"Crear cuenta":m==="reset"?"Enviar enlace":m==="update"?"Actualizar contraseña":"Iniciar sesión";$("#password").disabled=m==="reset";$("#password").required=m!=="reset";msg("")}
function resetUiToLogin(message="",type=""){st.authEpoch++;st.u=null;st.session=null;st.cid=null;$("#app").classList.add("hidden");$("#auth").classList.remove("hidden");mode("login");if(message)msg(message,type)}
async function ensure(){const u=st.u;if(!u)return;await S.from("marc_accounts").upsert({id:u.id,display_name:u.email?.split("@")[0]||"Usuario"},{onConflict:"id"});const {data:t}=await S.from("marc_trials").select("id").eq("user_id",u.id).maybeSingle();if(!t)await S.from("marc_trials").insert({user_id:u.id});const {data:c}=await S.from("marc_conversations").select("id").eq("user_id",u.id).eq("channel","WEB").order("updated_at",{ascending:false}).limit(1).maybeSingle();st.cid=c?.id||(await S.from("marc_conversations").insert({user_id:u.id,channel:"WEB",title:"Conversación principal"}).select("id").single()).data?.id}
async function enter(s){
  if(!s?.user)return;
  const epoch=++st.authEpoch;
  st.session=s;
  st.u=s.user;
  const auth=$("#auth"),app=$("#app");
  try{
    auth.classList.add("hidden");
    app.classList.add("hidden");
    await ensure();
    if(epoch!==st.authEpoch)return;
    await trial();
    if(epoch!==st.authEpoch)return;
    await chatLoad();
    if(epoch!==st.authEpoch)return;
    app.classList.remove("hidden");
    await view("home");
  }catch(e){
    if(epoch!==st.authEpoch)return;
    st.u=null;st.session=null;st.cid=null;
    app.classList.add("hidden");
    auth.classList.remove("hidden");
    msg(e?.message||"No se pudo cargar M.A.R.C.","error");
  }
}
async function submit(e){e.preventDefault();try{$("#authSubmit").disabled=true;msg("Procesando…");const email=$("#email").value.trim(),p=$("#password").value;if(authMode==="reset"){const {error}=await S.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname+"?recovery=1"});if(error)throw error;msg("Revisa tu correo. El enlace te llevará a crear una nueva contraseña.","ok");return}if(authMode==="update"){if(p!==$("#confirm").value)throw new Error("Las contraseñas no coinciden.");const {error}=await S.auth.updateUser({password:p});if(error)throw error;resetUiToLogin("Contraseña actualizada. Inicia sesión nuevamente.","ok");await S.auth.signOut();return}if(authMode==="signup"){if(p!==$("#confirm").value)throw new Error("Las contraseñas no coinciden.");const {error}=await S.auth.signUp({email,password:p});if(error)throw error;msg("Cuenta creada. Revisa tu correo si la confirmación está activada.","ok");return}else{const {error}=await S.auth.signInWithPassword({email,password:p});if(error)throw error}}catch(e){msg(e.message||"No se pudo completar.","error")}finally{$("#authSubmit").disabled=false}}
async function trial(){
  const {data:role}=await S.from("marc_user_roles").select("role,active").eq("user_id",st.u.id).eq("role","MASTER").eq("active",true).maybeSingle();
  const [c,i,q]=await Promise.all([
    S.from("marc_clients").select("id",{count:"exact",head:true}).eq("user_id",st.u.id),
    S.from("marc_inventory").select("id",{count:"exact",head:true}).eq("user_id",st.u.id),
    S.from("marc_quotes").select("id",{count:"exact",head:true}).eq("user_id",st.u.id)
  ]);
  if(role?.role==="MASTER"){
    $("#trialDays").textContent="MASTER";
    $("#trialBar").style.width="100%";
    $("#usage").textContent=(c.count||0)+" clientes · "+(i.count||0)+" productos · "+(q.count||0)+" cotizaciones · SIN LÍMITES";
    return;
  }
  const {data:t}=await S.from("marc_trials").select("started_at,ends_at").eq("user_id",st.u.id).maybeSingle();
  const end=new Date(t?.ends_at||Date.now()).getTime(),start=new Date(t?.started_at||Date.now()).getTime(),now=Date.now(),left=Math.max(0,end-now),days=Math.ceil(left/864e5);
  $("#trialDays").textContent=days+" días";
  $("#trialBar").style.width=Math.max(3,100-(left/Math.max(1,end-start)*100))+"%";
  $("#usage").textContent=(c.count||0)+"/25 clientes · "+(i.count||0)+"/50 productos · "+(q.count||0)+"/5 cotizaciones";
}
async function chatLoad(){const box=$("#messages");box.innerHTML="";const {data}=await S.from("marc_messages").select("role,content").eq("conversation_id",st.cid).order("created_at",{ascending:true}).limit(60);if(!data?.length)addBubble("a","Hola. Soy M.A.R.C. Dime qué quieres hacer.");else data.forEach(x=>addBubble(x.role==="USER"?"u":"a",x.content))}
function addBubble(type,text){const e=document.createElement("div");e.className="bubble "+type;e.textContent=text;$("#messages").appendChild(e);$("#messages").scrollTop=$("#messages").scrollHeight}
async function chatSend(text){
  const raw=String(text||"").trim();
  if(!raw)return;

  const normalized=raw.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .trim();

  if(/^(nueva cotizacion|\+ cotizacion|crear cotizacion)$/.test(normalized)){
    addBubble("u",raw);
    closeChat();
    return quoteModal();
  }
  if(/^(inventario|revisar inventario|mostrar inventario)$/.test(normalized)){
    addBubble("u",raw);
    closeChat();
    return inventory();
  }
  if(/^(cliente|buscar cliente|nuevo cliente)$/.test(normalized)){
    addBubble("u",raw);
    closeChat();
    return normalized==="nuevo cliente"?clientModal():clients();
  }

  addBubble("u",raw);
  const inserted=await S.from("marc_messages").insert({
    conversation_id:st.cid,
    user_id:st.u.id,
    role:"USER",
    content:raw
  });
  if(inserted.error){
    const loading=document.createElement("div");
    loading.className="bubble a";
    loading.textContent="No pude registrar el mensaje. Inténtalo nuevamente.";
    $("#messages").appendChild(loading);
    return;
  }

  const loading=document.createElement("div");
  loading.className="bubble a";
  loading.textContent="Pensando…";
  $("#messages").appendChild(loading);

  try{
    const r=await fetch("/api/chat",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer "+st.session?.access_token
      },
      body:JSON.stringify({message:raw,conversationId:st.cid})
    });
    const j=await r.json();
    const reply=r.ok?(j.text||"No pude responder."):j.message||j.error||"El núcleo de IA no está disponible.";
    loading.textContent=reply;
    await S.from("marc_messages").insert({
      conversation_id:st.cid,
      user_id:st.u.id,
      role:"ASSISTANT",
      content:reply,
      action_type:j.action||"CHAT"
    });
  }catch(e){
    loading.textContent="No pude conectar con el núcleo de IA. La plataforma sigue disponible.";
  }
}
function openChat(){
  $("#chat").classList.remove("closed");
  $("#app").classList.remove("chat-closed");
  $("#chat").classList.add("open");
  setTimeout(()=>$("#chatInput")?.focus(),80);
}
function closeChat(){
  $("#chat").classList.remove("open");
  $("#chat").classList.add("closed");
  $("#app").classList.add("chat-closed");
}
function title(x){$("#page").textContent={home:"Inicio",clients:"Clientes",inventory:"Inventario",quotes:"Cotizaciones",settings:"Configuración"}[x]||"Inicio";$(".sidebar nav button, #mobileNav button").forEach(b=>b.classList.toggle("active",b.dataset.view===x))}
async function view(x){st.view=x;title(x);$("#sidebar").classList.remove("open");document.body.style.overflow="";if(window.innerWidth<=780)window.scrollTo(0,0);$(".sidebar nav button,.mobile-bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===x));if(x==="home")return home();if(x==="clients")return clients();if(x==="inventory")return inventory();if(x==="quotes")return quotes();return settings()}
async function home(){
  const c=$("#content");
  const [cl,iv,qt]=await Promise.all([
    S.from("marc_clients").select("*",{count:"exact"}).eq("user_id",st.u.id),
    S.from("marc_inventory").select("*").eq("user_id",st.u.id).eq("active",true).order("name"),
    S.from("marc_quotes").select("*").eq("user_id",st.u.id).is("deleted_at",null).order("created_at",{ascending:false}).limit(120)
  ]);

  const inventory=iv.data||[];
  const quotes=qt.data||[];
  const low=inventory.filter(x=>Number(x.stock)<=Number(x.min_stock));
  const totalStock=inventory.reduce((sum,x)=>sum+Number(x.stock||0),0);
  const recent=quotes.slice(0,4);

  const validFinance=quotes.filter(x=>!["ANULADA","RECHAZADA","BORRADOR"].includes(String(x.status||"").toUpperCase()));
  const realizedFinance=quotes.filter(x=>String(x.status||"").toUpperCase()==="COBRADA");

  const now=new Date();
  const monthKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  const monthLabel=d=>d.toLocaleDateString("es-PE",{month:"short"}).replace(".","").replace(/^./,m=>m.toUpperCase());
  const months=Array.from({length:6},(_,i)=>new Date(now.getFullYear(),now.getMonth()-5+i,1));

  const monthly=months.map(m=>{
    const key=monthKey(m);
    const projected=validFinance.filter(x=>monthKey(new Date(x.created_at))===key).reduce((s,x)=>s+Number(x.profit||0),0);
    const collected=realizedFinance.filter(x=>monthKey(new Date(x.created_at))===key).reduce((s,x)=>s+Number(x.profit||0),0);
    const sales=validFinance.filter(x=>monthKey(new Date(x.created_at))===key).reduce((s,x)=>s+Number(x.total||0),0);
    return {key,label:monthLabel(m),projected,collected,sales};
  });

  const current=monthly[monthly.length-1];
  const currentMargin=current.sales>0?Math.max(0,Math.min(100,(current.projected/current.sales)*100)):0;
  const sixMonthProjected=monthly.reduce((s,m)=>s+m.projected,0);
  const sixMonthCollected=monthly.reduce((s,m)=>s+m.collected,0);
  const maxGain=Math.max(1,...monthly.map(m=>m.projected));
  const quoteTotal=validFinance.reduce((sum,x)=>sum+Number(x.total||0),0);

  c.innerHTML=`
    <div class="dashboard-shell">
      <section class="dashboard-hero">
        <div class="hero-copy">
          <div class="hero-eyebrow">CENTRO DE OPERACIONES</div>
          <h1>Tu negocio, más claro.<br><span>M.A.R.C. se encarga.</span></h1>
          <p>Clientes, inventario, cotizaciones, resultados y rentabilidad reunidos en un solo lugar para que puedas actuar rápido.</p>
          <div class="hero-actions">
            <button id="askHome" class="primary hero-primary">✦ Hablar con M.A.R.C.</button>
            <button id="heroQuote" class="hero-secondary">＋ Nueva cotización</button>
          </div>
        </div>
        <div class="hero-orbit" aria-hidden="true">
          <div class="hero-orbit-card orbit-main"><span>✦</span><b>Copiloto</b><small>Operación en tiempo real</small></div>
          <div class="hero-orbit-card orbit-small orbit-a">Clientes</div>
          <div class="hero-orbit-card orbit-small orbit-b">Inventario</div>
          <div class="hero-orbit-card orbit-small orbit-c">Rentabilidad</div>
        </div>
      </section>

      <section class="dashboard-kpis">
        <article class="kpi-modern">
          <div class="kpi-icon blue">◉</div>
          <div><span>Clientes</span><strong>${cl.count||0}</strong><small>Base operativa</small></div>
          <b class="kpi-arrow">↗</b>
        </article>
        <article class="kpi-modern">
          <div class="kpi-icon cyan">▣</div>
          <div><span>Productos</span><strong>${inventory.length}</strong><small>${totalStock} unidades en stock</small></div>
          <b class="kpi-arrow">↗</b>
        </article>
        <article class="kpi-modern">
          <div class="kpi-icon amber">!</div>
          <div><span>Atención</span><strong>${low.length}</strong><small>${low.length?"Productos requieren revisión":"Sin alertas de stock"}</small></div>
          <b class="kpi-arrow">${low.length?"!":"✓"}</b>
        </article>
        <article class="kpi-modern kpi-profit">
          <div class="kpi-icon violet">↗</div>
          <div><span>Ganancia del mes</span><strong>${money(current.projected)}</strong><small>Proyectada · ${money(current.collected)} cobrada</small></div>
          <b class="kpi-arrow">↗</b>
        </article>
      </section>

      <section class="dashboard-main-grid">
        <article class="dashboard-panel quick-panel">
          <div class="panel-title-row"><div><div class="panel-eyebrow">ACCIONES RÁPIDAS</div><h3>¿Qué necesitas hacer?</h3></div><span class="panel-live">Listo</span></div>
          <div class="quick-modern-grid">
            <button data-q="client"><span class="quick-icon blue">＋</span><div><b>Nuevo cliente</b><small>Guardar un contacto</small></div><em>→</em></button>
            <button data-q="inventory"><span class="quick-icon cyan">＋</span><div><b>Nuevo producto</b><small>Agregar al inventario</small></div><em>→</em></button>
            <button data-q="quote"><span class="quick-icon violet">＋</span><div><b>Nueva cotización</b><small>Preparar una propuesta</small></div><em>→</em></button>
            <button data-q="chat"><span class="quick-icon dark">✦</span><div><b>Preguntar a M.A.R.C.</b><small>Ordenar o consultar</small></div><em>→</em></button>
          </div>
        </article>

        <article class="dashboard-panel alert-panel">
          <div class="panel-title-row"><div><div class="panel-eyebrow">INVENTARIO CRÍTICO</div><h3>Lo que necesita atención</h3></div><button id="openInventory" class="panel-link">Ver inventario →</button></div>
          <div class="critical-list">
            ${low.slice(0,5).map(x=>`
              <div class="critical-row">
                <div class="critical-dot ${Number(x.stock)<=0?"danger":"warning"}"></div>
                <div class="critical-copy"><b>${esc(x.name)}</b><small>${esc([x.brand,x.model].filter(Boolean).join(" · ")||x.sku||"Sin código")}</small></div>
                <span class="status-pill ${Number(x.stock)<=0?"red":"amber"}">${Number(x.stock)<=0?"Agotado":Number(x.stock)+" "+esc(x.unit||"UND")}</span>
              </div>
            `).join("")||'<div class="empty-state"><span>✓</span><b>Todo en orden</b><small>No hay productos con stock crítico.</small></div>'}
          </div>
        </article>
      </section>

      <section class="finance-dashboard">
        <div class="finance-heading">
          <div><div class="panel-eyebrow">ESTADÍSTICAS</div><h2>Ganancia mensual</h2><p>Últimos 6 meses. Las cotizaciones anuladas, rechazadas y borradores no se incluyen.</p></div>
          <div class="finance-summary"><span>6 meses</span><strong>${money(sixMonthProjected)}</strong><small>${money(sixMonthCollected)} cobrados</small></div>
        </div>
        <div class="finance-grid">
          <article class="dashboard-panel profit-chart-panel">
            <div class="panel-title-row"><div><h3>Tendencia de ganancia</h3><small class="finance-subtitle">Ganancia registrada por mes</small></div><span class="finance-dot"><i></i> Proyectada</span></div>
            <div class="profit-bars">
              ${monthly.map((m,i)=>{
                const h=Math.max(5,Math.round((m.projected/maxGain)*100));
                return `<div class="profit-bar-col"><div class="profit-value">${money(m.projected)}</div><div class="profit-bar-track"><div class="profit-bar-fill ${i===monthly.length-1?"current":""}" style="height:${h}%"></div></div><b>${esc(m.label)}</b></div>`;
              }).join("")}
            </div>
          </article>

          <article class="dashboard-panel margin-panel">
            <div class="panel-title-row"><div><h3>Margen del mes</h3><small class="finance-subtitle">${monthLabel(now)} · sobre ventas proyectadas</small></div></div>
            <div class="margin-ring-wrap">
              <div class="margin-ring" style="--ring:${currentMargin}%"><div><strong>${Math.round(currentMargin)}%</strong><span>margen</span></div></div>
              <div class="margin-copy">
                <div><span>Ganancia</span><b>${money(current.projected)}</b></div>
                <div><span>Ventas</span><b>${money(current.sales)}</b></div>
                <div><span>Cobrada</span><b>${money(current.collected)}</b></div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section class="dashboard-panel activity-panel">
        <div class="panel-title-row"><div><div class="panel-eyebrow">ACTIVIDAD RECIENTE</div><h3>Últimos movimientos</h3></div><button id="openQuotes" class="panel-link">Ver cotizaciones →</button></div>
        <div class="activity-list">
          ${recent.map(x=>`
            <div class="activity-row">
              <div class="activity-mark">${x.status==="COBRADA"?"✓":x.status==="ANULADA"?"×":"$"}</div>
              <div class="activity-copy"><b>${esc(x.number)} <span>·</span> ${esc(x.title)}</b><small>${esc(x.status)} · ${new Date(x.created_at).toLocaleDateString("es-PE",{day:"2-digit",month:"short"})}</small></div>
              <strong>${money(x.total)}</strong>
            </div>
          `).join("")||'<div class="empty-state"><span>◌</span><b>Aún no hay actividad</b><small>Tu actividad aparecerá aquí.</small></div>'}
        </div>
      </section>
    </div>
  `;

  $("#askHome").onclick=openChat;
  $("#heroQuote").onclick=quoteModal;
  $("#openInventory").onclick=inventory;
  $("#openQuotes").onclick=quotes;
  $(".quick-modern-grid button",c).forEach(b=>b.onclick=()=>b.dataset.q==="client"?clientModal():b.dataset.q==="inventory"?inventoryModal():b.dataset.q==="quote"?quoteModal():openChat());
}
async function clients(){const {data}=await S.from("marc_clients").select("*").eq("user_id",st.u.id).order("name");const c=$("#content");c.innerHTML=`<div class="head"><div><div class="eyebrow2">CLIENTES</div><h1>Relaciones y contexto.</h1><p>Los clientes son memoria operativa de M.A.R.C.</p></div><button id="new" class="primary">＋ Nuevo cliente</button></div><section class="card table"><div class="toolbar"><div class="search"><input id="search" placeholder="Buscar…"></div><button id="ask" class="secondary">Preguntar</button></div><div class="scroll"><table class="data"><thead><tr><th>Cliente</th><th>Contacto</th><th>Correo</th><th>Teléfono</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></section>`;const rows=$("#rows"),draw=list=>rows.innerHTML=list.map(x=>`<tr><td><b>${esc(x.name)}</b><br><small>${esc(x.document_number||"")}</small></td><td>${esc(x.contact_name||"—")}</td><td>${esc(x.email||"—")}</td><td>${esc(x.phone||"—")}</td><td><button class="secondary" type="button" data-id="${x.id}">Editar</button></td></tr>`).join("")||'<tr><td colspan="5" class="empty">Aún no tienes clientes.</td></tr>';draw(data||[]);$("#search").oninput=e=>{const q=e.target.value.toLowerCase();draw((data||[]).filter(x=>[x.name,x.email,x.phone,x.document_number].some(v=>String(v||"").toLowerCase().includes(q))))};$("#new").onclick=()=>clientModal();$("#ask").onclick=()=>openChat();$$("[data-id]",c).forEach(b=>b.onclick=()=>clientModal((data||[]).find(x=>x.id===b.dataset.id)))}
async function ensurePdfJs(){
  if(window.pdfjsLib)return window.pdfjsLib;
  throw new Error("No se pudo cargar el lector PDF. Recarga la página e inténtalo nuevamente.");
}

async function extractPdfCatalogRows(page){
  try{
    const content=await page.getTextContent({normalizeWhitespace:true,disableCombineTextItems:false});
    const items=(content.items||[]).map(item=>({
      text:String(item.str||"").replace(/\s+/g," ").trim(),
      x:Number(item.transform?.[4]||0),
      y:Number(item.transform?.[5]||0)
    })).filter(x=>x.text);

    const width=page.view?.[2]||page.getViewport({scale:1}).width||595;
    const prices=items
      .filter(x=>x.x>width*.74 && /^\d+(?:[.,]\d{1,2})$/.test(x.text.replace(/[^\d.,]/g,"")))
      .map(x=>({...x,price:Number(x.text.replace(",","."))}))
      .sort((a,b)=>b.y-a.y);

    if(!prices.length)return {rows:[],text:items.map(x=>x.text).join("\n"),usedLocal:false};

    const rows=[];
    for(let i=0;i<prices.length;i++){
      const p=prices[i];
      const prev=prices[i-1],next=prices[i+1];
      const gapPrev=prev?Math.abs(prev.y-p.y):Math.abs(p.y-(next?.y||p.y));
      const gapNext=next?Math.abs(p.y-next.y):gapPrev;
      const radius=Math.max(13,Math.min(28,Math.min(gapPrev||20,gapNext||20)*.55));
      const rowItems=items.filter(x=>Math.abs(x.y-p.y)<=radius);

      const nameParts=rowItems
        .filter(x=>x.x<width*.34 && Math.abs(x.y-p.y)<=radius)
        .sort((a,b)=>Math.abs(a.y-p.y)-Math.abs(b.y-p.y)||a.x-b.x)
        .map(x=>x.text);

      const codeParts=rowItems
        .filter(x=>x.x>=width*.32 && x.x<width*.74)
        .sort((a,b)=>Math.abs(a.y-p.y)-Math.abs(b.y-p.y)||a.x-b.x)
        .map(x=>x.text);

      const name=[...new Set(nameParts)].join(" ").replace(/\s+/g," ").trim();
      const codeText=[...new Set(codeParts)].join(" ").replace(/\s+/g," ").trim();
      if(!name)return;

      const skuMatch=codeText.match(/\b(?:[A-Z]{1,6})-[A-Z0-9]{1,12}\b/i);
      const sku=skuMatch?.[0]||null;
      const variant=codeText.replace(skuMatch?.[0]||"","").replace(/\s+/g," ").trim();
      const fullName=[name,variant].filter(Boolean).join(" ").replace(/\s+/g," ").trim();

      rows.push({
        sku,
        name:fullName.slice(0,180),
        brand:null,
        model:sku,
        category:name.slice(0,100),
        unit:"UND",
        cost:null,
        price:p.price,
        stock:null,
        min_stock:null,
        pdf_y:p.y,
        pdf_radius:radius
      });
    }

    // One product per price cell: preserve page order and remove exact duplicates only.
    const clean=[],seen=new Set();
    for(const row of rows){
      const key=((row.sku||"")+"|"+row.name+"|"+row.price).toLowerCase();
      if(seen.has(key))continue;
      seen.add(key);clean.push(row);
    }
    return {rows:clean,text:items.map(x=>x.text).join("\n"),usedLocal:clean.length>0};
  }catch{
    return {rows:[],text:"",usedLocal:false};
  }
}

async function extractPdfPageText(page){
  try{
    const content=await page.getTextContent({normalizeWhitespace:true,disableCombineTextItems:false});
    return (content.items||[]).map(x=>String(x.str||"").trim()).filter(Boolean).join("\n");
  }catch{return ""}
}

function pdfProgressHtml(page,total,count){
  const pct=total?Math.round(page*100/total):0;
  return '<div class="pdf-progress-wrap">'+
    '<div class="pdf-progress-top"><b id="pdfProgressText">Leyendo página '+page+' de '+total+'</b><strong id="pdfProgressCount">'+count+' productos detectados</strong></div>'+
    '<div class="pdf-progress"><i id="pdfProgressBar" style="width:'+pct+'%"></i></div>'+
    '</div>';
}

async function inventoryPdfModal(){
  const close=modal(
    '<div class="modal-head"><div><h2>📄 Importar inventario desde PDF</h2><p>M.A.R.C. lee el catálogo página por página y detecta los productos antes de importarlos.</p></div><button class="close" id="x">×</button></div>'+
    '<form id="pdfInventoryForm">'+
    '<label>Catálogo PDF<input id="inventoryPdfFile" type="file" accept="application/pdf" required></label>'+
    '<div class="pdf-import-hint">Hasta 20 MB. Para catálogos con tablas de texto, M.A.R.C. hace la lectura directamente en el dispositivo para mayor velocidad y precisión.</div>'+
    '<div id="pdfImportStatus" class="msg"></div>'+
    '<div id="pdfImportProgress"></div>'+
    '<div id="pdfLiveItems" class="pdf-live-items hidden"></div>'+
    '<div id="pdfImportPreview" class="pdf-import-preview hidden"></div>'+
    '<div class="modal-actions"><button type="button" class="secondary" id="cancel">Cancelar</button><button type="submit" class="primary" id="analyzePdf">Analizar catálogo</button></div>'+
    '</form>'
  );
  $("#x").onclick=close;
  $("#cancel").onclick=close;

  const form=$("#pdfInventoryForm");
  const btn=$("#analyzePdf");
  const status=$("#pdfImportStatus");
  let working=false;

  form.onsubmit=async function(e){
    e.preventDefault();
    if(working)return;

    const file=$("#inventoryPdfFile").files?.[0];
    if(!file)return toast("Selecciona un PDF.","err");
    if(file.size>20*1024*1024)return toast("El PDF supera el límite de 20 MB.","err");

    working=true;
    btn.disabled=true;
    status.className="msg";
    status.textContent="Abriendo el catálogo y contando páginas…";
    $("#pdfImportPreview").classList.add("hidden");
    $("#pdfLiveItems").classList.add("hidden");

    try{
      const pdfjs=await ensurePdfJs();
      if(!pdfjs.GlobalWorkerOptions.workerSrc){
        pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      }

      const buffer=await file.arrayBuffer();
      const pdf=await pdfjs.getDocument({data:buffer}).promise;
      const totalPages=pdf.numPages;

      status.textContent="Catálogo abierto. Procesando "+totalPages+" páginas…";
      $("#pdfImportProgress").innerHTML=pdfProgressHtml(0,totalPages,0);

      let pendingId=null;
      let pendingPromise=null;
      const ensurePendingId=async()=>{
        if(pendingId)return pendingId;
        if(pendingPromise)return pendingPromise;
        pendingPromise=fetch("/api/inventory/pdf-start",{
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            Authorization:"Bearer "+st.session?.access_token
          },
          body:JSON.stringify({filename:file.name,totalPages})
        }).then(async response=>{
          const data=await response.json();
          if(!response.ok)throw new Error(data.message||data.error||"No se pudo iniciar el análisis avanzado.");
          if(!data.pendingId)throw new Error("No se pudo crear la sesión de análisis avanzado.");
          pendingId=data.pendingId;
          return pendingId;
        }).finally(()=>{pendingPromise=null});
        return pendingPromise;
      };

      const detected=[];
      const live=$("#pdfLiveItems");
      live.classList.remove("hidden");
      live.innerHTML='<div class="pdf-live-title">Productos detectados hasta ahora</div><div id="pdfLiveRows"></div>';
      const liveRows=$("#pdfLiveRows");

      const CONCURRENCY=4;
      for(let batchStart=1;batchStart<=totalPages;batchStart+=CONCURRENCY){
        const batch=[];
        for(let p=0;p<CONCURRENCY&&batchStart+p<=totalPages;p++)batch.push(batchStart+p);

        status.textContent="M.A.R.C. está leyendo páginas "+batch[0]+"–"+batch[batch.length-1]+" de "+totalPages+"…";
        $("#pdfProgressText").textContent="Leyendo páginas "+batch[0]+"–"+batch[batch.length-1]+" de "+totalPages;
        $("#pdfProgressCount").textContent=detected.length+" productos detectados";
        $("#pdfProgressBar").style.width=Math.round((batch[0]-1)*100/totalPages)+"%";

        const results=await Promise.all(batch.map(async pageNumber=>{
          const page=await pdf.getPage(pageNumber);
          const local=await extractPdfCatalogRows(page);

          if(local.usedLocal && local.rows.length){
            return {pageNumber,items:local.rows,mode:"LECTURA DIRECTA"};
          }

          // Solo los PDFs sin tabla de texto utilizan Gemini.
          const pendingForPage=await ensurePendingId();
          const text=local.text||await extractPdfPageText(page);
          let image="";
          let viewport=page.getViewport({scale:1.25});
          if(viewport.width>1600)viewport=page.getViewport({scale:1.25*(1600/viewport.width)});
          const canvas=document.createElement("canvas");
          const ctx=canvas.getContext("2d",{alpha:false});
          canvas.width=Math.ceil(viewport.width);
          canvas.height=Math.ceil(viewport.height);
          await page.render({canvasContext:ctx,viewport}).promise;
          image=canvas.toDataURL("image/jpeg",0.72);

          let analyzed=null,lastError=null;
          for(let retry=0;retry<2;retry++){
            try{
              const pr=await fetch("/api/inventory/pdf-page",{
                method:"POST",
                headers:{
                  "Content-Type":"application/json",
                  Authorization:"Bearer "+st.session?.access_token
                },
                body:JSON.stringify({pendingId:pendingForPage,pageNumber,totalPages,text,image})
              });
              const pj=await pr.json();
              if(!pr.ok)throw new Error(pj.message||pj.error||("No se pudo analizar la página "+pageNumber));
              analyzed=pj;
              break;
            }catch(err){
              lastError=err;
              if(retry===0)status.textContent="Reintentando página "+pageNumber+"…";
            }
          }
          if(!analyzed)throw new Error((lastError?.message||"No se pudo analizar la página")+" Revisa tu conexión.");
          return {pageNumber,items:Array.isArray(analyzed.items)?analyzed.items:[],mode:analyzed.mode||"GEMINI"};
        }));

        results.sort((a,b)=>a.pageNumber-b.pageNumber);
        for(const result of results){
          const pageNumber=result.pageNumber;
          const pageItems=result.items;
          detected.push(...pageItems.map(function(item){return Object.assign({},item,{page_number:item.page_number||pageNumber});}));
          const recent=pageItems.slice(0,12).map((x,ix)=>'<div class="pdf-live-row"><span>P'+pageNumber+' · '+(ix+1)+'</span><b>'+esc(x.name)+'</b><small>'+esc([x.brand,x.model,x.sku].filter(Boolean).join(" · ")||"Sin código")+'</small></div>').join("");
          liveRows.insertAdjacentHTML("beforeend",recent);
        }

        const done=Math.min(batchStart+batch.length-1,totalPages);
        $("#pdfProgressText").textContent="Leídas páginas "+done+" de "+totalPages;
        $("#pdfProgressCount").textContent=detected.length+" productos detectados";
        $("#pdfProgressBar").style.width=Math.round(done*100/totalPages)+"%";
      }

      status.className="msg ok";
      status.textContent="Análisis terminado. Revisa exactamente qué productos serán procesados antes de importarlos.";
      $("#pdfProgressText").textContent="Lectura terminada · "+totalPages+" páginas";
      $("#pdfProgressCount").textContent=detected.length+" productos detectados";

      const listItems=detected;
      const preview=$("#pdfImportPreview");
      preview.innerHTML=
        '<div class="pdf-final-summary"><strong>Se procesarán '+listItems.length+' productos</strong><span>'+totalPages+' páginas revisadas</span></div>'+'<label class="pdf-photo-option"><input type="checkbox" id="keepPdfProductPhotos" checked> Conservar la foto del producto desde el PDF cuando la página contenga imágenes</label>'+
        '<div class="pdf-product-list">'+
          listItems.map((x,i)=>'<div class="pdf-product-row"><span><b>'+(i+1)+'.</b> '+esc(x.name)+'</span><small>Página '+Number(x.page_number||1)+' · '+esc([x.sku,x.brand,x.model].filter(Boolean).join(" · ")||"Sin código")+(x.price!=null?" · S/ "+Number(x.price).toFixed(2):"")+'</small></div>').join("")+
        '</div>';
      preview.classList.remove("hidden");

      btn.type="button";
      btn.disabled=false;
      btn.textContent="Importar "+listItems.length+" productos";
      btn.dataset.ready="1";

      async function attachPdfProductPhotos(){
        const keep=$("#keepPdfProductPhotos")?.checked;
        if(!keep)return {attached:0,skipped:0};
        const byPage={};
        listItems.forEach(function(item){
          if(!item.page_number||item.pdf_y==null)return;
          (byPage[item.page_number]||(byPage[item.page_number]=[])).push(item);
        });
        let attached=0,skipped=0;
        for(const pageKey of Object.keys(byPage)){
          const pageNumber=Number(pageKey);
          try{
            const page=await pdf.getPage(pageNumber);
            let hasImages=true;
            try{
              const op=await page.getOperatorList();
              const ops=pdfjs.OPS||{};
              const imageFns=[ops.paintImageXObject,ops.paintInlineImageXObject,ops.paintImageMaskXObject].filter(function(v){return v!==undefined});
              hasImages=imageFns.length?op.fnArray.some(function(fn){return imageFns.includes(fn)}):true;
            }catch{}
            if(!hasImages){skipped+=byPage[pageKey].length;continue}
            const viewport=page.getViewport({scale:1.5});
            const canvas=document.createElement("canvas");
            canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
            const ctx=canvas.getContext("2d",{alpha:false});
            await page.render({canvasContext:ctx,viewport}).promise;
            for(const item of byPage[pageKey]){
              try{
                const centerY=viewport.height-(Number(item.pdf_y)||0)*1.5;
                const halfH=Math.max(24,Number(item.pdf_radius||22))*1.5+18;
                const y=Math.max(0,Math.round(centerY-halfH));
                const h=Math.min(canvas.height-y,Math.round(halfH*2));
                if(h<20){skipped++;continue}
                const crop=document.createElement("canvas");
                crop.width=canvas.width;crop.height=h;
                crop.getContext("2d",{alpha:false}).drawImage(canvas,0,y,canvas.width,h,0,0,crop.width,h);
                const blob=await new Promise(function(resolve){crop.toBlob(resolve,"image/jpeg",0.78)});
                if(!blob){skipped++;continue}
                const file=new File([blob],"pdf-product-"+pageNumber+"-"+Math.random().toString(36).slice(2)+".jpg",{type:"image/jpeg"});
                let q=S.from("marc_inventory").select("id,image_url").eq("user_id",st.u.id).eq("name",item.name).limit(1);
                if(item.sku)q=q.eq("sku",item.sku);else q=q.is("sku",null);
                const found=(await q).data?.[0];
                if(!found||found.image_url){skipped++;continue}
                const uploaded=await uploadInventoryPhoto(file,found.id,null);
                const upd=await S.from("marc_inventory").update({image_url:uploaded.url,updated_at:new Date().toISOString()}).eq("id",found.id).eq("user_id",st.u.id);
                if(upd.error){skipped++;continue}
                attached++;
              }catch{skipped++}
            }
          }catch{skipped+=byPage[pageKey].length}
        }
        return {attached,skipped};
      }

      btn.onclick=async function(){
        if(btn.dataset.importing==="1"||!btn.dataset.ready)return;
        btn.dataset.importing="1";
        btn.disabled=true;
        status.className="msg";
        status.textContent="Importando "+listItems.length+" productos directamente al inventario…";

        try{
          const {data,error}=await S.rpc("marc_import_inventory_batch",{
            p_items:listItems,
            p_update_existing:true
          });
          if(error)throw new Error(error.message||"No se pudo importar el lote.");
          if(!data||data.status!=="IMPORTED")throw new Error("Supabase no confirmó la importación.");
          const photoResult=await attachPdfProductPhotos();

          toast("Importación completa: "+data.total+" procesados, "+data.created+" nuevos, "+data.updated+" actualizados, "+(data.reactivated||0)+" reactivados · "+photoResult.attached+" fotos asociadas.","ok");
          status.className="msg ok";
          status.textContent="Importación completada. "+data.total+" productos procesados.";
          close();
          await trial();
          await inventory();
        }catch(err){
          status.className="msg error";
          status.textContent=err.message||"No se pudo importar.";
          btn.disabled=false;
        }finally{
          btn.dataset.importing="";
        }
      };
    }catch(err){
      status.className="msg error";
      status.textContent=err.message||"No se pudo analizar el catálogo.";
      $("#pdfImportProgress").innerHTML="";
      working=false;
      btn.type="submit";
      btn.disabled=false;
    }
  };
}




async function inventoryPhotosBulkModal(){
  let files=[];
  let results=[];
  const close=modal(
    '<div class="modal-head"><div><h2>📷 Subir productos por fotos</h2><p>Toma varias fotos de cajas y M.A.R.C. identifica cada producto.</p></div><button class="close" id="x">×</button></div>'+
    '<label>Fotos de las cajas<input id="bulkProductPhotos" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple></label>'+
    '<small>Puedes seleccionar varias fotos. Para productos iguales, M.A.R.C. intentará detectar el mismo producto y sus números de serie.</small>'+
    '<div id="bulkPhotoStatus" class="msg"></div>'+
    '<div id="bulkPhotoResults" class="serial-results"></div>'+
    '<div class="modal-actions"><button type="button" class="secondary" id="cancel">Cancelar</button><button type="button" class="primary" id="saveBulkPhotos" disabled>Guardar productos</button></div>'
  );
  $("#x").onclick=close;$("#cancel").onclick=close;
  const input=$("#bulkProductPhotos"),status=$("#bulkPhotoStatus"),list=$("#bulkPhotoResults"),save=$("#saveBulkPhotos");

  function render(){
    list.innerHTML=results.map(function(r,i){
      return '<div class="serial-row"><div class="inventory-thumb">'+(r.preview?'<img src="'+r.preview+'" alt="Caja">':'📦')+'</div><div class="serial-main"><b>Foto '+(i+1)+'</b><div>'+esc(r.name||"Producto sin identificar")+'</div><small>'+esc([r.sku,r.brand,r.model,r.serial_number].filter(Boolean).join(" · ")||"Revisa los datos")+'</small></div><div class="serial-input"><label>Precio<input data-price-index="'+i+'" type="number" min="0" step="0.01" value="'+(r.price??"")+'" placeholder="S/"></label><label>Serie<input data-serial-index="'+i+'" value="'+esc(r.serial_number||"")+'" placeholder="Opcional"></label></div></div>';
    }).join("");
    save.disabled=!results.length||results.some(function(r){return !String(r.name||"").trim()||r.price===null||r.price===undefined||Number(r.price)<0});
  }

  input.onchange=async function(){
    files=[].slice.call(input.files||[]);
    results=[];render();
    if(!files.length)return;
    status.className="msg";status.textContent="Analizando "+files.length+" fotos…";
    for(let i=0;i<files.length;i++){
      try{
        const blob=await optimizeProductImage(files[i]);
        const preview=URL.createObjectURL(blob);
        const p=await analyzeProductBoxPhoto(files[i],status);
        results.push({name:p.name||"",sku:p.sku||"",brand:p.brand||"",model:p.model||"",category:p.category||"",serial_number:p.serial_number||"",price:"",preview:preview});
      }catch(err){
        results.push({name:"",sku:"",brand:"",model:"",category:"",serial_number:"",price:"",preview:null,error:err.message||"Error"});
      }
      render();
      status.textContent="Analizadas "+(i+1)+" de "+files.length+" fotos.";
    }
    status.textContent="Listo. Revisa nombre, serie y coloca el precio.";
  };

  list.oninput=function(e){
    const priceEl=e.target.closest("input[data-price-index]");
    const serialEl=e.target.closest("input[data-serial-index]");
    if(priceEl){results[Number(priceEl.dataset.priceIndex)].price=Number(priceEl.value);}
    if(serialEl){results[Number(serialEl.dataset.serialIndex)].serial_number=serialEl.value.trim();}
    render();
  };

  save.onclick=async function(){
    save.disabled=true;
    try{
      const groups={};
      results.forEach(function(r){const key=[r.name,r.sku,r.brand,r.model].map(function(v){return String(v||"").toLowerCase().trim()}).join("|");(groups[key]||(groups[key]=[])).push(r)});
      let created=0,units=0;

      for(const key of Object.keys(groups)){
        const group=groups[key], first=group[0];
        let q=S.from("marc_inventory").select("id,image_url,stock,price").eq("user_id",st.u.id).eq("active",true).limit(1);
        if(first.sku)q=q.eq("sku",first.sku);else q=q.is("sku",null);
        q=q.eq("name",first.name||"").limit(1);
        const existing=(await q).data?.[0];
        let productId=existing?.id;

        if(!productId){
          const ins=await S.from("marc_inventory").insert({
            user_id:st.u.id,sku:first.sku||null,name:first.name,brand:first.brand||null,model:first.model||null,
            category:first.category||null,unit:"UND",cost:0,price:Number(first.price||0),stock:0,min_stock:0,image_url:null,active:true
          }).select("id").single();
          if(ins.error)throw ins.error;
          productId=ins.data.id;created++;
        }else if(Number(existing.price||0)===0){
          const up=await S.from("marc_inventory").update({price:Number(first.price||0),updated_at:new Date().toISOString()}).eq("id",productId).eq("user_id",st.u.id);
          if(up.error)throw up.error;
        }

        const serialized=group.every(function(r){return String(r.serial_number||"").trim()});
        if(serialized){
          const items=[];
          for(const r of group){
            const idx=results.indexOf(r);
            const up=await uploadInventoryPhoto(files[idx],productId,null);
            items.push({serial_number:String(r.serial_number).trim(),image_url:up.url});
          }
          const rpc=await S.rpc("marc_save_inventory_instances",{p_inventory_id:productId,p_instances:items});
          if(rpc.error)throw rpc.error;
          units+=Number(rpc.data?.inserted||0);
        }else{
          const qty=group.length;
          const photoFile=files[results.indexOf(first)];
          const up=await uploadInventoryPhoto(photoFile,productId,existing?.image_url||null);
          const upd=await S.from("marc_inventory").update({
            image_url:up.url,
            stock:Number(existing?.stock||0)+qty,
            updated_at:new Date().toISOString()
          }).eq("id",productId).eq("user_id",st.u.id);
          if(upd.error)throw upd.error;
          units+=qty;
        }
      }

      close();
      toast("Fotos procesadas: "+results.length+" fotos · "+created+" productos nuevos · "+units+" unidades","ok");
      await inventory();
    }catch(err){
      status.className="msg error";status.textContent=err.message||"No se pudieron guardar las fotos.";
      save.disabled=false;
    }
  };
  render();
}

async function inventorySerialsModal(x){
  let files=[];
  let results=[];
  let existing=[];
  const close=modal(
    '<div class="modal-head"><div><h2>Unidades y números de serie</h2><p>'+esc(x.name)+' · stock actual: '+Number(x.stock||0)+'</p></div><button class="close" id="x">×</button></div>'+
    '<div class="serial-product-summary"><div class="inventory-photo-preview">'+(x.image_url?'<img src="'+esc(x.image_url)+'" alt="Producto">':'<span>📦</span>')+'</div><div><b>'+esc(x.name)+'</b><br><small>Precio: '+money(x.price)+'</small><br><small>Stock serializado: cada unidad queda identificada individualmente.</small></div></div>'+
    '<div class="serial-existing"><div style="display:flex;justify-content:space-between;gap:8px"><b>Series registradas</b><span id="existingSerialCount">0</span></div><div id="existingSerialsList" class="serial-existing-list"><div class="empty">Cargando…</div></div></div>'+
    '<hr>'+
    '<label>Fotografías de nuevas cajas<input id="serialPhotos" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple></label>'+
    '<small>Puedes seleccionar varias fotos de una vez. M.A.R.C. analizará cada caja y detectará el serial si aparece visible.</small>'+
    '<div id="serialStatus" class="msg"></div>'+
    '<div id="serialResults" class="serial-results"></div>'+
    '<div class="modal-actions"><button type="button" class="secondary" id="cancel">Cerrar</button><button type="button" class="primary" id="saveSerials" disabled>Guardar unidades</button></div>'
  );
  $("#x").onclick=close;$("#cancel").onclick=close;
  const input=$("#serialPhotos"),status=$("#serialStatus"),list=$("#serialResults"),save=$("#saveSerials");
  const existingList=$("#existingSerialsList"),existingCount=$("#existingSerialCount");

  function renderExisting(){
    existingCount.textContent=String(existing.length);
    existingList.innerHTML=existing.length?existing.map(function(r,i){
      return '<div class="serial-existing-row"><span>'+(i+1)+'</span><b>'+esc(r.serial_number)+'</b><small>'+esc(r.status||"IN_STOCK")+'</small></div>';
    }).join(""):'<div class="empty">No hay números de serie registrados todavía.</div>';
  }
  async function loadExisting(){
    const r=await S.from("marc_inventory_instances").select("id,serial_number,status,image_url,created_at").eq("user_id",st.u.id).eq("inventory_id",x.id).order("created_at",{ascending:true});
    if(r.error)throw r.error;
    existing=r.data||[];
    renderExisting();
  }
  function render(){
    list.innerHTML=results.map(function(r,i){
      return '<div class="serial-row"><div class="inventory-thumb">'+(r.preview?'<img src="'+r.preview+'" alt="Caja">':'📦')+'</div><div class="serial-main"><b>Nueva unidad '+(i+1)+'</b><div>'+esc(r.name||x.name)+'</div><small>SKU: '+esc(r.sku||x.sku||"—")+'</small></div><div class="serial-input"><label>Serie<input data-serial-index="'+i+'" value="'+esc(r.serial_number||"")+'" placeholder="Número de serie"></label><small>'+esc(r.note||"")+'</small></div></div>';
    }).join("");
    save.disabled=!results.length||results.some(function(r){return !String(r.serial_number||"").trim()});
  }

  try{await loadExisting()}catch(err){existing=[];renderExisting();status.className="msg error";status.textContent="No se pudieron cargar las series existentes: "+(err.message||"error")}

  input.onchange=async function(){
    files=[].slice.call(input.files||[]);
    results=[];render();
    if(!files.length)return;
    status.className="msg";status.textContent="Analizando "+files.length+" caja(s)…";
    for(let i=0;i<files.length;i++){
      try{
        const blob=await optimizeProductImage(files[i]);
        const preview=URL.createObjectURL(blob);
        const p=await analyzeProductBoxPhoto(files[i],status);
        results.push({name:p.name||x.name,sku:p.sku||x.sku,serial_number:p.serial_number||"",preview:preview,note:p.serial_number?"Serial detectado":"No se detectó serial; escríbelo manualmente."});
      }catch(err){
        results.push({name:x.name,sku:x.sku,serial_number:"",preview:null,note:"No se pudo analizar: "+(err.message||"error")});
      }
      render();
      status.textContent="Analizadas "+(i+1)+" de "+files.length+" cajas.";
    }
    const detected=results.filter(function(r){return r.serial_number}).length;
    status.textContent="Listo: "+results.length+" cajas; "+detected+" seriales detectados. Revisa antes de guardar.";
  };

  list.oninput=function(e){
    const el=e.target.closest("input[data-serial-index]");
    if(!el)return;
    const idx=Number(el.dataset.serialIndex);
    if(results[idx])results[idx].serial_number=el.value.trim();
    save.disabled=!results.length||results.some(function(r){return !String(r.serial_number||"").trim()});
  };

  save.onclick=async function(){
    const items=results.map(function(r){return {serial_number:String(r.serial_number||"").trim(),image_url:null}});
    const serials=items.map(function(r){return r.serial_number.toLowerCase()});
    const existingSerials=existing.map(function(r){return String(r.serial_number||"").toLowerCase()});
    if(new Set(serials).size!==serials.length)return toast("Hay números de serie repetidos entre las nuevas unidades.","err");
    const duplicateExisting=serials.find(function(serial){return existingSerials.includes(serial)});
    if(duplicateExisting)return toast("El número de serie "+duplicateExisting+" ya está registrado.","err");
    save.disabled=true;status.textContent="Guardando "+items.length+" unidades…";
    try{
      for(let i=0;i<results.length;i++){
        const uploaded=await uploadInventoryPhoto(files[i],x.id,null);
        items[i].image_url=uploaded.url;
      }
      const rpc=await S.rpc("marc_save_inventory_instances",{p_inventory_id:x.id,p_instances:items});
      if(rpc.error)throw rpc.error;
      const d=rpc.data||{};
      close();toast("Se agregaron "+Number(d.inserted||0)+" unidades. Stock actual: "+Number(d.stock||0),"ok");await inventory();
    }catch(err){
      status.className="msg error";status.textContent=err.message||"No se pudieron guardar las unidades.";save.disabled=false;
    }
  };
  render();
}

async function inventory(){
  S.from("marc_inventory").select("*").eq("user_id",st.u.id).eq("active",true).order("name").then(({data,error})=>{
    if(error)return toast(error.message,"err");
    const c=$("#content");
    c.innerHTML=`<div class="head"><div><div class="eyebrow2">INVENTARIO</div><h1>Productos + stock.</h1><p>Todo producto vive dentro del inventario.</p></div><div style="display:flex;gap:7px;flex-wrap:wrap"><button id="photos" class="secondary">📷 Subir por fotos</button><button id="importPdf" class="secondary">📄 Importar PDF</button><button id="new" class="primary">＋ Nuevo producto</button></div></div><section class="card table"><div class="toolbar"><div class="search"><input id="search" placeholder="Buscar producto…"></div><div style="display:flex;gap:7px;flex-wrap:wrap"><button id="selectAll" class="secondary" type="button">☐ Seleccionar todos</button><button id="bulkDelete" class="danger" type="button" disabled>Eliminar seleccionados <span id="selectedCount">0</span></button><button id="ask" class="secondary">Preguntar</button></div></div><div class="scroll"><table class="data"><thead><tr><th style="width:42px;text-align:center"><input id="selectAllHead" type="checkbox" aria-label="Seleccionar todos los productos"></th><th>Producto</th><th>Marca/modelo</th><th>Stock</th><th>Precio</th><th>Estado</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></section>`;

    const rows=$("#rows");
    const selected=new Set();

    const visibleData=()=>{const q=String($("#search")?.value||"").toLowerCase();return (data||[]).filter(x=>[x.name,x.sku,x.brand,x.model,x.category].some(v=>String(v||"").toLowerCase().includes(q)));};

    const syncSelectionUi=()=>{
      const visible=visibleData();
      const checkedVisible=visible.filter(x=>selected.has(x.id)).length;
      const allVisible=visible.length>0&&checkedVisible===visible.length;
      const head=$("#selectAllHead");
      if(head){head.checked=allVisible;head.indeterminate=checkedVisible>0&&!allVisible;}
      $("#selectedCount").textContent=selected.size;
      $("#bulkDelete").disabled=selected.size===0;
      $("#selectAll").textContent=allVisible?"☑ Quitar selección":"☐ Seleccionar todos";
    };

    const draw=list=>{
      rows.innerHTML=(list||[]).map(x=>{
        const stock=Number(x.stock),min=Number(x.min_stock),cls=stock<=0?"out":stock<=min?"low":"ok";
        return `<tr><td style="text-align:center"><input class="inventory-check" type="checkbox" data-id="${x.id}" ${selected.has(x.id)?"checked":""} aria-label="Seleccionar ${esc(x.name)}"></td><td><b>${esc(x.name)}</b><br><small>${esc(x.sku||"Sin código")}</small></td><td>${esc([x.brand,x.model].filter(Boolean).join(" · ")||"—")}</td><td><b>${stock}</b> ${esc(x.unit)}</td><td>${money(x.price)}</td><td><span class="badge ${cls}">${stock<=0?"Agotado":stock<=min?"Bajo":"Disponible"}</span></td><td style="display:flex;gap:5px;flex-wrap:wrap"><button class="secondary" type="button" data-action="edit-inventory" data-id="${x.id}">Editar</button><button class="secondary" type="button" data-action="serials-inventory" data-id="${x.id}">📷 Series</button><button class="danger" type="button" data-action="delete-inventory" data-id="${x.id}">Eliminar</button></td></tr>`;
      }).join("")||'<tr><td colspan="7" class="empty">Agrega tu primer producto.</td></tr>';
      syncSelectionUi();
    };

    draw(data||[]);

    $("#search").oninput=e=>{draw(visibleData());};
    $("#photos").onclick=inventoryPhotosBulkModal;
    $("#new").onclick=()=>inventoryModal();
    $("#importPdf").onclick=inventoryPdfModal;
    $("#ask").onclick=openChat;

    $("#selectAll").onclick=()=>{
      const visible=visibleData();
      const allSelected=visible.length>0&&visible.every(x=>selected.has(x.id));
      if(allSelected)visible.forEach(x=>selected.delete(x.id));
      else visible.forEach(x=>selected.add(x.id));
      draw(visible);
    };

    $("#selectAllHead").onchange=e=>{
      const visible=visibleData();
      if(e.target.checked)visible.forEach(x=>selected.add(x.id));
      else visible.forEach(x=>selected.delete(x.id));
      draw(visible);
    };

    rows.onchange=e=>{
      const cb=e.target.closest(".inventory-check");
      if(!cb)return;
      if(cb.checked)selected.add(cb.dataset.id);
      else selected.delete(cb.dataset.id);
      syncSelectionUi();
    };

    $("#bulkDelete").onclick=async()=>{
      const ids=[...selected];
      if(!ids.length)return;
      const chosen=(data||[]).filter(x=>ids.includes(x.id));
      const preview=chosen.slice(0,5).map(x=>x.name).join(", ");
      const extra=chosen.length>5?" …":"";
      if(!confirm("¿Eliminar "+ids.length+" producto(s) del inventario?\n\n"+preview+extra+"\n\nDejarán de aparecer del inventario activo, pero se conservarán para el historial."))return;

      const b=$("#bulkDelete");
      b.disabled=true;
      try{
        const result=await S.from("marc_inventory")
          .update({active:false,updated_at:new Date().toISOString()})
          .in("id",ids)
          .eq("user_id",st.u.id);
        if(result.error)throw result.error;
        selected.clear();
        toast(ids.length+" producto(s) eliminado(s) del inventario","ok");
        await inventory();
      }catch(err){
        toast(err.message||"No se pudieron eliminar los productos seleccionados.","err");
        b.disabled=false;
      }
    };

    rows.onclick=async e=>{
      const b=e.target.closest("button[data-action]"); if(!b)return;
      const item=(data||[]).find(x=>x.id===b.dataset.id); if(!item)return;
      if(b.dataset.action==="edit-inventory")return inventoryModal(item);
      if(b.dataset.action==="serials-inventory")return inventorySerialsModal(item);
      if(b.dataset.action==="delete-inventory"){
        if(!confirm("¿Eliminar \""+item.name+"\" del inventario?\n\nDejará de aparecer del inventario activo, pero se conservará el registro para el historial."))return;
        b.disabled=true;
        try{
          const result=await S.from("marc_inventory").update({active:false,updated_at:new Date().toISOString()}).eq("id",item.id).eq("user_id",st.u.id);
          if(result.error)throw result.error;
          toast("Producto eliminado del inventario","ok");
          await inventory();
        }catch(err){
          toast(err.message||"No se pudo eliminar el producto.","err");
          b.disabled=false;
        }
      }
    };
  });
}
async function extractPdfCatalogRows(page){
  try{
    const content=await page.getTextContent({normalizeWhitespace:true,disableCombineTextItems:false});
    const items=(content.items||[]).map(item=>({
      text:String(item.str||"").replace(/\s+/g," ").trim(),
      x:Number(item.transform?.[4]||0),
      y:Number(item.transform?.[5]||0)
    })).filter(x=>x.text);

    const width=page.view?.[2]||page.getViewport({scale:1}).width||595;
    const prices=items
      .filter(x=>x.x>width*.74 && /^\d+(?:[.,]\d{1,2})$/.test(x.text.replace(/[^\d.,]/g,"")))
      .map(x=>({...x,price:Number(x.text.replace(",","."))}))
      .sort((a,b)=>b.y-a.y);

    if(!prices.length)return {rows:[],text:items.map(x=>x.text).join("\n"),usedLocal:false};

    const rows=[];
    for(let i=0;i<prices.length;i++){
      const p=prices[i];
      const prev=prices[i-1],next=prices[i+1];
      const gapPrev=prev?Math.abs(prev.y-p.y):Math.abs(p.y-(next?.y||p.y));
      const gapNext=next?Math.abs(p.y-next.y):gapPrev;
      const radius=Math.max(13,Math.min(28,Math.min(gapPrev||20,gapNext||20)*.55));
      const rowItems=items.filter(x=>Math.abs(x.y-p.y)<=radius);

      const nameParts=rowItems
        .filter(x=>x.x<width*.34 && Math.abs(x.y-p.y)<=radius)
        .sort((a,b)=>Math.abs(a.y-p.y)-Math.abs(b.y-p.y)||a.x-b.x)
        .map(x=>x.text);

      const codeParts=rowItems
        .filter(x=>x.x>=width*.32 && x.x<width*.74)
        .sort((a,b)=>Math.abs(a.y-p.y)-Math.abs(b.y-p.y)||a.x-b.x)
        .map(x=>x.text);

      const name=[...new Set(nameParts)].join(" ").replace(/\s+/g," ").trim();
      const codeText=[...new Set(codeParts)].join(" ").replace(/\s+/g," ").trim();
      if(!name)return;

      const skuMatch=codeText.match(/\b(?:[A-Z]{1,6})-[A-Z0-9]{1,12}\b/i);
      const sku=skuMatch?.[0]||null;
      const variant=codeText.replace(skuMatch?.[0]||"","").replace(/\s+/g," ").trim();
      const fullName=[name,variant].filter(Boolean).join(" ").replace(/\s+/g," ").trim();

      rows.push({
        sku,
        name:fullName.slice(0,180),
        brand:null,
        model:sku,
        category:name.slice(0,100),
        unit:"UND",
        cost:null,
        price:p.price,
        stock:null,
        min_stock:null
      });
    }

    // One product per price cell: preserve page order and remove exact duplicates only.
    const clean=[],seen=new Set();
    for(const row of rows){
      const key=((row.sku||"")+"|"+row.name+"|"+row.price).toLowerCase();
      if(seen.has(key))continue;
      seen.add(key);clean.push(row);
    }
    return {rows:clean,text:items.map(x=>x.text).join("\n"),usedLocal:clean.length>0};
  }catch{
    return {rows:[],text:"",usedLocal:false};
  }
}

async function extractPdfPageText(page){
  try{
    const content=await page.getTextContent({normalizeWhitespace:true,disableCombineTextItems:false});
    return (content.items||[]).map(x=>String(x.str||"").trim()).filter(Boolean).join("\n");
  }catch{return ""}
}

function pdfProgressHtml(page,total,count){
  const pct=total?Math.round(page*100/total):0;
  return '<div class="pdf-progress-wrap">'+
    '<div class="pdf-progress-top"><b id="pdfProgressText">Leyendo página '+page+' de '+total+'</b><strong id="pdfProgressCount">'+count+' productos detectados</strong></div>'+
    '<div class="pdf-progress"><i id="pdfProgressBar" style="width:'+pct+'%"></i></div>'+
    '</div>';
}

async function inventoryPdfModal(){
  const close=modal(
    '<div class="modal-head"><div><h2>📄 Importar inventario desde PDF</h2><p>M.A.R.C. lee el catálogo página por página y detecta los productos antes de importarlos.</p></div><button class="close" id="x">×</button></div>'+
    '<form id="pdfInventoryForm">'+
    '<label>Catálogo PDF<input id="inventoryPdfFile" type="file" accept="application/pdf" required></label>'+
    '<div class="pdf-import-hint">Hasta 20 MB. Para catálogos con tablas de texto, M.A.R.C. hace la lectura directamente en el dispositivo para mayor velocidad y precisión.</div>'+
    '<div id="pdfImportStatus" class="msg"></div>'+
    '<div id="pdfImportProgress"></div>'+
    '<div id="pdfLiveItems" class="pdf-live-items hidden"></div>'+
    '<div id="pdfImportPreview" class="pdf-import-preview hidden"></div>'+
    '<div class="modal-actions"><button type="button" class="secondary" id="cancel">Cancelar</button><button type="submit" class="primary" id="analyzePdf">Analizar catálogo</button></div>'+
    '</form>'
  );
  $("#x").onclick=close;
  $("#cancel").onclick=close;

  const form=$("#pdfInventoryForm");
  const btn=$("#analyzePdf");
  const status=$("#pdfImportStatus");
  let working=false;

  form.onsubmit=async function(e){
    e.preventDefault();
    if(working)return;

    const file=$("#inventoryPdfFile").files?.[0];
    if(!file)return toast("Selecciona un PDF.","err");
    if(file.size>20*1024*1024)return toast("El PDF supera el límite de 20 MB.","err");

    working=true;
    btn.disabled=true;
    status.className="msg";
    status.textContent="Abriendo el catálogo y contando páginas…";
    $("#pdfImportPreview").classList.add("hidden");
    $("#pdfLiveItems").classList.add("hidden");

    try{
      const pdfjs=await ensurePdfJs();
      if(!pdfjs.GlobalWorkerOptions.workerSrc){
        pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      }

      const buffer=await file.arrayBuffer();
      const pdf=await pdfjs.getDocument({data:buffer}).promise;
      const totalPages=pdf.numPages;

      status.textContent="Catálogo abierto. Procesando "+totalPages+" páginas…";
      $("#pdfImportProgress").innerHTML=pdfProgressHtml(0,totalPages,0);

      let pendingId=null;
      let pendingPromise=null;
      const ensurePendingId=async()=>{
        if(pendingId)return pendingId;
        if(pendingPromise)return pendingPromise;
        pendingPromise=fetch("/api/inventory/pdf-start",{
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            Authorization:"Bearer "+st.session?.access_token
          },
          body:JSON.stringify({filename:file.name,totalPages})
        }).then(async response=>{
          const data=await response.json();
          if(!response.ok)throw new Error(data.message||data.error||"No se pudo iniciar el análisis avanzado.");
          if(!data.pendingId)throw new Error("No se pudo crear la sesión de análisis avanzado.");
          pendingId=data.pendingId;
          return pendingId;
        }).finally(()=>{pendingPromise=null});
        return pendingPromise;
      };

      const detected=[];
      const live=$("#pdfLiveItems");
      live.classList.remove("hidden");
      live.innerHTML='<div class="pdf-live-title">Productos detectados hasta ahora</div><div id="pdfLiveRows"></div>';
      const liveRows=$("#pdfLiveRows");

      const CONCURRENCY=4;
      for(let batchStart=1;batchStart<=totalPages;batchStart+=CONCURRENCY){
        const batch=[];
        for(let p=0;p<CONCURRENCY&&batchStart+p<=totalPages;p++)batch.push(batchStart+p);

        status.textContent="M.A.R.C. está leyendo páginas "+batch[0]+"–"+batch[batch.length-1]+" de "+totalPages+"…";
        $("#pdfProgressText").textContent="Leyendo páginas "+batch[0]+"–"+batch[batch.length-1]+" de "+totalPages;
        $("#pdfProgressCount").textContent=detected.length+" productos detectados";
        $("#pdfProgressBar").style.width=Math.round((batch[0]-1)*100/totalPages)+"%";

        const results=await Promise.all(batch.map(async pageNumber=>{
          const page=await pdf.getPage(pageNumber);
          const local=await extractPdfCatalogRows(page);

          if(local.usedLocal && local.rows.length){
            return {pageNumber,items:local.rows,mode:"LECTURA DIRECTA"};
          }

          // Solo los PDFs sin tabla de texto utilizan Gemini.
          const pendingForPage=await ensurePendingId();
          const text=local.text||await extractPdfPageText(page);
          let image="";
          let viewport=page.getViewport({scale:1.25});
          if(viewport.width>1600)viewport=page.getViewport({scale:1.25*(1600/viewport.width)});
          const canvas=document.createElement("canvas");
          const ctx=canvas.getContext("2d",{alpha:false});
          canvas.width=Math.ceil(viewport.width);
          canvas.height=Math.ceil(viewport.height);
          await page.render({canvasContext:ctx,viewport}).promise;
          image=canvas.toDataURL("image/jpeg",0.72);

          let analyzed=null,lastError=null;
          for(let retry=0;retry<2;retry++){
            try{
              const pr=await fetch("/api/inventory/pdf-page",{
                method:"POST",
                headers:{
                  "Content-Type":"application/json",
                  Authorization:"Bearer "+st.session?.access_token
                },
                body:JSON.stringify({pendingId:pendingForPage,pageNumber,totalPages,text,image})
              });
              const pj=await pr.json();
              if(!pr.ok)throw new Error(pj.message||pj.error||("No se pudo analizar la página "+pageNumber));
              analyzed=pj;
              break;
            }catch(err){
              lastError=err;
              if(retry===0)status.textContent="Reintentando página "+pageNumber+"…";
            }
          }
          if(!analyzed)throw new Error((lastError?.message||"No se pudo analizar la página")+" Revisa tu conexión.");
          return {pageNumber,items:Array.isArray(analyzed.items)?analyzed.items:[],mode:analyzed.mode||"GEMINI"};
        }));

        results.sort((a,b)=>a.pageNumber-b.pageNumber);
        for(const result of results){
          const pageNumber=result.pageNumber;
          const pageItems=result.items;
          detected.push(...pageItems);
          const recent=pageItems.slice(0,12).map((x,ix)=>'<div class="pdf-live-row"><span>P'+pageNumber+' · '+(ix+1)+'</span><b>'+esc(x.name)+'</b><small>'+esc([x.brand,x.model,x.sku].filter(Boolean).join(" · ")||"Sin código")+'</small></div>').join("");
          liveRows.insertAdjacentHTML("beforeend",recent);
        }

        const done=Math.min(batchStart+batch.length-1,totalPages);
        $("#pdfProgressText").textContent="Leídas páginas "+done+" de "+totalPages;
        $("#pdfProgressCount").textContent=detected.length+" productos detectados";
        $("#pdfProgressBar").style.width=Math.round(done*100/totalPages)+"%";
      }

      status.className="msg ok";
      status.textContent="Análisis terminado. Revisa exactamente qué productos serán procesados antes de importarlos.";
      $("#pdfProgressText").textContent="Lectura terminada · "+totalPages+" páginas";
      $("#pdfProgressCount").textContent=detected.length+" productos detectados";

      const listItems=detected;
      const preview=$("#pdfImportPreview");
      preview.innerHTML=
        '<div class="pdf-final-summary"><strong>Se procesarán '+listItems.length+' productos</strong><span>'+totalPages+' páginas revisadas</span></div>'+
        '<div class="pdf-product-list">'+
          listItems.map((x,i)=>'<div class="pdf-product-row"><span><b>'+(i+1)+'.</b> '+esc(x.name)+'</span><small>Página '+Number(x.page_number||1)+' · '+esc([x.sku,x.brand,x.model].filter(Boolean).join(" · ")||"Sin código")+(x.price!=null?" · S/ "+Number(x.price).toFixed(2):"")+'</small></div>').join("")+
        '</div>';
      preview.classList.remove("hidden");

      btn.type="button";
      btn.disabled=false;
      btn.textContent="Importar "+listItems.length+" productos";
      btn.dataset.ready="1";
      btn.onclick=async function(){
        if(btn.dataset.importing==="1"||!btn.dataset.ready)return;
        btn.dataset.importing="1";
        btn.disabled=true;
        status.className="msg";
        status.textContent="Importando "+listItems.length+" productos directamente al inventario…";

        try{
          const {data,error}=await S.rpc("marc_import_inventory_batch",{
            p_items:listItems,
            p_update_existing:true
          });
          if(error)throw new Error(error.message||"No se pudo importar el lote.");
          if(!data||data.status!=="IMPORTED")throw new Error("Supabase no confirmó la importación.");

          toast("Inventario actualizado: "+data.created+" nuevos, "+data.updated+" actualizados.","ok");
          status.className="msg ok";
          status.textContent="Importación completada. "+data.total+" productos procesados.";
          close();
          await trial();
          await inventory();
        }catch(err){
          status.className="msg error";
          status.textContent=err.message||"No se pudo importar.";
          btn.disabled=false;
        }finally{
          btn.dataset.importing="";
        }
      };
    }catch(err){
      status.className="msg error";
      status.textContent=err.message||"No se pudo analizar el catálogo.";
      $("#pdfImportProgress").innerHTML="";
      working=false;
      btn.type="submit";
      btn.disabled=false;
    }
  };
}


async function inventory(){
  S.from("marc_inventory").select("*").eq("user_id",st.u.id).eq("active",true).order("name").then(({data,error})=>{
    if(error)return toast(error.message,"err");
    const c=$("#content");
    c.innerHTML=`<div class="head"><div><div class="eyebrow2">INVENTARIO</div><h1>Productos + stock.</h1><p>Todo producto vive dentro del inventario.</p></div><div style="display:flex;gap:7px;flex-wrap:wrap"><button id="importPdf" class="secondary">📄 Importar PDF</button><button id="new" class="primary">＋ Nuevo producto</button></div></div>
    <section class="card table">
      <div class="toolbar"><div class="search"><input id="search" placeholder="Buscar producto…"></div><button id="ask" class="secondary">Preguntar</button></div>
      <div id="bulkBar" class="bulk-bar" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 0 10px;padding:10px 12px;border:1px solid #d7e5f7;border-radius:12px;background:#f7fbff">
        <div style="display:flex;align-items:center;gap:10px"><label style="display:flex;align-items:center;gap:8px;font-weight:800;cursor:pointer"><input id="selectAll" type="checkbox"> Seleccionar todos</label><span id="selectedCount" style="font-weight:800;color:#1373e6">0 seleccionados</span></div>
        <button id="bulkDelete" class="danger" type="button" disabled>🗑 Eliminar seleccionados</button>
      </div>
      <div class="scroll"><table class="data"><thead><tr><th style="width:45px;text-align:center"></th><th>Foto</th><th>Producto</th><th>Marca/modelo</th><th>Stock</th><th>Precio</th><th>Estado</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
    </section>`;

    const rows=$("#rows"), selected=new Set();
    const currentList=()=>{const q=String($("#search").value||"").toLowerCase();return (data||[]).filter(x=>[x.name,x.sku,x.brand,x.model,x.category].some(v=>String(v||"").toLowerCase().includes(q)))};
    const sync=()=>{
      const visible=currentList(), checked=visible.filter(x=>selected.has(x.id)).length, all=visible.length>0&&checked===visible.length;
      const top=$("#selectAll"); if(top){top.checked=all;top.indeterminate=checked>0&&!all}
      $("#selectedCount").textContent=selected.size+" seleccionado"+(selected.size===1?"":"s");
      $("#bulkDelete").disabled=selected.size===0;
    };
    const draw=list=>{
      rows.innerHTML=(list||[]).map(x=>{
        const stock=Number(x.stock),min=Number(x.min_stock),cls=stock<=0?"out":stock<=min?"low":"ok";
        return `<tr><td style="text-align:center"><input class="inventory-check" type="checkbox" data-id="${x.id}" ${selected.has(x.id)?"checked":""}></td><td><div class="inventory-thumb">${x.image_url?'<img src="'+esc(x.image_url)+'" alt="Foto">':'<span>📷</span>'}</div></td><td><b>${esc(x.name)}</b><br><small>${esc(x.sku||"Sin código")}</small></td><td>${esc([x.brand,x.model].filter(Boolean).join(" · ")||"—")}</td><td><b>${stock}</b> ${esc(x.unit)}</td><td>${money(x.price)}</td><td><span class="badge ${cls}">${stock<=0?"Agotado":stock<=min?"Bajo":"Disponible"}</span></td><td style="display:flex;gap:5px;flex-wrap:wrap"><button class="secondary" type="button" data-action="edit-inventory" data-id="${x.id}">Editar</button><button class="danger" type="button" data-action="delete-inventory" data-id="${x.id}">Eliminar</button></td></tr>`;
      }).join("")||'<tr><td colspan="8" class="empty">Agrega tu primer producto.</td></tr>';
      sync();
    };
    draw(data||[]);

    $("#search").oninput=()=>draw(currentList());
    $("#new").onclick=()=>inventoryModal();
    $("#importPdf").onclick=inventoryPdfModal;
    $("#ask").onclick=openChat;

    $("#selectAll").onchange=e=>{
      const visible=currentList();
      if(e.target.checked)visible.forEach(x=>selected.add(x.id));else visible.forEach(x=>selected.delete(x.id));
      draw(visible);
    };
    rows.onchange=e=>{
      const cb=e.target.closest(".inventory-check"); if(!cb)return;
      if(cb.checked)selected.add(cb.dataset.id);else selected.delete(cb.dataset.id);
      sync();
    };

    $("#bulkDelete").onclick=async()=>{
      const ids=[...selected]; if(!ids.length)return;
      const chosen=(data||[]).filter(x=>ids.includes(x.id));
      if(!confirm("¿Eliminar "+ids.length+" producto(s) del inventario?\n\nLos productos desaparecerán del inventario activo, pero se conservarán para el historial."))return;
      const b=$("#bulkDelete"); b.disabled=true;
      try{
        const result=await S.from("marc_inventory").update({active:false,updated_at:new Date().toISOString()}).in("id",ids).eq("user_id",st.u.id);
        if(result.error)throw result.error;
        selected.clear();
        toast(ids.length+" producto(s) eliminado(s)","ok");
        await inventory();
      }catch(err){toast(err.message||"No se pudieron eliminar los productos seleccionados.","err");b.disabled=false}
    };

    rows.onclick=async e=>{
      const b=e.target.closest("button[data-action]"); if(!b)return;
      const item=(data||[]).find(x=>x.id===b.dataset.id); if(!item)return;
      if(b.dataset.action==="edit-inventory")return inventoryModal(item);
      if(b.dataset.action==="delete-inventory"){
        if(!confirm("¿Eliminar \""+item.name+"\" del inventario?\n\nEl producto desaparecerá del inventario activo, pero se conservará para el historial."))return;
        b.disabled=true;
        try{
          const result=await S.from("marc_inventory").update({active:false,updated_at:new Date().toISOString()}).eq("id",item.id).eq("user_id",st.u.id);
          if(result.error)throw result.error;
          toast("Producto eliminado","ok"); await inventory();
        }catch(err){toast(err.message||"No se pudo eliminar el producto.","err");b.disabled=false}
      }
    };
  });
}

async function quotes(){
  const {data,error}=await S.from("marc_quotes").select("*,marc_clients(name)").eq("user_id",st.u.id).is("deleted_at",null).order("created_at",{ascending:false});
  if(error)return toast(error.message,"err");
  const rows=data||[],c=$("#content");
  c.innerHTML=`<div class="head"><div><div class="eyebrow2">COTIZACIONES</div><h1>Convierte una orden en propuesta.</h1><p>Productos del inventario y trabajos escritos o dictados.</p></div><div style="display:flex;gap:7px;flex-wrap:wrap"><button id="aiNew" class="secondary">✦ Crear con IA</button><button id="new" class="primary">＋ Nueva cotización</button></div></div>
  <section class="card table"><div class="toolbar"><div class="search"><input id="search" placeholder="Buscar número, cliente o título…"></div><select id="statusFilter" class="secondary" style="min-width:130px"><option value="">Todos</option><option>BORRADOR</option><option>ENVIADA</option><option>ACEPTADA</option><option>RECHAZADA</option><option>ANULADA</option><option>COBRADA</option></select><button id="ask" class="secondary">Preguntar</button></div><div class="scroll"><table class="data"><thead><tr><th>Número</th><th>Cliente</th><th>Título</th><th>Estado</th><th>Total</th><th>Fecha</th><th></th></tr></thead><tbody id="qrows"></tbody></table></div></section>`;

  const body=$("#qrows");
  const draw=()=>{
    const q=($("#search").value||"").toLowerCase(),sf=$("#statusFilter").value;
    const list=rows.filter(x=>(!sf||x.status===sf)&&[x.number,x.title,x.marc_clients?.name].some(v=>String(v||"").toLowerCase().includes(q)));
    body.innerHTML=list.map(x=>`<tr><td><b>${esc(x.number)}</b></td><td>${esc(x.marc_clients?.name||"Sin cliente")}</td><td>${esc(x.title)}</td><td><span class="badge">${esc(x.status)}</span></td><td><b>${money(x.total)}</b></td><td>${new Date(x.created_at).toLocaleDateString("es-PE")}</td><td style="display:flex;gap:5px"><button type="button" class="secondary" data-action="open-quote" data-id="${x.id}">Abrir</button><button type="button" class="secondary" data-action="pdf-quote" data-id="${x.id}">PDF</button><button type="button" class="danger" data-action="delete-quote" data-id="${x.id}">Eliminar</button></td></tr>`).join("")||'<tr><td colspan="7" class="empty">No hay cotizaciones que coincidan.</td></tr>';
  };

  body.onclick=async e=>{
    const b=e.target.closest("button[data-action]");
    if(!b)return;
    const id=b.dataset.id;
    try{
      if(b.dataset.action==="open-quote"){
        const row=rows.find(x=>x.id===id);
        if(!row)return toast("No se encontró la cotización.","err");
        await quoteModal(row);
      }else if(b.dataset.action==="pdf-quote"){
        b.disabled=true;
        await downloadQuotePdf(id);
      }else if(b.dataset.action==="delete-quote"){
        const row=rows.find(x=>x.id===id);
        if(!row)return;
        if(row.status==="COBRADA")return toast("Una cotización cobrada no puede eliminarse. Usa ANULADA.","err");
        if(!confirm("¿Eliminar la cotización "+row.number+"?\n\nDesaparecerá del listado, pero se conservará el historial."))return;
        b.disabled=true;
        const result=await S.from("marc_quotes").update({deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id).eq("user_id",st.u.id);
        if(result.error)throw result.error;
        toast("Cotización eliminada","ok");
        await quotes();
      }
    }catch(err){
      toast(err?.message||"No se pudo completar la acción.","err");
    }finally{
      b.disabled=false;
    }
  };

  $("#new").onclick=()=>quoteModal();
  $("#aiNew").onclick=()=>aiQuoteModal();
  $("#ask").onclick=openChat;
  $("#search").oninput=draw;
  $("#statusFilter").onchange=draw;
  draw();
}

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
    const h={Authorization:"Bearer "+st.session?.access_token,"Content-Type":"application/json"};
    const setup=await fetch("/api/telegram/setup",{method:"POST",headers:h});
    const sj=await setup.json();
    if(!setup.ok)throw new Error(sj.message||sj.error||"No se pudo activar el webhook de Telegram.");
    const r=await fetch("/api/telegram/link",{method:"POST",headers:h});
    const j=await r.json();
    if(!r.ok)throw new Error(j.message||j.error||"No se pudo generar el enlace.");
    if(j.deepLink){
      window.location.href=j.deepLink;
      toast("Telegram listo. Abriendo el bot…","ok");
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
  const hook=s.webhook;
  const hookError=hook?.last_error_message||hook?.error||"";
  const hookOk=Boolean(hook?.url)&&!hookError;
  let html="";
  if(s.linked){
    html+='<span class="badge ok">Conectado</span><small>Telegram comparte tu cuenta, datos, suscripción y límites de M.A.R.C.</small>';
  }else{
    html+='<span class="badge">No conectado</span><small>Conéctalo una sola vez. No tendrás que pagar otra suscripción.</small>';
  }
  if(hook){
    html+=hookOk
      ? '<small class="telegram-debug">Webhook activo · pendientes: '+Number(hook.pending_update_count||0)+'</small>'
      : '<small class="telegram-debug error">Webhook: '+esc(hookError||"no configurado")+'</small>';
  }
  box.innerHTML=html;
  if(s.linked){if(connect)connect.classList.add("hidden");if(unlink)unlink.classList.remove("hidden")}
  else{if(connect)connect.classList.remove("hidden");if(unlink)unlink.classList.add("hidden")}
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
async function getCompanyProfile(){
  try{
    const r=await fetch("/api/company/profile",{headers:{Authorization:"Bearer "+st.session?.access_token}});
    const j=await r.json();
    if(!r.ok)throw new Error(j.message||j.error||"No se pudo cargar la empresa.");
    return j.profile||{};
  }catch(e){return {error:e.message||"No se pudo cargar la empresa."}}
}
function resizeLogo(file){
  return new Promise((resolve,reject)=>{
    if(!file||!file.type.startsWith("image/"))return reject(new Error("Selecciona una imagen válida."));
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("No se pudo leer el logo."));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error("La imagen del logo no es válida."));
      img.onload=()=>{
        const max=900,scale=Math.min(1,max/Math.max(img.width,img.height));
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(img.width*scale));
        canvas.height=Math.max(1,Math.round(img.height*scale));
        const ctx=canvas.getContext("2d");
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL("image/jpeg",.88));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function companySettings(){
  const c=$("#content");
  const profile=await getCompanyProfile();
  if(profile.error){toast(profile.error,"err");return}

  c.innerHTML=
    '<div class="head"><div><div class="eyebrow2">EMPRESA</div><h1>Marca y datos comerciales.</h1><p>Tu logo y datos aparecerán automáticamente en las cotizaciones PDF.</p></div></div>'+
    '<section class="card panel company-branding">'+
      '<div class="company-logo-preview" id="companyLogoPreview">'+
        (profile.logo_data?'<img src="'+profile.logo_data+'" alt="Logo de empresa">':'<div class="company-logo-empty">LOGO</div>')+
      '</div>'+
      '<div class="company-branding-copy">'+
        '<div class="eyebrow2">BRANDING PARA PDF</div>'+
        '<h3>Logo de la empresa</h3>'+
        '<p>Disponible para cuentas MASTER y planes pagados. La imagen se optimiza automáticamente para los documentos.</p>'+
        '<div class="company-actions">'+
          '<label class="secondary file-btn">Seleccionar logo<input id="companyLogo" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>'+
          '<button id="removeLogo" class="secondary" type="button">Quitar logo</button>'+
        '</div>'+
        '<small id="logoStatus" class="muted-small"></small>'+
      '</div>'+
    '</section>'+
    '<section class="card panel" style="margin-top:12px">'+
      '<div class="eyebrow2">DATOS DE LA EMPRESA</div>'+
      '<form id="companyForm" class="form-grid">'+
        '<label>Nombre comercial<input name="business_name" value="'+esc(profile.business_name||"")+'" placeholder="Tecnovigilancia Marc"></label>'+
        '<label>Razón social<input name="legal_name" value="'+esc(profile.legal_name||"")+'" placeholder="Razón social"></label>'+
        '<label>RUC<input name="ruc" value="'+esc(profile.ruc||"")+'" placeholder="20xxxxxxxxx"></label>'+
        '<label>Teléfono<input name="phone" value="'+esc(profile.phone||"")+'" placeholder="+51 ..."></label>'+
        '<label>Correo<input name="email" value="'+esc(profile.email||"")+'" placeholder="ventas@empresa.com"></label>'+
        '<label>Dirección<input name="address" value="'+esc(profile.address||"")+'" placeholder="Dirección comercial"></label>'+
        '<div class="modal-actions" style="grid-column:1/-1"><button type="submit" class="primary" id="saveCompany">Guardar datos de empresa</button></div>'+
      '</form>'+
    '</section>';

  let logoData=profile.logo_data||null;

  $("#companyLogo").onchange=async function(e){
    const file=e.target.files&&e.target.files[0];
    if(!file)return;
    try{
      logoData=await resizeLogo(file);
      $("#companyLogoPreview").innerHTML='<img src="'+logoData+'" alt="Logo de empresa">';
      $("#logoStatus").textContent="Logo listo para guardar.";
    }catch(err){
      toast(err.message||"No se pudo preparar el logo.","err");
    }
  };

  $("#removeLogo").onclick=function(){
    logoData=null;
    $("#companyLogoPreview").innerHTML='<div class="company-logo-empty">LOGO</div>';
    $("#logoStatus").textContent="El logo será eliminado al guardar.";
  };

  $("#companyForm").onsubmit=async function(e){
    e.preventDefault();
    const d=new FormData(e.currentTarget);
    const btn=$("#saveCompany");
    btn.disabled=true;
    try{
      const body={
        business_name:d.get("business_name"),
        legal_name:d.get("legal_name"),
        ruc:d.get("ruc"),
        phone:d.get("phone"),
        email:d.get("email"),
        address:d.get("address"),
        logo_data:logoData
      };
      const r=await fetch("/api/company/profile",{
        method:"POST",
        headers:{
          Authorization:"Bearer "+st.session?.access_token,
          "Content-Type":"application/json"
        },
        body:JSON.stringify(body)
      });
      const j=await r.json();
      if(!r.ok)throw new Error(j.message||j.error||"No se pudo guardar.");
      toast("Datos de empresa guardados","ok");
    }catch(err){
      toast(err.message||"No se pudo guardar.","err");
    }finally{
      btn.disabled=false;
    }
  };
}

async function settings(){
  const {data:a}=await S.from("marc_accounts").select("*").eq("id",st.u.id).single();
  const {data:master}=await S.from("marc_user_roles").select("role,active").eq("user_id",st.u.id).eq("role","MASTER").eq("active",true).maybeSingle();
  const {data:sub}=await S.from("marc_subscriptions").select("plan,status,current_period_end,provider").eq("user_id",st.u.id).eq("status","active").order("current_period_end",{ascending:false}).limit(1).maybeSingle();
  $("#content").innerHTML=`<div class="head"><div><div class="eyebrow2">CONFIGURACIÓN</div><h1>Cuenta y conexiones.</h1><p>La suscripción pertenece a tu cuenta M.A.R.C.; los canales solo la utilizan.</p></div></div>
  <div class="settings"><div class="settings-company-card card panel" style="grid-column:1/-1"><div class="eyebrow2">EMPRESA</div><h3 style="margin:0">Marca y datos para cotizaciones.</h3><p>Configura tu logo y los datos que aparecerán en tus PDF.</p><button class="primary" id="companyProfileBtn">Configurar empresa</button></div>

    <section class="card panel">
      <div class="eyebrow2">SUSCRIPCIÓN</div>
      <h3 style="font-size:17px;margin:0">${master?"M.A.R.C. MASTER":sub?"M.A.R.C. "+esc(sub.plan):"Prueba gratuita"}</h3>
      <p>${master?"Cuenta de pruebas con acceso administrativo y sin límites.":sub?"Suscripción activa · "+esc(sub.provider||"Proveedor"):"Web + chat + clientes + inventario + cotizaciones."}</p>
      <div class="quick">
        <div class="card panel"><b style="font-size:9px">${master?"MASTER":sub?"ACTIVA":"7 DÍAS"}</b><small>${master?"Sin límites":sub?"Mismo acceso en Web y Telegram":"Prueba"}</small></div>
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
  $("#companyProfileBtn").onclick=companySettings;
  $("#connectTelegram").onclick=connectTelegram;
  $("#unlinkTelegram").onclick=unlinkTelegram;
  $("#refreshTelegram").onclick=refreshTelegramSettings;
  await refreshTelegramSettings();
}
function modal(html){$("#modal").innerHTML='<div class="modal">'+html+"</div>";const close=()=>$("#modal").innerHTML="";return close}
function clientModal(x=null){const close=modal(`<div class="modal-head"><div><h2>${x?"Editar":"Nuevo"} cliente</h2><p>Disponible para el contexto de M.A.R.C.</p></div><button class="close" id="x">×</button></div><form id="f"><div class="form-grid"><label>Nombre / razón social<input name="name" required value="${esc(x?.name)}"></label><label>Documento<input name="document_number" value="${esc(x?.document_number)}"></label><label>Contacto<input name="contact_name" value="${esc(x?.contact_name)}"></label><label>Teléfono<input name="phone" value="${esc(x?.phone)}"></label><label>Correo<input name="email" type="email" value="${esc(x?.email)}"></label><label>Dirección<input name="address" value="${esc(x?.address)}"></label><label style="grid-column:1/-1">Notas<textarea name="notes" rows="3">${esc(x?.notes)}</textarea></label></div><div class="modal-actions"><button type="button" class="secondary" id="cancel">Cancelar</button><button class="primary">Guardar</button></div></form>`);$("#x").onclick=close;$("#cancel").onclick=close;$("#f").onsubmit=async e=>{e.preventDefault();const d=new FormData(e.currentTarget),p={user_id:st.u.id,name:d.get("name").trim(),document_type:"OTRO",document_number:d.get("document_number")||null,contact_name:d.get("contact_name")||null,phone:d.get("phone")||null,email:d.get("email")||null,address:d.get("address")||null,notes:d.get("notes")||null,updated_at:new Date().toISOString()};const r=x?await S.from("marc_clients").update(p).eq("id",x.id).eq("user_id",st.u.id):await S.from("marc_clients").insert(p);if(r.error)return toast(r.error.message,"err");close();toast("Cliente guardado","ok");await trial();clients()}}
async function optimizeProductImage(file){
  if(!file)return null;
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("La foto debe ser JPG, PNG o WEBP.");
  if(file.size>5*1024*1024)throw new Error("La foto supera el límite de 5 MB.");
  const bitmap=await createImageBitmap(file);
  const max=1400;
  const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext("2d",{alpha:false});
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  bitmap.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.82));
  if(!blob)throw new Error("No se pudo preparar la foto.");
  return blob;
}
function inventoryPublicImageUrl(path){
  return S.storage.from("inventory-images").getPublicUrl(path).data.publicUrl;
}
async function uploadInventoryPhoto(file,productId,oldUrl){
  const blob=await optimizeProductImage(file);
  if(!blob)return {url:oldUrl||null,path:null};
  const path=st.u.id+"/"+productId+"-"+Date.now()+".jpg";
  const up=await S.storage.from("inventory-images").upload(path,blob,{
    contentType:"image/jpeg",
    upsert:false,
    cacheControl:"31536000"
  });
  if(up.error)throw up.error;
  const url=inventoryPublicImageUrl(path);
  if(oldUrl&&oldUrl.includes("/storage/v1/object/public/inventory-images/")){
    const oldPath=oldUrl.split("/storage/v1/object/public/inventory-images/")[1];
    if(oldPath)await S.storage.from("inventory-images").remove([decodeURIComponent(oldPath)]);
  }
  return {url,path};
}
async function analyzeProductBoxPhoto(file,statusEl){
  if(!file)throw new Error("Selecciona o toma una foto de la caja.");
  const blob=await optimizeProductImage(file);
  const reader=new FileReader();
  const dataUrl=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(new Error("No se pudo preparar la imagen para la IA."));reader.readAsDataURL(blob)});
  statusEl.className="msg";statusEl.textContent="Gemini está leyendo la caja…";
  const response=await fetch("/api/inventory/analyze-photo",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+st.session?.access_token},body:JSON.stringify({imageBase64:dataUrl,mimeType:"image/jpeg"})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||data.error||"No se pudo analizar la foto.");
  return data.product||{};
}
function inventoryModal(x=null){
  const close=modal(
    '<div class="modal-head"><div><h2>'+(x?"Editar":"Nuevo")+' producto</h2><p>Productos + inventario, ahora también con foto.</p></div><button class="close" id="x">×</button></div>'+
    '<form id="f">'+
      '<div class="inventory-photo-box">'+
        '<div class="inventory-photo-preview" id="productPhotoPreview">'+(x?.image_url?'<img src="'+esc(x.image_url)+'" alt="Foto del producto">':'<span>📷</span>')+'</div>'+
        '<div style="display:flex;flex-direction:column;gap:7px;min-width:0;flex:1">'+
          '<label>Foto del producto<input id="productPhoto" name="image" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></label>'+
          '<button type="button" class="secondary" id="analyzeProductPhoto">✦ Analizar caja con IA</button>'+
          '<small>Fotografía la caja. Gemini leerá nombre, SKU, marca y modelo. El precio lo colocas tú.</small>'+
        '</div>'+
      '</div>'+
      '<div class="form-grid">'+
        '<label>Nombre<input name="name" required value="'+esc(x?.name||"")+'"></label>'+
        '<label>Código / SKU<input name="sku" value="'+esc(x?.sku||"")+'"></label>'+
        '<label>Marca<input name="brand" value="'+esc(x?.brand||"")+'"></label>'+
        '<label>Modelo<input name="model" value="'+esc(x?.model||"")+'"></label>'+
        '<label>Categoría<input name="category" value="'+esc(x?.category||"")+'"></label>'+
        '<label>Unidad<input name="unit" value="'+esc(x?.unit||"UND")+'"></label>'+
        '<label>Costo<input name="cost" type="number" min="0" step="0.01" value="'+(x?.cost??0)+'"></label>'+
        '<label>Precio de venta<input name="price" type="number" min="0" step="0.01" placeholder="Coloca el precio" value="'+(x?.price??0)+'"></label>'+
        '<label>Stock<input name="stock" type="number" min="0" step="0.01" value="'+(x?.stock??0)+'"></label>'+
        '<label>Mínimo<input name="min_stock" type="number" min="0" step="0.01" value="'+(x?.min_stock??0)+'"></label>'+
      '</div>'+
      '<div id="photoMsg" class="msg"></div>'+
      '<div class="modal-actions">'+
        (x?'<button type="button" class="danger" id="deleteProduct">Eliminar producto</button>':'')+
        '<button type="button" class="secondary" id="cancel">Cancelar</button>'+
        '<button class="primary" id="saveProduct">Guardar</button>'+
      '</div>'+
    '</form>'
  );
  $("#x").onclick=close;
  $("#cancel").onclick=close;

  const photo=$("#productPhoto"), preview=$("#productPhotoPreview"), msg=$("#photoMsg"), analyzePhoto=$("#analyzeProductPhoto");
  if(analyzePhoto)analyzePhoto.onclick=async()=>{const f=photo.files?.[0];if(!f)return toast("Primero toma o selecciona una foto de la caja.","err");analyzePhoto.disabled=true;try{const p=await analyzeProductBoxPhoto(f,msg);if(p.name)$("[name=name]").value=p.name;if(p.sku)$("[name=sku]").value=p.sku;if(p.brand)$("[name=brand]").value=p.brand;if(p.model)$("[name=model]").value=p.model;if(p.category)$("[name=category]").value=p.category;const confidence=Math.round(Number(p.confidence||0)*100);msg.className="msg";msg.textContent=confidence?("Caja analizada. Confianza aproximada: "+confidence+"%. Revisa los datos y coloca tu precio de venta."):("Caja analizada. Revisa los datos y coloca tu precio de venta.")}catch(err){msg.className="msg error";msg.textContent=err.message||"No se pudo analizar la caja."}finally{analyzePhoto.disabled=false}};
  photo.onchange=()=>{
    const f=photo.files?.[0];
    if(!f)return;
    if(!["image/jpeg","image/png","image/webp"].includes(f.type))return toast("Usa JPG, PNG o WEBP.","err");
    if(f.size>5*1024*1024)return toast("La foto supera 5 MB.","err");
    const url=URL.createObjectURL(f);
    preview.innerHTML='<img src="'+url+'" alt="Vista previa">';
  };

  if(x){
    $("#deleteProduct").onclick=async function(){
      const ok=confirm("¿Eliminar «"+x.name+"» del inventario?\n\nEl producto dejará de aparecer del inventario activo, pero se conservará el registro para el historial.");
      if(!ok)return;
      const b=$("#deleteProduct");b.disabled=true;
      try{
        const {error}=await S.from("marc_inventory").update({active:false,updated_at:new Date().toISOString()}).eq("id",x.id).eq("user_id",st.u.id);
        if(error)throw error;
        close();toast("Producto eliminado del inventario","ok");await inventory();
      }catch(err){toast(err.message||"No se pudo eliminar el producto.","err");b.disabled=false}
    };
  }

  $("#f").onsubmit=async e=>{
    e.preventDefault();
    const b=$("#saveProduct");b.disabled=true;
    const d=new FormData(e.currentTarget);
    const p={user_id:st.u.id,name:String(d.get("name")||"").trim(),sku:d.get("sku")||null,brand:d.get("brand")||null,model:d.get("model")||null,category:d.get("category")||null,unit:d.get("unit")||"UND",cost:Number(d.get("cost")||0),price:Number(d.get("price")||0),stock:Number(d.get("stock")||0),min_stock:Number(d.get("min_stock")||0),updated_at:new Date().toISOString()};
    try{
      let productId=x?.id||null;
      let imageUrl=x?.image_url||null;
      if(x){
        const r=await S.from("marc_inventory").update(p).eq("id",x.id).eq("user_id",st.u.id).select("id,image_url").single();
        if(r.error)throw r.error;
        productId=r.data.id;imageUrl=r.data.image_url;
      }else{
        const r=await S.from("marc_inventory").insert(p).select("id,image_url").single();
        if(r.error)throw r.error;
        productId=r.data.id;imageUrl=r.data.image_url||null;
      }
      const photoFile=photo.files?.[0];
      if(photoFile){
        msg.className="msg";msg.textContent="Subiendo y optimizando la foto…";
        const uploaded=await uploadInventoryPhoto(photoFile,productId,imageUrl);
        const u=await S.from("marc_inventory").update({image_url:uploaded.url,updated_at:new Date().toISOString()}).eq("id",productId).eq("user_id",st.u.id);
        if(u.error)throw u.error;
      }
      close();toast(photoFile?"Producto guardado con foto":"Producto guardado","ok");await trial();await inventory();
    }catch(err){
      msg.className="msg error";msg.textContent=err.message||"No se pudo guardar el producto.";
      b.disabled=false;
    }
  };
}
async function aiQuoteModal(){
  const cls=(await S.from("marc_clients").select("id,name").eq("user_id",st.u.id).order("name")).data||[];
  const close=modal(
    '<div class="modal-head"><div><h2>✦ Crear cotización con IA</h2><p>Describe el trabajo y M.A.R.C. prepara la cotización.</p></div><button class="close" id="x">×</button></div>'+
    '<form id="aiQuoteForm">'+
    '<label>Cliente<select name="client_id"><option value="">Sin cliente</option>'+cls.map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join("")+'</select></label>'+
    '<label>Descripción del trabajo<textarea name="description" rows="7" required placeholder="Ej.: Reparación de cámara WiFi Ezviz. Revisar fuente, configurar nuevamente y dejar operativa. A todo costo S/ 180.00"></textarea></label>'+
    '<label style="display:flex;align-items:center;gap:8px"><input name="all_cost" type="checkbox" checked style="width:auto"> A todo costo · una sola partida de trabajo</label>'+
    '<div class="ai-hint">Puedes escribir todo en una sola descripción. La IA extraerá el título y el precio cuando aparezca. No inventará precios.</div>'+
    '<div id="aiQuoteMsg" class="msg"></div>'+
    '<div class="modal-actions"><button type="button" class="secondary" id="cancel">Cancelar</button><button class="primary" id="generateAi">✦ Generar cotización</button></div>'+
    '</form>'
  );
  $("#x").onclick=close;$("#cancel").onclick=close;
  $("#aiQuoteForm").onsubmit=async e=>{
    e.preventDefault();
    const d=new FormData(e.currentTarget);
    const btn=$("#generateAi"),msgBox=$("#aiQuoteMsg");
    const description=String(d.get("description")||"").trim(),clientId=d.get("client_id")||"",allCost=d.get("all_cost")==="on";
    if(!description)return;
    btn.disabled=true;msgBox.className="msg";msgBox.textContent="M.A.R.C. está preparando la cotización…";
    try{
      const selected=cls.find(x=>x.id===clientId);
      const r=await fetch("/api/quote-ai",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+st.session?.access_token},body:JSON.stringify({description,allCost,clientQuery:selected?.name||""})});
      const j=await r.json();
      if(!r.ok)throw new Error(j.message||j.error||"No se pudo generar la cotización.");
      const draft=j.draft||{};
      draft.client_id=clientId;
      draft.items=(draft.items||[]).map(x=>({type:x.type||"TRABAJO",name:x.name||"Trabajo",description:x.description||description,qty:Number(x.quantity||1),price:x.unit_price==null?0:Number(x.unit_price),cost:0,unit:"UND"}));
      close();
      await quoteModal(null,draft);
      toast("Cotización preparada por IA. Revísala antes de guardar.","ok");
    }catch(err){
      msgBox.className="msg error";msgBox.textContent=err.message||"No se pudo generar.";
    }finally{btn.disabled=false}
  };
}
async function quoteModal(existing=null,preset=null){
  const cls=(await S.from("marc_clients").select("id,name").eq("user_id",st.u.id).order("name")).data||[];
  const inv=(await S.from("marc_inventory").select("id,name,brand,model,price,cost,unit,stock").eq("user_id",st.u.id).eq("active",true).order("name")).data||[];
  let lines=[];
  const quote=existing;

  if(existing){
    const {data}=await S.from("marc_quote_items").select("*").eq("quote_id",existing.id).eq("user_id",st.u.id).order("created_at");
    lines=(data||[]).map(x=>({
      id:x.id,
      type:x.item_type,
      inventory_id:x.inventory_id||"",
      name:x.name||"",
      description:x.description||"",
      qty:Number(x.quantity||1),
      price:Number(x.unit_price||0),
      cost:Number(x.cost||0),
      unit:x.unit||"UND",
      material_provider:x.material_provider|| (x.item_type==="PRODUCTO"?"MARC":"CLIENT"),
      transport:Number(x.transport_cost||0),
      labor:Number(x.labor_cost||0),
      other:Number(x.other_cost||0)
    }));
  }else if(preset){
    lines=(preset.items||[]).map(x=>({
      type:x.type||"TRABAJO",
      inventory_id:x.inventory_id||"",
      name:x.name||"",
      description:x.description||"",
      qty:Number(x.qty||1),
      price:Number(x.price||0),
      cost:Number(x.cost||0),
      unit:x.unit||"UND",
      material_provider:x.material_provider||(x.type==="PRODUCTO"?"MARC":"CLIENT"),
      transport:Number(x.transport||x.transport_cost||0),
      labor:Number(x.labor||x.labor_cost||0),
      other:Number(x.other||x.other_cost||0)
    }));
  }

  const defaultLine=()=>({type:"TRABAJO",inventory_id:"",name:"",description:"",qty:1,price:0,cost:0,unit:"UND",material_provider:"CLIENT",transport:0,labor:0,other:0});
  const close=modal(
    '<div class="modal-head"><div><h2>'+(quote?"Cotización "+esc(quote.number):"Nueva cotización")+'</h2><p>Controla precio, material, transporte, tiempo y ganancia.</p></div><button class="close" id="x">×</button></div>'+
    '<form id="f">'+
      '<div class="form-grid">'+
        '<label>Cliente<select name="client_id"><option value="">Sin cliente</option>'+cls.map(x=>'<option value="'+x.id+'" '+((quote?.client_id||preset?.client_id)===x.id?"selected":"")+'>'+esc(x.name)+'</option>').join("")+'</select></label>'+
        '<label>Título<input name="title" required value="'+esc(quote?.title||preset?.title||"Nueva cotización")+'"></label>'+
        '<label>IGV <select name="tax_enabled"><option value="false" '+(!quote?.tax_enabled?"selected":"")+'>No incluir</option><option value="true" '+(quote?.tax_enabled?"selected":"")+'>Incluir</option></select></label>'+
        '<label>% IGV<input name="tax_rate" type="number" min="0" max="100" step="0.01" value="'+(quote?.tax_rate??18)+'"></label>'+
        '<label>Estado<select name="status"><option value="BORRADOR" '+((quote?.status||"BORRADOR")==="BORRADOR"?"selected":"")+'>Borrador</option><option value="ENVIADA" '+((quote?.status||"BORRADOR")==="ENVIADA"?"selected":"")+'>Enviada</option><option value="ACEPTADA" '+((quote?.status||"BORRADOR")==="ACEPTADA"?"selected":"")+'>Aceptada</option><option value="RECHAZADA" '+((quote?.status||"BORRADOR")==="RECHAZADA"?"selected":"")+'>Rechazada</option><option value="ANULADA" '+((quote?.status||"BORRADOR")==="ANULADA"?"selected":"")+'>Anulada</option><option value="COBRADA" '+((quote?.status||"BORRADOR")==="COBRADA"?"selected":"")+'>Cobrada</option></select></label>'+
      '</div>'+
      '<div class="quote-finance-hint"><b>¿Quién proporciona los materiales?</b><span>Cliente = no cuenta como costo de material para M.A.R.C.</span></div>'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0 5px"><b style="font-size:9px">PARTIDAS</b><button type="button" id="add" class="secondary">＋ Línea</button></div>'+
      '<div id="lines"></div>'+
      '<label>Notas<textarea name="notes" rows="3">'+esc(quote?.notes||"")+'</textarea></label>'+
      '<div id="summary" class="quote-summary"></div>'+
      '<div class="modal-actions">'+(quote?'<button type="button" class="danger" id="deleteQuote">Eliminar cotización</button>':'')+'<button type="button" class="secondary" id="cancel">Cerrar</button><button type="button" class="secondary" id="print">Imprimir</button><button type="button" class="secondary" id="pdf">Descargar PDF</button><button class="primary">'+(quote?"Guardar cambios":"Guardar cotización")+'</button></div>'+
    '</form>'
  );

  $("#x").onclick=close;$("#cancel").onclick=close;
  if(quote&&$("#deleteQuote")){
    $("#deleteQuote").onclick=async()=>{
      if(quote.status==="COBRADA")return toast("Una cotización cobrada no puede eliminarse. Usa ANULADA.","err");
      if(!confirm("¿Eliminar la cotización "+quote.number+"?\n\nDesaparecerá del listado, pero se conservará el historial."))return;
      const b=$("#deleteQuote");b.disabled=true;
      try{
        const result=await S.from("marc_quotes").update({deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",quote.id).eq("user_id",st.u.id);
        if(result.error)throw result.error;
        close();toast("Cotización eliminada","ok");await quotes();
      }catch(err){toast(err.message||"No se pudo eliminar la cotización.","err");b.disabled=false}
    };
  }

  const box=$("#lines");
  if(!lines.length)lines=[defaultLine()];

  const providerOptions=(value)=>[
    ["CLIENT","Cliente — pone el material"],
    ["MARC","M.A.R.C. — material propio / todo costo"],
    ["MIXTO","Mixto — parte del material"]
  ].map(o=>'<option value="'+o[0]+'" '+(value===o[0]?"selected":"")+'>'+o[1]+'</option>').join("");

  const productOptions=(selected)=>'<option value="">Seleccionar producto…</option>'+inv.map(x=>'<option value="'+x.id+'" '+(selected===x.id?"selected":"")+'>'+esc(x.name+(x.brand?" · "+x.brand:"")+(x.model?" · "+x.model:""))+' — '+money(x.price)+' · stock '+x.stock+'</option>').join("");

  const updateSummary=()=>{
    const sub=lines.reduce((a,x)=>a+Number(x.qty||0)*Number(x.price||0),0);
    const internalCost=lines.reduce((a,x)=>a+(Number(x.qty||0)*Number(x.cost||0))+Number(x.transport||0)+Number(x.labor||0)+Number(x.other||0),0);
    const profit=sub-internalCost;
    const margin=sub>0?(profit/sub)*100:0;
    const enabled=$("#f [name=tax_enabled]").value==="true";
    const rate=Number($("#f [name=tax_rate]").value||18);
    const tax=enabled?sub*rate/100:0;
    const total=sub+tax;
    $("#summary").innerHTML=
      '<div><span>Subtotal</span><b>'+money(sub)+'</b></div>'+
      '<div><span>Costo interno</span><b>'+money(internalCost)+'</b></div>'+
      '<div><span>Ganancia bruta</span><b class="'+(profit<0?"profit-negative":"profit-positive")+'">'+money(profit)+'</b></div>'+
      '<div><span>Margen</span><b>'+margin.toFixed(1)+'%</b></div>'+
      '<div><span>IGV ('+rate+'%)</span><b>'+money(tax)+'</b></div>'+
      '<div class="grand"><span>Total cliente</span><b>'+money(total)+'</b></div>';
  };

  const draw=()=>{
    box.innerHTML=lines.map((x,i)=>{
      const isP=x.type==="PRODUCTO";
      const clientMaterial=x.material_provider==="CLIENT";
      return '<div class="quote-line financial-line" data-line="'+i+'">'+
        '<div class="quote-line-top"><select data-i="'+i+'" data-k="type"><option value="PRODUCTO" '+(isP?"selected":"")+'>Producto</option><option value="TRABAJO" '+(!isP?"selected":"")+'>Trabajo</option></select>'+
        (isP?'<select data-i="'+i+'" data-k="inventory_id">'+productOptions(x.inventory_id)+'</select>':'<input data-i="'+i+'" data-k="name" placeholder="Descripción del trabajo" value="'+esc(x.name)+'">')+
        '<button type="button" data-r="'+i+'" class="close">×</button></div>'+
        '<div class="quote-line-fields">'+
          '<input data-i="'+i+'" data-k="qty" type="number" min="0.01" step="0.01" value="'+x.qty+'" placeholder="Cant.">'+
          '<input data-i="'+i+'" data-k="price" type="number" min="0" step="0.01" value="'+x.price+'" placeholder="Precio unitario">'+
          '<input data-i="'+i+'" data-k="description" placeholder="Descripción (opcional)" value="'+esc(x.description)+'">'+
        '</div>'+
        '<div class="quote-cost-grid">'+
          '<label>Material<select data-i="'+i+'" data-k="material_provider">'+providerOptions(x.material_provider)+'</select></label>'+
          '<label>Costo material<input data-i="'+i+'" data-k="cost" type="number" min="0" step="0.01" value="'+(clientMaterial?0:Number(x.cost||0))+'" '+(clientMaterial?"disabled":"")+'></label>'+
          '<label>Transporte<input data-i="'+i+'" data-k="transport" type="number" min="0" step="0.01" value="'+Number(x.transport||0)+'"></label>'+
          '<label>Tiempo / mano de obra<input data-i="'+i+'" data-k="labor" type="number" min="0" step="0.01" value="'+Number(x.labor||0)+'"></label>'+
          '<label>Otros costos<input data-i="'+i+'" data-k="other" type="number" min="0" step="0.01" value="'+Number(x.other||0)+'"></label>'+
        '</div>'+
        '<div class="quote-line-total">Costo interno de esta línea: <b>'+money((Number(x.qty||0)*Number(x.cost||0))+Number(x.transport||0)+Number(x.labor||0)+Number(x.other||0))+'</b></div>'+
      '</div>';
    }).join("");
    updateSummary();
  };

  box.onchange=e=>{
    const i=e.target.dataset.i;
    if(i==null)return;
    const k=e.target.dataset.k;

    if(k==="type"){
      lines[i].type=e.target.value;
      lines[i].inventory_id=e.target.value==="TRABAJO"?"":"";
      lines[i].material_provider=e.target.value==="PRODUCTO"?"MARC":"CLIENT";
      lines[i].cost=0;
      draw();
      return;
    }

    lines[i][k]=e.target.value;

    if(k==="inventory_id"){
      const p=inv.find(x=>x.id===e.target.value);
      if(p){
        lines[i].name=p.name;
        lines[i].price=Number(p.price||0);
        lines[i].cost=Number(p.cost||0);
        lines[i].unit=p.unit||"UND";
        if(!lines[i].material_provider)lines[i].material_provider="MARC";
      }
    }

    if(k==="material_provider"){
      if(e.target.value==="CLIENT")lines[i].cost=0;
      if(e.target.value==="MARC" && lines[i].type==="PRODUCTO"){
        const p=inv.find(x=>x.id===lines[i].inventory_id);
        if(p)lines[i].cost=Number(p.cost||0);
      }
      draw();
      return;
    }

    updateSummary();
  };

  box.oninput=e=>{
    const i=e.target.dataset.i;
    if(i==null)return;
    const k=e.target.dataset.k;
    lines[i][k]=(k==="description"||k==="name")?e.target.value:Number(e.target.value||0);
    updateSummary();
    const row=e.target.closest(".quote-line");
    if(row){
      const costLine=row.querySelector(".quote-line-total");
      if(costLine){
        const x=lines[i];
        costLine.innerHTML='Costo interno de esta línea: <b>'+money((Number(x.qty||0)*Number(x.cost||0))+Number(x.transport||0)+Number(x.labor||0)+Number(x.other||0))+'</b>';
      }
    }
  };

  box.onclick=e=>{
    if(e.target.dataset.r!=null){
      lines.splice(Number(e.target.dataset.r),1);
      if(!lines.length)lines.push(defaultLine());
      draw();
    }
  };

  $("#add").onclick=()=>{lines.push(defaultLine());draw();};
  $("#f [name=tax_enabled]").onchange=updateSummary;
  $("#f [name=tax_rate]").oninput=updateSummary;
  $("#print").onclick=async()=>printQuote(existing?.id);
  $("#pdf").onclick=async()=>downloadQuotePdf(existing?.id);
  draw();

  $("#f").onsubmit=async e=>{
    e.preventDefault();
    const d=new FormData(e.currentTarget);
    const valid=lines.filter(x=>x.type==="PRODUCTO"?!!x.inventory_id:!!String(x.name||"").trim());
    if(!valid.length)return toast("Agrega al menos una partida.","err");
    if(valid.some(x=>Number(x.qty)<=0||Number(x.price)<0))return toast("Revisa cantidades y precios.","err");
    if(valid.some(x=>x.type==="TRABAJO"&&!Number(x.price)))return toast("Cada trabajo debe tener precio.","err");
    if(valid.some(x=>Number(x.cost||0)<0||Number(x.transport||0)<0||Number(x.labor||0)<0||Number(x.other||0)<0))return toast("Los costos no pueden ser negativos.","err");

    const taxEnabled=d.get("tax_enabled")==="true";
    const taxRate=Number(d.get("tax_rate")||18);
    const status=d.get("status")||"BORRADOR";

    const items=valid.map(x=>({
      inventory_id:x.type==="PRODUCTO"?x.inventory_id:null,
      item_type:x.type,
      name:x.name,
      description:x.description||null,
      quantity:Number(x.qty),
      unit:x.unit||"UND",
      unit_price:Number(x.price),
      cost:Number(x.cost||0),
      material_provider:x.material_provider||"CLIENT",
      transport_cost:Number(x.transport||0),
      labor_cost:Number(x.labor||0),
      other_cost:Number(x.other||0)
    }));

    const {data,error}=await S.rpc("marc_save_quote",{
      p_quote_id:quote?.id||null,
      p_client_id:d.get("client_id")||null,
      p_title:d.get("title")||"Cotización",
      p_status:status,
      p_tax_enabled:taxEnabled,
      p_tax_rate:taxRate,
      p_notes:d.get("notes")||null,
      p_items:items,
      p_source:"WEB"
    });

    if(error){
      const msg=String(error.message||"");
      if(msg.includes("TRIAL_QUOTE_LIMIT"))return toast("Llegaste al límite de 5 cotizaciones de la prueba.","err");
      if(msg.includes("TRIAL_EXPIRED"))return toast("Tu prueba terminó. Activa un plan para continuar.","err");
      return toast(error.message,"err");
    }

    close();
    toast(quote?"Cotización actualizada":"Cotización guardada","ok");
    await trial();
    quotes();
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
async function downloadQuotePdf(id){
  if(!id)throw new Error("Guarda la cotización antes de descargar el PDF.");
  if(!window.jspdf?.jsPDF)throw new Error("El generador PDF todavía está cargando. Recarga la página e inténtalo nuevamente.");
  const qr=await S.from("marc_quotes").select("*,marc_clients(name,document_type,document_number,email,phone,address)").eq("id",id).eq("user_id",st.u.id).single();
  if(qr.error)throw new Error("No se pudo leer la cotización: "+qr.error.message);
  const q=qr.data;
  if(!q)throw new Error("No se encontró la cotización.");
  const ir=await S.from("marc_quote_items").select("*").eq("quote_id",id).eq("user_id",st.u.id).order("created_at");
  if(ir.error)throw new Error("No se pudieron leer las partidas: "+ir.error.message);
  const items=ir.data||[];
  const client=q.marc_clients||{};
  const company=await getCompanyProfile();
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:"mm",format:"a4"});
  const pageW=210,margin=14;
  let y=18;
  if(company?.logo_data){try{doc.addImage(company.logo_data,"JPEG",margin,y-3,30,18,"logo","FAST")}catch{}}
  const brandX=company?.logo_data?margin+35:margin;
  doc.setFont("helvetica","bold");doc.setFontSize(18);doc.text(String(company?.business_name||"M.A.R.C."),brandX,y+2);
  doc.setFont("helvetica","normal");doc.setFontSize(8);
  const companyMeta=[company?.legal_name,company?.ruc?("RUC "+company.ruc):"",company?.phone,company?.email].filter(Boolean).join(" · ");
  if(companyMeta)doc.text(doc.splitTextToSize(companyMeta,95),brandX,y+7);
  if(company?.address)doc.text(doc.splitTextToSize(company.address,95),brandX,y+12);
  doc.setFont("helvetica","bold");doc.setFontSize(16);doc.text(String(q.number||"COTIZACIÓN"),pageW-margin,y,{align:"right"});
  doc.setFont("helvetica","normal");doc.setFontSize(9);doc.text(new Date(q.created_at).toLocaleDateString("es-PE"),pageW-margin,y+5,{align:"right"});
  y+=23;doc.setDrawColor(210);doc.line(margin,y,pageW-margin,y);y+=9;
  const box=(x,yy,w,h,title,lines)=>{
    doc.setDrawColor(225);doc.roundedRect(x,yy,w,h,3,3);
    doc.setFont("helvetica","bold");doc.setFontSize(9);doc.text(title,x+4,yy+6);
    doc.setFont("helvetica","normal");doc.setFontSize(8);
    let ty=yy+12;for(const line of lines){const parts=doc.splitTextToSize(String(line||""),w-8);doc.text(parts,x+4,ty);ty+=4.2*parts.length;if(ty>yy+h-3)break}
  };
  box(margin,y,88,30,"CLIENTE",[client.name||"Sin cliente",client.document_type&&client.document_number?client.document_type+" "+client.document_number:"",client.phone||"",client.email||"",client.address||""]);
  box(108,y,88,30,"CONDICIONES",["Título: "+String(q.title||"Cotización"),"Moneda: "+String(q.currency||"PEN"),"IGV: "+(q.tax_enabled?String(q.tax_rate)+"%":"No incluido"),"Estado: "+String(q.status||"BORRADOR")]);
  y+=38;
  doc.setFillColor(242,246,250);doc.rect(margin,y,pageW-margin*2,8,"F");
  doc.setFont("helvetica","bold");doc.setFontSize(8);
  doc.text("CONCEPTO",margin+2,y+5);doc.text("DESCRIPCIÓN",70,y+5);doc.text("CANT.",140,y+5);doc.text("PRECIO",158,y+5);doc.text("TOTAL",184,y+5);
  y+=12;doc.setFont("helvetica","normal");
  for(const it of items){
    const desc=doc.splitTextToSize(String(it.description||""),64);
    const name=doc.splitTextToSize(String(it.name||""),55);
    const h=Math.max(7,4.2*Math.max(desc.length,name.length));
    if(y+h>270){doc.addPage();y=18}
    doc.setFont("helvetica","bold");doc.text(name,margin+2,y);
    doc.setFont("helvetica","normal");doc.text(desc,70,y);
    doc.text(String(it.quantity||1),142,y);
    doc.text(money(it.unit_price).replace("PEN","S/"),158,y);
    doc.text(money(it.line_total).replace("PEN","S/"),184,y);
    y+=h+3;doc.setDrawColor(235);doc.line(margin,y-1,pageW-margin,y-1);
  }
  y+=5;
  const totalsX=126;
  doc.setFont("helvetica","normal");doc.text("Subtotal",totalsX,y);doc.text(money(q.subtotal).replace("PEN","S/"),pageW-margin,y,{align:"right"});y+=6;
  doc.text("IGV",totalsX,y);doc.text(money(q.tax).replace("PEN","S/"),pageW-margin,y,{align:"right"});y+=7;
  doc.setDrawColor(30);doc.line(totalsX,y-3,pageW-margin,y-3);
  doc.setFont("helvetica","bold");doc.setFontSize(12);doc.text("TOTAL",totalsX,y+3);doc.text(money(q.total).replace("PEN","S/"),pageW-margin,y+3,{align:"right"});y+=12;
  if(q.notes){doc.setFont("helvetica","bold");doc.setFontSize(9);doc.text("NOTAS",margin,y);y+=6;doc.setFont("helvetica","normal");doc.setFontSize(8);doc.text(doc.splitTextToSize(String(q.notes),pageW-margin*2),margin,y)}
  const filename=String(q.number||"cotizacion").replace(/[^\w.-]+/g,"_")+".pdf";
  doc.save(filename);
  toast("PDF descargado","ok");
}

function wire(){mode("login");$("#authForm").onsubmit=submit;$("#switchAuth").onclick=()=>mode(authMode==="signup"?"login":"signup");$("#forgot").onclick=()=>mode("reset");$("#togglePass").onclick=()=>{const x=$("#password");x.type=x.type==="password"?"text":"password";$("#togglePass").textContent=x.type==="password"?"Mostrar":"Ocultar"};$("#logout").onclick=async()=>{resetUiToLogin();await S.auth.signOut();};$("#askTop").onclick=openChat;
  $("#closeChat").onclick=closeChat;
  $("#exitConversation").onclick=closeChat;
  $("#menu").onclick=()=>$("#sidebar").classList.toggle("open");$("#mobileScrim").onclick=()=>$("#sidebar").classList.remove("open");$(".sidebar nav button,.mobile-bottom-nav button").forEach(b=>b.onclick=()=>view(b.dataset.view));$("#chatForm").onsubmit=e=>{e.preventDefault();const v=$("#chatInput").value.trim();if(v){$("#chatInput").value="";chatSend(v)}};$("#chatInput").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("#chatForm").requestSubmit()}};$$(".chips button").forEach(b=>b.onclick=()=>{$("#chatInput").value=b.dataset.q;$("#chatInput").focus()});S.auth.onAuthStateChange((ev,s)=>{setTimeout(()=>{if(ev==="PASSWORD_RECOVERY"&&s){st.authEpoch++;st.session=s;st.u=s.user;$("#app").classList.add("hidden");$("#auth").classList.remove("hidden");mode("update");return}if(s)enter(s);else if(ev==="SIGNED_OUT")resetUiToLogin();},0)});S.auth.getSession().then(({data})=>{if(data.session)enter(data.session);else resetUiToLogin();})}
wire()})();
(()=>{const C=window.MARC_CONFIG,S=window.supabase.createClient(C.supabaseUrl,C.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"pkce"}});const st={u:null,session:null,view:"home",cid:null,authEpoch:0};let authListenerSession=null,authTimer=null,authEnteredSessionId=null;S.auth.onAuthStateChange((ev,s)=>{authListenerSession=s||null;console.info("[M.A.R.C. auth]",ev,!!s,s?.user?.id||"");if(s?.user){clearTimeout(authTimer);authTimer=setTimeout(()=>handleAuthSession(s),0)}else if(ev==="SIGNED_OUT"){clearTimeout(authTimer);authTimer=setTimeout(()=>resetUiToLogin(),0)}});const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)],esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])),money=v=>new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(Number(v||0)),toast=(t,c="")=>{const e=document.createElement("div");e.className="toast "+c;e.textContent=t;$("#toast").appendChild(e);setTimeout(()=>e.remove(),2600)},initials=n=>String(n||"M").split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join("");let authMode="login",recoveryMode=new URLSearchParams(location.search).get("recovery")==="1"||/type=recovery/i.test(location.hash);
function msg(t,c=""){const e=$("#authMsg");e.textContent=t;e.className="msg "+c}
const THEME_KEY="marc_theme";
function applyTheme(theme,save=true){
  const t=theme==="dark"?"dark":"light";
  document.documentElement.dataset.theme=t;
  if(save)localStorage.setItem(THEME_KEY,t);
  const b=$("#themeToggle"),ab=$("#authThemeToggle"),i=$("#themeIcon"),l=$("#themeLabel");
  if(i)i.textContent=t==="dark"?"☀":"☾";
  if(ab)ab.querySelector("span").textContent=t==="dark"?"☀":"☾";
  if(l)l.textContent=t==="dark"?"Claro":"Oscuro";
  if(b)b.setAttribute("aria-label",t==="dark"?"Cambiar a modo claro":"Cambiar a modo oscuro");
  if(ab)ab.setAttribute("aria-label",t==="dark"?"Cambiar a modo claro":"Cambiar a modo oscuro");
}
function initTheme(){
  const saved=localStorage.getItem(THEME_KEY);
  const preferred=saved||(window.matchMedia&&window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light");
  applyTheme(preferred,false);
}
function authRateLimitMessage(e){const raw=String(e?.message||"").toLowerCase();return raw.includes("rate limit")||raw.includes("too many")||raw.includes("over_email_send_rate_limit")}
function mode(m){authMode=m;const title=m==="login"?"Inicia sesión en M.A.R.C.":m==="signup"?"Crea tu cuenta en M.A.R.C.":"Recupera tu contraseña";const sub=m==="login"?"Accede con Google o con tu correo y contraseña.":m==="signup"?"Crea tu cuenta para comenzar.":"Te enviaremos un enlace para crear una nueva contraseña.";if($("#authTitle"))$("#authTitle").textContent=title;if($("#authSub"))$("#authSub").textContent=sub;$("#password")?.closest("label")?.classList.toggle("hidden",m==="reset");$("#password").required=m!=="reset";$("#confirmWrap")?.classList.toggle("hidden",m!=="signup");$("#authSubmit").textContent=m==="signup"?"Crear cuenta":m==="reset"?"Enviar enlace de recuperación":"Iniciar sesión";msg("")}
function showCashStaffLogin(show=true){
  const panel=$("#cashStaffPanel");
  if(!panel)return;
  panel.classList.toggle("hidden",!show);
  panel.setAttribute("aria-hidden",String(!show));
  if(show){const e=$("#cashStaffError");if(e)e.textContent="";setTimeout(()=>$("#cashStaffUsername")?.focus(),60)}
}
function cashStaffError(t){const e=$("#cashStaffError");if(e)e.textContent=t||""}
async function signInCashStaff(e){
  e?.preventDefault();
  const form=$("#cashStaffForm"),b=$("#cashStaffSubmit");
  if(!form)return;
  const d=new FormData(form),username=String(d.get("username")||"").trim(),password=String(d.get("password")||"");
  cashStaffError("");
  if(!username||password.length<6)return cashStaffError("Escribe tu usuario y una contraseña válida.");
  if(b)b.disabled=true;
  try{
    const ownerSession=(await S.auth.getSession()).data?.session;
    if(ownerSession)sessionStorage.setItem("marc_cash_owner_session",JSON.stringify(ownerSession));
    const r=await fetch("/api/cash-staff/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||"Usuario o contraseña incorrectos.");
    if(!j.session?.access_token||!j.session?.refresh_token)throw new Error("No se pudo iniciar la sesión de caja.");
    const {error}=await S.auth.setSession({access_token:j.session.access_token,refresh_token:j.session.refresh_token});
    if(error)throw error;
  }catch(err){cashStaffError(err?.message||"No se pudo iniciar el acceso de caja.");if(b)b.disabled=false}
}
async function signInGoogle(e){
  e?.preventDefault();
  e?.stopPropagation();
  const b=$("#googleLogin");
  if(!b)return;
  try{
    b.disabled=true;
    b.setAttribute("aria-busy","true");
    const label=b.querySelector("span:last-child");
    if(label)label.textContent="Conectando…";
    msg("Abriendo acceso con Google…");
    sessionStorage.setItem("marc_google_oauth_pending","1");
    const redirectUrl=new URL(location.href);
    redirectUrl.search="";
    redirectUrl.hash="";
    const redirectTo=redirectUrl.toString();
    console.info("[M.A.R.C. OAuth] redirectTo:",redirectTo);
    const {data,error}=await S.auth.signInWithOAuth({
      provider:"google",
      options:{
        redirectTo,
        queryParams:{prompt:"select_account"}
      }
    });
    if(error)throw error;
    if(!data?.url)throw new Error("Google no devolvió la URL de inicio de sesión.");
    window.location.assign(data.url);
  }catch(e){
    sessionStorage.removeItem("marc_google_oauth_pending");
    console.error("[M.A.R.C. Google login]",e);
    msg(e?.message||"No se pudo iniciar sesión con Google.","error");
    b.disabled=false;
    b.removeAttribute("aria-busy");
    const label=b.querySelector("span:last-child");
    if(label)label.textContent="Continuar con Google";
  }
}
async function handleAuthSession(s){if(!s?.user)return;const id=s.user.id;if(authEnteredSessionId===id && st.u?.id===id && !$("#app").classList.contains("hidden"))return;authEnteredSessionId=id;try{await enter(s)}catch(e){authEnteredSessionId=null;throw e}}function resetUiToLogin(message="",type=""){st.authEpoch++;st.u=null;st.session=null;st.cid=null;try{applyCashierMode(false)}catch{}$("#app").classList.add("hidden");$("#auth").classList.remove("hidden");mode("login");if(message)msg(message,type)}
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
    const cashCtx=await getCashStaffContext();
    if(!cashCtx.isStaff){
      await ensure();
      if(epoch!==st.authEpoch)return;
      await trial();
      if(epoch!==st.authEpoch)return;
      await chatLoad();
      if(epoch!==st.authEpoch)return;
    }
    applyCashierMode(!!cashCtx.isStaff);
    app.classList.remove("hidden");
    await loadBrandLogo();
    await view(cashCtx.isStaff?"cash":"home");
    if(cashCtx.isStaff) toast("Bienvenido, "+(cashCtx.staff?.display_name||"cajero")+" · caja lista","ok");
  }catch(e){
    if(epoch!==st.authEpoch)return;
    st.u=null;st.session=null;st.cid=null;
    app.classList.add("hidden");
    auth.classList.remove("hidden");
    msg(e?.message||"No se pudo cargar M.A.R.C.","error");
  }
}
async function submit(e){e.preventDefault();try{$("#authSubmit").disabled=true;msg("Procesando…");const email=$("#email").value.trim(),p=$("#password").value;if(authMode==="reset"){const cooldownKey="marc_password_reset_cooldown";const until=Number(localStorage.getItem(cooldownKey)||0);if(until>Date.now())throw new Error("Supabase ha limitado temporalmente el envío de correos de recuperación. Espera hasta que se restablezca el límite y vuelve a intentarlo.");const {error}=await S.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname+"?recovery=1"});if(error){if(authRateLimitMessage(error))localStorage.setItem(cooldownKey,String(Date.now()+60*60*1000));throw error}localStorage.removeItem(cooldownKey);msg("Revisa tu correo. El enlace te llevará a crear una nueva contraseña.","ok");return}if(authMode==="update"){if(!p||p.length<6)throw new Error("La nueva contraseña debe tener al menos 6 caracteres.");if(p!==$("#confirm").value)throw new Error("Las contraseñas no coinciden.");const {error}=await S.auth.updateUser({password:p});if(error)throw error;recoveryMode=false;history.replaceState({},document.title,location.pathname);await S.auth.signOut();resetUiToLogin("Contraseña actualizada. Ahora inicia sesión con tu nueva clave.","ok");return}if(authMode==="signup"){if(!p||p.length<6)throw new Error("La contraseña debe tener al menos 6 caracteres.");if(p!==$("#confirm").value)throw new Error("Las contraseñas no coinciden.");const rr=await fetch("/api/auth/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password:p})});const jj=await rr.json().catch(()=>({}));if(!rr.ok)throw new Error(jj.error||"No se pudo crear la cuenta.");const {error:loginError}=await S.auth.signInWithPassword({email,password:p});if(loginError)throw loginError;return}else{const {error}=await S.auth.signInWithPassword({email,password:p});if(error)throw error}}catch(e){const raw=String(e?.message||"");if(authRateLimitMessage(e))msg("Límite de correo de recuperación alcanzado. Supabase bloqueó temporalmente nuevos envíos. No sigas pulsando el botón; espera y vuelve a intentarlo más tarde.","error");else msg(raw||"No se pudo completar.","error")}finally{$("#authSubmit").disabled=false}}
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
function applyCashierMode(isCashier){
  document.body.classList.toggle("cashier-mode",!!isCashier);
  $$("#sidebar nav button,#mobileNav button").forEach(b=>{b.style.display=(!isCashier||b.dataset.view==="cash")?"":"none"});
  if($("#askTop"))$("#askTop").style.display=isCashier?"none":"";
  if($("#notificationBell"))$("#notificationBell").style.display=isCashier?"none":"";
  if($("#chat"))$("#chat").classList.toggle("cashier-hidden",!!isCashier);
}
function addBubble(type,text){const e=document.createElement("div");e.className="bubble "+type;e.textContent=text;$("#messages").appendChild(e);$("#messages").scrollTop=$("#messages").scrollHeight}
let __chatBusy=false;
async function chatSend(text){
  const raw=String(text||"").trim();
  if(!raw||__chatBusy)return;

  const normalized=raw.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .trim();

  if(/^(nueva cotizacion|\+ cotizacion|crear cotizacion)$/.test(normalized)){
    addBubble("u",raw); closeChat(); return quoteModal();
  }
  if(/^(inventario|revisar inventario|mostrar inventario)$/.test(normalized)){
    addBubble("u",raw); closeChat(); return inventory();
  }
  if(/^(cliente|buscar cliente)$/.test(normalized)){
    addBubble("u",raw); closeChat(); return clients();
  }
  if(/^(nuevo cliente)$/.test(normalized)){
    addBubble("u",raw); closeChat(); return clientModal();
  }
  if(/^(caja|cierre de caja|cerrar caja|abrir caja)$/.test(normalized)){
    addBubble("u",raw); closeChat(); return cash();
  }
  if(/^(publicidad|crear publicidad|marketing|banner)$/.test(normalized)){
    addBubble("u",raw); closeChat(); return marketing();
  }

  addBubble("u",raw);
  __chatBusy=true;
  const sendBtn=$("#chatForm button[type='submit']");
  if(sendBtn){sendBtn.disabled=true;sendBtn.classList.add("is-busy");}
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
    __chatBusy=false;
    if(sendBtn){sendBtn.disabled=false;sendBtn.classList.remove("is-busy");}
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
    if(r.ok&&j.action==="SCHEDULE_REMINDER"&&j.result?.status==="REMINDER_READY"&&window.MARCNotifications){
      window.MARCNotifications.reminder(j.result.title,j.result.body,j.result.when);
    }
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
  }finally{
    __chatBusy=false;
    if(sendBtn){sendBtn.disabled=false;sendBtn.classList.remove("is-busy");}
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
function title(x){$("#page").textContent={home:"Inicio",clients:"Clientes",inventory:"Inventario",suppliers:"Proveedores",quotes:"Cotizaciones",marketing:"Publicidad",settings:"Configuración",cash:"Cierre de caja"}[x]||"Inicio";$$(".sidebar nav button, #mobileNav button").forEach(b=>b.classList.toggle("active",b.dataset.view===x))}
let __viewBusy=false;
async function view(x){
  if(__viewBusy&&st.view===x)return;
  const content=$("#content");
  const run=async()=>{
    st.view=x;title(x);$("#sidebar").classList.remove("open");document.body.style.overflow="";
    if(window.innerWidth<=780)window.scrollTo(0,0);
    $$(".sidebar nav button,.mobile-bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===x));
    if(x==="home")return home();if(x==="clients")return clients();if(x==="inventory")return inventory();
    if(x==="suppliers"){if(window.marcSupplierCenter)return window.marcSupplierCenter();let tries=0;const wait=()=>{if(window.marcSupplierCenter)return window.marcSupplierCenter();if(++tries<30)return setTimeout(wait,100);return toast("No se pudo cargar el Centro de Proveedores. Recarga la aplicación.","err")};return wait();}
    if(x==="quotes")return quotes();if(x==="marketing")return marketing();if(x==="cash")return cash();return settings();
  };
  __viewBusy=true;
  content?.classList.add("view-switching");
  try{
    if(document.startViewTransition){
      await document.startViewTransition(()=>run()).finished;
    }else{
      await run();
    }
  }finally{
    requestAnimationFrame(()=>content?.classList.remove("view-switching"));
    __viewBusy=false;
  }
}
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
        <div class="hero-visual" aria-hidden="true">
          <div class="hero-visual-ring"></div>
          <div class="hero-visual-logo" id="heroBrandLogo"><span>M</span></div>
          <div class="hero-visual-caption">M.A.R.C. · TU MAYORDOMO DIGITAL</div>
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
            <button data-q="marketing"><span class="quick-icon blue">✦</span><div><b>Crear publicidad</b><small>Banner y mensajes con IA</small></div><em>→</em></button>
            <button data-q="chat"><span class="quick-icon dark">✦</span><div><b>Preguntar a M.A.R.C.</b><small>Ordenar o consultar</small></div><em>→</em></button>
            <button data-q="cash"><span class="quick-icon amber">▣</span><div><b>Cierre de caja</b><small>Abrir, registrar y cerrar</small></div><em>→</em></button>
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

  const heroLogo=$("#heroBrandLogo");
  if(heroLogo){
    // Imagen oficial del mayordomo M.A.R.C.: identidad visual fija del dashboard.
    heroLogo.innerHTML='<img src="./assets/marc-hero.jpg?v=20260920-01" alt="M.A.R.C., tu mayordomo digital">';
    heroLogo.classList.add("is-mascot");
  }
  $("#askHome").onclick=openChat;
  $("#heroQuote").onclick=quoteModal;
  $("#openInventory").onclick=inventory;
  $("#openQuotes").onclick=quotes;
  $$(".quick-modern-grid button",c).forEach(b=>b.onclick=()=>b.dataset.q==="client"?clientModal():b.dataset.q==="inventory"?inventoryModal():b.dataset.q==="quote"?quoteModal():b.dataset.q==="marketing"?marketing():b.dataset.q==="cash"?cash():openChat());
}

function modal(html){
  const root=$("#modal");
  if(!root)throw new Error("No existe el contenedor de modal.");
  root.innerHTML='<div class="modal">'+html+'</div>';
  root.classList.add("open");
  document.body.classList.add("modal-open");
  const close=()=>{
    root.classList.remove("open");
    root.innerHTML="";
    document.body.classList.remove("modal-open");
  };
  const x=root.querySelector(".close");
  if(x)x.onclick=close;
  return close;
}

function clientModal(existing=null){
  const isEdit=Boolean(existing?.id);
  const close=modal(
    '<div class="modal-head"><div><div class="eyebrow2">CLIENTE</div><h2>'+(isEdit?"Editar cliente":"Nuevo cliente")+'</h2><p>Guarda los datos que M.A.R.C. utilizará para cotizaciones, historial y seguimiento.</p></div><button class="close" id="clientClose" type="button">×</button></div>'+
    '<form id="clientForm" class="form-grid">'+
      '<label>Nombre o empresa<input name="name" required value="'+esc(existing?.name||"")+'" placeholder="Ej. Juan Pérez"></label>'+
      '<label>Persona de contacto<input name="contact_name" value="'+esc(existing?.contact_name||"")+'" placeholder="Nombre del contacto"></label>'+
      '<label>Documento<input name="document_number" value="'+esc(existing?.document_number||"")+'" placeholder="DNI / RUC"></label>'+
      '<label>Teléfono<input name="phone" value="'+esc(existing?.phone||"")+'" placeholder="+51 999 999 999"></label>'+
      '<label>Correo<input type="email" name="email" value="'+esc(existing?.email||"")+'" placeholder="cliente@correo.com"></label>'+
      '<label>Dirección<input name="address" value="'+esc(existing?.address||"")+'" placeholder="Dirección"></label>'+
      '<label style="grid-column:1/-1">Notas y condiciones<textarea name="notes" rows="4" placeholder="Condiciones, preferencias, acuerdos…">'+esc(existing?.notes||"")+'</textarea></label>'+
      '<div class="modal-actions" style="grid-column:1/-1"><button type="button" class="secondary" id="clientCancel">Cancelar</button><button type="submit" class="primary" id="clientSave">'+(isEdit?"Guardar cambios":"Crear cliente")+'</button></div>'+
    '</form>'
  );
  $("#clientClose").onclick=close;
  $("#clientCancel").onclick=close;
  $("#clientForm").onsubmit=async e=>{
    e.preventDefault();
    const b=$("#clientSave");b.disabled=true;
    try{
      const d=new FormData(e.currentTarget);
      const payload={name:String(d.get("name")||"").trim(),contact_name:String(d.get("contact_name")||"").trim()||null,document_number:String(d.get("document_number")||"").trim()||null,phone:String(d.get("phone")||"").trim()||null,email:String(d.get("email")||"").trim()||null,address:String(d.get("address")||"").trim()||null,notes:String(d.get("notes")||"").trim()||null,updated_at:new Date().toISOString()};
      if(!payload.name)throw new Error("Escribe el nombre del cliente.");
      let result;
      if(isEdit)result=await S.from("marc_clients").update(payload).eq("id",existing.id).eq("user_id",st.u.id);
      else result=await S.from("marc_clients").insert({...payload,user_id:st.u.id});
      if(result.error)throw result.error;
      close();toast(isEdit?"Cliente actualizado":"Cliente creado","ok");await clients();
    }catch(err){toast(err.message||"No se pudo guardar el cliente.","err");b.disabled=false}
  };
}

function inventoryModal(existing=null){
  const isEdit=Boolean(existing?.id);
  const close=modal(
    '<div class="modal-head"><div><div class="eyebrow2">INVENTARIO</div><h2>'+(isEdit?"Editar producto":"Nuevo producto")+'</h2><p>Completa los datos básicos. Puedes enriquecer la ficha después con fotos y análisis de M.A.R.C.</p></div><button class="close" id="inventoryClose" type="button">×</button></div>'+
    '<form id="inventoryForm" class="form-grid">'+
      '<label>Producto<input name="name" required value="'+esc(existing?.name||"")+'" placeholder="Ej. Cámara Hikvision 4MP"></label>'+
      '<label>SKU<input name="sku" value="'+esc(existing?.sku||"")+'" placeholder="Código interno"></label>'+
      '<label>Marca<input name="brand" value="'+esc(existing?.brand||"")+'" placeholder="Marca"></label>'+
      '<label>Modelo<input name="model" value="'+esc(existing?.model||"")+'" placeholder="Modelo"></label>'+
      '<label>Categoría<input name="category" value="'+esc(existing?.category||"")+'" placeholder="CCTV, redes, herramientas…"></label>'+
      '<label>Unidad<select name="unit"><option value="UND">UND</option><option value="M">M</option><option value="SERV">SERV</option><option value="KIT">KIT</option><option value="PAR">PAR</option></select></label>'+
      '<label>Precio de venta<input name="price" type="number" min="0" step="0.01" value="'+Number(existing?.price||0)+'"></label>'+
      '<label>Costo<input name="cost" type="number" min="0" step="0.01" value="'+Number(existing?.cost||0)+'"></label>'+
      '<label>Stock<input name="stock" type="number" min="0" step="1" value="'+Number(existing?.stock||0)+'"></label>'+
      '<label>Stock mínimo<input name="min_stock" type="number" min="0" step="1" value="'+Number(existing?.min_stock||0)+'"></label>'+
      '<label style="grid-column:1/-1">Descripción<textarea name="description" rows="4" placeholder="Descripción técnica o comercial">'+esc(existing?.description||"")+'</textarea></label>'+
      '<div class="modal-actions" style="grid-column:1/-1"><button type="button" class="secondary" id="inventoryCancel">Cancelar</button><button type="submit" class="primary" id="inventorySave">'+(isEdit?"Guardar cambios":"Agregar producto")+'</button></div>'+
    '</form>'
  );
  $("#inventoryClose").onclick=close;
  $("#inventoryCancel").onclick=close;
  $("#inventoryForm [name=unit]").value=existing?.unit||"UND";
  $("#inventoryForm").onsubmit=async e=>{
    e.preventDefault();
    const b=$("#inventorySave");b.disabled=true;
    try{
      const d=new FormData(e.currentTarget);
      const payload={name:String(d.get("name")||"").trim(),sku:String(d.get("sku")||"").trim()||null,brand:String(d.get("brand")||"").trim()||null,model:String(d.get("model")||"").trim()||null,category:String(d.get("category")||"").trim()||null,unit:String(d.get("unit")||"UND"),price:Number(d.get("price")||0),cost:Number(d.get("cost")||0),stock:Number(d.get("stock")||0),min_stock:Number(d.get("min_stock")||0),description:String(d.get("description")||"").trim()||null,updated_at:new Date().toISOString()};
      if(!payload.name)throw new Error("Escribe el nombre del producto.");
      let result;
      if(isEdit)result=await S.from("marc_inventory").update(payload).eq("id",existing.id).eq("user_id",st.u.id);
      else result=await S.from("marc_inventory").insert({...payload,user_id:st.u.id,active:true});
      if(result.error)throw result.error;
      close();toast(isEdit?"Producto actualizado":"Producto agregado","ok");await inventory();
    }catch(err){toast(err.message||"No se pudo guardar el producto.","err");b.disabled=false}
  };
}

function aiQuoteModal(){
  const close=modal(
    '<div class="modal-head"><div><div class="eyebrow2">M.A.R.C. IA</div><h2>Crear cotización con IA</h2><p>Escribe el pedido como lo dirías normalmente. M.A.R.C. preparará el contexto para la cotización.</p></div><button class="close" id="aiQuoteClose" type="button">×</button></div>'+
    '<form id="aiQuoteForm">'+
      '<label>Pedido del cliente<textarea id="aiQuoteText" rows="7" required placeholder="Ej.: Juan necesita 3 cámaras, instalación y configuración. El cliente pone el material."></textarea></label>'+
      '<div class="ad-smart-note"><span>✦</span><div><b>Lenguaje natural</b><small>Puedes escribir “sin IGV”, “a todo costo”, cantidades, trabajos y condiciones.</small></div></div>'+
      '<div class="modal-actions"><button type="button" class="secondary" id="aiQuoteCancel">Cancelar</button><button type="submit" class="primary" id="aiQuoteGo">Continuar con M.A.R.C.</button></div>'+
    '</form>'
  );
  $("#aiQuoteClose").onclick=close;
  $("#aiQuoteCancel").onclick=close;
  $("#aiQuoteForm").onsubmit=e=>{
    e.preventDefault();
    const text=$("#aiQuoteText").value.trim();
    if(!text)return;
    close();
    openChat();
    const input=$("#chatInput");
    if(input){input.value="Quiero crear una cotización: "+text;input.focus();input.dispatchEvent(new Event("input",{bubbles:true}));}
  };
}

async function clients(){
  const {data,error}=await S.from("marc_clients").select("*").eq("user_id",st.u.id).order("name");
  if(error)return toast(error.message,"err");
  const list=data||[],c=$("#content");
  c.innerHTML=`<div class="head"><div><div class="eyebrow2">CLIENTES</div><h1>Relaciones y contexto.</h1><p>Ahora cada cliente tiene una historia completa: cotizaciones, compras, productos, trabajos, pagos y notas.</p></div><button id="new" class="primary">＋ Nuevo cliente</button></div>
  <section class="client-summary">
    <div><span>CLIENTES REGISTRADOS</span><strong>${list.length}</strong><small>Base de contactos de M.A.R.C.</small></div>
    <div><span>CON HISTORIA</span><strong>${list.filter(x=>x.updated_at||x.created_at).length}</strong><small>Fichas con actividad registrada</small></div>
    <div><span>PORTAL DE CLIENTE</span><strong>${list.filter(x=>x.portal_enabled).length}</strong><small>Clientes con acceso compartido</small></div>
  </section>
  <section class="card table clients-browser"><div class="toolbar"><div class="search"><input id="search" placeholder="Buscar cliente, documento, correo o teléfono…"></div><button id="ask" class="secondary">✦ Preguntar</button></div>
    <div class="scroll clients-desktop"><table class="data"><thead><tr><th>Cliente</th><th>Contacto</th><th>Correo</th><th>Teléfono</th><th>Acciones</th></tr></thead><tbody id="rows"></tbody></table></div>
    <div id="clientCards" class="client-cards"></div>
  </section>`;
  const rows=$("#rows"),cards=$("#clientCards");
  const draw=(items)=>{
    rows.innerHTML=items.map(x=>`<tr><td><b>${esc(x.name)}</b><br><small>${esc(x.document_number||"")}</small></td><td>${esc(x.contact_name||"—")}</td><td>${esc(x.email||"—")}</td><td>${esc(x.phone||"—")}</td><td><button class="secondary" type="button" data-history="${x.id}">Ver historia</button> <button class="secondary" type="button" data-edit="${x.id}">Editar</button></td></tr>`).join("")||'<tr><td colspan="5" class="empty">Aún no tienes clientes.</td></tr>';
    cards.innerHTML=items.map(x=>`<article class="client-card"><div class="client-card-top"><div class="client-avatar">${esc(String(x.name||"C").split(/\s+/).filter(Boolean).slice(0,2).map(v=>v[0]).join("").toUpperCase())}</div><div class="client-card-name"><h3>${esc(x.name)}</h3><small>${esc(x.document_number||"Sin documento")}</small></div><button class="icon" type="button" data-history="${x.id}" aria-label="Ver historia del cliente">⌁</button></div><div class="client-details">${x.contact_name?`<div><span>Contacto</span><b>${esc(x.contact_name)}</b></div>`:""}${x.email?`<div><span>Correo</span><b>${esc(x.email)}</b></div>`:""}${x.phone?`<div><span>Teléfono</span><b><a class="client-contact-link" href="tel:${esc(x.phone)}">${esc(x.phone)}</a></b></div>`:""}${x.portal_enabled?'<div><span>Portal</span><b class="client-portal-active">Activo</b></div>':""}${(!x.contact_name&&!x.email&&!x.phone)?'<small class="client-empty">Sin datos adicionales registrados.</small>':""}</div><div class="client-card-actions"><button class="primary" type="button" data-history="${x.id}">Ver historia</button><button class="secondary" type="button" data-edit="${x.id}">Editar</button></div></article>`).join("")||'<div class="empty-state"><span>＋</span><b>Aún no tienes clientes</b><small>Crea tu primer cliente para comenzar.</small></div>';
  };
  draw(list);
  const filter=()=>{const q=($("#search").value||"").toLowerCase();draw(list.filter(x=>[x.name,x.email,x.phone,x.document_number,x.contact_name].some(v=>String(v||"").toLowerCase().includes(q))))};
  $("#search").oninput=filter;
  $("#new").onclick=()=>clientModal();
  $("#ask").onclick=()=>openChat();
  const handle=e=>{const b=e.target.closest("[data-history],[data-edit]");if(!b)return;const x=list.find(v=>v.id===(b.dataset.history||b.dataset.edit));if(!x)return;b.dataset.history?clientHistoryModal(x):clientModal(x)};
  cards.onclick=handle;rows.onclick=handle;
}

async function clientHistoryModal(client){
  const close=modal('<div class="modal-head"><div><h2>Historia del cliente</h2><p>Cargando toda la relación comercial y técnica…</p></div><button class="close" id="x">×</button></div><div id="clientHistoryBody" class="client-history-loading">Cargando…</div>');
  $("#x").onclick=close;
  try{
    const [quotesRes,reportsRes,historyRes]=await Promise.all([
      S.from("marc_quotes").select("id,number,title,status,total,tax_enabled,tax_rate,notes,created_at,updated_at").eq("user_id",st.u.id).eq("client_id",client.id).is("deleted_at",null).order("created_at",{ascending:false}),
      S.from("technical_reports").select("id,number,title,report_type,report_date,technician,location,equipment,problem,diagnosis,work_performed,recommendations,conclusions,observations,status,created_at").eq("user_id",st.u.id).eq("client_id",client.id).order("created_at",{ascending:false}),
      S.from("marc_client_history").select("id,event_type,title,description,metadata,visible_to_client,created_at").eq("user_id",st.u.id).eq("client_id",client.id).order("created_at",{ascending:false})
    ]);
    if(quotesRes.error)throw quotesRes.error;
    if(reportsRes.error)throw reportsRes.error;
    if(historyRes.error)throw historyRes.error;
    const quotes=quotesRes.data||[],reports=reportsRes.data||[],notes=historyRes.data||[];
    const ids=quotes.map(q=>q.id);
    let items=[];
    if(ids.length){
      const r=await S.from("marc_quote_items").select("quote_id,item_type,name,description,quantity,unit,unit_price,line_total").eq("user_id",st.u.id).in("quote_id",ids).order("created_at",{ascending:true});
      if(r.error)throw r.error;items=r.data||[];
    }
    const payments=ids.length?((await S.from("marc_cash_movements").select("id,type,amount,concept,reference,quote_id,created_at").eq("user_id",st.u.id).in("quote_id",ids).eq("type","INCOME").order("created_at",{ascending:false})).data||[]):[];
    const productMap=new Map();
    items.forEach(i=>{const k=String(i.name||"").trim();if(!k)return;const x=productMap.get(k)||{name:k,quantity:0,total:0};x.quantity+=Number(i.quantity||0);x.total+=Number(i.line_total||0);productMap.set(k,x)});
    const purchased=quotes.filter(q=>["ACEPTADA","COBRADA","FINALIZADO","APROBADO"].includes(String(q.status||"").toUpperCase()));
    const quotedTotal=quotes.reduce((s,q)=>s+Number(q.total||0),0);
    const paidTotal=payments.reduce((s,p)=>s+Number(p.amount||0),0);
    const body=$("#clientHistoryBody");
    body.innerHTML=`<div class="client-history-hero"><div><div class="client-avatar large">${esc(String(client.name||"C").split(/\s+/).filter(Boolean).slice(0,2).map(v=>v[0]).join("").toUpperCase())}</div></div><div class="client-history-main"><div class="eyebrow2">HISTORIA COMPLETA</div><h2>${esc(client.name)}</h2><p>${esc([client.document_number,client.phone,client.email].filter(Boolean).join(" · ")||"Sin datos de contacto")}</p></div><div class="client-history-actions"><button class="primary" id="shareClientPortal">Compartir portal</button><button class="secondary" id="addClientHistory">＋ Registrar nota</button><button class="secondary" id="editHistoryClient">Editar ficha</button></div></div>
    <div class="client-history-stats"><div><span>COTIZACIONES</span><b>${quotes.length}</b><small>Importe acumulado ${money(quotedTotal)}</small></div><div><span>COMPRAS / TRABAJOS</span><b>${purchased.length}</b><small>Partidas aceptadas o cobradas</small></div><div><span>PAGADO</span><b>${money(paidTotal)}</b><small>Ingresos vinculados</small></div><div><span>INFORMES</span><b>${reports.length}</b><small>Historial técnico</small></div></div>
    <div class="client-history-grid">
      <section class="client-history-panel"><div class="panel-title-row"><div><div class="eyebrow2">PRODUCTOS Y SERVICIOS</div><h3>Lo que este cliente ha solicitado</h3></div></div><div class="client-product-list">${[...productMap.values()].map(x=>`<div><b>${esc(x.name)}</b><span>${Number(x.quantity).toLocaleString("es-PE")} · ${money(x.total)}</span></div>`).join("")||'<div class="empty">Todavía no hay partidas registradas.</div>'}</div></section>
      <section class="client-history-panel"><div class="panel-title-row"><div><div class="eyebrow2">CONDICIONES Y NOTAS</div><h3>Contexto del cliente</h3></div></div><div class="client-notes-list">${client.notes?`<article><b>Ficha del cliente</b><p>${esc(client.notes)}</p></article>`:""}${quotes.filter(q=>q.notes).slice(0,10).map(q=>`<article><b>${esc(q.number||q.title)}</b><p>${esc(q.notes)}</p></article>`).join("")}${notes.map(n=>`<article><b>${esc(n.title)}</b><p>${esc(n.description||"")}</p><small>${new Date(n.created_at).toLocaleString("es-PE")}${n.visible_to_client?" · visible al cliente":""}</small></article>`).join("")||(!client.notes&&!quotes.some(q=>q.notes)?'<div class="empty">No hay condiciones o notas registradas.</div>':"")}</div></section>
      <section class="client-history-panel full"><div class="panel-title-row"><div><div class="eyebrow2">COMPRAS Y COTIZACIONES</div><h3>Historial comercial</h3></div></div><div class="client-quote-list">${quotes.map(q=>`<article><div><b>${esc(q.number||"Cotización")}</b><strong>${money(q.total)}</strong></div><p>${esc(q.title||"Sin título")} · ${esc(q.status||"")}</p><small>${new Date(q.created_at).toLocaleString("es-PE")}</small><div class="client-quote-items">${items.filter(i=>i.quote_id===q.id).map(i=>`<span>${esc(i.name||"Partida")} × ${Number(i.quantity||0).toLocaleString("es-PE")} · ${money(i.line_total)}</span>`).join("")}</div></article>`).join("")||'<div class="empty">No hay cotizaciones para este cliente.</div>'}</div></section>
      <section class="client-history-panel full"><div class="panel-title-row"><div><div class="eyebrow2">TRABAJOS E INFORMES</div><h3>Historial técnico</h3></div></div><div class="client-report-list">${reports.map(r=>`<article><div><b>${esc(r.number||r.title||"Informe")}</b><span>${esc(r.status||"")}</span></div><p>${esc(r.work_performed||r.conclusions||r.observations||"Sin detalle")}</p><small>${esc(r.report_date||r.created_at||"")} · ${esc(r.technician||"")}</small></article>`).join("")||'<div class="empty">No hay informes técnicos vinculados.</div>'}</div></section>
    </div>`;
    $("#editHistoryClient").onclick=()=>{close();clientModal(client)};
    $("#shareClientPortal").onclick=()=>clientPortalShare(client);
    $("#addClientHistory").onclick=async()=>{
      const title=prompt("Título de la nota","Condición / acuerdo con el cliente");
      if(!title?.trim())return;
      const description=prompt("Detalle de la condición, acuerdo, visita o seguimiento","");
      const visible=confirm("¿Esta nota también debe verla el cliente desde su portal?");
      const r=await S.from("marc_client_history").insert({user_id:st.u.id,client_id:client.id,event_type:"NOTE",title:title.trim(),description:description||null,visible_to_client:visible,metadata:{}});
      if(r.error)return toast(r.error.message,"err");
      toast("Nota registrada","ok");close();clientHistoryModal(client);
    };
  }catch(err){
    $("#clientHistoryBody").innerHTML='<div class="msg error">'+esc(err.message||"No se pudo cargar la historia del cliente.")+'</div>';
  }
}

async function clientPortalShare(client){
  const loading=modal('<div class="modal-head"><div><h2>Portal de '+esc(client.name)+'</h2><p>Genera un enlace privado para que el cliente consulte su propia historia.</p></div><button class="close" id="x">×</button></div><div class="client-portal-share"><div class="client-portal-warning">El cliente verá cotizaciones, productos/servicios, informes y notas marcadas como visibles. No verá costos internos, utilidad ni datos de otros clientes.</div><div id="portalStatus" class="msg">Generando enlace…</div><div class="client-portal-url" id="portalUrl"></div><div class="modal-actions"><button class="secondary" id="copyPortal" disabled>Copiar enlace</button><button class="primary" id="sendPortal" disabled>Compartir</button><button class="danger" id="revokePortal">Revocar acceso</button></div></div>');
  $("#x").onclick=loading;
  const status=$("#portalStatus"),urlBox=$("#portalUrl"),copy=$("#copyPortal"),send=$("#sendPortal"),revoke=$("#revokePortal");
  let portalUrl="";
  try{
    const r=await fetch("/api/client-portal/create",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+st.session?.access_token},body:JSON.stringify({clientId:client.id})});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||j.error||"No se pudo generar el portal.");
    portalUrl=j.portalUrl||"";urlBox.textContent=portalUrl;copy.disabled=!portalUrl;send.disabled=!portalUrl;status.className="msg ok";status.textContent="Portal activo. Puedes enviar este enlace al cliente.";
    copy.onclick=async()=>{await navigator.clipboard?.writeText(portalUrl);toast("Enlace del portal copiado","ok")};
    send.onclick=async()=>{try{if(navigator.share)await navigator.share({title:"Portal de "+client.name,text:"Consulta tu historial con M.A.R.C.",url:portalUrl});else{await navigator.clipboard?.writeText(portalUrl);toast("Enlace copiado para compartir","ok")}}catch(e){if(e?.name!=="AbortError")toast("No se pudo compartir el enlace.","err")}};
  }catch(e){status.className="msg error";status.textContent=e.message||"No se pudo generar el enlace."}
  revoke.onclick=async()=>{if(!confirm("¿Revocar el acceso de este cliente? El enlace dejará de funcionar."))return;revoke.disabled=true;try{const r=await fetch("/api/client-portal/revoke",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+st.session?.access_token},body:JSON.stringify({clientId:client.id})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||j.error||"No se pudo revocar.");loading();toast("Portal revocado","ok")}catch(e){revoke.disabled=false;toast(e.message||"No se pudo revocar","err")}};
}

async function renderClientPortal(token){
  document.body.innerHTML='<main class="client-portal-page"><div id="clientPortalApp" class="client-portal-shell"><div class="client-portal-loading">Cargando portal seguro…</div></div></main>';
  try{
    const r=await fetch("/api/client-portal/view?token="+encodeURIComponent(token));
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||j.error||"Enlace inválido o vencido.");
    const c=j.client||{},co=j.company||{},s=j.summary||{};
    document.title="Portal · "+(c.name||"Cliente");
    const logo=co.logo_data?`<img src="${esc(co.logo_data)}" alt="Logo">`:"";
    $("#clientPortalApp").innerHTML=`<header class="client-portal-header"><div class="client-portal-brand">${logo}<div><b>${esc(co.business_name||"M.A.R.C.")}</b><small>Portal de cliente</small></div></div><div class="client-portal-contact">${esc([co.phone,co.email].filter(Boolean).join(" · ")||"")}</div></header>
      <section class="client-portal-welcome"><div class="eyebrow2">TU HISTORIA</div><h1>Hola, ${esc(c.name||"cliente")}.</h1><p>Aquí puedes consultar tu relación con la empresa: cotizaciones, compras, productos, servicios e informes.</p></section>
      <section class="client-portal-stats"><div><span>COTIZACIONES</span><b>${s.quotes||0}</b></div><div><span>COMPRAS / TRABAJOS</span><b>${s.accepted||0}</b></div><div><span>TOTAL COTIZADO</span><b>${money(s.quotedTotal)}</b></div><div><span>INFORMES</span><b>${s.reports||0}</b></div></section>
      <section class="client-portal-section"><div class="eyebrow2">PRODUCTOS Y SERVICIOS</div><h2>Lo que hemos trabajado contigo</h2><div class="client-portal-products">${(s.products||[]).map(p=>`<span>${esc(p.name||"Producto")}</span>`).join("")||'<small>No hay productos registrados todavía.</small>'}</div></section>
      <section class="client-portal-section"><div class="eyebrow2">COTIZACIONES</div><h2>Historial comercial</h2><div class="client-portal-list">${(j.quotes||[]).map(q=>`<article><div><b>${esc(q.number||"Cotización")}</b><strong>${money(q.total)}</strong></div><p>${esc(q.title||"")} · ${esc(q.status||"")}</p><small>${new Date(q.created_at).toLocaleString("es-PE")}</small><div>${(q.items||[]).map(i=>`<span class="client-portal-item">${esc(i.name||"Partida")} × ${Number(i.quantity||0).toLocaleString("es-PE")} · ${money(i.line_total)}</span>`).join("")}</div>${q.notes?`<p class="client-portal-note">${esc(q.notes)}</p>`:""}</article>`).join("")||'<div class="empty">Todavía no hay cotizaciones.</div>'}</div></section>
      <section class="client-portal-section"><div class="eyebrow2">INFORMES Y TRABAJOS</div><h2>Historial técnico</h2><div class="client-portal-list">${(j.reports||[]).map(r=>`<article><div><b>${esc(r.number||r.title||"Informe")}</b><span>${esc(r.status||"")}</span></div><p>${esc(r.work_performed||r.conclusions||r.observations||"Sin detalle")}</p><small>${esc(r.report_date||r.created_at||"")} · ${esc(r.technician||"")}</small></article>`).join("")||'<div class="empty">Todavía no hay informes técnicos.</div>'}</div></section>
      <section class="client-portal-section"><div class="eyebrow2">HISTORIA</div><h2>Actividad registrada</h2><div class="client-portal-timeline">${(j.history||[]).map(h=>`<article><i></i><div><b>${esc(h.title)}</b><p>${esc(h.description||"")}</p><small>${new Date(h.created_at).toLocaleString("es-PE")}</small></div></article>`).join("")||'<div class="empty">Aún no hay actividad adicional.</div>'}</div></section>
      <footer class="client-portal-footer">Portal privado de ${esc(co.business_name||"M.A.R.C.")}. Solo muestra información compartida con este cliente.</footer>`;
  }catch(e){$("#clientPortalApp").innerHTML='<div class="client-portal-error"><h1>Portal no disponible</h1><p>'+esc(e.message||"El enlace no es válido.")+'</p></div>'}
}

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
    const normalize=s=>String(s||"").replace(/\s+/g," ").trim();
    const generic=/^(sku|codigo|código|producto|descripción|descripcion|precio|página|pagina|pag\.?|total|subtotal|oferta|descuento)$/i;
    const priceRe=/^(?:S\/?|US\$|\$|€|EUR)?\s*\d{1,6}(?:[.,]\d{1,3}){0,2}$/i;
    const parsePrice=s=>{
      const raw=normalize(s).replace(/^(?:S\/?|US\$|\$|€|EUR)\s*/i,"");
      if(!/^\d[\d.,]*$/.test(raw))return null;
      let value;
      if(raw.includes(",")&&raw.includes(".")){
        const lastComma=raw.lastIndexOf(","),lastDot=raw.lastIndexOf(".");
        const decimalSep=lastComma>lastDot?",":".";
        const thousandsSep=decimalSep===","?".":",";
        value=Number(raw.replace(new RegExp("\\"+thousandsSep,"g"),"").replace(decimalSep,"."));
      }else if(raw.includes(",")){
        const parts=raw.split(",");
        value=parts[parts.length-1].length<=2?Number(parts.slice(0,-1).join("")+"."+parts.at(-1)):Number(parts.join(""));
      }else if(raw.includes(".")){
        const parts=raw.split(".");
        value=parts[parts.length-1].length<=2?Number(parts.slice(0,-1).join("")+"."+parts.at(-1)):Number(parts.join(""));
      }else value=Number(raw);
      return Number.isFinite(value)&&value>=0?value:null;
    };
    const hasCurrency=s=>/^(?:S\/?|US\$|\$|€|EUR)\s*/i.test(normalize(s));
    const primaryCandidates=items
      .filter(x=>x.x>width*.62&&priceRe.test(normalize(x.text)))
      .map(x=>({...x,price:parsePrice(x.text),currency:hasCurrency(x.text)}))
      .filter(x=>x.price!==null);

    // Algunos catálogos colocan el precio debajo/encima del nombre o en una
    // columna intermedia. Solo activamos este fallback cuando no existe una
    // columna de precios clara; exigimos moneda para no confundir páginas,
    // teléfonos u otros números con precios.
    const fallbackCandidates=items
      .filter(x=>x.x>width*.25&&priceRe.test(normalize(x.text))&&hasCurrency(x.text))
      .map(x=>({...x,price:parsePrice(x.text),currency:true}))
      .filter(x=>x.price!==null);

    const candidates=(primaryCandidates.length?primaryCandidates:fallbackCandidates)
      .sort((a,b)=>b.y-a.y||b.x-a.x);

    if(!candidates.length)return {rows:[],text:items.map(x=>x.text).join("\n"),usedLocal:false};

    const rows=[];
    const consumed=new Set();

    for(const p of candidates){
      const pKey=p.text+"|"+p.x+"|"+p.y;
      if(consumed.has(pKey))continue;

      // Agrupa precios de la misma fila. Si hay precio normal + oferta, toma el
      // que está más a la derecha; suele ser el precio final publicado.
      const rowRadius=5;
      const sameRow=candidates.filter(q=>Math.abs(q.y-p.y)<=rowRadius);
      const chosen=sameRow.slice().sort((a,b)=>{
        if(Boolean(a.currency)!==Boolean(b.currency))return a.currency?-1:1;
        return b.x-a.x;
      })[0]||p;
      sameRow.forEach(q=>consumed.add(q.text+"|"+q.x+"|"+q.y));

      const prev=candidates.find(q=>q.y>chosen.y);
      const next=candidates.find(q=>q.y<chosen.y);
      const gapPrev=prev?Math.abs(prev.y-chosen.y):0;
      const gapNext=next?Math.abs(chosen.y-next.y):0;
      const nearest=Math.min(gapPrev||999,gapNext||999);
      const radius=Math.max(9,Math.min(34,nearest===999?20:nearest*.64));
      const rowItems=items.filter(x=>Math.abs(x.y-chosen.y)<=radius);

      // Delimita la columna del producto usando las posiciones de los precios.
      // En catálogos de varias columnas, esto evita que el nombre de la columna
      // vecina termine fusionado con el producto actual.
      const priceXs=[...new Set(candidates.map(x=>Math.round(x.x)))].sort((a,b)=>a-b);
      const leftPrice=priceXs.filter(x=>x<chosen.x).at(-1);
      const rightPrice=priceXs.find(x=>x>chosen.x);
      const columnLeft=leftPrice===undefined?0:(leftPrice+chosen.x)/2;
      const columnRight=rightPrice===undefined?width:(chosen.x+rightPrice)/2;
      const nameItems=rowItems
        .filter(x=>x.x>=columnLeft-6 && x.x<Math.min(columnRight-8,chosen.x-8) && !priceRe.test(normalize(x.text)))
        .sort((a,b)=>a.y-b.y||a.x-b.x);
      const nameParts=[...new Set(nameItems.map(x=>normalize(x.text)))].filter(x=>x&&!generic.test(x));
      const name=nameParts.join(" ").replace(/\s+/g," ").trim();
      const leftTextCount=nameParts.length;
      if(leftTextCount===0)continue;

      // El código/SKU se busca en una zona más conservadora y se excluyen
      // explícitamente las celdas de precio para no convertir precios/páginas en SKU.
      const codeItems=rowItems
        .filter(x=>x.x>=columnLeft-6&&x.x<Math.min(columnRight-8,chosen.x-8)&&!priceRe.test(normalize(x.text)))
        .sort((a,b)=>a.y-b.y||a.x-b.x);
      const codeText=[...new Set(codeItems.map(x=>normalize(x.text)))].join(" ").replace(/\s+/g," ").trim();

      if(!name||name.length<3||generic.test(name))continue;

      const skuMatch=codeText.match(/\b(?:[A-Z]{1,8}[A-Z0-9]*[-_/][A-Z0-9._/-]{1,24}|\d{5,18})\b/i);
      const sku=skuMatch?.[0]||null;
      const variant=codeText
        .replace(skuMatch?.[0]||"","")
        .replace(/\b(?:S\/?|US\$|\$|€|EUR)\s*[\d.,]+\b/gi,"")
        .replace(/\s+/g," ").trim();
      const fullName=[name,variant].filter(Boolean).join(" ").replace(/\s+/g," ").trim();
      if(fullName.length<3)continue;

      // Para fotos no usamos la columna de precio: solo el bloque de nombre/código,
      // evitando capturar la ficha del producto vecino.
      const photoItems=rowItems.filter(x=>x.x>=columnLeft-6&&x.x<Math.min(columnRight-8,chosen.x-8));
      const photoXs=photoItems.map(x=>x.x).filter(Number.isFinite);
      const photoLeft=photoXs.length?Math.max(0,Math.min(...photoXs)-18):0;
      const photoRight=photoXs.length?Math.min(width,Math.max(...photoXs)+24):Math.min(width,chosen.x-12);
      const photoWidth=Math.max(80,photoRight-photoLeft);

      rows.push({
        sku,
        name:fullName.slice(0,180),
        brand:null,
        model:sku,
        category:null,
        unit:"UND",
        cost:null,
        price:chosen.price,
        stock:null,
        min_stock:null,
        pdf_y:chosen.y,
        pdf_radius:radius,
        pdf_x:photoLeft,
        pdf_width:photoWidth
      });
    }

    const clean=[],seen=new Set();
    for(const row of rows){
      const key=((row.sku||"")+"|"+row.name+"|"+row.price).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
      if(seen.has(key))continue;
      seen.add(key);
      clean.push(row);
    }
    return {rows:clean,text:items.map(x=>x.text).join("\n"),usedLocal:clean.length>0};
  }catch{
    return {rows:[],text:"",usedLocal:false};
  }
}
// Expuesto para que el Centro de Proveedores utilice exactamente el mismo
// lector PDF local que Inventario, evitando dos analizadores distintos.
window.MARC_PDF_CATALOG_READER=window.MARC_PDF_CATALOG_READER||{};
window.MARC_PDF_CATALOG_READER.extractRows=extractPdfCatalogRows;
window.MARC_PDF_CATALOG_READER.extractPageText=extractPdfPageText;

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
      const failedPages=[];
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

        const settled=await Promise.allSettled(batch.map(async pageNumber=>{
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

        failedPages.push(...settled.filter(x=>x.status==="rejected").map((x,idx)=>({pageNumber:batch[idx],error:x.reason?.message||"Error desconocido"})));
        const results=settled.filter(x=>x.status==="fulfilled").map(x=>x.value);
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

      if(failedPages.length){
        status.className="msg error";
        status.textContent="No se pudo analizar "+failedPages.length+" página(s): "+failedPages.map(x=>"P"+x.pageNumber).join(", ")+". La importación queda bloqueada para evitar faltantes.";
        $("#pdfProgressCount").textContent=detected.length+" productos detectados · "+failedPages.length+" páginas con error";
        const detail=failedPages.map(x=>"P"+x.pageNumber+": "+x.error).join("\n");
        throw new Error("No se pudieron analizar todas las páginas.\n\n"+detail+"\n\nNo se importó ningún producto.");
      }
      status.className="msg ok";
      status.textContent="Análisis terminado. Revisa exactamente qué productos serán procesados antes de importarlos.";
      $("#pdfProgressText").textContent="Lectura terminada · "+totalPages+" páginas";
      $("#pdfProgressCount").textContent=detected.length+" productos detectados";

      // Consolidación global: un mismo producto puede aparecer en varias páginas del catálogo.
      // Conservamos el primer registro y completamos campos faltantes con datos posteriores.
      const mergedItems=[];
      const mergedByKey=new Map();
      const duplicateGroups=[];
      const normalizeKey=v=>String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
      const mergeWords=v=>new Set(normalizeKey(v).split(" ").filter(w=>w.length>1));
      const variantTokens=v=>{
        const s=normalizeKey(v);
        const out=new Set();
        // Resolución, almacenamiento, distancia focal, velocidad y otras
        // especificaciones que identifican variantes distintas.
        const patterns=[
          /\b\d+(?:\.\d+)?\s*(?:mp|megapixel|gb|tb|mb|mm|cm|m|x|w|v|a|hz|mah|mah)\b/g,
          /\b(?:2mp|4mp|5mp|8mp|12mp|16mp|32gb|64gb|128gb|256gb|512gb|1tb|2tb)\b/g,
          /\b(?:blanco|negro|white|black|rojo|roja|azul|verde|gris|plata|dorado|gold|silver)\b/g,
          /\b(?:2\.8|3\.6|4|6|8|12|16)\s*mm\b/g
        ];
        patterns.forEach(re=>{const m=s.match(re)||[];m.forEach(x=>out.add(x.replace(/\s+/g," ")));});
        return out;
      };
      const strongDuplicateIdentity=(a,b)=>{
        const nameA=normalizeKey(a.name),nameB=normalizeKey(b.name);
        const brandA=normalizeKey(a.brand),brandB=normalizeKey(b.brand);
        const modelA=normalizeKey(a.model),modelB=normalizeKey(b.model);
        return !!nameA&&nameA===nameB&&(!brandA||!brandB||brandA===brandB)&&(!modelA||!modelB||modelA===modelB);
      };
      const fuzzyDuplicate=(a,b)=>{
        // Una identidad textual fuerte permite consolidar aunque una página
        // haya omitido o leído un SKU diferente; el SKU queda como conflicto.
        if(strongDuplicateIdentity(a,b))return true;
        if(normalizeKey(a.sku)||normalizeKey(b.sku))return false;
        const brandA=normalizeKey(a.brand),brandB=normalizeKey(b.brand);
        const modelA=normalizeKey(a.model),modelB=normalizeKey(b.model);
        if(brandA&&brandB&&brandA!==brandB)return false;
        if(modelA&&modelB&&modelA!==modelB)return false;
        const variantsA=variantTokens([a.name,a.model].filter(Boolean).join(" "));
        const variantsB=variantTokens([b.name,b.model].filter(Boolean).join(" "));
        for(const token of new Set([...variantsA,...variantsB])){
          if(variantsA.has(token)!==variantsB.has(token))return false;
        }
        const na=normalizeKey(a.name),nb=normalizeKey(b.name);
        if(!na||!nb)return false;
        if(na===nb)return true;
        const compactA=na.replace(/\s/g,""),compactB=nb.replace(/\s/g,"");
        if((compactA.includes(compactB)||compactB.includes(compactA))&&Math.min(compactA.length,compactB.length)/Math.max(compactA.length,compactB.length)>=.82)return true;
        const wa=mergeWords(a.name),wb=mergeWords(b.name);
        const inter=[...wa].filter(x=>wb.has(x)).length;
        const union=new Set([...wa,...wb]).size;
        return union>0&&inter/union>=.86&&inter>=3;
      };
      const registerDuplicate=(existing,item)=>{
        existing._sourcePages=Array.from(new Set([...(existing._sourcePages||[]),Number(item.page_number||1)]));
        existing._duplicateCount=(existing._duplicateCount||0)+1;
        if(!existing._duplicateSources)existing._duplicateSources=[];
        existing._duplicateSources.push({page:Number(item.page_number||1),name:item.name,sku:item.sku,price:item.price});
        if(existing.price!=null&&item.price!=null&&Number(existing.price)!==Number(item.price)){
          existing._priceConflict=true;
          if(!existing._priceConflicts)existing._priceConflicts=[];
          existing._priceConflicts.push({page:Number(item.page_number||1),price:Number(item.price),previous:Number(existing.price)});
        }
        ["sku","name","brand","model","category"].forEach(k=>{
          const a=normalizeKey(existing[k]), b=normalizeKey(item[k]);
          if(a&&b&&a!==b){
            existing._fieldConflicts=existing._fieldConflicts||{};
            existing._fieldConflicts[k]=existing._fieldConflicts[k]||[{page:Number(existing.page_number||1),value:existing[k]}];
            existing._fieldConflicts[k].push({page:Number(item.page_number||1),value:item[k]});
          }
          if(!a&&b)existing[k]=item[k];
        });
        ["unit","cost","stock","min_stock","price","page_number"].forEach(k=>{
          if((existing[k]===null||existing[k]===undefined||existing[k]==="")&&(item[k]!==null&&item[k]!==undefined&&item[k]!==""))existing[k]=item[k];
        });
      };
      for(const rawItem of detected){
        const item=Object.assign({},rawItem);
        const skuKey=normalizeKey(item.sku);
        const identity=skuKey
          ? "sku:"+skuKey
          : "name:"+normalizeKey([item.name,item.brand,item.model].filter(Boolean).join("|"));
        if(!identity||identity==="name:")continue;
        let existing=mergedByKey.get(identity);
        if(!existing){
          // Segunda capa: primero busca una identidad textual fuerte incluso
          // cuando el SKU falta o difiere; después aplica fuzzy conservador.
          existing=mergedItems.find(x=>strongDuplicateIdentity(x,item));
          if(!existing&&!skuKey){
            existing=mergedItems.find(x=>!normalizeKey(x.sku)&&fuzzyDuplicate(x,item));
          }
        }
        if(existing){
          registerDuplicate(existing,item);
          continue;
        }
        item._sourcePages=[Number(item.page_number||1)];
        item._duplicateCount=0;
        item._duplicateSources=[];
        mergedByKey.set(identity,item);
        mergedItems.push(item);
      }
      for(const item of mergedItems){
        if(item._duplicateCount)duplicateGroups.push(item);
      }
      const listItems=mergedItems;
      const duplicateCount=Math.max(0,detected.length-listItems.length);
      const fieldConflictCount=duplicateGroups.filter(x=>x._fieldConflicts&&Object.keys(x._fieldConflicts).length).length;
      const fieldLabels={sku:"SKU",name:"nombre",brand:"marca",model:"modelo",category:"categoría"};
      const fieldConflictDetail=duplicateGroups.map(x=>{
        const fields=Object.keys(x._fieldConflicts||{});
        if(!fields.length)return "";
        const options=fields.map(k=>{
          const vals=x._fieldConflicts[k]||[];
          const unique=[];
          vals.forEach(v=>{if(v.value!=null&&!unique.some(u=>normalizeKey(u.value)===normalizeKey(v.value)))unique.push(v)});
          return '<div class="pdf-field-choice"><b>'+fieldLabels[k]+'</b>'+unique.map((v,i)=>'<label><input type="radio" name="pdf-field-'+normalizeKey(x.sku||x.name)+'-'+k+'" data-pdf-field-product="'+normalizeKey(x.sku||x.name)+'" data-pdf-field="'+k+'" data-pdf-field-value="'+esc(String(v.value))+'" '+(i===0?'checked':'')+'> '+esc(String(v.value))+' <small>(P'+Number(v.page||1)+')</small></label>').join("")+'</div>';
        }).join("");
        return '<details class="pdf-duplicate-detail"><summary>'+esc(x.name)+' · conflictos de datos</summary><div>'+options+'</div></details>';
      }).join("");
      const priceConflictCount=duplicateGroups.filter(x=>x._priceConflict).length;
      const duplicateDetail=duplicateGroups.map(x=>{
        const pages=(x._sourcePages||[]).sort((a,b)=>a-b).join(", ");
        const conflict=x._priceConflict?' · ⚠️ precios distintos':'';
        const prices=[x.price,...(x._priceConflicts||[]).map(p=>p.price)].filter(v=>v!=null&&!Number.isNaN(Number(v))).map(Number);
        const uniquePrices=[...new Set(prices)];
        const options=uniquePrices.map((price,i)=>'<label class="pdf-price-option"><input type="radio" name="pdf-price-'+esc(normalizeKey(x.sku||x.name))+'" data-pdf-price="'+price+'" data-pdf-product="'+esc(normalizeKey(x.sku||x.name))+'" '+(i===0?'checked':'')+'> S/ '+price.toFixed(2)+'</label>').join("");
        return '<details class="pdf-duplicate-detail"><summary>'+esc(x.name)+' · '+x._duplicateCount+' duplicado(s) · páginas '+esc(pages)+conflict+'</summary><div>'+
          (x._duplicateSources||[]).map(d=>'P'+Number(d.page||1)+' · '+esc([d.sku,d.price!=null?"S/ "+Number(d.price).toFixed(2):"Precio no detectado"].filter(Boolean).join(" · "))).join("<br>")+
          (x._priceConflict?'<div class="pdf-price-choice"><b>Elige el precio que se importará:</b>'+options+'</div>':'')+
          '</div></details>';
      }).join("");
      const preview=$("#pdfImportPreview");
      const missingPriceCount=listItems.filter(x=>x.price==null||Number.isNaN(Number(x.price))).length;
      const missingSkuCount=listItems.filter(x=>!String(x.sku||"").trim()).length;
      const photoReadyCount=listItems.filter(x=>x.pdf_y!=null&&x.pdf_x!=null&&x.pdf_width!=null).length;
      preview.innerHTML=
        '<div class="pdf-final-summary"><strong>Se procesarán '+listItems.length+' productos únicos</strong><span>'+totalPages+' páginas revisadas'+(duplicateCount?' · '+duplicateCount+' duplicados consolidados':'')+'</span></div>'+
        '<div class="pdf-import-checks">'+
          '<span>📄 '+listItems.length+' productos</span>'+
          '<span>💰 '+(listItems.length-missingPriceCount)+' con precio</span>'+
          '<span>🏷️ '+(listItems.length-missingSkuCount)+' con SKU</span>'+
          '<span>📷 '+photoReadyCount+' con zona de foto detectada</span>'+
        '</div>'+
        (fieldConflictCount?'<div class="msg error">⚠️ '+fieldConflictCount+' producto(s) tienen diferencias de SKU, nombre, marca, modelo o categoría. Revísalas en “conflictos de datos”.</div>':'')+
        (priceConflictCount?'<div class="msg error">⚠️ '+priceConflictCount+' producto(s) aparecen con precios diferentes en distintas páginas. M.A.R.C. conserva el primer precio detectado y los marca para revisión.</div>':'')+
        (missingPriceCount?'<div class="msg error">⚠️ '+missingPriceCount+' producto(s) no tienen precio detectado. Puedes importarlos y completar el precio después.</div>':'')+
        '<label class="pdf-photo-option"><input type="checkbox" id="keepPdfProductPhotos" checked> Conservar la foto del producto desde el PDF cuando la página contenga imágenes</label>'+
        '<div class="pdf-product-list">'+
          listItems.map((x,i)=>{
            const price=x.price!=null&&!Number.isNaN(Number(x.price))?'S/ '+Number(x.price).toFixed(2):'Precio no detectado';
            const code=String(x.sku||'').trim()||'Sin SKU';
            const model=String(x.model||'').trim();
            const pages=(x._sourcePages||[Number(x.page_number||1)]).sort((a,b)=>a-b);
            const source=pages.length>1?'Páginas '+pages.join(", "):'Página '+pages[0];
            const photo=x.pdf_y!=null&&x.pdf_x!=null&&x.pdf_width!=null?'📷 Foto PDF':'Sin zona de foto';
            const dup=x._duplicateCount?' · '+x._duplicateCount+' duplicado(s)':'';
            return '<div class="pdf-product-row"><div><b>'+(i+1)+'.</b> '+esc(x.name)+'</div><small>'+esc(source)+' · '+esc(code)+(model&&model!==code?' · '+esc(model):'')+' · '+esc(price)+' · '+photo+esc(dup)+'</small></div>';
          }).join("")+
        '</div>'+
        (duplicateGroups.length?'<div class="pdf-duplicates"><strong>Duplicados consolidados</strong>'+duplicateDetail+'</div>':'');
      preview.classList.remove("hidden");

      preview.querySelectorAll("input[data-pdf-field]").forEach(function(input){
        input.addEventListener("change",function(){
          const productKey=input.dataset.pdfFieldProduct, field=input.dataset.pdfField, value=input.dataset.pdfFieldValue;
          const product=listItems.find(x=>normalizeKey(x.sku||x.name)===productKey);
          if(product&&field)value&&(product[field]=value);
        });
      });

      preview.querySelectorAll("input[data-pdf-price]").forEach(function(input){
        input.addEventListener("change",function(){
          const key=input.dataset.pdfProduct;
          const product=listItems.find(x=>normalizeKey(x.sku||x.name)===key);
          if(product)product.price=Number(input.dataset.pdfPrice);
        });
      });

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
        const normalize=v=>String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
        for(const pageKey of Object.keys(byPage)){
          const pageNumber=Number(pageKey);
          try{
            const page=await pdf.getPage(pageNumber);
            const viewport=page.getViewport({scale:1.5});
            const canvas=document.createElement("canvas");
            canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
            const ctx=canvas.getContext("2d",{alpha:false});
            await page.render({canvasContext:ctx,viewport}).promise;

            for(const item of byPage[pageKey]){
              try{
                const centerY=viewport.height-(Number(item.pdf_y)||0)*1.5;
                const halfH=Math.max(24,Number(item.pdf_radius||22))*1.5+12;
                const y=Math.max(0,Math.round(centerY-halfH));
                const h=Math.min(canvas.height-y,Math.round(halfH*2));
                if(h<20){skipped++;continue;}

                const scale=1.5;
                const x=Math.max(0,Math.round(Number(item.pdf_x||0)*scale));
                const rawWidth=Number(item.pdf_width||canvas.width/scale);
                const w=Math.min(canvas.width-x,Math.max(80,Math.round(rawWidth*scale)));
                if(w<80){skipped++;continue;}

                const crop=document.createElement("canvas");
                crop.width=w;crop.height=h;
                crop.getContext("2d",{alpha:false}).drawImage(canvas,x,y,w,h,0,0,w,h);
                const blob=await new Promise(resolve=>crop.toBlob(resolve,"image/jpeg",0.78));
                if(!blob){skipped++;continue;}

                const file=new File([blob],"pdf-product-"+pageNumber+"-"+Math.random().toString(36).slice(2)+".jpg",{type:"image/jpeg"});
                let found=null;

                // 1) SKU exacto: es el identificador más fiable.
                if(item.sku){
                  const q=await S.from("marc_inventory").select("id,image_url,name,sku,brand,model")
                    .eq("user_id",st.u.id).ilike("sku",item.sku).limit(10);
                  const skuCandidates=q.data||[];
                  found=skuCandidates.find(x=>!x.image_url)||null;
                  if(!found&&skuCandidates.length===1)found=skuCandidates[0];
                }

                // 2) Fallback: nombre normalizado + modelo.
                if(!found){
                  const q=await S.from("marc_inventory").select("id,image_url,name,sku,brand,model")
                    .eq("user_id",st.u.id).ilike("name",item.name.slice(0,80)).limit(20);
                  const candidates=(q.data||[]).filter(x=>!x.image_url);
                  const exact=candidates.filter(x=>normalize(x.name)===normalize(item.name));
                  const exactModel=exact.filter(x=>!item.model||normalize(x.model)===normalize(item.model));
                  found=exactModel.length===1?exactModel[0]:(exact.length===1?exact[0]:(candidates.length===1?candidates[0]:null));
                }

                if(!found||found.image_url){skipped++;continue;}
                const uploaded=await uploadInventoryPhoto(file,found.id,null);
                const upd=await S.from("marc_inventory").update({image_url:uploaded.url,updated_at:new Date().toISOString()})
                  .eq("id",found.id).eq("user_id",st.u.id);
                if(upd.error){skipped++;continue;}
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
          const photoMsg=photoResult.skipped
            ? " · "+photoResult.attached+" fotos asociadas, "+photoResult.skipped+" sin asociar"
            : " · "+photoResult.attached+" fotos asociadas";
          status.className="msg ok";
          status.textContent="Importación completada: "+data.total+" productos procesados, "+data.created+" nuevos, "+data.updated+" actualizados, "+(data.reactivated||0)+" reactivados"+photoMsg+".";
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
    const total=(data||[]).length,low=(data||[]).filter(x=>Number(x.stock)>0&&Number(x.stock)<=Number(x.min_stock)).length,out=(data||[]).filter(x=>Number(x.stock)<=0).length;
    c.innerHTML=`<div class="head"><div><div class="eyebrow2">INVENTARIO</div><h1>Productos + stock.</h1><p>Controla existencias, precios y unidades desde un solo lugar.</p></div><div style="display:flex;gap:7px;flex-wrap:wrap"><button id="photos" class="secondary">📷 Subir por fotos</button><button id="importPdf" class="secondary">📄 Importar PDF</button><button id="new" class="primary">＋ Nuevo producto</button></div></div>
    <section class="inventory-summary"><div><span>PRODUCTOS</span><strong>${total}</strong><small>En inventario activo</small></div><div><span>STOCK BAJO</span><strong>${low}</strong><small>Requieren reposición</small></div><div><span>AGOTADOS</span><strong>${out}</strong><small>Sin unidades disponibles</small></div></section>
    <section class="card table inventory-browser"><div class="toolbar"><div class="search"><input id="search" placeholder="Buscar producto, SKU, marca o modelo…"></div><div class="inventory-toolbar-actions"><button id="selectAll" class="secondary" type="button">☐ Seleccionar</button><button id="bulkDelete" class="danger" type="button" disabled>Eliminar <span id="selectedCount">0</span></button><button id="ask" class="secondary">✦ Preguntar</button></div></div><div class="scroll inventory-desktop"><table class="data"><thead><tr><th style="width:42px;text-align:center"><input id="selectAllHead" type="checkbox" aria-label="Seleccionar todos los productos"></th><th>Producto</th><th>Marca/modelo</th><th>Stock</th><th>Precio</th><th>Estado</th><th></th></tr></thead><tbody id="rows"></tbody></table></div><div id="inventoryCards" class="inventory-cards"></div></section>`;

    const rows=$("#rows"),cards=$("#inventoryCards");
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
      cards.innerHTML=(list||[]).map(x=>{
        const stock=Number(x.stock),min=Number(x.min_stock),cls=stock<=0?"out":stock<=min?"low":"ok";
        const photo=x.image_url?'<img src="'+esc(x.image_url)+'" alt="Producto">':'<span>📦</span>';
        return '<article class="inventory-card"><div class="inventory-card-top"><div class="inventory-photo">'+photo+'</div><div class="inventory-card-name"><h3>'+esc(x.name)+'</h3><small>'+esc(x.sku||"Sin SKU")+'</small></div><input class="inventory-check" type="checkbox" data-id="'+x.id+'" '+(selected.has(x.id)?"checked":"")+' aria-label="Seleccionar '+esc(x.name)+'"></div><div class="inventory-card-meta"><div><span>Stock</span><b>'+stock+' '+esc(x.unit||"UND")+'</b></div><div><span>Precio</span><b>'+money(x.price)+'</b></div><div><span>Estado</span><em class="badge '+cls+'">'+(stock<=0?"Agotado":stock<=min?"Stock bajo":"Disponible")+'</em></div></div><div class="inventory-card-actions"><button class="primary" type="button" data-action="edit-inventory" data-id="'+x.id+'">Editar</button><button class="secondary" type="button" data-action="serials-inventory" data-id="'+x.id+'">📷 Series</button></div></article>';
      }).join("")||'<div class="empty-state"><span>📦</span><b>Inventario vacío</b><small>Agrega tu primer producto.</small></div>';
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

    cards.onchange=e=>{const cb=e.target.closest(".inventory-check");if(!cb)return;if(cb.checked)selected.add(cb.dataset.id);else selected.delete(cb.dataset.id);syncSelectionUi()};

    cards.onclick=async e=>{const b=e.target.closest("button[data-action]");if(!b)return;const item=(data||[]).find(x=>x.id===b.dataset.id);if(!item)return;if(b.dataset.action==="edit-inventory")return inventoryModal(item);if(b.dataset.action==="serials-inventory")return inventorySerialsModal(item)};

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
  <section class="card table quotes-browser"><div class="toolbar"><div class="search"><input id="search" placeholder="Buscar número, cliente o título…"></div><select id="statusFilter" class="secondary" style="min-width:130px"><option value="">Todos</option><option>BORRADOR</option><option>ENVIADA</option><option>ACEPTADA</option><option>RECHAZADA</option><option>ANULADA</option><option>COBRADA</option></select><button id="ask" class="secondary">Preguntar</button></div><div class="scroll quotes-desktop"><table class="data"><thead><tr><th>Número</th><th>Cliente</th><th>Título</th><th>Estado</th><th>Total</th><th>Fecha</th><th></th></tr></thead><tbody id="qrows"></tbody></table></div><div id="qcards" class="quote-cards"></div></section>`;

  const body=$("#qrows");
  const draw=()=>{
    const q=($("#search").value||"").toLowerCase(),sf=$("#statusFilter").value;
    const list=rows.filter(x=>(!sf||x.status===sf)&&[x.number,x.title,x.marc_clients?.name].some(v=>String(v||"").toLowerCase().includes(q)));
    body.innerHTML=list.map(x=>`<tr><td><b>${esc(x.number)}</b></td><td>${esc(x.marc_clients?.name||"Sin cliente")}</td><td>${esc(x.title)}</td><td><span class="badge">${esc(x.status)}</span></td><td><b>${money(x.total)}</b></td><td>${new Date(x.created_at).toLocaleDateString("es-PE")}</td><td style="display:flex;gap:5px"><button type="button" class="secondary" data-action="open-quote" data-id="${x.id}">Abrir</button><button type="button" class="secondary" data-action="pdf-quote" data-id="${x.id}">PDF</button><button type="button" class="danger" data-action="delete-quote" data-id="${x.id}">Eliminar</button></td></tr>`).join("")||'<tr><td colspan="7" class="empty">No hay cotizaciones que coincidan.</td></tr>';
    const cards=$("#qcards");
    cards.innerHTML=list.map(x=>`<article class="quote-card"><div class="quote-card-top"><div><span class="quote-number">${esc(x.number)}</span><span class="badge">${esc(x.status)}</span></div><strong>${money(x.total)}</strong></div><h3>${esc(x.title||"Sin título")}</h3><p><b>Cliente:</b> ${esc(x.marc_clients?.name||"Sin cliente")}</p><small>${new Date(x.created_at).toLocaleDateString("es-PE",{day:"2-digit",month:"short",year:"numeric"})}</small><div class="quote-card-actions"><button type="button" class="primary" data-action="open-quote" data-id="${x.id}">Abrir</button><button type="button" class="secondary" data-action="pdf-quote" data-id="${x.id}">PDF</button><button type="button" class="danger" data-action="delete-quote" data-id="${x.id}">Eliminar</button></div></article>`).join("")||'<div class="empty">No hay cotizaciones que coincidan.</div>'
  };

  $("#qcards").onclick=async e=>{const b=e.target.closest("button[data-action]");if(!b)return;const id=b.dataset.id;try{const row=rows.find(x=>x.id===id);if(!row)return;if(b.dataset.action==="open-quote")await quoteModal(row);else if(b.dataset.action==="pdf-quote"){b.disabled=true;await downloadQuotePdf(id)}else if(b.dataset.action==="delete-quote"){if(row.status==="COBRADA")return toast("Una cotización cobrada no puede eliminarse. Usa ANULADA.","err");if(!confirm("¿Eliminar la cotización "+row.number+"?\n\nDesaparecerá del listado, pero se conservará el historial."))return;b.disabled=true;const result=await S.from("marc_quotes").update({deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id).eq("user_id",st.u.id);if(result.error)throw result.error;toast("Cotización eliminada","ok");await quotes()}}catch(err){toast(err?.message||"No se pudo completar la acción.","err")}finally{b.disabled=false}};
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
async function loadBrandLogo(){
  const el=$("#brandLogo");
  if(!el||!st.session?.access_token)return;
  try{
    const profile=await getCompanyProfile();
    if(profile?.logo_data){
      el.innerHTML='<img src="'+esc(profile.logo_data)+'" alt="Logo M.A.R.C.">';
      el.classList.add("has-logo");
    }
  }catch(e){}
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


async function getCashStaffContext(){
  if(!st.u)return {isStaff:false,ownerId:null,staff:null};
  const {data,error}=await S.from("marc_cash_staff").select("id,owner_user_id,auth_user_id,username,display_name,role,active").eq("auth_user_id",st.u.id).eq("active",true).maybeSingle();
  if(error)return {isStaff:false,ownerId:st.u.id,staff:null};
  return data?{isStaff:true,ownerId:data.owner_user_id,staff:data}:{isStaff:false,ownerId:st.u.id,staff:null};
}
async function openCashModal(){
  const ctx=await getCashStaffContext();
  if(ctx.isStaff)return toast("Solo el administrador puede abrir una nueva caja.","err");
  const close=modal('<div class="modal-head"><div><h2>＋ Abrir caja</h2><p>Indica cuánto efectivo queda en la caja al comenzar.</p></div><button class="close" id="x">×</button></div><form id="cashOpenForm"><label>Efectivo inicial<input name="amount" type="number" min="0" step="0.01" required placeholder="0.00"></label><label>Nota opcional<textarea name="notes" rows="2" placeholder="Turno, caja o referencia…"></textarea></label><div class="modal-actions"><button type="button" class="secondary" id="cancel">Cancelar</button><button class="primary">Abrir caja</button></div></form>');
  $("#x").onclick=close;$("#cancel").onclick=close;
  $("#cashOpenForm").onsubmit=async e=>{
    e.preventDefault();const b=e.currentTarget.querySelector("button.primary");b.disabled=true;
    try{
      const amount=Number(new FormData(e.currentTarget).get("amount")||0);
      if(amount<0)throw new Error("El efectivo inicial no puede ser negativo.");
      const current=await S.from("marc_cash_registers").select("id").eq("user_id",st.u.id).eq("status","OPEN").limit(1);
      if(current.data?.length)throw new Error("Ya existe una caja abierta.");
      const {error}=await S.from("marc_cash_registers").insert({user_id:st.u.id,status:"OPEN",opening_amount:amount,expected_amount:amount,opened_by:st.u.id,notes:String(new FormData(e.currentTarget).get("notes")||"").trim()||null});
      if(error)throw error;close();toast("Caja abierta correctamente","ok");await cash();
    }catch(err){toast(err.message||"No se pudo abrir la caja.","err");b.disabled=false}
  };
}
async function closeCashModal(open,expected){
  const ctx=await getCashStaffContext();
  if(ctx.isStaff)return toast("Solo el administrador puede cerrar la caja.","err");
  const close=modal('<div class="modal-head"><div><h2>✓ Cerrar caja</h2><p>Cuenta el efectivo físico y registra el monto real.</p></div><button class="close" id="x">×</button></div><form id="cashCloseForm"><div class="cash-close-focus"><span>EFECTIVO ESPERADO</span><strong>'+money(expected)+'</strong></div><label>Efectivo contado<input name="amount" type="number" min="0" step="0.01" required value="'+Number(expected||0).toFixed(2)+'"></label><label>Observación<textarea name="notes" rows="2" placeholder="Diferencia, incidencia, entrega de turno…"></textarea></label><div id="cashCloseDiff" class="cash-close-diff"></div><div class="modal-actions"><button type="button" class="secondary" id="cancel">Cancelar</button><button class="primary">Confirmar cierre</button></div></form>');
  $("#x").onclick=close;$("#cancel").onclick=close;
  const form=$("#cashCloseForm"),amountInput=form.querySelector("[name=amount]"),diff=()=>{const d=Number(amountInput.value||0)-Number(expected||0);$("#cashCloseDiff").innerHTML="<span>Diferencia</span><b class='"+(d===0?"cash-in":"cash-out")+"'>"+(d>=0?"+":"")+money(d)+"</b>"};
  amountInput.oninput=diff;diff();
  form.onsubmit=async e=>{
    e.preventDefault();const b=e.currentTarget.querySelector("button.primary");b.disabled=true;
    try{
      const closing=Number(new FormData(e.currentTarget).get("amount")||0);
      if(closing<0)throw new Error("El efectivo contado no puede ser negativo.");
      const notes=String(new FormData(e.currentTarget).get("notes")||"").trim()||null;
      const {data:closed,error}=await S.rpc("marc_cash_close",{p_closing_amount:closing,p_notes:notes});
      if(error)throw error;
      if(!closed)throw new Error("Supabase no devolvió el cierre de caja.");
      close();toast("Caja cerrada correctamente · Diferencia "+money(closing-Number(expected||0)),"ok");await cash();
    }catch(err){toast(err.message||"No se pudo cerrar la caja.","err");b.disabled=false}
  };
}
async function cashMovementModal(open,type){
  const ctx=await getCashStaffContext();
  if(!ctx.ownerId)return;
  const income=type==="INCOME",title=income?"＋ Registrar ingreso":"− Registrar egreso";
  let products=[];
  if(income){
    const {data,error}=await S.from("marc_inventory").select("id,name,sku,brand,model,category,unit,price,stock,image_url,description").eq("user_id",ctx.ownerId).eq("active",true).order("name").limit(1000);
    if(error)return toast(error.message,"err");
    products=data||[];
  }
  const productOptions=products.length?'<div class="cash-product-picker"><div class="cash-product-head"><b>¿Qué producto estás vendiendo?</b><small>Busca por nombre, marca, modelo o SKU.</small></div><input id="cashProductSearch" class="cash-product-search" placeholder="🔎 Buscar producto…"><div id="cashProductList" class="cash-product-list"></div><div id="cashProductSelected" class="cash-product-selected"></div></div>':'';
  const close=modal('<div class="modal-head"><div><h2>'+title+'</h2><p>Registro rápido de caja. Quedará asociado a '+esc(ctx.staff?.display_name||"tu usuario")+'.</p></div><button class="close" id="x">×</button></div><form id="cashMoveForm">'+productOptions+'<div class="cash-quick-amount"><span>S/</span><input name="amount" inputmode="decimal" type="number" min="0.01" step="0.01" required placeholder="0.00" autofocus></div><div id="cashProductQtyWrap" class="cash-product-qty hidden"><label>Cantidad<input id="cashProductQty" name="quantity" type="number" min="1" step="1" value="1"></label><span id="cashProductTotal"></span></div><div class="cash-quick-grid"><button type="button" class="secondary cash-preset" data-v="10">S/ 10</button><button type="button" class="secondary cash-preset" data-v="20">S/ 20</button><button type="button" class="secondary cash-preset" data-v="50">S/ 50</button><button type="button" class="secondary cash-preset" data-v="100">S/ 100</button></div><label>Concepto<input name="concept" required placeholder="'+(income?"Venta, cobro, servicio…":"Compra, transporte, gasto…")+'"></label><label>Referencia opcional<input name="reference" placeholder="Boleta, factura, cliente, nota…"></label><div class="modal-actions"><button type="button" class="secondary" id="cancel">Cancelar</button><button class="primary">'+(income?"Registrar ingreso":"Registrar egreso")+'</button></div></form>');
  $("#x").onclick=close;$("#cancel").onclick=close;
  let selected=null;
  const amount=$("#cashMoveForm [name=amount]"),qty=$("#cashProductQty"),qtyWrap=$("#cashProductQtyWrap"),total=$("#cashProductTotal"),list=$("#cashProductList"),search=$("#cashProductSearch"),selectedBox=$("#cashProductSelected");
  const renderProducts=()=>{
    if(!list)return;
    const q=String(search?.value||"").trim().toLowerCase();
    const filtered=products.filter(p=>[p.name,p.sku,p.brand,p.model,p.category].some(v=>String(v||"").toLowerCase().includes(q))).slice(0,30);
    list.innerHTML=filtered.map(p=>'<button type="button" class="cash-product-item" data-id="'+esc(p.id)+'">'+(p.image_url?'<img src="'+esc(p.image_url)+'" alt="">':'<span class="cash-product-thumb">▦</span>')+'<span><b>'+esc(p.name)+'</b><small>'+esc([p.brand,p.model,p.sku].filter(Boolean).join(" · ")||"Sin código")+'</small><small>'+esc(p.description||p.category||"Producto")+' · Stock: '+Number(p.stock||0)+'</small></span><strong>'+money(p.price||0)+'</strong></button>').join("")||'<div class="empty">No encontré productos con esa búsqueda.</div>';
    $$(".cash-product-item",list).forEach(b=>b.onclick=()=>selectProduct(products.find(p=>p.id===b.dataset.id)));
  };
  const updateProductTotal=()=>{
    if(!selected)return;
    const n=Math.max(1,Number(qty?.value||1)),v=Number(selected.price||0)*n;
    amount.value=v.toFixed(2);
    if(total)total.textContent=n+" × "+money(selected.price||0)+" = "+money(v);
  };
  const selectProduct=p=>{
    if(!p)return;
    selected=p; if(qtyWrap)qtyWrap.classList.remove("hidden");
    if(selectedBox)selectedBox.innerHTML='<div><b>✓ '+esc(p.name)+'</b><small>'+esc([p.brand,p.model,p.unit].filter(Boolean).join(" · ")||"Producto seleccionado")+'</small></div><button type="button" id="cashProductClear">Cambiar</button>';
    if($("#cashProductClear"))$("#cashProductClear").onclick=()=>{selected=null;selectedBox.innerHTML="";qtyWrap?.classList.add("hidden");amount.value="";renderProducts()};
    $("#cashMoveForm [name=concept]").value="Venta · "+p.name+(p.model?" · "+p.model:"");
    $("#cashMoveForm [name=reference]").value=p.sku||"";
    qty.value="1";updateProductTotal();
  };
  search?.addEventListener("input",renderProducts);
  qty?.addEventListener("input",updateProductTotal);
  renderProducts();
  $$(".cash-preset",$("#cashMoveForm")).forEach(b=>b.onclick=()=>{selected=null;selectedBox&&(selectedBox.innerHTML="");qtyWrap?.classList.add("hidden");amount.value=b.dataset.v});
  $("#cashMoveForm").onsubmit=async e=>{
    e.preventDefault();const b=e.currentTarget.querySelector("button.primary");b.disabled=true;
    try{
      const d=new FormData(e.currentTarget),amountValue=Number(d.get("amount")||0);
      if(amountValue<=0)throw new Error("Ingresa un monto válido.");
      const concept=String(d.get("concept")||"").trim(),reference=String(d.get("reference")||"").trim();
      if(income&&selected){
        const quantity=Number(d.get("quantity")||1);
        const available=Number(selected.stock||0);
        if(!Number.isInteger(quantity)||quantity<=0)throw new Error("La cantidad debe ser un número entero mayor que cero.");
        if(available<=0)throw new Error("Este producto está agotado.");
        if(quantity>available)throw new Error("Stock insuficiente. Disponible: "+available+" unidad"+(available===1?"":"es")+".");
        const unitPrice=Number(selected.price||0);
        if(unitPrice<=0)throw new Error("El producto seleccionado no tiene un precio de venta válido.");
        const {error}=await S.rpc("marc_register_product_sale",{p_cash_register_id:open.id,p_product_id:selected.id,p_quantity:quantity,p_amount:amountValue,p_concept:concept,p_reference:reference,p_created_by_name:ctx.staff?.display_name||st.u.email||"Usuario"});
        if(error)throw error;
      }else{
        const row={user_id:ctx.ownerId,cash_register_id:open.id,type,amount:amountValue,concept,reference:reference||null,created_by:st.u.id,created_by_name:ctx.staff?.display_name||st.u.email||"Usuario"};
        const {error}=await S.from("marc_cash_movements").insert(row);if(error)throw error;
      }
      close();toast(income?(selected?"Venta registrada · "+selected.name:"Ingreso registrado"):"Egreso registrado","ok");await cash();
    }catch(err){toast(err.message||"No se pudo registrar el movimiento.","err");b.disabled=false}
  };
}
async function cashStaffModal(){
  const ctx=await getCashStaffContext();
  if(ctx.isStaff)return toast("Solo el administrador puede gestionar usuarios de caja.","err");
  const {data:staff,error}=await S.from("marc_cash_staff").select("id,username,display_name,employee_code,active,created_at").eq("owner_user_id",st.u.id).order("created_at");
  if(error)return toast(error.message,"err");
  const rows=(staff||[]).map(x=>`<div class="cash-staff-row">
    <div><b>${esc(x.display_name)}</b><small>${x.employee_code?`ID ${esc(x.employee_code)} · `:""}@${esc(x.username)} · ${x.active?"Activo":"Inactivo"}</small></div>
    <div class="cash-staff-tools"><span>${x.active?"CAJERO":"PAUSADO"}</span><button type="button" class="secondary cash-staff-action" data-action="password" data-id="${esc(x.id)}">Clave</button><button type="button" class="secondary cash-staff-action" data-action="toggle" data-id="${esc(x.id)}">${x.active?"Desactivar":"Activar"}</button></div>
  </div>`).join("")||'<div class="empty">Todavía no hay usuarios de caja.</div>';
  const close=modal(`<div class="modal-head"><div><h2>👥 Personal de caja</h2><p>Cada empleado tiene su propio acceso. Solo el administrador abre y cierra la caja.</p></div><button class="close" id="x">×</button></div><div class="cash-staff-list">${rows}</div><form id="staffForm"><div class="form-grid"><label>Nombre del empleado<input name="display_name" required placeholder="Ej. Juan Pérez"></label><label>ID / código del empleado<input name="employee_code" required autocomplete="off" placeholder="Ej. CAJ-001 o DNI"></label><label>Nombre de usuario<input name="username" required autocomplete="off" autocapitalize="none" placeholder="Ej. juan"></label><label>Clave de acceso<input name="password" type="password" minlength="6" required placeholder="Mínimo 6 caracteres"></label></div><div class="modal-actions"><button type="button" class="secondary" id="cancel">Cerrar</button><button class="primary">＋ Crear usuario</button></div></form>`);
  $("#x").onclick=close;$("#cancel").onclick=close;
  $$(".cash-staff-action",$("#modal")).forEach(btn=>btn.onclick=async()=>{
    const id=btn.dataset.id,action=btn.dataset.action,item=(staff||[]).find(x=>x.id===id); if(!item)return;
    try{
      if(action==="toggle"){
        btn.disabled=true;
        const r=await fetch("/api/cash-staff",{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:"Bearer "+st.session?.access_token},body:JSON.stringify({id,active:!item.active})});
        const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"No se pudo actualizar el usuario.");
        toast(item.active?"Usuario desactivado":"Usuario activado","ok");close();await cashStaffModal();
      }else{
        openCashPasswordModal(item);
      }
    }catch(err){toast(err.message||"No se pudo actualizar el usuario.","err");btn.disabled=false}
  });
  $("#staffForm").onsubmit=async e=>{
    e.preventDefault();const b=e.currentTarget.querySelector("button.primary");b.disabled=true;const d=new FormData(e.currentTarget);
    try{
      const r=await fetch("/api/cash-staff",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+st.session?.access_token},body:JSON.stringify({display_name:d.get("display_name"),employee_code:d.get("employee_code"),username:d.get("username"),password:d.get("password")})});
      const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||j.message||"No se pudo crear el usuario.");
      const employeeCode=String(d.get("employee_code")||"").trim();
      if(employeeCode){
        const patch=await S.from("marc_cash_staff").update({employee_code:employeeCode}).eq("owner_user_id",st.u.id).eq("username",String(d.get("username")||"").trim());
        if(patch.error)throw patch.error;
      }
      close();toast("Usuario de caja creado correctamente","ok");await cash();
    }catch(err){toast(err.message||"No se pudo crear el usuario.","err");b.disabled=false}
  };
}
function openCashPasswordModal(item){
  const close=modal(`<div class="modal-head"><div><div class="eyebrow2">SEGURIDAD</div><h2>🔐 Cambiar contraseña</h2><p>Actualiza la clave de <b>@${esc(item.username)}</b>.</p></div><button class="close" id="x">×</button></div><form id="cashPasswordForm"><label>Nueva contraseña<div class="password-field"><input name="password" type="password" minlength="6" required autofocus placeholder="Mínimo 6 caracteres"><button type="button" id="showCashPass">◉</button></div></label><label>Confirmar contraseña<input name="confirm" type="password" minlength="6" required placeholder="Repite la contraseña"></label><div id="cashPassError" class="cash-login-error"></div><div class="modal-actions"><button type="button" class="secondary" id="cancel">Cancelar</button><button class="primary">Guardar nueva clave</button></div></form>`);
  $("#x").onclick=close;$("#cancel").onclick=close;$("#showCashPass").onclick=()=>{const i=$("#cashPasswordForm [name=password]");i.type=i.type==="password"?"text":"password"};
  $("#cashPasswordForm").onsubmit=async e=>{
    e.preventDefault();const d=new FormData(e.currentTarget),password=String(d.get("password")||""),confirm=String(d.get("confirm")||""),err=$("#cashPassError"),b=e.currentTarget.querySelector("button.primary");
    err.textContent="";if(password.length<6)return err.textContent="La contraseña debe tener al menos 6 caracteres.";if(password!==confirm)return err.textContent="Las contraseñas no coinciden.";
    b.disabled=true;
    try{
      const r=await fetch("/api/cash-staff",{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:"Bearer "+st.session?.access_token},body:JSON.stringify({id:item.id,password})});
      const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"No se pudo cambiar la contraseña.");
      close();toast("Contraseña actualizada correctamente","ok");
    }catch(err2){err.textContent=err2.message||"No se pudo cambiar la contraseña.";b.disabled=false}
  };
}

async function cash(){
  const c=$("#content");
  const cashCtx=await getCashStaffContext();
  const cashOwnerId=cashCtx.ownerId||st.u.id;
  const isCashier=!!cashCtx.isStaff;
  const {data:open,error:openError}=await S.from("marc_cash_registers").select("*").eq("user_id",cashOwnerId).eq("status","OPEN").order("opened_at",{ascending:false}).limit(1).maybeSingle();
  if(openError)return toast(openError.message,"err");

  const {data:closed,error:closedError}=await S.from("marc_cash_registers").select("*").eq("user_id",cashOwnerId).eq("status","CLOSED").order("closed_at",{ascending:false}).limit(100);
  if(closedError)return toast(closedError.message,"err");

  let movements=[];
  if(open){
    const r=await S.from("marc_cash_movements").select("*").eq("user_id",cashOwnerId).eq("cash_register_id",open.id).order("created_at",{ascending:false});
    if(r.error)return toast(r.error.message,"err");
    movements=r.data||[];
  }

  const income=movements.filter(x=>x.type==="INCOME").reduce((s,x)=>s+Number(x.amount||0),0);
  const expense=movements.filter(x=>x.type==="EXPENSE").reduce((s,x)=>s+Number(x.amount||0),0);
  const expected=Number(open?.opening_amount||0)+income-expense;

  // Informe configurable de 2 a 6 meses calendario.
  const now=new Date();
  const reportMonthsCount=Math.min(6,Math.max(2,Number(new URLSearchParams(location.search).get("cashMonths")||2)));
  const reportStart=new Date(now.getFullYear(),now.getMonth()-(reportMonthsCount-1),1);
  const reportEnd=new Date(now.getFullYear(),now.getMonth()+1,1);
  const closedTwoMonths=(closed||[]).filter(x=>{
    const d=new Date(x.closed_at||x.opened_at);
    return Number.isFinite(d.getTime())&&d>=reportStart&&d<reportEnd;
  });
  const registerIds=closedTwoMonths.map(x=>x.id).filter(Boolean);
  let reportMovements=[];
  if(registerIds.length){
    const rm=await S.from("marc_cash_movements").select("*").eq("user_id",cashOwnerId).in("cash_register_id",registerIds).order("created_at",{ascending:true});
    if(rm.error)return toast(rm.error.message,"err");
    reportMovements=rm.data||[];
  }

  const monthKey=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
  const monthLabel=d=>d.toLocaleDateString("es-PE",{month:"short",year:"numeric"}).replace(".","");
  const reportMonths=Array.from({length:reportMonthsCount},(_,i)=>new Date(now.getFullYear(),now.getMonth()-(reportMonthsCount-1-i),1));
  const monthly=reportMonths.map(m=>{
    const key=monthKey(m);
    const regs=closedTwoMonths.filter(x=>monthKey(new Date(x.closed_at||x.opened_at))===key);
    const ids=new Set(regs.map(x=>x.id));
    const mov=reportMovements.filter(x=>ids.has(x.cash_register_id));
    const inc=mov.filter(x=>x.type==="INCOME").reduce((s,x)=>s+Number(x.amount||0),0);
    const exp=mov.filter(x=>x.type==="EXPENSE").reduce((s,x)=>s+Number(x.amount||0),0);
    const diff=regs.reduce((s,x)=>s+Number(x.difference||0),0);
    const opening=regs.reduce((s,x)=>s+Number(x.opening_amount||0),0);
    const closing=regs.reduce((s,x)=>s+Number(x.closing_amount||0),0);
    return {key,label:monthLabel(m),registers:regs.length,income:inc,expense:exp,net:inc-exp,difference:diff,opening,closing};
  });
  const chartMax=Math.max(1,...monthly.flatMap(x=>[x.income,x.expense]));
  const differenceMax=Math.max(1,...closedTwoMonths.map(x=>Math.abs(Number(x.difference||0))));
  const monthSummary=monthly.map(x=>`
    <div class="cash-chart-group">
      <div class="cash-chart-bars">
        <div class="cash-chart-col"><div class="cash-chart-value">${money(x.income)}</div><div class="cash-chart-track"><i class="cash-chart-income" style="height:${Math.max(6,Math.round(x.income/chartMax*100))}%"></i></div><b>Ingresos</b></div>
        <div class="cash-chart-col"><div class="cash-chart-value">${money(x.expense)}</div><div class="cash-chart-track"><i class="cash-chart-expense" style="height:${Math.max(6,Math.round(x.expense/chartMax*100))}%"></i></div><b>Egresos</b></div>
      </div>
      <div class="cash-chart-month"><strong>${esc(x.label)}</strong><span>${x.registers} cierre${x.registers===1?"":"s"} · neto ${money(x.net)}</span></div>
    </div>`).join("");

  const closedSummaryRows=closedTwoMonths.map(x=>{
    const d=Number(x.difference||0);
    const h=Math.max(6,Math.round(Math.abs(d)/differenceMax*100));
    return `<div class="cash-diff-row"><div><b>${new Date(x.closed_at).toLocaleDateString("es-PE")}</b><small>Esperado ${money(x.expected_amount)} · Contado ${money(x.closing_amount)}</small></div><div class="cash-diff-track"><i class="${d>=0?"positive":"negative"}" style="width:${h}%"></i></div><strong class="${d>=0?"cash-in":"cash-out"}">${d>=0?"+":""}${money(d)}</strong></div>`;
  }).join("");

  c.innerHTML=`
    <div class="head"><div><div class="eyebrow2">CAJA · ${isCashier?"TURNO":"ADMINISTRACIÓN"}</div><h1>${isCashier?"Caja rápida.":"Cierre de caja."}</h1><p>${isCashier?`Usuario: <b>${esc(cashCtx.staff?.display_name||"Cajero")}</b> · ${open?`turno iniciado ${new Date(open.opened_at).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})}`:"esperando apertura"}`:"Controla efectivo, turnos, usuarios, diferencias e informes con un máximo de 6 meses."}</p></div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center"><label class="cash-period-select">Informe <select id="cashReportMonths" class="secondary">${[2,3,4,5,6].map(n=>`<option value="${n}" ${n===reportMonthsCount?"selected":""}>${n} meses</option>`).join("")}</select></label><button id="downloadCashExcel" class="secondary">▣ Excel · ${reportMonthsCount} meses</button>${!isCashier?'<button id="cashStaffLoginOpen" class="secondary">▣ Entrar como cajero</button><button id="cashStaff" class="secondary">👥 Personal</button>':`<button id="cashStaffLogout" class="secondary">↩ Salir de caja</button>`}${open&&!isCashier?'<button id="closeCashTop" class="primary">✓ Cerrar caja</button>':!open&&!isCashier?'<button id="openCashTop" class="primary">＋ Abrir caja</button>':""}</div>
    </div>

    ${!isCashier?`<section id="cashStaffPanel" class="card panel cash-login-panel hidden" aria-hidden="true"><div class="eyebrow2">PERSONAL DE CAJA</div><h3>Entrar a caja</h3><p>Usa el usuario y la contraseña que te asignó el administrador.</p><form id="cashStaffForm" autocomplete="on"><label>Usuario<input id="cashStaffUsername" name="username" autocomplete="username" autocapitalize="none" required placeholder="Ej. juan"></label><label>Contraseña<div class="password-field"><input id="cashStaffPassword" name="password" type="password" autocomplete="current-password" required placeholder="Tu contraseña"><button id="cashStaffPasswordToggle" type="button">◉</button></div></label><div id="cashStaffError" class="cash-login-error" role="alert"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="cashStaffSubmit" class="primary" type="submit">Entrar a caja →</button><button id="cashStaffBack" class="secondary" type="button">Cancelar</button></div></form></section>`:""}

    <section class="cash-kpis">
      <article class="card cash-kpi"><span>ESTADO</span><strong>${open?"ABIERTA":"CERRADA"}</strong><small>${open?(new Date(open.opened_at)).toLocaleString("es-PE"):"Abre una nueva caja para comenzar"}</small></article>
      <article class="card cash-kpi"><span>APERTURA</span><strong>${money(open?.opening_amount||0)}</strong><small>Efectivo inicial</small></article>
      <article class="card cash-kpi"><span>INGRESOS</span><strong class="cash-in">${money(income)}</strong><small>${movements.filter(x=>x.type==="INCOME").length} movimientos</small></article>
      <article class="card cash-kpi"><span>EGRESOS</span><strong class="cash-out">${money(expense)}</strong><small>${movements.filter(x=>x.type==="EXPENSE").length} movimientos</small></article>
      <article class="card cash-kpi cash-total"><span>EFECTIVO EN CAJA</span><strong>${money(expected)}</strong><small>${movements[0]?`Último movimiento · ${esc(movements[0].created_by_name||"Usuario")} · ${movements[0].type==="INCOME"?"+":"−"}${money(movements[0].amount)} · ${new Date(movements[0].created_at).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})}`:"Caja recién abierta · sin movimientos"}</small></article>
    </section>

    <section class="card panel cash-report-panel">
      <div class="panel-title-row"><div><div class="eyebrow2">INFORME AUTOMÁTICO</div><h3>Últimos ${reportMonthsCount} meses</h3><small class="finance-subtitle">Desde ${reportStart.toLocaleDateString("es-PE")} hasta ${new Date(reportEnd.getTime()-86400000).toLocaleDateString("es-PE")}</small></div><button id="downloadCashExcel2" class="secondary">Descargar Excel</button></div>
      <div class="cash-report-summary">
        <div><span>CIERRES</span><strong>${closedTwoMonths.length}</strong></div>
        <div><span>INGRESOS</span><strong class="cash-in">${money(monthly.reduce((s,x)=>s+x.income,0))}</strong></div>
        <div><span>EGRESOS</span><strong class="cash-out">${money(monthly.reduce((s,x)=>s+x.expense,0))}</strong></div>
        <div><span>DIFERENCIA</span><strong>${money(monthly.reduce((s,x)=>s+x.difference,0))}</strong></div>
      </div>
      <div class="cash-chart"><div class="cash-chart-title"><div><b>Ingresos vs. egresos</b><small>Comparación mensual de movimientos registrados</small></div><span><i class="cash-legend-income"></i>Ingresos <i class="cash-legend-expense"></i>Egresos</span></div>${monthSummary}</div>
      <div class="cash-difference-chart"><div class="cash-chart-title"><div><b>Diferencia de cada cierre</b><small>Contado frente al efectivo esperado</small></div></div>${closedSummaryRows||'<div class="empty">No hay cierres en este período.</div>'}</div>
    </section>

    ${isCashier&&open&&movements[0]?`<div class="cash-last-movement"><div><b>Último movimiento</b><small>${esc(movements[0].created_by_name||"Usuario")} · ${movements[0].type==="INCOME"?"Ingreso":"Egreso"} · ${new Date(movements[0].created_at).toLocaleString("es-PE",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</small></div><strong class="${movements[0].type==="INCOME"?"cash-in":"cash-out"}">${movements[0].type==="INCOME"?"+":"−"} ${money(movements[0].amount)}</strong></div>`:""}

    ${open?`
      <section class="card panel cash-actions"><div class="panel-title-row"><div><div class="eyebrow2">MOVIMIENTOS · ${isCashier?"MODO RÁPIDO":"ADMINISTRACIÓN"}</div><h3>${isCashier?"Registrar en 2 toques":"Registrar operación"}</h3></div></div>
        <div class="cash-action-grid"><button id="cashIncome" class="cash-action income"><span class="cash-action-circle">＋</span><b>Ingreso</b><small>Venta · cobro · servicio</small></button><button id="cashExpense" class="cash-action expense"><span class="cash-action-circle">−</span><b>Egreso</b><small>Compra · transporte · gasto</small></button></div>
      </section>
      <section class="card panel cash-movements"><div class="panel-title-row"><div><div class="eyebrow2">MOVIMIENTOS DE HOY</div><h3>Detalle de caja</h3></div></div>
      <div class="scroll"><table class="data"><thead><tr><th>Hora</th><th>Usuario</th><th>Tipo</th><th>Concepto</th><th>Referencia</th><th>Monto</th></tr></thead><tbody>
      ${movements.map(x=>`<tr><td>${new Date(x.created_at).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})}</td><td>${esc(x.created_by_name||"Administrador")}</td><td><span class="cash-type ${x.type==="INCOME"?"in":"out"}">${x.type==="INCOME"?"Ingreso":"Egreso"}</span></td><td><b>${esc(x.concept)}</b></td><td>${esc(x.reference||"—")}</td><td class="${x.type==="INCOME"?"cash-in":"cash-out"}"><b>${x.type==="INCOME"?"+":"−"} ${money(x.amount)}</b></td></tr>`).join("")||'<tr><td colspan="6" class="empty">Aún no hay movimientos.</td></tr>'}
      </tbody></table></div></section>
    `:'<section class="card panel cash-closed-empty"><div class="empty-state"><span>▣</span><b>${isCashier?"La caja está cerrada":"No hay una caja abierta"}</b><small>${isCashier?"El administrador debe abrir la caja antes de registrar ingresos o egresos.":"Abre una nueva caja indicando el efectivo inicial para comenzar."}</small></div></section>'}

    <section class="card panel"><div class="panel-title-row"><div><div class="eyebrow2">HISTORIAL</div><h3>Últimos cierres</h3></div></div>
      <div class="cash-history">${(closed||[]).slice(0,10).map(x=>`<div class="cash-history-row"><div><b>${new Date(x.closed_at).toLocaleDateString("es-PE")}</b><small>Esperado ${money(x.expected_amount)} · Contado ${money(x.closing_amount)}</small></div><strong class="${Number(x.difference||0)===0?"cash-in":"cash-out"}">${Number(x.difference||0)>=0?"+":""}${money(x.difference)}</strong></div>`).join("")||'<div class="empty">Todavía no hay cierres registrados.</div>'}</div>
    </section>`;

  const report={
    start:reportStart,end:new Date(reportEnd.getTime()-86400000),months:monthly,registers:closedTwoMonths,movements:reportMovements
  };
  const exportExcel=()=>downloadCashExcel(report);
  $("#downloadCashExcel").onclick=exportExcel;
  $("#downloadCashExcel2").onclick=exportExcel;
  $("#cashReportMonths").onchange=e=>{const n=Math.min(6,Math.max(2,Number(e.target.value)||2));const u=new URL(location.href);u.searchParams.set("cashMonths",String(n));history.replaceState({},document.title,u.toString());cash()};

  if($("#cashStaff"))$("#cashStaff").onclick=()=>cashStaffModal();
  if($("#cashStaffLoginOpen"))$("#cashStaffLoginOpen").onclick=()=>showCashStaffLogin(true);
  if($("#cashStaffBack"))$("#cashStaffBack").onclick=()=>showCashStaffLogin(false);
  if($("#cashStaffForm"))$("#cashStaffForm").onsubmit=signInCashStaff;
  if($("#cashStaffPasswordToggle"))$("#cashStaffPasswordToggle").onclick=()=>{const p=$("#cashStaffPassword");if(p){p.type=p.type==="password"?"text":"password"}};
  if($("#cashStaffLogout"))$("#cashStaffLogout").onclick=async()=>{
    const ok=confirm("¿Salir de esta caja?");
    if(!ok)return;
    try{
      const raw=sessionStorage.getItem("marc_cash_owner_session");
      const owner=raw?JSON.parse(raw):null;
      sessionStorage.removeItem("marc_cash_owner_session");
      if(owner?.access_token&&owner?.refresh_token){
        const restored=await S.auth.setSession({access_token:owner.access_token,refresh_token:owner.refresh_token});
        if(restored.error)throw restored.error;
        await enter(restored.data.session);
        toast("Sesión de caja cerrada · regresaste al administrador","ok");
      }else{
        await S.auth.signOut();
        toast("Sesión de caja cerrada","ok");
      }
    }catch(err){toast(err?.message||"No se pudo salir de la caja.","err")}
  };
  if(open&&!isCashier)$("#closeCashTop").onclick=()=>closeCashModal(open,expected);
  else if(!open&&!isCashier&&$("#openCashTop"))$("#openCashTop").onclick=()=>openCashModal();
  if(open){$("#cashIncome").onclick=()=>cashMovementModal(open,"INCOME");$("#cashExpense").onclick=()=>cashMovementModal(open,"EXPENSE");}
}

function downloadCashExcel(report){
  if(!window.XLSX)return toast("El módulo de Excel todavía está cargando. Inténtalo nuevamente.","err");
  const wb=XLSX.utils.book_new();
  const fmtDate=v=>v?new Date(v).toLocaleString("es-PE"):"";
  const fmtMoney=v=>Number(v||0).toFixed(2);

  const summary=[
    ["M.A.R.C. — INFORME DE CIERRE DE CAJA"],
    ["Período",report.start.toLocaleDateString("es-PE")+" al "+report.end.toLocaleDateString("es-PE")],
    [],
    ["Mes","Cierres","Ingresos","Egresos","Neto","Diferencia"],
    ...report.months.map(x=>[x.label,x.registers,Number(x.income.toFixed(2)),Number(x.expense.toFixed(2)),Number(x.net.toFixed(2)),Number(x.difference.toFixed(2))]),
    [],
    ["TOTAL",report.registers.length,Number(report.months.reduce((s,x)=>s+x.income,0).toFixed(2)),Number(report.months.reduce((s,x)=>s+x.expense,0).toFixed(2)),Number(report.months.reduce((s,x)=>s+x.net,0).toFixed(2)),Number(report.months.reduce((s,x)=>s+x.difference,0).toFixed(2))]
  ];
  const wsSummary=XLSX.utils.aoa_to_sheet(summary);
  wsSummary["!cols"]=[{wch:20},{wch:12},{wch:16},{wch:16},{wch:16},{wch:16}];
  XLSX.utils.book_append_sheet(wb,wsSummary,"Resumen");

  const closures=[
    ["Fecha apertura","Fecha cierre","Apertura","Esperado","Contado","Diferencia","Notas"],
    ...report.registers.map(x=>[fmtDate(x.opened_at),fmtDate(x.closed_at),Number(x.opening_amount||0),Number(x.expected_amount||0),Number(x.closing_amount||0),Number(x.difference||0),x.notes||""])
  ];
  const wsClosures=XLSX.utils.aoa_to_sheet(closures);
  wsClosures["!cols"]=[{wch:21},{wch:21},{wch:14},{wch:14},{wch:14},{wch:14},{wch:40}];
  if(closures.length>1)wsClosures["!autofilter"]={ref:"A1:G"+closures.length};
  XLSX.utils.book_append_sheet(wb,wsClosures,"Cierres");

  const regMap=new Map(report.registers.map(x=>[x.id,x]));
  const movRows=[
    ["Fecha","Caja","Usuario","Tipo","Concepto","Referencia","Monto"],
    ...report.movements.map(x=>[
      fmtDate(x.created_at),
      regMap.get(x.cash_register_id)?.closed_at?new Date(regMap.get(x.cash_register_id).closed_at).toLocaleDateString("es-PE"):"",
      x.created_by_name||"",
      x.type==="INCOME"?"Ingreso":"Egreso",
      x.concept||"",
      x.reference||"",
      Number(x.amount||0)
    ])
  ];
  const wsMov=XLSX.utils.aoa_to_sheet(movRows);
  wsMov["!cols"]=[{wch:21},{wch:14},{wch:24},{wch:12},{wch:38},{wch:25},{wch:14}];
  if(movRows.length>1)wsMov["!autofilter"]={ref:"A1:G"+movRows.length};
  XLSX.utils.book_append_sheet(wb,wsMov,"Movimientos");

  // Hojas adicionales para un informe de auditoría detallado.
  const dailyMap=new Map();
  for(const m of (report.movements||[])){const d=new Date(m.created_at);if(!Number.isFinite(d.getTime()))continue;const key=d.toISOString().slice(0,10);if(!dailyMap.has(key))dailyMap.set(key,{date:d,inc:0,exp:0,count:0});const row=dailyMap.get(key);row.count++;if(m.type==="INCOME")row.inc+=Number(m.amount||0);else if(m.type==="EXPENSE")row.exp+=Number(m.amount||0)}
  const dailyRows=[["Fecha","Movimientos","Ingresos","Egresos","Neto","Promedio por movimiento"],...[...dailyMap.values()].sort((a,b)=>a.date-b.date).map(x=>[x.date.toLocaleDateString("es-PE"),x.count,Number(x.inc.toFixed(2)),Number(x.exp.toFixed(2)),Number((x.inc-x.exp).toFixed(2)),Number(((x.inc+x.exp)/Math.max(1,x.count)).toFixed(2))])];
  const wsDaily=XLSX.utils.aoa_to_sheet(dailyRows);wsDaily["!cols"]=[{wch:15},{wch:14},{wch:16},{wch:16},{wch:16},{wch:24}];if(dailyRows.length>1)wsDaily["!autofilter"]={ref:"A1:F"+dailyRows.length};XLSX.utils.book_append_sheet(wb,wsDaily,"Diario");
  const auditRows=[["Control","Valor"],["Meses exportados",report.months.length],["Máximo permitido",6],["Cierres exportados",report.registers.length],["Movimientos exportados",(report.movements||[]).length],["Ingresos",Number(report.months.reduce((s,x)=>s+x.income,0).toFixed(2))],["Egresos",Number(report.months.reduce((s,x)=>s+x.expense,0).toFixed(2))],["Neto",Number(report.months.reduce((s,x)=>s+x.net,0).toFixed(2))],["Diferencia acumulada",Number(report.months.reduce((s,x)=>s+x.difference,0).toFixed(2))],["Comprobación neto",Math.abs(report.months.reduce((s,x)=>s+x.net,0)-report.months.reduce((s,x)=>s+x.income-x.expense,0))<0.005?"OK":"REVISAR"]];
  const wsAudit=XLSX.utils.aoa_to_sheet(auditRows);wsAudit["!cols"]=[{wch:36},{wch:24}];XLSX.utils.book_append_sheet(wb,wsAudit,"Control");
  const rawRows=[["ID movimiento","ID caja","Fecha","Tipo","Concepto","Referencia","Monto"],...(report.movements||[]).map(x=>[x.id,x.cash_register_id,x.created_at,x.type,x.concept||"",x.reference||"",Number(x.amount||0)])];
  const wsRaw=XLSX.utils.aoa_to_sheet(rawRows);wsRaw["!cols"]=[{wch:38},{wch:38},{wch:25},{wch:12},{wch:40},{wch:30},{wch:14}];if(rawRows.length>1)wsRaw["!autofilter"]={ref:"A1:G"+rawRows.length};XLSX.utils.book_append_sheet(wb,wsRaw,"Datos trazables");
  const filename="MARC_Cierre_Caja_"+report.start.getFullYear()+"-"+String(report.start.getMonth()+1).padStart(2,"0")+"_"+String(report.end.getFullYear())+"-"+String(report.end.getMonth()+1).padStart(2,"0")+".xlsx";
  XLSX.writeFile(wb,filename);
  toast("Excel generado correctamente","ok");
}

async function marketing(){
  const [{data:products,error},{data:companyData}]=await Promise.all([
    S.from("marc_inventory").select("id,name,sku,brand,model,category,price,stock,image_url,description,marketing_description").eq("user_id",st.u.id).eq("active",true).order("name").limit(1000),
    S.from("marc_company_profiles").select("business_name,legal_name,ruc,address,phone,email,logo_data").eq("user_id",st.u.id).maybeSingle()
  ]);
  if(error){toast(error.message,"err");return}
  const list=products||[],company=companyData||{};
  const saved=JSON.parse(localStorage.getItem("marc_marketing_last")||"null");

  $("#content").innerHTML=`
    <div class="ad-studio">
      <header class="ad-studio-hero">
        <div>
          <div class="eyebrow2">M.A.R.C. · PUBLICIDAD INTELIGENTE</div>
          <h1>Crea una publicidad sin complicarte.</h1>
          <p>Elige un producto o una foto, dime qué quieres comunicar y M.A.R.C. se encarga del texto, la composición visual, tu logo y tus datos comerciales.</p>
        </div>
        <div class="ad-brand-auto">
          <div class="ad-brand-logo" id="adAutoLogo"></div>
          <div><b id="adAutoName">${esc(company.business_name||"Tu empresa")}</b><small>Branding aplicado automáticamente</small></div>
          <span>✓ Automático</span>
        </div>
      </header>

      <div class="ad-flow">
        <section class="ad-card ad-source-card">
          <div class="ad-section-head"><span class="ad-step">1</span><div><b>Elige qué vamos a anunciar</b><small>Producto del inventario o una foto nueva.</small></div></div>
          <div class="ad-source-tabs">
            <button type="button" class="ad-source-tab active" data-source="new">➕ Nuevo producto</button>
            <button type="button" class="ad-source-tab" data-source="inventory">▣ Producto del inventario</button>
          </div>

          <div id="adNewSource" class="ad-source-panel">
            <div class="ad-photo-dual">
              <div class="ad-photo-box">
                <div class="ad-photo-box-head"><b>📷 Foto para el anuncio</b><small>La IA la transformará en la pieza publicitaria.</small></div>
                <div class="ad-photo-drop compact" id="adPhotoDrop">
                  <div class="ad-photo-preview" id="adPhotoPreview"><span>📷</span><b>Tomar o elegir foto</b><small>Esta será la imagen principal del anuncio.</small></div>
                  <div class="ad-photo-actions">
                    <label class="ad-photo-action primary"><span>📷</span><b>Cámara</b><small>Tomar foto</small><input id="adImageCamera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden></label>
                    <label class="ad-photo-action"><span>🖼️</span><b>Galería</b><small>Elegir foto</small><input id="adImage" type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
                  </div>
                </div>
              </div>
              <div class="ad-photo-box">
                <div class="ad-photo-box-head"><b>🔎 Foto de referencia</b><small>Opcional. Sirve para modelo, marca y detalles.</small></div>
                <div class="ad-photo-drop compact" id="adReferenceDrop">
                  <div class="ad-photo-preview" id="adReferencePreview"><span>🔎</span><b>Foto del modelo o etiqueta</b><small>Otra vista, caja, etiqueta o placa.</small></div>
                  <div class="ad-photo-actions">
                    <label class="ad-photo-action primary"><span>📷</span><b>Cámara</b><small>Tomar foto</small><input id="adReferenceCamera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden></label>
                    <label class="ad-photo-action"><span>🖼️</span><b>Galería</b><small>Elegir foto</small><input id="adReferenceImage" type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
                  </div>
                </div>
              </div>
            </div>
            <div class="ad-photo-state" id="adPhotoState">Puedes crear la publicidad con una sola foto. La segunda foto es opcional y ayuda a identificar modelo, marca y características.</div>
            <div class="ad-new-product-fields">
              <label class="ad-field"><span>Nombre del producto <em>opcional</em></span><input id="adNewName" placeholder="Ej. Cámara Hikvision 2MP"></label>
              <label class="ad-field"><span>Marca <em>opcional</em></span><input id="adNewBrand" placeholder="Ej. Hikvision"></label>
              <label class="ad-field"><span>Modelo <em>opcional</em></span><input id="adNewModel" placeholder="Ej. DS-2CD1027G2H"></label>
              <label class="ad-field"><span>Precio u oferta <em>opcional</em></span><input id="adNewPrice" placeholder="Ej. S/ 190"></label>
            </div>
          </div>

          <div id="adInventorySource" class="ad-source-panel hidden">
            <label class="ad-field"><span>Producto</span><select id="adProduct">${list.length?list.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+(p.sku?" · "+esc(p.sku):"")+'</option>').join(""):'<option value="">No hay productos activos</option>'}</label>
            <label class="ad-field"><span>Buscar producto</span><input id="adProductSearch" placeholder="Nombre, marca o modelo…"></label>
            <div class="ad-product-summary" id="adProductSummary"></div>
          </div>

        </section>

        <section class="ad-card ad-message-card">
          <div class="ad-section-head"><span class="ad-step">2</span><div><b>¿Qué quieres comunicar?</b><small>No necesitas saber de publicidad. Escríbelo como se lo dirías a M.A.R.C.</small></div></div>
          <div class="ad-objectives">
            <button type="button" class="ad-objective active" data-objective="VENDER"><strong>🛍️ Vender</strong><span>Enfocar beneficios y acción.</span></button>
            <button type="button" class="ad-objective" data-objective="GENERAR CONSULTAS"><strong>💬 Conseguir clientes</strong><span>Invitar a contactarte.</span></button>
            <button type="button" class="ad-objective" data-objective="PROMOCIONAR PRODUCTO"><strong>✨ Promocionar</strong><span>Presentar el producto.</span></button>
          </div>
          <label class="ad-field ad-brief"><span>Tu idea <em>opcional</em></span><textarea id="adDetails" rows="5" placeholder="Ej.: Quiero promocionar esta cámara para casas y pequeños negocios, que se vea profesional y que me contacten por WhatsApp."></textarea></label>
          <div class="ad-mini-row">
            <label class="ad-field"><span>Oferta o precio <em>opcional</em></span><input id="adOffer" placeholder="Ej. S/ 149"></label>
            <label class="ad-field"><span>Formato</span><select id="adFormat"><option value="1080x1080">Cuadrado · 1:1</option><option value="1080x1350">Vertical · 4:5</option><option value="1080x1920">Historia · 9:16</option></select></label>
          </div>
          <div class="ad-smart-note"><span>✦</span><div><b>M.A.R.C. decide lo demás</b><small>El tono, público, composición y llamada a la acción se completan automáticamente sin llenar más formularios.</small></div></div>
          <select id="adPlatform" class="marketing-hidden-control"><option value="WHATSAPP">WhatsApp</option></select>
          <select id="adTone" class="marketing-hidden-control"><option>PROFESIONAL</option></select>
          <input id="adObjective" class="marketing-hidden-control" value="VENDER">
          <input id="adAudience" class="marketing-hidden-control" value="">
          <input id="adCta" class="marketing-hidden-control" value="Escríbenos para cotizar">
          <select id="adTemplate" class="marketing-hidden-control"><option value="MODERN">Moderno</option></select>
          <button class="ad-create-button" id="generateAd" type="button">✦ Crear publicidad completa <span>Texto + imagen + logo</span></button>
          <div id="adStatus" class="msg"></div>
        </section>
      </div>

      <section class="ad-result is-empty" id="adResult">
        <div class="ad-result-head">
          <div><div class="eyebrow2">3 · RESULTADO</div><h2>Tu publicidad</h2><p>M.A.R.C. genera una propuesta lista para revisar, descargar o compartir.</p></div>
          <div class="ad-result-badge" id="adResultBadge">Esperando contenido</div>
        </div>
        <div class="ad-result-grid">
          <div class="ad-visual-panel">
            <div class="ad-canvas-wrap"><canvas id="adCanvas" width="1080" height="1080"></canvas></div>
            <div id="adVariants" class="marketing-variants"></div>
            <div class="ad-result-actions">
              <button class="primary" id="downloadAd" disabled>↓ Descargar imagen</button>
              <button class="secondary" id="shareAd">Compartir</button>
            </div>
            <small id="bannerHint" class="muted-small">La publicidad aparecerá aquí cuando pulses “Crear publicidad completa”.</small>
          </div>
          <div class="ad-copy-panel">
            <div class="ad-copy-card"><div><b>Texto principal</b><button class="secondary" data-copy="primary_text">Copiar</button></div><p id="adPrimary">—</p></div>
            <div class="ad-copy-card"><div><b>WhatsApp</b><button class="secondary" data-copy="whatsapp_text">Copiar</button></div><p id="adWhatsapp">—</p></div>
            <div class="ad-copy-card"><div><b>Texto corto</b><button class="secondary" data-copy="short_text">Copiar</button></div><p id="adShort">—</p></div>
            <div class="ad-copy-card"><div><b>Hashtags</b><button class="secondary" data-copy="hashtags">Copiar</button></div><p id="adHashtags">—</p></div>
          </div>
        </div>
      </section>
    </div>
  `;

  let currentProduct=list.find(p=>p.id===saved?.productId)||list[0]||null;
  let currentCampaign=saved?.campaign||null;
  let currentImage=null,currentImageFile=null,currentReferenceImage=null,currentReferenceFile=null,currentAiImage=null,currentAiVariants=[];
  let adSource="new";
  const $p=id=>document.getElementById(id);

  const setStatus=(text,type="")=>{const el=$p("adStatus");if(el){el.className="msg "+type;el.textContent=text}};
  const setResultState=(ready=false)=>{
    const b=$p("adResultBadge");
    const result=$p("adResult");
    if(result)result.classList.toggle("is-empty",!ready);
    if(b){b.textContent=ready?"Lista para usar":"Esperando contenido";b.className="ad-result-badge "+(ready?"ready":"")}
  };

  const applyLogo=()=>{
    const el=$p("adAutoLogo");
    if(!el)return;
    if(company.logo_data)el.style.backgroundImage='url("'+String(company.logo_data).replace(/"/g,'&quot;')+'")';
    else el.textContent=initials(company.business_name||"M.A.R.C.");
  };

  const renderProductSummary=()=>{
    const p=currentProduct,box=$p("adProductSummary");if(!box)return;
    if(!p){box.innerHTML='<span>Selecciona un producto o cambia a Foto.</span>';return}
    box.innerHTML='<div class="ad-product-thumb">'+(p.image_url?'<img src="'+esc(p.image_url)+'" alt="">':'<span>▣</span>')+'</div><div><b>'+esc(p.name||"Producto")+'</b><small>'+esc([p.brand,p.model,p.category].filter(Boolean).join(" · ")||"Información del inventario")+'</small></div><strong>'+((p.price!=null&&p.price!=="")?money(p.price):"Sin precio")+'</strong>';
  };

  const drawImage=async(src,maxW=1400)=>{
    if(!src)return "";
    return new Promise((resolve,reject)=>{
      const im=new Image();im.onload=()=>{
        const scale=Math.min(1,maxW/Math.max(im.width,im.height));
        const c=document.createElement("canvas"),w=Math.max(1,Math.round(im.width*scale)),h=Math.max(1,Math.round(im.height*scale));
        c.width=w;c.height=h;c.getContext("2d").drawImage(im,0,0,w,h);
        resolve(c.toDataURL("image/jpeg",.82));
      };im.onerror=reject;im.src=src;
    });
  };

  const renderCanvas=async()=>{
    const canvas=$p("adCanvas");if(!canvas)return;
    const [w,h]=($p("adFormat").value||"1080x1080").split("x").map(Number);canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d");
    const src=currentImage||currentProduct?.image_url||"";

    // Fondo visual local: usa la propia foto desenfocada como ambiente y conserva
    // una copia nítida del producto al frente. Esto evita otra llamada de generación de imagen.
    ctx.clearRect(0,0,w,h);
    const base=ctx.createLinearGradient(0,0,w,h);
    base.addColorStop(0,"#06182e");base.addColorStop(.55,"#0a467f");base.addColorStop(1,"#13a6e8");
    ctx.fillStyle=base;ctx.fillRect(0,0,w,h);

    let img=null;
    if(src){
      try{
        img=await new Promise((res,rej)=>{
          const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=src;
        });
      }catch{}
    }

    if(img){
      ctx.save();
      ctx.globalAlpha=.30;
      ctx.filter="blur(18px) saturate(1.15)";
      const cover=Math.max(w/img.width,h/img.height),bw=img.width*cover,bh=img.height*cover;
      ctx.drawImage(img,(w-bw)/2,(h-bh)/2,bw,bh);
      ctx.restore();
      const shade=ctx.createLinearGradient(0,0,w,h);
      shade.addColorStop(0,"rgba(3,17,34,.76)");shade.addColorStop(.48,"rgba(4,38,73,.55)");shade.addColorStop(1,"rgba(8,126,184,.72)");
      ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
    }

    // Detalles gráficos discretos para dar aspecto publicitario sin alterar el producto.
    ctx.fillStyle="rgba(255,255,255,.08)";ctx.beginPath();ctx.arc(w*.88,h*.16,Math.min(w,h)*.25,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="rgba(142,228,255,.10)";ctx.beginPath();ctx.arc(w*.08,h*.72,Math.min(w,h)*.20,0,Math.PI*2);ctx.fill();

    if(company.logo_data){
      try{
        const logo=await new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=company.logo_data});
        const lh=Math.min(h*.075,w*.22),lw=lh*(logo.width/logo.height);
        ctx.drawImage(logo,w*.08,h*.045,lw,lh);
      }catch{}
    }

    if(img){
      const boxW=w*.82,boxH=h*.39,scale=Math.min(boxW/img.width,boxH/img.height),iw=img.width*scale,ih=img.height*scale;
      const x=(w-iw)/2,y=h*.13+(boxH-ih)/2;
      ctx.save();
      ctx.shadowColor="rgba(0,0,0,.38)";ctx.shadowBlur=28;ctx.shadowOffsetY=12;
      ctx.fillStyle="rgba(255,255,255,.97)";
      ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x-20,y-20,iw+40,ih+40,30);else ctx.rect(x-20,y-20,iw+40,ih+40);ctx.fill();
      ctx.restore();
      ctx.drawImage(img,x,y,iw,ih);
    }

    ctx.textAlign="left";
    ctx.fillStyle="#8ee4ff";ctx.font="800 "+Math.round(Math.min(w,h)*.026)+"px Inter";
    ctx.fillText("PUBLICIDAD · "+String(company.business_name||"M.A.R.C.").slice(0,28),w*.08,h*.59);

    const banner=String(currentCampaign?.banner_text||currentCampaign?.headline||currentProduct?.name||"Tu producto").split(/\n/).slice(0,3);
    ctx.fillStyle="#fff";ctx.font="900 "+Math.round(Math.min(w,h)*.062)+"px Inter";
    let y=h*.66;
    banner.forEach(line=>{
      const words=line.split(" "),lines=[],max=w*.84;let row="";
      for(const word of words){const test=row?row+" "+word:word;if(ctx.measureText(test).width>max&&row){lines.push(row);row=word}else row=test}
      if(row)lines.push(row);
      lines.slice(0,3).forEach(t=>{ctx.fillText(t,w*.08,y);y+=Math.round(Math.min(w,h)*.071)});
    });

    const offer=$p("adOffer")?.value.trim();
    if(offer){
      ctx.fillStyle="#fff";ctx.font="900 "+Math.round(Math.min(w,h)*.034)+"px Inter";
      ctx.fillText(offer.slice(0,42),w*.08,h*.86);
    }else if(currentProduct?.price!=null&&currentProduct.price!==""){
      ctx.fillStyle="#fff";ctx.font="900 "+Math.round(Math.min(w,h)*.038)+"px Inter";
      ctx.fillText(money(currentProduct.price),w*.08,h*.86);
    }

    ctx.fillStyle="#d9efff";ctx.font="800 "+Math.round(Math.min(w,h)*.021)+"px Inter";
    ctx.fillText(String(company.business_name||"").slice(0,55),w*.08,h*.925);
    if(company.phone){
      ctx.fillStyle="#9fd8ff";ctx.font="700 "+Math.round(Math.min(w,h)*.017)+"px Inter";
      ctx.fillText("WhatsApp · "+String(company.phone).slice(0,28),w*.08,h*.955);
    }

    ctx.fillStyle="#fff";
    if(ctx.roundRect)ctx.roundRect(w*.67,h*.88,w*.25,h*.065,18);else ctx.fillRect(w*.67,h*.88,w*.25,h*.065);
    ctx.fillStyle="#0b4c91";ctx.font="900 "+Math.round(Math.min(w,h)*.019)+"px Inter";ctx.textAlign="center";
    ctx.fillText("Escríbenos",w*.795,h*.922);ctx.textAlign="left";
  };

  const setCampaign=async campaign=>{
    currentCampaign=campaign||null;
    $p("adPrimary").textContent=campaign?.primary_text||"—";
    $p("adWhatsapp").textContent=campaign?.whatsapp_text||"—";
    $p("adShort").textContent=campaign?.short_text||"—";
    $p("adHashtags").textContent=(campaign?.hashtags||[]).join(" ")||"—";
    if(campaign){localStorage.setItem("marc_marketing_last",JSON.stringify({campaign,productId:currentProduct?.id}));setResultState(true)}
    await renderCanvas();
    $p("downloadAd").disabled=!campaign;
  };

  const updatePhotoPreview=()=>{
    const box=$p("adPhotoPreview");if(!box)return;
    if(!currentImage){box.innerHTML='<span>📷</span><b>Toma o selecciona una foto</b><small>JPG, PNG o WEBP · M.A.R.C. la optimiza automáticamente.</small>';return}
    box.innerHTML='<img src="'+currentImage+'" alt="Producto"><button type="button" class="ad-photo-remove" id="adPhotoRemove">×</button>';
    $p("adPhotoRemove").onclick=()=>{currentImage=null;currentImageFile=null;currentAiImage=null;updatePhotoPreview();renderCanvas()};
  };

  const preparePhoto=async file=>{
    if(!file)return;
    if(!/^image\/(jpeg|png|webp)$/.test(file.type))return toast("Usa una imagen JPG, PNG o WEBP.","err");
    if(file.size>10*1024*1024)return toast("La imagen debe pesar menos de 10 MB.","err");
    currentImageFile=file;
    currentImage=URL.createObjectURL(file);
    currentAiImage=null;
    updatePhotoPreview();
    const state=$p("adPhotoState");
    if(state)state.textContent="✓ Foto principal lista. M.A.R.C. la transformará con IA al crear la publicidad.";
    if(adSource==="new"){
      currentProduct={...(currentProduct||{}),id:null,name:$p("adNewName")?.value.trim()||"Nuevo producto",brand:$p("adNewBrand")?.value.trim()||null,model:$p("adNewModel")?.value.trim()||null,price:$p("adNewPrice")?.value.trim()||null,image_url:currentImage,stock:null};
    }
    await renderCanvas();
  };

  const switchSource=source=>{
    adSource=source;
    $$$(".ad-source-tab").forEach(b=>b.classList.toggle("active",b.dataset.source===source));
    $p("adNewSource").classList.toggle("hidden",source!=="new");
    $p("adInventorySource").classList.toggle("hidden",source!=="inventory");
    if(source==="inventory"){
      currentProduct=list.find(p=>p.id===$p("adProduct").value)||list[0]||null;
      renderProductSummary();renderCanvas();
    }else{
      currentProduct={...(currentProduct&&currentProduct.id?{}:currentProduct||{}),id:null,name:$p("adNewName")?.value.trim()||"Nuevo producto",brand:$p("adNewBrand")?.value.trim()||null,model:$p("adNewModel")?.value.trim()||null,price:$p("adNewPrice")?.value.trim()||null,image_url:currentImage||null,stock:null};
      renderCanvas();
    }
  };

  $$(".ad-source-tab").forEach(b=>b.onclick=()=>switchSource(b.dataset.source));
  $p("adProduct").onchange=async()=>{currentProduct=list.find(p=>p.id===$p("adProduct").value)||null;currentImage=null;currentImageFile=null;currentAiImage=null;renderProductSummary();await renderCanvas()};
  $p("adProductSearch").oninput=()=>{const q=$p("adProductSearch").value.toLowerCase().trim(),sel=$p("adProduct"),matches=list.filter(p=>[p.name,p.sku,p.brand,p.model].join(" ").toLowerCase().includes(q));sel.innerHTML=matches.length?matches.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+(p.sku?" · "+esc(p.sku):"")+'</option>').join(""):'<option value="">Sin coincidencias</option>';currentProduct=matches[0]||null;renderProductSummary();renderCanvas()};
  $p("adImage").onchange=e=>preparePhoto(e.target.files?.[0]);
  $p("adImageCamera").onchange=e=>preparePhoto(e.target.files?.[0]);
  const prepareReferencePhoto=async file=>{
    if(!file)return;
    if(!/^image\/(jpeg|png|webp)$/.test(file.type))return toast("Usa una imagen JPG, PNG o WEBP.","err");
    if(file.size>10*1024*1024)return toast("La foto de referencia debe pesar menos de 10 MB.","err");
    currentReferenceFile=file;currentReferenceImage=URL.createObjectURL(file);
    const box=$p("adReferencePreview");
    if(box)box.innerHTML='<img src="'+currentReferenceImage+'" alt="Referencia"><button type="button" class="ad-photo-remove" id="adReferenceRemove">×</button>';
    $p("adReferenceRemove").onclick=()=>{currentReferenceImage=null;currentReferenceFile=null;const b=$p("adReferencePreview");if(b)b.innerHTML='<span>🔎</span><b>Foto del modelo o etiqueta</b><small>Otra vista, caja, etiqueta o placa.</small>'};
    const state=$p("adPhotoState");if(state)state.textContent="✓ Foto de referencia lista. M.A.R.C. la usará para identificar datos cuando generes la publicidad.";
  };
  $p("adReferenceImage").onchange=e=>prepareReferencePhoto(e.target.files?.[0]);
  $p("adReferenceCamera").onchange=e=>prepareReferencePhoto(e.target.files?.[0]);
  const photoDrop=$p("adPhotoDrop");
  if(photoDrop){
    ["dragenter","dragover"].forEach(ev=>photoDrop.addEventListener(ev,e=>{e.preventDefault();photoDrop.classList.add("dragging")}));
    ["dragleave","drop"].forEach(ev=>photoDrop.addEventListener(ev,e=>{e.preventDefault();photoDrop.classList.remove("dragging")}));
    photoDrop.addEventListener("drop",e=>preparePhoto(e.dataTransfer?.files?.[0]));
  }
  $p("adFormat").onchange=renderCanvas;
  $p("adOffer").oninput=renderCanvas;
  ["adNewName","adNewBrand","adNewModel","adNewPrice"].forEach(id=>$p(id)?.addEventListener("input",()=>{
    if(adSource!=="new")return;
    currentProduct={...(currentProduct||{}),id:null,name:$p("adNewName").value.trim()||"Nuevo producto",brand:$p("adNewBrand").value.trim()||null,model:$p("adNewModel").value.trim()||null,price:$p("adNewPrice").value.trim()||null,image_url:currentImage||null,stock:null};
    renderCanvas();
  }));

  $$(".ad-objective").forEach(btn=>btn.onclick=()=>{
    $$(".ad-objective").forEach(x=>x.classList.toggle("active",x===btn));
    $p("adObjective").value=btn.dataset.objective;
    const presets={VENDER:"Quiero vender este producto destacando sus beneficios y una llamada a la acción clara.","GENERAR CONSULTAS":"Quiero generar consultas y que los clientes me contacten por WhatsApp.","PROMOCIONAR PRODUCTO":"Quiero presentar este producto de forma profesional y atractiva."};
    if(!$p("adDetails").value.trim())$p("adDetails").value=presets[btn.dataset.objective]||"";
  });

  const readImage=async()=>currentImage?await drawImage(currentImage,1600):"";
  const readReferenceImage=async()=>currentReferenceImage?await drawImage(currentReferenceImage,1400):"";
  const payload=async()=>{
    const base={client:null,product:currentProduct||{name:"Producto"},platform:"WHATSAPP",objective:$p("adObjective").value||"VENDER",tone:"PROFESIONAL",audience:"",offer:$p("adOffer").value.trim()||$p("adNewPrice")?.value.trim()||"",details:$p("adDetails").value.trim(),cta:"Escríbenos para cotizar"};
    base.imageData=await readImage();
    base.referenceImageData=await readReferenceImage();
    return base;
  };

  const createComplete=async()=>{
    const btn=$p("generateAd");if(btn.disabled)return;
    btn.disabled=true;btn.classList.add("loading");setStatus("M.A.R.C. está analizando el producto y preparando la publicidad…");
    try{
      if(adSource==="new"){
        currentProduct={...(currentProduct||{}),id:null,name:$p("adNewName").value.trim()||"Nuevo producto",brand:$p("adNewBrand").value.trim()||null,model:$p("adNewModel").value.trim()||null,price:$p("adNewPrice").value.trim()||null,image_url:currentImage||null,stock:null};
        if(!currentImage)throw new Error("Toma o selecciona la foto principal del producto.");
      }
      if(!currentProduct)throw new Error("Elige un producto del inventario o crea un producto nuevo.");

      // Una sola llamada de IA: Gemini analiza la foto principal + referencia y redacta todo.
      // La pieza visual se compone localmente en Canvas usando la foto real, por lo que
      // no dependemos de la generación de imágenes de pago ni esperamos un segundo modelo.
      const textR=await fetch("/api/marketing-ai",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+st.session?.access_token},
        body:JSON.stringify(await payload())
      });
      const textJ=await textR.json();
      if(!textR.ok)throw new Error(textJ.message||textJ.error||"No se pudo crear la publicidad.");
      await setCampaign(textJ.campaign);
      await saveMarketingCampaign(textJ.campaign,currentProduct,$p).catch(()=>{});
      currentAiImage=null;
      currentAiVariants=[];
      setStatus("Publicidad lista. La imagen se compuso con tu foto real, logo y datos comerciales.","ok");
      const hint=$p("bannerHint");if(hint)hint.textContent="Una sola llamada de IA · tu foto real se conserva · logo y composición se aplican localmente.";
      $p("adResult").scrollIntoView({behavior:"smooth",block:"start"});
    }catch(e){setStatus(e.message||"No se pudo crear la publicidad.","error")}
    finally{btn.disabled=false;btn.classList.remove("loading")}
  };

  $p("generateAd").onclick=createComplete;
  $p("downloadAd").onclick=()=>{if(!currentCampaign)return;const a=document.createElement("a");a.href=$p("adCanvas").toDataURL("image/png");a.download="MARC_Publicidad_"+String(currentProduct?.name||"producto").replace(/[^a-z0-9áéíóúñü]+/gi,"-").slice(0,50)+".png";a.click()};
  $p("shareAd").onclick=async()=>{if(!$p("adCanvas")||!currentCampaign)return toast("Primero crea la publicidad.","err");try{const blob=await new Promise(r=>$p("adCanvas").toBlob(r,"image/png"));const file=new File([blob],"MARC_Publicidad.png",{type:"image/png"});if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:currentCampaign.title||currentProduct?.name||"Publicidad",text:currentCampaign.short_text||"",files:[file]})}else{await navigator.clipboard?.writeText(currentCampaign.whatsapp_text||currentCampaign.primary_text||"");toast("El dispositivo no permite compartir la imagen directamente; el texto quedó copiado.","ok")}}catch(e){if(e?.name!=="AbortError")toast("No se pudo compartir.","err")}};
  $$("[data-copy]").forEach(b=>b.onclick=async()=>{const key=b.dataset.copy,val=key==="hashtags"?(currentCampaign?.hashtags||[]).join(" "):currentCampaign?.[key]||"";if(!val)return toast("No hay texto para copiar.","err");await navigator.clipboard?.writeText(val);toast("Texto copiado","ok")});

  applyLogo();
  if(currentProduct){$p("adProduct").value=currentProduct.id;renderProductSummary();await renderCanvas()}
  if(saved?.campaign)setCampaign(saved.campaign);
}
async function quoteModal(existing=null,preset=null){
  const clientsResult=await S.from("marc_clients").select("id,name,phone").eq("user_id",st.u.id).order("name");
  const inventoryResult=await S.from("marc_inventory").select("id,name,brand,model,price,cost,unit,stock").eq("user_id",st.u.id).eq("active",true).order("name");
  if(clientsResult.error)throw new Error("No se pudieron cargar los clientes: "+clientsResult.error.message);
  if(inventoryResult.error)throw new Error("No se pudo cargar el inventario: "+inventoryResult.error.message);
  const cls=clientsResult.data||[];
  const inv=inventoryResult.data||[];
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
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin:10px 0 5px"><b style="font-size:9px">PARTIDAS</b><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button type="button" id="improveAllQuote" class="secondary">✦ Mejorar descripciones</button><button type="button" id="add" class="secondary">＋ Línea</button></div></div>'+
      '<div id="lines"></div>'+
      '<label>Notas<textarea name="notes" rows="3">'+esc(quote?.notes||"")+'</textarea></label>'+
      '<div id="summary" class="quote-summary"></div>'+
      '<div class="modal-actions">'+(quote?'<button type="button" class="danger" id="deleteQuote">Eliminar cotización</button>':'')+'<button type="button" class="secondary" id="cancel">Cerrar</button><button type="button" class="secondary" id="print">Imprimir</button><button type="button" class="secondary" id="pdf">Descargar PDF</button><button type="button" class="secondary" id="reviewQuote">✦ Revisar con IA</button><button class="primary">'+(quote?"Guardar cambios":"Guardar cotización")+'</button></div>'+
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
          '<div class="quote-description-wrap"><input data-i="'+i+'" data-k="description" placeholder="Descripción (opcional)" value="'+esc(x.description)+'"><button type="button" class="secondary quote-ai-line" data-ai-line="'+i+'" title="Mejorar esta descripción con IA">✦ Mejorar</button></div></div>'+
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

  box.onclick=async e=>{
    if(e.target.dataset.r!=null){
      lines.splice(Number(e.target.dataset.r),1);
      if(!lines.length)lines.push(defaultLine());
      draw();
      return;
    }
    const aiLine=e.target.closest(".quote-ai-line");
    if(!aiLine)return;
    const i=Number(aiLine.dataset.aiLine);
    const line=lines[i];
    if(!line)return;
    const original=String(line.description||"").trim();
    if(!original)return toast("Escribe primero la descripción de esta partida.","err");
    aiLine.disabled=true;
    const previous=aiLine.textContent;
    aiLine.textContent="✦ Mejorando…";
    try{
      const r=await fetch("/api/quote-ai",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+st.session?.access_token},
        body:JSON.stringify({description:original,improveOnly:true})
      });
      const j=await r.json();
      if(!r.ok)throw new Error(j.message||j.error||"No se pudo mejorar la descripción.");
      if(j.improved?.description)line.description=String(j.improved.description).trim();
      if(j.improved?.title && line.type==="TRABAJO" && (!String(line.name||"").trim() || /^trabajo$/i.test(String(line.name||"").trim())))line.name=String(j.improved.title).trim();
      draw();
      toast("Descripción mejorada por IA.","ok");
    }catch(err){
      toast(err.message||"No se pudo mejorar la descripción.","err");
      aiLine.disabled=false;
      aiLine.textContent=previous;
    }
  };

  $("#reviewQuote").onclick=async()=>{
    const btn=$("#reviewQuote");
    const valid=lines.filter(x=>x.type==="PRODUCTO"?!!x.inventory_id:!!String(x.name||"").trim());
    if(!valid.length)return toast("Agrega al menos una partida antes de revisar.","err");
    const payload=valid.map((x,i)=>({index:i,type:x.type,name:x.name||"",description:x.description||"",quantity:Number(x.qty||0),unit_price:Number(x.price||0),cost:Number(x.cost||0),transport:Number(x.transport||0),labor:Number(x.labor||0),other:Number(x.other||0),material_provider:x.material_provider||"CLIENT"}));
    btn.disabled=true;const prev=btn.textContent;btn.textContent="✦ Revisando…";
    try{
      const r=await fetch("/api/quote-ai",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+st.session?.access_token},body:JSON.stringify({reviewQuote:true,items:payload,taxEnabled:$("#f [name=tax_enabled]").value==="true",taxRate:Number($("#f [name=tax_rate]").value||18),title:$("#f [name=title]").value||"Cotización",notes:$("#f [name=notes]").value||""})});
      const j=await r.json();if(!r.ok)throw new Error(j.message||j.error||"No se pudo revisar la cotización.");
      const issues=Array.isArray(j.review?.issues)?j.review.issues:[], positives=Array.isArray(j.review?.positives)?j.review.positives:[];
      const body=(issues.length?'<div class="ai-review-section"><b>Revisar antes de guardar</b>'+issues.map(x=>'<div class="ai-review-item issue"><strong>⚠ '+esc(x.title||"Observación")+'</strong><span>'+esc(x.detail||"")+'</span></div>').join("")+"</div>":'<div class="ai-review-section"><b>Revisión técnica</b><div class="ai-review-item good"><strong>✓ Sin observaciones importantes</strong><span>No se detectaron problemas relevantes con los datos proporcionados.</span></div></div>')+(positives.length?'<div class="ai-review-section"><b>Correcto</b>'+positives.map(x=>'<div class="ai-review-item good"><strong>✓ '+esc(x.title||"Correcto")+'</strong><span>'+esc(x.detail||"")+'</span></div>').join("")+"</div>":"");
      const close=modal('<div class="modal-head"><div><h2>✦ Revisión de M.A.R.C.</h2><p>Análisis previo al guardado. No modifica la cotización.</p></div><button class="close" id="closeReview">×</button></div><div class="ai-review-grid">'+body+'</div><div class="modal-actions"><button type="button" class="primary" id="closeReview2">Continuar con la cotización</button></div>');
      $("#closeReview").onclick=close;$("#closeReview2").onclick=close;
    }catch(err){toast(err.message||"No se pudo revisar la cotización.","err")}finally{btn.disabled=false;btn.textContent=prev}
  };
  $("#add").onclick=()=>{lines.push(defaultLine());draw();};
  $("#improveAllQuote").onclick=async()=>{
    const btn=$("#improveAllQuote");
    const items=lines.map((x,i)=>({index:i,type:x.type,name:x.name||"",description:String(x.description||"").trim()})).filter(x=>x.description);
    if(!items.length)return toast("Escribe al menos una descripción para mejorar.","err");
    btn.disabled=true;const previous=btn.textContent;btn.textContent="✦ Mejorando…";
    try{
      const r=await fetch("/api/quote-ai",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+st.session?.access_token},body:JSON.stringify({improveLines:true,items})});
      const j=await r.json();if(!r.ok)throw new Error(j.message||j.error||"No se pudieron mejorar las descripciones.");
      const improved=Array.isArray(j.improvedLines)?j.improvedLines:[];let changed=0;
      improved.forEach(x=>{const i=Number(x.index);if(!Number.isInteger(i)||!lines[i])return;if(x.description){lines[i].description=String(x.description).trim();changed++}if(x.title&&lines[i].type==="TRABAJO"&&(!String(lines[i].name||"").trim()||/^trabajo$/i.test(String(lines[i].name||"").trim())))lines[i].name=String(x.title).trim()});
      draw();toast(changed?changed+" descripción"+(changed===1?"":"es")+" mejorada"+(changed===1?"":"s")+" por IA.":"No hubo cambios.","ok");
    }catch(err){toast(err.message||"No se pudieron mejorar las descripciones.","err")}finally{btn.disabled=false;btn.textContent=previous}
  };
  $("#f [name=tax_enabled]").onchange=updateSummary;
  $("#f [name=tax_rate]").oninput=updateSummary;
  $("#print").onclick=async()=>{const b=$("#print");b.disabled=true;try{await printQuote(existing?.id)}catch(err){toast(err?.message||"No se pudo preparar la impresión.","err")}finally{b.disabled=false}};
  $("#pdf").onclick=async()=>{const b=$("#pdf");b.disabled=true;const prev=b.textContent;b.textContent="Preparando PDF…";try{await downloadQuotePdf(existing?.id)}catch(err){toast(err?.message||"No se pudo generar el PDF.","err")}finally{b.disabled=false;b.textContent=prev}};
  draw();

  $("#f").onsubmit=async e=>{
    e.preventDefault();
    const submitBtn=e.currentTarget.querySelector('button[type="submit"]');
    if(submitBtn?.disabled)return;
    if(submitBtn)submitBtn.disabled=true;
    const d=new FormData(e.currentTarget);
    const valid=lines.filter(x=>x.type==="PRODUCTO"?!!x.inventory_id:!!String(x.name||"").trim());
    if(!valid.length){if(submitBtn)submitBtn.disabled=false;return toast("Agrega al menos una partida.","err");}
    if(valid.some(x=>Number(x.qty)<=0||Number(x.price)<0)){if(submitBtn)submitBtn.disabled=false;return toast("Revisa cantidades y precios.","err");}
    if(valid.some(x=>x.type==="TRABAJO"&&!Number(x.price))){if(submitBtn)submitBtn.disabled=false;return toast("Cada trabajo debe tener precio.","err");}
    if(valid.some(x=>Number(x.cost||0)<0||Number(x.transport||0)<0||Number(x.labor||0)<0||Number(x.other||0)<0)){if(submitBtn)submitBtn.disabled=false;return toast("Los costos no pueden ser negativos.","err");}
    const localWarnings=[];
    valid.forEach((x,i)=>{
      if(!String(x.description||"").trim())localWarnings.push("Partida "+(i+1)+": falta una descripción.");
      if(x.type==="TRABAJO" && !Number(x.labor||0) && !Number(x.transport||0) && !Number(x.other||0) && x.material_provider!=="CLIENT")localWarnings.push("Partida "+(i+1)+": no tiene costos internos registrados.");
    });
    if(localWarnings.length){
      const proceed=confirm("M.A.R.C. detectó estas observaciones antes de guardar:\n\n• "+localWarnings.join("\n• ")+"\n\n¿Deseas guardar de todas formas?");
      if(!proceed)return;
    }

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
  const drawTableHeader=()=>{doc.setFillColor(242,246,250);doc.rect(margin,y,pageW-margin*2,8,"F");doc.setFont("helvetica","bold");doc.setFontSize(8);doc.text("CONCEPTO",margin+2,y+5);doc.text("DESCRIPCIÓN",70,y+5);doc.text("CANT.",140,y+5);doc.text("PRECIO",158,y+5);doc.text("TOTAL",184,y+5);y+=12;doc.setFont("helvetica","normal")};drawTableHeader();
  for(const it of items){
    const desc=doc.splitTextToSize(String(it.description||""),64);
    const name=doc.splitTextToSize(String(it.name||""),55);
    const h=Math.max(7,4.2*Math.max(desc.length,name.length));
    if(y+h>270){doc.addPage();y=18;drawTableHeader()}
    doc.setFont("helvetica","bold");doc.text(name,margin+2,y);
    doc.setFont("helvetica","normal");doc.text(desc,70,y);
    doc.text(String(it.quantity||1),142,y);
    doc.text(money(it.unit_price).replace("PEN","S/"),158,y);
    doc.text(money(it.line_total).replace("PEN","S/"),184,y);
    y+=h+3;doc.setDrawColor(235);doc.line(margin,y-1,pageW-margin,y-1);
  }
  y+=5;
  if(y>245){doc.addPage();y=18}
  const totalsX=126;
  doc.setFont("helvetica","normal");doc.text("Subtotal",totalsX,y);doc.text(money(q.subtotal).replace("PEN","S/"),pageW-margin,y,{align:"right"});y+=6;
  doc.text("IGV",totalsX,y);doc.text(money(q.tax).replace("PEN","S/"),pageW-margin,y,{align:"right"});y+=7;
  doc.setDrawColor(30);doc.line(totalsX,y-3,pageW-margin,y-3);
  doc.setFont("helvetica","bold");doc.setFontSize(12);doc.text("TOTAL",totalsX,y+3);doc.text(money(q.total).replace("PEN","S/"),pageW-margin,y+3,{align:"right"});y+=12;
  if(q.notes){
    if(y>255){doc.addPage();y=18}
    doc.setFont("helvetica","bold");doc.setFontSize(9);doc.text("NOTAS",margin,y);y+=6;doc.setFont("helvetica","normal");doc.setFontSize(8);
    const noteLines=doc.splitTextToSize(String(q.notes),pageW-margin*2);
    doc.text(noteLines,margin,y);
  }
  const pageCount=doc.getNumberOfPages();
  for(let page=1;page<=pageCount;page++){
    doc.setPage(page);doc.setFont("helvetica","normal");doc.setFontSize(7);doc.setTextColor(120);
    doc.text("M.A.R.C. · "+String(q.number||"Cotización"),margin,289);
    doc.text("Página "+page+" de "+pageCount,pageW-margin,289,{align:"right"});
  }
  doc.setTextColor(0);
  const filename=String(q.number||"cotizacion").replace(/[^\w.-]+/g,"_")+".pdf";
  doc.save(filename);
  toast("PDF descargado","ok");
}

const authBootSnapshot={
  searchKeys:[...new URLSearchParams(location.search).keys()],
  hashKeys:[...new URLSearchParams(String(location.hash||"").replace(/^#/,"")).keys()]
};
function authDiag(prefix,extra=""){
  const s=authBootSnapshot;
  return prefix+" · URL search: "+(s.searchKeys.length?s.searchKeys.join(", "):"vacío")+" · URL hash: "+(s.hashKeys.length?s.hashKeys.join(", "):"vacío")+(extra?" · "+extra:"");
}
function cleanAuthUrl(){
  try{
    const clean=new URL(location.href);
    clean.search="";
    clean.hash="";
    history.replaceState({},document.title,clean.pathname);
  }catch{}
}
function authCallbackParams(){
  const search=new URLSearchParams(location.search);
  const hash=new URLSearchParams(String(location.hash||"").replace(/^#/,""));
  return {search,hash};
}
function describeAuthFailure(search,hash){
  const error=hash.get("error_description")||search.get("error_description")||hash.get("error")||search.get("error");
  if(error)return decodeURIComponent(String(error).replace(/\+/g," "));
  if(search.get("code"))return "Supabase devolvió un código OAuth, pero no se pudo crear la sesión.";
  if(hash.get("access_token"))return "Google devolvió un token, pero Supabase no pudo completar la sesión.";
  return "Google regresó a M.A.R.C. sin código, token ni sesión.";
}
function wire(){
  initTheme();
  const portalToken=new URLSearchParams(location.search).get("cliente_token");
  if(portalToken){
    renderClientPortal(portalToken);
    return;
  }
  const toggleTheme=()=>applyTheme(document.documentElement.dataset.theme==="dark"?"light":"dark");
  $("#themeToggle").onclick=toggleTheme;
  $("#authThemeToggle").onclick=toggleTheme;
  mode("login");
  if($("#googleLogin")){ $("#googleLogin").type="button"; $("#googleLogin").onclick=signInGoogle; }
  $("#authForm").onsubmit=submit;
  $("#passwordToggle").onclick=()=>{const i=$("#password"),b=$("#passwordToggle");if(!i)return;i.type=i.type==="password"?"text":"password";b.textContent=i.type==="password"?"◉":"◎"};
  $("#signupMode").onclick=()=>{mode(authMode==="signup"?"login":"signup");$("#signupMode").textContent=authMode==="signup"?"Volver a iniciar sesión":"Crear cuenta";$("#authForm")?.reset()};
  $("#forgotPassword").onclick=()=>{mode("reset");$("#signupMode").textContent="Volver a iniciar sesión"};
  $("#logout").onclick=async()=>{resetUiToLogin();await S.auth.signOut();};
  $("#askTop").onclick=openChat;
  $("#closeChat").onclick=closeChat;
  $("#exitConversation").onclick=closeChat;
  $("#menu").onclick=()=>$("#sidebar").classList.toggle("open");
  $("#mobileScrim").onclick=()=>$("#sidebar").classList.remove("open");
  // Navegación robusta para escritorio y móvil: delegación de eventos para que
  // los botones sigan funcionando aunque el contenido se redibuje dinámicamente.
  document.querySelectorAll(".sidebar nav button").forEach(b=>{
    b.type="button";
    b.onclick=(e)=>{e.preventDefault();e.stopPropagation();
      if(b.dataset.view==="suppliers"&&typeof window.marcSupplierCenter==="function")return window.marcSupplierCenter();
      if(b.dataset.view==="settings")return companySettings();
      return view(b.dataset.view);
    };
  });
  document.addEventListener("click",e=>{
    const b=e.target.closest?.(".sidebar nav button[data-view]");
    if(!b)return;
    e.preventDefault();
    if(b.dataset.view==="suppliers"&&typeof window.marcSupplierCenter==="function")return window.marcSupplierCenter();
    if(b.dataset.view==="settings")return companySettings();
    view(b.dataset.view);
  },true);
  $("#chatForm").onsubmit=e=>{e.preventDefault();const v=$("#chatInput").value.trim();if(v){$("#chatInput").value="";chatSend(v)}};
  $("#chatInput").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("#chatForm").requestSubmit()}};
  $$(".chips button").forEach(b=>b.onclick=()=>{$("#chatInput").value=b.dataset.q;$("#chatInput").focus()});

  const bootAuth=async()=>{
    const {search,hash}=authCallbackParams();
    const code=search.get("code");
    const error=hash.get("error_description")||search.get("error_description")||hash.get("error")||search.get("error");
    const oauthPending=sessionStorage.getItem("marc_google_oauth_pending")==="1";

    if(error){
      sessionStorage.removeItem("marc_google_oauth_pending");
      throw new Error(decodeURIComponent(String(error).replace(/\+/g," ")));
    }

    if(code){
      const exchanged=await S.auth.exchangeCodeForSession(code);
      if(exchanged.error)throw exchanged.error;
      if(exchanged.data?.session){
        sessionStorage.removeItem("marc_google_oauth_pending");
        cleanAuthUrl();
        await handleAuthSession(exchanged.data.session);
        return;
      }
    }

    const current=await S.auth.getSession();
    if(current.error)throw current.error;
    if(current.data?.session){
      sessionStorage.removeItem("marc_google_oauth_pending");
      cleanAuthUrl();
      await handleAuthSession(current.data.session);
      return;
    }

    await new Promise(r=>setTimeout(r,900));
    const retry=await S.auth.getSession();
    if(retry.error)throw retry.error;
    if(retry.data?.session){
      sessionStorage.removeItem("marc_google_oauth_pending");
      cleanAuthUrl();
      await handleAuthSession(retry.data.session);
      return;
    }

    // No hay sesión: la pantalla de acceso ya comunica el estado.
    // No mostramos diagnósticos técnicos debajo del botón de Google.
    msg("");
  };

  bootAuth().catch(e=>{
    console.error("[M.A.R.C. auth error]",e);
    msg(authDiag("Error de autenticación",e?.message||"Error desconocido"),"error");
  });
}
wire()})();
window.addEventListener("DOMContentLoaded",()=>{if($("#cashStaffLogin"))$("#cashStaffLogin").onclick=signInCashStaff});

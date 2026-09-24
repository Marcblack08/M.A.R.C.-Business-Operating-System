(()=>{const C=window.MARC_CONFIG,S=window.supabase.createClient(C.supabaseUrl,C.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"implicit"}});const st={u:null,session:null,view:"home",cid:null,authEpoch:0};let authListenerSession=null,authTimer=null,authEnteredSessionId=null;S.auth.onAuthStateChange((ev,s)=>{authListenerSession=s||null;console.info("[M.A.R.C. auth]",ev,!!s,s?.user?.id||"");if(s?.user){clearTimeout(authTimer);authTimer=setTimeout(()=>handleAuthSession(s),0)}else if(ev==="SIGNED_OUT"){clearTimeout(authTimer);authTimer=setTimeout(()=>resetUiToLogin(),0)}});const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)],esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])),money=v=>new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(Number(v||0)),toast=(t,c="")=>{const e=document.createElement("div");e.className="toast "+c;e.textContent=t;$("#toast").appendChild(e);setTimeout(()=>e.remove(),2600)},initials=n=>String(n||"M").split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join("");let authMode="login",recoveryMode=new URLSearchParams(location.search).get("recovery")==="1"||/type=recovery/i.test(location.hash);
function msg(t,c=""){const e=$("#authMsg");e.textContent=t;e.className="msg "+c}
async function logoutMARC(e){
  e?.preventDefault();
  e?.stopPropagation();
  const b=$("#logout");
  if(b?.dataset.busy==="1")return;
  if(b)b.dataset.busy="1";
  try{
    if(b){b.disabled=true;b.setAttribute("aria-busy","true");}
    clearTimeout(authTimer);
    sessionStorage.removeItem("marc_google_oauth_pending");
    sessionStorage.removeItem("marc_cash_owner_session");
    localStorage.removeItem("marc_password_reset_cooldown");
    await S.auth.signOut({scope:"local"});
    resetUiToLogin("Sesión cerrada correctamente.","ok");
  }catch(err){
    console.error("[M.A.R.C. logout]",err);
    resetUiToLogin();
    msg(err?.message||"No se pudo cerrar la sesión. Vuelve a intentarlo.","error");
  }finally{
    if(b){b.disabled=false;b.removeAttribute("aria-busy");delete b.dataset.busy;}
  }
}
document.addEventListener("click",e=>{
  const target=e.target?.closest?.("#logout");
  if(target){logoutMARC(e);}
});
const THEME_KEY="marc_theme";
function applyTheme(theme,save=true){
  const t=["light","dark","color"].includes(theme)?theme:"light";
  document.documentElement.dataset.theme=t;
  if(save)localStorage.setItem(THEME_KEY,t);
  const b=$("#themeToggle"),ab=$("#authThemeToggle"),i=$("#themeIcon"),l=$("#themeLabel");
  const meta={
    light:{icon:"☾",label:"Oscuro",next:"Cambiar a modo oscuro"},
    dark:{icon:"◐",label:"Color",next:"Cambiar a modo color"},
    color:{icon:"☀",label:"Claro",next:"Cambiar a modo claro"}
  }[t];
  if(i)i.textContent=meta.icon;
  if(ab)ab.querySelector("span").textContent=meta.icon;
  if(l)l.textContent=meta.label;
  if(b)b.setAttribute("aria-label",meta.next);
  if(ab)ab.setAttribute("aria-label",meta.next);
}
function cycleTheme(){
  const current=document.documentElement.dataset.theme||"light";
  applyTheme(current==="light"?"dark":current==="dark"?"color":"light");
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
  const d=new FormData(form),username=String(d.get("username")||"").trim().toLowerCase(),password=String(d.get("password")||"");
  cashStaffError("");
  if(!username||password.length<6)return cashStaffError("Escribe tu usuario y una contraseña válida.");
  if(b)b.disabled=true;
  try{
    const ownerSession=(await S.auth.getSession()).data?.session;
    if(ownerSession)sessionStorage.setItem("marc_cash_owner_session",JSON.stringify(ownerSession));
    const {error}=await S.auth.signInWithPassword({email:username+"@cash.marc.pe",password});
    if(error)throw error;
  }catch(err){
    cashStaffError(err?.message||"Usuario o contraseña incorrectos.");
    if(b)b.disabled=false;
  }
}

async async function signInGoogle(e){
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
function bindAuthControls(){
  const google=$("#googleLogin");
  if(google && !google.dataset.bound){
    google.dataset.bound="1";
    google.addEventListener("click",signInGoogle);
  }
  const form=$("#authForm");
  if(form && !form.dataset.bound){
    form.dataset.bound="1";
    form.addEventListener("submit",submit);
  }
  const toggle=$("#passwordToggle");
  if(toggle && !toggle.dataset.bound){
    toggle.dataset.bound="1";
    toggle.addEventListener("click",()=>{
      const p=$("#password");
      if(p){p.type=p.type==="password"?"text":"password";toggle.setAttribute("aria-label",p.type==="password"?"Mostrar contraseña":"Ocultar contraseña");}
    });
  }
  const forgot=$("#forgotPassword");
  if(forgot && !forgot.dataset.bound){
    forgot.dataset.bound="1";
    forgot.addEventListener("click",()=>mode("reset"));
  }
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bindAuthControls,{once:true});else bindAuthControls();

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
function title(x){$("#page").textContent={home:"Inicio",clients:"Clientes",inventory:"Inventario",suppliers:"Proveedores",quotes:"Cotizaciones",service_orders:"Órdenes de trabajo",settings:"Configuración",cash:"Cierre de caja"}[x]||"Inicio";$$(".sidebar nav button, #mobileNav button").forEach(b=>b.classList.toggle("active",b.dataset.view===x))}
let __viewBusy=false;
async function view(x){
  if(__viewBusy&&st.view===x)return;
  const content=$("#content");
  const run=async()=>{
    st.view=x;title(x);$("#sidebar").classList.remove("open");document.body.style.overflow="";
    if(window.innerWidth<=780)window.scrollTo(0,0);
    $$(".sidebar nav button,.mobile-bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===x));
    if(x==="home")return home();if(x==="clients")return clients();if(x==="inventory")return inventory();
    if(x==="suppliers"){if(window.marcSupplierCenter)return window.marcSupplierCenter();return toast("No se pudo cargar el Centro de Proveedores. Recarga la aplicación.","err");}
    if(x==="quotes")return quotes();if(x==="service_orders")return serviceOrders();if(x==="cash")return cash();return settings();
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
  const [cl,iv,qt,so]=await Promise.all([
    S.from("marc_clients").select("*",{count:"exact"}).eq("user_id",st.u.id),
    S.from("marc_inventory").select("*").eq("user_id",st.u.id).eq("active",true).order("name"),
    S.from("marc_quotes").select("*").eq("user_id",st.u.id).is("deleted_at",null).order("created_at",{ascending:false}).limit(120)
  ]);

  const inventory=iv.data||[];
  const quotes=qt.data||[];
  const serviceOrdersData=so.data||[];
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
  const otRevenue=serviceOrdersData.reduce((sum,r)=>sum+Number(r.revenue??0),0);
  const otCosts=serviceOrdersData.reduce((sum,r)=>sum+Number(r.labor_cost??0)+Number(r.transport_cost??0)+Number(r.materials_cost??0)+Number(r.other_cost??0),0);
  const otProfit=serviceOrdersData.reduce((sum,r)=>sum+Number(r.profit??(Number(r.revenue??0)-Number(r.labor_cost??0)-Number(r.transport_cost??0)-Number(r.materials_cost??0)-Number(r.other_cost??0)),0);
  const otMargin=otRevenue>0?(otProfit/otRevenue)*100:0;
  const activeOT=serviceOrdersData.filter(r=>!["ENTREGADA","CANCELADA"].includes(String(r.status||"").toUpperCase())).length;

  c.innerHTML=`
    <div class="dashboard-shell">
      <section class="dashboard-hero">
        <div class="hero-copy">
          <div class="hero-eyebrow">CENTRO DE OPERACIONES</div>
          <h1>¡Buenos días!<br><span>M.A.R.C. se encarga.</span></h1>
          <p>Tu negocio, tus clientes y tus ventas bajo el control de tu mayordomo digital.</p>
          <div class="hero-actions">
            <button id="askHome" class="primary hero-primary">✦ Hablar con M.A.R.C.</button>
            <button id="heroQuote" class="hero-secondary">＋ Nueva cotización</button>
          </div>
        </div>
        <div class="hero-visual" aria-hidden="true">
          <div class="hero-visual-ring"></div>
          <div class="hero-visual-logo is-marc-brand" id="heroBrandLogo"><img src="assets/marc-brand-logo.jpg" alt="M.A.R.C."></div>
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
    // El hero pertenece a M.A.R.C.; el logo de la empresa queda reservado para
    // Configuración, cotizaciones, PDF y publicidad. Nunca debe dominar el dashboard.
    heroLogo.innerHTML='<img src="assets/marc-brand-mark.svg" alt="M.A.R.C.">';
    heroLogo.classList.remove("has-company-logo");
    heroLogo.classList.add("is-marc-brand");
  }
  const otPanel=document.createElement("section");
  otPanel.className="dashboard-panel ot-profit-dashboard";
  otPanel.innerHTML='<div class="finance-heading"><div><div class="panel-eyebrow">OPERACIONES</div><h2>Rentabilidad de trabajos</h2><p>Las órdenes de trabajo forman parte del control financiero de M.A.R.C.</p></div><button id="openServiceOrdersFromHome" class="panel-link">Ver órdenes →</button></div><div class="ot-profit-grid"><div><span>COBRADO</span><strong>'+money(otRevenue)+'</strong><small>Total registrado en OT</small></div><div><span>COSTOS</span><strong>'+money(otCosts)+'</strong><small>Todos los costos reales</small></div><div><span>UTILIDAD</span><strong class="'+(otProfit>=0?"ok":"out")+'">'+money(otProfit)+'</strong><small>Resultado acumulado</small></div><div><span>MARGEN</span><strong>'+otMargin.toFixed(1)+'%</strong><small>'+serviceOrdersData.length+' OT registradas · '+activeOT+' activas</small></div></div>';
  const financeDash=c.querySelector(".finance-dashboard");
  if(financeDash)financeDash.before(otPanel);
  $("#openServiceOrdersFromHome").onclick=()=>serviceOrders();

  $("#askHome").onclick=openChat;
  $("#heroQuote").onclick=quoteModal;
  $("#openInventory").onclick=inventory;
  $("#openQuotes").onclick=quotes;
  $$(".quick-modern-grid button",c).forEach(b=>b.onclick=()=>b.dataset.q==="client"?clientModal():b.dataset.q==="inventory"?inventoryModal():b.dataset.q==="quote"?quoteModal():b.dataset.q==="cash"?cash():openChat());
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

async function serviceOrders(){
  const {data,error}=await S.from("marc_service_orders").select("*,marc_clients(name)").eq("user_id",st.u.id).order("created_at",{ascending:false});
  if(error)return toast(error.message,"err");
  const rows=data||[],c=$("#content");
  const counts=["PENDIENTE","PROGRAMADA","EN_PROCESO","TERMINADA"].map(x=>rows.filter(r=>r.status===x).length);
  const revenue=rows.reduce((sum,r)=>sum+Number(r.revenue??0),0);
  const costs=rows.reduce((sum,r)=>sum+Number(r.labor_cost??0)+Number(r.transport_cost??0)+Number(r.materials_cost??0)+Number(r.other_cost??0),0);
  const profit=rows.reduce((sum,r)=>sum+Number(r.profit??(Number(r.revenue??0)-Number(r.labor_cost??0)-Number(r.transport_cost??0)-Number(r.materials_cost??0)-Number(r.other_cost??0)),0);
  const margin=revenue>0?(profit/revenue)*100:0;
  const formatPct=v=>Number(v||0).toLocaleString("es-PE",{minimumFractionDigits:1,maximumFractionDigits:1})+"%";
  c.innerHTML=`<div class="head"><div><div class="eyebrow2">SERVICIOS</div><h1>Órdenes de trabajo.</h1><p>Controla visitas, reparaciones, instalaciones y mantenimientos desde que entran hasta que se entregan.</p></div><button id="newServiceOrder" class="primary">＋ Nueva orden</button></div>
  <section class="client-summary"><div><span>PENDIENTES</span><strong>${counts[0]}</strong><small>Por atender</small></div><div><span>PROGRAMADAS</span><strong>${counts[1]}</strong><small>Con visita prevista</small></div><div><span>EN PROCESO</span><strong>${counts[2]}</strong><small>Trabajos activos</small></div><div><span>TERMINADAS</span><strong>${counts[3]}</strong><small>Trabajos cerrados</small></div></section>
  <section class="service-profitability-summary">
    <div><span>INGRESOS COBRADOS</span><strong>${money(revenue)}</strong><small>Importe registrado en las OT</small></div>
    <div><span>COSTO TOTAL REAL</span><strong>${money(costs)}</strong><small>Mano de obra + transporte + materiales + otros</small></div>
    <div><span>UTILIDAD ACUMULADA</span><strong class="${profit>=0?"ok":"out"}">${money(profit)}</strong><small>Ingresos menos todos los costos</small></div>
    <div><span>MARGEN GLOBAL</span><strong>${margin>=0?"":"-"}${formatPct(Math.abs(margin))}</strong><small>${rows.length} órdenes analizadas</small></div>
  </section>
  <section class="card table"><div class="toolbar"><div class="search"><input id="serviceOrderSearch" placeholder="Buscar orden, cliente, servicio o dirección…"></div><button id="serviceOrderRefresh" class="secondary">↻ Actualizar</button></div>
  <div class="scroll"><table class="data"><thead><tr><th>Orden</th><th>Cliente</th><th>Servicio</th><th>Programación</th><th>Estado</th><th>Cobrado</th><th>Costo real</th><th>Utilidad</th><th>Margen</th><th></th></tr></thead><tbody id="serviceOrderRows"></tbody></table></div></section>`;
  const draw=(items)=>$("#serviceOrderRows").innerHTML=items.map(r=>{
    const rev=Number(r.revenue??0),cost=Number(r.labor_cost??0)+Number(r.transport_cost??0)+Number(r.materials_cost??0)+Number(r.other_cost??0),p=Number(r.profit??(rev-cost)),m=rev>0?(p/rev)*100:0;
    return `<tr><td><b>${esc(r.number)}</b><br><small>${esc(r.title)}</small></td><td>${esc(r.marc_clients?.name||"Sin cliente")}</td><td>${esc(r.service_type||"Servicio")}</td><td>${r.scheduled_at?new Date(r.scheduled_at).toLocaleString("es-PE"):"—"}</td><td><span class="status-pill">${esc(r.status)}</span></td><td><b>${money(rev)}</b></td><td>${money(cost)}</td><td><b class="${p>=0?"ok":"out"}">${money(p)}</b></td><td>${formatPct(m)}</td><td><button class="secondary" data-service-order="${r.id}">Ver</button> <button class="secondary" data-service-photos="${r.id}">Fotos</button> <button class="secondary" data-service-checklist="${r.id}">Checklist</button> <button class="secondary" data-service-sign="${r.id}">Conformidad</button> <button class="secondary" data-service-report="${r.id}">Informe</button></td></tr>`
  }).join("")||'<tr><td colspan="10" class="empty">No hay órdenes de trabajo todavía.</td></tr>';
  draw(rows);
  $("#serviceOrderSearch").oninput=e=>{const q=e.target.value.toLowerCase();draw(rows.filter(r=>[r.number,r.title,r.service_type,r.location,r.marc_clients?.name].some(v=>String(v||"").toLowerCase().includes(q))))};
  $("#newServiceOrder").onclick=()=>serviceOrderModal();
  $("#serviceOrderRefresh").onclick=()=>serviceOrders();
  $("#serviceOrderRows").onclick=e=>{const rp=e.target.closest("[data-service-report]");if(rp){const r=rows.find(x=>x.id===rp.dataset.serviceReport);if(r)return serviceOrderReport(r)}const sg=e.target.closest("[data-service-sign]");if(sg){const r=rows.find(x=>x.id===sg.dataset.serviceSign);if(r)return serviceOrderSignatureModal(r)}const c=e.target.closest("[data-service-checklist]");if(c){const r=rows.find(x=>x.id===c.dataset.serviceChecklist);if(r)return serviceOrderChecklistModal(r)}const p=e.target.closest("[data-service-photos]");if(p){const r=rows.find(x=>x.id===p.dataset.servicePhotos);if(r)return serviceOrderPhotosModal(r)}const b=e.target.closest("[data-service-order]");if(b){const r=rows.find(x=>x.id===b.dataset.serviceOrder);if(r)serviceOrderModal(r)}};
}
async function serviceOrderReport(order){
 const close=modal('<div class="modal-head"><div><div class="eyebrow2">DOCUMENTO DE SERVICIO</div><h2>Informe / acta</h2><p>Incluye checklist, evidencias y conformidad del cliente.</p></div><button class="close" id="sorClose">×</button></div><div id="sorBody">Preparando documento…</div>');
 $("#sorClose").onclick=close;
 const [m,c,p]=await Promise.all([
  S.from("marc_service_order_materials").select("*").eq("user_id",st.u.id).eq("service_order_id",order.id).order("created_at"),
  S.from("marc_service_checklists").select("*").eq("user_id",st.u.id).eq("service_order_id",order.id).order("created_at"),
  S.from("marc_service_order_photos").select("*").eq("user_id",st.u.id).eq("service_order_id",order.id).order("created_at")
 ]);
 if(m.error||c.error||p.error)return $("#sorBody").innerHTML='<div class="msg error">'+esc((m.error||c.error||p.error).message)+'</div>';
 const mats=m.data||[],checks=c.data||[],photos=p.data||[];
 const signed=async path=>{if(!path)return "";const r=await S.storage.from("service-order-photos").createSignedUrl(path,3600);return r.error?"":r.data?.signedUrl||""};
 const photoUrls=await Promise.all(photos.map(x=>signed(x.storage_path)));
 const signatureUrl=await signed(order.customer_signature_path);
 const evidence=photos.map((x,i)=>photoUrls[i]?'<figure style="display:inline-block;width:30%;vertical-align:top;margin:1% 1% 1% 0"><img src="'+photoUrls[i]+'" style="width:100%;height:170px;object-fit:cover;border:1px solid #ddd"><figcaption><b>'+esc(x.photo_type)+'</b> '+esc(x.caption||"")+'</figcaption></figure>':'').join("");
 const html='<div class="card" style="padding:20px"><h2>'+esc(order.title||"Servicio")+'</h2><p><b>Orden:</b> '+esc(order.number||"")+' · <b>Estado:</b> '+esc(order.status||"")+'</p><p><b>Cliente:</b> '+esc(order.marc_clients?.name||"Sin cliente")+' · <b>Técnico:</b> '+esc(order.technician||"")+'</p><p><b>Ubicación:</b> '+esc(order.location||"")+'</p><hr><h3>Descripción</h3><p>'+esc(order.description||"—")+'</p><h3>Diagnóstico</h3><p>'+esc(order.diagnosis||"—")+'</p><h3>Trabajo realizado</h3><p>'+esc(order.work_performed||"—")+'</p><h3>Recomendaciones</h3><p>'+esc(order.recommendations||"—")+'</p><h3>Checklist</h3><ul>'+checks.map(x=>'<li><b>'+esc(x.result)+'</b> — '+esc(x.item)+(x.notes?' · '+esc(x.notes):"")+'</li>').join("")+'</ul><h3>Materiales</h3><table style="width:100%;border-collapse:collapse"><tr><th>Material</th><th>Cant.</th><th>Costo</th></tr>'+mats.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+x.quantity+'</td><td>'+money(Number(x.total||0))+'</td></tr>').join("")+'</table><h3>Costos</h3><p>Mano de obra: '+money(order.labor_cost)+' · Transporte: '+money(order.transport_cost)+' · Materiales: '+money(order.materials_cost)+' · <b>Total: '+money(order.total)+'</b></p><h3>Evidencia fotográfica</h3><div>'+evidence+'</div><h3>Conformidad del cliente</h3><p><b>Firmante:</b> '+esc(order.customer_signature_name||"No registrada")+' · <b>Fecha:</b> '+esc(order.customer_signature_at?new Date(order.customer_signature_at).toLocaleString("es-PE"):"No registrada")+'</p>'+(signatureUrl?'<div><img src="'+signatureUrl+'" style="width:360px;max-width:100%;height:120px;object-fit:contain;border-bottom:1px solid #333"></div>':'<p>No hay firma registrada.</p>')+'<div class="modal-actions"><button class="secondary" id="sorClose2">Cerrar</button><button class="primary" id="sorPrint">Imprimir / Guardar PDF</button></div></div>';
 $("#sorBody").innerHTML=html;
 $("#sorClose2").onclick=close;
 $("#sorPrint").onclick=()=>{const w=window.open("","_blank");if(!w)return toast("El navegador bloqueó la ventana. Permite ventanas emergentes.","err");const printable=html.replace(/<div class="modal-actions">[\\s\\S]*?<\\/div>\\s*<\\/div>$/,"");w.document.write('<html><head><title>'+esc(order.number||"Informe")+'</title><style>@page{size:A4;margin:16mm}body{font-family:Arial;padding:10px;line-height:1.45;color:#111}h1,h2,h3{margin:12px 0 6px}table{margin:10px 0;border-collapse:collapse}th,td{border:1px solid #ccc;padding:7px;text-align:left}img{break-inside:avoid}figure{break-inside:avoid}hr{margin:18px 0}</style></head><body>'+printable+'</body></html>');w.document.close();w.focus();setTimeout(()=>w.print(),700)};
}

function serviceOrderPhotosModal(order){
  const close=modal('<div class="modal-head"><div><div class="eyebrow2">EVIDENCIA DEL SERVICIO</div><h2>'+esc(order.number||"Orden")+'</h2><p>Fotos antes, durante y después del trabajo.</p></div><button class="close" id="sopClose">×</button></div><div id="sopBody">Cargando…</div>');
  $("#sopClose").onclick=close;
  const render=async()=>{const r=await S.from("marc_service_order_photos").select("*").eq("user_id",st.u.id).eq("service_order_id",order.id).order("created_at",{ascending:false});if(r.error)return $("#sopBody").innerHTML='<div class="msg error">'+esc(r.error.message)+'</div>';
    const rows=r.data||[];
    $("#sopBody").innerHTML='<div class="toolbar"><label>Tipo <select id="sopType"><option>ANTES</option><option>DURANTE</option><option>DESPUES</option></select></label><label>Descripción <input id="sopCaption" placeholder="Ej. Conector dañado"></label><label>Fotos <input id="sopFiles" type="file" accept="image/*" multiple></label><button class="primary" id="sopUpload">Subir fotos</button></div><div class="client-cards">'+(rows.map(x=>'<article class="client-card"><img data-photo-path="'+x.storage_path.replace(/"/g,"&quot;")+'" style="width:100%;max-height:220px;object-fit:cover;border-radius:14px"><b>'+esc(x.photo_type)+'</b><p>'+esc(x.caption||"Sin descripción")+'</p><small>'+new Date(x.created_at).toLocaleString("es-PE")+'</small></article>').join("")||'<div class="empty">Aún no hay evidencia fotográfica.</div>')+'</div>';
    document.querySelectorAll("#sopBody [data-photo-path]").forEach(async img=>{const z=await S.storage.from("service-order-photos").createSignedUrl(img.dataset.photoPath,3600);if(!z.error)img.src=z.data.signedUrl});
    $("#sopUpload").onclick=async()=>{const files=[...($("#sopFiles").files||[])];if(!files.length)return toast("Selecciona al menos una foto","err");const btn=$("#sopUpload");btn.disabled=true;for(const file of files){const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");const path=st.u.id+"/"+order.id+"/"+Date.now()+"_"+safe;const up=await S.storage.from("service-order-photos").upload(path,file,{upsert:false});if(up.error){btn.disabled=false;return toast(up.error.message,"err")}const ir=await S.from("marc_service_order_photos").insert({user_id:st.u.id,service_order_id:order.id,storage_path:path,photo_type:$("#sopType").value,caption:$("#sopCaption").value.trim()});if(ir.error){btn.disabled=false;return toast(ir.error.message,"err")}}toast("Fotos guardadas","ok");render()};
  };
  render();
}
async function defaultChecklistForService(type,title){
 return [
  "Confirmar solicitud, alcance y objetivo del trabajo",
  "Inspección inicial y registro del estado encontrado",
  "Verificar herramientas, materiales y recursos necesarios",
  "Verificar condiciones de seguridad antes de intervenir",
  "Ejecutar el trabajo según el alcance acordado",
  "Realizar pruebas funcionales o de calidad",
  "Verificar que el resultado cumpla lo solicitado",
  "Registrar incidencias, pendientes o trabajos adicionales",
  "Tomar evidencia del trabajo realizado",
  "Explicar el resultado y recomendaciones al cliente",
  "Confirmar conformidad y cierre del servicio"
 ];
}
async function serviceOrderSignatureModal(order){
 const close=modal('<div class="modal-head"><div><div class="eyebrow2">FIRMA DEL CLIENTE</div><h2>'+esc(order.number||"Orden")+'</h2><p>Firma directamente en la pantalla del celular, tablet o computadora.</p></div><button class="close" id="sosClose">×</button></div><div id="sosBody"><label>Nombre del cliente o representante<input id="sosName" placeholder="Nombre completo"></label><label>Documento / referencia<input id="sosDoc" placeholder="Opcional"></label><label>Resultado<select id="sosResult"><option>CONFORME</option><option>CONFORME_CON_OBSERVACIONES</option><option>NO_CONFORME</option></select></label><label>Observaciones<textarea id="sosNotes" rows="3"></textarea></label><div style="border:1px solid var(--border,#ccc);border-radius:14px;padding:8px;background:#fff"><canvas id="sosCanvas" width="900" height="280" style="width:100%;height:auto;touch-action:none"></canvas></div><div class="modal-actions"><button class="secondary" id="sosClear">Limpiar firma</button><button class="secondary" id="sosCancel">Cancelar</button><button class="primary" id="sosSave">Firmar y entregar</button></div></div>');
 $("#sosClose").onclick=close;$("#sosCancel").onclick=close;
 const canvas=$("#sosCanvas"),ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle="#111";ctx.lineWidth=4;ctx.lineCap="round";let drawing=false,moved=false;
 const point=e=>{const r=canvas.getBoundingClientRect(),t=e.touches?.[0]||e;return{x:(t.clientX-r.left)*canvas.width/r.width,y:(t.clientY-r.top)*canvas.height/r.height}};
 const down=e=>{e.preventDefault();drawing=true;moved=true;const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y)};
 const move=e=>{if(!drawing)return;e.preventDefault();const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke()};
 const up=e=>{drawing=false};
 canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointermove",move);window.addEventListener("pointerup",up);
 $("#sosClear").onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height)};
 $("#sosSave").onclick=async()=>{const b=$("#sosSave"),name=$("#sosName").value.trim();if(!name)return toast("Indica el nombre del firmante","err");if(!moved)return toast("Solicita la firma del cliente","err");b.disabled=true;const path=st.u.id+"/"+order.id+"/signature-"+Date.now()+".png";const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));const up=await S.storage.from("service-order-photos").upload(path,blob,{contentType:"image/png",upsert:false});if(up.error){b.disabled=false;return toast(up.error.message,"err")};
 const text="Conformidad: "+$("#sosResult").value+" · Firmado por: "+name+($("#sosDoc").value.trim()?" · Ref: "+$("#sosDoc").value.trim():"")+($("#sosNotes").value.trim()?" · "+$("#sosNotes").value.trim():"");
 const h=await S.from("marc_client_history").insert({user_id:st.u.id,client_id:order.client_id||null,event_type:"SERVICE_CONFORMITY",title:"Conformidad firmada "+(order.number||"OT"),description:text,visible_to_client:true,metadata:{service_order_id:order.id,result:$("#sosResult").value,signature_path:path}});
 if(h.error){b.disabled=false;return toast(h.error.message,"err")};
 const u=await S.from("marc_service_orders").update({status:"ENTREGADA",completed_at:new Date().toISOString(),customer_signature_path:path,customer_signature_name:name,customer_signature_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",order.id).eq("user_id",st.u.id);
 if(u.error){b.disabled=false;return toast(u.error.message,"err")};toast("Firma registrada y OT entregada","ok");close();serviceOrders();
 };
}

function serviceOrderChecklistModal(order){
 const close=modal('<div class="modal-head"><div><div class="eyebrow2">CHECKLIST TÉCNICO</div><h2>'+esc(order.number||"Orden")+'</h2><p>Verifica cada punto antes de entregar el servicio.</p></div><button class="close" id="socClose">×</button></div><div id="socBody">Cargando…</div>');
 $("#socClose").onclick=close;
 const r=await S.from("marc_service_checklists").select("*").eq("user_id",st.u.id).eq("service_order_id",order.id).order("created_at");
 if(!r.error && !(r.data||[]).length){
   const defaults=defaultChecklistForService(order.service_type||order.title);
   const seed=defaults.map(item=>({user_id:st.u.id,service_order_id:order.id,item,result:"PENDIENTE"}));
   if(seed.length) await S.from("marc_service_checklists").insert(seed);
 }
 const rows=r.data||[];
 const body=$("#socBody");
 body.innerHTML='<div class="toolbar"><input id="socItem" placeholder="Nuevo punto de verificación"><button class="primary" id="socAdd">＋ Agregar</button></div><div id="socList">'+(rows.map((x,i)=>'<div class="cols"><label style="flex:2"><input class="soc-note" data-id="'+x.id+'" value="'+esc(x.item)+'"></label><select class="soc-result" data-id="'+x.id+'"><option '+(x.result==="PENDIENTE"?"selected":"")+'>PENDIENTE</option><option '+(x.result==="OK"?"selected":"")+'>OK</option><option '+(x.result==="NO_OK"?"selected":"")+'>NO_OK</option><option '+(x.result==="NO_APLICA"?"selected":"")+'>NO_APLICA</option></select><input class="soc-comment" data-id="'+x.id+'" placeholder="Observación" value="'+esc(x.notes||"")+'"><button class="secondary soc-save" data-id="'+x.id+'">Guardar</button></div>').join("")||'<div class="empty">No hay puntos de verificación.</div>')+'</div>';
 $("#socAdd").onclick=async()=>{const item=$("#socItem").value.trim();if(!item)return;const z=await S.from("marc_service_checklists").insert({user_id:st.u.id,service_order_id:order.id,item});if(z.error)return toast(z.error.message,"err");serviceOrderChecklistModal(order)};
 body.querySelectorAll(".soc-save").forEach(b=>b.onclick=async()=>{const id=b.dataset.id;const result=body.querySelector('.soc-result[data-id="'+id+'"]').value;const item=body.querySelector('.soc-note[data-id="'+id+'"]').value.trim();const notes=body.querySelector('.soc-comment[data-id="'+id+'"]').value.trim();const z=await S.from("marc_service_checklists").update({item,result,notes,updated_at:new Date().toISOString()}).eq("id",id).eq("user_id",st.u.id);if(z.error)return toast(z.error.message,"err");toast("Checklist actualizado","ok")});
}
function serviceOrderModal(row=null){
  const isEdit=!!row;
  const close=modal(`<div class="modal-head"><div><div class="eyebrow2">ORDEN DE TRABAJO</div><h2>${isEdit?"Editar orden":"Nueva orden"}</h2><p>Registra el servicio, materiales, diagnóstico, trabajo y costo.</p></div><button class="close" id="serviceOrderClose">×</button></div>
  <form id="serviceOrderForm">
  <div class="cols"><label>Cliente<select id="soClient"><option value="">Sin cliente</option></select></label><label>Tipo de servicio<input id="soType" placeholder="Mantenimiento CCTV, reparación, instalación…"></label></div>
  <label>Título<input id="soTitle" required placeholder="Ej. Mantenimiento preventivo CCTV"></label>
  <div class="cols"><label>Dirección / ubicación<input id="soLocation"></label><label>Fecha y hora<input id="soDate" type="datetime-local"></label></div>
  <label>Descripción / solicitud<textarea id="soDescription" rows="3"></textarea></label>
  <div class="cols"><label>Diagnóstico<textarea id="soDiagnosis" rows="3"></textarea></label><label>Trabajo realizado<textarea id="soWork" rows="3"></textarea></label></div>
  <div class="cols"><label>Recomendaciones<textarea id="soRecommendations" rows="3"></textarea></label><label>Técnico<input id="soTechnician" placeholder="Nombre del técnico"></label></div>
  <div class="cols"><label>Mano de obra<input id="soLabor" type="number" min="0" step="0.01"></label><label>Transporte<input id="soTransport" type="number" min="0" step="0.01"></label></div><div class="cols"><label>Importe cobrado<input id="soRevenue" type="number" min="0" step="0.01"></label><label>Otros costos<input id="soOtherCost" type="number" min="0" step="0.01"></label></div>
  <section class="card" style="margin-top:12px"><div class="toolbar"><div><b>Materiales utilizados</b><small>Productos y cantidades consumidas en el servicio.</small></div><button type="button" class="secondary" id="soAddMaterial">＋ Agregar</button></div><div id="soMaterialsList"></div></section>
  <div class="cols"><label>Materiales<input id="soMaterials" type="number" min="0" step="0.01"></label><label>Estado<select id="soStatus"><option>PENDIENTE</option><option>PROGRAMADA</option><option>EN_PROCESO</option><option>TERMINADA</option><option>ENTREGADA</option><option>CANCELADA</option></select></label></div>
  <label>Notas<textarea id="soNotes" rows="2"></textarea></label>
  <div id="soMsg" class="msg"></div><div class="modal-actions"><button type="button" class="secondary" id="serviceOrderCancel">Cancelar</button><button type="submit" class="primary">Guardar orden</button></div></form>`);
  $("#serviceOrderClose").onclick=close;$("#serviceOrderCancel").onclick=close;
  let soProducts=[];
  S.from("marc_inventory").select("id,name,sku,cost,price,stock").eq("user_id",st.u.id).eq("active",true).order("name").then(({data})=>{
    soProducts=data||[];
    if(row)loadServiceOrderMaterials(row.id);
  });
  const materialRows=[];
  const renderMaterials=()=>{
    const root=$("#soMaterialsList"); if(!root)return;
    root.innerHTML=materialRows.length?materialRows.map((m,i)=>'<div class="cols so-material-row"><label>Producto<select data-mi="'+i+'" class="so-material-product"><option value="">Producto manual</option>'+soProducts.map(p=>'<option value="'+p.id+'" '+(m.inventory_id===p.id?"selected":"")+'>'+esc(p.name)+' · stock '+Number(p.stock||0)+'</option>').join("")+'</select></label><label>Cantidad<input data-mi="'+i+'" class="so-material-qty" type="number" min="0.001" step="0.001" value="'+Number(m.quantity||1)+'"></label><label>Costo unitario<input data-mi="'+i+'" class="so-material-cost" type="number" min="0" step="0.01" value="'+Number(m.unit_cost||0)+'"></label><button type="button" class="secondary so-material-remove" data-mi="'+i+'">Quitar</button></div>').join(""):'<div class="empty">Aún no hay materiales.</div>';
    root.querySelectorAll(".so-material-product").forEach(el=>el.onchange=()=>{const m=materialRows[Number(el.dataset.mi)],p=soProducts.find(x=>x.id===el.value);m.inventory_id=el.value||null;if(p){m.name=p.name;m.unit_cost=Number(p.cost??p.price??0)}renderMaterials()});
    root.querySelectorAll(".so-material-qty").forEach(el=>el.oninput=()=>materialRows[Number(el.dataset.mi)].quantity=Number(el.value||0));
    root.querySelectorAll(".so-material-cost").forEach(el=>el.oninput=()=>materialRows[Number(el.dataset.mi)].unit_cost=Number(el.value||0));
    root.querySelectorAll(".so-material-remove").forEach(el=>el.onclick=()=>{materialRows.splice(Number(el.dataset.mi),1);renderMaterials()});
  };
  $("#soAddMaterial").onclick=()=>{materialRows.push({inventory_id:null,name:"Material",quantity:1,unit_cost:0});renderMaterials()};renderMaterials();
  async function loadServiceOrderMaterials(orderId){const r=await S.from("marc_service_order_materials").select("*").eq("user_id",st.u.id).eq("service_order_id",orderId).order("created_at");if(!r.error){materialRows.push(...(r.data||[]));renderMaterials()}}
  S.from("marc_clients").select("id,name").eq("user_id",st.u.id).order("name").then(({data})=>{const sel=$("#soClient");(data||[]).forEach(x=>{const o=document.createElement("option");o.value=x.id;o.textContent=x.name;if(row?.client_id===x.id)o.selected=true;sel.appendChild(o)})});
  if(row){
    $("#soType").value=row.service_type||"";$("#soTitle").value=row.title||"";$("#soLocation").value=row.location||"";$("#soDate").value=row.scheduled_at?new Date(row.scheduled_at).toISOString().slice(0,16):"";
    $("#soDescription").value=row.description||"";$("#soDiagnosis").value=row.diagnosis||"";$("#soWork").value=row.work_performed||"";$("#soRecommendations").value=row.recommendations||"";$("#soTechnician").value=row.technician||"";
    $("#soLabor").value=row.labor_cost||0;$("#soTransport").value=row.transport_cost||0;$("#soMaterials").value=row.materials_cost||0;$("#soRevenue").value=row.revenue||row.total||0;$("#soOtherCost").value=row.other_cost||0;$("#soStatus").value=row.status||"PENDIENTE";$("#soNotes").value=row.notes||"";
  }
  $("#serviceOrderForm").onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;const labor=Number($("#soLabor").value||0),transport=Number($("#soTransport").value||0),materials=materialRows.reduce((a,m)=>a+Number(m.quantity||0)*Number(m.unit_cost||0),0),revenue=Number($("#soRevenue").value||0),otherCost=Number($("#soOtherCost").value||0),profit=revenue-(labor+transport+materials+otherCost),marginPct=revenue>0?(profit/revenue)*100:0;
    const payload={user_id:st.u.id,client_id:$("#soClient").value||null,title:$("#soTitle").value.trim(),service_type:$("#soType").value.trim(),description:$("#soDescription").value.trim(),diagnosis:$("#soDiagnosis").value.trim(),work_performed:$("#soWork").value.trim(),recommendations:$("#soRecommendations").value.trim(),location:$("#soLocation").value.trim(),scheduled_at:$("#soDate").value?new Date($("#soDate").value).toISOString():null,technician:$("#soTechnician").value.trim(),status:$("#soStatus").value,labor_cost:labor,transport_cost:transport,materials_cost:materials,total:labor+transport+materials,revenue,other_cost:otherCost,profit,margin_pct:marginPct,notes:$("#soNotes").value.trim(),updated_at:new Date().toISOString()};
    if(!isEdit)payload.number="OT-"+Date.now().toString().slice(-8);
    const q=isEdit?await S.from("marc_service_orders").update(payload).eq("id",row.id).eq("user_id",st.u.id):await S.from("marc_service_orders").insert(payload).select("id").single();
    const orderId=isEdit?row.id:q.data?.id;
    if(!q.error&&orderId){
      if(!isEdit && q.data?.id){} else if(isEdit){}
      await S.from("marc_service_order_materials").delete().eq("service_order_id",orderId).eq("user_id",st.u.id);
      const clean=materialRows.filter(m=>String(m.name||"").trim()&&Number(m.quantity||0)>0).map(m=>({user_id:st.u.id,service_order_id:orderId,inventory_id:m.inventory_id||null,name:String(m.name).trim(),quantity:Number(m.quantity||0),unit_cost:Number(m.unit_cost||0)}));
      if(clean.length){const mr=await S.from("marc_service_order_materials").insert(clean);if(mr.error){b.disabled=false;$("#soMsg").textContent=mr.error.message;$("#soMsg").className="msg error";return}}
      if(["TERMINADA","ENTREGADA"].includes($("#soStatus").value)){const cr=await S.rpc("marc_consume_service_order_materials",{p_order_id:orderId});if(cr.error){b.disabled=false;$("#soMsg").textContent=cr.error.message;$("#soMsg").className="msg error";return}}
    }
    if(q.error){b.disabled=false;$("#soMsg").textContent=q.error.message;$("#soMsg").className="msg error";return}
    close();toast(isEdit?"Orden actualizada":"Orden creada","ok");serviceOrders();
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
    const [quotesRes,reportsRes,historyRes,ordersRes]=await Promise.all([
      S.from("marc_quotes").select("id,number,title,status,total,tax_enabled,tax_rate,notes,created_at,updated_at").eq("user_id",st.u.id).eq("client_id",client.id).is("deleted_at",null).order("created_at",{ascending:false}),
      S.from("technical_reports").select("id,number,title,report_type,report_date,technician,location,equipment,problem,diagnosis,work_performed,recommendations,conclusions,observations,status,created_at").eq("user_id",st.u.id).eq("client_id",client.id).order("created_at",{ascending:false}),
      S.from("marc_client_history").select("id,event_type,title,description,metadata,visible_to_client,created_at").eq("user_id",st.u.id).eq("client_id",client.id).order("created_at",{ascending:false}),
      S.from("marc_service_orders").select("id,number,title,service_type,status,location,scheduled_at,technician,total,materials_cost,created_at,work_performed").eq("user_id",st.u.id).eq("client_id",client.id).order("created_at",{ascending:false})
    ]);
    if(quotesRes.error)throw quotesRes.error;
    if(reportsRes.error)throw reportsRes.error;
    if(historyRes.error)throw historyRes.error;
    if(ordersRes.error)throw ordersRes.error;
    const quotes=quotesRes.data||[],reports=reportsRes.data||[],notes=historyRes.data||[],orders=ordersRes.data||[];
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
    <div class="client-history-stats"><div><span>COTIZACIONES</span><b>${quotes.length}</b><small>Importe acumulado ${money(quotedTotal)}</small></div><div><span>COMPRAS / TRABAJOS</span><b>${purchased.length}</b><small>Partidas aceptadas o cobradas</small></div><div><span>PAGADO</span><b>${money(paidTotal)}</b><small>Ingresos vinculados</small></div><div><span>INFORMES</span><b>${reports.length}</b><small>Historial técnico</small></div><div><span>ÓRDENES</span><b>${orders.length}</b><small>Servicios registrados</small></div></div>
    <div class="client-history-grid">
      <section class="client-history-panel"><div class="panel-title-row"><div><div class="eyebrow2">PRODUCTOS Y SERVICIOS</div><h3>Lo que este cliente ha solicitado</h3></div></div><div class="client-product-list">${[...productMap.values()].map(x=>`<div><b>${esc(x.name)}</b><span>${Number(x.quantity).toLocaleString("es-PE")} · ${money(x.total)}</span></div>`).join("")||'<div class="empty">Todavía no hay partidas registradas.</div>'}</div></section>
      <section class="client-history-panel"><div class="panel-title-row"><div><div class="eyebrow2">CONDICIONES Y NOTAS</div><h3>Contexto del cliente</h3></div></div><div class="client-notes-list">${client.notes?`<article><b>Ficha del cliente</b><p>${esc(client.notes)}</p></article>`:""}${quotes.filter(q=>q.notes).slice(0,10).map(q=>`<article><b>${esc(q.number||q.title)}</b><p>${esc(q.notes)}</p></article>`).join("")}${notes.map(n=>`<article><b>${esc(n.title)}</b><p>${esc(n.description||"")}</p><small>${new Date(n.created_at).toLocaleString("es-PE")}${n.visible_to_client?" · visible al cliente":""}</small></article>`).join("")||(!client.notes&&!quotes.some(q=>q.notes)?'<div class="empty">No hay condiciones o notas registradas.</div>':"")}</div></section>
      <section class="client-history-panel full"><div class="panel-title-row"><div><div class="eyebrow2">COMPRAS Y COTIZACIONES</div><h3>Historial comercial</h3></div></div><div class="client-quote-list">${quotes.map(q=>`<article><div><b>${esc(q.number||"Cotización")}</b><strong>${money(q.total)}</strong></div><p>${esc(q.title||"Sin título")} · ${esc(q.status||"")}</p><small>${new Date(q.created_at).toLocaleString("es-PE")}</small><div class="client-quote-items">${items.filter(i=>i.quote_id===q.id).map(i=>`<span>${esc(i.name||"Partida")} × ${Number(i.quantity||0).toLocaleString("es-PE")} · ${money(i.line_total)}</span>`).join("")}</div></article>`).join("")||'<div class="empty">No hay cotizaciones para este cliente.</div>'}</div></section>
      <section class="client-history-panel full"><div class="panel-title-row"><div><div class="eyebrow2">TRABAJOS E INFORMES</div><h3>Historial técnico</h3></div></div><div class="client-report-list">${reports.map(r=>`<article><div><b>${esc(r.number||r.title||"Informe")}</b><span>${esc(r.status||"")}</span></div><p>${esc(r.work_performed||r.conclusions||r.observations||"Sin detalle")}</p><small>${esc(r.report_date||r.created_at||"")} · ${esc(r.technician||"")}</small></article>`).join("")||'<div class="empty">No hay informes técnicos vinculados.</div>'}</div></section>
      <section class="client-history-panel full"><div class="panel-title-row"><div><div class="eyebrow2">ÓRDENES DE TRABAJO</div><h3>Servicios registrados</h3></div></div><div class="client-report-list">${orders.map(o=>`<article><div><b>${esc(o.number||"Orden")}</b><span>${esc(o.status||"")}</span></div><p>${esc(o.title||o.service_type||"Servicio")} · ${money(o.total)}</p><small>${esc(o.scheduled_at?new Date(o.scheduled_at).toLocaleString("es-PE"):"Sin fecha")} · ${esc(o.technician||"")}</small>${o.work_performed?`<p><b>Trabajo:</b> ${esc(o.work_performed)}</p>`:""}</article>`).join("")||'<div class="empty">No hay órdenes de trabajo vinculadas.</div>'}</div></section>
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
  try{
    const r=await fetch("/api/cash-staff/context",{headers:{Authorization:"Bearer "+st.session?.access_token}});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||"No se pudo consultar el contexto de caja.");
    return {isStaff:!!j.isStaff,ownerId:j.ownerId||st.u.id,staff:j.staff||null};
  }catch(error){
    console.warn("[M.A.R.C. cash context]",error);
    return {isStaff:false,ownerId:st.u.id,staff:null};
  }
}
async function openCashModal(){
  const ctx=await getCashStaffContext();
  if(!ctx.ownerId)return toast("No se encontró la caja administradora.","err");
  const close=modal('<div class="modal-head"><div><h2>＋ Abrir caja</h2><p>Indica cuánto efectivo queda en la caja al comenzar.</p></div><button class="close" id="x">×</button></div><form id="cashOpenForm"><label>Efectivo inicial<input name="amount" type="number" min="0" step="0.01" required placeholder="0.00"></label><label>Nota opcional<textarea name="notes" rows="2" placeholder="Turno, caja o referencia…"></textarea></label><div class="modal-actions"><button type="button" class="secondary" id="cancel">Cancelar</button><button class="primary">Abrir caja</button></div></form>');
  $("#x").onclick=close;$("#cancel").onclick=close;
  $("#cashOpenForm").onsubmit=async e=>{
    e.preventDefault();const b=e.currentTarget.querySelector("button.primary");b.disabled=true;
    try{
      const amount=Number(new FormData(e.currentTarget).get("amount")||0);
      if(amount<0)throw new Error("El efectivo inicial no puede ser negativo.");
      const notes=String(new FormData(e.currentTarget).get("notes")||"").trim()||null;
      const {data:opened,error}=await S.rpc("marc_cash_open",{p_opening_amount:amount,p_notes:notes});
      if(error)throw error;
      if(!opened?.id)throw new Error("Supabase no confirmó la apertura de caja.");
      close();toast("Caja abierta correctamente","ok");await cash();
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
  if(!ctx.ownerId)return toast("No se encontró la caja administradora.","err");
  if(!open)return toast("Primero abre la caja para registrar ventas.","err");
  const income=type==="INCOME";
  let products=[];
  if(income){
    const {data,error}=await S.from("marc_inventory")
      .select("id,name,sku,brand,model,category,unit,price,stock,image_url,description")
      .eq("user_id",ctx.ownerId).eq("active",true).order("name").limit(1000);
    if(error)return toast(error.message,"err");
    products=data||[];
  }

  if(!income){
    const close=modal('<div class="modal-head"><div><div class="eyebrow2">SALIDA DE CAJA</div><h2>💸 Registrar gasto</h2><p>Registra el gasto y su categoría para mantener la caja ordenada.</p></div><button class="close" id="x">×</button></div><form id="cashMoveForm"><div class="cash-quick-amount"><span>S/</span><input name="amount" inputmode="decimal" type="number" min="0.01" step="0.01" required placeholder="0.00" autofocus></div><label>Tipo de gasto<select name="expense_category" required><option value="">Selecciona una categoría…</option><option>Compra de mercadería</option><option>Materiales</option><option>Transporte</option><option>Servicios</option><option>Alquiler</option><option>Alimentación</option><option>Personal</option><option>Mantenimiento</option><option>Otros</option></select></label><label>Concepto<input name="concept" required placeholder="¿En qué se gastó?"></label><label>Referencia opcional<input name="reference" placeholder="Boleta, factura, proveedor…"></label><div class="modal-actions"><button type="button" class="secondary" id="cancel">Cancelar</button><button class="primary">Registrar gasto</button></div></form>');
    $("#x").onclick=close;$("#cancel").onclick=close;
    $("#cashMoveForm").onsubmit=async e=>{
      e.preventDefault();const b=e.currentTarget.querySelector("button.primary");b.disabled=true;
      try{
        const d=new FormData(e.currentTarget),amountValue=Number(d.get("amount")||0),category=String(d.get("expense_category")||"").trim(),concept=String(d.get("concept")||"").trim(),reference=String(d.get("reference")||"").trim();
        if(amountValue<=0)throw new Error("Ingresa un monto válido.");
        if(!category)throw new Error("Selecciona el tipo de gasto.");
        const row={user_id:ctx.ownerId,cash_register_id:open.id,type:"EXPENSE",amount:amountValue,concept:"[GASTO: "+category+"] "+concept,reference:reference||null,created_by:st.u.id,created_by_name:ctx.staff?.display_name||st.u.email||"Usuario"};
        const {error}=await S.from("marc_cash_movements").insert(row);if(error)throw error;
        close();toast("Gasto registrado","ok");await cash();
      }catch(err){toast(err.message||"No se pudo registrar el gasto.","err");b.disabled=false}
    };
    return;
  }

  const categories=[...new Set(products.map(p=>String(p.category||"Otros").trim()).filter(Boolean))];
  const close=modal('<div class="modal-head"><div><div class="eyebrow2">PUNTO DE VENTA</div><h2>🛒 Nueva venta</h2><p>Selecciona productos, cantidades y cobra todo en una sola operación.</p></div><button class="close" id="x">×</button></div><div id="pos" style="display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,.9fr);gap:18px;max-height:72vh;overflow:hidden"><section style="min-width:0;display:flex;flex-direction:column;gap:10px"><input id="posSearch" class="cash-product-search" placeholder="🔎 Buscar producto, marca, modelo o SKU…" autofocus><div id="posCats" style="display:flex;gap:8px;overflow:auto;padding:2px 0 6px"></div><div id="posProducts" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px;overflow:auto;padding:2px"></div></section><aside style="border:1px solid var(--line,#ddd);border-radius:18px;padding:14px;display:flex;flex-direction:column;min-height:0;background:var(--panel,#fff)"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><b>Tu pedido</b><small style="display:block;opacity:.65">Toca un producto para añadirlo</small></div><span id="posCount" class="eyebrow2">0</span></div><div id="posCart" style="overflow:auto;flex:1;margin:10px 0"></div><div style="border-top:1px solid var(--line,#ddd);padding-top:12px"><div style="display:flex;justify-content:space-between;font-size:1.15rem"><b>Total</b><strong id="posTotal">S/ 0.00</strong></div><label style="margin-top:10px">Cliente / referencia opcional<input id="posReference" placeholder="Nombre, boleta, nota…"></label><button type="button" class="primary" id="posCharge" style="width:100%;margin-top:10px;padding:14px">Cobrar venta · S/ 0.00</button></div></aside></div>');
  $("#x").onclick=close;
  const search=$("#posSearch"),list=$("#posProducts"),cats=$("#posCats"),cartBox=$("#posCart"),totalBox=$("#posTotal"),countBox=$("#posCount"),charge=$("#posCharge");
  const cart=new Map();let activeCategory="TODOS";
  const money2=v=>money(v);
  const renderCats=()=>{
    const all=["TODOS",...categories];
    cats.innerHTML=all.map(c=>'<button type="button" class="secondary pos-cat" data-cat="'+esc(c)+'" style="white-space:nowrap;padding:7px 12px;border-radius:999px">'+esc(c)+'</button>').join("");
    $$(".pos-cat",cats).forEach(btn=>btn.onclick=()=>{activeCategory=btn.dataset.cat;renderProducts()});
  };
  const filtered=()=>{const q=String(search?.value||"").trim().toLowerCase();return products.filter(p=>(activeCategory==="TODOS"||String(p.category||"Otros").trim()===activeCategory)&&[p.name,p.sku,p.brand,p.model,p.category].some(v=>String(v||"").toLowerCase().includes(q))).slice(0,100);};
  const renderProducts=()=>{
    const rows=filtered();
    list.innerHTML=rows.map(p=>{
      const inCart=cart.get(p.id)?.quantity||0,stock=Number(p.stock||0),disabled=stock<=0;
      return '<button type="button" data-id="'+esc(p.id)+'" '+(disabled?'disabled':'')+' style="text-align:left;border:1px solid var(--line,#ddd);border-radius:16px;padding:10px;background:var(--panel,#fff);cursor:pointer;position:relative;opacity:'+(disabled?".55":"1")+'">'+(p.image_url?'<img src="'+esc(p.image_url)+'" alt="" style="width:100%;height:100px;object-fit:contain;border-radius:10px;background:#f5f5f5">':'<div style="height:100px;display:grid;place-items:center;border-radius:10px;background:rgba(127,127,127,.08);font-size:2rem">📦</div>')+'<b style="display:block;margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(p.name)+'</b><small style="display:block;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc([p.brand,p.model].filter(Boolean).join(" · ")||p.category||"Producto")+'</small><div style="display:flex;justify-content:space-between;gap:6px;margin-top:6px"><strong>'+money2(p.price)+'</strong><small>Stock '+stock+(inCart?' · Pedido '+inCart:"")+'</small></div></button>';
    }).join("")||'<div class="empty">No hay productos con esa búsqueda.</div>';
    $$('button[data-id]',list).forEach(btn=>btn.onclick=()=>addProduct(products.find(p=>p.id===btn.dataset.id)));
  };
  const renderCart=()=>{
    let total=0,count=0;
    cartBox.innerHTML=[...cart.values()].map(item=>{const line=Number(item.product.price||0)*item.quantity;total+=line;count+=item.quantity;return '<div style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:9px 0;border-bottom:1px solid var(--line,#ddd)"><div><b>'+esc(item.product.name)+'</b><small style="display:block;opacity:.65">'+money2(item.product.price)+' c/u</small><div style="display:flex;align-items:center;gap:5px;margin-top:5px"><button type="button" class="secondary pos-minus" data-id="'+esc(item.product.id)+'">−</button><b>'+item.quantity+'</b><button type="button" class="secondary pos-plus" data-id="'+esc(item.product.id)+'">+</button><button type="button" class="secondary pos-remove" data-id="'+esc(item.product.id)+'">Quitar</button></div></div><strong>'+money2(line)+'</strong></div>'}).join("")||'<div class="empty" style="padding:30px 4px;text-align:center">🛒<br><br>El pedido está vacío.<br><small>Elige un producto de la izquierda.</small></div>';
    totalBox.textContent=money2(total);countBox.textContent=count+" u.";charge.textContent="Cobrar venta · "+money2(total);charge.disabled=count===0;
    $$(".pos-minus",cartBox).forEach(b=>b.onclick=()=>changeQty(b.dataset.id,-1));$$(".pos-plus",cartBox).forEach(b=>b.onclick=()=>changeQty(b.dataset.id,1));$$(".pos-remove",cartBox).forEach(b=>b.onclick=()=>{cart.delete(b.dataset.id);renderCart();renderProducts()});
  };
  const addProduct=p=>{if(!p||Number(p.stock||0)<=0)return;const item=cart.get(p.id);if(item){if(item.quantity>=Number(p.stock||0))return toast("No hay más stock de "+p.name,"err");item.quantity++}else cart.set(p.id,{product:p,quantity:1});renderCart();renderProducts()};
  const changeQty=(id,delta)=>{const item=cart.get(id);if(!item)return;const next=item.quantity+delta;if(next<=0)cart.delete(id);else if(next<=Number(item.product.stock||0))item.quantity=next;else return toast("Stock insuficiente.","err");renderCart();renderProducts()};
  search?.addEventListener("input",renderProducts);
  renderCats();renderProducts();renderCart();
  charge.onclick=async()=>{
    if(!cart.size)return;
    charge.disabled=true;
    try{
      const reference=String($("#posReference")?.value||"").trim();
      for(const item of cart.values()){
        const p=item.product,q=item.quantity,unitPrice=Number(p.price||0);
        const {error}=await S.rpc("marc_register_product_sale",{p_cash_register_id:open.id,p_product_id:p.id,p_quantity:q,p_amount:unitPrice*q,p_concept:"Venta · "+p.name+(p.model?" · "+p.model:""),p_reference:reference||p.sku||null,p_created_by_name:ctx.staff?.display_name||st.u.email||"Usuario"});
        if(error)throw error;
      }
      close();toast("Venta registrada · "+[...cart.values()].reduce((n,x)=>n+x.quantity,0)+" productos","ok");await cash();
    }catch(err){toast(err.message||"No se pudo registrar la venta.","err");charge.disabled=false}
  };
}async function cashMasterGate(){
  const email=String(st.u?.email||"").trim();
  if(!email)throw new Error("No se encontró el usuario maestro.");
  const close=modal(`<div class="modal-head"><div><div class="eyebrow2">SEGURIDAD MAESTRA</div><h2>🔐 Acceso de administrador</h2><p>Usa el usuario y la contraseña de tu cuenta M.A.R.C. para administrar Caja.</p></div><button class="close" id="x">×</button></div><form id="cashMasterForm"><label>Usuario maestro<input name="email" type="email" value="${esc(email)}" readonly></label><label>Clave maestra<div class="password-field"><input name="password" type="password" minlength="6" required autofocus autocomplete="current-password" placeholder="Tu contraseña de M.A.R.C."><button type="button" id="showMasterPass">◉</button></div></label><div id="cashMasterError" class="cash-login-error"></div><div class="modal-actions"><button type="button" class="secondary" id="setupMaster">Crear / cambiar clave maestra</button><button type="button" class="secondary" id="cancel">Cancelar</button><button class="primary">Entrar →</button></div></form>`);
  $("#x").onclick=close;$("#cancel").onclick=close;
  $("#showMasterPass").onclick=()=>{const p=$('#cashMasterForm input[name="password"]');if(p)p.type=p.type==="password"?"text":"password"};
  $("#setupMaster").onclick=async()=>{
    const setupClose=modal(`<div class="modal-head"><div><div class="eyebrow2">CLAVE MAESTRA</div><h2>🔑 Crear clave de Caja</h2><p>Esta será la contraseña de tu cuenta M.A.R.C. usada para autorizar la administración de Caja.</p></div><button class="close" id="x">×</button></div><form id="cashMasterSetup"><label>Nueva clave<input name="password" type="password" minlength="6" required autofocus placeholder="Mínimo 6 caracteres"></label><label>Confirmar clave<input name="confirm" type="password" minlength="6" required placeholder="Repite la clave"></label><div class="modal-actions"><button type="button" class="secondary" id="cancel">Cancelar</button><button class="primary">Guardar clave</button></div></form>`);
    $("#x").onclick=setupClose;$("#cancel").onclick=setupClose;
    $("#cashMasterSetup").onsubmit=async ev=>{
      ev.preventDefault();const d=new FormData(ev.currentTarget),password=String(d.get("password")||""),confirm=String(d.get("confirm")||"");
      if(password!==confirm)return toast("Las claves no coinciden.","err");
      const b=ev.currentTarget.querySelector("button.primary");b.disabled=true;
      try{
        const {error}=await S.auth.updateUser({password});
        if(error)throw error;
        setupClose();toast("Clave maestra creada correctamente","ok");
      }catch(err){toast(err?.message||"No se pudo crear la clave maestra.","err");b.disabled=false}
    };
  };
  return new Promise(resolve=>{
    $("#cashMasterForm").onsubmit=async e=>{
      e.preventDefault();
      const b=e.currentTarget.querySelector("button.primary"),password=String(new FormData(e.currentTarget).get("password")||"");
      b.disabled=true;
      try{
        const {error}=await S.auth.signInWithPassword({email,password});
        if(error)throw error;
        sessionStorage.setItem("marc_cash_master_verified_at",String(Date.now()));
        close();toast("Acceso maestro autorizado","ok");resolve(true);
      }catch(err){
        const el=$("#cashMasterError");if(el)el.textContent=err?.message||"Clave maestra incorrecta.";
        b.disabled=false;
      }
    };
  });
}

function cashMasterVerified(){
  const t=Number(sessionStorage.getItem("marc_cash_master_verified_at")||0);
  return t>0 && Date.now()-t<10*60*1000;
}
async function ensureCashMaster(){
  if(cashMasterVerified())return true;
  const ok=await cashMasterGate();
  return !!ok;
}
async function cashStaffAdminRequest(method,body){
  const session=(await S.auth.getSession()).data?.session;
  if(!session?.access_token)throw new Error("La sesión maestra expiró. Vuelve a autorizar Caja.");
  const options={
    method,
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token}
  };
  if(!["GET","HEAD"].includes(String(method).toUpperCase()))options.body=JSON.stringify(body||{});
  const r=await fetch("/api/cash-staff",options);
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||j.message||"No se pudo completar la operación.");
  return j;
}
async function cashStaffModal(){
  if(!(await ensureCashMaster()))return;
  let staff=[];
  try{
    const result=await cashStaffAdminRequest("GET");
    staff=Array.isArray(result?.staff)?result.staff:[];
  }catch(error){
    return toast(error?.message||"No se pudieron cargar los cajeros.","err");
  }
  const rows=(staff||[]).map(x=>`<div class="cash-staff-row">
    <div><b>${esc(x.display_name)}</b><small>${x.employee_code?`ID ${esc(x.employee_code)} · `:""}@${esc(x.username)} · ${x.active?"Activo":"Inactivo"}</small></div>
    <div class="cash-staff-tools"><span>${x.active?"CAJERO":"PAUSADO"}</span><button type="button" class="secondary cash-staff-action" data-action="password" data-id="${esc(x.id)}">Clave</button><button type="button" class="secondary cash-staff-action" data-action="toggle" data-id="${esc(x.id)}">${x.active?"Desactivar":"Activar"}</button></div>
  </div>`).join("")||'<div class="empty">Todavía no hay cajeros creados.</div>';
  const close=modal(`<div class="cash-staff-modal"><div class="modal-head"><div><div class="eyebrow2">ADMINISTRACIÓN MAESTRA</div><h2>👥 Cajeros</h2><p>Crea y controla los accesos de las personas que trabajan en Caja.</p></div><button class="close" id="x">×</button></div><div class="cash-staff-create-card"><div class="eyebrow2">NUEVO CAJERO</div><h3>Crear acceso de cajero</h3><p>Registra aquí el nombre, código, usuario y contraseña del cajero.</p></div><form id="staffForm"><div class="form-grid"><label>Nombre del cajero<input name="display_name" required placeholder="Ej. Juan Pérez"></label><label>ID / código<input name="employee_code" required autocomplete="off" placeholder="Ej. CAJ-001"></label><label>Usuario de cajero<input name="username" required autocomplete="off" autocapitalize="none" placeholder="Ej. juan"></label><label>Clave del cajero<input name="password" type="password" minlength="6" required placeholder="Mínimo 6 caracteres"></label></div><div class="modal-actions"><button type="button" class="secondary" id="cancel">Cerrar</button><button type="button" class="primary" id="createCashStaffBtn">＋ Crear cajero</button></div><div id="staffCreateError" class="form-error" role="alert" aria-live="polite"></div></form><div class="cash-staff-existing"><div class="eyebrow2">CAJEROS REGISTRADOS</div>${rows}</div></div>`);
  $("#x").onclick=close;$("#cancel").onclick=close;
  $$(".cash-staff-action",$("#modal")).forEach(btn=>btn.onclick=async()=>{
    const id=btn.dataset.id,action=btn.dataset.action,item=(staff||[]).find(x=>x.id===id);if(!item)return;
    try{
      btn.disabled=true;
      if(action==="toggle"){
        await cashStaffAdminRequest("PATCH",{id,active:!item.active});
        toast(item.active?"Cajero desactivado":"Cajero activado","ok");
      }else{
        await openCashPasswordModal(item);
      }
      close();await cashStaffModal();
    }catch(err){toast(err.message||"No se pudo actualizar el cajero.","err");btn.disabled=false}
  });
  const createStaff=async()=>{
    const form=$("#staffForm"),b=$("#createCashStaffBtn"),errorBox=$("#staffCreateError");
    if(!form||!b)return;
    const d=new FormData(form);
    const displayName=String(d.get("display_name")||"").trim();
    const employeeCode=String(d.get("employee_code")||"").trim();
    const username=String(d.get("username")||"").trim().toLowerCase();
    const password=String(d.get("password")||"");
    if(!displayName||!employeeCode||!username||password.length<6){
      if(errorBox)errorBox.textContent="Completa nombre, ID/código, usuario y una clave de mínimo 6 caracteres.";
      return;
    }
    if(errorBox)errorBox.textContent="Creando acceso…";
    b.disabled=true;
    try{
      await cashStaffAdminRequest("POST",{action:"create",display_name:displayName,employee_code:employeeCode,username,password});
      if(errorBox)errorBox.textContent="";
      close();toast("Cajero creado correctamente","ok");await cash();
    }catch(err){
      const message=err?.message||"No se pudo crear el cajero.";
      if(errorBox)errorBox.textContent=message;
      toast(message,"err");
      b.disabled=false;
    }
  };
  $("#createCashStaffBtn").onclick=e=>{e.preventDefault();e.stopPropagation();createStaff();};
  $("#staffForm").onsubmit=e=>{e.preventDefault();createStaff();};
}

async function openCashPasswordModal(item){
  const close=modal(`<div class="modal-head"><div><div class="eyebrow2">SEGURIDAD MAESTRA</div><h2>🔐 Cambiar clave</h2><p>Actualiza la clave del cajero <b>@${esc(item.username)}</b>.</p></div><button class="close" id="x">×</button></div><form id="cashPasswordForm"><label>Nueva clave<div class="password-field"><input name="password" type="password" minlength="6" required autofocus placeholder="Mínimo 6 caracteres"><button type="button" id="showCashPass">◉</button></div></label><label>Confirmar clave<input name="confirm" type="password" minlength="6" required placeholder="Repite la clave"></label><div class="modal-actions"><button type="button" class="secondary" id="cancel">Cancelar</button><button class="primary">Guardar clave</button></div></form>`);
  $("#x").onclick=close;$("#cancel").onclick=close;
  $("#showCashPass").onclick=()=>{const p=$("#cashPasswordForm input[name=password]");if(p)p.type=p.type==="password"?"text":"password"};
  return new Promise(resolve=>{
    $("#cashPasswordForm").onsubmit=async e=>{
      e.preventDefault();const d=new FormData(e.currentTarget),password=String(d.get("password")||""),confirm=String(d.get("confirm")||"");
      if(password!==confirm)return toast("Las claves no coinciden.","err");
      const b=e.currentTarget.querySelector("button.primary");b.disabled=true;
      try{await cashStaffAdminRequest("PATCH",{id:item.id,password});close();toast("Clave del cajero actualizada","ok");resolve(true)}
      catch(err){toast(err.message||"No se pudo cambiar la clave.","err");b.disabled=false}
    };
  });
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
    <div class="cash-mobile-center">
      <section class="cash-hero">
        <div class="cash-hero-copy">
          <div class="cash-hero-eyebrow">CAJA · ${isCashier?"TURNO":"ADMINISTRACIÓN"}</div>
          <h1>${isCashier?"Caja rápida.":"Centro de caja."}</h1>
          <p>${isCashier?"Usuario: <b>"+esc(cashCtx.staff?.display_name||"Cajero")+"</b> · "+(open?"turno iniciado "+new Date(open.opened_at).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"}):"esperando apertura"):"Controla ingresos, egresos y ventas con trazabilidad. Administra turnos, usuarios y genera reportes en segundos."}</p>
        </div>
        <div class="cash-hero-status"><i></i>${open?"Operativa":"Cerrada"}</div>
        <div class="cash-hero-visual" aria-hidden="true">
          <div class="cash-hero-ring"></div>
          <div class="cash-register-icon"><div class="cash-paper"><span></span><span></span><span></span></div><div class="cash-screen"></div><div class="cash-keys"><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
        </div>
      </section>
      <section class="cash-primary-actions">
        ${open?"<button id=\"cashSaleQuick\" class=\"cash-primary-action sale cash-action-main\"><span>🛒</span><b>Nueva<br>venta</b><small>Seleccionar productos y cobrar</small></button>":"<button id=\"openCashTop\" class=\"cash-primary-action income cash-action-main\"><span>＋</span><b>Abrir<br>caja</b><small>Empieza el turno con efectivo inicial</small></button>"}
        ${open?"<button id=\"cashExpense\" class=\"cash-primary-action expense\"><span>−</span><b>Registrar<br>gasto</b><small>Salida de dinero</small></button>":"<button id=\"cashStaffLoginOpen2\" class=\"cash-primary-action staff\"><span>↪</span><b>Entrar<br>como cajero</b><small>Usa el acceso asignado</small></button>"}
        ${open?"<button id=\"cashHistoryQuick\" class=\"cash-primary-action users\"><span>▤</span><b>Ver<br>movimientos</b><small>Revisa ventas y gastos</small></button>":""}
        ${isCashier?"<button id=\"cashStaffLogout\" class=\"cash-primary-action staff\"><span>↩</span><b>Salir<br>de caja</b><small>Volver al administrador</small></button>":""}
        ${!isCashier?"<button id=\"cashStaff2\" class=\"cash-primary-action users\"><span>⚙</span><b>Administrar<br>cajeros</b><small>Accesos y contraseñas</small></button>":""}
        ${!isCashier?"<button id=\"cashStaffCreate\" class=\"cash-primary-action income\"><span>＋</span><b>Crear<br>cajero</b><small>Nuevo usuario de caja</small></button>":""}
      </section>
      <section class="cash-howto">
        <div class="cash-howto-head"><div><div class="eyebrow2">GUÍA RÁPIDA</div><h3>¿Cómo uso la caja?</h3><p>La caja funciona como un punto de venta: primero abres el turno, luego agregas productos al carrito y finalmente cobras.</p></div><span class="cash-howto-badge">3 pasos</span></div>
        <div class="cash-howto-steps">
          <article><span>1</span><div><b>Abre la caja</b><small>Indica el efectivo inicial, por ejemplo S/ 100. Ese será el dinero con el que empiezas el turno.</small></div></article>
          <article><span>2</span><div><b>Haz una venta</b><small>Pulsa <strong>Nueva venta</strong>, toca los productos, cambia cantidades y revisa el carrito. Luego pulsa <strong>Cobrar venta</strong>.</small></div></article>
          <article><span>3</span><div><b>Cierra la caja</b><small>Al terminar, cuenta el efectivo que realmente tienes y pulsa <strong>Cerrar caja</strong>. M.A.R.C. compara lo contado con lo esperado.</small></div></article>
        </div>
        <details class="cash-howto-details"><summary>¿Y si tengo un gasto?</summary><p>Pulsa <strong>Registrar gasto</strong>, elige la categoría, escribe el concepto y el monto. El gasto se descuenta automáticamente del saldo esperado.</p></details>
        <details class="cash-howto-details"><summary>¿Y si trabaja un cajero?</summary><p>El administrador crea el cajero. El cajero entra con su usuario y contraseña y puede trabajar la caja abierta. La administración de usuarios permanece en manos del administrador.</p></details>
      </section>

      ${!isCashier?"<section id=\"cashStaffPanel\" class=\"card panel cash-login-panel hidden\" aria-hidden=\"true\"><div class=\"eyebrow2\">PERSONAL DE CAJA</div><h3>Entrar a caja</h3><p>Usa el usuario y la contraseña que te asignó el administrador.</p><form id=\"cashStaffForm\" autocomplete=\"on\"><label>Usuario<input id=\"cashStaffUsername\" name=\"username\" autocomplete=\"username\" autocapitalize=\"none\" required placeholder=\"Ej. juan\"></label><label>Contraseña<div class=\"password-field\"><input id=\"cashStaffPassword\" name=\"password\" type=\"password\" autocomplete=\"current-password\" required placeholder=\"Tu contraseña\"><button id=\"cashStaffPasswordToggle\" type=\"button\">◉</button></div></label><div id=\"cashStaffError\" class=\"cash-login-error\" role=\"alert\"></div><div style=\"display:flex;gap:8px;flex-wrap:wrap\"><button id=\"cashStaffSubmit\" class=\"primary\" type=\"submit\">Entrar a caja →</button><button id=\"cashStaffBack\" class=\"secondary\" type=\"button\">Cancelar</button></div></form></section>":""}

      <section class="cash-current-card">
        <div class="cash-current-info">
          <div class="cash-current-label">ESTADO ACTUAL <span class="cash-status-pill ${open?"on":"off"}"><i></i>${open?"ABIERTA":"CERRADA"}</span></div>
          <div class="cash-current-detail"><span>▣</span><div><small>Apertura</small><b>${open?new Date(open.opened_at).toLocaleString("es-PE"):"Sin apertura"}</b></div></div>
          <div class="cash-current-detail"><span>●</span><div><small>${isCashier?"Cajero actual":"Usuario actual"}</small><b>${esc(isCashier?cashCtx.staff?.display_name||"Cajero":"Administrador")}</b></div></div>
        </div>
        <div class="cash-current-balance"><small>SALDO ACTUAL</small><strong>${money(expected)}</strong>${open&&!isCashier?"<button id=\"closeCashTop\" class=\"primary cash-close-btn\">🔒 Cerrar caja</button>":open&&isCashier?"<button id=\"cashStaffLogout2\" class=\"secondary cash-close-btn\">↩ Salir de caja</button>":""}</div>
      </section>

      <section class="cash-day-summary">
        <div class="cash-section-title"><b>✣ &nbsp;Resumen del día</b><span>Hoy, ${now.toLocaleDateString("es-PE",{day:"2-digit",month:"short",year:"numeric"})}</span></div>
        <div class="cash-day-grid">
          <article class="cash-day income"><i>↗</i><span>Ingresos</span><strong>${money(income)}</strong><small>${movements.filter(x=>x.type==="INCOME").length} movimientos</small></article>
          <article class="cash-day expense"><i>↘</i><span>Egresos</span><strong>${money(expense)}</strong><small>${movements.filter(x=>x.type==="EXPENSE").length} movimientos</small></article>
          <article class="cash-day sales"><i>🛒</i><span>Ventas</span><strong>${money(movements.filter(x=>x.type==="INCOME"&&/venta/i.test(String(x.concept||""))).reduce((s,x)=>s+Number(x.amount||0),0))}</strong><small>${movements.filter(x=>x.type==="INCOME"&&/venta/i.test(String(x.concept||""))).length} ventas</small></article>
          <article class="cash-day moves"><i>▤</i><span>Movimientos</span><strong>${movements.length}</strong><small>total del día</small></article>
        </div>
      </section>

      <section class="cash-quick-section">
        <div class="cash-section-title"><b>ϟ &nbsp;Acciones rápidas</b><button id="cashHistoryQuick" type="button">Ver historial →</button></div>
        <div class="cash-quick-grid">
          <button id="cashPartialClose" type="button"><i>◔</i><span>Cierre parcial</span></button>
          <button id="downloadCashExcelQuick" type="button"><i>▣</i><span>Reporte Excel</span></button>
          <button id="cashAuditQuick" type="button"><i>⌕</i><span>Arqueo de caja</span></button>
          <button id="cashStaffQuick" type="button"><i>♟</i><span>Usuarios de caja</span></button>
        </div>
      </section>

      <section class="card panel cash-report-panel cash-report-mobile">
        <div class="panel-title-row"><div><div class="eyebrow2">INFORME AUTOMÁTICO</div><h3>Últimos ${reportMonthsCount} meses</h3><small class="finance-subtitle">Desde ${reportStart.toLocaleDateString("es-PE")} hasta ${new Date(reportEnd.getTime()-86400000).toLocaleDateString("es-PE")}</small></div><label class="cash-period-select">Informe <select id="cashReportMonths" class="secondary">${[2,3,4,5,6].map(n=>"<option value=\""+n+"\" "+(n===reportMonthsCount?"selected":"")+">"+n+" meses</option>").join("")}</select></label></div>
        <button id="downloadCashExcel" class="secondary cash-excel-top">▣ Excel · ${reportMonthsCount} meses</button>
        <div class="cash-report-summary"><div><span>CIERRES</span><strong>${closedTwoMonths.length}</strong></div><div><span>INGRESOS</span><strong class="cash-in">${money(monthly.reduce((s,x)=>s+x.income,0))}</strong></div><div><span>EGRESOS</span><strong class="cash-out">${money(monthly.reduce((s,x)=>s+x.expense,0))}</strong></div><div><span>DIFERENCIA</span><strong>${money(monthly.reduce((s,x)=>s+x.difference,0))}</strong></div></div>
        <div class="cash-chart"><div class="cash-chart-title"><div><b>Ingresos vs. egresos</b><small>Comparación mensual de movimientos registrados</small></div></div>${monthSummary}</div>
        <div class="cash-difference-chart"><div class="cash-chart-title"><div><b>Diferencia de cada cierre</b><small>Contado frente al efectivo esperado</small></div></div>${closedSummaryRows||"<div class=\"empty\">No hay cierres en este período.</div>"}</div>
      </section>

      ${isCashier&&open&&movements[0]?"<div class=\"cash-last-movement\"><div><b>Último movimiento</b><small>"+esc(movements[0].created_by_name||"Usuario")+" · "+(movements[0].type==="INCOME"?"Ingreso":"Egreso")+" · "+new Date(movements[0].created_at).toLocaleString("es-PE",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})+"</small></div><strong class=\""+(movements[0].type==="INCOME"?"cash-in":"cash-out")+"\">"+(movements[0].type==="INCOME"?"+":"−")+" "+money(movements[0].amount)+"</strong></div>":""}

      ${open?"<section class=\"card panel cash-movements\" id=\"cashMovementHistory\"><div class=\"panel-title-row\"><div><div class=\"eyebrow2\">MOVIMIENTOS DE HOY</div><h3>Últimos movimientos</h3></div></div><div class=\"scroll\"><table class=\"data\"><thead><tr><th>Hora</th><th>Usuario</th><th>Tipo</th><th>Concepto</th><th>Referencia</th><th>Monto</th></tr></thead><tbody>"+(movements.map(x=>"<tr><td>"+new Date(x.created_at).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})+"</td><td>"+esc(x.created_by_name||"Administrador")+"</td><td><span class=\"cash-type "+(x.type==="INCOME"?"in":"out")+"\">"+(x.type==="INCOME"?"Ingreso":"Egreso")+"</span></td><td><b>"+esc(x.concept)+"</b></td><td>"+esc(x.reference||"—")+"</td><td class=\""+(x.type==="INCOME"?"cash-in":"cash-out")+"\"><b>"+(x.type==="INCOME"?"+":"−")+" "+money(x.amount)+"</b></td></tr>").join("")||"<tr><td colspan=\"6\" class=\"empty\">Aún no hay movimientos.</td></tr>")+"</tbody></table></div></section>":"<section class=\"card panel cash-closed-empty\"><div class=\"empty-state\"><span>▣</span><b>"+(isCashier?"La caja está cerrada":"No hay una caja abierta")+"</b><small>"+(isCashier?"El administrador debe abrir la caja antes de registrar movimientos.":"Abre una caja para comenzar a registrar movimientos.")+"</small></div></section>"}
    </div>
  `;


  const report={
    start:reportStart,end:new Date(reportEnd.getTime()-86400000),months:monthly,registers:closedTwoMonths,movements:reportMovements
  };
  const exportExcel=()=>downloadCashExcel(report);
  if($("#downloadCashExcel"))$("#downloadCashExcel").onclick=exportExcel;
  $("#cashReportMonths").onchange=e=>{const n=Math.min(6,Math.max(2,Number(e.target.value)||2));const u=new URL(location.href);u.searchParams.set("cashMonths",String(n));history.replaceState({},document.title,u.toString());cash()};

  if($("#cashStaff"))$("#cashStaff").onclick=()=>cashStaffModal();
  if($("#cashStaff2"))$("#cashStaff2").onclick=()=>cashStaffModal();
  if($("#cashStaffCreate"))$("#cashStaffCreate").onclick=()=>cashStaffModal();
  if($("#cashStaffQuick"))$("#cashStaffQuick").onclick=()=>cashStaffModal();
  if($("#cashStaffLoginOpen2"))$("#cashStaffLoginOpen2").onclick=()=>showCashStaffLogin(true);
  if($("#cashSaleQuick"))$("#cashSaleQuick").onclick=()=>cashMovementModal(open,"INCOME");
  if($("#cashHistoryQuick"))$("#cashHistoryQuick").onclick=()=>document.querySelector("#cashMovementHistory")?.scrollIntoView({behavior:"smooth",block:"start"});
  if($("#cashAuditQuick"))$("#cashAuditQuick").onclick=()=>document.querySelector("#cashMovementHistory")?.scrollIntoView({behavior:"smooth",block:"start"});
  if($("#downloadCashExcelQuick"))$("#downloadCashExcelQuick").onclick=()=>downloadCashExcel(report);
  if($("#cashPartialClose"))$("#cashPartialClose").onclick=()=>open?closeCashModal(open,expected):toast("Abre la caja antes de realizar un cierre.","err");
  if($("#cashStaffLoginOpen"))$("#cashStaffLoginOpen").onclick=()=>showCashStaffLogin(true);
  if($("#cashStaffBack"))$("#cashStaffBack").onclick=()=>showCashStaffLogin(false);
  if($("#cashStaffForm"))$("#cashStaffForm").onsubmit=signInCashStaff;
  if($("#cashStaffPasswordToggle"))$("#cashStaffPasswordToggle").onclick=()=>{const p=$("#cashStaffPassword");if(p){p.type=p.type==="password"?"text":"password"}};
  if($("#cashStaffLogout2"))$("#cashStaffLogout2").onclick=async()=>{$("#cashStaffLogout")?.click()};
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
  if(open&&!isCashier)$("#closeCashTop").onclick=async()=>{if(await ensureCashMaster())closeCashModal(open,expected)};
  else if(!open&&$("#openCashTop"))$("#openCashTop").onclick=()=>openCashModal();
  if(open){
    if($("#cashExpense"))$("#cashExpense").onclick=()=>cashMovementModal(open,"EXPENSE");
  }
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

async 
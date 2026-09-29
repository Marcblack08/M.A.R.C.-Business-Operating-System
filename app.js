(()=>{const C=window.MARC_CONFIG,S=window.supabase.createClient(C.supabaseUrl,C.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"implicit"}});const st={u:null,session:null,view:"home",cid:null,authEpoch:0};let authListenerSession=null,authTimer=null,authEnteredSessionId=null,authMode="login",recoveryMode=new URLSearchParams(location.search).get("recovery")==="1"||/type=recovery/i.test(location.hash);S.auth.onAuthStateChange((ev,s)=>{
  authListenerSession=s||null;
  console.info("[M.A.R.C. auth]",ev,!!s,s?.user?.id||"");
  try{
    sessionStorage.setItem("marc_auth_last_event",JSON.stringify({
      event:String(ev||""),
      hasSession:!!s,
      userId:s?.user?.id||null,
      at:new Date().toISOString()
    }));
  }catch{}
  if(s?.user){
    try{sessionStorage.removeItem("marc_google_oauth_pending")}catch{}
    clearTimeout(authTimer);
    if(recoveryMode)authTimer=setTimeout(()=>{mode("update");msg("Crea una nueva contraseña para tu cuenta.","ok")},0);
    else authTimer=setTimeout(()=>handleAuthSession(s),0);
  }else if(ev==="SIGNED_OUT"){
    // Mientras un OAuth está pendiente, un SIGNED_OUT temprano no representa
    // necesariamente un cierre real. El callback todavía puede estar creando
    // y persistiendo la sesión; nunca expulsamos al usuario al login en esa fase.
    if(sessionStorage.getItem("marc_google_oauth_pending")==="1"){
      console.warn("[M.A.R.C. auth] SIGNED_OUT ignorado durante retorno OAuth.");
      return;
    }
    clearTimeout(authTimer);
    authTimer=setTimeout(async()=>{
      try{
        const check=await S.auth.getSession();
        if(check?.data?.session?.user){
          console.info("[M.A.R.C. auth] SIGNED_OUT transitorio; sesión recuperada.");
          await handleAuthSession(check.data.session);
          return;
        }
      }catch(err){
        console.error("[M.A.R.C. auth] No se pudo verificar SIGNED_OUT:",err);
      }
      resetUiToLogin();
    },700);
  }
});const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)],esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])),money=v=>new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(Number(v||0)),toast=(t,c="")=>{const e=document.createElement("div");e.className="toast "+c;e.textContent=t;$("#toast").appendChild(e);setTimeout(()=>e.remove(),2600)},initials=n=>String(n||"M").split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join("");function msg(t,c=""){const e=$("#authMsg");if(!e)return;e.textContent=t||"";e.className="msg "+c;e.style.display=t?"block":"none";e.style.visibility=t?"visible":"hidden";e.style.opacity=t?"1":"0";e.setAttribute("role",t?"alert":"status");if(t)e.scrollIntoView?.({block:"nearest",behavior:"smooth"});}
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
function mode(m){
  authMode=m;
  const title=m==="login"?"Inicia sesión en M.A.R.C.":m==="signup"?"Crea tu cuenta en M.A.R.C.":m==="update"?"Crea una nueva contraseña":"Recupera tu contraseña";
  const sub=m==="login"?"Accede con Google o con tu correo y contraseña.":m==="signup"?"Crea tu cuenta para comenzar.":m==="update"?"La recuperación fue verificada. Define una nueva contraseña segura.":"Te enviaremos un enlace para crear una nueva contraseña.";
  if($("#authTitle"))$("#authTitle").textContent=title;
  if($("#authSub"))$("#authSub").textContent=sub;
  const passwordLabel=$("#password")?.closest("label");
  passwordLabel?.classList.toggle("hidden",m==="reset");
  $("#password").required=m!=="reset";
  const confirmWrap=$("#confirmWrap");
  const showConfirm=m==="signup"||m==="update";
  confirmWrap?.classList.toggle("hidden",!showConfirm);
  if(confirmWrap)confirmWrap.style.display=showConfirm?"":"none";
  if($("#confirm"))$("#confirm").required=showConfirm;
  $("#authSubmit").textContent=m==="signup"?"Crear cuenta":m==="update"?"Guardar nueva contraseña":m==="reset"?"Enviar enlace de recuperación":"Iniciar sesión";
  msg("");
}
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
    if(ownerSession)cashOwnerSession=ownerSession;
    const {error}=await S.auth.signInWithPassword({email:username+"@cash.marc.pe",password});
    if(error)throw error;
  }catch(err){
    cashStaffError(err?.message||"Usuario o contraseña incorrectos.");
    if(b)b.disabled=false;
  }
}

async function signInGoogle(e){e?.preventDefault?.();e?.stopPropagation?.();const b=$("#googleLogin");const diagnostic=(text,type="")=>{msg(text,type);console.info("[M.A.R.C. Google diagnóstico]",text)};if(!b){console.error("[M.A.R.C. Google login] No existe #googleLogin");return false}if(b.dataset.busy==="1")return false;b.dataset.busy="1";b.disabled=true;b.setAttribute("aria-busy","true");const label=b.querySelector("span:last-child");if(label)label.textContent="Conectando…";diagnostic("1/4 · Iniciando conexión con Google…");const reset=(keepMessage=false)=>{b.disabled=false;b.dataset.busy="0";b.removeAttribute("aria-busy");if(label)label.textContent="Continuar con Google";if(!keepMessage)msg("")};try{if(!window.supabase||!S?.auth)throw Object.assign(new Error("El cliente de autenticación de Supabase no está disponible."),{code:"MARC_AUTH_CLIENT_MISSING"});sessionStorage.setItem("marc_google_oauth_pending","1");const canonicalAppUrl=String(C.appUrl||"").trim();const redirectUrl=new URL(canonicalAppUrl||location.origin+"/");redirectUrl.search="";redirectUrl.hash="";const redirectTo=redirectUrl.toString();diagnostic("2/4 · Supabase está preparando el acceso…");const {data,error}=await S.auth.signInWithOAuth({provider:"google",options:{redirectTo,queryParams:{prompt:"select_account"}}});if(error){const detail=[error.code,error.name,error.status].filter(Boolean).join(" · ");throw Object.assign(new Error(detail?String(error.message||"Error de autenticación")+" ["+detail+"]":String(error.message||"Error de autenticación")),{code:error.code,name:error.name,status:error.status})}if(!data?.url)throw Object.assign(new Error("Supabase respondió sin una URL de autorización de Google."),{code:"MARC_OAUTH_URL_MISSING"});diagnostic("3/4 · Supabase generó correctamente la autorización. Abriendo Google…");console.info("[M.A.R.C. OAuth] URL OAuth generada correctamente; dominio:",(()=>{try{return new URL(data.url).hostname}catch{return "desconocido"}})());diagnostic("4/4 · Google autorizado. Esperando el retorno seguro a M.A.R.C.…");return true}catch(err){sessionStorage.removeItem("marc_google_oauth_pending");console.error("[M.A.R.C. Google login]",err);const code=err?.code?" Código: "+err.code+".":"";const status=err?.status?" Estado HTTP: "+err.status+".":"";diagnostic("Falló el acceso con Google: "+String(err?.message||"Error desconocido.")+code+status,"error");reset(true);return false}}function bindAuthControls(){
  const planLauncher=$(".trial");
  if(planLauncher){
    planLauncher.setAttribute("role","button");
    planLauncher.setAttribute("tabindex","0");
    planLauncher.title="Ver mi plan y capacidades";
    planLauncher.addEventListener("click",()=>openPlanCenter(),{once:false});
    planLauncher.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openPlanCenter()}});
  }
  const google=$("#googleLogin");
  if(google){
    google.type="button";
    google.addEventListener("click",signInGoogle);
  }
  const form=$("#authForm");
  if(form)form.addEventListener("submit",submit);
  const toggle=$("#passwordToggle");
  if(toggle)toggle.addEventListener("click",()=>{
    const p=$("#password"); if(!p)return;
    p.type=p.type==="password"?"text":"password";
    toggle.setAttribute("aria-label",p.type==="password"?"Mostrar contraseña":"Ocultar contraseña");
  });
  const forgot=$("#forgotPassword");
  if(forgot)forgot.addEventListener("click",()=>mode("reset"));
  const signup=$("#signupMode");
  if(signup)signup.addEventListener("click",()=>{
    mode(authMode==="signup"?"login":"signup");
    signup.textContent=authMode==="signup"?"Volver a iniciar sesión":"Crear cuenta";
    $("#authForm")?.reset();
  });
}
// Exponer el núcleo antes de registrar controles DOM. Si un control visual
// falla, el diagnóstico de arranque sigue pudiendo identificar el punto exacto.
window.MARC=window.MARC||{};
Object.assign(window.MARC,{view,openChat,closeChat,toast,supabase:S,signInCashStaff});
try{
  bindAuthControls();
}catch(err){
  console.error("[M.A.R.C. boot] Error registrando controles de autenticación:",err);
  msg("Error de inicialización de controles: "+String(err?.message||err),"error");
}
async function handleAuthSession(s){
  if(!s?.user)return;
  const id=s.user.id;
  // Si la autenticación terminó correctamente, cualquier diagnóstico rojo
  // anterior del callback debe desaparecer antes de mostrar la aplicación.
  try{msg("")}catch{}
  if(authEnteredSessionId===id && st.u?.id===id && !$("#app").classList.contains("hidden"))return;
  authEnteredSessionId=id;
  try{await enter(s)}catch(e){authEnteredSessionId=null;throw e}
}function resetUiToLogin(message="",type=""){const pending=sessionStorage.getItem("marc_google_oauth_pending")==="1";let diagnostic="";try{const last=JSON.parse(sessionStorage.getItem("marc_auth_last_event")||"null");if(last?.event)diagnostic=" Evento recibido: "+last.event+"."; }catch{}if(!message&&pending){message="Google completó la autenticación, pero M.A.R.C. recibió la sesión como cerrada antes de entrar al sistema."+diagnostic+" El problema está en la recuperación de sesión del navegador, no en la cuenta de Google.";type="error";}st.authEpoch++;st.u=null;st.session=null;st.cid=null;try{applyCashierMode(false)}catch{}$("#app").classList.add("hidden");$("#auth").classList.remove("hidden");mode("login");if(message)msg(message,type)}
async function ensure(){const u=st.u;if(!u)return;await S.from("marc_accounts").upsert({id:u.id,display_name:u.email?.split("@")[0]||"Usuario"},{onConflict:"id"});const {data:t}=await S.from("marc_trials").select("id").eq("user_id",u.id).maybeSingle();if(!t)await S.from("marc_trials").insert({user_id:u.id});const {data:c}=await S.from("marc_conversations").select("id").eq("user_id",u.id).eq("channel","WEB").order("updated_at",{ascending:false}).limit(1).maybeSingle();st.cid=c?.id||(await S.from("marc_conversations").insert({user_id:u.id,channel:"WEB",title:"Conversación principal"}).select("id").single()).data?.id}

const MARC_PLANS={
  free:{code:"free",label:"Gratis",short:"Entrada",quotes:5,inventory:50,reports:5,ai:"Básica",color:"blue"},
  coder:{code:"coder",label:"Coder / Pro",short:"Profesional",quotes:null,inventory:null,reports:null,ai:"Avanzada",color:"violet"},
  premium:{code:"premium",label:"Premium / Enterprise",short:"Empresa",quotes:null,inventory:null,reports:null,ai:"Predictiva",color:"cyan"},
  master:{code:"master",label:"MASTER",short:"SaaS",quotes:null,inventory:null,reports:null,ai:"Ilimitada",color:"amber"}
};
st.planState={code:"free",status:"trial",trialEndsAt:null,source:"fallback",updatedAt:0};
st.planUsage={quotes:0,inventory:0,clients:0,reports:0,updatedAt:0};

function normalizePlan(v){
  const p=String(v||"").trim().toLowerCase();
  if(p==="pro")return "coder";
  if(p==="enterprise")return "premium";
  return Object.prototype.hasOwnProperty.call(MARC_PLANS,p)?p:"free";
}
function isMasterPlan(){return isMasterAccount()||st.planState?.code==="master"}
async function getPlanState(force=false){
  const fresh=st.planState?.updatedAt&&Date.now()-st.planState.updatedAt<30000;
  if(!force&&fresh)return st.planState;
  if(!st.u)return st.planState;
  if(isMasterAccount()){
    st.planState={code:"master",status:"active",trialEndsAt:null,source:"master",updatedAt:Date.now()};
    return st.planState;
  }
  try{
    // El acceso MASTER debe depender también del rol real en Supabase,
    // no solamente de un correo fijo. Esto permite que la cuenta maestra
    // conserve acceso a todas las funciones de pago aunque cambie el correo.
    const [roleRes,accountRes,subRes,rpcRes]=await Promise.all([
      S.from("marc_user_roles").select("role,active").eq("user_id",st.u.id).eq("active",true),
      S.from("marc_accounts").select("plan,access_status,trial_ends_at").eq("id",st.u.id).maybeSingle(),
      S.from("marc_subscriptions").select("plan,status,current_period_end,updated_at").eq("user_id",st.u.id).order("updated_at",{ascending:false}).limit(1).maybeSingle(),
      S.rpc("marc_effective_plan",{p_user:st.u.id})
    ]);
    const isMasterRole=(roleRes.data||[]).some(r=>String(r?.role||"").trim().toUpperCase()==="MASTER");
    if(isMasterRole){
      st.planState={code:"master",status:"active",trialEndsAt:null,source:"master-role",updatedAt:Date.now()};
      return st.planState;
    }
    const account=accountRes.data||{};
    const sub=subRes.data||{};
    const rpcPlan=normalizePlan(rpcRes.data);
    const subStatus=String(sub.status||"").toLowerCase();
    let code=rpcPlan;
    if(subStatus==="active"||subStatus==="trial")code=normalizePlan(sub.plan);
    else if(account.plan)code=normalizePlan(account.plan);
    st.planState={
      code,
      status:String(sub.status||account.access_status||"trial").toLowerCase(),
      trialEndsAt:account.trial_ends_at||null,
      source:subStatus==="active"||subStatus==="trial"?"subscription":"account",
      updatedAt:Date.now()
    };
  }catch(e){
    console.warn("[M.A.R.C. plan] No se pudo consultar el plan; usando Gratis.",e);
    st.planState={...st.planState,code:normalizePlan(st.planState?.code),source:"fallback",updatedAt:Date.now()};
  }
  return st.planState;
}
async function getPlanUsage(force=false){
  const fresh=st.planUsage?.updatedAt&&Date.now()-st.planUsage.updatedAt<15000;
  if(!force&&fresh)return st.planUsage;
  if(!st.u)return st.planUsage;
  try{
    const [q,i,c,r]=await Promise.all([
      S.from("marc_quotes").select("id",{count:"exact",head:true}).eq("user_id",st.u.id).is("deleted_at",null).gte("created_at",new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString()),
      S.from("marc_inventory").select("id",{count:"exact",head:true}).eq("user_id",st.u.id).eq("active",true),
      S.from("marc_clients").select("id",{count:"exact",head:true}).eq("user_id",st.u.id),
      S.from("technical_reports").select("id",{count:"exact",head:true}).eq("user_id",st.u.id).gte("created_at",new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString())
    ]);
    st.planUsage={quotes:q.count||0,inventory:i.count||0,clients:c.count||0,reports:r.count||0,updatedAt:Date.now()};
  }catch(e){console.warn("[M.A.R.C. plan] No se pudo consultar uso.",e)}
  return st.planUsage;
}
function planLabel(code){return MARC_PLANS[normalizePlan(code)]?.label||"Gratis"}
function openUpgradeModal(feature=""){
  const current=normalizePlan(st.planState?.code);
  const close=modal(
    '<div class="marc-plan-modal">'+
      '<div class="modal-head"><div><div class="eyebrow2">M.A.R.C. · PLANES</div><h2>Desbloquea más capacidad</h2><p>'+(feature?esc(feature):"Tu plan actual alcanzó una capacidad disponible en el nivel Gratis.")+'</p></div><button class="close" id="planClose" type="button">×</button></div>'+
      '<div class="marc-plan-grid">'+
        '<article class="marc-plan-card free '+(current==="free"?"current":"")+'"><span>GRATIS</span><b>Entrada</b><small>5 cotizaciones/mes · 50 productos · informes básicos · IA básica.</small><button class="secondary" data-plan="free">'+(current==="free"?"Plan actual":"Gratis")+'</button></article>'+
        '<article class="marc-plan-card coder '+(current==="coder"?"current":"")+'"><span>CODER / PRO</span><b>Profesional</b><small>Cotizaciones e informes ilimitados · marca propia · firma digital · fotos ilimitadas · IA avanzada.</small><button class="primary" data-plan="coder">'+(current==="coder"?"Plan actual":"Quiero Coder")+'</button></article>'+
        '<article class="marc-plan-card premium '+(current==="premium"?"current":"")+'"><span>PREMIUM / ENTERPRISE</span><b>Empresa</b><small>Multiusuario · cuadrillas · portal cliente · automatización · API · auditoría y almacenamiento empresarial.</small><button class="primary" data-plan="premium">'+(current==="premium"?"Plan actual":"Quiero Premium")+'</button></article>'+
      '</div>'+
      '<div class="marc-plan-features"><b>Incluido por nivel</b><span>Firma digital: Coder y Premium</span><span>Fotos ilimitadas en OT: Coder y Premium</span><span>Portal, multiusuario y API: Premium</span></div>'+
      '<div class="marc-plan-note"><b>Google Play</b><br>Las suscripciones de M.A.R.C. se prepararán para Google Play. La activación final se hará únicamente después de que Google confirme la compra en el backend.</div>'+
    '</div>'
  );
  $("#planClose").onclick=close;
  $$(".marc-plan-card button").forEach(b=>b.onclick=async()=>{
    const target=b.dataset.plan;
    if(target===current||target==="free"){close();return}
    close();
    await requestPlanUpgrade(target,"Solicitud desde el centro de planes.");
  });
  return close;
}

function openPlanCenter(){
  const current=normalizePlan(st.planState?.code);
  const close=modal(
    '<div class="marc-plan-center">'+
      '<div class="modal-head"><div><div class="eyebrow2">TU CUENTA M.A.R.C.</div><h2>Mi plan y capacidades</h2><p>Consulta qué tienes disponible ahora y qué se desbloquea al subir de nivel.</p></div><button class="close" id="planCenterClose" type="button">×</button></div>'+
      '<div class="marc-plan-current"><div><span>PLAN ACTUAL</span><b>'+esc(planLabel(current))+'</b><small>'+(current==="free"?"5 cotizaciones/mes · 50 productos":current==="coder"?"Profesional · sin límites operativos":"Empresa · capacidades avanzadas")+'</small></div><button class="primary" id="planCenterUpgrade">Ver opciones</button></div>'+
      '<div class="marc-plan-grid">'+
        '<article class="marc-plan-card free '+(current==="free"?"current":"")+'"><span>GRATIS</span><b>Para comenzar</b><small>Clientes · cotizaciones limitadas · inventario limitado · IA básica.</small></article>'+
        '<article class="marc-plan-card coder '+(current==="coder"?"current":"")+'"><span>CODER / PRO</span><b>Para trabajar profesionalmente</b><small>Marca propia · firma · fotos ilimitadas · historial técnico · IA avanzada.</small></article>'+
        '<article class="marc-plan-card premium '+(current==="premium"?"current":"")+'"><span>PREMIUM</span><b>Para empresas</b><small>Roles · cuadrillas · portal cliente · automatizaciones · API · auditoría.</small></article>'+
      '</div>'+
      '<div class="marc-plan-usage"><div><span>COTIZACIONES ESTE MES</span><b>'+(st.planUsage?.quotes||0)+(MARC_PLANS[current]?.quotes===null?"":" / "+MARC_PLANS[current].quotes)+'</b></div><div><span>PRODUCTOS ACTIVOS</span><b>'+(st.planUsage?.inventory||0)+(MARC_PLANS[current]?.inventory===null?"":" / "+MARC_PLANS[current].inventory)+'</b></div><div><span>INFORMES ESTE MES</span><b>'+(st.planUsage?.reports||0)+(MARC_PLANS[current]?.reports===null?"":" / "+MARC_PLANS[current].reports)+'</b></div></div>'+
    '</div>'
  );
  $("#planCenterClose").onclick=close;
  $("#planCenterUpgrade").onclick=()=>{close();openUpgradeModal()};
  return close;
}
async function verifyGooglePlayPurchase(purchaseToken){
  const token=String(purchaseToken||"").trim();
  if(!token||!st.u)return false;
  try{
    const {data:sessionData}=await S.auth.getSession();
    const accessToken=sessionData?.session?.access_token;
    if(!accessToken)throw new Error("Sesión no disponible.");
    const r=await fetch((window.MARC_CONFIG?.apiBase||"")+"/api/billing/google/verify",{method:"POST",headers:{Authorization:"Bearer "+accessToken,"content-type":"application/json"},body:JSON.stringify({purchaseToken:token})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data?.message||data?.error||"No se pudo verificar la suscripción.");
    await getPlanState(true);
    await refreshPlanUI(true);
    toast("Suscripción Google Play verificada · "+planLabel(data.plan),"ok");
    return data;
  }catch(e){
    toast(String(e?.message||"No se pudo verificar Google Play."),"err");
    return false;
  }
window.MARC=window.MARC||{};window.MARC.verifyGooglePlayPurchase=verifyGooglePlayPurchase;
}
async function requestPlanUpgrade(plan,message=""){
  const target=normalizePlan(plan);
  if(!["coder","premium"].includes(target))return false;
  try{
    const {data,error}=await S.rpc("marc_request_plan_upgrade",{p_plan:target,p_message:message||null});
    if(error)throw error;
    toast("Solicitud enviada a M.A.R.C. MASTER · "+planLabel(target),"ok");
    return data||true;
  }catch(e){
    const raw=String(e?.message||"");
    if(raw.includes("MARC_MASTER_NO_UPGRADE"))toast("La cuenta MASTER no necesita solicitar una mejora.","err");
    else toast(raw||"No se pudo enviar la solicitud.","err");
    return false;
  }
}
async function requirePlan(feature,kind){
  const state=await getPlanState();
  if(state.code!=="free")return true;
  const usage=await getPlanUsage(true);
  if(kind==="quotes"&&usage.quotes>=MARC_PLANS.free.quotes){
    openUpgradeModal("Llegaste al límite de 5 cotizaciones este mes.");
    return false;
  }
  if(kind==="inventory"&&usage.inventory>=MARC_PLANS.free.inventory){
    openUpgradeModal("Llegaste al límite de 50 productos activos.");
    return false;
  }
  if(kind==="reports"&&usage.reports>=MARC_PLANS.free.reports){
    openUpgradeModal("Llegaste al límite de 5 informes técnicos este mes.");
    return false;
  }
  return true;
}
function refreshPlanSidebar(){
  const p=MARC_PLANS[normalizePlan(st.planState?.code)]||MARC_PLANS.free;
  const box=$(".trial");
  if(!box)return;
  const title=box.querySelector("b"),days=box.querySelector("span"),usage=box.querySelector("small"),bar=box.querySelector("em");
  if(title)title.textContent=p.label;
  if(p.code==="master"){
    if(days)days.textContent="SIN LÍMITES";
    if(bar)bar.style.width="100%";
    if(usage)usage.textContent="MASTER · Acceso total al SaaS";
    return;
  }
  const end=st.planState?.trialEndsAt?new Date(st.planState.trialEndsAt).getTime():0;
  const left=end?Math.max(0,end-Date.now()):0;
  if(st.planState?.status==="trial"&&left>0){
    if(days)days.textContent=Math.ceil(left/86400000)+" días";
    if(bar)bar.style.width=Math.max(3,Math.min(100,100-(left/(7*86400000)*100)))+"%";
  }else if(days)days.textContent=p.short;
  const limits=[];
  if(p.quotes!==null)limits.push((st.planUsage?.quotes||0)+"/"+p.quotes+" cotizaciones");
  else limits.push("cotizaciones ilimitadas");
  if(p.inventory!==null)limits.push((st.planUsage?.inventory||0)+"/"+p.inventory+" productos");
  else limits.push("inventario ilimitado");
  if(usage)usage.textContent=limits.join(" · ");
}
async function refreshPlanUI(force=false){
  await getPlanState(force);
  await getPlanUsage(force);
  refreshPlanSidebar();
  const badge=$("#ecosystemBadge");
  if(badge){
    const p=MARC_PLANS[normalizePlan(st.planState?.code)]||MARC_PLANS.free;
    badge.dataset.plan=p.code;
    badge.title=(badge.title?badge.title+" · ":"")+p.label;
  }
  const masterBtn=$("#saasAdminNav");
  if(masterBtn)masterBtn.hidden=!isMasterPlan();
}

const ECOSYSTEM_KEY="marc_ecosystem";
const ECOSYSTEMS={
  technician:{label:"Ecosistema Técnico",icon:"🛠️",desc:"Servicios, órdenes, agenda, materiales y rentabilidad."},
  business:{label:"Tienda / Negocio",icon:"🏪",desc:"Ventas, productos, compras, proveedores y caja."},
  mixed:{label:"Ecosistema Mixto",icon:"🔄",desc:"Herramientas técnicas y comerciales juntas."}
};
function normalizeEcosystem(v){return Object.prototype.hasOwnProperty.call(ECOSYSTEMS,v)?v:null}
function currentEcosystem(){
  return normalizeEcosystem(st.ecosystem)||normalizeEcosystem(safeStorageGet(ECOSYSTEM_KEY))||null;
}
function ecosystemAllows(viewName){
  const map={
    suppliers:["business","mixed"],
    service_orders:["technician","mixed"],
    agenda:["technician","mixed"],
    sales:["business","mixed"],
    purchases:["business","mixed"],
    receivables:["business","mixed"],
    assets:["technician","mixed"],
    maintenance:["technician","mixed"],
    contracts:["technician","mixed"],
    finances:["technician","mixed"],
    reports:["technician","business","mixed"],
    technical_reports:["technician","mixed"]
  };
  return !map[viewName]||map[viewName].includes(currentEcosystem());
}
function safeStorageGet(key){
  try{return localStorage.getItem(key)}catch(e){console.warn("[M.A.R.C. storage] lectura local bloqueada",e);return null}
}
function safeStorageSet(key,value){
  try{localStorage.setItem(key,value);return true}catch(e){console.warn("[M.A.R.C. storage] escritura local bloqueada",e);return false}
}
function applyEcosystemUI(key){
  key=normalizeEcosystem(key)||"technician";
  st.ecosystem=key;
  document.documentElement.dataset.ecosystem=key;
  safeStorageSet(ECOSYSTEM_KEY,key);
  const meta=ECOSYSTEMS[key];
  const navLabels={
    technician:{home:"Inicio",clients:"Clientes",inventory:"Materiales",quotes:"Cotizaciones técnicas",reports:"Reportes técnicos"},
    business:{home:"Inicio comercial",clients:"Clientes",inventory:"Inventario",quotes:"Cotizaciones",reports:"Reportes comerciales"},
    mixed:{home:"Centro Business",clients:"Clientes",inventory:"Inventario",quotes:"Cotizaciones",reports:"Centro ejecutivo"}
  }[key]||{};
  // Esta función es infraestructura crítica de navegación: ningún error visual
  // puede impedir el acceso al resto de M.A.R.C.
  try{
    document.querySelectorAll("#sidebar nav button[data-ecosystems]").forEach(b=>{
      const allowed=String(b.dataset.ecosystems||"").split(",").includes(key);
      b.hidden=!allowed;
      b.setAttribute("aria-hidden",String(!allowed));
      const label=navLabels[b.dataset.view];
      const span=b.querySelector("span");
      if(span&&label)span.textContent=label;
    });
  }catch(e){console.error("[M.A.R.C. ecosystem] No se pudo filtrar la navegación",e)}
  try{
    const badge=$("#ecosystemBadge");
    if(badge){badge.textContent=meta.icon+" "+meta.label;badge.title=meta.desc}
    const chooser=$("#ecosystemChooser");
    if(chooser){chooser.classList.add("hidden");chooser.setAttribute("aria-hidden","true")}
  }catch(e){console.error("[M.A.R.C. ecosystem] Error actualizando controles visuales",e)}
}
function isMasterAccount(){
  const email=String(st.u?.email||"").trim().toLowerCase();
  return email==="joachinbeltranmarcdonald50@gmail.com";
}
async function canSwitchEcosystem(){
  // La autorización de cambio no se basa en user_metadata: Supabase indica que
  // user_metadata es editable por el propio usuario y no debe usarse para
  // autorización sensible. El permiso real se consulta en la tabla de roles.
  if(isMasterAccount())return true;
  try{
    const {data,error}=await S.from("marc_user_roles")
      .select("role,active")
      .eq("user_id",st.u?.id)
      .eq("active",true);
    if(error)return false;
    return (data||[]).some(r=>{
      const role=String(r?.role||"").trim().toUpperCase();
      return role==="MASTER"||role==="MIXED"||role==="MIXTO";
    });
  }catch(_){return false}
}
function openEcosystemChooser(){
  const chooser=$("#ecosystemChooser");
  if(!chooser)return;
  chooser.classList.remove("hidden");
  chooser.setAttribute("aria-hidden","false");
}
async function saveEcosystem(key){
  key=normalizeEcosystem(key);
  if(!key)return;
  try{applyEcosystemUI(key)}catch(e){console.error("[M.A.R.C. ecosystem] Error visual no bloqueante",e)}
  // La selección inicial queda marcada como configurada. Esto evita que una cuenta
  // antigua, que ya tenga un ecosistema guardado por versiones anteriores, quede
  // atrapada en un ecosistema sin volver a mostrar el selector.
  try{
    const nextData={...(st.u?.user_metadata||{}),marc_ecosystem:key,marc_ecosystem_configured:true};
    const result=await Promise.race([
      S.auth.updateUser({data:nextData}),
      new Promise(resolve=>setTimeout(()=>resolve({timeout:true}),2500))
    ]);
    if(!result?.timeout&&!result?.error&&result?.data?.user)st.u=result.data.user;
  }catch(e){
    console.warn("[M.A.R.C. ecosystem] No se pudo guardar la configuración en perfil; se conserva localmente.",e);
  }
}
async function chooseEcosystem(key){
  key=normalizeEcosystem(key);
  if(!key){console.error("[M.A.R.C.] Ecosistema inválido:",key);return false}

  const chooser=$("#ecosystemChooser");
  const app=$("#app");
  const auth=$("#auth");
  const content=$("#content");

  // PASO 1 — cambio de pantalla 100% síncrono.
  // Ninguna consulta, permiso, Supabase, módulo externo o await puede impedir
  // que el selector desaparezca y que la aplicación quede visible.
  st.ecosystem=key;
  safeStorageSet(ECOSYSTEM_KEY,key);
  document.documentElement.dataset.ecosystem=key;
  document.documentElement.dispatchEvent(new CustomEvent("ecosystemchange",{detail:{ecosystem:key}}));

  if(chooser){
    chooser.classList.add("hidden");
    chooser.setAttribute("aria-hidden","true");
    chooser.style.pointerEvents="none";
  }
  if(auth)auth.classList.add("hidden");
  if(app)app.classList.remove("hidden");
  applyEcosystemUI(key);

  if(content){
    content.innerHTML='<section class="card" style="padding:28px"><h2 style="margin:0 0 8px">Cargando '+ECOSYSTEMS[key].label+'…</h2><p style="margin:0;color:var(--muted,#71849a)">Preparando tu espacio de trabajo.</p></section>';
  }

  console.info("[M.A.R.C. ecosystem] Seleccionado:",key);

  // PASO 2 — persistencia sin bloquear la navegación.
  void saveEcosystem(key);

  // PASO 3 — render del inicio. El selector ya está cerrado aunque esto falle.
  try{
    await view("home");
    toast("Espacio configurado: "+ECOSYSTEMS[key].label,"ok");
  }catch(err){
    console.error("[M.A.R.C. ecosystem] Error cargando inicio:",err);
    if(content){
      content.innerHTML='<section class="card" style="padding:28px"><h2 style="margin:0 0 8px">Espacio seleccionado</h2><p style="margin:0;color:var(--muted,#71849a)">El ecosistema está activo. No se pudo cargar el panel inicial.</p></section>';
    }
    toast("Ecosistema activo; hubo un error cargando el inicio.","err");
  }
  return true;
}

// Control único y aislado del selector.
// Se registra fuera de wire() para que un fallo de otro módulo no deje el selector
// sin interacción. Además intercepta el click antes de los listeners genéricos.
document.addEventListener("click",e=>{
  const b=e.target?.closest?.("#ecosystemChooser [data-ecosystem-choice]");
  if(!b)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  void chooseEcosystem(b.dataset.ecosystemChoice);
},{capture:true});

window.MARC=window.MARC||{};
window.MARC.chooseEcosystem=chooseEcosystem;

async function ensureEcosystem(){
  // La cuenta MASTER trabaja siempre desde Mixto al iniciar sesión.
  // Desde el distintivo superior puede cambiar entre Técnico, Tienda y Mixto
  // sin cerrar sesión ni perder contexto.
  const profile=st.u?.user_metadata||{};
  const configured=profile.marc_ecosystem_configured===true;
  const fromProfile=normalizeEcosystem(profile.marc_ecosystem);
  const saved=fromProfile||normalizeEcosystem(safeStorageGet(ECOSYSTEM_KEY));

  // MASTER también debe respetar el ecosistema que está probando. Antes se
  // forzaba siempre a Mixto, lo que hacía que una prueba del plan gratuito
  // Técnico terminara consultando módulos comerciales como Caja.
  if(isMasterAccount()){
    applyEcosystemUI(saved||"technician");
    return true;
  }

  // Las cuentas normales conservan su espacio configurado. Si nunca se
  // configuraron, mostramos el selector inicial.
  if(configured&&saved){
    applyEcosystemUI(saved);
    return true;
  }

  const chooser=$("#ecosystemChooser");
  if(!chooser)return true;
  chooser.style.pointerEvents="auto";
  chooser.classList.remove("hidden");
  chooser.setAttribute("aria-hidden","false");
  return false;
}

async function enter(s){
  if(!s?.user)return;
  const epoch=++st.authEpoch;
  st.session=s;
  st.u=s.user;
  const auth=$("#auth"),app=$("#app"),content=$("#content");
  const timeout=(promise,ms,fallback=null)=>Promise.race([
    Promise.resolve(promise),
    new Promise(resolve=>setTimeout(()=>resolve(fallback),ms))
  ]);
  const showBoot=()=>{
    if(!content)return;
    content.innerHTML='<section class="marc-app-loading"><div class="marc-app-loading-mark">M</div><div><b>Abriendo M.A.R.C.</b><span>Preparando tu espacio de trabajo…</span></div></section>';
  };
  const showFallback=()=>{
    if(!content)return;
    content.innerHTML='<section class="marc-app-loading marc-app-fallback"><div class="marc-app-loading-mark">M</div><div><b>Tu sesión está activa</b><span>Algunas consultas están tardando más de lo normal. Puedes continuar desde el menú.</span></div><div class="marc-boot-actions"><button class="primary" id="bootHome">Ir al inicio</button><button class="secondary" id="bootRetry">Reintentar</button></div></section>';
    $("#bootHome").onclick=()=>view("home");
    $("#bootRetry").onclick=()=>enter(s);
  };
  try{
    auth.classList.add("hidden");
    app.classList.remove("hidden");
    showBoot();

    // Ninguna tarea auxiliar debe impedir que el usuario entre.
    const cashCtx=await timeout(getCashStaffContext(),5000,{isStaff:false,ownerId:st.u.id,staff:null});
    if(epoch!==st.authEpoch)return;

    if(!cashCtx.isStaff){
      await timeout(ensure(),5000,null);
      if(epoch!==st.authEpoch)return;
      await timeout(trial(),5000,null);
      if(epoch!==st.authEpoch)return;
      await timeout(chatLoad(),5000,null);
      if(epoch!==st.authEpoch)return;
    }

    applyCashierMode(!!cashCtx.isStaff);

    // Si existe una cuenta anterior sin ecosistema configurado, el selector
    // aparece sin bloquear la aplicación completa.
    if(!cashCtx.isStaff){
      const ready=await timeout(ensureEcosystem(),5000,true);
      if(epoch!==st.authEpoch)return;
      if(!ready)return;
    }

    await timeout(loadBrandLogo(),3500,null);
    if(epoch!==st.authEpoch)return;

    // La vista inicial tiene un límite propio. Si una consulta se queda
    // colgada, dejamos al usuario dentro de M.A.R.C. en lugar de una pantalla vacía.
    const rendered=await timeout(view(cashCtx.isStaff?"cash":"home"),8000,false);
    if(epoch!==st.authEpoch)return;
    if(rendered===false)showFallback();
  }catch(e){
    if(epoch!==st.authEpoch)return;
    console.error("[M.A.R.C. enter] Fallo al abrir la aplicación:",e);
    showFallback();
  }
}
async function submit(e){e?.preventDefault();e?.stopPropagation();const button=$("#authSubmit");try{if(button)button.disabled=true;msg("Procesando…");const email=$("#email").value.trim(),p=$("#password").value;if(authMode==="reset"){const cooldownKey="marc_password_reset_cooldown";const until=Number(localStorage.getItem(cooldownKey)||0);if(until>Date.now())throw new Error("Supabase ha limitado temporalmente el envío de correos de recuperación. Espera hasta que se restablezca el límite y vuelve a intentarlo.");const recoveryUrl=new URL(String(C.appUrl||location.origin+"/"));recoveryUrl.searchParams.set("recovery","1");recoveryUrl.hash="";const {error}=await S.auth.resetPasswordForEmail(email,{redirectTo:recoveryUrl.toString()});if(error){if(authRateLimitMessage(error))localStorage.setItem(cooldownKey,String(Date.now()+60*60*1000));throw error}localStorage.removeItem(cooldownKey);msg("Revisa tu correo. El enlace te llevará a crear una nueva contraseña.","ok");return}if(authMode==="update"){if(!recoveryMode)throw new Error("El enlace de recuperación no es válido o ya expiró. Solicita uno nuevo.");if(!p||p.length<6)throw new Error("La nueva contraseña debe tener al menos 6 caracteres.");if(p!==$("#confirm").value)throw new Error("Las contraseñas no coinciden.");const {error}=await S.auth.updateUser({password:p});if(error)throw error;recoveryMode=false;history.replaceState({},document.title,location.pathname);await S.auth.signOut({scope:"local"});resetUiToLogin("Contraseña actualizada. Ahora inicia sesión con tu nueva clave.","ok");return}if(authMode==="signup"){if(!p||p.length<6)throw new Error("La contraseña debe tener al menos 6 caracteres.");if(p!==$("#confirm").value)throw new Error("Las contraseñas no coinciden.");const rr=await fetch("/api/auth/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password:p})});const jj=await rr.json().catch(()=>({}));if(!rr.ok)throw new Error(jj.error||"No se pudo crear la cuenta.");const {error:loginError}=await S.auth.signInWithPassword({email,password:p});if(loginError)throw loginError;return}else{const {error}=await S.auth.signInWithPassword({email,password:p});if(error)throw error}}catch(e){const raw=String(e?.message||"");if(authRateLimitMessage(e))msg("Límite de correo de recuperación alcanzado. Supabase bloqueó temporalmente nuevos envíos. No sigas pulsando el botón; espera y vuelve a intentarlo más tarde.","error");else msg(raw||"No se pudo completar.","error")}finally{$("#authSubmit").disabled=false}}
async function trial(){
  const state=await getPlanState(true);
  const usage=await getPlanUsage(true);
  const daysEl=$("#trialDays"),bar=$("#trialBar"),usageEl=$("#usage");
  if(state.code==="master"){
    if(daysEl)daysEl.textContent="MASTER";
    if(bar)bar.style.width="100%";
    if(usageEl)usageEl.textContent="Acceso total · SIN LÍMITES";
    refreshPlanSidebar();
    if($("#saasAdminNav"))$("#saasAdminNav").hidden=false;
    return;
  }
  const end=state.trialEndsAt?new Date(state.trialEndsAt).getTime():0;
  const left=end?Math.max(0,end-Date.now()):0;
  if(state.status==="trial"&&left>0){
    if(daysEl)daysEl.textContent=Math.ceil(left/86400000)+" días";
    if(bar)bar.style.width=Math.max(3,Math.min(100,100-(left/(7*86400000)*100)))+"%";
  }else{
    if(daysEl)daysEl.textContent=planLabel(state.code);
    if(bar)bar.style.width=state.code==="free"?"100%":"100%";
  }
  const p=MARC_PLANS[state.code]||MARC_PLANS.free;
  if(usageEl)usageEl.textContent=(p.quotes===null?"∞":usage.quotes+"/"+p.quotes)+" cotizaciones · "+(p.inventory===null?"∞":usage.inventory+"/"+p.inventory)+" productos";
  refreshPlanSidebar();
  if($("#saasAdminNav"))$("#saasAdminNav").hidden=!isMasterPlan();
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
async function finances(){
  const el=$("#content"); if(!el)return;
  el.innerHTML=`<section class="section-head"><div><span class="eyebrow">CONTROL FINANCIERO</span><h2>Finanzas</h2><p>Ingresos, gastos y resultado de tus trabajos. Sin POS.</p></div></section>
  <div class="stats-grid"><article class="stat-card"><small>Ingresos</small><strong id="finIncome">S/ 0.00</strong></article><article class="stat-card"><small>Costos</small><strong id="finExpense">S/ 0.00</strong></article><article class="stat-card"><small>Resultado</small><strong id="finResult">S/ 0.00</strong></article></div>
  <div class="card"><div class="card-head"><div><b>Resumen financiero</b><small>La utilidad detallada por trabajo está en Órdenes de trabajo.</small></div></div><div class="empty-state">Este módulo será el control financiero ligero para técnicos. La Caja/POS queda reservada para Tienda / Negocio.</div></div>`;
  const {data,error}=await S.from("marc_service_orders").select("revenue,total,labor_cost,transport_cost,materials_cost,other_cost").eq("user_id",st.u.id).limit(1000);
  if(error)throw error;
  const rows=data||[];
  const income=rows.reduce((n,r)=>n+Number(r.revenue||r.total||0),0);
  const expense=rows.reduce((n,r)=>n+Number(r.labor_cost||0)+Number(r.transport_cost||0)+Number(r.materials_cost||0)+Number(r.other_cost||0),0);
  $("#finIncome").textContent=money(income);$("#finExpense").textContent=money(expense);$("#finResult").textContent=money(income-expense);
}

function title(x){$("#page").textContent={home:"Inicio",clients:"Clientes",inventory:"Inventario",suppliers:"Proveedores",quotes:"Cotizaciones",service_orders:"Órdenes de trabajo",settings:"Configuración",saas_admin:"Administración SaaS",cash:"Caja",agenda:"Agenda técnica",finances:"Finanzas",sales:"Ventas / POS",purchases:"Compras",receivables:"Créditos y cobros",assets:"Equipos y activos",maintenance:"Mantenimientos",contracts:"Contratos",reports:"Reportes",technical_reports:"Informes técnicos"}[x]||"Inicio";$$(".sidebar nav button, #mobileNav button").forEach(b=>b.classList.toggle("active",b.dataset.view===x))}
async function sales(){
  const c=$("#content"); if(!c)return;
  const [{data:products,error:pe},{data:salesRows,error:se},{data:clientsRows}]=await Promise.all([
    S.from("marc_inventory").select("id,name,sku,brand,model,price,cost,stock,unit").eq("user_id",st.u.id).eq("active",true).order("name"),
    S.from("marc_sales").select("id,number,total,payment_method,status,created_at,marc_clients(name)").eq("user_id",st.u.id).order("created_at",{ascending:false}).limit(50),
    S.from("marc_clients").select("id,name").eq("user_id",st.u.id).order("name").limit(500)
  ]);
  if(pe||se)return toast((pe||se).message||"No se pudo cargar Ventas.","err");
  const catalog=products||[],history=salesRows||[],clientsRowsSafe=clientsRows||[];
  c.innerHTML='<div class="head"><div><div class="eyebrow2">COMERCIO</div><h1>Ventas / POS.</h1><p>Vende, descuenta inventario y deja cada operación registrada en M.A.R.C.</p></div><button id="newSale" class="primary">＋ Nueva venta</button></div>'+
    '<section class="client-summary"><div><span>VENTAS REGISTRADAS</span><strong>'+history.length+'</strong><small>Últimas 50</small></div><div><span>VENTAS HOY</span><strong>'+history.filter(x=>new Date(x.created_at).toDateString()===new Date().toDateString()).length+'</strong><small>Operaciones completadas</small></div><div><span>STOCK DISPONIBLE</span><strong>'+catalog.reduce((n,x)=>n+Number(x.stock||0),0)+'</strong><small>Unidades</small></div><div><span>PRODUCTOS</span><strong>'+catalog.length+'</strong><small>Catálogo activo</small></div></section>'+
    '<section class="card table"><div class="toolbar"><div class="search"><input id="saleSearch" placeholder="Buscar venta o cliente…"></div><button id="saleRefresh" class="secondary">↻ Actualizar</button></div><div class="scroll"><table class="data"><thead><tr><th>Venta</th><th>Cliente</th><th>Fecha</th><th>Pago</th><th>Estado</th><th>Total</th></tr></thead><tbody id="salesRows"></tbody></table></div></section>';
  const draw=items=>{$("#salesRows").innerHTML=items.map(r=>'<tr><td><b>'+esc(r.number)+'</b></td><td>'+esc(r.marc_clients?.name||"Venta rápida")+'</td><td>'+new Date(r.created_at).toLocaleString("es-PE")+'</td><td>'+esc(r.payment_method)+'</td><td><span class="status-pill">'+esc(r.status)+'</span></td><td><b>'+money(r.total)+'</b></td></tr>').join("")||'<tr><td colspan="6" class="empty">No hay ventas todavía.</td></tr>'};
  draw(history);
  $("#saleSearch").oninput=e=>{const q=e.target.value.toLowerCase();draw(history.filter(r=>[r.number,r.payment_method,r.status,r.marc_clients?.name].some(v=>String(v||"").toLowerCase().includes(q))))};
  $("#saleRefresh").onclick=sales;
  $("#newSale").onclick=()=>saleModal(catalog,clientsRowsSafe);
}
function saleModal(catalog,clientsRows){
  const close=modal('<div class="modal-head"><div><div class="eyebrow2">PUNTO DE VENTA</div><h2>Nueva venta</h2><p>Selecciona productos, forma de pago y cliente. Al confirmar se descuenta el stock.</p></div><button class="close" id="saleClose">×</button></div>'+
    '<div class="pos-grid"><section><label>Buscar producto<input id="posSearch" placeholder="Nombre, SKU, marca o modelo…"></label><div id="posProducts" class="pos-products"></div></section><section><label>Cliente<select id="posClient"><option value="">Venta rápida / sin cliente</option>'+clientsRows.map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join("")+'</select></label><label>Forma de pago<select id="posPayment"><option>EFECTIVO</option><option>YAPE</option><option>PLIN</option><option>TARJETA</option><option>TRANSFERENCIA</option><option>CREDITO</option></select></label><label>Descuento<input id="posDiscount" type="number" min="0" step="0.01" value="0"></label><div id="posCart" class="pos-cart"></div><div class="pos-total"><span>Total</span><strong id="posTotal">S/ 0.00</strong></div><div id="posMsg" class="msg"></div><button id="posSave" class="primary wide" type="button">Confirmar venta</button></section></div>');
  $("#saleClose").onclick=close;
  const cart=[];
  const drawProducts=()=>{
    const q=String($("#posSearch").value||"").toLowerCase();
    const list=catalog.filter(p=>[p.name,p.sku,p.brand,p.model].some(v=>String(v||"").toLowerCase().includes(q))).slice(0,40);
    $("#posProducts").innerHTML=list.map(p=>'<button type="button" class="pos-product" data-pos-product="'+p.id+'" '+(Number(p.stock)<=0?"disabled":"")+'><b>'+esc(p.name)+'</b><small>'+esc(p.sku||p.brand||"Sin código")+' · Stock '+Number(p.stock||0)+'</small><strong>'+money(p.price)+'</strong></button>').join("")||'<div class="empty">No hay productos.</div>';
  };
  const drawCart=()=>{
    const discount=Number($("#posDiscount").value||0);
    const subtotal=cart.reduce((n,x)=>n+x.quantity*x.price,0),total=Math.max(0,subtotal-discount);
    $("#posCart").innerHTML=cart.map((x,i)=>'<div class="pos-cart-row"><div><b>'+esc(x.name)+'</b><small>'+money(x.price)+' c/u</small></div><div class="pos-qty"><button data-pos-minus="'+i+'">−</button><b>'+x.quantity+'</b><button data-pos-plus="'+i+'">+</button></div><button data-pos-remove="'+i+'" aria-label="Quitar">×</button></div>').join("")||'<div class="empty">Agrega productos para comenzar.</div>';
    $("#posTotal").textContent=money(total);
  };
  $("#posSearch").oninput=drawProducts;$("#posDiscount").oninput=drawCart;
  $("#posProducts").onclick=e=>{const b=e.target.closest("[data-pos-product]");if(!b)return;const p=catalog.find(x=>x.id===b.dataset.posProduct);if(!p)return;const x=cart.find(x=>x.id===p.id);if(x){if(x.quantity<Number(p.stock))x.quantity++;}else cart.push({id:p.id,name:p.name,price:Number(p.price||0),cost:Number(p.cost||0),quantity:1});drawCart()};
  $("#posCart").onclick=e=>{let i;let b=e.target.closest("[data-pos-minus]");if(b){i=Number(b.dataset.posMinus);cart[i].quantity--;if(cart[i].quantity<=0)cart.splice(i,1);drawCart();return}b=e.target.closest("[data-pos-plus]");if(b){i=Number(b.dataset.posPlus);const p=catalog.find(x=>x.id===cart[i].id);if(p&&cart[i].quantity<Number(p.stock))cart[i].quantity++;drawCart();return}b=e.target.closest("[data-pos-remove]");if(b){cart.splice(Number(b.dataset.posRemove),1);drawCart()}};
  $("#posSave").onclick=async()=>{
    const b=$("#posSave"),msgEl=$("#posMsg"),payment=$("#posPayment").value,client=$("#posClient").value||null,discount=Number($("#posDiscount").value||0);
    if(!cart.length)return msgEl.textContent="Agrega al menos un producto.";
    if(payment==="CREDITO"&&!client)return msgEl.textContent="Una venta a crédito necesita un cliente.";
    b.disabled=true;msgEl.textContent="Registrando venta…";
    const number="V-"+Date.now().toString().slice(-8);
    const {data,error}=await S.rpc("marc_create_sale",{p_number:number,p_client_id:client,p_discount:discount,p_payment_method:payment,p_notes:null,p_items:cart.map(x=>({inventory_id:x.id,quantity:x.quantity}))});
    if(error){msgEl.textContent=error.message||"No se pudo registrar la venta.";b.disabled=false;return}
    close();toast("Venta "+number+" registrada","ok");sales();
  };
  drawProducts();drawCart();
}
async function contracts(){
  const c=$("#content"); if(!c)return;
  const {data,error}=await S.from("marc_contracts").select("*").eq("user_id",st.u.id).order("ends_at",{ascending:true}).limit(300);
  if(error)return toast(error.message||"No se pudieron cargar los contratos.","err");
  const rows=data||[],now=Date.now(),soon=now+30*86400000;
  const active=rows.filter(x=>String(x.status||"ACTIVO").toUpperCase()==="ACTIVO").length;
  const expiring=rows.filter(x=>x.ends_at&&new Date(x.ends_at).getTime()>=now&&new Date(x.ends_at).getTime()<=soon).length;
  const expired=rows.filter(x=>x.ends_at&&new Date(x.ends_at).getTime()<now).length;
  const value=rows.filter(x=>String(x.status||"ACTIVO").toUpperCase()==="ACTIVO").reduce((n,x)=>n+Number(x.amount??x.price??x.total??0),0);
  const fmt=v=>v?new Date(v).toLocaleDateString("es-PE"):"—";
  const draw=items=>{$("#contractRows").innerHTML=items.map(x=>{const overdue=x.ends_at&&new Date(x.ends_at).getTime()<now;return '<tr><td><b>'+esc(x.title||x.name||"Contrato")+'</b><br><small>'+esc(x.description||"Servicio recurrente")+'</small></td><td>'+fmt(x.starts_at)+'</td><td class="'+(overdue?"out":"")+'">'+fmt(x.ends_at)+(overdue?" · VENCIDO":"")+'</td><td><span class="status-pill">'+esc(String(x.status||"ACTIVO"))+'</span></td><td><b>'+money(x.amount??x.price??x.total??0)+'</b></td><td><button class="secondary" data-contract="'+x.id+'">Abrir</button></td></tr>'}).join("")||'<tr><td colspan="6" class="empty">No hay contratos registrados todavía.</td></tr>'};
  c.innerHTML='<div class="head"><div><div class="eyebrow2">SERVICIOS RECURRENTES</div><h1>Contratos.</h1><p>Controla vigencias, importes, renovaciones y servicios recurrentes de tus clientes.</p></div><button id="newContract" class="primary">＋ Nuevo contrato</button></div><section class="client-summary"><div><span>ACTIVOS</span><strong>'+active+'</strong><small>Contratos vigentes</small></div><div><span>POR VENCER</span><strong>'+expiring+'</strong><small>Próximos 30 días</small></div><div><span>VENCIDOS</span><strong class="'+(expired?"out":"ok")+'">'+expired+'</strong><small>Requieren renovación</small></div><div><span>VALOR ACTIVO</span><strong>'+money(value)+'</strong><small>Importe registrado</small></div></section><section class="card table"><div class="toolbar"><div class="search"><input id="contractSearch" placeholder="Buscar contrato o servicio…"></div><button id="contractRefresh" class="secondary">↻ Actualizar</button></div><div class="scroll"><table class="data"><thead><tr><th>Contrato</th><th>Inicio</th><th>Vencimiento</th><th>Estado</th><th>Importe</th><th></th></tr></thead><tbody id="contractRows"></tbody></table></div></section>';
  draw(rows);$("#newContract").onclick=()=>contractModal();$("#contractRefresh").onclick=()=>contracts();$("#contractSearch").oninput=e=>{const q=e.target.value.toLowerCase();draw(rows.filter(x=>[x.title,x.name,x.description,x.status].some(v=>String(v||"").toLowerCase().includes(q))))};$("#contractRows").onclick=e=>{const b=e.target.closest("[data-contract]");if(b)contractModal(rows.find(x=>x.id===b.dataset.contract))};
}
function contractModal(existing=null){
  const editing=!!existing,close=modal('<div class="modal-head"><div><div class="eyebrow2">CONTRATO</div><h2>'+(editing?"Editar contrato":"Nuevo contrato")+'</h2><p>Registra la vigencia y las condiciones del servicio recurrente.</p></div><button class="close" id="contractClose">×</button></div><form id="contractForm" class="form-grid"><label>Nombre del contrato<input name="title" required value="'+esc(existing?.title||existing?.name||"")+'" placeholder="Ej. Mantenimiento CCTV"></label><label>Estado<select name="status"><option>ACTIVO</option><option>PENDIENTE</option><option>VENCIDO</option><option>CANCELADO</option></select></label><label>Inicio<input name="starts_at" type="date" value="'+(existing?.starts_at?String(existing.starts_at).slice(0,10):new Date().toISOString().slice(0,10))+'"></label><label>Vencimiento<input name="ends_at" type="date" value="'+(existing?.ends_at?String(existing.ends_at).slice(0,10):"")+'"></label><label>Importe<input name="amount" type="number" min="0" step="0.01" value="'+Number(existing?.amount??existing?.price??existing?.total??0)+'"></label><label>Periodicidad<input name="periodicity" value="'+esc(existing?.periodicity||"Mensual")+'" placeholder="Mensual, trimestral, anual…"></label><label style="grid-column:1/-1">Descripción / servicios incluidos<textarea name="description" rows="4">'+esc(existing?.description||"")+'</textarea></label><div class="modal-actions" style="grid-column:1/-1"><button type="button" class="secondary" id="contractCancel">Cancelar</button><button class="primary">Guardar contrato</button></div></form>');
  $("#contractClose").onclick=close;$("#contractCancel").onclick=close;$("#contractForm [name=status]").value=String(existing?.status||"ACTIVO").toUpperCase();
  $("#contractForm").onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const d=new FormData(e.currentTarget),payload={user_id:st.u.id,title:String(d.get("title")||"").trim(),description:String(d.get("description")||"").trim()||null,status:String(d.get("status")||"ACTIVO"),amount:Number(d.get("amount")||0),starts_at:d.get("starts_at")||null,ends_at:d.get("ends_at")||null,periodicity:String(d.get("periodicity")||"").trim()||null,updated_at:new Date().toISOString()};if(!payload.title)throw new Error("Escribe el nombre del contrato.");const r=editing?await S.from("marc_contracts").update(payload).eq("id",existing.id).eq("user_id",st.u.id):await S.from("marc_contracts").insert(payload);if(r.error)throw r.error;close();toast(editing?"Contrato actualizado":"Contrato creado","ok");contracts()}catch(err){toast(err.message||"No se pudo guardar el contrato.","err");b.disabled=false}};
}
async function technicalReports(){
  const c=$("#content");if(!c)return;
  const {data,error}=await S.from("technical_reports").select("*,clientes:client_id(name)").eq("user_id",st.u.id).order("created_at",{ascending:false}).limit(200);
  if(error)return toast(error.message||"No se pudieron cargar los informes técnicos.","err");
  const rows=data||[],monthStart=new Date(new Date().getFullYear(),new Date().getMonth(),1);
  const monthCount=rows.filter(r=>new Date(r.created_at)>=monthStart).length;
  const plan=normalizePlan(st.planState?.code),limit=MARC_PLANS[plan]?.reports;
  c.innerHTML='<section class="tech-reports-app">'+
    '<div class="tech-reports-hero"><div><div class="eyebrow2">APLICACIÓN · DOCUMENTACIÓN</div><h1>Informes técnicos</h1><p>Documenta diagnósticos, instalaciones, mantenimientos, reparaciones y entregas.</p></div><button id="newTechnicalReport" class="primary">＋ Nuevo informe</button></div>'+
    '<div class="tech-reports-stats"><article><b>'+rows.length+'</b><span>INFORMES</span><small>Historial disponible</small></article><article><b>'+monthCount+(limit===null?"":" / "+limit)+'</b><span>ESTE MES</span><small>'+(limit===null?"Sin límite":"Límite del plan Gratis")+'</small></article><article><b>'+rows.filter(r=>r.status==="FINALIZADO"||r.status==="ENTREGADO").length+'</b><span>FINALIZADOS</span><small>Listos para entregar</small></article><article><b>'+rows.filter(r=>r.status==="BORRADOR").length+'</b><span>BORRADORES</span><small>En preparación</small></article></div>'+
    '<section class="tech-reports-browser"><div class="tech-reports-toolbar"><div class="tech-reports-search"><span>⌕</span><input id="technicalReportSearch" placeholder="Buscar informe, cliente, equipo o ubicación…"></div><button id="technicalReportRefresh" class="secondary">↻ Actualizar</button></div><div id="technicalReportCards" class="tech-report-cards"></div></section>'+
    '</section>';
  const draw=()=>{
    const q=String($("#technicalReportSearch")?.value||"").trim().toLowerCase();
    const list=rows.filter(r=>[r.number,r.title,r.report_type,r.status,r.location,r.equipment,r.problem,r.diagnosis,r.clientes?.name].some(v=>String(v||"").toLowerCase().includes(q)));
    $("#technicalReportCards").innerHTML=list.map(r=>'<article class="tech-report-card"><div class="tech-report-card-head"><div><span class="tech-report-number">'+esc(r.number||"SIN NÚMERO")+'</span><span class="tech-report-status">'+esc(r.status||"BORRADOR")+'</span></div><b>'+esc(r.report_type||"DIAGNOSTICO")+'</b></div><h3>'+esc(r.title||"Informe técnico")+'</h3><p>👤 '+esc(r.clientes?.name||"Sin cliente")+'</p><small>📅 '+new Date(r.report_date||r.created_at).toLocaleDateString("es-PE")+(r.location?" · 📍 "+esc(r.location):"")+'</small><div class="tech-report-card-grid"><span><b>Equipo</b>'+esc(r.equipment||"—")+'</span><span><b>Estado</b>'+esc(r.status||"BORRADOR")+'</span></div><button class="secondary tech-report-open" data-id="'+esc(r.id)+'">Abrir informe →</button></article>').join("")||'<div class="tech-report-empty"><span>📄</span><b>No hay informes técnicos</b><small>Crea el primero y empieza a construir tu historial profesional.</small></div>';
    $$(".tech-report-open").forEach(b=>b.onclick=()=>technicalReportModal(rows.find(r=>r.id===b.dataset.id)));
  };
  $("#newTechnicalReport").onclick=()=>technicalReportModal();
  $("#technicalReportRefresh").onclick=technicalReports;
  $("#technicalReportSearch").oninput=draw;
  draw();
}
function technicalReportModal(existing=null){
  const editing=!!existing;
  const close=modal('<div class="modal-head"><div><div class="eyebrow2">INFORME TÉCNICO</div><h2>'+(editing?"Editar informe":"Nuevo informe")+'</h2><p>Registra el servicio con lenguaje técnico y deja el historial asociado al cliente.</p></div><button class="close" id="technicalReportClose">×</button></div>'+
    '<form id="technicalReportForm" class="form-grid">'+
    '<label>Tipo<select name="report_type"><option>MANTENIMIENTO</option><option>DIAGNOSTICO</option><option>INSTALACION</option><option>INSPECCION</option><option>REPARACION</option><option>ENTREGA_CONFORMIDAD</option><option>OTRO</option></select></label>'+
    '<label>Estado<select name="status"><option>BORRADOR</option><option>EN_REVISION</option><option>FINALIZADO</option><option>ENTREGADO</option><option>CANCELADO</option></select></label>'+
    '<label style="grid-column:1/-1">Título<input name="title" required value="'+esc(existing?.title||"Informe técnico")+'" placeholder="Ej. Mantenimiento preventivo de CCTV"></label>'+
    '<label>Cliente ID opcional<input name="client_id" value="'+esc(existing?.client_id||"")+'" placeholder="UUID del cliente"></label>'+
    '<label>Fecha<input name="report_date" type="date" value="'+esc(existing?.report_date||new Date().toISOString().slice(0,10))+'"></label>'+
    '<label>Técnico<input name="technician" value="'+esc(existing?.technician||"")+'" placeholder="Nombre del técnico"></label>'+
    '<label>Ubicación<input name="location" value="'+esc(existing?.location||"")+'" placeholder="Dirección / instalación"></label>'+
    '<label>Equipo<input name="equipment" value="'+esc(existing?.equipment||"")+'" placeholder="Equipo, modelo o sistema"></label>'+
    '<label style="grid-column:1/-1">Problema / motivo<textarea name="problem" rows="3" placeholder="Qué reportó el cliente o qué se encontró…">'+esc(existing?.problem||"")+'</textarea></label>'+
    '<label style="grid-column:1/-1">Diagnóstico<textarea name="diagnosis" rows="4" placeholder="Hallazgos y diagnóstico técnico…">'+esc(existing?.diagnosis||"")+'</textarea></label>'+
    '<label style="grid-column:1/-1">Trabajo realizado<textarea name="work_performed" rows="4" placeholder="Trabajos, pruebas y procedimientos realizados…">'+esc(existing?.work_performed||"")+'</textarea></label>'+
    '<label>Materiales<textarea name="materials" rows="3" placeholder="Materiales o repuestos utilizados…">'+esc(existing?.materials||"")+'</textarea></label>'+
    '<label>Recomendaciones<textarea name="recommendations" rows="3" placeholder="Recomendaciones al cliente…">'+esc(existing?.recommendations||"")+'</textarea></label>'+
    '<label style="grid-column:1/-1">Conclusiones / observaciones<textarea name="conclusions" rows="3" placeholder="Resultado final y observaciones…">'+esc(existing?.conclusions||"")+'</textarea></label>'+
    '<div class="modal-actions" style="grid-column:1/-1"><button type="button" class="secondary" id="technicalReportCancel">Cancelar</button><button class="primary" id="technicalReportSave">Guardar informe</button></div></form>');
  $("#technicalReportClose").onclick=close;$("#technicalReportCancel").onclick=close;
  $("#technicalReportForm [name=report_type]").value=existing?.report_type||"DIAGNOSTICO";
  $("#technicalReportForm [name=status]").value=existing?.status||"BORRADOR";
  $("#technicalReportForm").onsubmit=async e=>{
    e.preventDefault();
    const b=$("#technicalReportSave");b.disabled=true;
    try{
      if(!editing && !(await requirePlan("Informes técnicos","reports")))return;
      const d=new FormData(e.currentTarget);
      const payload={user_id:st.u.id,report_type:String(d.get("report_type")||"DIAGNOSTICO"),status:String(d.get("status")||"BORRADOR"),title:String(d.get("title")||"Informe técnico").trim(),client_id:String(d.get("client_id")||"").trim()||null,report_date:d.get("report_date")||new Date().toISOString().slice(0,10),technician:String(d.get("technician")||"").trim()||null,location:String(d.get("location")||"").trim()||null,equipment:String(d.get("equipment")||"").trim()||null,problem:String(d.get("problem")||"").trim()||null,diagnosis:String(d.get("diagnosis")||"").trim()||null,work_performed:String(d.get("work_performed")||"").trim()||null,materials:String(d.get("materials")||"").trim()||null,recommendations:String(d.get("recommendations")||"").trim()||null,conclusions:String(d.get("conclusions")||"").trim()||null,updated_at:new Date().toISOString()};
      if(!payload.title)throw new Error("Escribe un título para el informe.");
      let result=editing?await S.from("technical_reports").update(payload).eq("id",existing.id).eq("user_id",st.u.id):await S.from("technical_reports").insert(payload);
      if(result.error)throw result.error;
      close();toast(editing?"Informe actualizado":"Informe técnico creado","ok");await technicalReports();
    }catch(err){
      const raw=String(err?.message||"");
      if(raw.includes("MARC_PLAN_LIMIT_REPORTS")||raw.includes("TRIAL_QUOTE_LIMIT"))openUpgradeModal("El plan Gratis permite hasta 5 informes técnicos al mes.");
      else if(raw.includes("foreign key")&&String(err?.details||"").includes("client_id"))toast("El ID del cliente no es válido.","err");
      else toast(raw||"No se pudo guardar el informe.","err");
    }finally{b.disabled=false}
  };
}
function moduleHub(type){
  const c=$("#content"); if(!c)return;
  const ecosystem=currentEcosystem()||"technician";
  const catalogs={
    sales:{icon:"🛒",eyebrow:"COMERCIO",title:"Ventas / POS",desc:"Registra ventas reales y conecta cada operación con cliente, inventario y caja.",tone:"business",actions:[["cash","Abrir caja"],["inventory","Revisar inventario"],["clients","Buscar cliente"]],features:["Venta al contado o crédito","Métodos de pago y comprobante interno","Descuentos y cálculo automático","Descuento de stock al confirmar","Historial de ventas"]},
    purchases:{icon:"📥",eyebrow:"ABASTECIMIENTO",title:"Compras",desc:"Registra compras y entradas de mercadería para mantener costos e inventario sincronizados.",tone:"business",actions:[["inventory","Ver inventario"],["suppliers","Ver proveedores"]],features:["Proveedor y documento","Productos y cantidades","Costo unitario y descuentos","Entrada al inventario","Historial de compras"]},
    receivables:{icon:"💳",eyebrow:"COBRANZAS",title:"Créditos y cobros",desc:"Controla las ventas a crédito, saldos pendientes y pagos de clientes.",tone:"business",actions:[["clients","Ver clientes"],["cash","Ir a caja"]],features:["Cuentas por cobrar","Saldo por cliente","Registro de abonos","Vencimientos","Historial de deuda"]},
    assets:{icon:"🧰",eyebrow:"CONTROL TÉCNICO",title:"Equipos y activos",desc:"Registra equipos instalados, números de serie, ubicación, garantía y estado.",tone:"technician",actions:[["clients","Ver clientes"],["service_orders","Crear orden de trabajo"],["maintenance","Programar mantenimiento"]],features:["Ficha técnica del equipo","Serie y ubicación","Fecha de instalación","Garantía y estado","Historial de intervenciones"]},
    maintenance:{icon:"🔧",eyebrow:"SERVICIO RECURRENTE",title:"Mantenimientos",desc:"Programa y controla mantenimientos preventivos y correctivos.",tone:"technician",actions:[["agenda","Abrir agenda"],["service_orders","Ver órdenes"],["assets","Ver equipos"]],features:["Preventivo y correctivo","Próxima fecha","Frecuencia","Historial por cliente y equipo","Costos y trabajos realizados"]},
    contracts:{icon:"📄",eyebrow:"SERVICIOS RECURRENTES",title:"Contratos",desc:"Administra contratos de mantenimiento, servicios periódicos y renovaciones.",tone:"technician",actions:[["clients","Ver clientes"],["maintenance","Ver mantenimientos"]],features:["Vigencia","Precio y periodicidad","Servicios incluidos","Visitas pendientes","Renovaciones"]},
    reports:{icon:"📊",eyebrow:"INTELIGENCIA OPERATIVA",title:"Reportes",desc:"Consulta indicadores de ventas, trabajos, inventario, caja y documentación técnica.",tone:"mixed",actions:[["technical_reports","Informes técnicos"],["finances","Finanzas"],["cash","Caja"],["inventory","Inventario"]],features:["Informes técnicos","Ventas y rentabilidad","Órdenes de trabajo","Inventario","Caja","Exportación a Excel/PDF"]}
  };
  const m=catalogs[type]||catalogs.reports;
  const apps=type==="reports"?["technical_reports","sales","purchases","receivables","assets","maintenance","contracts"].filter(k=>ecosystemAllows(k)):[];
  const quick=m.actions.map(a=>'<button class="module-action" data-module-action="'+a[0]+'"><b>'+esc(a[1])+'</b><span>→</span></button>').join("");
  c.innerHTML='<section class="module-hub '+m.tone+'" data-module="'+type+'">'+
    '<div class="module-hero"><div><div class="module-eyebrow">'+m.eyebrow+'</div><h1>'+m.icon+' '+m.title+'</h1><p>'+m.desc+'</p></div><span class="module-ecosystem">'+(ECOSYSTEMS[ecosystem]?.icon||"")+" "+(ECOSYSTEMS[ecosystem]?.label||"M.A.R.C.")+'</span></div>'+
    '<div class="module-actions">'+quick+'</div>'+
    '<div class="module-section"><div class="module-section-head"><div><span>APLICACIÓN</span><h2>Panel de trabajo</h2></div><span class="module-live">Preparado</span></div>'+
    '<div class="module-form-grid"><label>Buscar<input id="moduleSearch" placeholder="Buscar en este módulo…"></label><label>Estado<select id="moduleStatus"><option value="">Todos</option><option>ACTIVO</option><option>PENDIENTE</option><option>COMPLETADO</option></select></label><button id="modulePrimary" class="primary">＋ Nueva operación</button></div>'+
    '<div id="moduleRows" class="module-rows"><div class="module-empty"><b>Sin operaciones registradas todavía</b><small>La estructura está lista. Puedes comenzar desde “Nueva operación”.</small></div></div></div>'+
    (apps.length?'<div class="module-section module-related"><div class="module-section-head"><div><span>CENTRO DE APLICACIONES</span><h2>Áreas conectadas</h2></div></div><div class="module-related-grid">'+apps.map(k=>'<button data-module-action="'+k+'"><b>'+esc(catalogs[k].icon+" "+catalogs[k].title)+'</b><small>'+esc(catalogs[k].desc)+'</small><span>Entrar →</span></button>').join("")+'</div></div>':"")+
    '<div class="module-section"><div class="module-section-head"><div><span>FUNCIONES PLANIFICADAS</span><h2>Qué controla esta aplicación</h2></div></div><div class="module-feature-grid">'+m.features.map((f,i)=>'<article><span>0'+(i+1)+'</span><b>'+esc(f)+'</b><small>Integrado con M.A.R.C.</small></article>').join("")+'</div></div>'+
    '</section>';
  $$(".module-action,.module-related-grid button",c).forEach(b=>b.onclick=()=>view(b.dataset.moduleAction));
  const primary=$("#modulePrimary");
  if(primary)primary.onclick=()=>moduleCreateModal(type);
  const search=$("#moduleSearch"),status=$("#moduleStatus");
  const filter=()=>{$$("#moduleRows .module-row",c).forEach(row=>{const q=(search?.value||"").toLowerCase(),s=status?.value||"";row.hidden=!!(q&&!row.textContent.toLowerCase().includes(q)||s&&row.dataset.status!==s)})};
  search?.addEventListener("input",filter);status?.addEventListener("change",filter);
  void moduleLoad(type);
}
async function moduleLoad(type){
  const box=$("#moduleRows"); if(!box||!st.u?.id)return;
  try{
    let rows=[];
    if(type==="purchases"){
      const r=await S.from("marc_purchases").select("*").eq("user_id",st.u.id).order("created_at",{ascending:false}).limit(100);
      if(r.error)throw r.error; rows=r.data||[];
    }else if(type==="receivables"){
      const r=await S.from("marc_receivables").select("*").eq("user_id",st.u.id).order("due_at",{ascending:true}).limit(100);
      if(r.error)throw r.error; rows=r.data||[];
    }else return;
    if(!rows.length){box.innerHTML='<div class="module-empty"><b>No hay registros todavía</b><small>Usa “Nueva operación” para comenzar.</small></div>';return}
    if(type==="purchases"){
      box.innerHTML=rows.map(r=>'<div class="module-row" data-status="'+esc(String(r.status||"").toUpperCase())+'"><div><b>'+esc(r.reference||r.number||"Compra")+'</b><small>'+esc(r.supplier_name||r.notes||"Sin proveedor")+'</small></div><span>'+esc(r.status||"REGISTRADA")+'</span><strong>'+money(r.total||0)+'</strong><button class="secondary" type="button" data-purchase-edit="'+r.id+'">Editar</button></div>').join("");
      box.querySelectorAll("[data-purchase-edit]").forEach(b=>b.onclick=()=>purchaseModal(rows.find(x=>x.id===b.dataset.purchaseEdit)));
    }else{
      box.innerHTML=rows.map(r=>'<div class="module-row" data-status="'+esc(String(r.status||"").toUpperCase())+'"><div><b>'+esc(r.customer_name||r.client_name||"Crédito")+'</b><small>'+esc(r.reference||r.notes||"Sin referencia")+'</small></div><span>'+esc(r.status||"PENDIENTE")+'</span><strong>'+money(r.balance??r.amount??0)+'</strong><button class="secondary" type="button" data-receivable-edit="'+r.id+'">Editar</button></div>').join("");
      box.querySelectorAll("[data-receivable-edit]").forEach(b=>b.onclick=()=>receivableModal(rows.find(x=>x.id===b.dataset.receivableEdit)));
    }
  }catch(e){box.innerHTML='<div class="module-empty"><b>No se pudo cargar este módulo</b><small>'+esc(e.message||"Error de datos")+'</small></div>'}
}
function moduleCreateModal(type){
  if(type==="purchases")return purchaseModal();
  if(type==="receivables")return receivableModal();
  const labels={sales:"Nueva venta",assets:"Nuevo equipo",maintenance:"Nuevo mantenimiento",contracts:"Nuevo contrato"};
  const close=modal('<div class="modal-head"><div><div class="eyebrow2">MÓDULO</div><h2>'+esc(labels[type]||"Nueva operación")+'</h2><p>Usa el módulo especializado para completar todos los campos.</p></div><button class="close" id="moduleClose" type="button">×</button></div><div class="card" style="padding:16px"><p>Esta operación requiere datos específicos. Abre el módulo correspondiente para registrarla correctamente.</p><div class="modal-actions"><button id="moduleGo" class="primary">Abrir módulo</button></div></div>');
  $("#moduleClose").onclick=close;
  $("#moduleGo").onclick=()=>{close();view(type)};
}
async function purchaseModal(existing=null){
  const editing=!!existing;
  const close=modal('<div class="modal-head"><div><div class="eyebrow2">ABASTECIMIENTO</div><h2>'+(editing?"Editar compra":"Nueva compra")+'</h2><p>Registra una compra con proveedor, referencia, importe y estado.</p></div><button class="close" id="purchaseClose">×</button></div><form id="purchaseForm" class="form-grid"><label>Referencia / documento<input name="reference" required value="'+esc(existing?.reference||existing?.number||existing?.title||"")+'"></label><label>Proveedor<input name="supplier_name" value="'+esc(existing?.supplier_name||"")+'"></label><label>Fecha<input name="purchase_date" type="date" value="'+(existing?.purchase_date?String(existing.purchase_date).slice(0,10):new Date().toISOString().slice(0,10))+'"></label><label>Total<input name="total" type="number" min="0" step="0.01" value="'+Number(existing?.total||existing?.amount||0)+'"></label><label>Estado<select name="status"><option>REGISTRADA</option><option>PENDIENTE</option><option>RECIBIDA</option><option>CANCELADA</option></select></label><label style="grid-column:1/-1">Notas<textarea name="notes" rows="3">'+esc(existing?.notes||existing?.description||"")+'</textarea></label><div class="modal-actions" style="grid-column:1/-1"><button type="button" class="secondary" id="purchaseCancel">Cancelar</button><button class="primary">Guardar compra</button></div></form>');
  $("#purchaseClose").onclick=close;$("#purchaseCancel").onclick=close;
  $("#purchaseForm [name=status]").value=existing?.status||"REGISTRADA";
  $("#purchaseForm").onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const d=new FormData(e.currentTarget);const payload={user_id:st.u.id,reference:String(d.get("reference")||"").trim(),supplier_name:String(d.get("supplier_name")||"").trim()||null,purchase_date:d.get("purchase_date")||null,total:Number(d.get("total")||0),status:String(d.get("status")||"REGISTRADA"),notes:String(d.get("notes")||"").trim()||null,updated_at:new Date().toISOString()};const r=editing?await S.from("marc_purchases").update(payload).eq("id",existing.id).eq("user_id",st.u.id):await S.from("marc_purchases").insert(payload);if(r.error)throw r.error;close();toast(editing?"Compra actualizada":"Compra registrada","ok");moduleLoad("purchases")}catch(err){toast(err.message||"No se pudo guardar la compra.","err");b.disabled=false}};
}
async function receivableModal(existing=null){
  const editing=!!existing;
  const close=modal('<div class="modal-head"><div><div class="eyebrow2">COBRANZAS</div><h2>'+(editing?"Editar crédito":"Nuevo crédito")+'</h2><p>Registra cliente, saldo, vencimiento y estado.</p></div><button class="close" id="receivableClose">×</button></div><form id="receivableForm" class="form-grid"><label>Cliente<input name="customer_name" required value="'+esc(existing?.customer_name||existing?.client_name||"")+'"></label><label>Referencia<input name="reference" value="'+esc(existing?.reference||existing?.number||"")+'"></label><label>Monto<input name="amount" type="number" min="0" step="0.01" value="'+Number(existing?.amount||existing?.total||0)+'"></label><label>Saldo<input name="balance" type="number" min="0" step="0.01" value="'+Number(existing?.balance??existing?.amount??existing?.total??0)+'"></label><label>Vencimiento<input name="due_at" type="date" value="'+(existing?.due_at?String(existing.due_at).slice(0,10):"")+'"></label><label>Estado<select name="status"><option>PENDIENTE</option><option>PARCIAL</option><option>PAGADO</option><option>VENCIDO</option></select></label><label style="grid-column:1/-1">Notas<textarea name="notes" rows="3">'+esc(existing?.notes||"")+'</textarea></label><div class="modal-actions" style="grid-column:1/-1"><button type="button" class="secondary" id="receivableCancel">Cancelar</button><button class="primary">Guardar crédito</button></div></form>');
  $("#receivableClose").onclick=close;$("#receivableCancel").onclick=close;
  $("#receivableForm [name=status]").value=existing?.status||"PENDIENTE";
  $("#receivableForm").onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const d=new FormData(e.currentTarget);const amount=Number(d.get("amount")||0),balance=Math.min(amount,Math.max(0,Number(d.get("balance")||0)));const payload={user_id:st.u.id,customer_name:String(d.get("customer_name")||"").trim(),reference:String(d.get("reference")||"").trim()||null,amount,balance,due_at:d.get("due_at")||null,status:String(d.get("status")||"PENDIENTE"),notes:String(d.get("notes")||"").trim()||null,updated_at:new Date().toISOString()};const r=editing?await S.from("marc_receivables").update(payload).eq("id",existing.id).eq("user_id",st.u.id):await S.from("marc_receivables").insert(payload);if(r.error)throw r.error;close();toast(editing?"Crédito actualizado":"Crédito registrado","ok");moduleLoad("receivables")}catch(err){toast(err.message||"No se pudo guardar el crédito.","err");b.disabled=false}};
}

let __viewBusy=false;
async function reports(){
  const c=$("#content"); if(!c)return;
  const eco=currentEcosystem();
  c.innerHTML='<div class="head"><div><div class="eyebrow2">ANÁLISIS DEL NEGOCIO</div><h1>Reportes.</h1><p>Resumen operativo con información disponible para tu ecosistema.</p></div><button id="reportsRefresh" class="secondary">↻ Actualizar</button></div><div id="reportsBody" class="reports-dashboard"><div class="empty-state">Cargando reportes…</div></div>';

  const load=async()=>{
    /*
      IMPORTANTE:
      El reporte debe respetar el catálogo y los permisos del ecosistema.
      El usuario gratuito del Ecosistema Técnico no tiene acceso a ventas,
      órdenes técnicas ni caja. No consultamos esas tablas para evitar que
      Supabase bloquee todo el reporte por una sola tabla restringida.
    */
    const requests=[
      S.from("marc_quotes").select("total,status,created_at").eq("user_id",st.u.id).is("deleted_at",null).order("created_at",{ascending:false}).limit(1000),
      S.from("marc_inventory").select("name,stock,min_stock,price,active").eq("user_id",st.u.id).eq("active",true).order("name").limit(1000),
      S.from("marc_clients").select("id,name").eq("user_id",st.u.id).order("name").limit(1000)
    ];

    const commerceReport=eco==="business"||eco==="mixed";
    const planCode=normalizePlan(st.planState?.code);
    const canReadCommerceReports=commerceReport&&(isMasterPlan()||planCode!=="free");
    if(canReadCommerceReports){
      requests.push(
        S.from("marc_sales").select("total,status,payment_method,created_at").eq("user_id",st.u.id).order("created_at",{ascending:false}).limit(1000),
        S.from("marc_cash_registers").select("id,status,opening_amount,closing_amount,opened_at,closed_at").eq("user_id",st.u.id).order("opened_at",{ascending:false}).limit(100)
      );
    }

    const results=await Promise.all(requests);
    const quotes=results[0],inventory=results[1],clients=results[2];
    const sales=canReadCommerceReports?results[3]:null;
    const cash=canReadCommerceReports?results[4]:null;

    const err=[quotes,inventory,clients,sales,cash].find(r=>r?.error);
    if(err){
      const message=err.error?.message||"No se pudieron generar los reportes.";
      const body=$("#reportsBody");
      if(body)body.innerHTML='<section class="card report-error-state"><div class="panel-eyebrow">DIAGNÓSTICO</div><h3>No se pudieron cargar los reportes</h3><p>'+esc(message)+'</p><button id="reportsRetryError" class="secondary">↻ Reintentar</button></section>';
      $("#reportsRetryError")?.addEventListener("click",load);
      return toast(message,"err");
    }

    const qr=quotes.data||[],iv=inventory.data||[],cl=clients.data||[];
    const sr=sales?.data||[],cr=cash?.data||[];
    const now=new Date(),monthStart=new Date(now.getFullYear(),now.getMonth(),1);
    const monthSales=sr.filter(x=>new Date(x.created_at)>=monthStart);
    const quotesActive=qr.filter(x=>["BORRADOR","ENVIADA","ACEPTADA"].includes(String(x.status||"").toUpperCase()));
    const quotesTotal=qr.filter(x=>new Date(x.created_at)>=monthStart&&!["RECHAZADA","ANULADA"].includes(String(x.status||"").toUpperCase())).reduce((n,x)=>n+Number(x.total||0),0);
    const salesTotal=monthSales.reduce((n,x)=>n+Number(x.total||0),0);
    const low=iv.filter(x=>Number(x.stock)<=Number(x.min_stock));
    const mix={};
    monthSales.forEach(x=>{const k=String(x.payment_method||"OTRO").toUpperCase();mix[k]=(mix[k]||0)+Number(x.total||0)});
    const fmt=v=>money(v);
    const mixHtml=Object.entries(mix).sort((a,b)=>b[1]-a[1]).map(([k,v])=>'<div class="report-line"><span>'+esc(k)+'</span><b>'+fmt(v)+'</b></div>').join("")||'<div class="empty">Sin ventas este mes.</div>';
    const lowHtml=low.slice(0,12).map(x=>'<div class="report-line"><span>'+esc(x.name)+'</span><b>'+Number(x.stock||0)+' u.</b></div>').join("")||'<div class="empty">No hay materiales con stock bajo.</div>';

    let stats;
    if(commerceReport){
      stats='<div class="stats-grid">'+
        '<article class="stat-card"><small>Ventas del mes</small><strong>'+fmt(salesTotal)+'</strong><span>'+monthSales.length+' operaciones</span></article>'+
        '<article class="stat-card"><small>Cotizaciones activas</small><strong>'+fmt(quotesTotal)+'</strong><span>'+quotesActive.length+' propuestas</span></article>'+
        '<article class="stat-card"><small>Clientes</small><strong>'+cl.length+'</strong><span>Registrados</span></article>'+
        '<article class="stat-card"><small>Stock bajo</small><strong>'+low.length+'</strong><span>Productos a revisar</span></article>'+
        '</div>';
    }else{
      stats='<div class="stats-grid">'+
        '<article class="stat-card"><small>Cotizaciones del mes</small><strong>'+fmt(quotesTotal)+'</strong><span>'+quotesActive.length+' activas</span></article>'+
        '<article class="stat-card"><small>Clientes</small><strong>'+cl.length+'</strong><span>Registrados</span></article>'+
        '<article class="stat-card"><small>Materiales activos</small><strong>'+iv.length+'</strong><span>En inventario</span></article>'+
        '<article class="stat-card"><small>Stock bajo</small><strong>'+low.length+'</strong><span>Materiales a revisar</span></article>'+
        '</div>';
    }

    const sections=
      '<div class="dashboard-main-grid">'+
        (commerceReport?'<section class="dashboard-panel"><div class="panel-title-row"><div><div class="panel-eyebrow">COBROS</div><h3>Ventas por medio de pago</h3></div></div>'+mixHtml+'</section>': '<section class="dashboard-panel"><div class="panel-title-row"><div><div class="panel-eyebrow">OPERACIÓN TÉCNICA</div><h3>Estado del inventario</h3></div></div>'+lowHtml+'</section>')+
        '<section class="dashboard-panel"><div class="panel-title-row"><div><div class="panel-eyebrow">MATERIALES</div><h3>Stock bajo</h3></div></div>'+lowHtml+'</section>'+
      '</div>'+
      (commerceReport?'<section class="card" style="margin-top:14px"><div class="card-head"><div><b>Resumen de caja</b><small>'+cr.filter(x=>x.status==="CLOSED").length+' cierres registrados</small></div></div><div class="report-line"><span>Cajas abiertas</span><b>'+cr.filter(x=>x.status==="OPEN").length+'</b></div><div class="report-line"><span>Cajas cerradas</span><b>'+cr.filter(x=>x.status==="CLOSED").length+'</b></div></section>':'<section class="card" style="margin-top:14px"><div class="card-head"><div><b>Resumen técnico disponible</b><small>El plan gratuito muestra únicamente datos permitidos para este ecosistema.</small></div></div><div class="report-line"><span>Cotizaciones</span><b>'+qr.length+'</b></div><div class="report-line"><span>Clientes</span><b>'+cl.length+'</b></div><div class="report-line"><span>Materiales activos</span><b>'+iv.length+'</b></div></section>');

    $("#reportsBody").innerHTML=stats+sections;
  };
  $("#reportsRefresh").onclick=load;
  await load();
}
async function view(x){
  const paidFeaturesByEcosystem={
    technician:{service_orders:"Órdenes de trabajo",agenda:"Agenda técnica",assets:"Equipos y activos",maintenance:"Mantenimientos",contracts:"Contratos",finances:"Rentabilidad"},
    business:{suppliers:"Proveedores",purchases:"Compras",receivables:"Créditos y cobros"},
    mixed:{service_orders:"Órdenes de trabajo",assets:"Equipos y activos",maintenance:"Mantenimientos",suppliers:"Proveedores",purchases:"Compras",receivables:"Créditos y cobros",contracts:"Contratos",finances:"Rentabilidad"}
  };
  const paidFeature=paidFeaturesByEcosystem[currentEcosystem()]?.[x];
  if(paidFeature && !isMasterPlan()){
    const plan=await getPlanState(true);
    if(normalizePlan(plan.code)==="free"){
      openUpgradeModal("🔒 "+paidFeature+" es una función del plan de pago. Actualiza tu plan para desbloquearla.");
      return;
    }
  }
  if(!ecosystemAllows(x)&&x!=="home"){
    toast("Esta sección pertenece a otro ecosistema.","err");
    return view("home");
  }
  if(__viewBusy&&st.view===x)return;
  const content=$("#content");
  const run=async()=>{
    st.view=x;title(x);$("#sidebar").classList.remove("open");document.body.style.overflow="";
    if(window.innerWidth<=780)window.scrollTo(0,0);
    $$(".sidebar nav button,.mobile-bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===x));
    if(x==="home")return currentEcosystem()==="technician"?technicianDashboard():home();if(x==="clients")return clients();if(x==="inventory")return inventory();
    if(x==="suppliers"){if(window.marcSupplierCenter)return window.marcSupplierCenter();return toast("No se pudo cargar el Centro de Proveedores. Recarga la aplicación.","err");}
    if(x==="quotes")return quotes();if(x==="saas_admin")return saasAdmin();if(x==="service_orders")return serviceOrders();if(x==="agenda")return agenda();if(x==="finances")return finances();if(x==="cash")return cash();if(x==="sales")return sales();if(x==="assets")return assets();if(x==="contracts")return contracts();if(x==="maintenance")return maintenance();if(x==="technical_reports")return technicalReports();
    if(["purchases","receivables"].includes(x))return moduleHub(x);if(x==="reports")return reports();
    return settings();
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
async function businessDashboard(){
  const c=$("#content"); if(!c)return;
  const [iv,sa,cl,qt,cr]=await Promise.all([
    S.from("marc_inventory").select("id,name,price,cost,stock,min_stock,active").eq("user_id",st.u.id).eq("active",true).order("name").limit(1000),
    S.from("marc_sales").select("id,number,total,payment_method,status,created_at").eq("user_id",st.u.id).order("created_at",{ascending:false}).limit(200),
    S.from("marc_clients").select("id,name,phone").eq("user_id",st.u.id).order("name").limit(1000),
    S.from("marc_quotes").select("id,number,title,total,status,created_at").eq("user_id",st.u.id).is("deleted_at",null).order("created_at",{ascending:false}).limit(100),
    S.from("marc_cash_registers").select("id,status,opening_amount,opened_at").eq("user_id",st.u.id).eq("status","OPEN").order("opened_at",{ascending:false}).limit(1).maybeSingle()
  ]);
  const inventory=iv.data||[],sales=sa.data||[],clients=cl.data||[],quotes=qt.data||[],cashOpen=cr.data;
  const today=new Date().toDateString();
  const salesToday=sales.filter(x=>new Date(x.created_at).toDateString()===today);
  const salesTodayAmount=salesToday.reduce((n,x)=>n+Number(x.total||0),0);
  const monthStart=new Date(new Date().getFullYear(),new Date().getMonth(),1);
  const monthSales=sales.filter(x=>new Date(x.created_at)>=monthStart);
  const monthAmount=monthSales.reduce((n,x)=>n+Number(x.total||0),0);
  const low=inventory.filter(x=>Number(x.stock)<=Number(x.min_stock));
  const stockUnits=inventory.reduce((n,x)=>n+Number(x.stock||0),0);
  const quotePending=quotes.filter(x=>["BORRADOR","ENVIADA"].includes(String(x.status||"").toUpperCase())).length;
  const paymentMix={EFECTIVO:0,YAPE:0,PLIN:0,TARJETA:0,TRANSFERENCIA:0,CREDITO:0};
  monthSales.forEach(x=>{const k=String(x.payment_method||"OTRO").toUpperCase();paymentMix[k]=(paymentMix[k]||0)+Number(x.total||0)});
  c.innerHTML=`
    <div class="business-dashboard">
      <section class="business-hero">
        <div class="business-hero-copy">
          <div class="business-eyebrow">M.A.R.C. · TIENDA / NEGOCIO</div>
          <h1>Tu tienda.<br><span>Tus ventas bajo control.</span></h1>
          <p>Una vista comercial pensada para vender rápido, controlar stock y saber cuánto movimiento tiene tu negocio.</p>
          <div class="business-actions">
            <button id="businessNewSale" class="business-primary">＋ Nueva venta</button>
            <button id="businessNewProduct" class="business-secondary">＋ Producto</button>
            <button id="businessOpenCash" class="business-secondary">▣ ${cashOpen?"Caja abierta":"Abrir caja"}</button>
          </div>
        </div>
        <div class="business-hero-orbit"><div class="business-receipt"><span>VENTA DE HOY</span><b>${money(salesTodayAmount)}</b><small>${salesToday.length} operaciones</small><i></i><em>Stock · ${stockUnits} u.</em></div></div>
      </section>
      <section class="business-kpis">
        <article><span>VENTAS HOY</span><strong>${money(salesTodayAmount)}</strong><small>${salesToday.length} operaciones</small></article>
        <article><span>VENTAS DEL MES</span><strong>${money(monthAmount)}</strong><small>${monthSales.length} ventas registradas</small></article>
        <article><span>PRODUCTOS</span><strong>${inventory.length}</strong><small>${low.length} con stock bajo</small></article>
        <article><span>CLIENTES</span><strong>${clients.length}</strong><small>Base comercial</small></article>
      </section>
      <section class="business-grid">
        <article class="business-panel business-actions-panel">
          <div class="business-panel-head"><div><span>OPERACIÓN</span><h2>Lo que haces más</h2></div><b>TIENDA</b></div>
          <div class="business-action-grid">
            <button data-business-view="sales"><span>🛒</span><div><b>Vender</b><small>POS y cobro rápido</small></div><i>→</i></button>
            <button data-business-view="inventory"><span>📦</span><div><b>Controlar stock</b><small>Productos y existencias</small></div><i>→</i></button>
            <button data-business-view="clients"><span>👥</span><div><b>Clientes</b><small>Historial y crédito</small></div><i>→</i></button>
            <button data-business-view="quotes"><span>🧾</span><div><b>Cotizar</b><small>Propuesta → venta</small></div><i>→</i></button>
          </div>
        </article>
        <article class="business-panel business-alerts">
          <div class="business-panel-head"><div><span>ATENCIÓN</span><h2>Lo que requiere acción</h2></div><b>${low.length}</b></div>
          ${low.slice(0,5).map(x=>'<div class="business-alert-row"><i></i><div><b>'+esc(x.name)+'</b><small>Stock '+Number(x.stock||0)+' · mínimo '+Number(x.min_stock||0)+'</small></div><button data-business-view="inventory">Ver</button></div>').join("")||'<div class="business-empty">✓ Inventario sin alertas críticas.</div>'}
        </article>
      </section>
      <section class="business-grid lower">
        <article class="business-panel">
          <div class="business-panel-head"><div><span>VENTAS RECIENTES</span><h2>Movimiento comercial</h2></div><button data-business-view="sales">Ver todo →</button></div>
          <div class="business-sales-list">
            ${sales.slice(0,6).map(x=>'<div><span class="business-sale-icon">↗</span><div><b>'+esc(x.number||"Venta")+'</b><small>'+new Date(x.created_at).toLocaleString("es-PE",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})+' · '+esc(x.payment_method||"Pago")+'</small></div><strong>'+money(x.total)+'</strong></div>').join("")||'<div class="business-empty">Todavía no hay ventas.</div>'}
          </div>
        </article>
        <article class="business-panel business-mix">
          <div class="business-panel-head"><div><span>PAGOS · ESTE MES</span><h2>Cómo entra el dinero</h2></div></div>
          <div class="business-payment-list">
            ${Object.entries(paymentMix).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>'<div><span>'+esc(k)+'</span><b>'+money(v)+'</b><i><em style="width:'+Math.min(100,Math.round(v/Math.max(1,monthAmount)*100))+'%"></em></i></div>').join("")||'<div class="business-empty">Aún no hay pagos del mes.</div>'}
          </div>
          <div class="business-mini-stats"><span><b>${quotePending}</b>Cotizaciones abiertas</span><span><b>${cashOpen?"ABIERTA":"CERRADA"}</b>Caja</span></div>
        </article>
      </section>
    </div>`;
  $("#businessNewSale").onclick=()=>view("cash");
  $("#businessNewProduct").onclick=()=>{view("inventory");setTimeout(()=>$("#new")?.click(),320)};
  $("#businessOpenCash").onclick=()=>view("cash");
  c.querySelectorAll("[data-business-view]").forEach(b=>b.onclick=()=>view(b.dataset.businessView));
}

async function mixedDashboard(){
  const c=$("#content"); if(!c)return;
  const [iv,sa,cl,qt,so,cr]=await Promise.all([
    S.from("marc_inventory").select("id,name,stock,min_stock,price").eq("user_id",st.u.id).eq("active",true).limit(1000),
    S.from("marc_sales").select("id,total,status,created_at").eq("user_id",st.u.id).order("created_at",{ascending:false}).limit(200),
    S.from("marc_clients").select("id,name").eq("user_id",st.u.id).limit(1000),
    S.from("marc_quotes").select("id,total,status,created_at").eq("user_id",st.u.id).is("deleted_at",null).limit(200),
    S.from("marc_service_orders").select("id,number,title,status,revenue,profit,created_at").eq("user_id",st.u.id).order("created_at",{ascending:false}).limit(300),
    S.from("marc_cash_registers").select("id,status,opening_amount,opened_at").eq("user_id",st.u.id).eq("status","OPEN").order("opened_at",{ascending:false}).limit(1).maybeSingle()
  ]);
  const inventory=iv.data||[],sales=sa.data||[],clients=cl.data||[],quotes=qt.data||[],orders=so.data||[],cashOpen=cr.data;
  const monthStart=new Date(new Date().getFullYear(),new Date().getMonth(),1);
  const monthSales=sales.filter(x=>new Date(x.created_at)>=monthStart);
  const salesValue=monthSales.reduce((n,x)=>n+Number(x.total||0),0);
  const serviceValue=orders.filter(x=>new Date(x.created_at)>=monthStart).reduce((n,x)=>n+Number(x.revenue||0),0);
  const serviceProfit=orders.filter(x=>new Date(x.created_at)>=monthStart).reduce((n,x)=>n+Number(x.profit||0),0);
  const activeOrders=orders.filter(x=>!["ENTREGADA","CANCELADA"].includes(String(x.status||"").toUpperCase()));
  const low=inventory.filter(x=>Number(x.stock)<=Number(x.min_stock));
  const openQuotes=quotes.filter(x=>["BORRADOR","ENVIADA","ACEPTADA"].includes(String(x.status||"").toUpperCase()));
  const combined=salesValue+serviceValue;
  c.innerHTML=`
    <div class="mixed-dashboard">
      <section class="mixed-hero mixed-premium-hero">
        <div class="mixed-premium-hero-copy">
          <div class="mixed-eyebrow"><span class="premium-live-dot"></span> M.A.R.C. · BUSINESS OPERATING SYSTEM</div>
          <h1>Tu negocio.<br><span>Una sola inteligencia operativa.</span></h1>
          <p>Ventas, servicios, inventario, caja y clientes conectados en una misma operación.</p>
          <div class="mixed-hero-actions">
            <button id="mixedNewSale">＋ Nueva venta</button>
            <button id="mixedNewOT">＋ Nueva orden</button>
            <button id="mixedQuote">＋ Cotización</button>
          </div>
        </div>
        <div class="mixed-command-card mixed-premium-command">
          <div class="command-head"><span>BUSINESS PULSE</span><b>● ACTIVO</b></div>
          <strong>${money(combined)}</strong>
          <small>Valor generado este mes</small>
          <div class="command-metrics"><span><b>${money(salesValue)}</b>ventas</span><span><b>${money(serviceValue)}</b>servicios</span></div>
          <div class="command-footer"><span>Utilidad técnica</span><b>${money(serviceProfit)}</b></div>
          <i></i>
        </div>
      </section>
      <section class="mixed-kpis">
        <article><span>VENTAS</span><strong>${money(salesValue)}</strong><small>Este mes</small></article>
        <article><span>SERVICIOS</span><strong>${money(serviceValue)}</strong><small>Facturación técnica</small></article>
        <article><span>ÓRDENES ACTIVAS</span><strong>${activeOrders.length}</strong><small>Operación en curso</small></article>
        <article><span>CLIENTES</span><strong>${clients.length}</strong><small>Relación comercial</small></article>
      </section>
      <section class="mixed-access-panel">
        <div class="mixed-access-head">
          <div>
            <span>ACCESOS PRINCIPALES</span>
            <h2>Todo lo que necesitas, en un solo lugar.</h2>
          </div>
          <button type="button" class="mixed-access-all" data-mixed-open-modules>Ver todos los módulos <b>⌘</b></button>
        </div>
        <div class="mixed-access-grid">
          <button type="button" data-mixed-view="cash"><span class="access-icon green">▣</span><b>Caja</b><small>Ventas y pagos</small><i>→</i></button>
          <button type="button" data-mixed-view="sales"><span class="access-icon blue">🛒</span><b>Ventas</b><small>Productos y clientes</small><i>→</i></button>
          <button type="button" data-mixed-view="service_orders"><span class="access-icon cyan">🛠</span><b>Servicios</b><small>Órdenes y trabajos</small><i>→</i></button>
          <button type="button" data-mixed-view="inventory"><span class="access-icon orange">▦</span><b>Inventario</b><small>Stock y materiales</small><i>→</i></button>
          <button type="button" data-mixed-view="clients"><span class="access-icon violet">👥</span><b>Clientes</b><small>Historial y crédito</small><i>→</i></button>
          <button type="button" data-mixed-view="finances"><span class="access-icon pink">▥</span><b>Finanzas</b><small>Resultados y control</small><i>→</i></button>
        </div>
      </section>
      <section class="mixed-executive-strip">
        <div><span>ESTADO DE OPERACIÓN</span><b><i></i> Sistema operativo</b></div>
        <div><span>CAJA</span><strong>${cashOpen?"ABIERTA":"CERRADA"}</strong><small>${cashOpen?"Turno activo":"Sin turno activo"}</small></div>
        <div><span>OPORTUNIDADES</span><strong>${openQuotes.length}</strong><small>Cotizaciones abiertas</small></div>
        <div><span>ATENCIÓN</span><strong>${low.length+activeOrders.length}</strong><small>Elementos requieren revisión</small></div>
        <div><span>CLIENTES</span><strong>${clients.length}</strong><small>Relaciones registradas</small></div>
      </section>
      <section class="mixed-command-grid">
        <article class="mixed-panel mixed-flow">
          <div class="mixed-panel-head"><div><span>FLUJO UNIFICADO</span><h2>Del cliente al resultado</h2></div><b>LIVE</b></div>
          <div class="mixed-flow-steps"><div><i>01</i><b>Cliente</b><small>Contacto e historial</small></div><em>→</em><div><i>02</i><b>Venta / OT</b><small>Comercial o servicio</small></div><em>→</em><div><i>03</i><b>Material</b><small>Inventario y costos</small></div><em>→</em><div><i>04</i><b>Resultado</b><small>Cobro y rentabilidad</small></div></div>
        </article>
        <article class="mixed-panel mixed-focus">
          <div class="mixed-panel-head"><div><span>CENTRO DE ATENCIÓN</span><h2>Decisiones de hoy</h2></div><b>${low.length+activeOrders.length}</b></div>
          <div class="mixed-focus-list">
            <button data-mixed-view="service_orders"><span>🛠</span><div><b>${activeOrders.length} órdenes activas</b><small>Continuar trabajos y entregas</small></div><i>→</i></button>
            <button data-mixed-view="inventory"><span>📦</span><div><b>${low.length} alertas de stock</b><small>Revisar materiales y productos</small></div><i>→</i></button>
            <button data-mixed-view="quotes"><span>🧾</span><div><b>${openQuotes.length} cotizaciones abiertas</b><small>Seguir oportunidades comerciales</small></div><i>→</i></button>
          </div>
        </article>
      </section>
      <section class="mixed-bottom-grid">
        <article class="mixed-panel">
          <div class="mixed-panel-head"><div><span>OPERACIÓN RECIENTE</span><h2>Últimos movimientos</h2></div><button data-mixed-view="reports">Centro de reportes →</button></div>
          <div class="mixed-timeline">
            ${[...sales.slice(0,4).map(x=>({date:x.created_at,title:"Venta registrada",detail:money(x.total),icon:"↗",view:"sales"})),...orders.slice(0,4).map(x=>({date:x.created_at,title:x.title||"Orden de trabajo",detail:x.status||"OT",icon:"🛠",view:"service_orders"}))].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,7).map(x=>'<button data-mixed-view="'+x.view+'"><span>'+x.icon+'</span><div><b>'+esc(x.title)+'</b><small>'+new Date(x.date).toLocaleString("es-PE",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})+'</small></div><strong>'+esc(x.detail)+'</strong></button>').join("")||'<div class="mixed-empty">No hay actividad reciente.</div>'}
          </div>
        </article>
        <article class="mixed-panel mixed-stack">
          <div><span>CONTROL EMPRESARIAL</span><h2>Todo en una vista</h2></div>
          <div class="mixed-stack-row"><b>Inventario</b><span>${inventory.length} productos · ${low.length} alertas</span></div>
          <div class="mixed-stack-row"><b>Caja</b><span>${cashOpen?"Operativa":"Cerrada"}</span></div>
          <div class="mixed-stack-row"><b>Clientes</b><span>${clients.length} registrados</span></div>
          <div class="mixed-stack-row"><b>Rentabilidad técnica</b><span>${money(serviceProfit)} este mes</span></div>
        </article>
      </section>
    </div>`;
  $("#mixedNewSale").onclick=()=>view("cash");
  $("#mixedNewOT").onclick=()=>serviceOrderModal();
  $("#mixedQuote").onclick=()=>quoteModal();
  c.querySelectorAll("[data-mixed-view]").forEach(b=>b.onclick=()=>view(b.dataset.mixedView));
  c.querySelector("[data-mixed-open-modules]")?.addEventListener("click",()=>{
    document.querySelector("#marcImmersiveModules")?.click();
  });
}

async function home(){
  const ecosystem=currentEcosystem();
  if(ecosystem==="business")return businessDashboard();
  if(ecosystem==="mixed")return mixedDashboard();
  return technicianDashboard();
}

async function legacyHome(){
  const c=$("#content");
  const [cl,iv,qt,so]=await Promise.all([
    S.from("marc_clients").select("*",{count:"exact"}).eq("user_id",st.u.id),
    S.from("marc_inventory").select("*").eq("user_id",st.u.id).eq("active",true).order("name"),
    S.from("marc_quotes").select("*").eq("user_id",st.u.id).is("deleted_at",null).order("created_at",{ascending:false}).limit(120),
    S.from("marc_service_orders").select("*").eq("user_id",st.u.id).order("created_at",{ascending:false}).limit(500)
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
  const otProfit=serviceOrdersData.reduce((sum,r)=>sum+Number(r.profit??(Number(r.revenue??0)-Number(r.labor_cost??0)-Number(r.transport_cost??0)-Number(r.materials_cost??0)-Number(r.other_cost??0))),0);
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
          <div class="hero-visual-logo is-marc-brand" id="heroBrandLogo" aria-label="M.A.R.C."><span>M</span><b>A.R.C.</b></div>
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

function quoteModal(){
  view("quotes");
  setTimeout(()=>{
    const b=$("#new");
    if(b)b.click();
  },320);
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
      '<label>Teléfono<input name="phone" value="'+esc(existing?.phone||"")+'" placeholder="+51 999 999 999"></label><label>Teléfono secundario<input name="secondary_phone" value="'+esc(existing?.secondary_phone||"")+'" placeholder="Contacto alternativo"></label><label>Rol del contacto<input name="contact_role" value="'+esc(existing?.contact_role||"")+'" placeholder="Administrador, propietario, encargado…"></label>'+
      '<label>Correo<input type="email" name="email" value="'+esc(existing?.email||"")+'" placeholder="cliente@correo.com"></label>'+
      '<label>Dirección<input name="address" value="'+esc(existing?.address||"")+'" placeholder="Dirección"></label><label>Razón social<input name="tax_name" value="'+esc(existing?.tax_name||"")+'" placeholder="Para documentos"></label><label>Dirección fiscal<input name="tax_address" value="'+esc(existing?.tax_address||"")+'" placeholder="Dirección fiscal"></label><label>Canal preferido<select name="preferred_channel"><option value="WHATSAPP">WhatsApp</option><option value="LLAMADA">Llamada</option><option value="EMAIL">Correo</option><option value="OTRO">Otro</option></select></label>'+
      '<label style="grid-column:1/-1">Notas y condiciones<textarea name="notes" rows="4" placeholder="Condiciones, preferencias, acuerdos…">'+esc(existing?.notes||"")+'</textarea></label><label style="grid-column:1/-1">Notas técnicas del cliente<textarea name="service_notes" rows="3" placeholder="Accesos, equipos instalados, restricciones, datos útiles para técnicos…">'+esc(existing?.service_notes||"")+'</textarea></label>'+
      '<div class="modal-actions" style="grid-column:1/-1"><button type="button" class="secondary" id="clientCancel">Cancelar</button><button type="submit" class="primary" id="clientSave">'+(isEdit?"Guardar cambios":"Crear cliente")+'</button></div>'+
    '</form>'
  );
  $("#clientForm [name=preferred_channel]").value=existing?.preferred_channel||"WHATSAPP";
  $("#clientClose").onclick=close;
  $("#clientCancel").onclick=close;
  $("#clientForm").onsubmit=async e=>{
    e.preventDefault();
    const b=$("#clientSave");b.disabled=true;
    try{
      const d=new FormData(e.currentTarget);
      const payload={name:String(d.get("name")||"").trim(),contact_name:String(d.get("contact_name")||"").trim()||null,document_number:String(d.get("document_number")||"").trim()||null,phone:String(d.get("phone")||"").trim()||null,email:String(d.get("email")||"").trim()||null,address:String(d.get("address")||"").trim()||null,secondary_phone:String(d.get("secondary_phone")||"").trim()||null,contact_role:String(d.get("contact_role")||"").trim()||null,tax_name:String(d.get("tax_name")||"").trim()||null,tax_address:String(d.get("tax_address")||"").trim()||null,preferred_channel:String(d.get("preferred_channel")||"WHATSAPP"),service_notes:String(d.get("service_notes")||"").trim()||null,notes:String(d.get("notes")||"").trim()||null,updated_at:new Date().toISOString()};
      if(!payload.name)throw new Error("Escribe el nombre del cliente.");
      let result;
      if(isEdit)result=await S.from("marc_clients").update(payload).eq("id",existing.id).eq("user_id",st.u.id);
      else result=await S.from("marc_clients").insert({...payload,user_id:st.u.id});
      if(result.error)throw result.error;
      close();toast(isEdit?"Cliente actualizado":"Cliente creado","ok");await clients();
    }catch(err){toast(err.message||"No se pudo guardar el cliente.","err");b.disabled=false}
  };
}

async function inventoryModal(existing=null){
  const isEdit=Boolean(existing?.id);
  if(!isEdit && !(await requirePlan("Inventario","inventory")))return;
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
    }catch(err){if(String(err?.message||"").includes("MARC_PLAN_LIMIT_INVENTORY")){close();openUpgradeModal("El plan Gratis permite hasta 50 productos activos.");}else{toast(err.message||"No se pudo guardar el producto.","err")}b.disabled=false}
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


async function agenda(){
 const [a,p,o,cres]=await Promise.all([
  S.from("marc_appointments").select("*,marc_clients(name)").eq("user_id",st.u.id).order("start_at",{ascending:true}).limit(200),
  S.from("marc_maintenance_plans").select("*,marc_clients(name)").eq("user_id",st.u.id).eq("active",true).order("next_due_at",{ascending:true}),
  S.from("marc_maintenance_occurrences").select("*,marc_maintenance_plans(title)").eq("user_id",st.u.id).order("scheduled_at",{ascending:true}).limit(100),
  S.from("marc_clients").select("id,name").eq("user_id",st.u.id).order("name")
 ]);
 const err=a.error||p.error||o.error||cres.error;if(err)return toast(err.message,"err");
 const appointments=a.data||[],plans=p.data||[],occurrences=o.data||[],clients=cres.data||[],now=Date.now();
 const upcoming=appointments.filter(x=>new Date(x.start_at).getTime()>=now&&x.status!=="CANCELADA").slice(0,20);
 const due=plans.filter(x=>new Date(x.next_due_at).getTime()<=now+30*86400000);
 const fmt=d=>new Date(d).toLocaleString("es-PE",{dateStyle:"medium",timeStyle:"short"});
 const apRows=upcoming.map(x=>'<article><div><b>'+esc(x.title)+'</b><span>'+esc(x.status)+'</span></div><p>'+esc(x.marc_clients?.name||"Sin cliente")+' · '+esc(x.location||"Sin ubicación")+'</p><small>'+esc(fmt(x.start_at))+(x.technician?" · "+esc(x.technician):"")+'</small><div class="modal-actions"><button class="secondary" data-agenda-edit="'+x.id+'">Editar</button><button class="secondary" data-agenda-cancel="'+x.id+'">Cancelar</button></div></article>').join("")||'<div class="empty">No hay citas próximas.</div>';
 const mtRows=plans.slice(0,20).map(x=>'<article><div><b>'+esc(x.title)+'</b><span>'+(new Date(x.next_due_at).getTime()<now?"VENCIDO":"PROGRAMADO")+'</span></div><p>'+esc(x.marc_clients?.name||"Sin cliente")+' · cada '+x.interval_months+' meses</p><small>Próximo: '+esc(fmt(x.next_due_at))+(x.technician?" · "+esc(x.technician):"")+'</small><div class="modal-actions"><button class="secondary" data-maint-complete="'+x.id+'">Marcar realizado</button></div></article>').join("")||'<div class="empty">No hay mantenimientos recurrentes.</div>';
 const mobileAppointments=upcoming.map(x=>'<article class="agenda-mobile-item"><div class="agenda-mobile-item-top"><b>'+esc(x.title)+'</b><span class="agenda-mobile-pill">'+esc(x.status)+'</span></div><p>'+esc(x.marc_clients?.name||"Sin cliente")+' · '+esc(x.location||"Sin ubicación")+'</p><small>'+esc(fmt(x.start_at))+(x.technician?" · Técnico: "+esc(x.technician):"")+'</small><div class="agenda-mobile-actions"><button class="secondary" data-agenda-edit="'+x.id+'">Editar cita</button><button class="secondary" data-agenda-cancel="'+x.id+'">Cancelar</button></div></article>').join("")||'<div class="empty">No hay citas próximas.</div>';
 const mobileMaintenance=plans.slice(0,20).map(x=>'<article class="agenda-mobile-item '+(new Date(x.next_due_at).getTime()<now?"agenda-mobile-due":"")+'"><div class="agenda-mobile-item-top"><b>'+esc(x.title)+'</b><span class="agenda-mobile-pill">'+(new Date(x.next_due_at).getTime()<now?"VENCIDO":"PROGRAMADO")+'</span></div><p>'+esc(x.marc_clients?.name||"Sin cliente")+' · cada '+x.interval_months+' meses</p><small>Próximo: '+esc(fmt(x.next_due_at))+(x.technician?" · Técnico: "+esc(x.technician):"")+'</small><div class="agenda-mobile-actions"><button class="primary full" data-maint-complete="'+x.id+'">✓ Marcar realizado</button></div></article>').join("")||'<div class="empty">No hay mantenimientos recurrentes.</div>';
 const ocRows=occurrences.slice(0,50).map(x=>'<tr><td>'+esc(fmt(x.scheduled_at))+'</td><td>'+esc(x.marc_maintenance_plans?.title||"Mantenimiento")+'</td><td><span class="status-pill">'+esc(x.status)+'</span></td><td>'+esc(x.service_order_id||"—")+'</td></tr>').join("")||'<tr><td colspan="4" class="empty">Sin ocurrencias registradas.</td></tr>';
 const c=$("#content");
 c.innerHTML='<div class="head"><div><div class="eyebrow2">OPERACIONES</div><h1>Agenda técnica.</h1><p>Citas, visitas técnicas y mantenimiento recurrente en un solo lugar.</p></div><div class="head-actions"><button id="newMaintenancePlan" class="secondary">＋ Mantenimiento recurrente</button><button id="newAppointment" class="primary">＋ Nueva cita</button></div></div>'+
 '<section class="client-summary"><div><span>PRÓXIMAS CITAS</span><strong>'+upcoming.length+'</strong><small>Visitas programadas</small></div><div><span>MANTENIMIENTOS</span><strong>'+plans.length+'</strong><small>Planes activos</small></div><div><span>POR VENCER</span><strong>'+due.length+'</strong><small>Próximos 30 días</small></div><div><span>HOY</span><strong>'+appointments.filter(x=>new Date(x.start_at).toDateString()===new Date().toDateString()).length+'</strong><small>Agenda del día</small></div></section>'+
 '<div class="dashboard-main-grid"><section class="dashboard-panel"><div class="panel-title-row"><div><div class="panel-eyebrow">AGENDA</div><h3>Próximas citas técnicas</h3></div></div><div class="client-report-list">'+apRows+'</div></section>'+
 '<section class="dashboard-panel"><div class="panel-title-row"><div><div class="panel-eyebrow">MANTENIMIENTO RECURRENTE</div><h3>Próximos mantenimientos</h3></div></div><div class="client-report-list">'+mtRows+'</div></section></div>'+
 '<div class="agenda-mobile-stack"><section class="agenda-mobile-section"><div class="agenda-mobile-section-head"><h3>Próximas citas</h3><small>'+upcoming.length+' programadas</small></div><div class="agenda-mobile-list">'+mobileAppointments+'</div></section><section class="agenda-mobile-section"><div class="agenda-mobile-section-head"><h3>Mantenimiento recurrente</h3><small>'+plans.length+' planes activos</small></div><div class="agenda-mobile-list">'+mobileMaintenance+'</div></section></div>'+
 '<section class="card table agenda-mobile-table"><div class="toolbar"><div><b>Historial de ocurrencias</b><small>Al completar un mantenimiento se crea automáticamente la siguiente fecha.</small></div></div><div class="scroll"><table class="data"><thead><tr><th>Fecha</th><th>Mantenimiento</th><th>Estado</th><th>Orden vinculada</th></tr></thead><tbody>'+ocRows+'</tbody></table></div></section>';
 $("#newAppointment").onclick=()=>appointmentModal();$("#newMaintenancePlan").onclick=()=>maintenancePlanModal();
 c.querySelectorAll("[data-agenda-edit]").forEach(b=>b.onclick=()=>appointmentModal(appointments.find(x=>x.id===b.dataset.agendaEdit)));
 c.querySelectorAll("[data-agenda-cancel]").forEach(b=>b.onclick=async()=>{const r=await S.from("marc_appointments").update({status:"CANCELADA",updated_at:new Date().toISOString()}).eq("id",b.dataset.agendaCancel).eq("user_id",st.u.id);if(r.error)return toast(r.error.message,"err");toast("Cita cancelada","ok");agenda()});
 c.querySelectorAll("[data-maint-complete]").forEach(b=>b.onclick=async()=>{b.disabled=true;const r=await S.rpc("marc_complete_maintenance",{p_occurrence_id:b.dataset.maintComplete});if(r.error){b.disabled=false;return toast(r.error.message,"err")}toast("Mantenimiento completado y siguiente visita programada","ok");agenda()});
}function appointmentModal(existing=null){
 const isEdit=Boolean(existing?.id);
 const close=modal('<div class="modal-head"><div><div class="eyebrow2">AGENDA TÉCNICA</div><h2>'+(isEdit?"Editar cita":"Nueva cita")+'</h2><p>Programa una visita técnica y mantén el historial conectado al cliente.</p></div><button class="close" id="appointmentClose">×</button></div><form id="appointmentForm" class="form-grid"><label>Cliente<select name="client_id"><option value="">Sin cliente</option></select></label><label>Título<input name="title" required value="'+esc(existing?.title||"Visita técnica")+'"></label><label>Inicio<input name="start_at" type="datetime-local" required></label><label>Fin<input name="end_at" type="datetime-local"></label><label>Técnico<input name="technician" value="'+esc(existing?.technician||"")+'"></label><label>Ubicación<input name="location" value="'+esc(existing?.location||"")+'"></label><label>Estado<select name="status"><option>PROGRAMADA</option><option>CONFIRMADA</option><option>EN_CURSO</option><option>COMPLETADA</option><option>CANCELADA</option><option>NO_ASISTIO</option></select></label><label>Recordatorio<select name="reminder_minutes"><option value="15">15 min</option><option value="30">30 min</option><option value="60">1 hora</option><option value="1440">1 día</option></select></label><label style="grid-column:1/-1">Descripción<textarea name="description" rows="3">'+esc(existing?.description||"")+'</textarea></label><div class="modal-actions" style="grid-column:1/-1"><button type="button" class="secondary" id="appointmentCancel">Cancelar</button><button class="primary">Guardar cita</button></div></form>');
 $("#appointmentClose").onclick=close;$("#appointmentCancel").onclick=close;
 const toLocal=v=>v?new Date(v).toISOString().slice(0,16):"";
 $("#appointmentForm [name=start_at]").value=toLocal(existing?.start_at||new Date(Date.now()+3600000));$("#appointmentForm [name=end_at]").value=toLocal(existing?.end_at||"");
 $("#appointmentForm [name=status]").value=existing?.status||"PROGRAMADA";$("#appointmentForm [name=reminder_minutes]").value=String(existing?.reminder_minutes||60);
 S.from("marc_clients").select("id,name").eq("user_id",st.u.id).order("name").then(({data})=>{const sel=$("#appointmentForm [name=client_id]");(data||[]).forEach(x=>{const o=document.createElement("option");o.value=x.id;o.textContent=x.name;o.selected=x.id===existing?.client_id;sel.appendChild(o)})});
 $("#appointmentForm").onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const d=new FormData(e.currentTarget);const startRaw=String(d.get("start_at")||"").trim();if(!startRaw)throw new Error("Indica la fecha y hora de inicio.");const startDate=new Date(startRaw);if(Number.isNaN(startDate.getTime()))throw new Error("La fecha de inicio no es válida.");const endRaw=String(d.get("end_at")||"").trim();const endDate=endRaw?new Date(endRaw):null;if(endDate&&Number.isNaN(endDate.getTime()))throw new Error("La fecha de fin no es válida.");if(endDate&&endDate<startDate)throw new Error("La hora de fin no puede ser anterior al inicio.");const payload={user_id:st.u.id,client_id:String(d.get("client_id")||"")||null,title:String(d.get("title")||"").trim(),description:String(d.get("description")||"").trim()||null,start_at:startDate.toISOString(),end_at:endDate?endDate.toISOString():null,status:String(d.get("status")||"PROGRAMADA"),technician:String(d.get("technician")||"").trim()||null,location:String(d.get("location")||"").trim()||null,reminder_minutes:Number(d.get("reminder_minutes")||60),updated_at:new Date().toISOString()};const r=isEdit?await S.from("marc_appointments").update(payload).eq("id",existing.id).eq("user_id",st.u.id):await S.from("marc_appointments").insert(payload);if(r.error)throw r.error;close();toast(isEdit?"Cita actualizada":"Cita creada","ok");agenda()}catch(err){toast(err.message||"No se pudo guardar la cita","err");b.disabled=false}};
}
async function maintenance(){
 const c=$("#content"); if(!c)return;
 // Mantenimiento no debe desaparecer completo porque un problema puntual
 // de Activos impida cargar los planes e historial. Cargamos cada fuente
 // por separado y hacemos el vínculo con activos en memoria.
 const [p,o,cl]=await Promise.all([
  S.from("marc_maintenance_plans").select("*,marc_clients(name)").eq("user_id",st.u.id).order("next_due_at",{ascending:true}).limit(300),
  S.from("marc_maintenance_occurrences").select("*,marc_maintenance_plans(title,service_type),marc_service_orders(number,status,revenue,profit)").eq("user_id",st.u.id).order("scheduled_at",{ascending:true}).limit(300),
  S.from("marc_clients").select("id,name").eq("user_id",st.u.id).order("name").limit(500)
 ]);
 if(p.error||o.error||cl.error)return toast((p.error||o.error||cl.error).message,"err");
 let assetsRows=[],assetsError=null;
 try{
   const a=await S.from("marc_assets").select("id,name,brand,model,serial_number,status,next_service_at").eq("user_id",st.u.id).neq("status","RETIRADO").order("name").limit(500);
   assetsRows=a.data||[]; assetsError=a.error||null;
 }catch(err){assetsError=err}
 const assetMap=new Map((assetsRows||[]).map(x=>[x.id,x]));
 const plans=(p.data||[]).map(x=>({...x,marc_assets:assetMap.get(x.asset_id)||null}));
 const occurrences=o.data||[], clientsRows=cl.data||[], now=Date.now(), soon=now+30*86400000;
 const due=plans.filter(x=>x.active!==false&&x.next_due_at&&new Date(x.next_due_at).getTime()<=soon);
 const overdue=plans.filter(x=>x.active!==false&&x.next_due_at&&new Date(x.next_due_at).getTime()<now);
 const active=plans.filter(x=>x.active!==false);
 const completed=occurrences.filter(x=>x.status==="COMPLETADA");
 const fmt=d=>d?new Date(d).toLocaleString("es-PE",{dateStyle:"medium",timeStyle:"short"}):"—";
 const status=x=>x.next_due_at?(new Date(x.next_due_at).getTime()<now?"VENCIDO":new Date(x.next_due_at).getTime()<=soon?"PRÓXIMO":"PROGRAMADO"):"SIN FECHA";
 const rows=plans.slice(0,80).map(x=>'<article class="maintenance-card '+(status(x)==="VENCIDO"?"is-overdue":"")+'"><div class="maintenance-card-top"><div><b>'+esc(x.title)+'</b><span>'+esc(x.service_type||"Mantenimiento")+'</span></div><strong>'+esc(status(x))+'</strong></div><p>'+esc(x.marc_clients?.name||"Sin cliente")+' · '+esc(x.marc_assets?[x.marc_assets.name,x.marc_assets.brand,x.marc_assets.model].filter(Boolean).join(" · "):"Equipo no disponible")+(assetsError&&!x.marc_assets?' <small>(Activos temporalmente no disponibles)</small>':"")+'</p><small>Próximo: '+esc(fmt(x.next_due_at))+(x.technician?" · "+esc(x.technician):"")+'</small><div class="maintenance-card-actions"><button class="secondary" data-maint-edit="'+x.id+'">Editar</button><button class="primary" data-maint-run="'+x.id+'">Registrar mantenimiento</button></div></article>').join("")||'<div class="empty">No hay planes de mantenimiento.</div>';
 const hist=occurrences.slice(0,60).map(x=>'<tr><td>'+esc(fmt(x.scheduled_at))+'</td><td>'+esc(x.marc_maintenance_plans?.title||"Mantenimiento")+'</td><td><span class="status-pill">'+esc(x.status)+'</span></td><td>'+esc(x.marc_service_orders?.number||"—")+'</td></tr>').join("")||'<tr><td colspan="4" class="empty">Sin historial todavía.</td></tr>';
 c.innerHTML='<div class="head"><div><div class="eyebrow2">CONTROL TÉCNICO</div><h1>Mantenimientos.</h1><p>Programa, ejecuta y deja trazabilidad de cada mantenimiento por cliente y equipo.</p></div><div class="head-actions"><button id="maintenanceNew" class="primary">＋ Nuevo mantenimiento</button><button id="maintenanceAgenda" class="secondary">Abrir agenda</button></div></div>'+
 '<section class="client-summary"><div><span>PLANES ACTIVOS</span><strong>'+active.length+'</strong><small>Programas recurrentes</small></div><div><span>VENCIDOS</span><strong class="'+(overdue.length?"out":"ok")+'">'+overdue.length+'</strong><small>Requieren atención</small></div><div><span>PRÓXIMOS 30 DÍAS</span><strong>'+due.length+'</strong><small>Visitas programadas</small></div><div><span>REALIZADOS</span><strong>'+completed.length+'</strong><small>Ocurrencias registradas</small></div></section>'+
 '<div class="maintenance-layout"><section class="dashboard-panel"><div class="panel-title-row"><div><div class="panel-eyebrow">PROGRAMACIÓN</div><h3>Planes de mantenimiento</h3></div><input id="maintenanceSearch" class="table-search" placeholder="Buscar cliente, equipo o plan…"></div><div id="maintenanceList" class="maintenance-list">'+rows+'</div></section>'+
 '<section class="dashboard-panel"><div class="panel-title-row"><div><div class="panel-eyebrow">HISTORIAL</div><h3>Ocurrencias recientes</h3></div></div><div class="scroll"><table class="data"><thead><tr><th>Fecha</th><th>Mantenimiento</th><th>Estado</th><th>OT</th></tr></thead><tbody>'+hist+'</tbody></table></div></section></div>';
 $("#maintenanceNew").onclick=()=>maintenancePlanModal();
 $("#maintenanceAgenda").onclick=()=>agenda();
 const list=$("#maintenanceList");
 const filter=()=>{const q=String($("#maintenanceSearch")?.value||"").trim().toLowerCase();list.querySelectorAll("article").forEach(el=>{el.hidden=q&&!el.textContent.toLowerCase().includes(q)})};
 $("#maintenanceSearch")?.addEventListener("input",filter);
 c.querySelectorAll("[data-maint-edit]").forEach(b=>b.onclick=()=>maintenancePlanModal(plans.find(x=>x.id===b.dataset.maintEdit)));
 c.querySelectorAll("[data-maint-run]").forEach(b=>b.onclick=()=>maintenanceExecuteModal(plans.find(x=>x.id===b.dataset.maintRun)));
}
async function maintenanceExecuteModal(plan){
 if(!plan?.id)return;
 const {data:occ,error}=await S.from("marc_maintenance_occurrences").select("*").eq("plan_id",plan.id).eq("user_id",st.u.id).neq("status","COMPLETADA").order("scheduled_at",{ascending:true}).limit(1).maybeSingle();
 if(error)return toast(error.message,"err");
 const close=modal('<div class="modal-head"><div><div class="eyebrow2">EJECUTAR MANTENIMIENTO</div><h2>'+esc(plan.title)+'</h2><p>Abre una OT para ejecutar el trabajo con materiales, fotos, checklist y conformidad, o ciérralo directamente.</p></div><button class="close" id="maintenanceExecClose">×</button></div><div class="card" style="padding:18px"><p style="margin-top:0"><b>'+esc(plan.marc_clients?.name||"Cliente sin asignar")+'</b></p><p style="margin-bottom:6px">'+esc(plan.marc_assets?[plan.marc_assets.name,plan.marc_assets.brand,plan.marc_assets.model].filter(Boolean).join(" · "):"Sin equipo vinculado")+'</p><small>Programado: '+esc(occ?.scheduled_at?new Date(occ.scheduled_at).toLocaleString("es-PE",{dateStyle:"medium",timeStyle:"short"}):"Sin ocurrencia pendiente")+'</small></div><form id="maintenanceExecForm" class="form-grid"><label>Fecha realizada<input name="completed_at" type="datetime-local" required></label><label style="grid-column:1/-1">Notas de ejecución<textarea name="notes" rows="4" placeholder="Qué se revisará o ejecutará…"></textarea></label><div class="modal-actions" style="grid-column:1/-1"><button type="button" class="secondary" id="maintenanceExecCancel">Cerrar</button><button type="button" class="secondary" id="maintenanceCreateOT">🛠 Crear OT y abrir</button><button class="primary">✓ Completar sin OT</button></div></form>');
 $("#maintenanceExecClose").onclick=close;$("#maintenanceExecCancel").onclick=close;
 $("#maintenanceExecForm [name=completed_at]").value=new Date().toISOString().slice(0,16);
 $("#maintenanceCreateOT").onclick=async()=>{
   const b=$("#maintenanceCreateOT");b.disabled=true;
   try{
     if(!occ?.id)throw new Error("No existe una ocurrencia pendiente para este plan.");
     const d=new FormData($("#maintenanceExecForm"));
     const payload={user_id:st.u.id,client_id:plan.client_id||null,asset_id:plan.asset_id||null,title:plan.title||"Mantenimiento",service_type:plan.service_type||"Mantenimiento preventivo",description:"Mantenimiento generado desde el plan recurrente.",location:plan.location||null,scheduled_at:occ.scheduled_at||plan.next_due_at,technician:plan.technician||"",status:"PROGRAMADA",notes:String(d.get("notes")||"").trim()||null,updated_at:new Date().toISOString(),number:"OT-"+Date.now().toString().slice(-8)};
     const q=await S.from("marc_service_orders").insert(payload).select("*").single();
     if(q.error)throw q.error;
     const link=await S.from("marc_maintenance_occurrences").update({service_order_id:q.data.id,notes:String(d.get("notes")||"").trim()||null,updated_at:new Date().toISOString()}).eq("id",occ.id).eq("user_id",st.u.id);
     if(link.error)throw link.error;
     close();serviceOrderModal(q.data);
   }catch(err){toast(err.message||"No se pudo crear la OT.","err");b.disabled=false}
 };
 $("#maintenanceExecForm").onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{
   if(!occ?.id)throw new Error("No existe una ocurrencia pendiente para este plan.");
   const d=new FormData(e.currentTarget);
   const r=await S.rpc("marc_complete_maintenance",{p_occurrence_id:occ.id,p_completed_at:new Date(String(d.get("completed_at"))).toISOString(),p_notes:String(d.get("notes")||"").trim()||null});
   if(r.error)throw r.error;
   close();toast("Mantenimiento completado; próxima visita programada.","ok");maintenance();
 }catch(err){toast(err.message||"No se pudo completar el mantenimiento.","err");b.disabled=false}};
}
function maintenancePlanModal(existing=null){
 const isEdit=Boolean(existing?.id);
 const close=modal('<div class="modal-head"><div><div class="eyebrow2">MANTENIMIENTO RECURRENTE</div><h2>'+(isEdit?"Editar plan":"Nuevo plan")+'</h2><p>Programa automáticamente la siguiente visita después de cada mantenimiento.</p></div><button class="close" id="maintenanceClose">×</button></div><form id="maintenanceForm" class="form-grid"><label>Cliente<select name="client_id"><option value="">Sin cliente</option></select></label><label>Equipo / activo<select name="asset_id"><option value="">Sin equipo vinculado</option></select></label><label>Nombre del plan<input name="title" required value="'+esc(existing?.title||"Mantenimiento preventivo")+'"></label><label>Tipo de servicio<input name="service_type" value="'+esc(existing?.service_type||"")+'" placeholder="CCTV, red, PC, NVR…"></label><label>Intervalo<select name="interval_months"><option value="1">Mensual</option><option value="3">Cada 3 meses</option><option value="6">Cada 6 meses</option><option value="12">Anual</option><option value="24">Cada 2 años</option></select></label><label>Próximo mantenimiento<input name="next_due_at" type="datetime-local" required></label><label>Técnico<input name="technician" value="'+esc(existing?.technician||"")+'"></label><label>Ubicación<input name="location" value="'+esc(existing?.location||"")+'"></label><label style="grid-column:1/-1">Notas<textarea name="notes" rows="3">'+esc(existing?.notes||"")+'</textarea></label><div class="modal-actions" style="grid-column:1/-1"><button type="button" class="secondary" id="maintenanceCancel">Cancelar</button><button class="primary">Guardar plan</button></div></form>');
 $("#maintenanceClose").onclick=close;$("#maintenanceCancel").onclick=close;$("#maintenanceForm [name=interval_months]").value=String(existing?.interval_months||6);
 $("#maintenanceForm [name=next_due_at]").value=existing?.next_due_at?new Date(existing.next_due_at).toISOString().slice(0,16):new Date(Date.now()+7*86400000).toISOString().slice(0,16);
 S.from("marc_clients").select("id,name").eq("user_id",st.u.id).order("name").then(({data})=>{const sel=$("#maintenanceForm [name=client_id]");(data||[]).forEach(x=>{const o=document.createElement("option");o.value=x.id;o.textContent=x.name;o.selected=x.id===existing?.client_id;sel.appendChild(o)})});
 S.from("marc_assets").select("id,name,brand,model,client_id").eq("user_id",st.u.id).neq("status","RETIRADO").order("name").then(({data})=>{const sel=$("#maintenanceForm [name=asset_id]");(data||[]).forEach(x=>{const o=document.createElement("option");o.value=x.id;o.textContent=[x.name,x.brand,x.model].filter(Boolean).join(" · ");o.selected=x.id===existing?.asset_id;sel.appendChild(o)})});
 $("#maintenanceForm").onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const d=new FormData(e.currentTarget);const payload={user_id:st.u.id,client_id:String(d.get("client_id")||"")||null,asset_id:String(d.get("asset_id")||"")||null,title:String(d.get("title")||"").trim(),service_type:String(d.get("service_type")||"").trim()||null,interval_months:Number(d.get("interval_months")||6),next_due_at:new Date(String(d.get("next_due_at"))).toISOString(),technician:String(d.get("technician")||"").trim()||null,location:String(d.get("location")||"").trim()||null,notes:String(d.get("notes")||"").trim()||null,updated_at:new Date().toISOString()};const r=isEdit?await S.from("marc_maintenance_plans").update(payload).eq("id",existing.id).eq("user_id",st.u.id):await S.from("marc_maintenance_plans").insert(payload).select("id").single();if(r.error)throw r.error;if(!isEdit&&r.data?.id){const o=await S.from("marc_maintenance_occurrences").insert({user_id:st.u.id,plan_id:r.data.id,scheduled_at:payload.next_due_at,status:"PROGRAMADA"});if(o.error)throw o.error}close();toast(isEdit?"Plan actualizado":"Mantenimiento recurrente creado","ok");agenda()}catch(err){toast(err.message||"No se pudo guardar el plan","err");b.disabled=false}};
}
async function technicianDashboard(){
  const c=$("#content"); if(!c)return;
  const [ot,maint,clients,inventory]=await Promise.all([
    S.from("marc_service_orders").select("id,status").eq("user_id",st.u.id).limit(300),
    S.from("marc_maintenance_plans").select("id,next_due_at,active").eq("user_id",st.u.id).eq("active",true).limit(100),
    S.from("marc_clients").select("id").eq("user_id",st.u.id).limit(1000),
    S.from("marc_inventory").select("id,stock,min_stock").eq("user_id",st.u.id).eq("active",true).limit(1000)
  ]);
  const orders=ot.data||[],plans=maint.data||[],clientRows=clients.data||[],stock=inventory.data||[];
  const pending=orders.filter(x=>["PENDIENTE","PROGRAMADA","EN_PROCESO"].includes(x.status)).length;
  const due=plans.filter(x=>x.next_due_at&&new Date(x.next_due_at)<=new Date(Date.now()+30*86400000)).length;
  const lowStock=stock.filter(x=>Number(x.stock)<=Number(x.min_stock)).length;
  c.innerHTML='<section class="tech-home tech-home-shell">'+
    '<div class="tech-home-hero"><div><div class="eyebrow2">ECOSISTEMA TÉCNICO</div><h1>Centro de operaciones.</h1><p>Los módulos están organizados arriba por área. Aquí solo tienes el resumen de trabajo.</p></div><button id="newOTQuick" class="primary">＋ Nueva orden</button></div>'+
    '<section class="tech-summary-grid">'+
      '<article><span>ÓRDENES ACTIVAS</span><strong>'+pending+'</strong><small>Trabajos pendientes o en proceso</small><button data-tech-summary="service_orders">Abrir órdenes →</button></article>'+
      '<article><span>MANTENIMIENTOS PRÓXIMOS</span><strong>'+due+'</strong><small>Programados dentro de 30 días</small><button data-tech-summary="maintenance">Ver mantenimientos →</button></article>'+
      '<article><span>CLIENTES</span><strong>'+clientRows.length+'</strong><small>Clientes registrados</small><button data-tech-summary="clients">Abrir clientes →</button></article>'+
      '<article><span>STOCK BAJO</span><strong>'+lowStock+'</strong><small>Materiales en nivel mínimo</small><button data-tech-summary="inventory">Revisar materiales →</button></article>'+
    '</section>'+
    '<section class="tech-home-footer"><div><b>Asistente M.A.R.C.</b><span>Usa Acceso rápido o pregúntame para ir directamente a una función.</span></div><button id="techAskMarc" class="secondary">✦ Preguntar a M.A.R.C.</button></section>'+
    '</section>';
  $("#newOTQuick").onclick=()=>serviceOrderModal();
  $("#techAskMarc").onclick=()=>openChat();
  c.querySelectorAll("[data-tech-summary]").forEach(b=>b.onclick=()=>view(b.dataset.techSummary));
}
async function assets(){
  const c=$("#content"); if(!c)return;
  const [ar,cr]=await Promise.all([
    S.from("marc_assets").select("*,marc_clients(name)").eq("user_id",st.u.id).order("created_at",{ascending:false}),
    S.from("marc_clients").select("id,name").eq("user_id",st.u.id).order("name").limit(1000)
  ]);
  if(ar.error||cr.error)return toast("No se pudieron cargar los equipos y activos.","err");
  const rows=ar.data||[],clientsRows=cr.data||[];
  const active=rows.filter(x=>x.status==="ACTIVO").length;
  const maintenance=rows.filter(x=>x.status==="EN_MANTENIMIENTO").length;
  const now=Date.now(),due=rows.filter(x=>x.next_service_at&&new Date(x.next_service_at).getTime()<=now+30*86400000&&x.status!=="RETIRADO").length;
  const warranty=rows.filter(x=>x.warranty_until&&new Date(x.warranty_until).getTime()>=now&&new Date(x.warranty_until).getTime()<=now+60*86400000).length;
  const fmtDate=v=>v?new Date(v).toLocaleDateString("es-PE"):"—";
  c.innerHTML='<div class="head"><div><div class="eyebrow2">ACTIVOS TÉCNICOS</div><h1>Equipos y activos.</h1><p>Registra cada equipo instalado, su cliente, ubicación, garantía y próximo servicio.</p></div><button id="newAsset" class="primary">＋ Nuevo equipo</button></div>'+
  '<section class="client-summary"><div><span>ACTIVOS</span><strong>'+active+'</strong><small>Equipos operativos</small></div><div><span>EN MANTENIMIENTO</span><strong>'+maintenance+'</strong><small>Atención técnica actual</small></div><div><span>SERVICIO PRÓXIMO</span><strong>'+due+'</strong><small>Dentro de 30 días</small></div><div><span>GARANTÍAS</span><strong>'+warranty+'</strong><small>Vencen en 60 días</small></div></section>'+
  '<section class="card table asset-browser"><div class="toolbar"><div class="search"><input id="assetSearch" placeholder="Buscar equipo, cliente, serie, modelo o ubicación…"></div><button id="assetRefresh" class="secondary">↻ Actualizar</button></div><div class="scroll"><table class="data"><thead><tr><th>Equipo</th><th>Cliente</th><th>Ubicación</th><th>Identificación</th><th>Estado</th><th>Próximo servicio</th><th>Garantía</th><th></th></tr></thead><tbody id="assetRows"></tbody></table></div><div id="assetMobileCards" class="service-mobile-cards"></div></section>';
  const draw=items=>{
    $("#assetRows").innerHTML=items.map(x=>{
      const ident=[x.brand,x.model].filter(Boolean).join(" · ")||"Sin marca/modelo";
      const serial=x.serial_number?("SN: "+x.serial_number):(x.internal_code?("Código: "+x.internal_code):"Sin identificación");
      const overdue=x.next_service_at&&new Date(x.next_service_at)<new Date()&&x.status!=="RETIRADO";
      return '<tr><td><b>'+esc(x.name)+'</b><br><small>'+esc(x.asset_type||"EQUIPO")+'</small></td><td>'+esc(x.marc_clients?.name||"Sin cliente")+'</td><td>'+esc(x.location||"—")+'</td><td>'+esc(ident)+'<br><small>'+esc(serial)+'</small></td><td><span class="status-pill">'+esc(x.status||"ACTIVO")+'</span></td><td class="'+(overdue?"out":"")+'">'+fmtDate(x.next_service_at)+(overdue?" · VENCIDO":"")+'</td><td>'+fmtDate(x.warranty_until)+'</td><td><button class="secondary" data-asset="'+x.id+'">Abrir</button></td></tr>';
    }).join("")||'<tr><td colspan="8" class="empty">No hay equipos registrados todavía.</td></tr>';
    $("#assetMobileCards").innerHTML=items.map(x=>'<article class="service-mobile-card"><div class="service-mobile-top"><div class="service-mobile-title"><b>'+esc(x.name)+'</b><small>'+esc([x.brand,x.model].filter(Boolean).join(" · ")||"Sin marca/modelo")+'</small></div><span class="service-mobile-status">'+esc(x.status||"ACTIVO")+'</span></div><div class="service-mobile-client">👤 '+esc(x.marc_clients?.name||"Sin cliente")+(x.location?" · 📍 "+esc(x.location):"")+'</div><div class="service-mobile-grid"><div class="service-mobile-metric"><span>Serie</span><b>'+esc(x.serial_number||"—")+'</b></div><div class="service-mobile-metric"><span>Próximo</span><b>'+fmtDate(x.next_service_at)+'</b></div><div class="service-mobile-metric"><span>Garantía</span><b>'+fmtDate(x.warranty_until)+'</b></div><div class="service-mobile-metric"><span>Tipo</span><b>'+esc(x.asset_type||"Equipo")+'</b></div></div><button class="primary full" data-asset="'+x.id+'">Abrir ficha técnica</button></article>').join("")||'<div class="empty">No hay equipos registrados todavía.</div>';
  };
  draw(rows);
  $("#assetSearch").oninput=e=>{
    const q=e.target.value.toLowerCase();
    draw(rows.filter(x=>[x.name,x.asset_type,x.brand,x.model,x.serial_number,x.internal_code,x.location,x.status,x.marc_clients?.name].some(v=>String(v||"").toLowerCase().includes(q))));
  };
  $("#newAsset").onclick=()=>assetModal(null,clientsRows);
  $("#assetRefresh").onclick=()=>assets();
  const open=e=>{const b=e.target.closest("[data-asset]");if(!b)return;const row=rows.find(x=>x.id===b.dataset.asset);if(row)assetModal(row,clientsRows)};
  $("#assetRows").onclick=open;
  $("#assetMobileCards").onclick=open;
}
async function assetModal(row,clientsRows){
  const editing=!!row,id=row?.id||"";
  const [so,mp]=editing?await Promise.all([
    S.from("marc_service_orders").select("id,number,title,status,scheduled_at,revenue,profit,materials_cost,technician").eq("user_id",st.u.id).eq("asset_id",id).order("created_at",{ascending:false}).limit(100),
    S.from("marc_maintenance_plans").select("id,title,next_due_at,last_completed_at,active,interval_months,technician").eq("user_id",st.u.id).eq("asset_id",id).order("next_due_at").limit(50)
  ]):[{data:[]},{data:[]}];
  const serviceHistory=so.data||[],plans=mp.data||[];
  const orderIds=serviceHistory.map(x=>x.id);
  const [matRes,photoRes]=orderIds.length?await Promise.all([
    S.from("marc_service_order_materials").select("service_order_id,name,quantity,unit_cost,total").eq("user_id",st.u.id).in("service_order_id",orderIds),
    S.from("marc_service_order_photos").select("service_order_id,photo_type,caption,storage_path,created_at").eq("user_id",st.u.id).in("service_order_id",orderIds).order("created_at",{ascending:false}).limit(100)
  ]):[{data:[]},{data:[]}];
  const mats=matRes.data||[],photos=photoRes.data||[];
  const revenue=serviceHistory.reduce((n,x)=>n+Number(x.revenue||0),0);
  const profit=serviceHistory.reduce((n,x)=>n+Number(x.profit||0),0);
  const materialCost=mats.reduce((n,x)=>n+Number(x.total||Number(x.quantity||0)*Number(x.unit_cost||0)),0);
  const activePlans=plans.filter(x=>x.active).length;
  const close=modal('<div class="modal-head"><div><div class="eyebrow2">FICHA TÉCNICA</div><h2>'+esc(row?.name||"Nuevo equipo / activo")+'</h2><p>Identificación, operación, mantenimiento e historial económico del activo.</p></div><button class="close" id="assetClose">×</button></div>'+
  (editing?'<section class="client-summary" style="margin-bottom:18px"><div><span>ÓRDENES</span><strong>'+serviceHistory.length+'</strong><small>Trabajos vinculados</small></div><div><span>MANTENIMIENTOS</span><strong>'+activePlans+'</strong><small>Planes activos</small></div><div><span>INGRESOS</span><strong>'+money(revenue)+'</strong><small>Servicios registrados</small></div><div><span>UTILIDAD</span><strong class="'+(profit>=0?"ok":"out")+'">'+money(profit)+'</strong><small>Rentabilidad del activo</small></div></section>':"")+
  '<form id="assetForm" class="form-grid">'+
  '<label>Nombre del equipo<input name="name" required value="'+esc(row?.name||"")+'" placeholder="Ej. DVR principal, cámara PTZ, aire acondicionado…"></label>'+
  '<label>Tipo<input name="asset_type" value="'+esc(row?.asset_type||"EQUIPO")+'" placeholder="CCTV, RED, COMPUTACIÓN…"></label>'+
  '<label>Cliente<select name="client_id"><option value="">Sin cliente</option>'+clientsRows.map(x=>'<option value="'+x.id+'" '+(row?.client_id===x.id?"selected":"")+'>'+esc(x.name)+'</option>').join("")+'</select></label>'+
  '<label>Ubicación<input name="location" value="'+esc(row?.location||"")+'" placeholder="Sala, oficina, techo…"></label>'+
  '<label>Marca<input name="brand" value="'+esc(row?.brand||"")+'"></label>'+
  '<label>Modelo<input name="model" value="'+esc(row?.model||"")+'"></label>'+
  '<label>N.º de serie<input name="serial_number" value="'+esc(row?.serial_number||"")+'"></label>'+
  '<label>Código interno<input name="internal_code" value="'+esc(row?.internal_code||"")+'" placeholder="Código o etiqueta"></label>'+
  '<label>Fecha de instalación<input type="date" name="install_date" value="'+(row?.install_date||"")+'"></label>'+
  '<label>Garantía hasta<input type="date" name="warranty_until" value="'+(row?.warranty_until||"")+'"></label>'+
  '<label>Último servicio<input type="datetime-local" name="last_service_at" value="'+(row?.last_service_at?new Date(row.last_service_at).toISOString().slice(0,16):"")+'"></label>'+
  '<label>Próximo servicio<input type="datetime-local" name="next_service_at" value="'+(row?.next_service_at?new Date(row.next_service_at).toISOString().slice(0,16):"")+'"></label>'+
  '<label>Estado<select name="status">'+["ACTIVO","EN_MANTENIMIENTO","FUERA_DE_SERVICIO","RETIRADO"].map(v=>'<option value="'+v+'" '+(row?.status===v?"selected":"")+'>'+v.replaceAll("_"," ")+'</option>').join("")+'</select></label>'+
  '<label class="full">Notas técnicas<textarea name="notes" rows="4" placeholder="Características, IP, ubicación exacta, observaciones…">'+esc(row?.notes||"")+'</textarea></label>'+
  '<div class="full" style="display:flex;gap:10px;justify-content:flex-end"><button type="button" class="secondary" id="assetCancel">Cancelar</button><button class="primary" type="submit">'+(editing?"Guardar cambios":"Registrar equipo")+'</button></div>'+
  '</form>'+
  (editing?'<div class="asset-history-panels">'+
    '<section class="card" style="margin-top:18px;padding:18px"><div class="panel-title-row"><div><div class="panel-eyebrow">HISTORIAL DE SERVICIOS</div><h3>Órdenes de trabajo</h3></div><span>'+serviceHistory.length+'</span></div><div class="list">'+(serviceHistory.slice(0,12).map(x=>'<div class="list-row"><div><b>'+esc(x.number||"OT")+'</b><br><small>'+esc(x.title||"Servicio")+' · '+esc(x.status||"")+'</small></div><span>'+money(x.revenue)+' · utilidad '+money(x.profit)+'</span></div>').join("")||'<div class="empty">No hay órdenes vinculadas.</div>')+'</div></section>'+
    '<section class="card" style="margin-top:18px;padding:18px"><div class="panel-title-row"><div><div class="panel-eyebrow">MANTENIMIENTO PROGRAMADO</div><h3>Planes del equipo</h3></div><span>'+plans.length+'</span></div><div class="list">'+(plans.map(x=>'<div class="list-row"><div><b>'+esc(x.title)+'</b><br><small>'+esc(x.technician||"Sin técnico")+' · cada '+Number(x.interval_months||0)+' meses</small></div><span>'+new Date(x.next_due_at).toLocaleDateString("es-PE")+'</span></div>').join("")||'<div class="empty">No hay planes vinculados.</div>')+'</div></section>'+
    '<section class="card" style="margin-top:18px;padding:18px"><div class="panel-title-row"><div><div class="panel-eyebrow">MATERIALES Y COSTOS</div><h3>Consumo asociado</h3></div><span>'+money(materialCost)+'</span></div><div class="list">'+(mats.slice(0,15).map(x=>'<div class="list-row"><div><b>'+esc(x.name)+'</b><br><small>'+Number(x.quantity||0)+' × '+money(x.unit_cost)+'</small></div><span>'+money(x.total||Number(x.quantity||0)*Number(x.unit_cost||0))+'</span></div>').join("")||'<div class="empty">No hay materiales registrados.</div>')+'</div></section>'+
    '<section class="card" style="margin-top:18px;padding:18px"><div class="panel-title-row"><div><div class="panel-eyebrow">EVIDENCIA</div><h3>Fotografías de trabajos</h3></div><span>'+photos.length+'</span></div><div class="client-cards">'+(photos.slice(0,12).map(x=>'<article class="client-card"><img data-asset-photo="'+esc(x.storage_path)+'" style="width:100%;height:150px;object-fit:cover;border-radius:14px"><b>'+esc(x.photo_type||"FOTO")+'</b><p>'+esc(x.caption||"Sin descripción")+'</p><small>'+new Date(x.created_at).toLocaleDateString("es-PE")+'</small></article>').join("")||'<div class="empty">No hay fotografías vinculadas.</div>')+'</div></section>'+
  '</div>':""));
  $("#assetClose").onclick=close;$("#assetCancel").onclick=close;
  document.querySelectorAll("#modal-root [data-asset-photo]").forEach(async img=>{const z=await S.storage.from("service-order-photos").createSignedUrl(img.dataset.assetPhoto,3600);if(!z.error)img.src=z.data.signedUrl});
  $("#assetForm").onsubmit=async e=>{
    e.preventDefault();
    const b=e.submitter;b.disabled=true;
    const d=new FormData(e.target);
    const payload={user_id:st.u.id,name:String(d.get("name")||"").trim(),asset_type:String(d.get("asset_type")||"EQUIPO").trim(),client_id:d.get("client_id")||null,location:String(d.get("location")||"").trim()||null,brand:String(d.get("brand")||"").trim()||null,model:String(d.get("model")||"").trim()||null,serial_number:String(d.get("serial_number")||"").trim()||null,internal_code:String(d.get("internal_code")||"").trim()||null,install_date:d.get("install_date")||null,warranty_until:d.get("warranty_until")||null,last_service_at:d.get("last_service_at")?new Date(d.get("last_service_at")).toISOString():null,next_service_at:d.get("next_service_at")?new Date(d.get("next_service_at")).toISOString():null,status:String(d.get("status")||"ACTIVO"),notes:String(d.get("notes")||"").trim()||null,updated_at:new Date().toISOString()};
    if(!payload.name){b.disabled=false;return toast("El nombre del equipo es obligatorio.","err")}
    const q=editing?await S.from("marc_assets").update(payload).eq("id",id).eq("user_id",st.u.id):await S.from("marc_assets").insert(payload);
    if(q.error){b.disabled=false;return toast(q.error.message,"err")}
    close();toast(editing?"Equipo actualizado.":"Equipo registrado.","ok");assets();
  };
}

async function serviceOrders(){
  const {data,error}=await S.from("marc_service_orders").select("*,marc_clients(name)").eq("user_id",st.u.id).order("created_at",{ascending:false});
  if(error)return toast(error.message,"err");
  const rows=data||[],c=$("#content");
  const counts=["PENDIENTE","PROGRAMADA","EN_PROCESO","TERMINADA"].map(x=>rows.filter(r=>r.status===x).length);
  const revenue=rows.reduce((sum,r)=>sum+Number(r.revenue??0),0);
  const costs=rows.reduce((sum,r)=>sum+Number(r.labor_cost??0)+Number(r.transport_cost??0)+Number(r.materials_cost??0)+Number(r.other_cost??0),0);
  const profit=rows.reduce((sum,r)=>sum+Number(r.profit??(Number(r.revenue??0)-Number(r.labor_cost??0)-Number(r.transport_cost??0)-Number(r.materials_cost??0)-Number(r.other_cost??0))),0);
  const margin=revenue>0?(profit/revenue)*100:0;
  const formatPct=v=>Number(v||0).toLocaleString("es-PE",{minimumFractionDigits:1,maximumFractionDigits:1})+"%";
  const cardActions=r=>'<div class="service-mobile-actions"><button class="primary full" data-service-order="'+r.id+'">Abrir orden</button><button class="secondary" data-service-photos="'+r.id+'">📷 Fotos</button><button class="secondary" data-service-checklist="'+r.id+'">✓ Checklist</button><button class="secondary" data-service-sign="'+r.id+'">✍ Conformidad</button><button class="secondary full" data-service-report="'+r.id+'">📄 Informe</button></div>';
  const mobileCards=rows.map(r=>{
    const rev=Number(r.revenue??0),cost=Number(r.labor_cost??0)+Number(r.transport_cost??0)+Number(r.materials_cost??0)+Number(r.other_cost??0),p=Number(r.profit??(rev-cost)),m=rev>0?(p/rev)*100:0;
    return '<article class="service-mobile-card"><div class="service-mobile-top"><div class="service-mobile-title"><b>'+esc(r.number||"OT")+' · '+esc(r.title||"Servicio")+'</b><small>'+esc(r.service_type||"Servicio")+'</small></div><span class="service-mobile-status">'+esc(r.status||"PENDIENTE")+'</span></div><div class="service-mobile-client">👤 '+esc(r.marc_clients?.name||"Sin cliente")+(r.location?" · 📍 "+esc(r.location):"")+'</div><div class="service-mobile-grid"><div class="service-mobile-metric"><span>Cobrado</span><b>'+money(rev)+'</b></div><div class="service-mobile-metric"><span>Costo real</span><b>'+money(cost)+'</b></div><div class="service-mobile-metric service-mobile-profit"><span>Utilidad</span><b>'+money(p)+'</b></div><div class="service-mobile-metric"><span>Margen</span><b>'+formatPct(m)+'</b></div></div><small>'+ (r.scheduled_at?"📅 "+esc(new Date(r.scheduled_at).toLocaleString("es-PE",{dateStyle:"medium",timeStyle:"short"})):"Sin programación") +'</small>'+cardActions(r)+'</article>';
  }).join("")||'<div class="empty">No hay órdenes de trabajo todavía.</div>';

  c.innerHTML='<section class="service-app">'+
    '<div class="service-app-hero"><div><div class="eyebrow2">APLICACIÓN · TRABAJO</div><h1>Órdenes de trabajo</h1><p>Todo lo que tienes que hacer, en un solo lugar.</p></div><button id="newServiceOrder" class="primary">＋ Nueva orden</button></div>'+
    '<div class="service-status-grid">'+
      '<button class="service-status-tile pending" data-status-filter="PENDIENTE"><strong>'+counts[0]+'</strong><span>Pendientes</span><small>Por atender</small></button>'+
      '<button class="service-status-tile scheduled" data-status-filter="PROGRAMADA"><strong>'+counts[1]+'</strong><span>Programadas</span><small>Con visita prevista</small></button>'+
      '<button class="service-status-tile progress" data-status-filter="EN_PROCESO"><strong>'+counts[2]+'</strong><span>En proceso</span><small>Trabajos activos</small></button>'+
      '<button class="service-status-tile done" data-status-filter="TERMINADA"><strong>'+counts[3]+'</strong><span>Terminadas</span><small>Trabajos cerrados</small></button>'+
    '</div>'+
    '<section class="service-profitability-summary"><div><span>INGRESOS</span><strong>'+money(revenue)+'</strong><small>Registrados en las OT</small></div><div><span>COSTOS</span><strong>'+money(costs)+'</strong><small>Todos los costos registrados</small></div><div><span>UTILIDAD</span><strong class="'+(profit>=0?"ok":"out")+'">'+money(profit)+'</strong><small>Resultado acumulado</small></div><div><span>MARGEN</span><strong>'+formatPct(margin)+'</strong><small>'+rows.length+' órdenes</small></div></section>'+
    '<section class="card table service-order-browser"><div class="toolbar"><div class="search"><input id="serviceOrderSearch" placeholder="Buscar orden, cliente, servicio o dirección…"></div><button id="serviceOrderRefresh" class="secondary">↻ Actualizar</button></div><div class="scroll"><table class="data"><thead><tr><th>Orden</th><th>Cliente</th><th>Servicio</th><th>Programación</th><th>Estado</th><th>Cobrado</th><th>Costo real</th><th>Utilidad</th><th>Margen</th><th></th></tr></thead><tbody id="serviceOrderRows"></tbody></table></div><div id="serviceMobileCards" class="service-mobile-cards">'+mobileCards+'</div></section>'+
    '</section>';
  $("#newServiceOrder").onclick=()=>serviceOrderModal();
  $("#serviceOrderRefresh").onclick=()=>serviceOrders();
  draw(rows);
  c.querySelectorAll("[data-status-filter]").forEach(b=>b.onclick=()=>{
    const status=b.dataset.statusFilter;
    const q=($("#serviceOrderSearch").value||"").toLowerCase();
    const filtered=rows.filter(r=>(r.status===status)&&[r.number,r.title,r.service_type,r.location,r.marc_clients?.name].some(v=>String(v||"").toLowerCase().includes(q)));
    draw(filtered);
    c.querySelectorAll("[data-status-filter]").forEach(x=>x.classList.toggle("active",x===b));
  });
  $("#serviceOrderSearch").oninput=e=>{const q=e.target.value.toLowerCase();draw(rows.filter(r=>[r.number,r.title,r.service_type,r.location,r.marc_clients?.name].some(v=>String(v||"").toLowerCase().includes(q))))};
  $("#newServiceOrder").onclick=()=>serviceOrderModal();
  $("#serviceOrderRefresh").onclick=()=>serviceOrders();
  const handle=e=>{
    const rp=e.target.closest("[data-service-report]");if(rp){const r=rows.find(x=>x.id===rp.dataset.serviceReport);if(r)return serviceOrderReport(r)}
    const sg=e.target.closest("[data-service-sign]");if(sg){const r=rows.find(x=>x.id===sg.dataset.serviceSign);if(r)return serviceOrderSignatureModal(r)}
    const ck=e.target.closest("[data-service-checklist]");if(ck){const r=rows.find(x=>x.id===ck.dataset.serviceChecklist);if(r)return serviceOrderChecklistModal(r)}
    const ph=e.target.closest("[data-service-photos]");if(ph){const r=rows.find(x=>x.id===ph.dataset.servicePhotos);if(r)return serviceOrderPhotosModal(r)}
    const b=e.target.closest("[data-service-order]");if(b){const r=rows.find(x=>x.id===b.dataset.serviceOrder);if(r)return serviceOrderModal(r)}
  };
  $("#serviceOrderRows").onclick=handle;
  $("#serviceMobileCards").onclick=handle;
}async function serviceOrderReport(order){
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
 $("#sorPrint").onclick=()=>{const w=window.open("","_blank");if(!w)return toast("El navegador bloqueó la ventana. Permite ventanas emergentes.","err");const printable=html.replace(/<div class="modal-actions">[\s\S]*?<\/div>\s*<\/div>$/,"");w.document.write('<html><head><title>'+esc(order.number||"Informe")+'</title><style>@page{size:A4;margin:16mm}body{font-family:Arial;padding:10px;line-height:1.45;color:#111}h1,h2,h3{margin:12px 0 6px}table{margin:10px 0;border-collapse:collapse}th,td{border:1px solid #ccc;padding:7px;text-align:left}img{break-inside:avoid}figure{break-inside:avoid}hr{margin:18px 0}</style></head><body>'+printable+'</body></html>');w.document.close();w.focus();setTimeout(()=>w.print(),700)};
}

function serviceOrderPhotosModal(order){
  const close=modal('<div class="modal-head"><div><div class="eyebrow2">EVIDENCIA DEL SERVICIO</div><h2>'+esc(order.number||"Orden")+'</h2><p>Fotos antes, durante y después del trabajo.</p></div><button class="close" id="sopClose">×</button></div><div id="sopBody">Cargando…</div>');
  $("#sopClose").onclick=close;
  const render=async()=>{
    const r=await S.from("marc_service_order_photos").select("*").eq("user_id",st.u.id).eq("service_order_id",order.id).order("created_at",{ascending:false});
    if(r.error)return $("#sopBody").innerHTML='<div class="msg error">'+esc(r.error.message)+'</div>';
    const rows=r.data||[];
    const free=normalizePlan(st.planState?.code)==="free";
    const remaining=Math.max(0,2-rows.length);
    const limitNote=free?'<div class="marc-feature-lock"><b>Plan Gratis</b><span>Máximo 2 fotografías por orden. '+remaining+' disponibles.</span><button type="button" class="secondary" id="sopUpgrade">Desbloquear fotos ilimitadas</button></div>':'';
    const uploadDisabled=free&&remaining<=0;
    $("#sopBody").innerHTML=limitNote+'<div class="toolbar"><label>Tipo <select id="sopType"><option>ANTES</option><option>DURANTE</option><option>DESPUES</option></select></label><label>Descripción <input id="sopCaption" placeholder="Ej. Conector dañado"></label><label>Fotos <input id="sopFiles" type="file" accept="image/*" multiple '+(uploadDisabled?'disabled':'')+'></label><button class="primary" id="sopUpload" '+(uploadDisabled?'disabled':'')+'>Subir fotos</button></div><div class="client-cards">'+(rows.map(x=>'<article class="client-card"><img data-photo-path="'+x.storage_path.replace(/"/g,"&quot;")+'" style="width:100%;max-height:220px;object-fit:cover;border-radius:14px"><b>'+esc(x.photo_type)+'</b><p>'+esc(x.caption||"Sin descripción")+'</p><small>'+new Date(x.created_at).toLocaleString("es-PE")+'</small></article>').join("")||'<div class="empty">Aún no hay evidencia fotográfica.</div>')+'</div>';
    if($("#sopUpgrade"))$("#sopUpgrade").onclick=()=>{close();openUpgradeModal("Las fotografías ilimitadas de las órdenes de trabajo están disponibles desde Coder / Pro.")};
    document.querySelectorAll("#sopBody [data-photo-path]").forEach(async img=>{const z=await S.storage.from("service-order-photos").createSignedUrl(img.dataset.photoPath,3600);if(!z.error)img.src=z.data.signedUrl});
    $("#sopUpload").onclick=async()=>{
      const files=[...($("#sopFiles").files||[])];
      if(!files.length)return toast("Selecciona al menos una foto","err");
      if(free&&rows.length+files.length>2)return toast("El plan Gratis permite 2 fotografías por orden. Sube menos fotos o cambia de plan.","err");
      const btn=$("#sopUpload");btn.disabled=true;
      for(const file of files){
        const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
        const path=st.u.id+"/"+order.id+"/"+Date.now()+"_"+safe;
        const up=await S.storage.from("service-order-photos").upload(path,file,{upsert:false});
        if(up.error){btn.disabled=false;return toast(up.error.message,"err")}
        const ir=await S.from("marc_service_order_photos").insert({user_id:st.u.id,service_order_id:order.id,storage_path:path,photo_type:$("#sopType").value,caption:$("#sopCaption").value.trim()});
        if(ir.error){btn.disabled=false;return toast(ir.error.message,"err")}
      }
      toast("Fotos guardadas","ok");render();
    };
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
 if(normalizePlan(st.planState?.code)==="free"){
   openUpgradeModal("La firma digital del cliente está disponible desde Coder / Pro.");
   return;
 }
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

async function serviceOrderChecklistModal(order){
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
async function serviceOrderModal(row=null){
  const isEdit=!!row;
  const close=modal(`<div class="modal-head"><div><div class="eyebrow2">ORDEN DE TRABAJO</div><h2>${isEdit?"Editar orden":"Nueva orden"}</h2><p>Registra el servicio, materiales, diagnóstico, trabajo y costo.</p></div><button class="close" id="serviceOrderClose">×</button></div>
  <form id="serviceOrderForm">
  <div id="soLinkedMaintenance" class="service-context-banner" style="display:none"></div>
  <div class="cols"><label>Cliente<select id="soClient"><option value="">Sin cliente</option></select></label><label>Equipo / activo<select id="soAsset"><option value="">Sin equipo vinculado</option></select></label></div><div class="cols"><label>Tipo de servicio<input id="soType" placeholder="Mantenimiento CCTV, reparación, instalación…"></label></div>
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
  S.from("marc_assets").select("id,name,brand,model,serial_number,client_id").eq("user_id",st.u.id).neq("status","RETIRADO").order("name").then(({data})=>{const sel=$("#soAsset");(data||[]).forEach(x=>{const o=document.createElement("option");o.value=x.id;o.textContent=[x.name,x.brand,x.model,x.serial_number].filter(Boolean).join(" · ");if(row?.asset_id===x.id)o.selected=true;sel.appendChild(o)})});
  if(row){
    if(row.maintenance_occurrence_id){
      const banner=$("#soLinkedMaintenance");
      banner.style.display="block";
      banner.innerHTML='<b>🔧 MANTENIMIENTO PROGRAMADO</b><span>Esta OT pertenece a una visita recurrente. Al completar la OT se cerrará la ocurrencia y se programará automáticamente la siguiente.</span>';
    }
    $("#soType").value=row.service_type||"";$("#soTitle").value=row.title||"";$("#soLocation").value=row.location||"";$("#soDate").value=row.scheduled_at?new Date(row.scheduled_at).toISOString().slice(0,16):"";
    $("#soDescription").value=row.description||"";$("#soDiagnosis").value=row.diagnosis||"";$("#soWork").value=row.work_performed||"";$("#soRecommendations").value=row.recommendations||"";$("#soTechnician").value=row.technician||"";
    $("#soLabor").value=row.labor_cost||0;$("#soTransport").value=row.transport_cost||0;$("#soMaterials").value=row.materials_cost||0;$("#soRevenue").value=row.revenue||row.total||0;$("#soOtherCost").value=row.other_cost||0;$("#soStatus").value=row.status||"PENDIENTE";$("#soNotes").value=row.notes||"";
  }
  if(row?.id){
    const mo=await S.from("marc_maintenance_occurrences").select("id,scheduled_at,status,plan_id,marc_maintenance_plans(title,service_type,interval_months)").eq("user_id",st.u.id).eq("service_order_id",row.id).maybeSingle();
    if(!mo.error&&mo.data){
      row.maintenance_occurrence_id=mo.data.id;
      const banner=$("#soLinkedMaintenance");
      if(banner){
        banner.style.display="block";
        banner.innerHTML='<b>🔧 MANTENIMIENTO PROGRAMADO</b><span>'+esc(mo.data.marc_maintenance_plans?.title||"Plan recurrente")+' · '+esc(mo.data.marc_maintenance_plans?.service_type||"Mantenimiento")+' · '+esc(mo.data.marc_maintenance_plans?.interval_months||"")+" meses</span>";
      }
    }
  }
  $("#serviceOrderForm").onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;const labor=Number($("#soLabor").value||0),transport=Number($("#soTransport").value||0),materials=materialRows.reduce((a,m)=>a+Number(m.quantity||0)*Number(m.unit_cost||0),0),revenue=Number($("#soRevenue").value||0),otherCost=Number($("#soOtherCost").value||0),profit=revenue-(labor+transport+materials+otherCost),marginPct=revenue>0?(profit/revenue)*100:0;
    const payload={user_id:st.u.id,client_id:$("#soClient").value||null,asset_id:$("#soAsset").value||null,title:$("#soTitle").value.trim(),service_type:$("#soType").value.trim(),description:$("#soDescription").value.trim(),diagnosis:$("#soDiagnosis").value.trim(),work_performed:$("#soWork").value.trim(),recommendations:$("#soRecommendations").value.trim(),location:$("#soLocation").value.trim(),scheduled_at:$("#soDate").value?new Date($("#soDate").value).toISOString():null,technician:$("#soTechnician").value.trim(),status:$("#soStatus").value,labor_cost:labor,transport_cost:transport,materials_cost:materials,total:labor+transport+materials+otherCost,revenue,other_cost:otherCost,profit,margin_pct:marginPct,notes:$("#soNotes").value.trim(),updated_at:new Date().toISOString()};
    if(!isEdit)payload.number="OT-"+Date.now().toString().slice(-8);
    const q=isEdit?await S.from("marc_service_orders").update(payload).eq("id",row.id).eq("user_id",st.u.id):await S.from("marc_service_orders").insert(payload).select("id").single();
    const orderId=isEdit?row.id:q.data?.id;
    if(!q.error&&orderId){
      if(!isEdit && q.data?.id){} else if(isEdit){}
      const lockedMaterials=isEdit&&["TERMINADA","ENTREGADA"].includes(String(row.status||"").toUpperCase());
      if(!lockedMaterials)await S.from("marc_service_order_materials").delete().eq("service_order_id",orderId).eq("user_id",st.u.id);
      const clean=lockedMaterials?[]:materialRows.filter(m=>String(m.name||"").trim()&&Number(m.quantity||0)>0).map(m=>({user_id:st.u.id,service_order_id:orderId,inventory_id:m.inventory_id||null,name:String(m.name).trim(),quantity:Number(m.quantity||0),unit_cost:Number(m.unit_cost||0)}));
      if(clean.length){const mr=await S.from("marc_service_order_materials").insert(clean);if(mr.error){b.disabled=false;$("#soMsg").textContent=mr.error.message;$("#soMsg").className="msg error";return}}
      if(["TERMINADA","ENTREGADA"].includes($("#soStatus").value)){const cr=await S.rpc("marc_consume_service_order_materials",{p_order_id:orderId});if(cr.error){b.disabled=false;$("#soMsg").textContent=cr.error.message;$("#soMsg").className="msg error";return}
        const linked=await S.from("marc_maintenance_occurrences").select("id").eq("user_id",st.u.id).eq("service_order_id",orderId).neq("status","COMPLETADA").limit(1).maybeSingle();
        if(linked.error){b.disabled=false;$("#soMsg").textContent=linked.error.message;$("#soMsg").className="msg error";return}
        if(linked.data?.id){
          const done=await S.rpc("marc_complete_maintenance",{p_occurrence_id:linked.data.id,p_service_order_id:orderId,p_completed_at:new Date().toISOString(),p_notes:$("#soNotes").value.trim()||null});
          if(done.error){b.disabled=false;$("#soMsg").textContent=done.error.message;$("#soMsg").className="msg error";return}
        }
      }
    }
    if(q.error){b.disabled=false;$("#soMsg").textContent=q.error.message;$("#soMsg").className="msg error";return}
    close();toast(isEdit?"Orden actualizada":"Orden creada","ok");serviceOrders();
  };
}
async function clients(){
  const {data,error}=await S.from("marc_clients").select("*").eq("user_id",st.u.id).order("name");
  if(error)return toast(error.message,"err");
  const list=data||[],c=$("#content");
  const withContact=list.filter(x=>x.email||x.phone||x.contact_name).length;
  const portal=list.filter(x=>x.portal_enabled).length;
  const initials=x=>String(x.name||"C").split(/\\s+/).filter(Boolean).slice(0,2).map(v=>v[0]).join("").toUpperCase();
  c.innerHTML='<section class="clients-app">'+
    '<div class="clients-app-hero"><div><div class="eyebrow2">APLICACIÓN · CLIENTES</div><h1>Clientes</h1><p>Ten a mano cada cliente, su información y toda la historia de trabajos.</p></div><button id="new" class="primary">＋ Nuevo cliente</button></div>'+
    '<div class="clients-app-stats">'+
      '<button class="client-stat-tile blue" data-client-filter="all"><strong>'+list.length+'</strong><span>Clientes</span><small>Todos tus registros</small></button>'+
      '<button class="client-stat-tile cyan" data-client-filter="contact"><strong>'+withContact+'</strong><span>Con contacto</span><small>Información disponible</small></button>'+
      '<button class="client-stat-tile violet" data-client-filter="portal"><strong>'+portal+'</strong><span>Portal activo</span><small>Acceso compartido</small></button>'+
      '<button class="client-stat-tile dark" data-client-filter="new"><strong>'+list.filter(x=>new Date(x.created_at||0)>=new Date(Date.now()-30*86400000)).length+'</strong><span>Nuevos</span><small>Últimos 30 días</small></button>'+
    '</div>'+
    '<section class="clients-browser card"><div class="clients-toolbar"><div class="clients-search"><span>⌕</span><input id="search" placeholder="Buscar por nombre, documento, correo o teléfono…"></div><button id="ask" class="secondary">✦ Preguntar a M.A.R.C.</button></div>'+
    '<div class="client-cards" id="clientCards"></div></section>'+
    '</section>';
  const cards=$("#clientCards");
  const draw=items=>{
    cards.innerHTML=items.map(x=>{
      const info=[x.contact_name,x.email,x.phone].filter(Boolean).length;
      return '<article class="client-app-card"><div class="client-app-card-head"><div class="client-app-avatar">'+esc(initials(x))+'</div><div class="client-app-name"><h3>'+esc(x.name)+'</h3><small>'+esc(x.document_number||"Sin documento")+'</small></div><span class="client-app-status '+(x.portal_enabled?"active":"")+'">'+(x.portal_enabled?"PORTAL":"CLIENTE")+'</span></div>'+
      '<div class="client-app-info">'+(x.contact_name?'<div><span>Contacto</span><b>'+esc(x.contact_name)+'</b></div>':"")+(x.phone?'<div><span>Teléfono</span><b>'+esc(x.phone)+'</b></div>':"")+(x.email?'<div><span>Correo</span><b>'+esc(x.email)+'</b></div>':"")+'<div><span>Ficha</span><b>'+info+' datos de contacto</b></div></div>'+
      '<div class="client-app-actions"><button class="primary" type="button" data-history="'+x.id+'">Ver historia</button><button class="secondary" type="button" data-edit="'+x.id+'">Editar</button></div></article>';
    }).join("")||'<div class="client-app-empty"><span>👥</span><b>No hay clientes que coincidan</b><small>Crea un cliente nuevo o cambia la búsqueda.</small></div>';
  };
  let activeFilter="all";
  const apply=()=>{
    const q=($("#search").value||"").toLowerCase();
    let items=list.filter(x=>[x.name,x.email,x.phone,x.document_number,x.contact_name].some(v=>String(v||"").toLowerCase().includes(q)));
    if(activeFilter==="contact")items=items.filter(x=>x.email||x.phone||x.contact_name);
    if(activeFilter==="portal")items=items.filter(x=>x.portal_enabled);
    if(activeFilter==="new")items=items.filter(x=>new Date(x.created_at||0)>=new Date(Date.now()-30*86400000));
    draw(items);
    c.querySelectorAll("[data-client-filter]").forEach(b=>b.classList.toggle("active",b.dataset.clientFilter===activeFilter));
  };
  $("#search").oninput=apply;
  c.querySelectorAll("[data-client-filter]").forEach(b=>b.onclick=()=>{activeFilter=b.dataset.clientFilter;apply()});
  $("#new").onclick=()=>clientModal();
  $("#ask").onclick=()=>openChat();
  cards.onclick=e=>{
    const b=e.target.closest("[data-history],[data-edit]");if(!b)return;
    const x=list.find(v=>v.id===(b.dataset.history||b.dataset.edit));if(!x)return;
    if(b.dataset.history)clientHistoryModal(x);else clientModal(x);
  };
  apply();
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
    body.innerHTML=`<div class="client-history-hero"><div><div class="client-avatar large">${esc(String(client.name||"C").split(/\s+/).filter(Boolean).slice(0,2).map(v=>v[0]).join("").toUpperCase())}</div></div><div class="client-history-main"><div class="eyebrow2">HISTORIA COMPLETA</div><h2>${esc(client.name)}</h2><p>${esc([client.document_number,client.phone,client.secondary_phone,client.email,client.preferred_channel].filter(Boolean).join(" · ")||"Sin datos de contacto")}</p><p class="client-profile-meta">${esc([client.contact_role,client.tax_name,client.tax_address].filter(Boolean).join(" · "))}</p></div><div class="client-history-actions"><button class="primary" id="shareClientPortal">Compartir portal</button><button class="secondary" id="addClientHistory">＋ Registrar nota</button><button class="secondary" id="editHistoryClient">Editar ficha</button></div></div>
    <div class="client-history-stats"><div><span>COTIZACIONES</span><b>${quotes.length}</b><small>Importe acumulado ${money(quotedTotal)}</small></div><div><span>COMPRAS / TRABAJOS</span><b>${purchased.length}</b><small>Partidas aceptadas o cobradas</small></div><div><span>PAGADO</span><b>${money(paidTotal)}</b><small>Ingresos vinculados</small></div><div><span>INFORMES</span><b>${reports.length}</b><small>Historial técnico</small></div><div><span>ÓRDENES</span><b>${orders.length}</b><small>Servicios registrados</small></div></div>
    <div class="client-history-grid">
      <section class="client-history-panel"><div class="panel-title-row"><div><div class="eyebrow2">PRODUCTOS Y SERVICIOS</div><h3>Lo que este cliente ha solicitado</h3></div></div><div class="client-product-list">${[...productMap.values()].map(x=>`<div><b>${esc(x.name)}</b><span>${Number(x.quantity).toLocaleString("es-PE")} · ${money(x.total)}</span></div>`).join("")||'<div class="empty">Todavía no hay partidas registradas.</div>'}</div></section>
      <section class="client-history-panel"><div class="panel-title-row"><div><div class="eyebrow2">FICHA COMPLETA</div><h3>Contexto técnico y comercial</h3></div></div><div class="client-notes-list">${client.service_notes?`<article><b>Notas técnicas</b><p>${esc(client.service_notes)}</p></article>`:""}${client.notes?`<article><b>Ficha del cliente</b><p>${esc(client.notes)}</p></article>`:""}${quotes.filter(q=>q.notes).slice(0,10).map(q=>`<article><b>${esc(q.number||q.title)}</b><p>${esc(q.notes)}</p></article>`).join("")}${notes.map(n=>`<article><b>${esc(n.title)}</b><p>${esc(n.description||"")}</p><small>${new Date(n.created_at).toLocaleString("es-PE")}${n.visible_to_client?" · visible al cliente":""}</small></article>`).join("")||(!client.notes&&!quotes.some(q=>q.notes)?'<div class="empty">No hay condiciones o notas registradas.</div>':"")}</div></section>
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

      const CONCURRENCY=6;
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

          // Si el PDF contiene texto, reutilizamos la lectura ya obtenida.
          // Evitamos una segunda llamada getTextContent() y, sobre todo,
          // evitamos renderizar la página a imagen: enviar imágenes a Gemini
          // es mucho más lento en móviles.
          const pendingForPage=await ensurePendingId();
          const text=local.text||"";
          let image="";
          if(text.length<120){
            let viewport=page.getViewport({scale:1.15});
            if(viewport.width>1400)viewport=page.getViewport({scale:1.15*(1400/viewport.width)});
            const canvas=document.createElement("canvas");
            const ctx=canvas.getContext("2d",{alpha:false});
            canvas.width=Math.ceil(viewport.width);
            canvas.height=Math.ceil(viewport.height);
            await page.render({canvasContext:ctx,viewport}).promise;
            image=canvas.toDataURL("image/jpeg",0.62);
          }

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
        status.textContent="Se detectaron "+detected.length+" productos, pero "+failedPages.length+" página(s) no pudieron analizarse: "+failedPages.map(x=>"P"+x.pageNumber).join(", ")+". Puedes revisar e importar los productos detectados sin perder el catálogo ya leído.";
        $("#pdfProgressCount").textContent=detected.length+" productos detectados · "+failedPages.length+" páginas con error";
        const detail=failedPages.map(x=>"P"+x.pageNumber+": "+x.error).join("\n");
        $("#pdfImportPreview").insertAdjacentHTML("afterbegin",'<div class="msg error pdf-page-warning"><b>Páginas no disponibles</b><br>'+esc(detail).replace(/\n/g,"<br>")+'</div>');
      }
      if(!failedPages.length){
        status.className="msg ok";
        status.textContent="Análisis terminado. Revisa exactamente qué productos serán procesados antes de importarlos.";
      }else{
        status.className="msg error";
        status.textContent="Lectura terminada con advertencias. Revisa las páginas no disponibles y selecciona los productos que quieras usar.";
      }
      $("#pdfProgressText").textContent="Lectura terminada · "+totalPages+" páginas";
      $("#pdfProgressCount").textContent=detected.length+" productos detectados"+(failedPages.length?" · "+failedPages.length+" páginas con error":"");

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
      const pdfPlan=await getPlanState(true);
      const pdfPlanConfig=MARC_PLANS[normalizePlan(pdfPlan.code)]||MARC_PLANS.free;
      const pdfImportLimit=Number.isFinite(Number(pdfPlanConfig.inventory))?Number(pdfPlanConfig.inventory):null;
      let selectedPdfIndexes=new Set();
      if(pdfImportLimit===null || listItems.length<=pdfImportLimit){
        selectedPdfIndexes=new Set(listItems.map((_,i)=>i));
      }else{
        selectedPdfIndexes=new Set(listItems.slice(0,pdfImportLimit).map((_,i)=>i));
      }
      const selectedPdfItems=()=>[...selectedPdfIndexes].sort((a,b)=>a-b).map(i=>listItems[i]).filter(Boolean);
      const pdfSelectionSummary=()=>{
        const selected=selectedPdfIndexes.size;
        if(pdfImportLimit===null)return "Plan "+planLabel(pdfPlan.code)+" · sin límite de selección";
        return "Plan "+planLabel(pdfPlan.code)+" · "+selected+" / "+pdfImportLimit+" seleccionados";
      };
      const renderPdfSelectionControls=()=>{
        const selected=selectedPdfIndexes.size;
        const cap=pdfImportLimit===null?listItems.length:pdfImportLimit;
        const countEl=$("#pdfSelectionCount");
        const importBtn=$("#analyzePdf");
        if(countEl)countEl.textContent=pdfSelectionSummary();
        if(importBtn){
          importBtn.textContent="Importar "+selected+" productos";
          importBtn.disabled=selected===0||selected>cap;
        }
        preview.querySelectorAll("input[data-pdf-select-index]").forEach(input=>{
          input.checked=selectedPdfIndexes.has(Number(input.dataset.pdfSelectIndex));
        });
      };
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
        '<div class="pdf-selection-banner '+(pdfImportLimit!==null&&listItems.length>pdfImportLimit?'limited':'')+'">'+
          '<div><strong id="pdfSelectionCount">'+pdfSelectionSummary()+'</strong><small>'+(
            pdfImportLimit!==null&&listItems.length>pdfImportLimit
              ? "M.A.R.C. detectó "+listItems.length+" productos únicos. Puedes revisar todos, pero tu plan permite importar hasta "+pdfImportLimit+"."
              : "Todos los productos detectados están disponibles para importar con tu plan."
          )+'</small></div>'+
          '<div class="pdf-selection-actions">'+
            '<button type="button" class="secondary" id="pdfSelectFirst">Seleccionar '+(pdfImportLimit||listItems.length)+'</button>'+
            '<button type="button" class="secondary" id="pdfSelectNone">Limpiar</button>'+
          '</div>'+
        '</div>'+
        '<label class="pdf-photo-option"><input type="checkbox" id="keepPdfProductPhotos" checked> Conservar la foto del producto desde el PDF cuando la página contenga imágenes</label>'+
        '<div class="pdf-product-list pdf-product-select-list">'+
          listItems.map((x,i)=>{
            const price=x.price!=null&&!Number.isNaN(Number(x.price))?'S/ '+Number(x.price).toFixed(2):'Precio no detectado';
            const code=String(x.sku||'').trim()||'Sin SKU';
            const model=String(x.model||'').trim();
            const pages=(x._sourcePages||[Number(x.page_number||1)]).sort((a,b)=>a-b);
            const source=pages.length>1?'Páginas '+pages.join(", "):'Página '+pages[0];
            const photo=x.pdf_y!=null&&x.pdf_x!=null&&x.pdf_width!=null?'📷 Foto PDF':'Sin zona de foto';
            const dup=x._duplicateCount?' · '+x._duplicateCount+' duplicado(s)':'';
            return '<label class="pdf-product-row pdf-product-select-row">'+
              '<input type="checkbox" data-pdf-select-index="'+i+'" '+(selectedPdfIndexes.has(i)?'checked':'')+'>'+
              '<span class="pdf-product-select-main"><span><b>'+(i+1)+'.</b> '+esc(x.name)+'</span><small>'+esc(source)+' · '+esc(code)+(model&&model!==code?' · '+esc(model):'')+' · '+esc(price)+' · '+photo+esc(dup)+'</small></span>'+
            '</label>';
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
      preview.querySelectorAll("input[data-pdf-select-index]").forEach(function(input){
        input.addEventListener("change",function(){
          const idx=Number(input.dataset.pdfSelectIndex);
          if(input.checked){
            if(pdfImportLimit!==null && selectedPdfIndexes.size>=pdfImportLimit){
              input.checked=false;
              toast("Tu plan "+planLabel(pdfPlan.code)+" permite seleccionar hasta "+pdfImportLimit+" productos.","err");
              return;
            }
            selectedPdfIndexes.add(idx);
          }else{
            selectedPdfIndexes.delete(idx);
          }
          renderPdfSelectionControls();
        });
      });
      $("#pdfSelectFirst")?.addEventListener("click",function(){
        selectedPdfIndexes=new Set(listItems.slice(0,pdfImportLimit===null?listItems.length:pdfImportLimit).map((_,i)=>i));
        renderPdfSelectionControls();
      });
      $("#pdfSelectNone")?.addEventListener("click",function(){
        selectedPdfIndexes=new Set();
        renderPdfSelectionControls();
      });
      renderPdfSelectionControls();

      btn.type="button";
      btn.dataset.ready="1";
      renderPdfSelectionControls();

      async function attachPdfProductPhotos(){
        const keep=$("#keepPdfProductPhotos")?.checked;
        if(!keep)return {attached:0,skipped:0};
        const byPage={};
        selectedPdfItems().forEach(function(item){
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
        const selectedItems=selectedPdfItems();
        if(!selectedItems.length){
          btn.dataset.importing="";
          return toast("Selecciona al menos un producto para importar.","err");
        }
        if(pdfImportLimit!==null && selectedItems.length>pdfImportLimit){
          btn.dataset.importing="";
          return toast("Tu plan permite importar hasta "+pdfImportLimit+" productos de este catálogo.","err");
        }
        btn.disabled=true;
        status.className="msg";
        status.textContent="Importando "+selectedItems.length+" productos seleccionados directamente al inventario…";

        try{
          if(pdfImportLimit!==null){
            const invRes=await S.from("marc_inventory")
              .select("id,name,sku,brand,model")
              .eq("user_id",st.u.id)
              .eq("active",true)
              .limit(1000);
            if(invRes.error)throw invRes.error;
            const existingRows=invRes.data||[];
            const norm=v=>String(v||"").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/\\s+/g," ").trim();
            const existingKeys=new Set();
            existingRows.forEach(x=>{
              const sku=norm(x.sku);
              const key=sku?("sku:"+sku):("name:"+norm(x.name)+"|"+norm(x.brand)+"|"+norm(x.model));
              existingKeys.add(key);
            });
            const newSelected=selectedItems.filter(x=>{
              const sku=norm(x.sku);
              const key=sku?("sku:"+sku):("name:"+norm(x.name)+"|"+norm(x.brand)+"|"+norm(x.model));
              return !existingKeys.has(key);
            });
            const available=Math.max(0,pdfImportLimit-existingRows.length);
            if(newSelected.length>available){
              throw new Error("Tu plan "+planLabel(pdfPlan.code)+" permite hasta "+pdfImportLimit+" productos activos. Ya tienes "+existingRows.length+" y esta selección añadiría "+newSelected.length+" nuevos. Selecciona "+available+" nuevos como máximo.");
            }
          }

          const {data,error}=await S.rpc("marc_import_inventory_batch",{
            p_items:selectedItems,
            p_update_existing:true
          });
          if(error)throw new Error(error.message||"No se pudo importar el lote.");
          if(!data||data.status!=="IMPORTED")throw new Error("Supabase no confirmó la importación.");
          const photoResult=await attachPdfProductPhotos();
          const photoMsg=photoResult.skipped
            ? " · "+photoResult.attached+" fotos asociadas, "+photoResult.skipped+" sin asociar"
            : " · "+photoResult.attached+" fotos asociadas";
          status.className="msg ok";
          status.textContent="Importación completada: "+data.total+" productos seleccionados y procesados, "+data.created+" nuevos, "+data.updated+" actualizados, "+(data.reactivated||0)+" reactivados"+photoMsg+".";
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
  let quoteQuery=S.from("marc_quotes").select("*,marc_clients(name)").is("deleted_at",null).order("created_at",{ascending:false});
  if(!isMasterAccount())quoteQuery=quoteQuery.eq("user_id",st.u.id);
  const {data,error}=await quoteQuery;
  if(error)return toast(error.message,"err");
  const rows=data||[],c=$("#content");
  const masterQuotes=isMasterAccount();
  const statuses=["BORRADOR","ENVIADA","ACEPTADA","RECHAZADA","ANULADA","COBRADA"];
  const counts=Object.fromEntries(statuses.map(x=>[x,rows.filter(r=>r.status===x).length]));
  const total=rows.filter(r=>!["ANULADA","RECHAZADA"].includes(String(r.status||"").toUpperCase())).reduce((n,r)=>n+Number(r.total||0),0);
  c.innerHTML='<section class="quotes-app">'+
    '<div class="quotes-app-hero"><div><div class="eyebrow2">APLICACIÓN · PROPUESTAS</div><h1>Cotizaciones</h1><p>'+(masterQuotes?"MASTER · Puedes revisar y editar cotizaciones de todas las cuentas.":"Crea, envía, controla y convierte tus propuestas en trabajos.")+'</p></div><div class="quotes-hero-actions">'+(masterQuotes?'<span class="quote-master-badge">MASTER · EDICIÓN DIRECTA</span>':'')+'<button id="aiNew" class="secondary">✦ Crear con IA</button><button id="new" class="primary">＋ Nueva cotización</button></div></div>'+
    '<div class="quotes-status-grid">'+
      '<button class="quote-status-tile draft" data-quote-filter="BORRADOR"><strong>'+counts.BORRADOR+'</strong><span>Borradores</span><small>En preparación</small></button>'+
      '<button class="quote-status-tile sent" data-quote-filter="ENVIADA"><strong>'+counts.ENVIADA+'</strong><span>Enviadas</span><small>Esperando respuesta</small></button>'+
      '<button class="quote-status-tile accepted" data-quote-filter="ACEPTADA"><strong>'+counts.ACEPTADA+'</strong><span>Aceptadas</span><small>Oportunidades aprobadas</small></button>'+
      '<button class="quote-status-tile paid" data-quote-filter="COBRADA"><strong>'+counts.COBRADA+'</strong><span>Cobradas</span><small>Ingresos confirmados</small></button>'+
    '</div>'+
    '<div class="quotes-total-bar"><div><span>VALOR DE COTIZACIONES</span><strong>'+money(total)+'</strong><small>Excluye anuladas y rechazadas</small></div><div class="quotes-total-icon">▤</div></div>'+
    '<section class="quotes-browser card"><div class="quotes-toolbar"><div class="quotes-search"><span>⌕</span><input id="search" placeholder="Buscar número, cliente o título…"></div><button id="clearQuoteFilter" class="secondary">Todas</button><button id="ask" class="secondary">✦ M.A.R.C.</button></div>'+
    '<div class="quotes-desktop scroll"><table class="data"><thead><tr><th>Número</th><th>Cliente</th><th>Título</th><th>Estado</th><th>Total</th><th>Fecha</th><th></th></tr></thead><tbody id="qrows"></tbody></table></div>'+
    '<div id="qcards" class="quote-cards"></div></section>'+
    '</section>';
  const body=$("#qrows"),cards=$("#qcards");
  let activeFilter="";
  const draw=()=>{
    const q=($("#search").value||"").toLowerCase();
    const list=rows.filter(x=>(!activeFilter||x.status===activeFilter)&&[x.number,x.title,x.marc_clients?.name].some(v=>String(v||"").toLowerCase().includes(q)));
    body.innerHTML=list.map(x=>'<tr><td><b>'+esc(x.number)+'</b></td><td>'+esc(x.marc_clients?.name||"Sin cliente")+'</td><td>'+esc(x.title)+'</td><td><span class="badge">'+esc(x.status)+'</span></td><td><b>'+money(x.total)+'</b></td><td>'+new Date(x.created_at).toLocaleDateString("es-PE")+'</td><td><button type="button" class="secondary" data-action="open-quote" data-id="'+x.id+'">'+(masterQuotes?"Editar":"Abrir")+'</button> <button type="button" class="secondary" data-action="pdf-quote" data-id="'+x.id+'">PDF</button> <button type="button" class="danger" data-action="delete-quote" data-id="'+x.id+'">Eliminar</button></td></tr>').join("")||'<tr><td colspan="7" class="empty">No hay cotizaciones que coincidan.</td></tr>';
    cards.innerHTML=list.map(x=>'<article class="quote-app-card"><div class="quote-app-card-top"><div><span class="quote-number">'+esc(x.number)+'</span><span class="quote-app-status '+String(x.status||"").toLowerCase()+'">'+esc(x.status)+'</span></div><strong>'+money(x.total)+'</strong></div><h3>'+esc(x.title||"Sin título")+'</h3><p>👤 '+esc(x.marc_clients?.name||"Sin cliente")+'</p><small>📅 '+new Date(x.created_at).toLocaleDateString("es-PE",{day:"2-digit",month:"short",year:"numeric"})+'</small><div class="quote-card-actions"><button type="button" class="primary" data-action="open-quote" data-id="'+x.id+'">'+(masterQuotes?"Editar":"Abrir")+'</button><button type="button" class="secondary" data-action="pdf-quote" data-id="'+x.id+'">PDF</button><button type="button" class="danger" data-action="delete-quote" data-id="'+x.id+'">Eliminar</button></div></article>').join("")||'<div class="quote-app-empty"><span>📋</span><b>No hay cotizaciones aquí</b><small>Crea una nueva propuesta para comenzar.</small></div>';
    c.querySelectorAll("[data-quote-filter]").forEach(b=>b.classList.toggle("active",b.dataset.quoteFilter===activeFilter));
  };
  const handle=async e=>{
    const b=e.target.closest("button[data-action]");if(!b)return;
    const id=b.dataset.id;
    try{
      const row=rows.find(x=>x.id===id);if(!row)return;
      if(b.dataset.action==="open-quote")await quoteModal(row);
      else if(b.dataset.action==="pdf-quote"){b.disabled=true;await downloadQuotePdf(id)}
      else if(b.dataset.action==="delete-quote"){
        if(row.status==="COBRADA")return toast("Una cotización cobrada no puede eliminarse. Usa ANULADA.","err");
        if(!confirm("¿Eliminar la cotización "+row.number+"?\\n\\nDesaparecerá del listado, pero se conservará el historial."))return;
        b.disabled=true;
        let deleteQuery=S.from("marc_quotes").update({deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id);
        if(!masterQuotes)deleteQuery=deleteQuery.eq("user_id",st.u.id);
        const result=await deleteQuery;
        if(result.error)throw result.error;
        toast("Cotización eliminada","ok");await quotes();
      }
    }catch(err){toast(err?.message||"No se pudo completar la acción.","err")}finally{b.disabled=false}
  };
  body.onclick=handle;cards.onclick=handle;
  $("#new").onclick=()=>quoteModal();
  $("#aiNew").onclick=()=>aiQuoteModal();
  $("#ask").onclick=openChat;
  $("#search").oninput=draw;
  $("#clearQuoteFilter").onclick=()=>{activeFilter="";draw()};
  c.querySelectorAll("[data-quote-filter]").forEach(b=>b.onclick=()=>{activeFilter=b.dataset.quoteFilter;draw()});
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

async function saasAdmin(){
  if(!isMasterPlan()){toast("Área exclusiva de M.A.R.C. MASTER.","err");return view("home")}
  const c=$("#content");
  c.innerHTML='<section class="saas-admin"><div class="saas-admin-hero"><div><div class="eyebrow2">CONTROL DEL SaaS</div><h1>Administración M.A.R.C.</h1><p>Usuarios, planes, acceso, uso, solicitudes y evolución comercial.</p></div><button id="saasRefresh" class="primary">↻ Actualizar</button></div><div id="saasMetrics" class="saas-metrics"></div><section class="saas-admin-panel"><div class="saas-panel-head"><div><span>CUENTAS</span><h2>Usuarios y suscripciones</h2></div><span class="saas-live">MASTER</span></div><div class="saas-user-scroll"><table class="data"><thead><tr><th>Usuario</th><th>Plan</th><th>Acceso</th><th>Uso</th><th>Alta</th><th></th></tr></thead><tbody id="saasUsers"><tr><td colspan="6" class="empty">Cargando administración…</td></tr></tbody></table></div></section><section class="saas-admin-panel saas-requests-panel"><div class="saas-panel-head"><div><span>UPGRADES</span><h2>Solicitudes de plan</h2></div><span id="saasRequestCount" class="saas-live">0 pendientes</span></div><div id="saasRequests"><div class="empty">Cargando solicitudes…</div></div></section></section>';
  const draw=async()=>{
    const {data,error}=await S.rpc("marc_saas_admin_overview");
    if(error){toast(error.message||"No se pudo cargar el panel SaaS.","err");return}
    const rows=data||[];
    const counts={free:0,coder:0,premium:0,master:0};
    rows.forEach(r=>counts[normalizePlan(r.plan)]++);
    const trial=rows.filter(r=>String(r.access_status||"").toLowerCase()==="trial").length;
    $("#saasMetrics").innerHTML='<article class="saas-metric blue"><b>'+rows.length+'</b><span>CUENTAS</span><small>Usuarios registrados</small></article><article class="saas-metric violet"><b>'+counts.coder+'</b><span>CODER / PRO</span><small>Profesionales</small></article><article class="saas-metric cyan"><b>'+counts.premium+'</b><span>PREMIUM</span><small>Empresas</small></article><article class="saas-metric amber"><b>'+trial+'</b><span>PRUEBAS</span><small>Acceso en trial</small></article>';
    $("#saasUsers").innerHTML=rows.map(r=>'<tr><td><b>'+esc(r.display_name||"Usuario")+'</b><small class="saas-email">'+esc(r.email||"")+'</small></td><td><span class="saas-plan-pill '+normalizePlan(r.plan)+'">'+esc(planLabel(r.plan))+'</span></td><td>'+esc(r.access_status||"—")+'</td><td>'+Number(r.quotes_this_month||0)+' cot. · '+Number(r.inventory_count||0)+' prod. · '+Number(r.clients_count||0)+' cli.</td><td>'+new Date(r.created_at).toLocaleDateString("es-PE")+'</td><td><button class="secondary saas-plan-edit" data-user="'+r.user_id+'" data-plan="'+normalizePlan(r.plan)+'">Cambiar plan</button></td></tr>').join("")||'<tr><td colspan="6" class="empty">No hay cuentas.</td></tr>';
    $$(".saas-plan-edit").forEach(b=>b.onclick=()=>saasChangePlan(b.dataset.user,b.dataset.plan));
    const {data:req,error:reqError}=await S.from("marc_plan_requests").select("id,user_id,requested_plan,status,message,created_at,reviewed_at").eq("status","pending").order("created_at",{ascending:false}).limit(100);
    if(reqError)console.warn("[M.A.R.C. SaaS] No se pudieron cargar solicitudes.",reqError);
    const pending=Array.isArray(req)?req:[];
    $("#saasRequestCount").textContent=pending.length+" pendientes";
    $("#saasRequests").innerHTML=pending.map(x=>'<div class="saas-request-row"><div><b>'+esc(x.requested_plan==="premium"?"Premium / Enterprise":"Coder / Pro")+'</b><small>'+esc(x.message||"Solicitud de mejora de plan")+' · '+new Date(x.created_at).toLocaleString("es-PE")+'</small></div><button class="primary saas-request-open" data-request="'+esc(x.id)+'">Revisar</button></div>').join("")||'<div class="empty">No hay solicitudes pendientes.</div>';
    $$(".saas-request-open").forEach(b=>b.onclick=async()=>saasReviewPlanRequest(b.dataset.request,pending));
  };
  $("#saasRefresh").onclick=draw;
  await draw();
}
async function saasReviewPlanRequest(id,rows){
  const row=rows.find(x=>x.id===id);if(!row)return;
  const target=normalizePlan(row.requested_plan);
  const close=modal('<div class="modal-head"><div><div class="eyebrow2">SOLICITUD DE UPGRADE</div><h2>'+esc(planLabel(target))+'</h2><p>Revisa la solicitud antes de activar el plan.</p></div><button class="close" id="x">×</button></div><div class="saas-request-detail"><b>Mensaje</b><p>'+esc(row.message||"Sin mensaje adicional.")+'</p><small>Solicitada el '+new Date(row.created_at).toLocaleString("es-PE")+'</small></div><div class="modal-actions"><button type="button" class="secondary" id="reject">Rechazar</button><button type="button" class="primary" id="approve">Aprobar y activar</button></div>');
  $("#x").onclick=close;
  $("#reject").onclick=async()=>{
    const b=$("#reject");b.disabled=true;
    const {error}=await S.from("marc_plan_requests").update({status:"rejected",reviewed_at:new Date().toISOString(),reviewed_by:st.u.id}).eq("id",id);
    if(error){toast(error.message||"No se pudo rechazar.","err");b.disabled=false;return}
    close();toast("Solicitud rechazada","ok");saasAdmin();
  };
  $("#approve").onclick=async()=>{
    const b=$("#approve");b.disabled=true;
    try{
      const {error}=await S.rpc("marc_saas_admin_set_plan",{p_user_id:row.user_id,p_plan:target,p_status:"active"});
      if(error)throw error;
      const {error:reqError}=await S.from("marc_plan_requests").update({status:"approved",reviewed_at:new Date().toISOString(),reviewed_by:st.u.id}).eq("id",id);
      if(reqError)throw reqError;
      close();toast("Plan activado · "+planLabel(target),"ok");saasAdmin();
    }catch(e){toast(e.message||"No se pudo activar el plan.","err");b.disabled=false}
  };
}
async function saasChangePlan(userId,current){
  const close=modal('<div class="modal-head"><div><div class="eyebrow2">MASTER</div><h2>Cambiar plan</h2><p>Este cambio afecta los límites y capacidades de la cuenta.</p></div><button class="close" id="x">×</button></div><div class="saas-change-grid">'+["free","coder","premium","master"].map(p=>'<button class="saas-change-option '+(p===current?"active":"")+'" data-plan="'+p+'"><b>'+planLabel(p)+'</b><small>'+({free:"5 cotizaciones/mes · 50 productos",coder:"Profesional sin límites operativos",premium:"Empresa multiusuario e integraciones",master:"Control total del SaaS"}[p])+'</small></button>').join("")+'</div>');
  $("#x").onclick=close;
  $$(".saas-change-option").forEach(b=>b.onclick=async()=>{
    b.disabled=true;
    try{
      const {error}=await S.rpc("marc_saas_admin_set_plan",{p_user_id:userId,p_plan:b.dataset.plan,p_status:"ACTIVE"});
      if(error)throw error;
      close();toast("Plan actualizado a "+planLabel(b.dataset.plan),"ok");saasAdmin();
    }catch(e){toast(e.message||"No se pudo cambiar el plan.","err");b.disabled=false}
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
      const owner=cashOwnerSession;
       cashOwnerSession=null;
      if(owner?.access_token&&owner?.refresh_token){
        const restored=await S.auth.setSession({access_token:owner.access_token,refresh_token:owner.refresh_token});
        if(restored.error)throw restored.error;
        await enter(restored.data.session);
        toast("Sesión de caja cerrada · regresaste al administrador","ok");
      }else{
        await S.auth.signOut({scope:"local"});
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
function marcQuickLauncher(){
  const overlay=$("#marcQuickOverlay"),grid=$("#marcQuickGrid"),search=$("#marcQuickSearch");
  if(!overlay||!grid)return;
  const workspaceActions={
    technician:[
      {icon:"⌂",title:"Inicio técnico",desc:"Centro de operaciones técnicas",run:()=>view("home")},
      {icon:"🛠",title:"Nueva orden de trabajo",desc:"Crear una OT y controlar su rentabilidad",run:()=>marcQuickView("service_orders","#new")},
      {icon:"📅",title:"Abrir agenda técnica",desc:"Visitas, servicios y mantenimientos",run:()=>view("agenda")},
      {icon:"◉",title:"Nuevo cliente",desc:"Crear una ficha de cliente técnico",run:()=>marcQuickView("clients","#new")},
      {icon:"🧰",title:"Nuevo equipo / activo",desc:"Registrar equipo, garantía y ubicación",run:()=>marcQuickView("assets","#new")},
      {icon:"🔧",title:"Mantenimiento",desc:"Gestionar mantenimientos preventivos y correctivos",run:()=>view("maintenance")},
      {icon:"📦",title:"Nuevo material",desc:"Agregar repuesto o material técnico",run:()=>marcQuickView("inventory","#new")},
      {icon:"🧾",title:"Nueva cotización técnica",desc:"Crear presupuesto para un servicio",run:()=>marcQuickView("quotes","#new")},
      {icon:"💰",title:"Rentabilidad",desc:"Revisar ingresos, costos y margen",run:()=>view("finances")},
      {icon:"📊",title:"Reportes técnicos",desc:"Indicadores de operación y servicios",run:()=>view("reports")},
      {icon:"⚙",title:"Configuración",desc:"Empresa, documentos y parámetros",run:()=>view("settings")},
      {icon:"💬",title:"Preguntar a M.A.R.C.",desc:"Abrir el asistente operativo",run:()=>openChat()}
    ],
    business:[
      {icon:"⌂",title:"Inicio comercial",desc:"Centro de ventas y operación de tienda",run:()=>view("home")},
      {icon:"🛒",title:"Nueva venta",desc:"Abrir el POS y cobrar",run:()=>marcQuickView("cash","#cashSaleQuick")},
      {icon:"＋",title:"Abrir caja",desc:"Iniciar un turno de caja",run:()=>marcQuickView("cash","#openCashTop")},
      {icon:"−",title:"Registrar gasto",desc:"Registrar una salida de caja",run:()=>marcQuickView("cash","#cashExpense")},
      {icon:"▣",title:"Nuevo producto",desc:"Agregar producto al inventario",run:()=>marcQuickView("inventory","#new")},
      {icon:"◉",title:"Nuevo cliente",desc:"Crear una ficha comercial",run:()=>marcQuickView("clients","#new")},
      {icon:"▤",title:"Nueva cotización",desc:"Crear una propuesta comercial",run:()=>marcQuickView("quotes","#new")},
      {icon:"🏭",title:"Proveedores",desc:"Gestionar abastecimiento y compras",run:()=>view("suppliers")},
      {icon:"📥",title:"Compras",desc:"Registrar entradas y costos",run:()=>view("purchases")},
      {icon:"💳",title:"Créditos y cobros",desc:"Controlar cuentas por cobrar",run:()=>view("receivables")},
      {icon:"📊",title:"Reportes comerciales",desc:"Ventas, caja y operación",run:()=>view("reports")},
      {icon:"⚙",title:"Configuración",desc:"Empresa, logo y datos comerciales",run:()=>view("settings")},
      {icon:"💬",title:"Preguntar a M.A.R.C.",desc:"Abrir el asistente operativo",run:()=>openChat()}
    ],
    mixed:[
      {icon:"⌂",title:"Inicio Business",desc:"Centro ejecutivo de comercio y servicios",run:()=>view("home")},
      {icon:"🛒",title:"Nueva venta",desc:"Vender y cobrar productos",run:()=>marcQuickView("cash","#cashSaleQuick")},
      {icon:"🛠",title:"Nueva orden de trabajo",desc:"Crear un servicio técnico",run:()=>marcQuickView("service_orders","#new")},
      {icon:"＋",title:"Abrir caja",desc:"Iniciar un turno de caja",run:()=>marcQuickView("cash","#openCashTop")},
      {icon:"📦",title:"Nuevo producto / material",desc:"Registrar inventario para ventas o servicios",run:()=>marcQuickView("inventory","#new")},
      {icon:"◉",title:"Nuevo cliente",desc:"Crear una ficha comercial y técnica",run:()=>marcQuickView("clients","#new")},
      {icon:"🧾",title:"Nueva cotización",desc:"Cotizar una venta o un servicio",run:()=>marcQuickView("quotes","#new")},
      {icon:"📅",title:"Agenda",desc:"Visitas, servicios y compromisos",run:()=>view("agenda")},
      {icon:"🧰",title:"Equipos y activos",desc:"Activos vinculados a clientes",run:()=>view("assets")},
      {icon:"🔧",title:"Mantenimiento",desc:"Preventivo y correctivo",run:()=>view("maintenance")},
      {icon:"🏭",title:"Proveedores y compras",desc:"Abastecimiento y costos",run:()=>view("suppliers")},
      {icon:"💳",title:"Créditos y cobros",desc:"Cuentas por cobrar",run:()=>view("receivables")},
      {icon:"💰",title:"Finanzas",desc:"Resultado global del negocio",run:()=>view("finances")},
      {icon:"📊",title:"Centro ejecutivo",desc:"KPIs y análisis integrados",run:()=>view("reports")},
      {icon:"⚙",title:"Configuración",desc:"Empresa y sistema",run:()=>view("settings")},
      {icon:"💬",title:"Preguntar a M.A.R.C.",desc:"Abrir el asistente operativo",run:()=>openChat()}
    ]
  };
  const getActions=()=>workspaceActions[currentEcosystem()]||workspaceActions.technician;
  const draw=(filter="")=>{
    const actions=getActions();
    const q=String(filter||"").trim().toLowerCase();
    const list=actions.filter(a=>(a.title+" "+a.desc).toLowerCase().includes(q));
    grid.innerHTML=list.length?list.map(a=>"<button type=\"button\" class=\"marc-quick-item\" data-quick-index=\""+actions.indexOf(a)+"\"><span class=\"qi-icon\">"+a.icon+"</span><span><b>"+esc(a.title)+"</b><small>"+esc(a.desc)+"</small></span></button>").join(""):"<div class=\"marc-quick-empty\">No encontré una acción en este espacio de trabajo.</div>";
    grid.querySelectorAll("[data-quick-index]").forEach(b=>b.onclick=async()=>{
      const actions=getActions();
      const action=actions[Number(b.dataset.quickIndex)];
      if(!action)return;
      closeQuick();
      try{await action.run()}catch(err){toast(err?.message||"No se pudo abrir esa sección.","err")}
    });
  };
  const openQuick=()=>{draw(search?.value||"");overlay.classList.add("open");overlay.setAttribute("aria-hidden","false");setTimeout(()=>search?.focus(),30)};
  const closeQuick=()=>{overlay.classList.remove("open");overlay.setAttribute("aria-hidden","true")};
  const handleKey=e=>{
    if(e.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)){e.preventDefault();openQuick()}
    if(e.key==="Escape"&&overlay.classList.contains("open"))closeQuick();
  };
  window.marcQuickOpen=openQuick;window.marcQuickClose=closeQuick;
  $("#marcQuickOpen").onclick=openQuick;$("#marcQuickClose").onclick=closeQuick;
  overlay.addEventListener("click",e=>{if(e.target===overlay)closeQuick()});
  search?.addEventListener("input",e=>draw(e.target.value));
  document.addEventListener("keydown",handleKey);draw();
}
function marcQuickView(viewName,selector){
  view(viewName);
  setTimeout(()=>{const el=$(selector);if(el){el.focus?.();if(selector==="#search"&&el.scrollIntoView)el.scrollIntoView({behavior:"smooth",block:"center"});else el.click?.()}},320);
}

function wire(){
  initTheme();
  marcQuickLauncher();
  // El selector de ecosistemas tiene un único controlador global,
  // instalado antes de que los módulos visuales carguen sus propios listeners.
  Array.from(document.querySelectorAll("#ecosystemChooser [data-ecosystem-choice]")).forEach(b=>{b.type="button";});
  const ecosystemBadge=$("#ecosystemBadge");
  if(ecosystemBadge){ecosystemBadge.addEventListener("click",async()=>{if(await canSwitchEcosystem())openEcosystemChooser();else toast("El cambio de ecosistema está disponible para planes Mixto y cuenta maestra.","err")});}
  const portalToken=new URLSearchParams(location.search).get("cliente_token");
  if(portalToken){
    renderClientPortal(portalToken);
    return;
  }
  const toggleTheme=()=>cycleTheme();
  const themeToggle=$("#themeToggle");
  if(themeToggle)themeToggle.onclick=toggleTheme;
  const authThemeToggle=$("#authThemeToggle");
  if(authThemeToggle)authThemeToggle.onclick=toggleTheme;
  mode("login");
  $("#logout").onclick=async()=>{
    // Limpiar solo la preferencia local de ecosistema al salir.
    // La configuración persistida de cada cuenta permanece intacta.
    try{localStorage.removeItem(ECOSYSTEM_KEY)}catch{}
    try{sessionStorage.removeItem("marc_google_oauth_pending")}catch{}
    resetUiToLogin();
    await S.auth.signOut({scope:"local"});
  };
  const planBox=$(".trial"); if(planBox){planBox.style.cursor="pointer";planBox.title="Ver planes y capacidades";planBox.onclick=()=>openUpgradeModal();}
  $("#askTop").onclick=openChat;
  $("#closeChat").onclick=closeChat;
  $("#exitConversation").onclick=closeChat;
  $("#menu").onclick=()=>$("#sidebar").classList.toggle("open");
  $("#mobileScrim").onclick=()=>$("#sidebar").classList.remove("open");
  document.addEventListener("click",e=>{
    const b=e.target.closest?.(".sidebar nav button[data-view]");
    if(!b)return;
    e.preventDefault();
    if(b.dataset.view==="settings")return companySettings();
    view(b.dataset.view);
  },true);
  $("#chatForm").onsubmit=e=>{e.preventDefault();const v=$("#chatInput").value.trim();if(v){$("#chatInput").value="";chatSend(v)}};
  $("#chatInput").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("#chatForm").requestSubmit()}};
  $$(".chips button").forEach(b=>b.onclick=()=>{$("#chatInput").value=b.dataset.q;$("#chatInput").focus()});

  const bootAuth=async()=>{
    // OAuth queda bajo una sola ruta controlada por Supabase.
    // skipAutoInitialize evita que el cliente procese el callback antes de
    // que nuestro listener quede registrado. initialize() se ejecuta una vez.
    console.info("[M.A.R.C. auth] Inicializando Supabase Auth.",{flow:"pkce"});
    const {search,hash}=authCallbackParams();
    const oauthPending=sessionStorage.getItem("marc_google_oauth_pending")==="1";
    const diagnostics={
      hasCode:!!search.get("code"),
      hasAccessToken:!!hash.get("access_token"),
      hasRefreshToken:!!hash.get("refresh_token"),
      hasError:!!(search.get("error")||hash.get("error")),
      pending:oauthPending,
      path:location.pathname
    };
    console.info("[M.A.R.C. OAuth callback diagnóstico]",diagnostics);

    const error=hash.get("error_description")||search.get("error_description")||hash.get("error")||search.get("error");
    if(error){
      sessionStorage.removeItem("marc_google_oauth_pending");
      throw Object.assign(
        new Error(decodeURIComponent(String(error).replace(/\\+/g," "))),
        {code:search.get("error_code")||hash.get("error_code")||"OAUTH_CALLBACK_ERROR"}
      );
    }

    const initialized=await S.auth.initialize();
    if(initialized?.error)throw initialized.error;

    // M.A.R.C. es una SPA estática (HTML/JS + Worker), no SSR.\n    // Usamos OAuth implícito en el navegador para evitar depender de un\n    // code_verifier almacenado durante el salto a Google.\n    const current=await S.auth.getSession();
    if(current.error)throw current.error;
    if(current.data?.session?.user){
       if(recoveryMode){sessionStorage.removeItem("marc_google_oauth_pending");mode("update");msg("Crea una nueva contraseña para tu cuenta.","ok");cleanAuthUrl();return;}
       sessionStorage.removeItem("marc_google_oauth_pending");
       cleanAuthUrl();
       if(oauthPending)msg("Acceso con Google confirmado. Abriendo M.A.R.C.…");
       await handleAuthSession(current.data.session);
       return;
     }

    if(oauthPending){
      await new Promise(r=>setTimeout(r,1200));
      const retry=await S.auth.getSession();
      if(retry.error)throw retry.error;
      if(retry.data?.session?.user){
         if(recoveryMode){mode("update");msg("Crea una nueva contraseña para tu cuenta.","ok");cleanAuthUrl();return;}
         sessionStorage.removeItem("marc_google_oauth_pending");
         cleanAuthUrl();
         msg("Sesión de Google recuperada. Abriendo M.A.R.C.…");
         await handleAuthSession(retry.data.session);
         return;
       }
      msg(
        "Google terminó la autenticación, pero M.A.R.C. no pudo recuperar la sesión en este navegador. El callback llegó correctamente; no volveremos a ocultar este diagnóstico.",
        "error"
      );
    }
  };
  const recoverBrowserSession=async()=>{
    try{
      // Después del retorno OAuth, el cliente puede terminar de persistir la
      // sesión ligeramente después de que el documento vuelva a cargarse.
      // Recuperamos explícitamente la sesión para que el acceso no dependa
      // únicamente del evento INITIAL_SESSION/SIGNED_IN.
      const current=await S.auth.getSession();
      const session=current?.data?.session;
      if(session?.user){
        sessionStorage.removeItem("marc_google_oauth_pending");
        await handleAuthSession(session);
        return true;
      }
    }catch(e){
      console.error("[M.A.R.C. auth recovery]",e);
    }
    return false;
  };

  bootAuth().catch(async e=>{
    console.error("[M.A.R.C. auth error]",e);
    try{
      const recovered=await S.auth.getSession();
      if(recovered?.data?.session?.user){
        sessionStorage.removeItem("marc_google_oauth_pending");
        await handleAuthSession(recovered.data.session);
        return;
      }
    }catch(recoveryError){
      console.error("[M.A.R.C. auth recovery after error]",recoveryError);
    }
    const raw=String(e?.message||e||"Error desconocido");
    const code=e?.code?String(e.code):"";
    const status=e?.status?String(e.status):"";
    const detail=[raw,code?("Código: "+code):"",status?("HTTP: "+status):""].filter(Boolean).join(" · ");
    msg("No se pudo completar el inicio de sesión: "+detail,"error");
    try{sessionStorage.setItem("marc_google_oauth_last_error",detail)}catch{}
  });

  // Última barrera para navegadores móviles/WebViews: si Supabase ya
  // consiguió la sesión pero el evento ocurrió antes de terminar de montar
  // la interfaz, la recuperamos al cargar y unos instantes después.
  window.addEventListener("load",()=>{void recoverBrowserSession();},{once:true});
  setTimeout(()=>{void recoverBrowserSession();},1800);
  setTimeout(()=>{void recoverBrowserSession();},4500);

  window.MARC=window.MARC||{};
  window.MARC.signInGoogle=signInGoogle;
  window.MARC.submitLogin=submit;
}
// API pública mínima para módulos auxiliares (proveedores, notificaciones y herramientas visuales).
// La API ya fue expuesta antes de wire(); aquí solo se completan referencias globales.
window.MARC=window.MARC||{};
window.view=view;
window.openChat=openChat;
window.closeChat=closeChat;
window.toast=toast;
Object.defineProperty(window,"st",{configurable:true,get:()=>st});

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wire,{once:true});else wire();})();
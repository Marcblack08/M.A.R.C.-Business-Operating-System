/* M.A.R.C. — Google OAuth + session bootstrap */
(function(){
  'use strict';

  const SUPABASE_URL='https://hmnzzknuiejchypalpig.supabase.co';
  const SUPABASE_KEY='sb_publishable_mhRoYMQTWrmYpuclqzQ1MA_6TMtGikq';
  let bound=false;
  let client=null;
  let lastSessionId=null;

  function message(text,type){
    if(typeof window.authMsg==='function')window.authMsg(text,type);
    else{
      const el=document.querySelector('#authMessage');
      if(el){el.textContent=text;el.className=`auth-message ${type||''}`;}
    }
  }

  function getClient(){
    if(window.supabaseClient)return window.supabaseClient;
    if(client)return client;
    if(!window.supabase||typeof window.supabase.createClient!=='function')return null;
    try{
      client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      window.supabaseClient=client;
      return client;
    }catch(error){
      console.error('M.A.R.C. Supabase client:',error);
      return null;
    }
  }

  function setUser(session){
    const email=session?.user?.email||'';
    const name=email.split('@')[0]||'Usuario';
    const emailEl=document.querySelector('#userEmail');
    const companyEl=document.querySelector('#companyUser');
    const nameEl=document.querySelector('#userName');
    if(emailEl)emailEl.textContent=email;
    if(companyEl)companyEl.textContent=name;
    if(nameEl)nameEl.textContent=name;
  }

  function showShell(session){
    if(!session)return false;
    const authScreen=document.querySelector('#authScreen');
    const appShell=document.querySelector('#appShell');
    if(!authScreen||!appShell)return false;
    setUser(session);
    authScreen.hidden=true;
    appShell.hidden=false;
    return true;
  }

  function renderDashboard(){
    const content=document.querySelector('#content');
    if(!content)return false;
    try{
      if(typeof window.render==='function'){
        window.render('dashboard');
        return !!content.innerHTML.trim();
      }
      if(typeof render==='function'){
        render('dashboard');
        return !!content.innerHTML.trim();
      }
    }catch(error){
      console.error('M.A.R.C. dashboard render:',error);
      content.innerHTML='<section class="panel" style="margin:24px"><h2>M.A.R.C. inició sesión correctamente</h2><p>La sesión está activa. Cargando el panel de operaciones…</p></section>';
      return false;
    }
    return false;
  }

  function revealApp(session){
    if(!session)return false;
    const sessionId=session.access_token||session.user?.id||'';
    lastSessionId=sessionId;
    if(!showShell(session))return false;

    // The authentication callback can finish before the rest of the M.A.R.C.
    // modules have completed loading. Render again after the page is ready.
    const attempt=()=>{
      if(!showShell(session))return false;
      return renderDashboard();
    };

    if(document.readyState==='complete'){
      attempt();
      [100,400,1000,2000].forEach(ms=>setTimeout(attempt,ms));
    }else{
      window.addEventListener('load',()=>{
        attempt();
        [100,400,1000].forEach(ms=>setTimeout(attempt,ms));
      },{once:true});
    }
    return true;
  }

  async function restoreSession(){
    const sb=getClient();
    if(!sb)return false;
    try{
      const {data,error}=await sb.auth.getSession();
      if(error)throw error;
      if(data?.session)return revealApp(data.session);
      return false;
    }catch(error){
      console.error('M.A.R.C. session restore:',error);
      return false;
    }
  }

  function watchSession(){
    const sb=getClient();
    if(!sb||sb.__marcGoogleWatcher)return;
    sb.__marcGoogleWatcher=true;
    sb.auth.onAuthStateChange((event,session)=>{
      if(session)revealApp(session);
      else if(event==='SIGNED_OUT'){
        const authScreen=document.querySelector('#authScreen');
        const appShell=document.querySelector('#appShell');
        if(authScreen)authScreen.hidden=false;
        if(appShell)appShell.hidden=true;
      }
    });
  }

  async function login(e){
    if(e){e.preventDefault();e.stopPropagation();}
    const button=document.querySelector('#googleSignIn');
    if(!button||button.dataset.busy==='1')return;
    const sb=getClient();
    if(!sb){
      message('No se pudo cargar el sistema de autenticación. Recarga M.A.R.C.','error');
      return;
    }
    button.dataset.busy='1';
    button.disabled=true;
    message('Conectando con Google...');
    try{
      const redirectTo=window.location.origin+window.location.pathname;
      const {data,error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo}});
      if(error)throw error;
      if(!data?.url)throw new Error('Google no devolvió la URL de autenticación.');
      window.location.assign(data.url);
    }catch(error){
      console.error('M.A.R.C. Google OAuth:',error);
      message(error?.message||'No se pudo iniciar sesión con Google.','error');
      button.dataset.busy='0';
      button.disabled=false;
    }
  }

  function bind(){
    const button=document.querySelector('#googleSignIn');
    if(!button||bound)return !!button;
    bound=true;
    button.addEventListener('click',login,false);
    const sync=()=>{button.hidden=document.querySelector('#authTitle')?.textContent==='Recuperar contraseña';};
    const title=document.querySelector('#authTitle');
    if(title)new MutationObserver(sync).observe(title,{childList:true,characterData:true,subtree:true});
    sync();
    return true;
  }

  function start(){
    const timer=setInterval(()=>{
      const sb=getClient();
      if(sb)watchSession();
      bind();
      if(sb&&bound)clearInterval(timer);
    },100);
    setTimeout(()=>clearInterval(timer),15000);

    [0,300,800,1500,3000].forEach(ms=>setTimeout(()=>{
      restoreSession();
    },ms));
  }

  start();
})();

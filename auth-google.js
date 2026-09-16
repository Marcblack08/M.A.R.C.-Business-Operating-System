/* M.A.R.C. — Google OAuth / single Supabase session */
(function(){
  'use strict';

  let bound=false;
  let watcherBound=false;

  function client(){
    return window.supabaseClient||null;
  }

  function message(text,type){
    if(typeof window.authMsg==='function')window.authMsg(text,type);
    else{
      const el=document.querySelector('#authMessage');
      if(el){el.textContent=text;el.className=`auth-message ${type||''}`;}
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
    if(!content||typeof window.render!=='function')return false;
    try{
      window.render('dashboard');
      return !!content.innerHTML.trim();
    }catch(error){
      console.error('M.A.R.C. dashboard render error:',error);
      // Do not send the user back to authentication because a UI module failed.
      // Keep the authenticated shell visible; the exact runtime error stays in the console.
      return false;
    }
  }

  function revealApp(session){
    if(!session)return false;
    if(!showShell(session))return false;

    const attempt=()=>{
      if(!showShell(session))return false;
      return renderDashboard();
    };

    if(document.readyState==='complete'){
      attempt();
      [150,500,1200,2500].forEach(ms=>setTimeout(attempt,ms));
    }else{
      window.addEventListener('load',()=>{
        attempt();
        [150,500,1200].forEach(ms=>setTimeout(attempt,ms));
      },{once:true});
    }
    return true;
  }

  async function restoreSession(){
    const sb=client();
    if(!sb)return false;
    try{
      const {data,error}=await sb.auth.getSession();
      if(error)throw error;
      return data?.session?revealApp(data.session):false;
    }catch(error){
      console.error('M.A.R.C. session restore error:',error);
      return false;
    }
  }

  function watchSession(){
    const sb=client();
    if(!sb||watcherBound)return;
    watcherBound=true;
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
    const sb=client();
    if(!button||button.dataset.busy==='1')return;
    if(!sb){
      message('M.A.R.C. todavía está cargando. Intenta nuevamente.','error');
      return;
    }
    button.dataset.busy='1';
    button.disabled=true;
    message('Conectando con Google...');
    try{
      const redirectTo=window.location.origin+window.location.pathname;
      const {data,error}=await sb.auth.signInWithOAuth({
        provider:'google',
        options:{redirectTo,skipBrowserRedirect:false}
      });
      if(error)throw error;
      if(data?.url && !window.location.href.startsWith(data.url)){
        // Normally Supabase performs the browser redirect itself.
        window.location.assign(data.url);
      }
    }catch(error){
      console.error('M.A.R.C. Google OAuth error:',error);
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
    const sync=()=>{
      button.hidden=document.querySelector('#authTitle')?.textContent==='Recuperar contraseña';
    };
    const title=document.querySelector('#authTitle');
    if(title)new MutationObserver(sync).observe(title,{childList:true,characterData:true,subtree:true});
    sync();
    return true;
  }

  function start(){
    const boot=()=>{
      const sb=client();
      if(sb)watchSession();
      bind();
      if(sb)restoreSession();
    };

    if(document.readyState==='complete')boot();
    else window.addEventListener('load',boot,{once:true});

    [100,300,800,1500,3000].forEach(ms=>setTimeout(()=>{
      const sb=client();
      if(sb){watchSession();restoreSession();}
      bind();
    },ms));
  }

  start();
})();

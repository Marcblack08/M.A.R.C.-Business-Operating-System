/* M.A.R.C. — Google OAuth */
(function(){
  'use strict';

  // Google must use the SAME Supabase client as app.js. Two independent
  // clients can race while restoring the OAuth callback session.
  let bound=false;
  let sessionWatcherBound=false;

  function message(text,type){
    if(typeof window.authMsg==='function')window.authMsg(text,type);
    else{
      const el=document.querySelector('#authMessage');
      if(el){el.textContent=text;el.className=`auth-message ${type||''}`;}
    }
  }

  function getClient(){
    return window.supabaseClient||null;
  }

  function revealApp(session){
    if(!session)return false;

    // Prefer the application's own function when available.
    if(typeof window.marcShowApp==='function'){
      window.marcShowApp(session);
      return true;
    }

    // Fallback for the current app.js, whose showApp is not global yet.
    const authScreen=document.querySelector('#authScreen');
    const appShell=document.querySelector('#appShell');
    if(!authScreen||!appShell)return false;

    authScreen.hidden=true;
    appShell.hidden=false;
    const email=session.user?.email||'';
    const emailEl=document.querySelector('#userEmail');
    const companyEl=document.querySelector('#companyUser');
    const nameEl=document.querySelector('#userName');
    const name=email.split('@')[0]||'Usuario';
    if(emailEl)emailEl.textContent=email;
    if(companyEl)companyEl.textContent=name;
    if(nameEl)nameEl.textContent=name;
    if(typeof window.render==='function')window.render('dashboard');
    return true;
  }

  async function restoreSession(){
    const client=getClient();
    if(!client)return false;

    try{
      const {data,error}=await client.auth.getSession();
      if(error)throw error;
      if(data?.session)return revealApp(data.session);
    }catch(error){
      console.error('M.A.R.C. Google session restore:',error);
    }
    return false;
  }

  function watchSession(){
    const client=getClient();
    if(!client||sessionWatcherBound)return;
    sessionWatcherBound=true;
    client.auth.onAuthStateChange((event,session)=>{
      if(session)revealApp(session);
    });
  }

  async function login(e){
    if(e){e.preventDefault();e.stopPropagation();}
    const button=document.querySelector('#googleSignIn');
    if(!button)return;
    if(button.dataset.busy==='1')return;

    const client=getClient();
    if(!client){
      message('M.A.R.C. todavía está inicializando la autenticación. Inténtalo nuevamente.','error');
      return;
    }

    button.dataset.busy='1';
    button.disabled=true;
    message('Conectando con Google...');

    try{
      const redirectTo=window.location.origin+window.location.pathname;
      const {data,error}=await client.auth.signInWithOAuth({
        provider:'google',
        options:{redirectTo}
      });
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

    const sync=()=>{
      button.hidden=document.querySelector('#authTitle')?.textContent==='Recuperar contraseña';
    };
    const title=document.querySelector('#authTitle');
    if(title)new MutationObserver(sync).observe(title,{childList:true,characterData:true,subtree:true});
    sync();
    return true;
  }

  function start(){
    const timer=setInterval(()=>{
      const client=getClient();
      if(client){
        watchSession();
        restoreSession();
      }
      if(bind()&&client)clearInterval(timer);
    },100);
    setTimeout(()=>clearInterval(timer),15000);

    // Explicit callback recovery attempts. Supabase's detectSessionInUrl
    // handles the OAuth URL; these calls make the UI wait for that session
    // instead of immediately remaining on the login screen.
    [250,750,1500,3000].forEach(ms=>setTimeout(()=>restoreSession(),ms));
  }

  start();
})();

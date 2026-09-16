/* M.A.R.C. — Google OAuth + session bootstrap, single Supabase client */
(function(){
  'use strict';

  let googleBound=false;
  let sessionBound=false;

  function getClient(){
    return window.supabaseClient || null;
  }

  function showMessage(text,type=''){
    const el=document.querySelector('#authMessage');
    if(el){el.textContent=text;el.className=`auth-message ${type}`;}
  }

  function applySession(session){
    if(!session)return false;
    const auth=document.querySelector('#authScreen');
    const shell=document.querySelector('#appShell');
    if(!auth||!shell)return false;

    const email=session.user?.email||'';
    const name=email.split('@')[0]||'Usuario';
    const emailEl=document.querySelector('#userEmail');
    const companyEl=document.querySelector('#companyUser');
    const nameEl=document.querySelector('#userName');
    if(emailEl)emailEl.textContent=email;
    if(companyEl)companyEl.textContent=name;
    if(nameEl)nameEl.textContent=name;

    auth.hidden=true;
    shell.hidden=false;
    return true;
  }

  function renderAfterAuth(){
    const content=document.querySelector('#content');
    if(!content||typeof window.render!=='function')return;
    try{window.render('dashboard');}
    catch(error){console.error('M.A.R.C. render:',error);}
  }

  async function restoreSession(){
    const sb=getClient();
    if(!sb)return;
    try{
      const {data,error}=await sb.auth.getSession();
      if(error)throw error;
      if(data?.session){
        applySession(data.session);
        // Render only after all scripts in index.html have been evaluated.
        if(document.readyState==='complete')renderAfterAuth();
        else window.addEventListener('load',renderAfterAuth,{once:true});
      }
    }catch(error){
      console.error('M.A.R.C. session restore:',error);
    }
  }

  function bindSession(){
    const sb=getClient();
    if(!sb||sessionBound)return;
    sessionBound=true;
    sb.auth.onAuthStateChange((event,session)=>{
      if(session){
        applySession(session);
        if(document.readyState==='complete')renderAfterAuth();
        else window.addEventListener('load',renderAfterAuth,{once:true});
      }else if(event==='SIGNED_OUT'){
        const auth=document.querySelector('#authScreen');
        const shell=document.querySelector('#appShell');
        if(auth)auth.hidden=false;
        if(shell)shell.hidden=true;
      }
    });
  }

  async function googleLogin(event){
    event?.preventDefault();
    event?.stopPropagation();

    const button=document.querySelector('#googleSignIn');
    const sb=getClient();
    if(!button||button.dataset.busy==='1')return;
    if(!sb){
      showMessage('La autenticación todavía está iniciando. Espera un momento y vuelve a intentarlo.','error');
      return;
    }

    button.dataset.busy='1';
    button.disabled=true;
    showMessage('Conectando con Google...');

    try{
      const redirectTo=window.location.origin+window.location.pathname;
      const {data,error}=await sb.auth.signInWithOAuth({
        provider:'google',
        options:{redirectTo}
      });
      if(error)throw error;
      if(data?.url)window.location.assign(data.url);
    }catch(error){
      console.error('M.A.R.C. Google OAuth:',error);
      showMessage(error?.message||'No se pudo iniciar sesión con Google.','error');
      button.dataset.busy='0';
      button.disabled=false;
    }
  }

  function bindGoogle(){
    const button=document.querySelector('#googleSignIn');
    if(!button||googleBound)return;
    googleBound=true;
    button.addEventListener('click',googleLogin,false);
  }

  function boot(){
    // app.js is responsible for creating the single Supabase client and
    // for email/password authentication. This file only adds Google + restore.
    bindGoogle();
    bindSession();
    restoreSession();
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',boot,{once:true});
  }else{
    boot();
  }
})();

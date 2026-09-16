/* M.A.R.C. — Authentication bridge */
(function(){
  'use strict';

  const URL='https://hmnzzknuiejchypalpig.supabase.co';
  const KEY='sb_publishable_mhRoYMQTWrmYpuclqzQ1MA_6TMtGikq';
  let client=null;
  let googleBound=false;
  let submitBound=false;
  let sessionBound=false;

  function getClient(){
    if(window.supabaseClient)return window.supabaseClient;
    if(client)return client;
    if(window.supabase && typeof window.supabase.createClient==='function'){
      try{
        client=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
        window.supabaseClient=client;
        return client;
      }catch(error){
        console.error('M.A.R.C. Supabase init:',error);
      }
    }
    return null;
  }

  function msg(text,type){
    const el=document.querySelector('#authMessage');
    if(el){el.textContent=text||'';el.className=`auth-message ${type||''}`;}
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

  function openApp(session){
    if(!session)return false;
    const auth=document.querySelector('#authScreen');
    const shell=document.querySelector('#appShell');
    if(!auth||!shell)return false;
    setUser(session);
    auth.hidden=true;
    shell.hidden=false;
    return true;
  }

  function renderDashboard(){
    const content=document.querySelector('#content');
    if(!content || typeof window.render!=='function')return;
    try{window.render('dashboard');}
    catch(error){console.error('M.A.R.C. dashboard render:',error);}
  }

  async function restore(){
    const sb=getClient();
    if(!sb)return false;
    try{
      const result=await sb.auth.getSession();
      if(result.error)throw result.error;
      if(result.data?.session){
        openApp(result.data.session);
        setTimeout(renderDashboard,0);
        return true;
      }
    }catch(error){
      console.error('M.A.R.C. session restore:',error);
    }
    return false;
  }

  async function loginSubmit(event){
    event.preventDefault();
    event.stopImmediatePropagation();
    const sb=getClient();
    if(!sb){
      msg('No se pudo inicializar la autenticación. Recarga M.A.R.C.','error');
      return;
    }
    const email=(document.querySelector('#authEmail')?.value||'').trim();
    const password=document.querySelector('#authPassword')?.value||'';
    const title=document.querySelector('#authTitle')?.textContent||'';
    const button=document.querySelector('#authSubmit');
    if(!email || (!password && title!=='Recuperar contraseña'))return;
    if(button)button.disabled=true;
    msg('Verificando acceso...');
    try{
      if(title==='Recuperar contraseña'){
        const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
        if(error)throw error;
        msg('Revisa tu correo para restablecer tu contraseña.','success');
      }else if(title==='Crear cuenta'){
        const confirm=document.querySelector('#authConfirmPassword')?.value||'';
        if(password!==confirm)throw new Error('Las contraseñas no coinciden.');
        const {data,error}=await sb.auth.signUp({email,password});
        if(error)throw error;
        if(data?.session){openApp(data.session);setTimeout(renderDashboard,0);}
        else msg('Cuenta creada. Revisa tu correo para confirmar la cuenta.','success');
      }else{
        const {data,error}=await sb.auth.signInWithPassword({email,password});
        if(error)throw error;
        openApp(data.session);
        setTimeout(renderDashboard,0);
      }
    }catch(error){
      console.error('M.A.R.C. login:',error);
      msg(error?.message||'No se pudo iniciar sesión.','error');
    }finally{
      if(button)button.disabled=false;
    }
  }

  async function googleLogin(event){
    event.preventDefault();
    event.stopPropagation();
    const sb=getClient();
    const button=document.querySelector('#googleSignIn');
    if(!sb){
      msg('No se pudo inicializar la autenticación. Recarga M.A.R.C.','error');
      return;
    }
    if(!button || button.dataset.busy==='1')return;
    button.dataset.busy='1';
    button.disabled=true;
    msg('Conectando con Google...');
    try{
      const redirectTo=location.origin+location.pathname;
      const {data,error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo}});
      if(error)throw error;
      if(data?.url)location.assign(data.url);
    }catch(error){
      console.error('M.A.R.C. Google OAuth:',error);
      msg(error?.message||'No se pudo iniciar sesión con Google.','error');
      button.dataset.busy='0';
      button.disabled=false;
    }
  }

  function bind(){
    const form=document.querySelector('#authForm');
    if(form && !submitBound){
      submitBound=true;
      form.addEventListener('submit',loginSubmit,true);
    }
    const google=document.querySelector('#googleSignIn');
    if(google && !googleBound){
      googleBound=true;
      google.addEventListener('click',googleLogin,true);
    }
    const sb=getClient();
    if(sb && !sessionBound){
      sessionBound=true;
      sb.auth.onAuthStateChange((event,session)=>{
        if(session){openApp(session);setTimeout(renderDashboard,0);}
        else if(event==='SIGNED_OUT'){
          const auth=document.querySelector('#authScreen');
          const shell=document.querySelector('#appShell');
          if(auth)auth.hidden=false;
          if(shell)shell.hidden=true;
        }
      });
    }
  }

  function boot(){
    bind();
    restore();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
  [100,300,800,1500,3000].forEach(ms=>setTimeout(bind,ms));
})();

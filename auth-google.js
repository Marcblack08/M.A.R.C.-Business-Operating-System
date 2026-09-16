/* M.A.R.C. — Authentication bridge, independent of app.js bootstrap */
(function(){
  'use strict';

  const SUPABASE_URL='https://hmnzzknuiejchypalpig.supabase.co';
  const SUPABASE_KEY='sb_publishable_mhRoYMQTWrmYpuclqzQ1MA_6TMtGikq';
  const SUPABASE_SOURCES=[
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://unpkg.com/@supabase/supabase-js@2'
  ];
  let client=null;
  let googleBound=false;
  let submitBound=false;
  let sessionBound=false;
  let loadingPromise=null;

  function showMessage(text,type){
    const el=document.querySelector('#authMessage');
    if(el){el.textContent=text||'';el.className=`auth-message ${type||''}`;}
  }

  function makeClient(){
    if(client)return client;
    if(window.supabaseClient)return window.supabaseClient;
    if(window.supabase && typeof window.supabase.createClient==='function'){
      client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      window.supabaseClient=client;
      return client;
    }
    return null;
  }

  function ensureClient(){
    const existing=makeClient();
    if(existing)return Promise.resolve(existing);
    if(loadingPromise)return loadingPromise;

    loadingPromise=(async()=>{
      for(const src of SUPABASE_SOURCES){
        try{
          await new Promise((resolve,reject)=>{
            const s=document.createElement('script');
            s.src=src;
            s.async=true;
            s.onload=resolve;
            s.onerror=()=>reject(new Error(`No se pudo cargar ${src}`));
            document.head.appendChild(s);
          });
          const ready=makeClient();
          if(ready)return ready;
        }catch(error){
          console.warn('M.A.R.C. Supabase loader:',error);
        }
      }
      throw new Error('No se pudo cargar el servicio de autenticación. Comprueba tu conexión e inténtalo nuevamente.');
    })();

    return loadingPromise;
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
    if(!content||typeof window.render!=='function')return;
    try{window.render('dashboard');}
    catch(error){console.error('M.A.R.C. dashboard render:',error);}
  }

  async function restore(){
    try{
      const sb=await ensureClient();
      const result=await sb.auth.getSession();
      if(result.error)throw result.error;
      if(result.data?.session){
        openApp(result.data.session);
        setTimeout(renderDashboard,0);
      }
      bindSession(sb);
    }catch(error){
      console.error('M.A.R.C. session restore:',error);
    }
  }

  function bindSession(sb){
    if(!sb||sessionBound)return;
    sessionBound=true;
    sb.auth.onAuthStateChange((event,session)=>{
      if(session){
        openApp(session);
        setTimeout(renderDashboard,0);
      }else if(event==='SIGNED_OUT'){
        const auth=document.querySelector('#authScreen');
        const shell=document.querySelector('#appShell');
        if(auth)auth.hidden=false;
        if(shell)shell.hidden=true;
      }
    });
  }

  async function loginSubmit(event){
    event.preventDefault();
    event.stopImmediatePropagation();
    const button=document.querySelector('#authSubmit');
    try{
      const sb=await ensureClient();
      const email=(document.querySelector('#authEmail')?.value||'').trim();
      const password=document.querySelector('#authPassword')?.value||'';
      const title=document.querySelector('#authTitle')?.textContent||'';
      if(!email || (!password && title!=='Recuperar contraseña'))return;
      if(button)button.disabled=true;
      showMessage('Verificando acceso...');

      if(title==='Recuperar contraseña'){
        const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
        if(error)throw error;
        showMessage('Revisa tu correo para restablecer tu contraseña.','success');
      }else if(title==='Crear cuenta'){
        const confirm=document.querySelector('#authConfirmPassword')?.value||'';
        if(password!==confirm)throw new Error('Las contraseñas no coinciden.');
        const {data,error}=await sb.auth.signUp({email,password});
        if(error)throw error;
        if(data?.session){openApp(data.session);setTimeout(renderDashboard,0);}
        else showMessage('Cuenta creada. Revisa tu correo para confirmar la cuenta.','success');
      }else{
        const {data,error}=await sb.auth.signInWithPassword({email,password});
        if(error)throw error;
        openApp(data.session);
        setTimeout(renderDashboard,0);
      }
      bindSession(sb);
    }catch(error){
      console.error('M.A.R.C. login:',error);
      showMessage(error?.message||'No se pudo iniciar sesión.','error');
    }finally{
      if(button)button.disabled=false;
    }
  }

  async function googleLogin(event){
    event.preventDefault();
    event.stopImmediatePropagation();
    const button=document.querySelector('#googleSignIn');
    if(!button||button.dataset.busy==='1')return;
    button.dataset.busy='1';
    button.disabled=true;
    showMessage('Conectando con Google...');
    try{
      const sb=await ensureClient();
      const redirectTo=location.origin+location.pathname;
      const {data,error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo}});
      if(error)throw error;
      if(data?.url)location.assign(data.url);
      bindSession(sb);
    }catch(error){
      console.error('M.A.R.C. Google OAuth:',error);
      showMessage(error?.message||'No se pudo iniciar sesión con Google.','error');
      button.dataset.busy='0';
      button.disabled=false;
    }
  }

  function bind(){
    const form=document.querySelector('#authForm');
    if(form&&!submitBound){
      submitBound=true;
      // Capture phase: this becomes the single authoritative authentication handler.
      form.addEventListener('submit',loginSubmit,true);
    }
    const google=document.querySelector('#googleSignIn');
    if(google&&!googleBound){
      googleBound=true;
      google.addEventListener('click',googleLogin,true);
    }
    const sb=makeClient();
    if(sb)bindSession(sb);
  }

  function boot(){
    bind();
    restore();
    [100,300,800,1500,3000].forEach(ms=>setTimeout(bind,ms));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();

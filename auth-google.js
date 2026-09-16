/* M.A.R.C. — Google OAuth, isolated and robust */
(function(){
  'use strict';

  const SUPABASE_URL='https://hmnzzknuiejchypalpig.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_mhRoYMQTWrmYpuclqzQ1MA_6TMtGikq';
  let bound=false;
  let clientInstance=null;

  function getClient(){
    if(clientInstance)return clientInstance;
    if(!window.supabase?.createClient)return null;
    try{
      clientInstance=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
      });
      return clientInstance;
    }catch(error){
      console.error('M.A.R.C. Google OAuth: no se pudo crear el cliente Supabase',error);
      return null;
    }
  }

  function message(text,type){
    if(typeof window.authMsg==='function')window.authMsg(text,type);
    else{
      const el=document.querySelector('#authMessage');
      if(el)el.textContent=text;
    }
  }

  async function login(e){
    if(e){e.preventDefault();e.stopPropagation()}
    const button=document.querySelector('#googleSignIn');
    if(!button)return;
    if(button.dataset.busy==='1')return;

    const sb=getClient();
    if(!sb){
      message('El sistema de autenticación todavía está cargando. Recarga la página e inténtalo nuevamente.','error');
      return;
    }

    button.dataset.busy='1';
    button.disabled=true;
    message('Conectando con Google...');

    try{
      const redirectTo=window.location.origin+window.location.pathname;
      const {data,error}=await sb.auth.signInWithOAuth({
        provider:'google',
        options:{redirectTo,skipBrowserRedirect:true}
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
    if(bind())return;
    const timer=setInterval(()=>{if(bind())clearInterval(timer)},100);
    setTimeout(()=>clearInterval(timer),10000);
  }

  // Delegated fallback protects the button if the auth form is rendered after this script.
  document.addEventListener('click',e=>{
    const button=e.target.closest?.('#googleSignIn');
    if(button&&!button.dataset.busy)login(e);
  },true);

  start();
})();

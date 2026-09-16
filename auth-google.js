/* M.A.R.C. — Google OAuth */
(function(){
  'use strict';

  let bound=false;

  function getClient(){
    return window.supabaseClient||null;
  }

  function message(text,type){
    if(typeof window.authMsg==='function')window.authMsg(text,type);
    else{
      const el=document.querySelector('#authMessage');
      if(el){el.textContent=text;el.className=`auth-message ${type||''}`;}
    }
  }

  async function login(e){
    if(e){e.preventDefault();e.stopPropagation();}
    const button=document.querySelector('#googleSignIn');
    const client=getClient();
    if(!button)return;
    if(button.dataset.busy==='1')return;
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

  start();
})();

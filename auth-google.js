/* M.A.R.C. — Google OAuth */
(function(){
  'use strict';
  const client=window.supabaseClient;
  const button=document.querySelector('#googleSignIn');
  if(!client||!button)return;
  button.addEventListener('click',async()=>{
    try{
      if(typeof authMsg==='function')authMsg('Conectando con Google...');
      button.disabled=true;
      const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+window.location.pathname}});
      if(error){if(typeof authMsg==='function')authMsg(error.message,'error');button.disabled=false;}
    }catch(error){
      if(typeof authMsg==='function')authMsg(error?.message||'No se pudo iniciar sesión con Google.','error');
      button.disabled=false;
    }
  });
  const syncVisibility=()=>{button.hidden=document.querySelector('#authTitle')?.textContent==='Recuperar contraseña';};
  const title=document.querySelector('#authTitle');
  if(title)new MutationObserver(syncVisibility).observe(title,{childList:true,characterData:true,subtree:true});
  syncVisibility();
})();

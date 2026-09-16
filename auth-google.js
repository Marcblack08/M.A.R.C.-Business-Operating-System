/* M.A.R.C. — Google OAuth, robust */
(function(){
  'use strict';
  let bound=false;
  function getClient(){return window.supabaseClient||null}
  function msg(text,type){if(typeof window.authMsg==='function')window.authMsg(text,type);else{const el=document.querySelector('#authMessage');if(el)el.textContent=text}}
  async function login(){
    const button=document.querySelector('#googleSignIn');
    const client=getClient();
    if(!button){return}
    if(!client){msg('M.A.R.C. todavía está cargando. Intenta nuevamente.','error');return}
    if(button.dataset.busy==='1')return;
    button.dataset.busy='1';button.disabled=true;msg('Conectando con Google...');
    try{
      const redirectTo=window.location.origin+window.location.pathname;
      const result=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo,skipBrowserRedirect:false}});
      if(result?.error)throw result.error;
      // Supabase normally redirects the browser. Keep the button locked while navigation starts.
    }catch(error){
      console.error('M.A.R.C. Google OAuth:',error);
      msg(error?.message||'No se pudo iniciar sesión con Google.','error');
      button.dataset.busy='0';button.disabled=false;
    }
  }
  function bind(){
    const button=document.querySelector('#googleSignIn');
    if(!button||bound)return !!button;
    bound=true;
    button.addEventListener('click',login,{passive:false});
    const sync=()=>{button.hidden=document.querySelector('#authTitle')?.textContent==='Recuperar contraseña'};
    const title=document.querySelector('#authTitle');
    if(title)new MutationObserver(sync).observe(title,{childList:true,characterData:true,subtree:true});
    sync();
    return true;
  }
  // index.html loads this file after app.js, but retrying protects against cached/async script order.
  if(!bind()){
    const timer=setInterval(()=>{if(bind())clearInterval(timer)},100);
    setTimeout(()=>clearInterval(timer),10000);
  }
  // Delegated fallback: even if the direct listener was missed, the button remains functional.
  document.addEventListener('click',e=>{const b=e.target.closest?.('#googleSignIn');if(b&&!b.dataset.busy){e.preventDefault();login()}},true);
})();

/* M.A.R.C. — Google OAuth */
(function(){
  'use strict';
  let bound=false;
  function client(){return window.supabaseClient||null}
  function message(text,type){
    if(typeof window.authMsg==='function')window.authMsg(text,type);
    else{const el=document.querySelector('#authMessage');if(el)el.textContent=text}
  }
  async function login(e){
    if(e){e.preventDefault();e.stopPropagation()}
    const button=document.querySelector('#googleSignIn');
    const sb=client();
    if(!button)return;
    if(!sb){message('M.A.R.C. todavía está cargando. Recarga la página e inténtalo nuevamente.','error');return}
    if(button.dataset.busy==='1')return;
    button.dataset.busy='1';button.disabled=true;message('Conectando con Google...');
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
      button.dataset.busy='0';button.disabled=false;
    }
  }
  function bind(){
    const button=document.querySelector('#googleSignIn');
    if(!button||bound)return !!button;
    bound=true;
    button.addEventListener('click',login,false);
    const sync=()=>{button.hidden=document.querySelector('#authTitle')?.textContent==='Recuperar contraseña'};
    const title=document.querySelector('#authTitle');
    if(title)new MutationObserver(sync).observe(title,{childList:true,characterData:true,subtree:true});
    sync();
    return true;
  }
  if(!bind()){
    const timer=setInterval(()=>{if(bind())clearInterval(timer)},100);
    setTimeout(()=>clearInterval(timer),10000);
  }
  document.addEventListener('click',e=>{if(e.target.closest?.('#googleSignIn')&&!e.target.closest('#googleSignIn').dataset.busy)login(e)},true);
})();

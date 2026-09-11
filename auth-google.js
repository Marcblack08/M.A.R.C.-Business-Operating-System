const googleSignInButton=document.querySelector('#googleSignIn');
if(googleSignInButton){
  googleSignInButton.addEventListener('click',async()=>{
    authMsg('Conectando con Google...');
    googleSignInButton.disabled=true;
    const{error}=await supabaseClient.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+window.location.pathname}});
    if(error){authMsg(error.message,'error');googleSignInButton.disabled=false;}
  });
  const syncGoogleVisibility=()=>{googleSignInButton.hidden=document.querySelector('#authTitle')?.textContent==='Recuperar contraseña';};
  const title=document.querySelector('#authTitle');
  if(title)new MutationObserver(syncGoogleVisibility).observe(title,{childList:true,characterData:true,subtree:true});
  syncGoogleVisibility();
}

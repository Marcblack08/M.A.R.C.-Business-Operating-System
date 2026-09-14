const MARC_SUPABASE_URL='https://hmnzzknuiejchypalpig.supabase.co';
const MARC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_mhRoYMQTWrmYpuclqzQ1MA_6TMtGikq';
const marcGoogleClient=window.supabase.createClient(MARC_SUPABASE_URL,MARC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
// Compatibilidad: los módulos de M.A.R.C. consumen el cliente desde window.
window.supabaseClient=marcGoogleClient;

const googleSignInButton=document.querySelector('#googleSignIn');
if(googleSignInButton){
  googleSignInButton.addEventListener('click',async()=>{
    authMsg('Conectando con Google...');
    googleSignInButton.disabled=true;
    const{error}=await marcGoogleClient.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+window.location.pathname}});
    if(error){authMsg(error.message,'error');googleSignInButton.disabled=false;}
  });
  const syncGoogleVisibility=()=>{googleSignInButton.hidden=document.querySelector('#authTitle')?.textContent==='Recuperar contraseña';};
  const title=document.querySelector('#authTitle');
  if(title)new MutationObserver(syncGoogleVisibility).observe(title,{childList:true,characterData:true,subtree:true});
  syncGoogleVisibility();
}

marcGoogleClient.auth.getSession().then(({data})=>{
  if(data?.session && typeof showApp==='function') showApp(data.session);
});
marcGoogleClient.auth.onAuthStateChange((event,session)=>{
  if(session && typeof showApp==='function') showApp(session);
});

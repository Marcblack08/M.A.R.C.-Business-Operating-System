/* M.A.R.C. — fixes de navegación y persistencia */
(function(){
  const validSections=new Set(['dashboard','clients','products','services','inventory','quotes','reports','documents','ai','company','settings']);
  let current=location.hash.replace(/^#/,'');
  if(!validSections.has(current)) current='dashboard';
  const originalRender=window.render;
  if(typeof originalRender==='function'){
    window.render=function(section='dashboard'){
      if(validSections.has(section)) current=section;
      originalRender(section);
    };
  }
  const originalShowApp=window.showApp;
  if(typeof originalShowApp==='function'){
    window.showApp=function(session){
      if(!session)return;
      const authScreen=document.querySelector('#authScreen'),appShell=document.querySelector('#appShell');
      if(authScreen)authScreen.hidden=true;
      if(appShell)appShell.hidden=false;
      const email=session.user?.email||'';
      const set=(id,v)=>{const el=document.querySelector(id);if(el)el.textContent=v;};
      set('#userEmail',email);set('#companyUser',email.split('@')[0]||'Usuario');set('#userName',email.split('@')[0]||'Usuario');
      if(validSections.has(current)) originalRender(current); else originalShowApp(session);
    };
  }
  document.addEventListener('click',function(e){
    const nav=e.target.closest?.('.nav-item');
    if(nav&&validSections.has(nav.dataset.section)){
      current=nav.dataset.section;
      history.replaceState(null,'','#'+current);
    }
  },true);
  window.addEventListener('hashchange',()=>{
    const section=location.hash.replace(/^#/,'');
    if(validSections.has(section)){current=section;if(typeof window.render==='function')window.render(section);}
  });
  const NativeFormData=window.FormData;
  if(NativeFormData){
    window.FormData=function(form,...args){
      if(form && !(form instanceof HTMLFormElement)) form=document.querySelector('#productForm')||form;
      if(!form) form=document.querySelector('#productForm')||undefined;
      return form===undefined ? new NativeFormData(...args) : new NativeFormData(form,...args);
    };
    window.FormData.prototype=NativeFormData.prototype;
  }
  // Recupera el icono de Google si el HTML fue cacheado con un SVG incompleto.
  const fixGoogle=()=>{
    const svg=document.querySelector('#googleSignIn svg');
    if(!svg)return;
    svg.innerHTML='<path fill="#4285F4" d="M21.35 12.23c0-.74-.07-1.46-.21-2.14H12v4.05h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.3Z"/><path fill="#34A853" d="M12 21.7c2.63 0 4.84-.87 6.45-2.37l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03l-3.24 2.53A9.74 9.74 0 0 0 12 21.7Z"/><path fill="#FBBC05" d="M6.54 13.77A5.85 5.85 0 0 1 6.23 12c0-.62.11-1.22.31-1.77V7.7H3.3A9.73 9.73 0 0 0 2.27 12c0 1.57.38 3.05 1.03 4.3l3.24 2.53Z"/><path fill="#EA4335" d="M12 6.2c1.43 0 2.71.49 3.72 1.46l2.79-2.79C16.84 3.27 14.63 2.3 12 2.3a9.74 9.74 0 0 0-8.7 5.4l3.24 2.53C7.31 7.92 9.46 6.2 12 6.2Z"/>';
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fixGoogle);else fixGoogle();
})();

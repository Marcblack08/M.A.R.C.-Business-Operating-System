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
})();

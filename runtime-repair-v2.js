/* M.A.R.C. — Runtime repair v2
   Restores the canonical render path when an older cached wrapper has replaced it.
*/
(function(){
  'use strict';

  const validSections=new Set(['dashboard','clients','products','services','inventory','quotes','reports','documents','ai','company','settings']);
  const legacyRender=typeof window.render==='function' && window.render!==window.__MARC_SAFE_RENDER ? window.render : null;

  function getContent(){return document.querySelector('#content');}

  function safeRender(section='dashboard'){
    const content=getContent();
    if(!content)return false;
    if(!validSections.has(section))section='dashboard';

    try{
      /* Dashboard is rendered directly from the canonical app function.
         This bypasses any stale wrapper that calls the removed oldRender symbol. */
      if(section==='dashboard' && typeof window.dashboard==='function'){
        content.innerHTML=window.dashboard();
      }else if(section==='ai' && typeof window.aiPage==='function'){
        content.innerHTML=window.aiPage();
      }else if(section==='reports' && typeof window.MARC_REPORTS_CENTER_RENDER==='function'){
        window.MARC_REPORTS_CENTER_RENDER();
      }else if(legacyRender){
        /* Preserve the existing module renderers for non-dashboard sections. */
        try{
          legacyRender(section);
        }catch(moduleError){
          console.warn('M.A.R.C. legacy renderer failed; using simple page fallback:',moduleError);
          if(typeof window.simplePage==='function')content.innerHTML=window.simplePage(section);
          else throw moduleError;
        }
      }else if(typeof window.simplePage==='function'){
        content.innerHTML=window.simplePage(section);
      }else{
        content.innerHTML='<section class="panel" style="margin:24px"><h2>M.A.R.C.</h2><p>El módulo principal todavía está cargando. Vuelve a intentar en unos segundos.</p></section>';
        return false;
      }

      document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.section===section));
      return !!content.innerHTML.trim();
    }catch(error){
      console.error('M.A.R.C. safe render error:',error);
      content.innerHTML=`<section class="panel" style="margin:24px"><h2>M.A.R.C.</h2><p>No se pudo cargar el módulo solicitado.</p><small>${String(error?.message||error)}</small></section>`;
      return false;
    }
  }

  window.__MARC_SAFE_RENDER=safeRender;
  window.render=safeRender;

  /* Patch the global app entry point so authentication always lands on a valid dashboard. */
  window.showApp=function(session){
    if(!session)return;
    const auth=document.querySelector('#authScreen');
    const shell=document.querySelector('#appShell');
    if(auth)auth.hidden=true;
    if(shell)shell.hidden=false;

    const email=session.user?.email||'';
    const name=email.split('@')[0]||'Usuario';
    const set=(id,value)=>{const el=document.querySelector(id);if(el)el.textContent=value};
    set('#userEmail',email);
    set('#companyUser',name);
    set('#userName',name);

    safeRender(location.hash.replace(/^#/,'')||'dashboard');
  };

  function boot(){
    const shell=document.querySelector('#appShell');
    const content=document.querySelector('#content');
    if(shell && !shell.hidden && content){
      /* Replace an error card produced by the stale bootstrap with the real dashboard. */
      const text=content.textContent||'';
      if(!content.innerHTML.trim() || text.includes('oldRender is not a function')){
        safeRender(location.hash.replace(/^#/,'')||'dashboard');
      }
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});
  else setTimeout(boot,0);
  window.addEventListener('load',()=>setTimeout(boot,80),{once:true});
})();

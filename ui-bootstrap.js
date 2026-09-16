/* M.A.R.C. — UI bootstrap guard */
(function(){
  'use strict';

  let attempts=0;
  const maxAttempts=12;

  function content(){return document.querySelector('#content');}
  function shellVisible(){return !!document.querySelector('#appShell:not([hidden])');}

  function render(){
    const el=content();
    if(!el||!shellVisible())return false;
    try{
      if(typeof window.render==='function'){
        window.render('dashboard');
        return !!el.innerHTML.trim();
      }
      if(typeof window.dashboard==='function'){
        el.innerHTML=window.dashboard();
        return true;
      }
    }catch(error){
      console.error('M.A.R.C. UI bootstrap render error:',error);
      el.innerHTML=`<section class="panel" style="margin:24px"><h2>M.A.R.C.</h2><p>La sesión está activa, pero el panel no pudo cargarse.</p><small>${String(error?.message||error)}</small></section>`;
      return true;
    }
    return false;
  }

  function ensure(){
    attempts++;
    const el=content();
    if(!shellVisible()||!el){
      if(attempts<maxAttempts)setTimeout(ensure,250);
      return;
    }
    if(!el.innerHTML.trim()){
      if(!render()&&attempts<maxAttempts)setTimeout(ensure,250);
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure,{once:true});
  else ensure();
  window.addEventListener('load',()=>setTimeout(ensure,50),{once:true});
})();

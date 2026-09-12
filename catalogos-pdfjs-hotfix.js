/* M.A.R.C. PDF.js hotfix
   Evita que el motor de catálogos se bloquee esperando IA.
   PDF.js sigue siendo el primer método. Si una página no tiene texto,
   el motor existente puede pasar a su OCR local sin esperar 45 s a la IA.
*/
(()=>{
  'use strict';
  const originalFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:(input?.url||'');
    if(url.includes('/api/analyze-catalog-page')){
      return new Response(JSON.stringify({error:'IA desactivada: el lector de catálogos usa PDF.js primero.'}),{status:429,headers:{'Content-Type':'application/json'}});
    }
    return originalFetch(input,init);
  };
  const fix=()=>{
    const engine=document.querySelector('.cat-engine span');
    if(engine)engine.textContent='PDF.js → texto → OCR local';
    const head=document.querySelector('#catv2Panel .cat-head p:not(.eyebrow)');
    if(head)head.textContent='PDF.js extrae el texto página por página. Las páginas escaneadas pasan directamente a OCR local.';
  };
  new MutationObserver(fix).observe(document.body,{childList:true,subtree:true});
  setTimeout(fix,500);
})();

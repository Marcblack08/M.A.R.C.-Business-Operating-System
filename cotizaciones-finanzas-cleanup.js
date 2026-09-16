/* M.A.R.C. — limpieza del módulo financiero legado
   El selector de estado oficial vive en cotizaciones-estados-ui.js.
   Este parche elimina cualquier selector antiguo que el módulo de ganancias
   haya colocado accidentalmente en la columna Acción. */
(function(){
'use strict';
function clean(){
  document.querySelectorAll('.marc-q-table tbody tr').forEach(row=>{
    const action=row.querySelector('.marc-q-actions');
    if(action) action.querySelectorAll('[data-quote-status],.marc-status-select').forEach(x=>x.remove());
  });
}
new MutationObserver(()=>setTimeout(clean,30)).observe(document.body,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(clean,100));
setInterval(clean,1000);
setTimeout(clean,600);
})();

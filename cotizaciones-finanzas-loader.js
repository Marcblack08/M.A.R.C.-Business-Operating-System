/* M.A.R.C. — carga de módulos financieros, estado y limpieza */
(function(){
  const load=(id,src)=>{
    if(document.querySelector(`script[data-marc="${id}"]`))return;
    const s=document.createElement('script');
    s.src=src;
    s.dataset.marc=id;
    document.body.appendChild(s);
  };
  // Un único selector de estado; el módulo financiero legado ya no debe crear otro.
  load('quote-status-ui','./cotizaciones-estados-ui.js?v=4');
  load('quote-finance-cleanup','./cotizaciones-finanzas-cleanup.js?v=1');
})();

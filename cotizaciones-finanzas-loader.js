/* M.A.R.C. — carga de finanzas y selector de estados */
(function(){
  const load=(id,src)=>{if(document.querySelector(`script[data-marc="${id}"]`))return;const s=document.createElement('script');s.src=src;s.dataset.marc=id;document.body.appendChild(s)};
  load('quote-finance','./cotizaciones-ganancias.js?v=4');
  load('quote-status-ui','./cotizaciones-estados-ui.js?v=1');
})();

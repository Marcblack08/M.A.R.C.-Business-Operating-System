/* M.A.R.C. — carga de módulos financieros y estado */
(function(){
  const load=(id,src)=>{
    if(document.querySelector(`script[data-marc="${id}"]`))return;
    const s=document.createElement('script');
    s.src=src;
    s.dataset.marc=id;
    document.body.appendChild(s);
  };
  // El selector de estado tiene un único dueño. El módulo financiero anterior
  // también intentaba crear otro <select> y refrescaba la página al cambiarlo.
  load('quote-status-ui','./cotizaciones-estados-ui.js?v=4');
})();

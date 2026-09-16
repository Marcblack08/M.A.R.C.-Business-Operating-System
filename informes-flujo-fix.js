/* M.A.R.C. — flujo limpio del Centro de Informes */
(function(){'use strict';
function css(){if(document.getElementById('marc-informes-flow-css'))return;const s=document.createElement('style');s.id='marc-informes-flow-css';s.textContent=`
.marc-reports-v2 .ic-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.marc-reports-v2 .ic-cards + .ic-panel{display:none!important}
.marc-reports-v2 .ic-card{min-height:155px;display:block;position:relative;overflow:hidden}
.marc-reports-v2 .ic-card:after{content:'Abrir informe →';position:absolute;right:18px;bottom:18px;font-size:10px;font-weight:800;color:#087cf5}
.marc-reports-v2 .ic-card .ic-count{padding-bottom:18px}
.marc-report-view{width:100%}.marc-report-view-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.marc-report-view-head h2{margin:0;color:#173b5d;font-size:18px}.marc-report-view-back{border:1px solid #dce8f2;background:#fff;border-radius:10px;padding:9px 12px;color:#087cf5;font-size:10px;font-weight:800;cursor:pointer}.marc-report-view-back:hover{background:#f5faff;border-color:#a8d2f7}
@media(max-width:700px){.marc-reports-v2 .ic-cards{grid-template-columns:1fr;gap:12px}.marc-reports-v2 .ic-card{min-height:145px}}
`;document.head.appendChild(s)}
function cleanHome(){const main=document.getElementById('icMain');if(!main)return;if(main.querySelector('.ic-cards')){main.querySelectorAll('.ic-back').forEach(x=>x.remove());const extra=main.querySelector('.ic-cards + .ic-panel');if(extra)extra.style.display='none'}}
function prepareBeforeReport(){const main=document.getElementById('icMain');if(!main)return;/* openReport() del módulo original añade el informe con insertAdjacentHTML; limpiamos primero para que no se acumulen vistas. */if(main.querySelector('.ic-cards'))main.innerHTML=''}
function bind(){const main=document.getElementById('icMain');if(!main)return;cleanHome();main.querySelectorAll('[data-ic]').forEach(card=>{if(card.dataset.flowBound)return;card.dataset.flowBound='1';card.addEventListener('click',prepareBeforeReport,{capture:true})})}
css();new MutationObserver(()=>bind()).observe(document.body,{childList:true,subtree:true});document.addEventListener('DOMContentLoaded',bind);setTimeout(bind,250);setTimeout(bind,1000);
})();

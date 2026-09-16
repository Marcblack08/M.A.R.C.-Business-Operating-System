/* M.A.R.C. — navegación del centro de informes */
(function(){'use strict';
function rename(){const b=document.querySelector('.nav-item[data-section="reports"]');if(b){const nodes=[...b.childNodes].filter(n=>n.nodeType===3);if(nodes[0])nodes[0].nodeValue='Informes';else b.appendChild(document.createTextNode('Informes'));b.setAttribute('aria-label','Informes')}}
function loadGanancias(){if(document.querySelector('script[data-marc-ganancias]'))return;const s=document.createElement('script');s.src='./informes-ganancias.js?v=1';s.async=true;s.setAttribute('data-marc-ganancias','1');document.body.appendChild(s)}
rename();loadGanancias();new MutationObserver(()=>{rename();loadGanancias()}).observe(document.body,{childList:true,subtree:true})})();

/* M.A.R.C. — Dictado inteligente V2: convierte lenguaje comercial en partidas reales */
(function(){
  'use strict';
  const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const money=v=>'S/ '+Number(v||0).toFixed(2);
  const state=()=>window.__MARC_SMART_QUOTE||null;
  const setMsg=t=>{const e=document.getElementById('qv3voiceMsg');if(e)e.textContent=t};
  const parseNum=s=>{let x=String(s||'').toLowerCase().replace(/\b(soles?|sol|pen)\b/g,'').trim();let m=x.match(/(\d+)\s*mil\s*(\d+)?/);if(m)return Number(m[1])*1000+Number(m[2]||0);m=x.match(/\d[\d\s.,]*/);if(!m)return null;let r=m[0].trim();if(/\d+\.\d{3}$/.test(r))return Number(r.replace(/\./g,''));return Number(r.replace(/\s/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.'))};
  function qty(raw){let m=raw.match(/(?:instalaci[oó]n|instalar|colocaci[oó]n|colocar)\s+de\s+(\d+)\s+(?:c[aá]maras?|unidades?)/i);if(m)return Number(m[1]);m=raw.match(/(\d+)\s+(?:c[aá]maras?|unidades?)\s+IP/i);return m?Number(m[1]):1}
  function unitAfter(raw,patterns){for(const p of patterns){const m=raw.match(p);if(m)return parseNum(m[1])}return null}
  function client(raw){const sel=document.getElementById('qv3client');if(!sel)return null;const b=raw.match(/cliente\s+(?:es\s+)?(?:el\s+)?bloque\s+(\d+)/i);if(b){const n=b[1];const o=[...sel.options].find(x=>new RegExp('\\bbloque\\s*'+n+'\\b','i').test(norm(x.textContent)));if(o){sel.value=o.value;sel.dispatchEvent(new Event('change',{bubbles:true}));return o.textContent.split(' · ')[0]}}const cm=raw.match(/cliente\s+(?:es\s+)?(.+?)(?=\s+(?:ubicaci[oó]n|precio|instalaci[oó]n|materiales?|cada|$))/i);if(cm){const name=cm[1].trim();let o=[...sel.options].find(x=>norm(x.textContent).includes(norm(name)));if(!o){o=document.createElement('option');o.value='__dictado_smart__';o.textContent=name+' · (dictado)';sel.appendChild(o)}sel.value=o.value;sel.dispatchEvent(new Event('change',{bubbles:true}));return name}return null}
  function renderRows(q){const box=document.getElementById('qv3items');if(!box)return;box.innerHTML='<div class="table-scroll"><table><thead><tr><th>Tipo</th><th>Producto / servicio</th><th>Cant.</th><th>P. unit.</th><th>Importe</th></tr></thead><tbody>'+q.items.map(x=>`<tr><td>${x.type}</td><td><b>${x.name}</b><small>Dictado</small></td><td>${x.qty}</td><td>${money(x.unitPrice)}</td><td>${money(x.qty*x.unitPrice)}</td></tr>`).join('')+'</tbody></table></div>';
    const sub=q.total;const totals=document.getElementById('qv3totals');if(totals)totals.innerHTML=`<div class="qv3total"><span>Subtotal <b>${money(sub)}</b></span><span>IGV no aplicado <b>${money(0)}</b></span><strong>TOTAL <b>${money(q.total)}</b></strong></div>`;
    const gain=document.getElementById('qv3gain');if(gain)gain.textContent=money(0);const margin=document.getElementById('qv3margin');if(margin)margin.textContent='Partidas calculadas por dictado';
  }
  function parseSmart(raw){
    raw=String(raw||'').trim();if(!raw)return;
    const n=qty(raw),items=[];
    const camera=unitAfter(raw,[/(?:precio|valor|costo)\s+(?:de\s+)?c[aá]maras?\s*(?:IP)?[^\d]{0,30}([\d.,]+)\s*(?:soles?|s\/\.?|pen)?/i,/c[aá]mara(?:s)?\s*(?:IP)?[^\d]{0,20}([\d.,]+)\s*(?:soles?|s\/\.?|pen)\b/i]);
    if(camera!=null)items.push({type:'PRODUCTO',name:'Cámara IP',qty:n,unitPrice:camera});
    const material=unitAfter(raw,[/(?:materiales?|material)\s*(?:por\s+c[aá]mara)?[^\d]{0,35}([\d.,]+)\s*(?:soles?|s\/\.?|pen)?/i,/([\d.,]+)\s*(?:soles?|s\/\.?|pen)\s*(?:cada\s+uno\s+)?(?:de\s+)?material(?:es)?/i]);
    if(material!=null)items.push({type:'SERVICIO',name:'Materiales por cámara',qty:n,unitPrice:material});
    const install=unitAfter(raw,[/(?:precio|costo|valor)\s+(?:de\s+)?(?:la\s+)?instalaci[oó]n[^\d]{0,35}([\d.,]+)\s*(?:soles?|s\/\.?|pen)?/i,/instalaci[oó]n[^\d]{0,35}([\d.,]+)\s*(?:soles?|s\/\.?|pen)\s*(?:por\s+c[aá]mara)?/i]);
    if(install!=null)items.push({type:'SERVICIO',name:'Instalación de cámara IP',qty:n,unitPrice:install});
    const location=(raw.match(/ubicaci[oó]n\s*(?:es|:)?\s*(.+?)(?=\s+(?:materiales?|precio|instalaci[oó]n|cliente|$))/i)||[])[1];
    if(location){const e=document.getElementById('qv3location');if(e){e.value=location.trim();e.dispatchEvent(new Event('input',{bubbles:true}))}}
    const cn=client(raw);
    if(items.length){const total=items.reduce((s,x)=>s+x.qty*x.unitPrice,0);window.__MARC_SMART_QUOTE={items,total,raw,qty:n};renderRows(window.__MARC_SMART_QUOTE);setMsg(`✓ Dictado convertido: ${n} cámaras · ${items.length} partidas · total ${money(total)}${cn?' · cliente '+cn:''}`);return window.__MARC_SMART_QUOTE}
    setMsg('No se detectaron partidas con precios suficientes. No se inventó información.');return null;
  }
  function voice(){const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return alert('Tu navegador no soporta reconocimiento de voz.');const r=new R();r.lang='es-PE';r.continuous=false;r.interimResults=false;r.onstart=()=>setMsg('Escuchando…');r.onresult=e=>{const t=e.results[0][0].transcript;const ta=document.getElementById('qv3text');if(ta)ta.value=t;parseSmart(t)};r.onend=()=>{};r.onerror=()=>setMsg('No se pudo reconocer el audio.');r.start()}
  function install(){const modal=document.getElementById('qv3modal');if(!modal||modal.dataset.smartV2==='1')return;modal.dataset.smartV2='1';const p=document.getElementById('qv3parse');if(p)p.onclick=()=>parseSmart(document.getElementById('qv3text')?.value||'');const v=document.getElementById('qv3voice');if(v)v.onclick=voice;}
  const obs=new MutationObserver(()=>install());if(document.body)obs.observe(document.body,{childList:true,subtree:true});setInterval(install,500);
  const originalFrom=window.supabaseClient?.from?.bind(window.supabaseClient);
  if(originalFrom){window.supabaseClient.from=function(table){const b=originalFrom(table);if(table==='cotizaciones'){const oi=b.insert.bind(b);b.insert=function(payload){const q=state();if(q){const p=Array.isArray(payload)?payload[0]:payload;if(p){p.subtotal=q.total;p.total=q.total;p.igv=0;p.utilidad=null;p.modalidad_costo=null;p.total_manual=null;p.ubicacion=p.ubicacion||null}}return oi(payload)}}if(table==='cotizacion_items'){const oi=b.insert.bind(b);b.insert=function(payload){const q=state();if(q){const rows=q.items.map((x,i)=>({cotizacion_id:Array.isArray(payload)?payload[0]?.cotizacion_id:payload?.cotizacion_id,user_id:Array.isArray(payload)?payload[0]?.user_id:payload?.user_id,tipo:x.type,producto_id:null,servicio_id:null,codigo:'DICTADO',nombre:x.name,descripcion:'Generado desde dictado: '+q.raw,unidad:'UND',cantidad:x.qty,precio_venta:x.unitPrice,precio_compra:0,costo_total:0,importe:x.qty*x.unitPrice,utilidad:x.qty*x.unitPrice,utilidad_pct:100,orden:i}));return oi(rows)}}}return b}};
})();
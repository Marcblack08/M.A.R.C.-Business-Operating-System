/* M.A.R.C. — Cotizaciones: dictado estructurado V4 */
(function(){
'use strict';
const sb=window.supabaseClient;
let busy=false;
const S={clients:[],products:[],services:[]};
const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const money=v=>`S/ ${Number(v||0).toFixed(2)}`;
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
function amount(s){
 let t=String(s||'').toLowerCase().replace(/soles?|sol|s\//g,'').replace(/[^0-9.,\s]/g,' ').replace(/\s+/g,' ').trim();
 const mil=t.match(/(\d+(?:[.,]\d+)?)\s+mil(?:\s+(\d{1,3}))?/);
 if(mil)return Number(mil[1].replace(',','.'))*1000+Number(mil[2]||0);
 t=t.replace(/\s/g,'');
 if(!t)return 0;
 if(t.includes('.')&&t.includes(',')){return Number(t.replace(/\./g,'').replace(',','.'))||0}
 if((t.match(/\./g)||[]).length===1&&/\.\d{3}$/.test(t))return Number(t.replace('.',''))||0;
 if((t.match(/,/g)||[]).length===1&&/,\d{3}$/.test(t))return Number(t.replace(',',''))||0;
 return Number(t.replace(',','.'))||0;
}
function segment(text,label,next){
 const re=new RegExp('(?:^|[;,])\\s*'+label+'\\s*(?:es|:|,|-)?\\s*(.*?)(?=\\s*(?:'+next+')\\s*(?:es|:|,|-)|$)','i');
 return (text.match(re)?.[1]||'').trim().replace(/[.;,]+$/,'').trim();
}
async function load(){
 const u=(await sb.auth.getUser()).data?.user;if(!u)return;
 const [c,p,s]=await Promise.all([
  sb.from('clientes').select('id,tipo_documento,documento,nombre_razon_social,nombre_contacto,telefono,correo,direccion').eq('user_id',u.id).order('nombre_razon_social'),
  sb.from('productos').select('id,codigo,nombre,descripcion,marca,modelo,unidad,precio_compra,precio_venta,activo,proveedor').eq('user_id',u.id).eq('activo',true).order('nombre'),
  sb.from('servicios').select('id,codigo,nombre,descripcion,categoria,unidad,precio,activo').eq('user_id',u.id).eq('activo',true).order('nombre')
 ]);S.clients=c.data||[];S.products=p.data||[];S.services=s.data||[];
}
function clientFromText(text){
 const clean=norm(text).replace(/^(el\s+)?cliente\s+(es|:)?\s*/,'').trim();
 if(!clean)return null;
 let best=null,score=0;
 S.clients.forEach(c=>{const n=norm(c.nombre_razon_social);if(!n)return;let sc=clean===n?100:clean.includes(n)?90:n.includes(clean)?80:0;if(!sc){const a=clean.split(/\s+/),b=n.split(/\s+/);const hit=a.filter(w=>w.length>2&&b.includes(w)).length;sc=hit?Math.round(hit/Math.max(a.length,b.length)*70):0}if(sc>score){score=sc;best=c}});
 return score>=45?best:null;
}
function fieldValues(text){
 const t=norm(text);
 const out={location:'',mode:'',total:null,duration:'',client:null};
 out.client=clientFromText(t);
 const loc=segment(text,'ubicacion','cliente|costo|modalidad|precio|total|duracion|demora|tarda');
 if(loc)out.location=loc;
 if(/\b(todo\s+costo|todo\s+incluido|llave\s+en\s+mano)\b/i.test(text))out.mode='TODO COSTO';
 else if(/\b(materiales?|suministros?)\b/i.test(text))out.mode='MATERIALES';
 else if(/\bmano\s+de\s+obra\b/i.test(text))out.mode='MANO DE OBRA';
 const tm=text.match(/(?:precio\s+total|total(?:\s+es|\s+de)?|monto\s+total|valor\s+total)\s*(?:es|de|:)?\s*(?:s\/\s*)?((?:\d[\d.,\s]*(?:\s+mil(?:\s+\d{1,3})?)?))/i);
 if(tm)out.total=amount(tm[1]);
 const dm=text.match(/(?:duracion|demora|tarda|tiempo(?:\s+promedio)?)[^,;.]*?((?:\d+(?:[.,]\d+)?)[ ]?(?:dias?|horas?|jornadas?))/i);
 if(dm)out.duration=dm[1];
 return out;
}
function getRows(){
 const m=document.querySelector('#qv3modal');if(!m)return[];
 return [...m.querySelectorAll('#qv3items tbody tr')].map(tr=>{const td=tr.querySelectorAll('td');const code=(td[1]?.querySelector('small')?.textContent||'').split('·')[0].trim();const name=(td[1]?.querySelector('b')?.textContent||'').trim();const qty=Number(tr.querySelector('[data-qty]')?.value||1);const price=Number(tr.querySelector('[data-price]')?.value||0);const type=(td[0]?.textContent||'PRODUCTO').trim();const source=type==='SERVICIO'?S.services:S.products;const found=source.find(x=>String(x.codigo||'')===code)||source.find(x=>norm(x.nombre)===norm(name));const cost=type==='PRODUCTO'?Number(found?.precio_compra||0):0;return{type,id:found?.id||null,code,name,qty,price,cost,descripcion:found?.descripcion||'',unidad:found?.unidad||'UND'};}).filter(x=>x.name);
}
function decorate(){
 const m=document.querySelector('#qv3modal');if(!m||m.dataset.dictadoV4)return;
 m.dataset.dictadoV4='1';
 const grid=m.querySelector('.qv3grid');
 const extra=document.createElement('div');extra.className='qv4fields';extra.innerHTML='<label>Ubicación<input id="qv4location" placeholder="Ej.: Región 6"></label><label>Modalidad de costo<select id="qv4mode"><option value="">No especificada</option><option>TODO COSTO</option><option>MATERIALES</option><option>MANO DE OBRA</option></select></label><label>Precio total dictado<input id="qv4total" type="number" min="0" step="0.01" placeholder="Ej.: 13500"></label>';
 grid?.after(extra);
 const parse=m.querySelector('#qv3parse');if(parse){parse.textContent='✨ Interpretar dictado';parse.onclick=()=>parseDictado()}
 const save=m.querySelector('#qv3save');if(save){save.onclick=()=>saveQuote()}
 const preview=m.querySelector('#qv3preview');if(preview)preview.onclick=()=>previewQuote();
 m.querySelector('#qv3text')?.addEventListener('input',()=>{const f=fieldValues(m.querySelector('#qv3text').value);if(f.location)m.querySelector('#qv4location').value=f.location;if(f.mode)m.querySelector('#qv4mode').value=f.mode;if(f.total!=null)m.querySelector('#qv4total').value=f.total;if(f.duration)m.querySelector('#qv3duration').value=f.duration});
}
function renderSummary(){
 const m=document.querySelector('#qv3modal');if(!m)return;
 const total=Number(m.querySelector('#qv4total')?.value||0),mode=m.querySelector('#qv4mode')?.value,loc=m.querySelector('#qv4location')?.value;
 if(total){const igv=m.querySelector('#qv3igv')?.checked;const rate=Number(m.querySelector('#qv3rate')?.value||18);const sub=igv?total/(1+rate/100):total;const tax=total-sub;m.querySelector('#qv3totals').innerHTML=`<div class="qv3total"><span>Subtotal <b>${money(sub)}</b></span><span>IGV ${igv?'('+rate+'%)':'no aplicado'} <b>${money(tax)}</b></span><strong>TOTAL <b>${money(total)}</b></strong></div>`;m.querySelector('#qv3gain').textContent='S/ 0.00';m.querySelector('#qv3margin').textContent=mode?`Modalidad: ${mode}`:'Total fijado por dictado'}
 const msg=m.querySelector('#qv3voiceMsg');if(msg)msg.textContent=[loc&&`Ubicación: ${loc}`,mode&&`Modalidad: ${mode}`,total&&`Total: ${money(total)}`].filter(Boolean).join(' · ')||'Dictado listo para interpretar.';
}
function parseDictado(){
 const m=document.querySelector('#qv3modal'),text=m?.querySelector('#qv3text')?.value||'';if(!text)return alert('Escribe o dicta primero.');
 const f=fieldValues(text);if(f.client){m.querySelector('#qv3client').value=f.client.id;m.querySelector('#qv3client').dispatchEvent(new Event('change'))}
 if(f.location)m.querySelector('#qv4location').value=f.location;
 if(f.mode)m.querySelector('#qv4mode').value=f.mode;
 if(f.total!=null)m.querySelector('#qv4total').value=f.total;
 if(f.duration)m.querySelector('#qv3duration').value=f.duration;
 let added=0;
 const catalog=[...S.products.map(x=>({...x,_t:'PRODUCTO'})),...S.services.map(x=>({...x,_t:'SERVICIO'}))];
 catalog.forEach(x=>{const h=norm(`${x.codigo||''} ${x.nombre||''} ${x.marca||''} ${x.modelo||''} ${x.proveedor||''}`);if((x.codigo&&norm(text).includes(norm(x.codigo)))||(x.nombre&&norm(text).includes(norm(x.nombre)))){const button=m.querySelector('#qv3parse');void button;const oldItems=[...m.querySelectorAll('#qv3items tbody tr')].map(tr=>tr.querySelector('td:nth-child(2) b')?.textContent||'');if(!oldItems.some(n=>norm(n)===norm(x.nombre))){const p=m.querySelector('#qv3prod');const s=m.querySelector('#qv3serv');const target=x._t==='PRODUCTO'?p:s;if(target){target.click();setTimeout(()=>{const sel=document.querySelector('#qv3select');if(!sel)return;const idx=[...sel.options].findIndex(o=>norm(o.textContent).includes(norm(x.nombre)));if(idx>=0){sel.selectedIndex=idx;document.querySelector('#qv3pa')?.click()}},0)}added++}}});
 renderSummary();
 const msg=m.querySelector('#qv3voiceMsg');if(msg)msg.textContent=`Interpretado: ${f.client?'cliente ✓':'cliente —'} · ${f.location?'ubicación ✓':'ubicación —'} · ${f.mode||'sin modalidad'} · ${f.total!=null?money(f.total):'sin total'}${added?' · catálogo: '+added:''}`;
}
async function payloadFromModal(){
 const m=document.querySelector('#qv3modal');const u=(await sb.auth.getUser()).data?.user;if(!m||!u)throw new Error('Sesión no disponible.');
 const clientId=m.querySelector('#qv3client')?.value||null;const client=S.clients.find(x=>x.id===clientId)||null;const rows=getRows();
 const mode=m.querySelector('#qv4mode')?.value||null,location=m.querySelector('#qv4location')?.value.trim()||null,manual=Number(m.querySelector('#qv4total')?.value||0)||null,igv=!!m.querySelector('#qv3igv')?.checked,rate=Number(m.querySelector('#qv3rate')?.value||18);
 const subRows=rows.reduce((a,x)=>a+x.qty*x.price,0),cost=rows.reduce((a,x)=>a+x.qty*x.cost,0);const total=manual??(igv?subRows*(1+rate/100):subRows);const subtotal=manual!=null&&igv?manual/(1+rate/100):manual??subRows;const tax=igv?total-subtotal:0;
 return{u,client,rows,mode,location,manual,igv,rate,total,subtotal,tax,cost};
}
async function saveQuote(){
 if(busy)return;busy=true;try{const d=await payloadFromModal();if(!d.rows.length&&!d.manual)throw new Error('Dicta un precio total o agrega al menos un producto/servicio.');
 const number=document.querySelector('#qv3modal h2')?.textContent?.trim()||`COT-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
 const observations=[d.mode&&`Modalidad: ${d.mode}`,d.location&&`Ubicación: ${d.location}`,document.querySelector('#qv3duration')?.value&&`Tiempo promedio de ejecución: ${document.querySelector('#qv3duration').value}`].filter(Boolean).join(' · ')||null;
 const p={user_id:d.u.id,numero:number,cliente_id:d.client?.id||null,cliente_snapshot:d.client||{},empresa_nombre:'M.A.R.C.',empresa_logo:localStorage.getItem('marc_quote_logo')||null,moneda:'PEN',incluir_igv:d.igv,porcentaje_igv:d.rate,subtotal:d.subtotal,igv:d.tax,total:d.total,total_manual:d.manual,utilidad:d.rows.reduce((a,x)=>a+(x.price-x.cost)*x.qty,0),estado:'BORRADOR',observaciones,ubicacion:d.location,modalidad_costo:d.mode};
 const a=await sb.from('cotizaciones').insert(p).select('id').single();if(a.error)throw a.error;
 if(d.rows.length){const rows=d.rows.map((x,i)=>({cotizacion_id:a.data.id,user_id:d.u.id,tipo:x.type,producto_id:x.type==='PRODUCTO'?x.id:null,servicio_id:x.type==='SERVICIO'?x.id:null,codigo:x.code,nombre:x.name,descripcion:x.descripcion,unidad:x.unidad,cantidad:x.qty,precio_venta:x.price,precio_compra:x.cost,costo_total:x.qty*x.cost,importe:x.qty*x.price,utilidad:(x.price-x.cost)*x.qty,utilidad_pct:x.price?((x.price-x.cost)/x.price*100):0,orden:i}));const b=await sb.from('cotizacion_items').insert(rows);if(b.error){await sb.from('cotizaciones').delete().eq('id',a.data.id);throw b.error}}
 document.querySelector('#qv3modal')?.remove();document.querySelector('#qv3ref')?.click();await openPdf(a.data.id);
 }catch(e){alert(e.message||'No se pudo guardar la cotización.')}finally{busy=false}
}
function pdfHtml(q,its){const c=q.cliente_snapshot||{};const mode=q.modalidad_costo||'',loc=q.ubicacion||'';return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(q.numero)}</title><style>@page{size:A4;margin:12mm}body{font:12px Arial;color:#19344f;margin:0}.head{display:flex;justify-content:space-between;border-bottom:3px solid #087cf5;padding-bottom:14px}.brand{display:flex;gap:12px;align-items:center}.brand img{max-width:170px;max-height:60px}.no{text-align:right}.no b{font-size:19px;color:#087cf5}.info{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}.box{background:#f3f7fb;padding:12px;border-radius:9px}.tag{display:inline-block;padding:7px 10px;border-radius:7px;background:#eaf4ff;color:#087cf5;font-weight:bold;margin:10px 0}.duration{padding:10px 12px;background:#f6f9fc;border-left:4px solid #087cf5;margin:10px 0}table{width:100%;border-collapse:collapse}th{background:#eaf4ff;padding:8px;text-align:left;font-size:9px}td{padding:8px;border-bottom:1px solid #e3ebf2}.r{text-align:right}.tot{width:290px;margin:16px 0 0 auto}.tot div{display:flex;justify-content:space-between;padding:6px}.grand{border-top:2px solid #087cf5;font-size:16px;font-weight:bold}.foot{text-align:center;margin-top:35px;border-top:1px solid #dce6ef;padding-top:10px;color:#7890a6;font-size:9px}</style></head><body><div class="head"><div class="brand">${q.empresa_logo?`<img src="${esc(q.empresa_logo)}">`:''}<div><h1>${esc(q.empresa_nombre||'M.A.R.C.')}</h1><span>Proforma comercial</span></div></div><div class="no">COTIZACIÓN<br><b>${esc(q.numero)}</b><br>${new Date(q.created_at).toLocaleDateString('es-PE')}</div></div><div class="info"><div class="box"><b>CLIENTE</b><br>${esc(c.nombre_razon_social||'Venta directa / sin cliente registrado')}${c.documento?`<br>${esc(c.tipo_documento)} ${esc(c.documento)}`:''}</div>${loc?`<div class="box"><b>UBICACIÓN</b><br>${esc(loc)}</div>`:'<div class="box"><b>UBICACIÓN</b><br>No especificada</div>'}</div>${mode?`<div class="tag">MODALIDAD: ${esc(mode)}</div>`:''}${q.duracion?`<div class="duration"><b>Tiempo promedio de ejecución:</b> ${esc(q.duracion)}</div>`:''}${its.length?`<table><thead><tr><th>Descripción</th><th>Unidad</th><th class="r">Cant.</th><th class="r">P. unit.</th><th class="r">Importe</th></tr></thead><tbody>${its.map(x=>`<tr><td><b>${esc(x.nombre)}</b><br><small>${esc(x.codigo||'')} ${esc(x.descripcion||'')}</small></td><td>${esc(x.unidad||'UND')}</td><td class="r">${x.cantidad}</td><td class="r">${money(x.precio_venta)}</td><td class="r">${money(x.importe)}</td></tr>`).join('')}</tbody></table>`:(mode==='TODO COSTO'?`<div class="box" style="margin-top:16px"><b>TODO COSTO</b><br>Servicio integral según las condiciones indicadas.</div>`:'')}<div class="tot"><div>Subtotal <b>${money(q.subtotal)}</b></div>${q.incluir_igv?`<div>IGV (${q.porcentaje_igv}%) <b>${money(q.igv)}</b></div>`:''}<div class="grand">TOTAL <b>${money(q.total)}</b></div></div><div class="foot">Documento generado por M.A.R.C.</div></body></html>`}
async function openPdf(id){const u=(await sb.auth.getUser()).data?.user;if(!u)return;const [a,b]=await Promise.all([sb.from('cotizaciones').select('*').eq('id',id).eq('user_id',u.id).single(),sb.from('cotizacion_items').select('*').eq('cotizacion_id',id).eq('user_id',u.id).order('orden')]);if(a.error||b.error)return alert((a.error||b.error).message);const w=window.open('','_blank');if(!w)return alert('Permite ventanas emergentes.');w.document.write(pdfHtml(a.data,b.data||[]));w.document.close();setTimeout(()=>w.print(),400)}
async function previewQuote(){try{const d=await payloadFromModal();const q={numero:document.querySelector('#qv3modal h2')?.textContent||'',empresa_nombre:'M.A.R.C.',empresa_logo:localStorage.getItem('marc_quote_logo')||'',created_at:new Date().toISOString(),cliente_snapshot:d.client||{},ubicacion:d.location,modalidad_costo:d.mode,subtotal:d.subtotal,igv:d.tax,total:d.total,incluir_igv:d.igv,porcentaje_igv:d.rate,duracion:document.querySelector('#qv3duration')?.value||''};const its=d.rows.map(x=>({nombre:x.name,codigo:x.code,descripcion:x.descripcion,unidad:x.unidad,cantidad:x.qty,precio_venta:x.price,importe:x.qty*x.price}));const w=window.open('','_blank');if(!w)return alert('Permite ventanas emergentes.');w.document.write(pdfHtml(q,its));w.document.close();setTimeout(()=>w.print(),400)}catch(e){alert(e.message)}}
function hook(){
 const m=document.querySelector('#qv3modal');if(m)decorate();
 const list=document.querySelector('#qv3list');if(list&&!list.dataset.dictadoPdf){list.dataset.dictadoPdf='1';new MutationObserver(()=>list.querySelectorAll('[data-vpdf]').forEach(b=>{if(b.dataset.dictadoHook)return;b.dataset.dictadoHook='1';b.onclick=()=>openPdf(b.dataset.vpdf)})).observe(list,{childList:true,subtree:true})}
}
load().then(()=>{setInterval(hook,300);new MutationObserver(hook).observe(document.body,{childList:true,subtree:true})});
const st=document.createElement('style');st.textContent='.qv4fields{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px}.qv4fields label{display:grid;gap:5px;font-size:10px;font-weight:700;color:#536b89}.qv4fields input,.qv4fields select{padding:10px;border:1px solid #d2e0ec;border-radius:9px;background:#f8fbfe}@media(max-width:700px){.qv4fields{grid-template-columns:1fr}}';document.head.appendChild(st);
})();
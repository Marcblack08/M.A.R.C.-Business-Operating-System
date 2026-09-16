/* M.A.R.C. — edición de cotizaciones guardadas */
(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>'S/ '+Number(v||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
const sb=()=>window.supabaseClient;
let busy=false;

async function user(){const s=sb();if(!s)throw Error('No hay conexión con Supabase');const u=(await s.auth.getUser()).data?.user;if(!u)throw Error('Necesita iniciar sesión');return u}

async function read(id){
  const s=sb(),u=await user();
  const q=await s.from('cotizaciones').select('*').eq('id',id).eq('user_id',u.id).single();
  if(q.error)throw Error(q.error.message);
  const it=await s.from('cotizacion_items').select('*').eq('cotizacion_id',id).eq('user_id',u.id).order('orden');
  if(it.error)throw Error(it.error.message);
  return {q:q.data,items:it.data||[]};
}

function close(){document.querySelector('#marcQuoteEdit')?.remove()}

function render(data){
  close();
  const {q,items}=data;
  const d=document.createElement('div');d.id='marcQuoteEdit';d.className='qv3back';
  const snap=q.cliente_snapshot||{};
  const desc=q.observaciones||'';
  d.innerHTML=`<div class="qv3modal marc-edit-modal">
    <div class="qv3head"><div><span class="eyebrow">EDITAR COTIZACIÓN</span><h2>${esc(q.numero)}</h2></div><button type="button" class="table-action" id="mceX">×</button></div>
    <div class="qv3grid">
      <label>Cliente<input id="mceClient" value="${esc(snap.nombre_razon_social||'')}" placeholder="Nombre del cliente / bloque"></label>
      <label>Ubicación<input id="mceLocation" value="${esc(q.ubicacion||'')}" placeholder="Ubicación del trabajo"></label>
      <label>Modalidad de costo<select id="mceMode"><option value="DESGLOSADO">Desglosado</option><option value="TODO COSTO">TODO COSTO</option></select></label>
      <label id="mceTotalWrap">Precio total<input id="mceTotal" type="number" min="0" step="0.01" value="${Number(q.total||0)}"></label>
    </div>
    <label class="mce-desc">Descripción del trabajo<textarea id="mceDesc" rows="4" placeholder="Descripción que aparecerá en la proforma">${esc(desc)}</textarea></label>
    <section class="mce-items"><div class="mce-section-head"><b>Partidas</b><button type="button" class="btn btn-secondary" id="mceAdd">＋ Agregar partida</button></div><div id="mceRows"></div></section>
    <div id="mceTotals"></div><div id="mceMsg" class="qv3voiceMsg"></div>
    <div class="qv3actions"><button type="button" class="btn btn-secondary" id="mceCancel">Cancelar</button><button type="button" class="btn btn-secondary" id="mcePdf">⬇ Guardar y PDF</button><button type="button" class="btn btn-primary" id="mceSave">Guardar cambios</button></div>
  </div>`;
  document.body.appendChild(d);
  const mode=d.querySelector('#mceMode');mode.value=String(q.modalidad_costo||'DESGLOSADO').toUpperCase()==='TODO COSTO'?'TODO COSTO':'DESGLOSADO';
  d.querySelector('#mceX').onclick=close;d.querySelector('#mceCancel').onclick=close;
  mode.onchange=()=>{d.querySelector('#mceTotalWrap').style.display=mode.value==='TODO COSTO'?'grid':'none';recalc()};
  d.querySelector('#mceAdd').onclick=()=>addRow();
  d.querySelector('#mceSave').onclick=()=>save(false);
  d.querySelector('#mcePdf').onclick=()=>save(true);
  d.__items=items.map(x=>({...x, cantidad:Number(x.cantidad||1),precio_venta:Number(x.precio_venta||0)}));
  const rows=d.querySelector('#mceRows');
  if(!d.__items.length)addRow();else d.__items.forEach((x,i)=>drawRow(x,i));
  mode.dispatchEvent(new Event('change'));
  recalc();

  function addRow(){const x={id:null,tipo:'SERVICIO',nombre:'',descripcion:'',unidad:'UND',cantidad:1,precio_venta:0,precio_compra:0,costo_total:0,utilidad:0,utilidad_pct:100,producto_id:null,servicio_id:null,codigo:'IA'};d.__items.push(x);drawRow(x,d.__items.length-1);recalc()}
  function drawRow(x,i){
    const r=document.createElement('div');r.className='mce-row';r.dataset.i=i;
    r.innerHTML=`<div class="mce-row-top"><input data-name placeholder="Producto, material o servicio" value="${esc(x.nombre)}"><button type="button" class="table-action" data-del>×</button></div><div class="mce-row-grid"><label>Cant.<input data-qty type="number" min="0.001" step="0.001" value="${x.cantidad}"></label><label>Precio unitario<input data-price type="number" min="0" step="0.01" value="${x.precio_venta}"></label><label>Tipo<select data-type><option value="SERVICIO">Servicio</option><option value="PRODUCTO">Producto</option><option value="TODO COSTO">Todo costo</option></select></label></div><input data-desc class="mce-row-desc" placeholder="Detalle de la partida (opcional)" value="${esc(x.descripcion||'')}">`;
    r.querySelector('[data-type]').value=x.tipo||'SERVICIO';
    r.querySelector('[data-name]').oninput=e=>{x.nombre=e.target.value;recalc()};
    r.querySelector('[data-qty]').oninput=e=>{x.cantidad=Number(e.target.value)||1;recalc()};
    r.querySelector('[data-price]').oninput=e=>{x.precio_venta=Number(e.target.value)||0;recalc()};
    r.querySelector('[data-type]').onchange=e=>{x.tipo=e.target.value;recalc()};
    r.querySelector('[data-desc]').oninput=e=>x.descripcion=e.target.value;
    r.querySelector('[data-del]').onclick=()=>{d.__items.splice(i,1);r.remove();[...rows.children].forEach((el,n)=>{el.dataset.i=n});recalc()};
    rows.appendChild(r);
  }
  function recalc(){
    const arr=d.__items;let sub=0;
    arr.forEach(x=>sub+=Math.max(0,Number(x.cantidad||1))*Math.max(0,Number(x.precio_venta||0)));
    const total=mode.value==='TODO COSTO'?Number(d.querySelector('#mceTotal').value||sub):sub;
    d.querySelector('#mceTotals').innerHTML=`<div class="qv3total"><span>Subtotal <b>${money(sub)}</b></span><span>Modalidad <b>${esc(mode.value)}</b></span><strong>TOTAL <b>${money(total)}</b></strong></div>`;
  }
  d.querySelector('#mceTotal').oninput=recalc;
  async function save(andPdf){
    if(busy)return;busy=true;const msg=d.querySelector('#mceMsg'),btn=d.querySelector('#mceSave');if(btn)btn.disabled=true;
    try{
      const u=await user(),s=sb();const clean=d.__items.map((x,i)=>({...x,nombre:String(x.nombre||'').trim(),cantidad:Number(x.cantidad||1),precio_venta:Number(x.precio_venta||0),orden:i})).filter(x=>x.nombre);
      if(!clean.length)throw Error('Agrega al menos una partida.');
      const modeValue=mode.value;const sub=clean.reduce((a,x)=>a+x.cantidad*x.precio_venta,0);const total=modeValue==='TODO COSTO'?Number(d.querySelector('#mceTotal').value||sub):sub;
      if(total<0)throw Error('El total no puede ser negativo.');
      const clientName=d.querySelector('#mceClient').value.trim();
      const clienteSnapshot={...snap,nombre_razon_social:clientName||'Venta directa'};
      const up=await s.from('cotizaciones').update({cliente_snapshot:clienteSnapshot,ubicacion:d.querySelector('#mceLocation').value.trim()||null,observaciones:d.querySelector('#mceDesc').value.trim()||null,modalidad_costo:modeValue,total_manual:modeValue==='TODO COSTO'?total:null,subtotal:total,igv:0,total,utilidad:total,updated_at:new Date().toISOString()}).eq('id',q.id).eq('user_id',u.id);
      if(up.error)throw Error(up.error.message);
      const del=await s.from('cotizacion_items').delete().eq('cotizacion_id',q.id).eq('user_id',u.id);if(del.error)throw Error(del.error.message);
      const payload=clean.map(x=>({user_id:u.id,cotizacion_id:q.id,tipo:x.tipo==='TODO COSTO'?'SERVICIO':x.tipo,producto_id:x.producto_id||null,servicio_id:x.servicio_id||null,codigo:x.codigo||'IA',nombre:x.nombre,descripcion:x.descripcion||null,unidad:x.unidad||'UND',cantidad:x.cantidad,precio_venta:x.precio_venta,precio_compra:Number(x.precio_compra||0),costo_total:Number(x.costo_total||0),importe:x.cantidad*x.precio_venta,utilidad:x.cantidad*x.precio_venta-Number(x.costo_total||0),utilidad_pct:x.cantidad*x.precio_venta?((x.cantidad*x.precio_venta-Number(x.costo_total||0))/(x.cantidad*x.precio_venta))*100:0,orden:x.orden}));
      const ins=await s.from('cotizacion_items').insert(payload);if(ins.error)throw Error(ins.error.message);
      msg.textContent='✓ Cambios guardados.';busy=false;if(btn){btn.disabled=false}
      if(andPdf&&window.MARC_GENERATE_QUOTE_PDF){await window.MARC_GENERATE_QUOTE_PDF(q.id)}
      setTimeout(()=>{close();if(typeof window.render==='function')window.render('quotes')},700);
    }catch(e){busy=false;if(btn)btn.disabled=false;msg.textContent='⚠ '+e.message}
  }
}

async function edit(id){if(!id)return;try{const msg=document.querySelector('#qv3voiceMsg');if(msg)msg.textContent='✏ Cargando cotización…';render(await read(id))}catch(e){alert('No se pudo abrir la cotización: '+e.message)}}

function wire(){
  document.querySelectorAll('[data-vpdf]').forEach(pdf=>{
    if(pdf.parentElement.querySelector('[data-edit-quote="'+pdf.dataset.vpdf+'"]'))return;
    const b=document.createElement('button');b.type='button';b.className='table-action';b.dataset.editQuote=pdf.dataset.vpdf;b.textContent='✏ Editar';b.style.marginRight='6px';b.onclick=()=>edit(b.dataset.editQuote);pdf.parentElement.insertBefore(b,pdf);
  });
}
window.MARC_EDIT_QUOTE=edit;
new MutationObserver(wire).observe(document.body,{childList:true,subtree:true});setInterval(wire,500);setTimeout(wire,300);
})();

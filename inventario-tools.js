/* M.A.R.C. — herramientas avanzadas de Inventario */
(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let busy=false,observer=null;
async function getUser(){const r=await supabaseClient.auth.getUser();if(r.error||!r.data.user)throw new Error('Tu sesión expiró.');return r.data.user}
function markedSupplier(p){return /\[MARC-(?:PROVEEDOR|SUPPLIER)\]/i.test(String(p?.descripcion||''))}
function badge(supplier){return supplier?'<span class="inv-origin supplier">PROVEEDOR</span>':'<span class="inv-origin own">PROPIO</span>'}
async function enhance(){
 const wrap=document.querySelector('#inventoryTableWrap');
 if(!wrap||busy||!wrap.querySelector('table')||wrap.querySelector('.inv-bulkbar'))return;
 busy=true;
 try{
  const u=await getUser();
  const [pr,ci]=await Promise.all([
   supabaseClient.from('productos').select('id,codigo,nombre,descripcion,precio_venta').eq('user_id',u.id).eq('activo',true),
   supabaseClient.from('catalogo_items').select('codigo,datos_extra').eq('user_id',u.id)
  ]);
  if(pr.error)throw pr.error;
  const products=pr.data||[];
  const supplierCodes=new Set((ci.data||[]).filter(x=>/PROVEEDOR/i.test(String(x.datos_extra?.tipo||''))).map(x=>String(x.codigo||'').trim().toUpperCase()).filter(Boolean));
  const byId=new Map(products.map(p=>[String(p.id),p]));
  const isSupplier=p=>markedSupplier(p)||supplierCodes.has(String(p?.codigo||'').trim().toUpperCase());
  const table=wrap.querySelector('table'),head=table.querySelector('thead tr');if(!head)return;
  const th=document.createElement('th');th.innerHTML='<input type="checkbox" id="invSelectAll" title="Seleccionar todos">';head.insertBefore(th,head.firstChild);
  const action=head.lastElementChild;
  const priceTh=document.createElement('th');priceTh.textContent='Precio venta';
  const originTh=document.createElement('th');originTh.textContent='Origen';
  head.insertBefore(priceTh,action);head.insertBefore(originTh,action);
  table.querySelectorAll('tbody tr').forEach(tr=>{
   const actionBtn=tr.querySelector('.inv-delete'),id=actionBtn?.dataset.id,p=byId.get(String(id));if(!p)return;
   const cb=document.createElement('td');cb.innerHTML=`<input type="checkbox" class="inv-select" data-id="${esc(p.id)}">`;tr.insertBefore(cb,tr.firstChild);
   const price=document.createElement('td');price.innerHTML=`<div class="inv-price-edit"><span>S/</span><input class="inv-sale-price" data-id="${esc(p.id)}" type="number" min="0" step="0.01" value="${Number(p.precio_venta||0).toFixed(2)}"><button type="button" class="inv-save-price" data-id="${esc(p.id)}" title="Guardar precio de venta">✓</button></div>`;
   const origin=document.createElement('td');origin.innerHTML=badge(isSupplier(p));
   const actionCell=actionBtn.closest('td');tr.insertBefore(price,actionCell);tr.insertBefore(origin,actionCell);
   tr.classList.toggle('inv-supplier-row',isSupplier(p));
  });
  const toolbar=document.createElement('div');toolbar.className='inv-bulkbar';toolbar.innerHTML='<div><strong id="invSelectedCount">0</strong> seleccionados</div><div class="inv-legend"><span><i class="inv-dot own"></i> Propios</span><span><i class="inv-dot supplier"></i> Proveedores</span></div><div class="inv-bulk-actions"><button type="button" class="btn btn-secondary" id="invSetPrice">💰 Precio de venta</button><button type="button" class="btn btn-danger" id="invBulkDelete">🗑 Eliminar seleccionados</button></div>';
  wrap.insertBefore(toolbar,wrap.firstChild);
  const update=()=>{const n=wrap.querySelectorAll('.inv-select:checked').length,total=wrap.querySelectorAll('.inv-select').length;toolbar.querySelector('#invSelectedCount').textContent=n;const master=head.querySelector('#invSelectAll');if(master){master.checked=total>0&&n===total;master.indeterminate=n>0&&n<total}};
  head.querySelector('#invSelectAll').onchange=e=>{wrap.querySelectorAll('.inv-select').forEach(c=>c.checked=e.target.checked);update()};
  wrap.querySelectorAll('.inv-select').forEach(c=>c.onchange=update);update();
  wrap.querySelectorAll('.inv-save-price').forEach(btn=>btn.onclick=async()=>{const input=wrap.querySelector(`.inv-sale-price[data-id="${CSS.escape(btn.dataset.id)}"]`),value=Number(input?.value);if(!Number.isFinite(value)||value<0){alert('Ingresa un precio de venta válido.');return}btn.disabled=true;try{const r=await supabaseClient.from('productos').update({precio_venta:value,updated_at:new Date().toISOString()}).eq('id',btn.dataset.id).eq('user_id',u.id);if(r.error)throw r.error;btn.textContent='✓'}catch(e){alert('No se pudo guardar el precio: '+e.message)}finally{btn.disabled=false}});
  toolbar.querySelector('#invSetPrice').onclick=bulkSetPrice;toolbar.querySelector('#invBulkDelete').onclick=bulkDelete;
 }catch(e){console.warn('M.A.R.C. inventario tools:',e)}finally{busy=false}
}
async function bulkSetPrice(){const wrap=document.querySelector('#inventoryTableWrap');const ids=[...wrap.querySelectorAll('.inv-select:checked')].map(x=>x.dataset.id);if(!ids.length){alert('Selecciona al menos un producto.');return}const v=prompt(`Precio de venta para ${ids.length} producto(s):\n\nIngresa el precio en soles (S/).`);if(v===null)return;const n=Number(String(v).replace(',','.'));if(!Number.isFinite(n)||n<0){alert('Precio inválido.');return}const u=await getUser();for(const id of ids){const r=await supabaseClient.from('productos').update({precio_venta:n,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',u.id);if(r.error)throw r.error}alert(`Precio de venta actualizado en ${ids.length} producto(s).`);window.render('inventory')}
async function bulkDelete(){const wrap=document.querySelector('#inventoryTableWrap');const ids=[...wrap.querySelectorAll('.inv-select:checked')].map(x=>x.dataset.id);if(!ids.length){alert('Selecciona al menos un producto.');return}if(!confirm(`¿Retirar ${ids.length} producto(s) del inventario?\n\nLos productos permanecerán en Productos y se conservará su historial.`))return;const u=await getUser();for(const id of ids){const r=await supabaseClient.from('productos').update({activo:false}).eq('id',id).eq('user_id',u.id);if(r.error)throw r.error}window.render('inventory')}
function start(){enhance();if(observer)observer.disconnect();observer=new MutationObserver(()=>enhance());observer.observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else setTimeout(start,500);
window.MARC_INVENTORY_TOOLS={enhance,bulkDelete,bulkSetPrice};
})();

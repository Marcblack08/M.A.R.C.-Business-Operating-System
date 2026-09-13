/* M.A.R.C. — herramientas avanzadas de Inventario */
(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let observer;
  let busy=false;

  async function user(){const r=await supabaseClient.auth.getUser();if(r.error||!r.data.user)throw new Error('Tu sesión expiró.');return r.data.user;}
  function isSupplier(p){return /\[MARC-(?:PROVEEDOR|SUPPLIER)\]/i.test(String(p.descripcion||'')) || /proveedor/i.test(String(p.descripcion||''));}
  function originBadge(p){return isSupplier(p)?'<span class="inv-origin supplier">PROVEEDOR</span>':'<span class="inv-origin own">PROPIO</span>'}

  async function enhance(){
    const wrap=document.querySelector('#inventoryTableWrap');
    if(!wrap||busy||!wrap.querySelector('table'))return;
    const old=wrap.querySelector('.inv-bulkbar');
    if(old)return;
    busy=true;
    try{
      const u=await user();
      const {data,error}=await supabaseClient.from('productos').select('id,codigo,nombre,descripcion,precio_compra,precio_venta').eq('user_id',u.id).eq('activo',true);
      if(error)throw error;
      const byId=new Map((data||[]).map(p=>[String(p.id),p]));
      const table=wrap.querySelector('table');
      const head=table.querySelector('thead tr');
      if(!head)return;
      const th=document.createElement('th');th.innerHTML='<input type="checkbox" id="invSelectAll" title="Seleccionar todos">';head.insertBefore(th,head.firstChild);
      const priceTh=document.createElement('th');priceTh.textContent='Precio venta';
      const originTh=document.createElement('th');originTh.textContent='Origen';
      const headers=[...head.children];
      const actionIndex=headers.length-1;
      head.insertBefore(priceTh,head.children[actionIndex]);
      head.insertBefore(originTh,head.children[actionIndex]);
      table.querySelectorAll('tbody tr').forEach(tr=>{
        const action=tr.querySelector('.inv-delete');
        const id=action?.dataset.id;
        const p=byId.get(String(id));
        if(!p)return;
        const cb=document.createElement('td');cb.innerHTML=`<input type="checkbox" class="inv-select" data-id="${esc(p.id)}">`;tr.insertBefore(cb,tr.firstChild);
        const price=document.createElement('td');price.innerHTML=`<div class="inv-price-edit"><span>S/</span><input class="inv-sale-price" data-id="${esc(p.id)}" type="number" min="0" step="0.01" value="${Number(p.precio_venta||0).toFixed(2)}" aria-label="Precio de venta de ${esc(p.nombre)}"><button class="inv-save-price" data-id="${esc(p.id)}" title="Guardar precio">✓</button></div>`;
        const origin=document.createElement('td');origin.innerHTML=originBadge(p);
        const cells=[...tr.children];const ai=cells.length-1;tr.insertBefore(price,tr.children[ai]);tr.insertBefore(origin,tr.children[ai]);
      });
      const toolbar=document.createElement('div');toolbar.className='inv-bulkbar';toolbar.innerHTML='<div><strong id="invSelectedCount">0</strong> seleccionados</div><div class="inv-bulk-actions"><button type="button" class="btn btn-secondary" id="invSetPrice">💰 Precio de venta</button><button type="button" class="btn btn-danger" id="invBulkDelete">🗑 Eliminar seleccionados</button></div>';
      wrap.insertBefore(toolbar,wrap.firstChild);
      const all=toolbar.querySelector('#invSelectAll')||head.querySelector('#invSelectAll');
      const update=()=>{const n=wrap.querySelectorAll('.inv-select:checked').length;toolbar.querySelector('#invSelectedCount').textContent=n;const master=head.querySelector('#invSelectAll');if(master){const total=wrap.querySelectorAll('.inv-select').length;master.checked=total>0&&n===total;master.indeterminate=n>0&&n<total}};
      head.querySelector('#invSelectAll').onchange=e=>{wrap.querySelectorAll('.inv-select').forEach(c=>c.checked=e.target.checked);update()};
      wrap.querySelectorAll('.inv-select').forEach(c=>c.onchange=update);update();
      wrap.querySelectorAll('.inv-save-price').forEach(b=>b.onclick=async()=>{const id=b.dataset.id,input=wrap.querySelector(`.inv-sale-price[data-id="${CSS.escape(id)}"]`);const value=Number(input?.value);if(!Number.isFinite(value)||value<0){alert('Ingresa un precio de venta válido.');return}b.disabled=true;try{const u=await user();const r=await supabaseClient.from('productos').update({precio_venta:value,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',u.id);if(r.error)throw r.error;b.textContent='✓';setTimeout(()=>b.textContent='✓',700)}catch(e){alert('No se pudo guardar el precio: '+e.message)}finally{b.disabled=false}});
      toolbar.querySelector('#invSetPrice').onclick=()=>bulkPrice();
      toolbar.querySelector('#invBulkDelete').onclick=()=>bulkDelete();
    }catch(e){console.warn('M.A.R.C. inventario tools:',e)}finally{busy=false}
  }
  async function bulkPrice(){
    const wrap=document.querySelector('#inventoryTableWrap');const ids=[...wrap.querySelectorAll('.inv-select:checked')].map(x=>x.dataset.id);if(!ids.length){alert('Selecciona al menos un producto.');return}
    const value=window.prompt(`Precio de venta para ${ids.length} producto(s):\n\nIngresa el precio en soles (S/).`);if(value===null)return;const n=Number(value.replace(',','.'));if(!Number.isFinite(n)||n<0){alert('Precio inválido.');return}
    const u=await user();for(const id of ids){const r=await supabaseClient.from('productos').update({precio_venta:n,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',u.id);if(r.error)throw r.error}alert(`Precio de venta actualizado en ${ids.length} producto(s).`);window.render('inventory')
  }
  async function bulkDelete(){
    const wrap=document.querySelector('#inventoryTableWrap');const ids=[...wrap.querySelectorAll('.inv-select:checked')].map(x=>x.dataset.id);if(!ids.length){alert('Selecciona al menos un producto.');return}
    if(!confirm(`¿Retirar ${ids.length} producto(s) del inventario?\n\nLos productos permanecerán en Productos y se conservará su historial.`))return;
    const u=await user();for(const id of ids){const r=await supabaseClient.from('productos').update({activo:false}).eq('id',id).eq('user_id',u.id);if(r.error)throw r.error}window.render('inventory')
  }

  function start(){
    enhance();
    if(observer)observer.disconnect();
    observer=new MutationObserver(()=>enhance());
    const target=document.querySelector('#inventoryTableWrap')||document.body;observer.observe(target,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else setTimeout(start,500);
  window.MARC_INVENTORY_TOOLS={enhance,bulkDelete,bulkPrice};
})();

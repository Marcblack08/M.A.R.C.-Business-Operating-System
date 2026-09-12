/* M.A.R.C. — Inventario: movimientos y stock */
(function(){
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const oldRender=window.render;
  window.render=function(section='dashboard'){
    if(section!=='inventory') return oldRender(section);
    const content=document.querySelector('#content'); if(!content)return;
    content.innerHTML=`<div class="page-head"><div><p class="eyebrow">M.A.R.C. / OPERACIONES</p><h1>Inventario</h1><p>Controla entradas, salidas, ajustes y existencias de tus productos.</p></div><button type="button" class="btn btn-primary" id="newMovementBtn">＋ Movimiento</button></div><div class="inventory-kpis"><div class="inventory-kpi"><small>Productos</small><strong id="invProducts">—</strong></div><div class="inventory-kpi"><small>Unidades en stock</small><strong id="invUnits">—</strong></div><div class="inventory-kpi warning"><small>Stock bajo</small><strong id="invLow">—</strong></div><div class="inventory-kpi critical"><small>Agotados</small><strong id="invOut">—</strong></div></div><section class="panel table-panel"><div class="table-toolbar"><div class="search-box local"><span>⌕</span><input id="inventorySearch" placeholder="Buscar producto..."></div><button type="button" class="btn btn-secondary" id="refreshInventory">↻ Actualizar</button></div><div id="inventoryTableWrap"><div class="inventory-loading">Cargando inventario...</div></div></section>`;
    document.querySelector('#newMovementBtn')?.addEventListener('click',()=>openMovementModal());
    document.querySelector('#refreshInventory')?.addEventListener('click',loadInventory);
    loadInventory();
  };
  async function getUser(){const {data:{user},error}=await supabaseClient.auth.getUser();if(error||!user)throw new Error('Tu sesión expiró.');return user;}
  async function loadInventory(){
    const wrap=document.querySelector('#inventoryTableWrap');if(!wrap)return;
    try{
      const user=await getUser();
      const {data,error}=await supabaseClient.from('productos').select('id,codigo,nombre,marca,modelo,unidad,stock,stock_minimo,activo').eq('user_id',user.id).order('nombre');
      if(error)throw error;
      const rows=data||[];
      const low=rows.filter(p=>Number(p.stock||0)>0&&Number(p.stock||0)<=Number(p.stock_minimo||0));
      const out=rows.filter(p=>Number(p.stock||0)<=0);
      document.querySelector('#invProducts').textContent=rows.length;
      document.querySelector('#invUnits').textContent=rows.reduce((a,p)=>a+Number(p.stock||0),0).toLocaleString('es-PE');
      document.querySelector('#invLow').textContent=low.length;
      document.querySelector('#invOut').textContent=out.length;
      draw(rows);
      document.querySelector('#inventorySearch')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase().trim();draw(rows.filter(p=>[p.codigo,p.nombre,p.marca,p.modelo].some(v=>String(v||'').toLowerCase().includes(q))));});
      function draw(list){
        if(!list.length){wrap.innerHTML='<div class="inventory-empty"><div class="inventory-empty-icon">▤</div><h3>No hay productos en el inventario</h3><p>Agrega productos desde Productos para comenzar a controlar el stock.</p></div>';return;}
        wrap.innerHTML=`<div class="table-scroll"><table><thead><tr><th>Código</th><th>Producto</th><th>Stock</th><th>Mínimo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${list.map(p=>{const stock=Number(p.stock||0),min=Number(p.stock_minimo||0);const status=stock<=0?'Agotado':stock<=min?'Bajo':'Disponible';return `<tr><td><strong>${esc(p.codigo||'—')}</strong></td><td><strong>${esc(p.nombre)}</strong><br><small>${esc([p.marca,p.modelo].filter(Boolean).join(' · '))}</small></td><td><strong>${stock}</strong> ${esc(p.unidad||'UND')}</td><td>${min}</td><td><mark class="${status==='Agotado'?'critical':status==='Bajo'?'warning':''}">${status}</mark></td><td><button type="button" class="table-action inv-move" data-id="${p.id}">＋/−</button></td></tr>`;}).join('')}</tbody></table></div>`;
        wrap.querySelectorAll('.inv-move').forEach(b=>b.addEventListener('click',()=>openMovementModal(rows.find(p=>p.id===b.dataset.id))));
      }
    }catch(err){wrap.innerHTML=`<div class="inventory-empty">No se pudo cargar el inventario.<br><small>${esc(err.message)}</small></div>`;}
  }
  async function openMovementModal(product=null){
    const user=await getUser();
    const {data:products,error}=await supabaseClient.from('productos').select('id,codigo,nombre,marca,unidad,stock').eq('user_id',user.id).eq('activo',true).order('nombre');
    if(error){window.alert(error.message);return;}
    if(!products?.length){window.alert('Primero agrega un producto en Productos.');return;}
    document.querySelector('#inventoryModal')?.remove();
    const modal=document.createElement('div');modal.id='inventoryModal';modal.className='inventory-modal-backdrop';
    modal.innerHTML=`<div class="inventory-modal"><div class="inventory-modal-head"><div><p class="eyebrow">M.A.R.C. / INVENTARIO</p><h2>Registrar movimiento</h2></div><button type="button" class="inventory-close">×</button></div><form id="inventoryForm" class="inventory-form"><label>Producto<select name="producto" required>${products.map(p=>`<option value="${p.id}" ${product?.id===p.id?'selected':''}>${esc(p.codigo||'—')} · ${esc(p.nombre)} · Stock: ${Number(p.stock||0)}</option>`).join('')}</select></label><div class="inventory-grid"><label>Movimiento<select name="tipo"><option value="ENTRADA">Entrada</option><option value="SALIDA">Salida</option><option value="AJUSTE">Ajuste de stock</option></select></label><label>Cantidad / nuevo stock<input name="cantidad" type="number" min="0.01" step="0.01" required value="1"></label></div><label>Motivo<input name="motivo" placeholder="Compra, venta, instalación, devolución..."></label><label>Referencia<input name="referencia" placeholder="Factura, cotización, orden, etc."></label><div id="inventoryFormMsg" class="inventory-form-msg"></div><div class="inventory-modal-actions"><button type="button" class="btn btn-secondary inventory-cancel">Cancelar</button><button type="submit" class="btn btn-primary">Guardar movimiento</button></div></form></div>`;
    document.body.appendChild(modal);const close=()=>modal.remove();modal.querySelector('.inventory-close').onclick=close;modal.querySelector('.inventory-cancel').onclick=close;
    const form=modal.querySelector('#inventoryForm');
    form.addEventListener('submit',async e=>{e.preventDefault();const btn=form.querySelector('button[type="submit"]'),msg=form.querySelector('#inventoryFormMsg');btn.disabled=true;msg.textContent='Guardando...';try{const fd=new FormData(form);const {error}=await supabaseClient.rpc('registrar_movimiento_inventario',{p_producto_id:fd.get('producto'),p_tipo:fd.get('tipo'),p_cantidad:Number(fd.get('cantidad')),p_motivo:fd.get('motivo'),p_referencia:fd.get('referencia')});if(error)throw error;close();loadInventory();}catch(err){msg.textContent=err.message;msg.className='inventory-form-msg error';btn.disabled=false;}});
  }
  const style=document.createElement('style');style.textContent='.inventory-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:0 0 16px}.inventory-kpi{background:#fff;border:1px solid #e0eaf3;border-radius:14px;padding:16px;display:grid;gap:5px}.inventory-kpi small{font-size:10px;color:#7891ad}.inventory-kpi strong{font-size:24px;color:#183b60}.inventory-kpi.warning strong{color:#a66a00}.inventory-kpi.critical strong{color:#c83d4e}.inventory-loading,.inventory-empty{text-align:center;padding:50px 20px;color:#7891ad;font-size:12px}.inventory-empty-icon{width:58px;height:58px;border-radius:16px;background:#eaf5ff;color:#087cf5;display:grid;place-items:center;margin:0 auto 12px;font-size:25px}.inventory-empty h3{margin:0 0 6px;color:#24496e;font-size:16px}.inventory-empty p{margin:0}.inventory-modal-backdrop{position:fixed;inset:0;background:#071d38aa;backdrop-filter:blur(6px);z-index:100;display:grid;place-items:center;padding:18px}.inventory-modal{width:min(560px,100%);background:#fff;border-radius:20px;padding:24px;max-height:92vh;overflow:auto}.inventory-modal-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}.inventory-modal-head h2{margin:0;color:#102b54;font-size:23px}.inventory-close{border:0;background:#eef5fb;color:#557493;border-radius:9px;width:34px;height:34px;font-size:22px}.inventory-form{display:grid;gap:13px}.inventory-form label{display:grid;gap:6px;color:#536b89;font-size:11px;font-weight:700}.inventory-form input,.inventory-form select{width:100%;border:1px solid #d2e0ec;border-radius:10px;background:#f8fbfe;color:#173452;padding:11px;font-size:12px}.inventory-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.inventory-modal-actions{display:flex;justify-content:flex-end;gap:9px}.inventory-form-msg{min-height:18px;font-size:10px;color:#607b96}.inventory-form-msg.error{color:#d13d4e}@media(max-width:650px){.inventory-kpis{grid-template-columns:1fr 1fr}.inventory-grid{grid-template-columns:1fr}.page-head>.btn{margin-top:8px}}@media(max-width:420px){.inventory-kpis{gap:8px}.inventory-kpi{padding:12px}.inventory-kpi strong{font-size:20px}}';document.head.appendChild(style);
})();
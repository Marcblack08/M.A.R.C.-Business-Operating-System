/* M.A.R.C. — Editor previo a inventario */
(()=>{
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function uid(){const r=await supabaseClient.auth.getUser();if(r.error||!r.data.user)throw new Error('Tu sesión expiró.');return r.data.user.id}
let current=null,items=[];
const fields=[['codigo','Código / SKU'],['nombre','Nombre del producto'],['marca','Marca'],['modelo','Modelo'],['categoria','Categoría'],['descripcion','Descripción'],['precio_compra','Precio compra'],['precio_venta','Precio venta'],['unidad','Unidad']];
async function openEditor(id){current=id;const u=await uid();const r=await supabaseClient.from('catalogo_items').select('id,codigo,nombre,marca,modelo,categoria,descripcion,precio_compra,precio_venta,unidad,datos_extra').eq('catalogo_id',id).eq('user_id',u);if(r.error)throw r.error;items=r.data||[];renderEditor()}
function renderEditor(){let m=document.querySelector('#catEditorModal');if(!m){m=document.createElement('div');m.id='catEditorModal';m.className='cat-editor-backdrop';document.body.appendChild(m)}m.innerHTML=`<div class="cat-editor"><header><div><span class="eyebrow">REVISIÓN ANTES DE INVENTARIO</span><h2>Editar productos del catálogo</h2><p>Corrige nombres, códigos, modelos y precios. Nada se enviará a Productos/Inventario hasta que tú lo confirmes.</p></div><button type="button" class="cat-editor-close">×</button></header><div class="cat-editor-tools"><input id="catEditorSearch" placeholder="Buscar código, nombre o modelo…"><span id="catEditorCount">${items.length} productos</span><button id="catEditorSave" class="btn btn-primary">Guardar cambios</button><button id="catEditorSend" class="btn btn-secondary">Pasar seleccionados a Inventario</button></div><div id="catEditorRows"></div></div>`;m.querySelector('.cat-editor-close').onclick=closeEditor;m.querySelector('#catEditorSearch').oninput=e=>drawRows(e.target.value);m.querySelector('#catEditorSave').onclick=()=>saveAll().catch(e=>alert('No se pudieron guardar los cambios: '+e.message));m.querySelector('#catEditorSend').onclick=()=>sendSelected().catch(e=>alert('No se pudo completar la importación: '+e.message));drawRows('')}
function drawRows(q){const box=document.querySelector('#catEditorRows');if(!box)return;const z=String(q||'').toLowerCase();const shown=items.filter(x=>!z||[x.codigo,x.nombre,x.marca,x.modelo,x.categoria].some(v=>String(v||'').toLowerCase().includes(z)));box.innerHTML=shown.map(x=>{const supplier=/PROVEEDOR/i.test(String(x.datos_extra?.tipo||''));const suspicious=!String(x.nombre||'').trim()||/^Producto para revisar$/i.test(String(x.nombre||''))||Number(x.precio_compra||x.precio_venta||x.datos_extra?.precio_fuente||0)<=0;return `<article class="cat-editor-row ${suspicious?'cat-editor-suspicious':''}" data-id="${x.id}"><label class="cat-editor-check"><input type="checkbox" class="cat-select" checked> <span>Importar</span></label><div class="cat-editor-origin ${supplier?'supplier':'own'}">${supplier?'PROVEEDOR':'PROPIO'}</div><div class="cat-editor-grid">${fields.map(([k,l])=>`<label class="cat-field ${k==='descripcion'?'wide':''}"><span>${l}</span><input data-k="${k}" value="${esc(x[k]??'')}"></label>`).join('')}<div class="cat-source"><span>Página ${esc(x.datos_extra?.pagina||'?')}</span><span>Fuente: ${esc(x.datos_extra?.confianza||'PDF')}</span><span>Precio fuente: S/ ${Number(x.datos_extra?.precio_fuente||0).toFixed(2)}</span>${suspicious?'<strong>⚠ Revisar antes de importar</strong>':''}</div></div><button type="button" class="cat-editor-delete">Eliminar</button></article>`}).join('')||'<div class="cat-editor-empty">No hay productos que coincidan.</div>';box.querySelectorAll('.cat-editor-delete').forEach(b=>b.onclick=async()=>{const row=b.closest('.cat-editor-row');const id=row.dataset.id;if(!confirm('¿Eliminar este producto detectado del catálogo?'))return;const u=await uid();const r=await supabaseClient.from('catalogo_items').delete().eq('id',id).eq('user_id',u);if(r.error){alert('No se pudo eliminar: '+r.error.message);return}items=items.filter(x=>String(x.id)!==String(id));drawRows(document.querySelector('#catEditorSearch')?.value||'')})}
function collect(){document.querySelectorAll('.cat-editor-row').forEach(row=>{const x=items.find(v=>String(v.id)===String(row.dataset.id));if(!x)return;row.querySelectorAll('[data-k]').forEach(i=>{const k=i.dataset.k;x[k]=(k.startsWith('precio_')?Number(String(i.value||'0').replace(',','.')):i.value.trim())})})}
async function saveAll(){collect();const u=await uid();const errors=[];for(const x of items){if(!String(x.codigo||'').trim()||!String(x.nombre||'').trim())continue;const r=await supabaseClient.from('catalogo_items').update({codigo:x.codigo||null,nombre:x.nombre||'Producto sin nombre',marca:x.marca||null,modelo:x.modelo||null,categoria:x.categoria||'Accesorios',descripcion:x.descripcion||null,precio_compra:Number(x.precio_compra||0),precio_venta:Number(x.precio_venta||0),unidad:x.unidad||'UND'}).eq('id',x.id).eq('user_id',u);if(r.error)errors.push(`${x.codigo}: ${r.error.message}`)}if(errors.length)throw new Error(errors.slice(0,3).join(' | '));alert('Cambios guardados correctamente.')}
async function sendSelected(){collect();const u=await uid();const rows=[...document.querySelectorAll('.cat-editor-row')].filter(r=>r.querySelector('.cat-select')?.checked);if(!rows.length){alert('Selecciona al menos un producto.');return}const ids=new Set(rows.map(r=>String(r.dataset.id)));const selected=items.filter(x=>ids.has(String(x.id)));await saveAll();
 const p=await supabaseClient.from('productos').select('id,codigo,precio_compra,precio_venta,descripcion,stock,activo').eq('user_id',u);if(p.error)throw p.error;
 const map=new Map((p.data||[]).filter(x=>x.codigo).map(x=>[String(x.codigo).trim().toUpperCase(),x]));
 let created=0,updated=0,skipped=0;const errors=[];const imported=[];
 for(const x of selected){
  const codigo=String(x.codigo||'').trim().toUpperCase();
  const nombre=String(x.nombre||'').trim();
  if(!codigo||!nombre||/^Producto para revisar$/i.test(nombre)){skipped++;continue}
  const supplier=/PROVEEDOR/i.test(String(x.datos_extra?.tipo||''));
  const marker=supplier?'[MARC-PROVEEDOR]':'[MARC-PROPIO]';
  const clean=String(x.descripcion||'').replace(/^\[MARC-(?:PROVEEDOR|PROPIO)\]\s*/i,'');
  const payload={nombre,marca:x.marca||null,modelo:x.modelo||null,categoria:x.categoria||'Accesorios',descripcion:`${marker} ${clean}`.trim(),unidad:x.unidad||'UND',precio_compra:Number(x.precio_compra||0),precio_venta:Number(x.precio_venta||0),activo:true,updated_at:new Date().toISOString()};
  try{
   const old=map.get(codigo);
   if(old){
    const r=await supabaseClient.from('productos').update(payload).eq('id',old.id).eq('user_id',u.id);
    if(r.error)throw r.error;updated++;imported.push(codigo);
   }else{
    const r=await supabaseClient.from('productos').insert({user_id:u.id,codigo,...payload,stock:0,stock_minimo:0}).select('id,codigo').single();
    if(r.error)throw r.error;
    created++;imported.push(codigo);map.set(codigo,r.data);
   }
  }catch(e){errors.push(`${codigo}: ${e.message||e}`)}
 }
 if(errors.length){alert(`Importación terminada con observaciones.\n\nNuevos: ${created}\nActualizados: ${updated}\nOmitidos: ${skipped}\nErrores: ${errors.length}\n\n${errors.slice(0,5).join('\n')}`)}else{alert(`✓ Productos enviados a Productos/Inventario.\n\nNuevos: ${created}\nActualizados: ${updated}\nOmitidos: ${skipped}`)}
 if(imported.length){closeEditor();if(typeof window.render==='function')window.render('inventory')}
}
function closeEditor(){document.querySelector('#catEditorModal')?.remove();current=null;items=[]}
function enhance(){const list=document.querySelector('#cat4List');if(!list)return;list.querySelectorAll('.cat4-row').forEach(row=>{if(row.querySelector('.cat4-edit'))return;const del=row.querySelector('.cat4-delete'),small=row.querySelector('.cat4-main small');if(!del||!/Procesado/i.test(small?.textContent||''))return;const b=document.createElement('button');b.type='button';b.className='btn btn-secondary cat4-edit';b.textContent='Revisar productos';b.onclick=()=>openEditor(del.dataset.id).catch(e=>alert(e.message||e));del.before(b)})}
const start=()=>{enhance();new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true})};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else setTimeout(start,600);window.MARC_OPEN_CATALOG_EDITOR=openEditor;
})();

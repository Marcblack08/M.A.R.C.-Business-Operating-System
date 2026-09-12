/* M.A.R.C. — puente Catálogos -> Productos */
(()=>{
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function user(){const r=await supabaseClient.auth.getUser();if(r.error||!r.data.user)throw new Error('Tu sesión expiró.');return r.data.user}
async function syncCatalog(id,btn){
 btn.disabled=true;btn.textContent='Pasando...';
 try{
  const u=await user();
  const {data:items,error}=await supabaseClient.from('catalogo_items').select('codigo,nombre,marca,modelo,categoria,descripcion,unidad,precio_compra,precio_venta,datos_extra').eq('catalogo_id',id).eq('user_id',u.id);
  if(error)throw error;if(!items?.length)throw new Error('Este catálogo no tiene productos importados.');
  const {data:existing,error:er}=await supabaseClient.from('productos').select('id,codigo,precio_compra,precio_venta').eq('user_id',u.id);if(er)throw er;
  const map=new Map((existing||[]).filter(x=>x.codigo).map(x=>[String(x.codigo).toUpperCase(),x]));
  const fresh=[];const updates=[];
  for(const x of items){const codigo=String(x.codigo||'').trim().toUpperCase();if(!codigo)continue;const payload={nombre:x.nombre||'Producto importado',marca:x.marca||null,modelo:x.modelo||null,categoria:x.categoria||null,descripcion:x.descripcion||null,unidad:x.unidad||'UND',precio_compra:Number(x.precio_compra||0),precio_venta:Number(x.precio_venta||0),activo:true,updated_at:new Date().toISOString()};const old=map.get(codigo);if(old){updates.push({id:old.id,payload})}else{fresh.push({user_id:u.id,codigo,...payload,stock:0,stock_minimo:0})}}
  if(fresh.length){const r=await supabaseClient.from('productos').insert(fresh);if(r.error)throw r.error}
  for(const x of updates){const r=await supabaseClient.from('productos').update(x.payload).eq('id',x.id).eq('user_id',u.id);if(r.error)throw r.error}
  btn.textContent=`✓ ${items.length} en Productos`;btn.classList.add('cat4-synced');
  const p=document.querySelector('#cat4Progress');if(p)p.textContent=`✓ Catálogo conectado · ${fresh.length} productos nuevos · ${updates.length} actualizados`;
 }catch(e){btn.disabled=false;btn.textContent='Pasar a Productos';const p=document.querySelector('#cat4Progress');if(p)p.textContent=`Error al pasar productos: ${e.message||e}`}
}
function enhance(){const list=document.querySelector('#cat4List');if(!list)return;list.querySelectorAll('.cat4-row').forEach(row=>{if(row.querySelector('.cat4-sync'))return;const del=row.querySelector('.cat4-delete');if(!del)return;const text=row.querySelector('.cat4-main small')?.textContent||'';if(!/Procesado/.test(text))return;const id=del.dataset.id;const b=document.createElement('button');b.type='button';b.className='btn btn-secondary cat4-sync';b.textContent='Pasar a Productos';b.onclick=()=>syncCatalog(id,b);del.before(b)})}
const start=()=>{const list=document.querySelector('#cat4List');if(!list)return;enhance();new MutationObserver(enhance).observe(list,{childList:true,subtree:true})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else setTimeout(start,500);
})();
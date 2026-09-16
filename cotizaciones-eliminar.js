/* M.A.R.C. — eliminar cotizaciones */
(function(){
'use strict';
const sb=()=>window.supabaseClient;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function user(){const s=sb();if(!s)throw Error('No hay conexión con Supabase');const u=(await s.auth.getUser()).data?.user;if(!u)throw Error('Necesita iniciar sesión');return u}
async function removeQuote(id,button){
 if(!id)return;
 const s=sb();
 const ok=window.confirm('¿Eliminar esta cotización?\n\nSe eliminarán también sus partidas y no se podrá recuperar.');
 if(!ok)return;
 const old=button?.textContent;if(button){button.disabled=true;button.textContent='Eliminando…'}
 try{
  const u=await user();
  const items=await s.from('cotizacion_items').delete().eq('cotizacion_id',id).eq('user_id',u.id);
  if(items.error)throw Error(items.error.message);
  const quote=await s.from('cotizaciones').delete().eq('id',id).eq('user_id',u.id);
  if(quote.error)throw Error(quote.error.message);
  const row=button?.closest('tr');if(row)row.remove();
  const box=document.querySelector('#qv3list');
  if(box&&!box.querySelector('tbody tr'))box.innerHTML='<div class="empty-state">No hay cotizaciones todavía.</div>';
 }catch(e){alert('No se pudo eliminar la cotización: '+e.message);if(button){button.disabled=false;button.textContent=old||'🗑 Eliminar'}}
}
function wire(){
 document.querySelectorAll('[data-vpdf]').forEach(pdf=>{
  const id=pdf.dataset.vpdf;if(!id)return;
  if(pdf.parentElement.querySelector('[data-delete-quote="'+id+'"]'))return;
  const b=document.createElement('button');b.type='button';b.className='table-action marc-delete-btn';b.dataset.deleteQuote=id;b.textContent='🗑 Eliminar';b.title='Eliminar cotización';b.style.marginLeft='6px';b.onclick=()=>removeQuote(id,b);pdf.parentElement.appendChild(b);
 });
}
window.MARC_DELETE_QUOTE=removeQuote;
new MutationObserver(wire).observe(document.body,{childList:true,subtree:true});setInterval(wire,500);setTimeout(wire,300);
})();

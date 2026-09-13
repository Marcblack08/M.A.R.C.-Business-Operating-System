/* M.A.R.C. — acceso seguro al editor antes de Productos/Inventario */
(()=>{
'use strict';

async function openEditorWhenReady(id){
  if(typeof window.MARC_OPEN_CATALOG_EDITOR==='function')return window.MARC_OPEN_CATALOG_EDITOR(id);
  // El editor se carga de forma dinámica; esperar evita el falso mensaje
  // "todavía está cargando" cuando el usuario pulsa inmediatamente.
  for(let i=0;i<40;i++){
    await new Promise(r=>setTimeout(r,250));
    if(typeof window.MARC_OPEN_CATALOG_EDITOR==='function')return window.MARC_OPEN_CATALOG_EDITOR(id);
  }
  throw new Error('No se pudo cargar el editor. Recarga la página e inténtalo nuevamente.');
}

function enhance(){
  const list=document.querySelector('#cat4List');
  if(!list)return;
  list.querySelectorAll('.cat4-row').forEach(row=>{
    const old=row.querySelector('.cat4-sync');
    if(old)old.remove();
    if(row.querySelector('.cat4-review'))return;
    const del=row.querySelector('.cat4-delete');
    const text=row.querySelector('.cat4-main small')?.textContent||'';
    if(!del||!/Procesado/i.test(text))return;
    const id=del.dataset.id;
    const b=document.createElement('button');
    b.type='button';
    b.className='btn btn-primary cat4-review';
    b.textContent='Revisar productos';
    b.title='Editar y aprobar productos antes de enviarlos a Productos e Inventario';
    b.onclick=async()=>{
      b.disabled=true;
      const original=b.textContent;
      b.textContent='Abriendo editor…';
      try{await openEditorWhenReady(id)}
      catch(e){alert(e.message||e)}
      finally{b.disabled=false;b.textContent=original}
    };
    del.before(b)
  })
}

function toolbar(){
  const panel=document.querySelector('#cat4Panel'),list=document.querySelector('#cat4List');
  if(!panel||!list||document.querySelector('#catSyncToolbar'))return;
  const bar=document.createElement('div');
  bar.id='catSyncToolbar';
  bar.className='cat-sync-toolbar';
  bar.innerHTML='<div><b>Revisión obligatoria antes de Inventario</b><span>Edita nombres, códigos, modelos y precios. Desde el editor podrás seleccionar qué productos aprobar.</span></div><button type="button" class="btn btn-primary" id="catReviewAll">Revisar productos</button>';
  list.parentNode.insertBefore(bar,list);
  bar.querySelector('#catReviewAll').onclick=async()=>{
    const first=list.querySelector('.cat4-review');
    if(!first){alert('No hay catálogos procesados para revisar.');return}
    first.click()
  }
}

function start(){
  const watch=()=>{toolbar();enhance()};
  watch();
  new MutationObserver(watch).observe(document.body,{childList:true,subtree:true})
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else setTimeout(start,500);
})();

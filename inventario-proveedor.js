/* M.A.R.C. — Inventario: los catálogos de proveedor no representan stock propio */
(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  let syncing=false;
  function isSupplier(p){return /\[MARC-PROVEEDOR\]/i.test(String(p?.descripcion||''))||!!String(p?.proveedor||'').trim()}
  async function sync(){
    if(syncing||!window.supabaseClient)return;
    const wrap=document.querySelector('#inventoryTableWrap');
    if(!wrap)return;
    syncing=true;
    try{
      const {data:{user},error:ue}=await window.supabaseClient.auth.getUser();
      if(ue||!user)return;
      const {data,error}=await window.supabaseClient.from('productos').select('id,stock,stock_minimo,descripcion,proveedor').eq('user_id',user.id).eq('activo',true);
      if(error)throw error;
      const rows=data||[];
      const own=rows.filter(p=>!isSupplier(p));
      const low=own.filter(p=>Number(p.stock||0)>0&&Number(p.stock||0)<=Number(p.stock_minimo||0));
      const out=own.filter(p=>Number(p.stock||0)<=0);
      const available=rows.filter(p=>Number(p.stock||0)>Number(p.stock_minimo||0));
      const set=(id,v)=>{const e=document.querySelector(id);if(e)e.textContent=v};
      set('#invProducts',rows.length);set('#invLow',low.length);set('#invOut',out.length);set('#invAvailable',available.length);
      const active=document.querySelector('.inv-filter-btn.active,.inventory-kpi.inv-filter.active')?.dataset.filter||'all';
      wrap.querySelectorAll('tbody tr').forEach(tr=>{
        const btn=tr.querySelector('.inv-move');
        const p=btn?rows.find(x=>String(x.id)===String(btn.dataset.id)):null;
        if(!p)return;
        const supplier=isSupplier(p),stock=Number(p.stock||0),min=Number(p.stock_minimo||0);
        let status=supplier&&stock<=0?'Catálogo proveedor':stock<=0?'Agotado':stock<=min?'Bajo':'Disponible';
        const mark=tr.querySelector('td:nth-child(5) mark');
        if(mark){mark.textContent=status;mark.className=status==='Agotado'?'critical':status==='Bajo'?'warning':''}
        tr.dataset.marcSupplier=supplier?'1':'0';
        const hidden=supplier&&stock<=0&&active!=='all';
        tr.style.display=hidden?'none':'';
      });
      if(!document.querySelector('#marcSupplierInventoryStyle')){
        const s=document.createElement('style');s.id='marcSupplierInventoryStyle';s.textContent='.marc-supplier-note{font-size:9px;color:#607b96}.inventory-supplier-status{display:inline-block;border:1px solid #cfe2f3;background:#f5fbff;color:#52708e;border-radius:999px;padding:3px 7px;font-size:9px;font-weight:700}';document.head.appendChild(s)
      }
    }catch(e){console.warn('M.A.R.C. inventario proveedor:',e)}finally{syncing=false}
  }
  function start(){
    const original=window.render;
    if(typeof original!=='function'){setTimeout(start,300);return}
    if(window.__MARC_PROVIDER_INVENTORY_PATCHED)return;
    window.__MARC_PROVIDER_INVENTORY_PATCHED=true;
    window.render=function(section='dashboard'){
      const result=original(section);
      if(section==='inventory'){setTimeout(sync,350);setTimeout(sync,1200)}
      return result;
    };
    const obs=new MutationObserver(()=>{if(document.querySelector('#inventoryTableWrap'))setTimeout(sync,80)});
    obs.observe(document.body,{childList:true,subtree:true});
    setInterval(()=>{if(document.querySelector('#inventoryTableWrap'))sync()},4000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else setTimeout(start,100);
})();

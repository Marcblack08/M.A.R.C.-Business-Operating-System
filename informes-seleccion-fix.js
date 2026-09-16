/* M.A.R.C. — Fix de selección Cliente / Cotización en informes técnicos */
(function(){
  'use strict';
  const sb=()=>window.supabaseClient;
  let cache={clients:[],quotes:[]};
  let loading=false;
  let lastModal=null;

  async function getUser(){
    const client=sb();
    if(!client) throw new Error('Supabase no está disponible.');
    const r=await client.auth.getUser();
    if(r.error||!r.data?.user) throw new Error('Sesión no disponible.');
    return r.data.user;
  }

  async function loadLists(){
    if(loading) return;
    loading=true;
    try{
      const u=await getUser();
      const [cr,qr]=await Promise.all([
        sb().from('clientes')
          .select('id,tipo_documento,documento,nombre_razon_social,nombre_contacto,telefono,correo,direccion')
          .eq('user_id',u.id)
          .order('nombre_razon_social'),
        sb().from('cotizaciones')
          .select('id,numero,cliente_id,cliente_snapshot,ubicacion,total,estado,created_at')
          .eq('user_id',u.id)
          .order('created_at',{ascending:false})
      ]);
      if(cr.error) throw new Error('Clientes: '+cr.error.message);
      if(qr.error) throw new Error('Cotizaciones: '+qr.error.message);
      cache.clients=cr.data||[];
      cache.quotes=qr.data||[];
    }finally{
      loading=false;
    }
  }

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function clientName(id){
    const c=cache.clients.find(x=>String(x.id)===String(id));
    return c?.nombre_razon_social || 'Sin cliente';
  }
  function quoteLabel(q){
    const name=q.cliente_id ? clientName(q.cliente_id) : (q.cliente_snapshot?.nombre_razon_social||'Sin cliente');
    return `${q.numero||'Sin número'} · ${name}${q.ubicacion?' · '+q.ubicacion:''}`;
  }

  function fillClients(sel,selected){
    if(!sel) return;
    const value=selected==null?'':String(selected);
    sel.innerHTML='<option value="">Sin cliente</option>'+cache.clients.map(c=>
      `<option value="${esc(c.id)}" ${String(c.id)===value?'selected':''}>${esc(c.nombre_razon_social||'Sin nombre')} — ${esc(c.documento||'')}</option>`
    ).join('');
    sel.value=value;
  }

  function fillQuotes(sel,clientId,selected){
    if(!sel) return;
    const value=selected==null?'':String(selected);
    const filtered=clientId
      ? cache.quotes.filter(q=>String(q.cliente_id||'')===String(clientId))
      : cache.quotes;
    sel.innerHTML='<option value="">Sin cotización</option>'+filtered.map(q=>
      `<option value="${esc(q.id)}" ${String(q.id)===value?'selected':''}>${esc(quoteLabel(q))}</option>`
    ).join('');
    sel.value=value;
  }

  async function enhance(modal){
    if(!modal||modal===lastModal) return;
    lastModal=modal;
    const clientSel=modal.querySelector('#trClient');
    const quoteSel=modal.querySelector('#trQuote');
    if(!clientSel&&!quoteSel) return;
    try{
      await loadLists();
      const originalClient=clientSel?.value||'';
      const originalQuote=quoteSel?.value||'';
      fillClients(clientSel,originalClient);
      const quote=cache.quotes.find(q=>String(q.id)===String(originalQuote));
      const effectiveClient=clientSel?.value || quote?.cliente_id || '';
      if(clientSel && !clientSel.value && quote?.cliente_id){
        clientSel.value=String(quote.cliente_id);
        clientSel.dispatchEvent(new Event('change',{bubbles:true}));
      }
      fillQuotes(quoteSel,effectiveClient,originalQuote);

      if(clientSel){
        clientSel.addEventListener('change',()=>{
          const id=clientSel.value||'';
          fillQuotes(quoteSel,id,'');
          if(id){
            const first=cache.quotes.find(q=>String(q.cliente_id||'')===String(id));
            if(first) quoteSel.value=String(first.id);
          }
        });
      }

      if(quoteSel){
        quoteSel.addEventListener('change',()=>{
          const q=cache.quotes.find(x=>String(x.id)===String(quoteSel.value));
          if(!q) return;
          if(q.cliente_id && clientSel && clientSel.value!==String(q.cliente_id)){
            clientSel.value=String(q.cliente_id);
            clientSel.dispatchEvent(new Event('change',{bubbles:true}));
            quoteSel.value=String(q.id);
          }
        });
      }
    }catch(e){
      const note=document.createElement('div');
      note.style.cssText='margin-top:6px;font-size:9px;color:#b42318;font-weight:700';
      note.textContent='No se pudieron cargar clientes/cotizaciones: '+e.message;
      quoteSel?.parentElement?.appendChild(note);
    }
  }

  const observer=new MutationObserver(()=>{
    const modal=document.getElementById('trModal');
    if(modal) enhance(modal);
  });
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>{const modal=document.getElementById('trModal');if(modal) enhance(modal)},100);
})();
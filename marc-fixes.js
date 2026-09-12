(function(){
  const validSections=new Set(['dashboard','clients','products','services','inventory','quotes','reports','documents','ai','company','settings']);
  let current=location.hash.replace(/^#/,'');
  if(!validSections.has(current)) current='dashboard';
  const originalRender=window.render;
  if(typeof originalRender==='function'){
    window.render=function(section='dashboard'){
      if(validSections.has(section)) current=section;
      originalRender(section);
    };
  }
  const originalShowApp=window.showApp;
  if(typeof originalShowApp==='function'){
    window.showApp=function(session){
      if(!session)return;
      if(validSections.has(current)){
        const old=window.render;
        window.render=function(section='dashboard'){ current=validSections.has(section)?section:current; originalRender(section); };
        try{
          const authScreen=document.querySelector('#authScreen'),appShell=document.querySelector('#appShell');
          authScreen.hidden=true; appShell.hidden=false;
          const email=session.user?.email||'';
          const set=(id,v)=>{const el=document.querySelector(id);if(el)el.textContent=v;};
          set('#userEmail',email); set('#companyUser',email.split('@')[0]||'Usuario'); set('#userName',email.split('@')[0]||'Usuario');
          originalRender(current);
        }finally{ window.render=old; }
      } else originalShowApp(session);
    };
  }
  document.addEventListener('click',function(e){
    const nav=e.target.closest?.('.nav-item');
    if(nav && validSections.has(nav.dataset.section)){
      current=nav.dataset.section;
      history.replaceState(null,'','#'+current);
    }
  },true);
  window.addEventListener('popstate',()=>{const s=location.hash.replace(/^#/,'');if(validSections.has(s)){current=s;window.render(s);}});
  document.addEventListener('submit',async function(e){
    const form=e.target;
    if(form?.id!=='clientForm') return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const msg=form.querySelector('#clientFormMsg');
    const btn=form.querySelector('button[type="submit"]');
    if(btn)btn.disabled=true;
    try{
      const fixClient=window.supabase.createClient('https://hmnzzknuiejchypalpalpig.supabase.co','sb_publishable_mhRoYMQTWrmYpuclqzQ1MA_6TMtGikq',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      const {data:{user},error:userError}=await fixClient.auth.getUser();
      if(userError||!user) throw new Error('Tu sesión no está disponible. Cierra sesión y vuelve a ingresar.');
      const fd=new FormData(form);
      const payload={user_id:user.id,tipo_documento:String(fd.get('tipo_documento')||'RUC'),documento:String(fd.get('documento')||'').trim(),nombre_razon_social:String(fd.get('nombre_razon_social')||'').trim(),nombre_contacto:String(fd.get('nombre_contacto')||'').trim()||null,telefono:String(fd.get('telefono')||'').trim()||null,correo:String(fd.get('correo')||'').trim()||null,direccion:String(fd.get('direccion')||'').trim()||null,notas:String(fd.get('notas')||'').trim()||null,updated_at:new Date().toISOString()};
      if(!payload.documento||!payload.nombre_razon_social) throw new Error('Completa el documento y el nombre o razón social.');
      const {error}=await fixClient.from('clientes').insert(payload);
      if(error) throw error;
      form.closest('#clientModal')?.remove();
      if(typeof window.render==='function') window.render('clients');
    }catch(err){
      if(msg){msg.textContent=err?.message||'No se pudo guardar el cliente.';msg.className='client-form-msg error';}
    }finally{if(btn)btn.disabled=false;}
  },true);
})();

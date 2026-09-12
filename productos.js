
    analyzeBtn.addEventListener('click',async()=>{
      if(!selectedFile)return;
      analyzeBtn.disabled=true;analyzeBtn.textContent='Analizando...';setMsg('Analizando la foto con IA...','info');
      try{
        const image=await compressImage(selectedFile);
        const r=await fetch('/api/analyze-product',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image})});
        const j=await r.json();
        if(!r.ok){
          const detail=j.detail?` ${j.detail}`:'';
          throw new Error(`${j.error||'No se pudo analizar la imagen.'}${detail}`);
        }
        const parsed=parseAI(j.text||'');
        const count=Object.values(parsed||{}).filter(v=>v!==null&&v!==undefined&&String(v).trim()!=='').length;
        if(count<1)throw new Error('La IA no devolvió datos legibles.');
        fillForm(modal,parsed);setMsg(`${count} datos detectados. Revísalos antes de guardar.`,'success');
      }catch(e){setMsg(e.message,'error');}
      finally{analyzeBtn.disabled=false;analyzeBtn.textContent='✨ Analizar con IA';}
    });

    modal.querySelector('#productForm').addEventListener('submit',async e=>{
      e.preventDefault();const form=e.currentTarget,save=modal.querySelector('#saveProductBtn');if(!form.reportValidity())return;
      save.disabled=true;save.textContent='Guardando...';setMsg('Guardando producto y foto...','info');
      try{
        const {data:{user}}=await supabaseClient.auth.getUser();if(!user)throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
        const fd=new FormData(form);
        const payload={user_id:user.id,codigo:String(fd.get('codigo')||'').trim(),nombre:String(fd.get('nombre')||'').trim(),marca:String(fd.get('marca')||'').trim()||null,modelo:String(fd.get('modelo')||'').trim()||null,categoria:String(fd.get('categoria')||'').trim()||null,descripcion:String(fd.get('descripcion')||'').trim()||null,unidad:String(fd.get('unidad')||'UND'),precio_compra:Number(fd.get('precio_compra')||0),precio_venta:Number(fd.get('precio_venta')||0),stock:Number(fd.get('stock')||0),stock_minimo:Number(fd.get('stock_minimo')||0),imagen_url:p?.imagen_url||null,activo:fd.get('activo')==='on',updated_at:new Date().toISOString()};
        let newImagePath=null;
        if(selectedFile){
          const dataUrl=await compressImage(selectedFile);
          const bytes=dataUrlToArrayBuffer(dataUrl);
          newImagePath=`${user.id}/${crypto.randomUUID()}.jpg`;
          const up=await supabaseClient.storage.from(BUCKET).upload(newImagePath,bytes,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});
          if(up.error)throw new Error(`No se pudo guardar la foto: ${up.error.message}`);
          payload.imagen_url=newImagePath;
        }
        const r=p?await supabaseClient.from('productos').update(payload).eq('id',p.id).eq('user_id',user.id):await supabaseClient.from('productos').insert(payload);
        if(r.error){if(newImagePath)await supabaseClient.storage.from(BUCKET).remove([newImagePath]);throw new Error(r.error.message);}
        if(p?.imagen_url&&newImagePath&&p.imagen_url!==newImagePath)await supabaseClient.storage.from(BUCKET).remove([p.imagen_url]);
        close();loadProducts();
      }catch(err){setMsg(err.message,'error');save.disabled=false;save.textContent=p?'Guardar cambios':'Guardar producto';}
    });

    function setMsg(text,type){const m=modal.querySelector('#productFormMsg');m.textContent=text;m.className=`product-form-msg ${type||''}`;}
  }

  function setField(modal,name,value){if(value===null||value===undefined||value==='')return;const el=modal.querySelector(`[name="${name}"]`);if(el)el.value=String(value);}
  function fillForm(modal,d){setField(modal,'codigo',d.codigo);setField(modal,'nombre',d.nombre);setField(modal,'marca',d.marca);setField(modal,'modelo',d.modelo);setField(modal,'categoria',d.categoria);setField(modal,'descripcion',d.descripcion);if(d.precio_compra!=null)setField(modal,'precio_compra',d.precio_compra);if(d.precio_venta!=null)setField(modal,'precio_venta',d.precio_venta);}
  function parseAI(text){let t=String(text||'').trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();try{return JSON.parse(t)}catch{}const m=t.match(/\{[\s\S]*\}/);if(m)try{return JSON.parse(m[0])}catch{}return {};}
  function dataUrlToArrayBuffer(dataUrl){const base64=String(dataUrl).split(',')[1]||'';const bin=atob(base64),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes.buffer;}
  async function compressImage(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{const img=new Image();img.onload=()=>{const max=1280,scale=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d',{alpha:false}).drawImage(img,0,0,c.width,c.height);resolve(c.toDataURL('image/jpeg',0.75));};img.onerror=reject;img.src=reader.result;};reader.readAsDataURL(file);});}
  async function deleteProduct(id,rows){const p=rows.find(x=>x.id===id);if(!p)return;if(!window.confirm(`¿Eliminar ${p.nombre}?`))return;const {data:{user}}=await supabaseClient.auth.getUser();if(!user)return;const {error}=await supabaseClient.from('productos').delete().eq('id',id).eq('user_id',user.id);if(error){window.alert(error.message);return;}if(p.imagen_url)await supabaseClient.storage.from(BUCKET).remove([p.imagen_url]);loadProducts();}

  const s=document.createElement('style');s.textContent='.products-loading,.products-empty{padding:55px 20px;text-align:center;color:#7891ad;font-size:12px}.products-empty-icon{width:64px;height:64px;margin:0 auto 12px;border-radius:18px;background:#eaf5ff;color:#087cf5;display:grid;place-items:center;font-size:27px}.products-empty h3{margin:0 0 6px;color:#24496e;font-size:16px}.products-empty p{margin:0 auto 15px}.product-thumb{width:42px;height:42px;object-fit:cover;border-radius:9px;border:1px solid #d8e5f0;background:#f4f8fb;display:block}.product-thumb.empty{display:grid;place-items:center;color:#79a1c6;font-size:17px}.product-modal-backdrop{position:fixed;inset:0;background:#071d38aa;backdrop-filter:blur(6px);z-index:100;display:grid;place-items:center;padding:18px}.product-modal{width:min(720px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:20px;padding:24px}.product-modal-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px}.product-modal-head h2{margin:0;color:#102b54;font-size:23px}.product-close{border:0;background:#eef5fb;color:#557493;border-radius:9px;width:34px;height:34px;font-size:22px}.product-form{display:grid;gap:13px}.product-form label{display:grid;gap:6px;color:#536b89;font-size:11px;font-weight:700}.product-form input,.product-form select{width:100%;border:1px solid #d2e0ec;border-radius:10px;background:#f8fbfe;color:#173452;padding:11px;font-size:12px}.product-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.product-check{display:flex!important;align-items:center;gap:8px}.product-check input{width:auto}.product-modal-actions{display:flex;justify-content:flex-end;gap:9px}.product-form-msg{min-height:20px;font-size:10px}.product-form-msg.error{color:#d13d4e}.product-form-msg.success{color:#14865b}.product-form-msg.info{color:#087cf5}.product-photo-box{border:1px dashed #bfd2e2;border-radius:15px;background:#f7fbff;padding:14px;display:grid;grid-template-columns:86px 1fr;gap:13px;align-items:center}.product-preview{width:86px;height:86px;border-radius:13px;background:#eaf4fb;color:#73a0c4;display:grid;place-items:center;overflow:hidden;font-size:24px}.product-preview img{width:100%;height:100%;object-fit:cover}.product-photo-actions{display:flex;gap:8px;flex-wrap:wrap}.product-photo-box small{grid-column:1/-1;color:#7b92aa;font-size:9px}.photo-label{cursor:pointer;display:inline-flex!important;align-items:center;justify-content:center;min-height:38px}@media(max-width:600px){.product-grid{grid-template-columns:1fr}.product-modal{padding:19px}.product-photo-box{grid-template-columns:1fr}.product-preview{margin:auto}.product-photo-actions{justify-content:center}}';document.head.appendChild(s);
})();
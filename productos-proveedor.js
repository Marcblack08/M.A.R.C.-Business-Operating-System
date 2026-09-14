/* M.A.R.C. — proveedor en Productos
   Añade el nombre del proveedor al formulario existente sin romper el flujo actual.
   La columna public.productos.proveedor existe en Supabase.
*/
(function(){'use strict';
  const sb=window.supabaseClient;
  if(!sb) return;
  let pendingProvider='';

  // Inyecta el campo en el modal original de Productos.
  function enhanceModal(){
    const form=document.querySelector('#productForm');
    if(!form || form.querySelector('[name="proveedor"]')) return;
    const category=form.querySelector('[name="categoria"]');
    const description=form.querySelector('[name="descripcion"]');
    const row=category?.closest('.product-grid');
    const box=document.createElement('div');
    box.className='product-grid marc-provider-row';
    box.innerHTML='<label>Proveedor (nombre)<input name="proveedor" type="text" autocomplete="organization" placeholder="Ej.: Hikvision Perú, Importaciones ABC, etc."><small class="marc-provider-help">Indica quién te suministra este producto. Si es producto propio, puedes dejarlo vacío.</small></label><label>Origen del producto<select name="origen_producto"><option value="PROPIO">Producto propio</option><option value="PROVEEDOR">Producto de proveedor</option></select></label>';
    if(row) row.insertAdjacentElement('afterend',box);
    else if(description) description.closest('.product-grid')?.insertAdjacentElement('afterend',box);
    else form.prepend(box);
    const input=form.querySelector('[name="proveedor"]');
    const origin=form.querySelector('[name="origen_producto"]');
    const existing=form.dataset.marcExistingProvider||'';
    if(existing) input.value=existing;
    function sync(){
      const isProv=origin.value==='PROVEEDOR';
      input.required=isProv;
      input.placeholder=isProv?'Nombre del proveedor (obligatorio)':'Ej.: Hikvision Perú';
      box.classList.toggle('marc-provider-required',isProv);
    }
    origin.addEventListener('change',sync);sync();
    // Captura el proveedor antes del submit original de productos.js.
    form.addEventListener('submit',()=>{
      pendingProvider=String(input.value||'').trim();
      if(origin.value==='PROVEEDOR' && !pendingProvider){input.setCustomValidity('Ingresa el nombre del proveedor.');input.reportValidity();}else input.setCustomValidity('');
      window.__MARC_PRODUCT_PROVIDER=pendingProvider;
      setTimeout(()=>{pendingProvider='';window.__MARC_PRODUCT_PROVIDER='';},2500);
    },true);
    loadExistingProvider(form).catch(()=>{});
  }

  async function loadExistingProvider(form){
    const id=form.closest('#productModal')?.dataset?.productId;
    if(!id) return;
    const {data,error}=await sb.from('productos').select('proveedor').eq('id',id).maybeSingle();
    if(error||!data) return;
    const input=form.querySelector('[name="proveedor"]');
    const origin=form.querySelector('[name="origen_producto"]');
    if(input){input.value=data.proveedor||'';form.dataset.marcExistingProvider=data.proveedor||'';}
    if(origin){origin.value=data.proveedor?'PROVEEDOR':'PROPIO';origin.dispatchEvent(new Event('change'));}
  }

  // El formulario original ya construye el payload. Interceptamos únicamente
  // insert/update de productos para añadir proveedor sin duplicar su lógica de fotos.
  if(!sb.__marcProviderWrapped){
    const originalFrom=sb.from.bind(sb);
    sb.from=function(table){
      const query=originalFrom(table);
      if(table!=='productos') return query;
      return new Proxy(query,{get(target,prop,receiver){
        if(prop==='insert'||prop==='update'){
          return function(payload){
            const provider=String(window.__MARC_PRODUCT_PROVIDER||pendingProvider||'').trim()||null;
            if(provider){
              if(prop==='insert'){
                if(Array.isArray(payload)) payload=payload.map(x=>({...x,proveedor:provider}));
                else payload={...payload,proveedor:provider};
              }else payload={...payload,proveedor:provider};
            }else if(prop==='insert'){
              if(Array.isArray(payload)) payload=payload.map(x=>({...x,proveedor:null}));
              else payload={...payload,proveedor:null};
            }
            return target[prop](payload);
          };
        }
        return Reflect.get(target,prop,receiver);
      }});
    };
    sb.__marcProviderWrapped=true;
  }

  const style=document.createElement('style');
  style.textContent='.marc-provider-row{margin-top:2px}.marc-provider-row label{display:grid;gap:6px;color:#24496e;font-weight:600;font-size:12px}.marc-provider-row input,.marc-provider-row select{width:100%;box-sizing:border-box;border:1px solid #d6e3ee;border-radius:10px;padding:11px 12px;background:#fff;color:#183957;font:inherit}.marc-provider-help{font-size:10px;font-weight:400;color:#7891a8;line-height:1.35}.marc-provider-required{padding:10px;border:1px solid #cfe5fb;border-radius:12px;background:#f5faff}.marc-provider-required .marc-provider-help{color:#087cf5;font-weight:600}';
  document.head.appendChild(style);

  const observer=new MutationObserver(()=>enhanceModal());
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',enhanceModal);
  setTimeout(enhanceModal,500);

  // Cuando se abre el modal de edición, asociamos el id al formulario para recuperar proveedor.
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('.product-edit');
    if(!b) return;
    setTimeout(()=>{const m=document.querySelector('#productModal');if(m){m.dataset.productId=b.dataset.id;enhanceModal();loadExistingProvider(m.querySelector('#productForm')).catch(()=>{});}},80);
  },true);
})();

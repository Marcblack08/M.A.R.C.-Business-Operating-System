/* M.A.R.C. — fixes de navegación, persistencia y compatibilidad */
(function(){
  const add=(id,href)=>{if(document.querySelector(`link[data-marc="${id}"]`))return;const l=document.createElement('link');l.rel='stylesheet';l.href=href;l.dataset.marc=id;document.head.appendChild(l)};
  add('catalog-css','./catalogos-v4.css?v=5');add('editor-css','./catalogos-editor.css?v=1');
  const load=(id,src)=>{if(document.querySelector(`script[data-marc="${id}"]`))return;const s=document.createElement('script');s.src=src;s.dataset.marc=id;document.head.appendChild(s)};
  load('catalog-sync','./catalogos-sync.js?v=3');load('catalog-v5','./catalogos-v5.js?v=2');load('catalog-editor','./catalogos-editor.js?v=1');
  window.__MARC_CATALOG_TYPE='PROPIO';
  try{Object.defineProperty(window,'tipo',{configurable:true,get(){return window.__MARC_CATALOG_TYPE||'PROPIO'},set(v){window.__MARC_CATALOG_TYPE=v||'PROPIO'}})}catch{}
  document.addEventListener('change',e=>{const id=e.target?.id;if(id==='cat4Own'||id==='catOwn')window.__MARC_CATALOG_TYPE='PROPIO';if(id==='cat4Prov'||id==='catSupplier')window.__MARC_CATALOG_TYPE='PROVEEDOR'},true);
  const validSections=new Set(['dashboard','clients','products','services','inventory','quotes','reports','documents','ai','company','settings']);let current=location.hash.replace(/^#/,'');if(!validSections.has(current))current='dashboard';
  const originalRender=window.render;if(typeof originalRender==='function')window.render=function(section='dashboard'){if(validSections.has(section))current=section;originalRender(section)};
  const originalShowApp=window.showApp;if(typeof originalShowApp==='function')window.showApp=function(session){if(!session)return;const a=document.querySelector('#authScreen'),s=document.querySelector('#appShell');if(a)a.hidden=true;if(s)s.hidden=false;const email=session.user?.email||'';const set=(id,v)=>{const e=document.querySelector(id);if(e)e.textContent=v};set('#userEmail',email);set('#companyUser',email.split('@')[0]||'Usuario');set('#userName',email.split('@')[0]||'Usuario');originalRender(validSections.has(current)?current:'dashboard')};
  document.addEventListener('click',e=>{const nav=e.target.closest?.('.nav-item');if(nav&&validSections.has(nav.dataset.section)){current=nav.dataset.section;history.replaceState(null,'','#'+current)}},true);
  window.addEventListener('hashchange',()=>{const section=location.hash.replace(/^#/,'');if(validSections.has(section)){current=section;if(typeof window.render==='function')window.render(section)}});
  const NativeFormData=window.FormData;if(NativeFormData){window.FormData=function(form,...args){if(form&&!(form instanceof HTMLFormElement))form=document.querySelector('#productForm')||form;if(!form)form=document.querySelector('#productForm')||undefined;return form===undefined?new NativeFormData(...args):new NativeFormData(form)};window.FormData.prototype=NativeFormData.prototype}
})();

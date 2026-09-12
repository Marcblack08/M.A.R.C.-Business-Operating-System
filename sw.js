const CACHE_NAME='marc-pwa-v18-catalog-network';
const APP_SHELL=['/','/index.html','/styles.css','/app.js','/manifest.webmanifest','/icons/marc.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const r=event.request;
 const isCatalogAI=r.method==='POST'&&new URL(r.url).pathname==='/api/analyze-catalog-page';
 if(isCatalogAI){
   event.respondWith((async()=>{
     let last;
     for(let attempt=1;attempt<=3;attempt++){
       try{
         const response=await fetch(r.clone());
         if(response.ok||attempt===3)return response;
         last=new Error(`HTTP ${response.status}`);
       }catch(e){
         last=e;
         if(attempt<3)await new Promise(resolve=>setTimeout(resolve,attempt*1200));
       }
     }
     return new Response(JSON.stringify({error:'No se pudo conectar con la IA del catálogo.',detail:String(last?.message||last||'Error de red')}),{status:503,headers:{'Content-Type':'application/json'}});
   })());
   return;
 }
 if(r.method!=='GET')return;
 event.respondWith((async()=>{try{const response=await fetch(r);if((response.headers.get('content-type')||'').includes('text/html'))return response;const copy=response.clone();caches.open(CACHE_NAME).then(c=>c.put(r,copy)).catch(()=>{});return response}catch(e){const cached=await caches.match(r);return cached||caches.match('/index.html')}})());
});
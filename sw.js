const CACHE_NAME='marc-pwa-v19-catalog-ocr';
const APP_SHELL=['/','/index.html','/styles.css','/app.js','/manifest.webmanifest','/icons/marc.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const r=event.request;
 const u=new URL(r.url);
 const isCatalogAI=r.method==='POST'&&u.pathname==='/api/analyze-catalog-page';
 if(isCatalogAI){event.respondWith(fetch(r));return}
 if(r.method!=='GET')return;
 event.respondWith((async()=>{try{const response=await fetch(r);const ct=response.headers.get('content-type')||'';if(ct.includes('text/html'))return response;if(u.pathname.endsWith('/catalogos.js')||u.pathname.endsWith('/catalogos-ui.css'))return response;const copy=response.clone();caches.open(CACHE_NAME).then(c=>c.put(r,copy)).catch(()=>{});return response}catch(e){const cached=await caches.match(r);return cached||caches.match('/index.html')}})());
});
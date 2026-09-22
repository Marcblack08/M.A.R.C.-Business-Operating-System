(()=>{
  const KEY="marc_notifications_v1";
  const REMINDERS="marc_reminders_v1";
  const WATCHERS="marc_watchers_v1";
  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const read=k=>{try{return JSON.parse(localStorage.getItem(k)||"[]")}catch{return[]}};
  const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const uid=()=>crypto.randomUUID?.()||Date.now()+"-"+Math.random();
  async function syncServer(){
    try{
      const token=window.st?.session?.access_token;
      if(!token)return;
      const r=await fetch("/api/notifications",{headers:{Authorization:"Bearer "+token}});
      if(!r.ok)return;
      const data=await r.json(); const rows=Array.isArray(data.notifications)?data.notifications:[];
      const local=notifications(); const known=new Set(local.map(x=>x.server_id||x.id));
      let changed=false;
      for(const x of rows){
        const key=String(x.id);
        if(known.has(key))continue;
        local.unshift({id:uid(),server_id:key,title:x.title,body:x.body||"",read:x.status==="SENT",created_at:x.sent_at||x.due_at||x.created_at,meta:{server:true,status:x.status,entity_type:x.entity_type||null,entity_id:x.entity_id||null,metadata:x.metadata||{}}});
        changed=true;
      }
      if(changed){write(KEY,local.slice(0,100));renderCount();}
    }catch(e){}
  }
  function notifications(){return read(KEY)}
  function watchers(){return read(WATCHERS)}
  function saveWatchers(rows){write(WATCHERS,rows)}
  function addNotification(title,body,action="",meta={}){
    const rows=notifications();
    rows.unshift({id:uid(),title,body,action,meta,read:false,created_at:new Date().toISOString()});
    write(KEY,rows.slice(0,100));
    renderCount();
    return rows[0];
  }
  function renderCount(){const n=notifications().filter(x=>!x.read).length;const b=$("#notificationCount");if(b){b.textContent=n>99?"99+":String(n);b.classList.toggle("hidden",n===0)}}
  function alertAction(x){
    const type=String(x?.meta?.entity_type||"").toUpperCase();
    if(type==="INVENTORY"){try{window.view?.("inventory")}catch{}}
    else if(type==="QUOTE"){try{window.view?.("quotes")}catch{}}
    else if(type==="CASH"){try{window.view?.("cash")}catch{}}
  }
  function actionLabel(x){
    const t=String(x?.meta?.entity_type||"").toUpperCase();
    if(t==="QUOTE")return "Preparar seguimiento";
    if(t==="INVENTORY")return "Revisar inventario";
    if(t==="CASH")return "Revisar caja";
    return "Ver";
  }
  function runSmartAction(x){
    const t=String(x?.meta?.entity_type||"").toUpperCase();
    if(t==="QUOTE"){
      try{
        window.openChat?.();
        const input=$("#chatInput");
        if(input){input.value="Prepara un seguimiento para la cotización.";input.focus();}
      }catch{}
      return;
    }
    alertAction(x);
  }
  function open(){
    let root=$("#notificationPanel");
    if(root){root.remove();return}
    root=document.createElement("div");root.id="notificationPanel";root.className="notification-panel";
    const rows=notifications();
    root.innerHTML='<div class="notification-head"><div><b>Notificaciones</b><small>Recordatorios y tareas de M.A.R.C.</small></div><button id="closeNotifications" type="button">×</button></div><div class="notification-list">'+
      (rows.length?rows.map((x,i)=>'<article class="notification-item '+(x.read?'read':'')+'" data-notification-index="'+i+'"><span class="notification-dot"></span><div class="notification-main"><b>'+esc(x.title)+'</b><p>'+esc(x.body)+'</p><small>'+new Date(x.created_at).toLocaleString("es-PE")+'</small></div>'+((x.meta?.entity_type)?'<button class="notification-go" type="button" data-notification-go="'+i+'">'+actionLabel(x)+'</button>':'')+'</article>').join(""):'<div class="notification-empty"><span>✓</span><b>Todo al día</b><small>No tienes notificaciones pendientes.</small></div>')+
      '</div><div class="notification-actions"><button id="requestNotifications" type="button">🔔 Activar avisos</button><button id="markNotificationsRead" type="button">Marcar todo leído</button></div>';
    document.body.appendChild(root);
    root.querySelectorAll("[data-notification-go]").forEach(b=>b.onclick=()=>{
      const x=notifications()[Number(b.dataset.notificationGo)];
      if(x){x.read=true;write(KEY,notifications());renderCount();root.remove();alertAction(x);}
    });
    $("#closeNotifications").onclick=()=>root.remove();
    $("#markNotificationsRead").onclick=()=>{const rows=notifications().map(x=>({...x,read:true}));write(KEY,rows);renderCount();open()};
    $("#requestNotifications").onclick=async()=>{
      if(!("Notification" in window))return alert("Este navegador no admite notificaciones web.");
      const p=await Notification.requestPermission();
      if(p==="granted")new Notification("M.A.R.C.",{body:"Los avisos del negocio están activados."});
    };
    write(KEY,rows.map(x=>({...x,read:true})));renderCount();
  }
  async function notify(title,body){
    addNotification(title,body);
    if("Notification" in window&&Notification.permission==="granted")new Notification(title,{body});
  }
  async function share(payload={}){
    const title=String(payload.title||"Publicidad de M.A.R.C.");
    const text=String(payload.text||"");
    const url=String(payload.url||location.href);
    let files=Array.isArray(payload.files)?payload.files:[];
    if(payload.imageDataUrl && !files.length){
      try{
        const m=String(payload.imageDataUrl).match(/^data:([^;]+);base64,(.+)$/);
        if(m){const bin=atob(m[2]),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);files=[new File([bytes],payload.fileName||"publicidad-marc.png",{type:m[1]})]}
      }catch(e){console.warn("[M.A.R.C. share] image conversion failed",e)}
    }
    if(navigator.share){
      try{
        if(files.length&&navigator.canShare?.({files}))return await navigator.share({title,text,url,files});
        return await navigator.share({title,text,url});
      }catch(e){if(e?.name==="AbortError")return;throw e}
    }
    const options=[
      {name:"WhatsApp",url:"https://wa.me/?text="+encodeURIComponent([text,url].filter(Boolean).join("\\n"))},
      {name:"Facebook",url:"https://www.facebook.com/sharer/sharer.php?u="+encodeURIComponent(url)},
      {name:"X",url:"https://twitter.com/intent/tweet?text="+encodeURIComponent(text)+"&url="+encodeURIComponent(url)},
      {name:"LinkedIn",url:"https://www.linkedin.com/sharing/share-offsite/?url="+encodeURIComponent(url)}
    ];
    const root=document.createElement("div");root.className="share-fallback";root.innerHTML='<div class="share-card"><b>Compartir</b>'+options.map((x,i)=>'<button data-i="'+i+'">'+x.name+'</button>').join("")+ '<button data-copy="1">📋 Copiar texto</button><button data-close="1">Cancelar</button></div>';document.body.appendChild(root);
    root.querySelectorAll("button[data-i]").forEach(b=>b.onclick=()=>{window.open(options[Number(b.dataset.i)].url,"_blank","noopener,noreferrer");root.remove()});
    root.querySelector("[data-copy]").onclick=async()=>{await navigator.clipboard?.writeText([text,url].filter(Boolean).join("\\n"));root.remove()};
    root.querySelector("[data-close]").onclick=()=>root.remove();
  }
  function reminder(title,body,when){
    const rows=read(REMINDERS);rows.push({id:uid(),title,body,when:new Date(when).toISOString(),done:false});write(REMINDERS,rows);addNotification("Recordatorio creado",title+" · "+new Date(when).toLocaleString("es-PE"));return rows[rows.length-1];
  }
  function installMarketingShare(){
    const host=document.querySelector("#marketingPublishCenter");
    if(!host||host.querySelector(".marc-share-marketing"))return;
    const b=document.createElement("button");b.type="button";b.className="secondary marc-share-marketing";b.textContent="📤 Compartir publicidad";
    b.onclick=()=>{
      const title=document.querySelector("#marketingPublishCenter h3,h2,h4")?.textContent||"Publicidad de M.A.R.C.";
      const text=host.innerText.replace(/\\s+/g," ").trim().slice(0,1800);
      share({title,text,url:location.href});
    };
    const actions=host.querySelector(".hero-actions,.panel-actions,.actions,.modal-actions")||host;
    actions.appendChild(b);
  }
  function watchInventory(){
    const rows=watchers(); if(!rows.length)return;
    const seen=new Set();
    document.querySelectorAll("[data-stock]").forEach(el=>{
      const id=el.dataset.stockId||el.dataset.id;if(!id)return;
      const stock=Number(el.dataset.stock); if(!Number.isFinite(stock))return;
      const w=rows.find(x=>x.type==="STOCK"&&x.item_id===id&&!x.done);
      if(w&&stock<=Number(w.threshold||0)){seen.add(w.id);w.done=true;notify("Stock agotado",w.message||("El producto "+(w.item_name||"") +" llegó al límite configurado."));}
    });
    if(seen.size)saveWatchers(rows);
  }
  function checkReminders(){
    const now=Date.now();let changed=false;const rows=read(REMINDERS).map(r=>{
      if(!r.done&&new Date(r.when).getTime()<=now){r.done=true;changed=true;notify(r.title,r.body)}return r;
    });if(changed)write(REMINDERS,rows);
  }
  function addStockWatch(itemId,itemName,threshold=0,message=""){const rows=watchers();rows.push({id:uid(),type:"STOCK",item_id:String(itemId),item_name:itemName||"",threshold:Number(threshold)||0,message,done:false,created_at:new Date().toISOString()});saveWatchers(rows);return rows.at(-1)}
  window.MARCNotifications={notifications,add:addNotification,notify,open,share,reminder,addStockWatch,check:()=>{checkReminders();watchInventory()}};
  document.addEventListener("DOMContentLoaded",()=>{
    $("#notificationBell")?.addEventListener("click",open);
    renderCount();checkReminders();watchInventory();installMarketingShare();syncServer();setInterval(()=>{checkReminders();watchInventory();syncServer()},30000);new MutationObserver(()=>installMarketingShare()).observe(document.body,{childList:true,subtree:true});
    if(!notifications().length)addNotification("Bienvenido a M.A.R.C.","Aquí aparecerán recordatorios, publicidad pendiente, cobros y tareas importantes.");
  });
})();

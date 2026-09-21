(()=>{
  const KEY="marc_notifications_v1";
  const REMINDERS="marc_reminders_v1";
  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const read=k=>{try{return JSON.parse(localStorage.getItem(k)||"[]")}catch{return[]}};
  const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const uid=()=>crypto.randomUUID?.()||Date.now()+"-"+Math.random();
  function notifications(){return read(KEY)}
  function addNotification(title,body,action="",meta={}){
    const rows=notifications();
    rows.unshift({id:uid(),title,body,action,meta,read:false,created_at:new Date().toISOString()});
    write(KEY,rows.slice(0,100));
    renderCount();
    return rows[0];
  }
  function renderCount(){const n=notifications().filter(x=>!x.read).length;const b=$("#notificationCount");if(b){b.textContent=n>99?"99+":String(n);b.classList.toggle("hidden",n===0)}}
  function open(){
    let root=$("#notificationPanel");
    if(root){root.remove();return}
    root=document.createElement("div");root.id="notificationPanel";root.className="notification-panel";
    const rows=notifications();
    root.innerHTML='<div class="notification-head"><div><b>Notificaciones</b><small>Recordatorios y tareas de M.A.R.C.</small></div><button id="closeNotifications" type="button">×</button></div><div class="notification-list">'+
      (rows.length?rows.map(x=>'<article class="notification-item '+(x.read?'read':'')+'"><span class="notification-dot"></span><div><b>'+esc(x.title)+'</b><p>'+esc(x.body)+'</p><small>'+new Date(x.created_at).toLocaleString("es-PE")+'</small></div></article>').join(""):'<div class="notification-empty"><span>✓</span><b>Todo al día</b><small>No tienes notificaciones pendientes.</small></div>')+
      '</div><div class="notification-actions"><button id="requestNotifications" type="button">🔔 Activar avisos</button><button id="markNotificationsRead" type="button">Marcar todo leído</button></div>';
    document.body.appendChild(root);
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
    const files=Array.isArray(payload.files)?payload.files:[];
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
  function checkReminders(){
    const now=Date.now();let changed=false;const rows=read(REMINDERS).map(r=>{
      if(!r.done&&new Date(r.when).getTime()<=now){r.done=true;changed=true;notify(r.title,r.body)}return r;
    });if(changed)write(REMINDERS,rows);
  }
  window.MARCNotifications={notifications,add:addNotification,notify,open,share,reminder,check:checkReminders};
  document.addEventListener("DOMContentLoaded",()=>{
    $("#notificationBell")?.addEventListener("click",open);
    renderCount();checkReminders();installMarketingShare();setInterval(checkReminders,30000);new MutationObserver(()=>installMarketingShare()).observe(document.body,{childList:true,subtree:true});
    if(!notifications().length)addNotification("Bienvenido a M.A.R.C.","Aquí aparecerán recordatorios, publicidad pendiente, cobros y tareas importantes.");
  });
})();

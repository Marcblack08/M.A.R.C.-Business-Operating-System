/* M.A.R.C. GRAPHIC LAB — interaction layer
   Visual/navigation polish only. Business logic remains in app.js.
*/
(()=>{ 
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const reduce=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const progress=document.createElement("div");
  progress.className="view-progress";
  progress.innerHTML="<i></i>";
  document.body.appendChild(progress);

  let progressTimer=null;
  const startProgress=()=>{
    clearTimeout(progressTimer);
    progress.classList.add("on");
    const bar=$("i",progress);
    if(bar)bar.style.width="12%";
    requestAnimationFrame(()=>{
      if(bar)bar.style.width="64%";
    });
    progressTimer=setTimeout(()=>finishProgress(),6500);
  };
  const finishProgress=()=>{
    clearTimeout(progressTimer);
    const bar=$("i",progress);
    if(bar)bar.style.width="100%";
    progress.classList.remove("on");
  };

  const closeOverlays=()=>{
    $("#sidebar")?.classList.remove("open");
    const modal=$("#modal");
    if(modal?.childElementCount) document.body.classList.remove("modal-open");
  };

  /* app.js previously attached both direct and delegated nav handlers.
     Remove the direct handlers after wire() has initialized them so each
     navigation click resolves once through the delegated handler. */
  const normalizeNavHandlers=()=>{
    $$(".sidebar nav button[data-view],#mobileNav button[data-view]").forEach(b=>{
      b.onclick=null;
      b.type="button";
    });
  };
  setTimeout(normalizeNavHandlers,0);
  setTimeout(normalizeNavHandlers,120);

  /* Navigation feedback without touching view() itself. */
  document.addEventListener("pointerdown",e=>{
    const nav=e.target.closest?.(".sidebar nav button[data-view],#mobileNav button[data-view]");
    if(!nav)return;
    startProgress();
  },{passive:true});

  const content=$("#content");
  if(content){
    const observer=new MutationObserver(()=>{
      finishProgress();
      content.classList.remove("view-refresh");
      void content.offsetWidth;
      content.classList.add("view-refresh");
      window.setTimeout(()=>content.classList.remove("view-refresh"),420);
      normalizeNavHandlers();
    });
    observer.observe(content,{childList:true});
  }

  /* Escape closes transient navigation surfaces. */
  document.addEventListener("keydown",e=>{
    if(e.key!=="Escape")return;
    $("#sidebar")?.classList.remove("open");
    const chat=$("#chat");
    if(chat?.classList.contains("open"))chat.classList.remove("open");
    const modal=$("#modal");
    if(modal?.childElementCount){
      const close=modal.querySelector(".close");
      if(close)close.click();
    }
  });

  /* Add subtle pointer feedback to interactive controls. */
  const rippleTargets="button.primary,button.secondary,button.ask,.theme-toggle,.notification-bell,.sidebar nav button,.mobile-bottom-nav button,.quick-modern-grid button,.hero-secondary,.hero-primary,.cash-action,.ad-source-tab,.ad-objective";
  document.addEventListener("pointerdown",e=>{
    const b=e.target.closest?.(rippleTargets);
    if(!b||b.disabled||reduce)return;
    const rect=b.getBoundingClientRect();
    const size=Math.max(rect.width,rect.height)*1.15;
    const x=e.clientX-rect.left-size/2;
    const y=e.clientY-rect.top-size/2;
    const r=document.createElement("span");
    r.className="marc-ripple";
    r.style.width=r.style.height=size+"px";
    r.style.left=x+"px";
    r.style.top=y+"px";
    b.appendChild(r);
    setTimeout(()=>r.remove(),520);
  },{passive:true});

  /* Sidebar gets a proper app-like scrim/scroll lock. */
  const sidebar=$("#sidebar"),scrim=$("#mobileScrim");
  const syncSidebar=()=>{
    const open=sidebar?.classList.contains("open");
    if(open){
      document.body.classList.add("sidebar-open");
      scrim?.setAttribute("aria-hidden","false");
    }else{
      document.body.classList.remove("sidebar-open");
      scrim?.setAttribute("aria-hidden","true");
    }
  };
  if(sidebar){
    new MutationObserver(syncSidebar).observe(sidebar,{attributes:true,attributeFilter:["class"]});
    syncSidebar();
  }
  scrim?.addEventListener("click",()=>{sidebar?.classList.remove("open");syncSidebar();});

  /* Mark long operations and disabled controls consistently. */
  document.addEventListener("click",e=>{
    const b=e.target.closest?.("button");
    if(!b||b.disabled)return;
    if(/^(Guardar|Descargar|Generar|Crear|Conectar|Desconectar|Cerrar caja|Abrir caja|Continuar)/i.test((b.textContent||"").trim())){
      b.classList.add("action-touched");
      setTimeout(()=>b.classList.remove("action-touched"),550);
    }
  },{passive:true});

  window.addEventListener("beforeunload",()=>finishProgress());
})();

/* M.A.R.C. GRAPHIC LAB — chat polish */
(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const chat=$("#chat"), messages=$("#messages");
  if(!chat||!messages)return;

  const observe=new MutationObserver(()=>{
    messages.querySelectorAll(".bubble.a").forEach(b=>{
      if(b.dataset.marcEnhanced)return;
      b.dataset.marcEnhanced="1";
      if(b.textContent.trim()==="Pensando…"){
        b.classList.add("typing");
        b.innerHTML="<i></i><i></i><i></i>";
      }
    });
    messages.scrollTop=messages.scrollHeight;
  });
  observe.observe(messages,{childList:true,subtree:true});

  const top=$("#app .top");
  const content=$("#content");
  const syncScroll=()=>{
    const scrolled=(window.scrollY||content?.scrollTop||0)>8;
    top?.classList.toggle("scrolled",scrolled);
  };
  window.addEventListener("scroll",syncScroll,{passive:true});
  content?.addEventListener("scroll",syncScroll,{passive:true});
  syncScroll();
})();

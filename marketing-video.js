(()=>{"use strict";
const MODEL_PRICES={
  "veo-3.1-lite-generate-preview":0.05,
  "veo-3.1-fast-generate-preview":0.10,
  "veo-3.1-generate-preview":0.40
};
const MODEL_LABELS={
  "veo-3.1-lite-generate-preview":"Veo 3.1 Lite",
  "veo-3.1-fast-generate-preview":"Veo 3.1 Fast",
  "veo-3.1-generate-preview":"Veo 3.1 Standard"
};
let injected=false,pollTimer=null,currentOperation="";
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const getClient=()=>{const C=window.MARC_CONFIG;if(!C?.supabaseUrl||!C?.supabasePublishableKey)return null;return window.supabase.createClient(C.supabaseUrl,C.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true}})};
const getSession=async()=>{const s=getClient();if(!s)throw new Error("No se pudo inicializar la sesión.");const r=await s.auth.getSession();if(r.error||!r.data?.session)throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");return r.data.session};
const selectedProduct=()=>{const sel=document.getElementById("adProduct");if(!sel)return{};return{name:sel.options[sel.selectedIndex]?.textContent?.trim()||"Producto"}};
const fileToDataUrl=file=>new Promise((resolve,reject)=>{if(!file)return resolve("");const r=new FileReader();r.onload=()=>resolve(String(r.result||""));r.onerror=reject;r.readAsDataURL(file)});
function inject(){
  if(injected||!document.querySelector(".marketing-form-card"))return;
  const anchor=document.querySelector(".marketing-generate-actions");if(!anchor)return;
  injected=true;
  const box=document.createElement("section");box.className="marketing-video-card";box.innerHTML=
    '<div class="marketing-video-head"><div><span>🎬</span><div><b>Crear video publicitario con IA</b><small>Veo genera un video de 8 segundos con audio. Puedes usar la foto del producto como referencia.</small></div></div><span class="marketing-video-paid">FUNCIÓN DE PAGO</span></div>'+
    '<div class="marketing-video-grid">'+
      '<label>Modelo<select id="marketingVideoModel"><option value="veo-3.1-lite-generate-preview">Veo 3.1 Lite · menor costo</option><option value="veo-3.1-fast-generate-preview">Veo 3.1 Fast · más rápido</option><option value="veo-3.1-generate-preview">Veo 3.1 Standard · mayor costo</option></select></label>'+
      '<label>Formato<select id="marketingVideoFormat"><option value="1080x1920">Vertical · 9:16</option><option value="1080x1350">Vertical adaptado · 9:16</option><option value="1080x1080">Horizontal · 16:9</option></select></label>'+
    '</div>'+
    '<div class="marketing-video-price"><div><b id="marketingVideoEstimate">Costo estimado: US$ 0.40</b><small>8 segundos · 720p · el precio real lo determina el uso facturado por Google.</small></div><label><input id="marketingVideoConfirm" type="checkbox"> Confirmo que quiero iniciar una generación de video de pago.</label></div>'+
    '<label class="marketing-video-brief">Instrucción para el video<textarea id="marketingVideoBrief" rows="4" placeholder="Ej.: mostrar el producto con movimiento de cámara suave, iluminación profesional y una escena moderna para venderlo por WhatsApp."></textarea></label>'+
    '<div id="marketingVideoStatus" class="msg"></div>'+
    '<div class="marketing-video-actions"><button type="button" class="primary" id="marketingVideoGenerate" disabled>🎬 Generar video de 8 s</button><button type="button" class="secondary" id="marketingVideoCancel" disabled>Cancelar espera</button></div>'+
    '<div id="marketingVideoResult" class="marketing-video-result hidden"></div>';
  anchor.insertAdjacentElement("afterend",box);
  const model=document.getElementById("marketingVideoModel"),confirmBox=document.getElementById("marketingVideoConfirm"),estimate=document.getElementById("marketingVideoEstimate"),generate=document.getElementById("marketingVideoGenerate"),cancel=document.getElementById("marketingVideoCancel"),status=document.getElementById("marketingVideoStatus"),result=document.getElementById("marketingVideoResult");
  const updateEstimate=()=>{const price=(MODEL_PRICES[model.value]||0.05)*8;estimate.textContent="Costo estimado: US$ "+price.toFixed(2);generate.disabled=!confirmBox.checked||Boolean(pollTimer)};
  model.onchange=updateEstimate;confirmBox.onchange=updateEstimate;
  cancel.onclick=()=>{if(pollTimer){clearTimeout(pollTimer);pollTimer=null}status.className="msg";status.textContent="Espera cancelada en este dispositivo. La operación de Google podría seguir procesándose.";cancel.disabled=true;generate.disabled=!confirmBox.checked};
  generate.onclick=async()=>{
    generate.disabled=true;cancel.disabled=false;result.classList.add("hidden");status.className="msg";status.textContent="Iniciando generación de video…";
    try{
      const session=await getSession();
      const product=selectedProduct();
      const brief=document.getElementById("marketingVideoBrief").value.trim()||document.getElementById("adDetails")?.value.trim()||"Crear una publicidad profesional del producto.";
      const file=document.getElementById("adImageCamera")?.files?.[0]||document.getElementById("adImage")?.files?.[0]||null;
      const imageData=await fileToDataUrl(file);
      const r=await fetch("/api/marketing-video-start",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},body:JSON.stringify({
        product,campaign:{headline:document.getElementById("adDetails")?.value.trim()||product.name},details:brief,platform:document.getElementById("adPlatform")?.value||"INSTAGRAM",objective:document.getElementById("adObjective")?.value||"VENDER",tone:document.getElementById("adTone")?.value||"PROFESIONAL",format:document.getElementById("marketingVideoFormat").value,model:model.value,imageData
      })});
      const j=await r.json();if(!r.ok)throw new Error(j.message||j.error||"No se pudo iniciar el video.");
      currentOperation=j.operationName;localStorage.setItem("marc_marketing_video_operation",currentOperation);
      status.textContent="Video en generación. M.A.R.C. revisará el estado cada 10 segundos…";
      const poll=async()=>{
        try{
          const s=await getSession();
          const sr=await fetch("/api/marketing-video-status",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+s.access_token},body:JSON.stringify({operationName:currentOperation})});
          const sj=await sr.json();if(!sr.ok)throw new Error(sj.message||sj.error||"No se pudo consultar el estado.");
          if(sj.status==="PROCESSING"){status.textContent="Veo está generando el video… esto puede tardar un poco.";pollTimer=setTimeout(poll,10000);return}
          pollTimer=null;cancel.disabled=true;
          if(sj.status!=="READY")throw new Error(sj.error||"La generación de video no terminó correctamente.");
          status.className="msg ok";status.textContent="Video listo. Puedes verlo y guardarlo en tu teléfono.";
          const video=document.createElement("video");video.controls=true;video.playsInline=true;video.preload="metadata";video.className="marketing-video-player";
          result.innerHTML="";result.appendChild(video);result.classList.remove("hidden");
          const dl=document.createElement("a");dl.className="primary marketing-video-download";dl.href=sj.downloadUrl;dl.textContent="↓ Guardar video MP4";dl.download="MARC_Publicidad_Video.mp4";result.appendChild(dl);
          video.src=sj.downloadUrl;
          localStorage.removeItem("marc_marketing_video_operation");
          generate.disabled=!confirmBox.checked;
        }catch(e){pollTimer=null;cancel.disabled=true;status.className="msg error";status.textContent=e.message||"No se pudo completar el video.";generate.disabled=!confirmBox.checked}
      };
      await poll();
    }catch(e){pollTimer=null;cancel.disabled=true;status.className="msg error";status.textContent=e.message||"No se pudo iniciar el video.";generate.disabled=!confirmBox.checked}
  };
  updateEstimate();
}
const observer=new MutationObserver(inject);observer.observe(document.body,{childList:true,subtree:true});inject();
})();
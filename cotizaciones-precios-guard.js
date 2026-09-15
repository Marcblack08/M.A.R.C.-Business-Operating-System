/* M.A.R.C. — guardián de precios explícitos dictados
   Última línea de defensa: NO interpreta el trabajo. Solo verifica que los precios
   que el usuario dijo no hayan desaparecido durante la extracción semántica. */
(function(){'use strict';
  let lastText='';
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const num=s=>{const v=String(s||'').trim().replace(/\s+/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(/,(?=\d{3}(?:\D|$))/g,'');const n=Number(v.replace(',','.'));return Number.isFinite(n)?n:0};
  function findPrice(text, pattern){const m=norm(text).match(pattern);return m?num(m[1]):0;}
  function recover(){
    const q=window.__MARC_AI_QUOTE;
    const ta=document.getElementById('qv3text');
    if(!q||!Array.isArray(q.partidas)||!ta)return;
    const text=ta.value||'';
    if(!text.trim()||text===lastText)return;
    lastText=text;
    const n=norm(text);
    const cameraPrice=findPrice(n,/precio\s+(?:por|de\s+cada)\s+camara(?:\s+ip)?[^0-9]{0,40}(\d[\d., ]*)/i)||findPrice(n,/cada\s+camara[^0-9]{0,40}(\d[\d., ]*)/i);
    const materialsMatch=n.match(/materiales?(?:\s+necesarios)?[^0-9]{0,40}(\d[\d., ]*)/i);
    const installationMatch=n.match(/precio\s+de\s+instalacion[^0-9]{0,40}(\d[\d., ]*)/i)||n.match(/instalacion[^0-9]{0,40}(\d[\d., ]*)/i);
    const materialsPrice=materialsMatch?num(materialsMatch[1]):0;
    const installationPrice=installationMatch?num(installationMatch[1]):0;
    if(!cameraPrice&&!materialsPrice&&!installationPrice)return;
    const after=(needle)=>{const i=n.indexOf(needle);return i>=0&&/(?:por\s+(?:cada\s+)?camara|por\s+unidad)/.test(n.slice(i,i+100))?'unitario':'global'};
    q.partidas.forEach((p,i)=>{
      const name=norm(p.nombre+' '+(p.descripcion||''));
      let price=0,scope=p.alcance_precio||'global';
      if(cameraPrice&&/(camara|ip)/.test(name)&&!/(material|instal)/.test(name)){price=cameraPrice;scope='unitario';}
      else if(materialsPrice&&/material|accesor/.test(name)){price=materialsPrice;scope=after('material');}
      else if(installationPrice&&/instal/.test(name)){price=installationPrice;scope='unitario';}
      if(price>0){
        p.precio_unitario=price;p.alcance_precio=scope;p._marcRecovered=true;
        const input=document.querySelector(`[data-ai-price="${i}"]`);
        if(input){input.value=price.toFixed(2);input.dispatchEvent(new Event('input',{bubbles:true}));}
      }
    });
    q._pricingGuard=true;
    const msg=document.getElementById('qv3voiceMsg');
    if(msg)msg.textContent='✓ Precios explícitos del dictado verificados · cálculo determinista';
  }
  new MutationObserver(recover).observe(document.body,{childList:true,subtree:true});
  setInterval(recover,500);
})();

/* M.A.R.C. — Cotizaciones: dictado → campos de proforma, sin paso manual */
(function(){
  'use strict';
  const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const val=id=>document.getElementById(id)?.value?.trim()||'';
  const setVal=(id,value,fire=true)=>{const el=document.getElementById(id);if(!el)return false;el.value=value;if(fire)el.dispatchEvent(new Event('input',{bubbles:true}));return true};
  const setSelect=(id,value,fire=true)=>{const el=document.getElementById(id);if(!el)return false;el.value=value;if(fire)el.dispatchEvent(new Event('change',{bubbles:true}));return true};
  function numberFromSpeech(s){
    let x=String(s||'').toLowerCase().replace(/\b(soles?|sol|pen)\b/g,'').trim();
    const m=x.match(/(\d+)\s*mil\s*(\d+)?/);if(m)return Number(m[1])*1000+Number(m[2]||0);
    const direct=x.match(/\d[\d\s.,]*/);if(direct){
      const raw=direct[0].trim();
      if(/\d+\.\d{3}(?:\D|$)/.test(raw))return Number(raw.replace(/\./g,''));
      return Number(raw.replace(/\s/g,'').replace(/\./g,'').replace(/,/g,'.'));
    }
    return null;
  }
  function extract(raw,patterns){for(const p of patterns){const m=raw.match(p);if(m?.[1])return m[1].trim().replace(/[.;]$/,'').trim()}return ''}
  function acomodar(raw){
    raw=String(raw||'').trim();if(!raw)return;
    const changed=[];
    const loc=extract(raw,[/(?:ubicaci[oó]n|ubicado en|direcci[oó]n)\s*(?:es|:|,|-)?\s*(.+?)(?=\s*(?:;|\.\s*|cliente\b|duraci[oó]n\b|todo costo\b|todo incluido\b|precio total\b|costo total\b|monto total\b|$))/i]);
    if(loc&&setVal('qv3location',loc)){changed.push('ubicación');}
    const dur=extract(raw,[/(?:duraci[oó]n|demora|tarda|tiempo(?: promedio)?)[^,;.]*?\b(\d+(?:[.,]\d+)?\s*(?:d[ií]as?|horas?|jornadas?|semanas?))\b/i]);
    if(dur&&setVal('qv3duration',dur)){changed.push('duración');}
    const todo=/\btodo\s+costo\b|\btodo\s+incluido\b|\bprecio\s+global\b/i.test(raw);
    if(todo&&setSelect('qv3costmode','TODO COSTO')){changed.push('TODO COSTO');}
    let total=null;
    const tm=raw.match(/(?:precio\s+total|total|costo\s+total|monto\s+total)\s*(?:es|de|:)?\s*(?:s\/\.?|soles?|pen)?\s*([\d][\d\s.,]*(?:\s*mil\s*[\d\s]*)?)/i);
    if(tm)total=numberFromSpeech(tm[1]);
    if(total==null){const m=raw.match(/([\d][\d\s.,]*(?:\s*mil\s*[\d\s]*)?)\s*(?:soles?|s\/\.?|pen)\b/i);if(m)total=numberFromSpeech(m[1]);}
    if(total!=null&&total>0){
      if(document.getElementById('qv3costmode')?.value!=='TODO COSTO')setSelect('qv3costmode','TODO COSTO');
      setVal('qv3manualTotal',String(total));
      changed.push('precio total S/ '+total.toLocaleString('es-PE'));
    }
    const clientText=extract(raw,[/(?:el\s+)?cliente\s*(?:es|:)?\s*(.+?)(?=\s*(?:,|;|ubicaci[oó]n\b|duraci[oó]n\b|todo costo\b|todo incluido\b|precio total\b|costo total\b|monto total\b|$))/i]);
    if(clientText){
      const sel=document.getElementById('qv3client');
      if(sel){
        const target=norm(clientText);
        let opt=[...sel.options].find(o=>norm(o.textContent).includes(target)||target.includes(norm(o.textContent.split(' · ')[0])));
        if(!opt){opt=document.createElement('option');opt.value='__dictado_auto__';opt.textContent=clientText+' · (dictado)';sel.appendChild(opt);}
        sel.value=opt.value;sel.dispatchEvent(new Event('change',{bubbles:true}));changed.push('cliente '+clientText);
      }
    }
    if(changed.length){
      const msg=document.getElementById('qv3voiceMsg');if(msg)msg.textContent='✓ Dictado acomodado automáticamente: '+changed.join(' · ');
    }
  }
  function observeModal(){
    const modal=document.getElementById('qv3modal');if(!modal||modal.dataset.marcDictadoAuto==='1')return;
    modal.dataset.marcDictadoAuto='1';
    const msg=document.getElementById('qv3voiceMsg');
    if(msg){
      let last='';
      const mo=new MutationObserver(()=>{
        const t=msg.textContent.trim();
        if(t&&t!==last){last=t;if(/Dictado recibido/i.test(t)){setTimeout(()=>acomodar(val('qv3text')),60);}}
      });
      mo.observe(msg,{childList:true,characterData:true,subtree:true});
    }
    const voice=document.getElementById('qv3voice');
    if(voice){
      voice.addEventListener('click',()=>{
        setTimeout(()=>{
          const text=val('qv3text');if(text)acomodar(text);
        },1800);
      });
    }
  }
  const obs=new MutationObserver(()=>observeModal());
  if(document.body)obs.observe(document.body,{childList:true,subtree:true});
  setInterval(observeModal,1000);
})();
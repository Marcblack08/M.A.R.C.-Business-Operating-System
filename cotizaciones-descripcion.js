/* M.A.R.C. — descripción del trabajo para cotizaciones IA */
(function(){'use strict';
  let savePatch=false;
  function installUI(){
    const modal=document.getElementById('qv3modal');
    if(!modal)return;
    if(!modal.querySelector('#qv3description')){
      const quick=modal.querySelector('.qv3quick');
      if(quick){
        const sec=document.createElement('section');
        sec.className='qv3description';
        sec.innerHTML='<label style="display:block;margin-top:12px"><b>Descripción del trabajo</b><textarea id="qv3description" rows="6" placeholder="Describe qué se va a hacer, dónde, cómo y cuál es el objetivo del trabajo."></textarea><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button type="button" class="btn btn-secondary" id="qv3descVoice">🎙 Dictar descripción</button><button type="button" class="btn btn-secondary" id="qv3descImprove">✨ Mejorar con IA</button><small id="qv3descMsg" style="align-self:center;color:#64748b">Puedes escribirla, dictarla y luego pedir a la IA que la haga más profesional.</small></div></label>';
        quick.insertAdjacentElement('afterend',sec);
        const ta=sec.querySelector('#qv3description');
        ta.value=window.__MARC_QUOTE_DESCRIPTION||'';
        ta.oninput=()=>{window.__MARC_QUOTE_DESCRIPTION=ta.value;ta.dataset.marcUserEdited='1'};
        sec.querySelector('#qv3descVoice').onclick=()=>dictateDescription(ta,sec.querySelector('#qv3descMsg'));
        sec.querySelector('#qv3descImprove').onclick=()=>improveDescription(ta,sec.querySelector('#qv3descMsg'));
      }
    }
    const ta=modal.querySelector('#qv3description');
    const q=window.__MARC_AI_QUOTE;
    if(ta&&q?.descripcion_trabajo&&!ta.dataset.marcUserEdited){
      if(!ta.value.trim()||ta.dataset.marcLastAuto!==q.descripcion_trabajo){ta.value=q.descripcion_trabajo;ta.dataset.marcLastAuto=q.descripcion_trabajo;window.__MARC_QUOTE_DESCRIPTION=q.descripcion_trabajo}
    }
    if(ta&&!ta.dataset.marcBound){ta.dataset.marcBound='1';ta.addEventListener('input',()=>{ta.dataset.marcUserEdited='1';window.__MARC_QUOTE_DESCRIPTION=ta.value})}
  }
  function dictateDescription(ta,msg){
    const R=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!R){if(msg)msg.textContent='Este navegador no permite dictado de voz directo para la descripción.';return}
    const r=new R();r.lang='es-PE';r.continuous=true;r.interimResults=false;
    if(msg)msg.textContent='🎙 Escuchando la descripción… pulsa el botón otra vez para terminar.';
    r.onresult=e=>{let t='';for(let i=0;i<e.results.length;i++)t+=e.results[i][0].transcript+' ';ta.value=(ta.value.trim()?ta.value.trim()+' ':'')+t.trim();window.__MARC_QUOTE_DESCRIPTION=ta.value;ta.dataset.marcUserEdited='1'};
    r.onend=()=>{if(msg)msg.textContent='✓ Descripción transcrita. Puedes editarla antes de guardar.'};
    r.onerror=()=>{if(msg)msg.textContent='No se pudo reconocer el dictado.'};
    window.__MARC_DESC_REC=r;r.start();
    const btn=document.getElementById('qv3descVoice');if(btn)btn.onclick=()=>{if(window.__MARC_DESC_REC?.state==='recording'){window.__MARC_DESC_REC.stop();return}dictateDescription(ta,msg)};
  }
  async function improveDescription(ta,msg){
    const raw=String(ta.value||'').trim();
    if(!raw){if(msg)msg.textContent='⚠ Escribe o dicta primero una descripción.';return}
    const btn=document.getElementById('qv3descImprove');if(btn)btn.disabled=true;
    if(msg)msg.textContent='🧠 Mejorando la redacción…';
    try{
      const q=window.__MARC_AI_QUOTE||{};
      const context={ubicacion:q.ubicacion||'',duracion:q.duracion||'',partidas:(q.partidas||[]).map(p=>({nombre:p.nombre,cantidad:p.cantidad,unidad:p.unidad,descripcion:p.descripcion}))};
      const r=await fetch('/api/improve-quote-description',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({description:raw,context:JSON.stringify(context)})});
      const j=await r.json();if(!r.ok||!j.descripcion)throw Error(j.error||'No se pudo mejorar la descripción');
      ta.value=j.descripcion;window.__MARC_QUOTE_DESCRIPTION=j.descripcion;ta.dataset.marcUserEdited='1';
      if(msg)msg.textContent=`✓ Descripción mejorada · ${j.modelo||'Gemini'}. Puedes editarla nuevamente antes de guardar.`;
    }catch(e){if(msg)msg.textContent='⚠ '+e.message}
    finally{if(btn)btn.disabled=false}
  }
  function patchSave(){
    const sb=window.supabaseClient;if(!sb||savePatch)return;
    const original=sb.from.bind(sb);
    sb.from=function(table){
      const builder=original(table);
      if(table!=='cotizaciones')return builder;
      const ins=builder.insert.bind(builder);
      builder.insert=function(payload){
        const description=String(window.__MARC_QUOTE_DESCRIPTION||document.querySelector('#qv3description')?.value||'').trim();
        if(!description)return ins(payload);
        const apply=row=>({...row,observaciones:description});
        return ins(Array.isArray(payload)?payload.map(apply):apply(payload));
      };
      return builder;
    };
    savePatch=true;
  }
  function tick(){installUI();patchSave()}
  new MutationObserver(tick).observe(document.body,{childList:true,subtree:true});
  setInterval(tick,700);setTimeout(tick,300);
})();

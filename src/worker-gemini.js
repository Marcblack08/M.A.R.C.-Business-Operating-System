export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/analyze-catalog-page') {
      if (env.ASSETS && typeof env.ASSETS.fetch === 'function') return env.ASSETS.fetch(request);
      return new Response('M.A.R.C. Worker OK', { status: 200 });
    }
    if (request.method !== 'POST') return Response.json({ error: 'Método no permitido' }, { status: 405 });
    try {
      const body = await request.json();
      const image = String(body?.image || '');
      const tipo = String(body?.tipo || 'PROVEEDOR');
      const pagina = Number(body?.pagina || 0);
      const ocr = String(body?.ocr_text || '');
      const filas = Array.isArray(body?.filas_tabla) ? body.filas_tabla : [];
      if (!image) return Response.json({ error: 'Falta la imagen de la página' }, { status: 400 });
      const re = /\b(?:AD|PRO)-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/ig;
      const fromOcr = String(ocr.match(re) || []).map(x => x.toUpperCase());
      const fromRows = filas.map(x => String(x?.codigo || '').trim().toUpperCase());
      const allowed = [...new Set([...fromRows, ...fromOcr].filter(x => /^(AD|PRO)-[A-Z0-9-]+$/.test(x)))];
      const restriction = allowed.length
        ? `CÓDIGOS DETECTADOS POR TEXTO/OCR: ${allowed.join(', ')}. Debes revisar la imagen y devolver CADA UNO de esos códigos si realmente aparece como producto. También devuelve otros códigos AD-/PRO- claramente visibles.`
        : 'No hay códigos detectados por texto. Lee directamente de la imagen todos los códigos comerciales AD-/PRO- claramente visibles.';
      const prompt = `Eres el lector visual de un catálogo comercial. Analiza TODA la página de borde a borde, incluyendo tablas completas y todas las tarjetas. La imagen es la fuente principal; el OCR solo es apoyo. ${restriction}

REGLAS CRÍTICAS:
- No detengas la lectura después de encontrar uno o dos productos.
- Cuenta mentalmente todas las filas/tarjetas/modelos visibles antes de responder.
- Cada fila o tarjeta comercial con código propio es un producto o variante.
- Si una tabla tiene 7 modelos, devuelve los 7.
- NO conviertas capacidades, colores, conectores, voltajes, medidas, instrucciones, encabezados o precios aislados en productos.
- El nombre debe ser el nombre comercial, no una especificación.
- Conserva exactamente el código visible.
- Asocia cada precio con su propia fila/tarjeta por posición visual.
- Si un producto existe pero no tiene precio visible, devuélvelo con precio_fuente 0.
- No inventes nombres, códigos ni precios.
- Si dos filas comparten código pero son variantes distintas, devuélvelas separadas y usa variante para diferenciarlas.
- Si el OCR menciona un código pero la imagen no permite confirmarlo, NO inventes un producto; puedes devolverlo solo si es claramente visible.
- Devuelve SOLO JSON con {\"items\":[...]}.
Tipo: ${tipo}. Página: ${pagina}.
OCR auxiliar: ${ocr.slice(0,14000)}`;
      const schema = {type:'object',properties:{items:{type:'array',items:{type:'object',properties:{codigo:{type:'string'},nombre:{type:'string'},marca:{type:'string'},modelo:{type:'string'},categoria:{type:'string'},descripcion:{type:'string'},precio_fuente:{type:'number'},unidad:{type:'string'},unidad_precio:{type:'string'},cantidad_paquete:{type:'number'},presentacion:{type:'string'},variante:{type:'string'}},required:['codigo','nombre','marca','modelo','categoria','descripcion','precio_fuente','unidad','unidad_precio','cantidad_paquete','presentacion','variante']}}},required:['items']};
      const normalize = j => Array.isArray(j?.items) ? j.items.map(x => ({codigo:String(x?.codigo||'').trim().toUpperCase(),nombre:String(x?.nombre||'').trim(),marca:String(x?.marca||'').trim(),modelo:String(x?.modelo||'').trim(),categoria:String(x?.categoria||'').trim(),descripcion:String(x?.descripcion||'').trim(),precio_fuente:Number(x?.precio_fuente||0),unidad:String(x?.unidad||'UND').trim(),unidad_precio:String(x?.unidad_precio||'').trim(),cantidad_paquete:Number(x?.cantidad_paquete||1),presentacion:String(x?.presentacion||'').trim(),variante:String(x?.variante||'').trim()})) : [];
      const cleanItems = items => {const seen=new Set();return items.filter(x=>{if(!/^(AD|PRO)-[A-Z0-9-]+$/.test(x.codigo)||!x.nombre)return false;const k=x.codigo+'|'+x.nombre.toUpperCase()+'|'+x.variante.toUpperCase();if(seen.has(k))return false;seen.add(k);return true})};
      const providers=[];
      if(env.GEMINI_API_KEY) providers.push(async()=>{const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key='+encodeURIComponent(env.GEMINI_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inline_data:{mime_type:'image/jpeg',data:image.split(',').pop()}}]}],generationConfig:{responseMimeType:'application/json',responseSchema:schema,maxOutputTokens:8000}})});const j=await r.json();if(!r.ok)throw new Error(j?.error?.message||'Gemini no disponible');return cleanItems(normalize(JSON.parse(j?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'{}')))});
      if(env.OPENROUTER_API_KEY) providers.push(async()=>{const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.OPENROUTER_API_KEY},body:JSON.stringify({model:'openrouter/free',messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:image}}]}],response_format:{type:'json_object'},max_tokens:8000})});const j=await r.json();if(!r.ok)throw new Error(j?.error?.message||'OpenRouter no disponible');return cleanItems(normalize(JSON.parse(j?.choices?.[0]?.message?.content||'{}')))});
      if(env.AI) providers.push(async()=>{const r=await env.AI.run('@cf/google/gemma-4-26b-a4b-it',{prompt,image:image.split(',').pop()});return cleanItems(normalize(typeof r==='string'?JSON.parse(r):r))});
      let lastError=null;for(const provider of providers){try{const items=await provider();if(items.length)return Response.json({items,pagina,tipo,fuente:'IA visual exhaustiva'});}catch(e){lastError=e}}
      return Response.json({items:[],error:lastError?.message||'Ningún motor visual devolvió productos válidos'},{status:503});
    } catch(e) { return Response.json({error:String(e?.message||e)},{status:500}); }
  }
};

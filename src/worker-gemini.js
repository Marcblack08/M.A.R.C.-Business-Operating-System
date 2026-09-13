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
      const allowed = Array.isArray(body?.codigos_permitidos) ? body.codigos_permitidos.map(x => String(x).trim().toUpperCase()).filter(x => /^(AD|PRO)-[A-Z0-9-]+$/.test(x)) : [];
      if (!image) return Response.json({ error: 'Falta la imagen de la página' }, { status: 400 });
      const prompt = `Analiza esta página de catálogo comercial como fuente primaria visual. Devuelve SOLO JSON válido con {"items":[...]}. IMPORTANTE: solo puedes devolver productos cuyo código aparezca en la lista CODIGOS_PERMITIDOS. No inventes códigos ni productos. Un código representa un producto; no lo repitas varias veces. Lee exactamente el nombre comercial que aparece junto al código, no una especificación, color, capacidad, precio, encabezado o instrucción. Relaciona cada precio con su producto usando la posición visual de la página y la columna PRECIO. No uses un precio de otro producto. La imagen es la fuente principal y el OCR es auxiliar. Si un nombre, precio o campo no se puede leer con seguridad, déjalo vacío/0. Tipo de catálogo: ${tipo}. Página: ${pagina}. CODIGOS_PERMITIDOS: ${allowed.join(', ')}. OCR auxiliar: ${ocr.slice(0, 16000)}`;
      const schema = {type:'object',properties:{items:{type:'array',items:{type:'object',properties:{codigo:{type:'string'},nombre:{type:'string'},marca:{type:'string'},modelo:{type:'string'},categoria:{type:'string'},descripcion:{type:'string'},precio_fuente:{type:'number'},unidad:{type:'string'},unidad_precio:{type:'string'},cantidad_paquete:{type:'number'},presentacion:{type:'string'},variante:{type:'string'}},required:['codigo','nombre','marca','modelo','categoria','descripcion','precio_fuente','unidad','unidad_precio','cantidad_paquete','presentacion','variante']}}},required:['items']};
      const normalize = j => Array.isArray(j?.items) ? j.items.map(x => ({codigo:String(x?.codigo||'').trim().toUpperCase(),nombre:String(x?.nombre||'').trim(),marca:String(x?.marca||'').trim(),modelo:String(x?.modelo||'').trim(),categoria:String(x?.categoria||'').trim(),descripcion:String(x?.descripcion||'').trim(),precio_fuente:Number(x?.precio_fuente||0),unidad:String(x?.unidad||'UND').trim(),unidad_precio:String(x?.unidad_precio||'').trim(),cantidad_paquete:Number(x?.cantidad_paquete||1),presentacion:String(x?.presentacion||'').trim(),variante:String(x?.variante||'').trim()})) : [];
      const cleanItems = items => {const seen=new Set();return items.filter(x=>{if(!allowed.includes(x.codigo)||seen.has(x.codigo)||!x.nombre||x.precio_fuente<=0)return false;seen.add(x.codigo);return true})};
      const providers=[];
      if(env.GEMINI_API_KEY) providers.push(async()=>{const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key='+encodeURIComponent(env.GEMINI_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inline_data:{mime_type:'image/jpeg',data:image.split(',').pop()}}]}],generationConfig:{responseMimeType:'application/json',responseSchema:schema,maxOutputTokens:2200}})});const j=await r.json();if(!r.ok)throw new Error(j?.error?.message||'Gemini no disponible');return cleanItems(normalize(JSON.parse(j?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'{}')))});
      if(env.OPENROUTER_API_KEY) providers.push(async()=>{const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.OPENROUTER_API_KEY},body:JSON.stringify({model:'openrouter/free',messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:image}}]}],response_format:{type:'json_object'},max_tokens:2200})});const j=await r.json();if(!r.ok)throw new Error(j?.error?.message||'OpenRouter no disponible');return cleanItems(normalize(JSON.parse(j?.choices?.[0]?.message?.content||'{}')))});
      if(env.AI) providers.push(async()=>{const r=await env.AI.run('@cf/google/gemma-4-26b-a4b-it',{prompt,image:image.split(',').pop()});return cleanItems(normalize(typeof r==='string'?JSON.parse(r):r))});
      let lastError=null;for(const provider of providers){try{const items=await provider();if(items.length)return Response.json({items,pagina,tipo,fuente:'IA visual + OCR controlado'});}catch(e){lastError=e}}
      return Response.json({items:[],error:lastError?.message||'Ningún motor de IA devolvió productos válidos'},{status:503});
    } catch(e) { return Response.json({error:String(e?.message||e)},{status:500}); }
  }
};

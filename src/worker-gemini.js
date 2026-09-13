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
      const allowed = [...new Set(filas.map(x => String(x?.codigo || '').trim().toUpperCase()).filter(x => /^(AD|PRO)-[A-Z0-9-]+$/.test(x)))];
      const restriction = allowed.length ? `CÓDIGOS YA DETECTADOS POR EL PDF: ${allowed.join(', ')}. Puedes devolver esos códigos y, si ves claramente otros códigos comerciales AD-/PRO- en la imagen, también puedes devolverlos.` : 'No hay códigos detectados por texto. Lee directamente de la imagen todos los códigos comerciales AD-/PRO- que sean claramente visibles.';
      const prompt = `Eres el lector visual de un catálogo comercial. Analiza TODA la página, no solo una parte. La imagen es la fuente principal; el OCR solo es apoyo. ${restriction}

Reglas estrictas:
- Cada fila, tarjeta o modelo comercial visible es un producto/variante.
- NO conviertas capacidades, colores, conectores, voltajes, medidas, instrucciones, encabezados o precios en productos.
- El nombre debe ser el nombre comercial del producto, no una especificación.
- Conserva el código exacto visible.
- Relaciona cada precio con su propia fila/tarjeta mediante su posición visual.
- Si un producto existe pero no tiene precio visible, DEVUÉLVELO igualmente con precio_fuente 0; no lo descartes.
- No inventes nombres, códigos ni precios.
- Si dos filas comparten código pero son variantes distintas, devuélvelas como variantes separadas y usa variante para diferenciarlas.
- Lee tablas completas: una tabla puede contener muchos productos.
- Devuelve SOLO JSON con {"items":[...]}. Tipo: ${tipo}. Página: ${pagina}.
OCR auxiliar: ${ocr.slice(0,14000)}`;
      const schema = {type:'object',properties:{items:{type:'array',items:{type:'object',properties:{codigo:{type:'string'},nombre:{type:'string'},marca:{type:'string'},modelo:{type:'string'},categoria:{type:'string'},descripcion:{type:'string'},precio_fuente:{type:'number'},unidad:{type:'string'},unidad_precio:{type:'string'},cantidad_paquete:{type:'number'},presentacion:{type:'string'},variante:{type:'string'}},required:['codigo','nombre','marca','modelo','categoria','descripcion','precio_fuente','unidad','unidad_precio','cantidad_paquete','presentacion','variante']}}},required:['items']};
      const normalize = j => Array.isArray(j?.items) ? j.items.map(x => ({codigo:String(x?.codigo||'').trim().toUpperCase(),nombre:String(x?.nombre||'').trim(),marca:String(x?.marca||'').trim(),modelo:String(x?.modelo||'').trim(),categoria:String(x?.categoria||'').trim(),descripcion:String(x?.descripcion||'').trim(),precio_fuente:Number(x?.precio_fuente||0),unidad:String(x?.unidad||'UND').trim(),unidad_precio:String(x?.unidad_precio||'').trim(),cantidad_paquete:Number(x?.cantidad_paquete||1),presentacion:String(x?.presentacion||'').trim(),variante:String(x?.variante||'').trim()})) : [];
      const cleanItems = items => {const seen=new Set();return items.filter(x=>{if(!/^(AD|PRO)-[A-Z0-9-]+$/.test(x.codigo)||!x.nombre)return false;const k=x.codigo+'|'+x.nombre.toUpperCase()+'|'+x.variante.toUpperCase();if(seen.has(k))return false;seen.add(k);return true})};
      const providers=[];
      if(env.GEMINI_API_KEY) providers.push(async()=>{const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key='+encodeURIComponent(env.GEMINI_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inline_data:{mime_type:'image/jpeg',data:image.split(',').pop()}}]}],generationConfig:{responseMimeType:'application/json',responseSchema:schema,maxOutputTokens:4000}})});const j=await r.json();if(!r.ok)throw new Error(j?.error?.message||'Gemini no disponible');return cleanItems(normalize(JSON.parse(j?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'{}')))});
      if(env.OPENROUTER_API_KEY) providers.push(async()=>{const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.OPENROUTER_API_KEY},body:JSON.stringify({model:'openrouter/free',messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:image}}]}],response_format:{type:'json_object'},max_tokens:4000})});const j=await r.json();if(!r.ok)throw new Error(j?.error?.message||'OpenRouter no disponible');return cleanItems(normalize(JSON.parse(j?.choices?.[0]?.message?.content||'{}')))});
      if(env.AI) providers.push(async()=>{const r=await env.AI.run('@cf/google/gemma-4-26b-a4b-it',{prompt,image:image.split(',').pop()});return cleanItems(normalize(typeof r==='string'?JSON.parse(r):r))});
      let lastError=null;for(const provider of providers){try{const items=await provider();if(items.length)return Response.json({items,pagina,tipo,fuente:'IA visual adaptativa'});}catch(e){lastError=e}}
      return Response.json({items:[],error:lastError?.message||'Ningún motor visual devolvió productos válidos'},{status:503});
    } catch(e) { return Response.json({error:String(e?.message||e)},{status:500}); }
  }
};

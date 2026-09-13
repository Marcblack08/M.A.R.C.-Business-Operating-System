export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/analyze-catalog-page') {
      return new Response('M.A.R.C. Worker OK', { status: 200 });
    }
    if (request.method !== 'POST') {
      return Response.json({ error: 'Método no permitido' }, { status: 405 });
    }

    try {
      const body = await request.json();
      const image = String(body?.image || '');
      const tipo = String(body?.tipo || 'PROVEEDOR');
      const pagina = Number(body?.pagina || 0);
      const ocr = String(body?.ocr_text || '');
      if (!image) return Response.json({ error: 'Falta la imagen de la página' }, { status: 400 });

      const prompt = `Analiza esta página de catálogo comercial como fuente primaria visual. Devuelve SOLO JSON válido con {"items":[...]}. Lee con máxima precisión el código/modelo, nombre comercial, marca, categoría, descripción, precio visible, unidad, cantidad por caja/paquete, presentación y variante. La imagen es la fuente principal; el OCR es auxiliar. Nunca conviertas un precio como S/72 en código o modelo. No inventes datos. Si un campo no se puede leer con seguridad, déjalo vacío o en 0. Solo considera precios claramente etiquetados como precio de venta/compra, precio caja o equivalente. Tipo de catálogo: ${tipo}. Página: ${pagina}. OCR auxiliar: ${ocr.slice(0, 12000)}`;

      const schema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                codigo: { type: 'string' },
                nombre: { type: 'string' },
                marca: { type: 'string' },
                modelo: { type: 'string' },
                categoria: { type: 'string' },
                descripcion: { type: 'string' },
                precio_fuente: { type: 'number' },
                unidad: { type: 'string' },
                unidad_precio: { type: 'string' },
                cantidad_paquete: { type: 'number' },
                presentacion: { type: 'string' },
                variante: { type: 'string' }
              },
              required: ['codigo','nombre','marca','modelo','categoria','descripcion','precio_fuente','unidad','unidad_precio','cantidad_paquete','presentacion','variante']
            }
          }
        },
        required: ['items']
      };

      const normalize = (j) => Array.isArray(j?.items) ? j.items.map(x => ({
        codigo: String(x?.codigo || '').trim(),
        nombre: String(x?.nombre || '').trim(),
        marca: String(x?.marca || '').trim(),
        modelo: String(x?.modelo || '').trim(),
        categoria: String(x?.categoria || '').trim(),
        descripcion: String(x?.descripcion || '').trim(),
        precio_fuente: Number(x?.precio_fuente || 0),
        unidad: String(x?.unidad || 'UND').trim(),
        unidad_precio: String(x?.unidad_precio || '').trim(),
        cantidad_paquete: Number(x?.cantidad_paquete || 1),
        presentacion: String(x?.presentacion || '').trim(),
        variante: String(x?.variante || '').trim()
      })) : [];

      const providers = [];
      if (env.GEMINI_API_KEY) {
        providers.push(async () => {
          const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + encodeURIComponent(env.GEMINI_API_KEY), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: image.split(',').pop() } }] }],
              generationConfig: { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 1800 }
            })
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j?.error?.message || 'Gemini no disponible');
          const text = j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}';
          return normalize(JSON.parse(text));
        });
      }
      if (env.OPENROUTER_API_KEY) {
        providers.push(async () => {
          const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.OPENROUTER_API_KEY },
            body: JSON.stringify({ model: 'openrouter/free', messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image } }] }], response_format: { type: 'json_object' }, max_tokens: 1800 })
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j?.error?.message || 'OpenRouter no disponible');
          return normalize(JSON.parse(j?.choices?.[0]?.message?.content || '{}'));
        });
      }
      if (env.AI) {
        providers.push(async () => {
          const r = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', { prompt, image: image.split(',').pop() });
          return normalize(typeof r === 'string' ? JSON.parse(r) : r);
        });
      }

      let lastError = null;
      for (const provider of providers) {
        try {
          const items = await provider();
          if (items.length) return Response.json({ items, pagina, tipo, fuente: 'IA visual + OCR' });
        } catch (e) {
          lastError = e;
        }
      }
      return Response.json({ items: [], error: lastError?.message || 'Ningún motor de IA devolvió productos' }, { status: 503 });
    } catch (e) {
      return Response.json({ error: String(e?.message || e) }, { status: 500 });
    }
  }
};

export async function onRequestPost(context) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  try {
    const body = await context.request.json();
    const image = String(body?.image || '');
    const tipo = String(body?.tipo || 'PROVEEDOR');
    const pagina = Number(body?.pagina || 0);
    if (!image.startsWith('data:image/')) return new Response(JSON.stringify({ error: 'Imagen de página inválida' }), { status: 400, headers });
    if (!context.env.AI) return new Response(JSON.stringify({ error: 'Workers AI no está configurado' }), { status: 503, headers });

    const system = `Eres un extractor de catálogos empresariales. Lee únicamente lo que aparezca en la imagen. No inventes datos. Devuelve SOLO JSON válido con esta forma: {"items":[{"codigo":"","nombre":"","marca":"","modelo":"","categoria":"","descripcion":"","precio_fuente":0,"unidad":"UND","datos_extra":{}}]}. precio_fuente es el precio visible de la presentación mostrada; si dice PRECIO CAJA y una cantidad de unidades, conserva la cantidad en datos_extra.cantidad_paquete y presentacion="CAJA". Si hay una tabla con varios productos, crea un item por fila. Si un dato no aparece, usa cadena vacía o 0. La página es ${pagina} y el tipo de catálogo es ${tipo}.`;
    const result = await context.env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: [{ type: 'text', text: 'Extrae los productos de esta página de catálogo y responde solo con el JSON solicitado.' }, { type: 'image_url', image_url: { url: image } }] }
      ],
      max_tokens: 900,
      temperature: 0
    });
    const raw = String(result?.response || result?.result?.response || '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return new Response(JSON.stringify({ error: 'La IA no devolvió JSON utilizable' }), { status: 422, headers });
    const parsed = JSON.parse(match[0]);
    return new Response(JSON.stringify({ items: Array.isArray(parsed.items) ? parsed.items : [] }), { status: 200, headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error?.message || 'No se pudo analizar la página') }), { status: 500, headers });
  }
}

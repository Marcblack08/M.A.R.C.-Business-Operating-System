export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/analyze-product" && request.method === "POST") {
      if (!env.AI) return Response.json({ error: "Workers AI no está conectado en Cloudflare." }, { status: 503 });
      try {
        const body = await request.json();
        const image = typeof body?.image === "string" ? body.image : "";
        if (!image) return Response.json({ error: "Falta la imagen del producto." }, { status: 400 });
        if (image.length > 14_000_000) return Response.json({ error: "La imagen es demasiado grande. Usa una foto de hasta 10 MB." }, { status: 413 });
        const result = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
          messages: [
            { role: "system", content: "Eres un extractor de datos de productos para inventario. Solo usa información visible y nunca inventes datos." },
            { role: "user", content: "Analiza la foto. Extrae código/SKU, nombre, marca, modelo, categoría, descripción y precios claramente visibles. Si un dato no aparece, devuelve una cadena vacía o null." }
          ],
          image,
          max_tokens: 700,
          temperature: 0.1,
          response_format: {
            type: "json_schema",
            json_schema: {
              type: "object",
              properties: {
                codigo: { type: "string" },
                nombre: { type: "string" },
                marca: { type: "string" },
                modelo: { type: "string" },
                categoria: { type: "string" },
                descripcion: { type: "string" },
                precio_compra: { type: ["number", "null"] },
                precio_venta: { type: ["number", "null"] }
              },
              required: ["codigo", "nombre", "marca", "modelo", "categoria", "descripcion", "precio_compra", "precio_venta"]
            }
          }
        });
        return Response.json({ text: result?.response || result?.description || result?.result?.response || "" });
      } catch (error) {
        return Response.json({ error: "No se pudo analizar la imagen.", detail: String(error?.message || error) }, { status: 500 });
      }
    }

    if (url.pathname === "/api/ai" && request.method === "POST") {
      if (!env.AI) return Response.json({ error: "La IA de Cloudflare todavía no está conectada." }, { status: 503 });
      try {
        const body = await request.json();
        const message = typeof body?.message === "string" ? body.message.trim() : "";
        if (!message) return Response.json({ error: "Falta el mensaje." }, { status: 400 });
        const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          messages: [
            { role: "system", content: "Eres M.A.R.C., el asistente inteligente de un sistema operativo empresarial. Responde en español de forma clara, profesional y práctica." },
            { role: "user", content: message }
          ],
          max_tokens: 700
        });
        return Response.json({ text: result?.response || "No pude generar una respuesta." });
      } catch (error) {
        return Response.json({ error: "No se pudo procesar la solicitud de IA.", detail: String(error?.message || error) }, { status: 500 });
      }
    }
    return env.ASSETS.fetch(request);
  }
};

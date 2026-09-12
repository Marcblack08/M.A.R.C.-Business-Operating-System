function parseObject(value) {
  if (value && typeof value === "object") return value;
  const text = String(value || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) try { return JSON.parse(match[0]); } catch {}
  return {};
}

function usefulFields(data) {
  const keys = ["codigo", "nombre", "marca", "modelo", "categoria", "descripcion", "precio_compra", "precio_venta"];
  return keys.filter(k => data?.[k] !== null && data?.[k] !== undefined && String(data[k]).trim() !== "").length;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/analyze-product" && request.method === "POST") {
      if (!env.AI) return Response.json({ error: "Workers AI no está conectado en Cloudflare." }, { status: 503 });
      try {
        const body = await request.json();
        const rawImage = typeof body?.image === "string" ? body.image.trim() : "";
        if (!rawImage) return Response.json({ error: "Falta la imagen del producto." }, { status: 400 });
        const image = rawImage.includes(",") ? rawImage.split(",", 2)[1] : rawImage;
        if (!image) return Response.json({ error: "La imagen no contiene datos válidos." }, { status: 400 });
        if (image.length > 8_000_000) return Response.json({ error: "La imagen es demasiado grande. Usa una foto más pequeña." }, { status: 413 });

        const question = `Lee esta imagen como si fuera una etiqueta o ficha de producto para inventario. Extrae SOLO lo que sea claramente visible. Prioriza OCR exacto de números, códigos, marca y modelo. Devuelve SOLO JSON válido con estas claves: codigo, nombre, marca, modelo, categoria, descripcion, precio_compra, precio_venta. No inventes datos. Si algo no aparece o no se puede leer con seguridad, usa "".`;

        const fast = await env.AI.run("@cf/moondream/moondream3.1-9B-A2B", {
          task: "query",
          image,
          question,
          reasoning: false,
          temperature: 0,
          max_tokens: 500
        });

        let data = parseObject(fast?.answer || fast?.response || "{}");

        // Si el modelo rápido no pudo extraer datos útiles, usamos Llama Vision
        // solo como respaldo. Así mantenemos velocidad en los casos normales.
        if (usefulFields(data) < 2) {
          const fallback = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
            messages: [
              { role: "system", content: "Eres un extractor OCR de productos. No inventes información." },
              { role: "user", content: "Lee cuidadosamente la etiqueta o ficha del producto de la imagen. Extrae código, nombre, marca, modelo, categoría, descripción, precio de compra y precio de venta. Usa cadenas vacías si no son visibles. Devuelve únicamente JSON válido." }
            ],
            image,
            max_tokens: 450,
            temperature: 0,
            response_format: { type: "json_object" }
          });
          data = parseObject(fallback?.response || fallback?.result?.response || fallback || "{}");
        }

        return Response.json({ text: JSON.stringify(data || {}) });
      } catch (error) {
        console.error("M.A.R.C. analyze-product:", error);
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

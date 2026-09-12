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

        const base64 = rawImage.startsWith("data:") ? (rawImage.split(",", 2)[1] || "") : rawImage;
        const image = rawImage.startsWith("data:image/") ? rawImage : `data:image/jpeg;base64,${base64}`;
        if (!base64) return Response.json({ error: "La imagen no contiene datos válidos." }, { status: 400 });
        if (base64.length > 10_000_000) return Response.json({ error: "La imagen es demasiado grande. Usa una foto más pequeña." }, { status: 413 });

        const question = `Analiza esta foto de producto para inventario. Lee primero todo el texto visible mediante OCR, especialmente números, códigos, marca y modelo. Devuelve ÚNICAMENTE JSON válido con exactamente estas claves: codigo, nombre, marca, modelo, categoria, descripcion, precio_compra, precio_venta. No inventes datos. Si un dato no aparece o no puede leerse con seguridad, usa "". Conserva exactamente letras, números, guiones y puntos de códigos y modelos.`;

        let data = {};
        let used = "moondream";

        try {
          const fast = await env.AI.run("@cf/moondream/moondream3.1-9B-A2B", {
            task: "query",
            image,
            question,
            reasoning: false,
            temperature: 0,
            max_tokens: 500,
            stream: false
          });
          data = parseObject(fast?.answer || fast?.response || "{}");
        } catch (visionError) {
          console.warn("Moondream product OCR failed:", visionError);
        }

        // Respaldo para etiquetas difíciles. Llama Vision también recibe la data URI,
        // que es el formato documentado para imágenes en Workers AI.
        if (usefulFields(data) < 2) {
          used = "llama-vision";
          const fallback = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
            messages: [
              { role: "system", content: "Eres un extractor OCR de productos para inventario. No inventes información." },
              { role: "user", content: "Lee cuidadosamente toda la etiqueta, caja o ficha del producto. Extrae código/SKU, nombre, marca, modelo, categoría, descripción, precio de compra y precio de venta. Prioriza OCR exacto de números y códigos. Conserva exactamente letras, números, guiones y puntos visibles. Si un dato no aparece, usa una cadena vacía. Devuelve únicamente JSON válido con las claves codigo, nombre, marca, modelo, categoria, descripcion, precio_compra, precio_venta." }
            ],
            image,
            max_tokens: 500,
            temperature: 0,
            response_format: { type: "json_object" }
          });
          const fallbackData = parseObject(fallback?.response || fallback?.result?.response || fallback || "{}");
          if (usefulFields(fallbackData) > usefulFields(data)) data = fallbackData;
        }

        const count = usefulFields(data);
        if (count === 0) {
          return Response.json({ error: "La IA no pudo leer datos de esta foto. Acerca la etiqueta y vuelve a intentarlo.", fields: 0, model: used }, { status: 422 });
        }

        return Response.json({ text: JSON.stringify(data), fields: count, model: used });
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

function parseObject(value) {
  if (value && typeof value === "object") return value;
  const text = String(value || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) try { return JSON.parse(match[0]); } catch {}
  return {};
}

function parseLabeledText(value) {
  const text = String(value || "").replace(/\r/g, "").trim();
  if (!text) return {};
  const out = {};
  const aliases = {
    codigo: "codigo", "código": "codigo", sku: "codigo",
    nombre: "nombre", producto: "nombre",
    marca: "marca", modelo: "modelo",
    categoria: "categoria", "categoría": "categoria",
    descripcion: "descripcion", "descripción": "descripcion",
    precio_compra: "precio_compra", "precio compra": "precio_compra", "precio de compra": "precio_compra",
    precio_venta: "precio_venta", "precio venta": "precio_venta", "precio de venta": "precio_venta"
  };
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*[-*•]?\s*([^:]+)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const key = aliases[m[1].trim().toLowerCase()];
    if (key && m[2].trim()) out[key] = m[2].trim();
  }
  return out;
}

function normalizeData(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const nested = value.response && typeof value.response === "object" ? value.response : value;
    return nested;
  }
  const text = String(value || "");
  return { ...parseObject(text), ...parseLabeledText(text) };
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

        const question = `Haz OCR de esta foto de producto. Lee con máxima precisión todo texto visible, especialmente marca, modelo, códigos y números. Responde SOLO con estas líneas y no agregues explicaciones:\ncodigo: \nnombre: \nmarca: \nmodelo: \ncategoria: \ndescripcion: \nprecio_compra: \nprecio_venta: \nNo inventes datos. Si un campo no aparece, déjalo vacío. Conserva exactamente letras, números, guiones y puntos de códigos y modelos.`;

        let data = {};
        let used = "moondream";
        const errors = [];

        try {
          const result = await env.AI.run("@cf/moondream/moondream3.1-9B-A2B", {
            task: "query",
            image,
            question,
            reasoning: false,
            temperature: 0,
            max_tokens: 700,
            stream: false
          });
          data = normalizeData(result?.answer || result?.response || result || "");
        } catch (error) {
          errors.push(`Moondream: ${String(error?.message || error)}`);
        }

        if (usefulFields(data) < 2) {
          used = "llama-vision";
          try {
            // La primera llamada acepta la licencia de Meta para este modelo.
            // Cloudflare indica que es necesaria antes de usar Llama 3.2 Vision.
            try {
              await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", { prompt: "agree" });
            } catch (licenseError) {
              // Si ya fue aceptada, esta llamada puede devolver un error benigno; continuamos.
              console.warn("Llama license handshake:", String(licenseError?.message || licenseError));
            }

            const fallback = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
              messages: [
                { role: "system", content: "Eres un extractor OCR para inventario. No inventes información. Lee exactamente la imagen." },
                { role: "user", content: question }
              ],
              image,
              max_tokens: 700,
              temperature: 0,
              stream: false
            });
            const fallbackText = fallback?.response || fallback?.result?.response || fallback || "";
            const fallbackData = normalizeData(fallbackText);
            if (usefulFields(fallbackData) > usefulFields(data)) data = fallbackData;
          } catch (error) {
            errors.push(`Llama Vision: ${String(error?.message || error)}`);
          }
        }

        const count = usefulFields(data);
        if (count === 0) {
          return Response.json({
            error: "La IA no pudo leer datos de esta foto.",
            detail: errors.join(" | ") || "Los modelos de visión no devolvieron campos legibles.",
            fields: 0,
            model: used
          }, { status: 422 });
        }

        return Response.json({ text: JSON.stringify(data), fields: count, model: used });
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

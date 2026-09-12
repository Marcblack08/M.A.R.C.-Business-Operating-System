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
    codigo: "codigo",
    "código": "codigo",
    sku: "codigo",
    nombre: "nombre",
    producto: "nombre",
    marca: "marca",
    modelo: "modelo",
    categoria: "categoria",
    "categoría": "categoria",
    descripcion: "descripcion",
    "descripción": "descripcion",
    precio_compra: "precio_compra",
    "precio compra": "precio_compra",
    "precio de compra": "precio_compra",
    precio_venta: "precio_venta",
    "precio venta": "precio_venta",
    "precio de venta": "precio_venta"
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
  return { ...parseObject(value), ...parseLabeledText(value) };
}

function usefulFields(data) {
  const keys = ["codigo", "nombre", "marca", "modelo", "categoria", "descripcion", "precio_compra", "precio_venta"];
  return keys.filter(k => data?.[k] !== null && data?.[k] !== undefined && String(data[k]).trim() !== "").length;
}

const PRODUCT_SCHEMA = {
  type: "object",
  properties: {
    codigo: { type: "string" },
    nombre: { type: "string" },
    marca: { type: "string" },
    modelo: { type: "string" },
    categoria: { type: "string" },
    descripcion: { type: "string" },
    precio_compra: { type: "string" },
    precio_venta: { type: "string" }
  },
  required: ["codigo", "nombre", "marca", "modelo", "categoria", "descripcion", "precio_compra", "precio_venta"]
};

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

        // Moondream se usa primero porque está diseñado para OCR. Pedimos campos etiquetados
        // en texto para no depender de que el modelo genere JSON perfecto.
        const question = `Analiza esta foto de producto para inventario y haz OCR de todo el texto visible. Identifica con máxima precisión números, códigos, marca y modelo. Responde SOLO con estas 8 líneas, una por campo, usando exactamente este formato: codigo: ; nombre: ; marca: ; modelo: ; categoria: ; descripcion: ; precio_compra: ; precio_venta: . No inventes datos. Si un campo no aparece o no puede leerse con seguridad, déjalo vacío. Conserva exactamente letras, números, guiones y puntos de los códigos y modelos.`;

        let data = {};
        let used = "moondream";
        let moondreamError = "";
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
          data = normalizeData(fast?.answer || fast?.response || fast || "");
        } catch (visionError) {
          moondreamError = String(visionError?.message || visionError);
          console.warn("Moondream product OCR failed:", moondreamError);
        }

        // Respaldo Llama Vision. Cloudflare documenta este modelo para imágenes y JSON Mode.
        if (usefulFields(data) < 2) {
          used = "llama-vision";
          try {
            const fallback = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
              messages: [
                { role: "system", content: "Eres un extractor OCR de productos para inventario. No inventes información. Devuelve todos los campos solicitados aunque estén vacíos." },
                { role: "user", content: "Lee cuidadosamente toda la etiqueta, caja o ficha del producto. Extrae código/SKU, nombre, marca, modelo, categoría, descripción, precio de compra y precio de venta. Prioriza OCR exacto de números y códigos. Conserva exactamente letras, números, guiones y puntos visibles. Si un dato no aparece, usa una cadena vacía." }
              ],
              image,
              max_tokens: 500,
              temperature: 0,
              stream: false,
              response_format: { type: "json_schema", json_schema: PRODUCT_SCHEMA }
            });
            const fallbackData = normalizeData(fallback?.response || fallback?.result?.response || fallback || "{}");
            if (usefulFields(fallbackData) > usefulFields(data)) data = fallbackData;
          } catch (fallbackError) {
            const detail = String(fallbackError?.message || fallbackError);
            console.warn("Llama Vision product OCR failed:", detail);
            if (!moondreamError) moondreamError = detail;
          }
        }

        const count = usefulFields(data);
        if (count === 0) {
          return Response.json({
            error: "La IA no pudo leer datos de esta foto.",
            detail: moondreamError || "Los modelos de visión no devolvieron campos legibles.",
            fields: 0,
            model: used
          }, { status: 422 });
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

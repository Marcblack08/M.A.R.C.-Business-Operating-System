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

        // Moondream espera una URL pública o una data URI base64.
        // El navegador ya envía data:image/jpeg;base64,...; no debemos quitar ese prefijo.
        const image = rawImage.startsWith("data:image/")
          ? rawImage
          : `data:image/jpeg;base64,${rawImage.replace(/^data:[^,]+,/, "")}`;

        if (image.length > 10_000_000) return Response.json({ error: "La imagen es demasiado grande. Usa una foto más pequeña." }, { status: 413 });

        const question = `Analiza esta foto de producto para inventario. Lee primero cualquier texto visible de la etiqueta o caja (OCR), especialmente números y códigos. Extrae únicamente datos que realmente puedas leer: codigo, nombre, marca, modelo, categoria, descripcion, precio_compra y precio_venta. Los códigos y modelos deben conservar exactamente letras, números, guiones y puntos visibles. Si un dato no aparece o no se puede leer con seguridad, usa una cadena vacía. Devuelve ÚNICAMENTE un objeto JSON válido, sin markdown ni explicaciones, con exactamente estas claves: codigo, nombre, marca, modelo, categoria, descripcion, precio_compra, precio_venta.`;

        const result = await env.AI.run("@cf/moondream/moondream3.1-9B-A2B", {
          task: "query",
          image,
          question,
          reasoning: false,
          temperature: 0,
          max_tokens: 450
        });

        const data = parseObject(result?.answer || result?.response || "{}");
        const count = usefulFields(data);

        if (count === 0) {
          return Response.json({
            error: "La IA no pudo leer datos de esta foto. Acerca la etiqueta, mejora la iluminación y vuelve a intentarlo."
          }, { status: 422 });
        }

        return Response.json({ text: JSON.stringify(data), fields: count });
      } catch (error) {
        console.error("M.A.R.C. analyze-product:", error);
        return Response.json({
          error: "No se pudo analizar la imagen.",
          detail: String(error?.message || error)
        }, { status: 500 });
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

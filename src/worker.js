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

        const result = await env.AI.run("@cf/moondream/moondream3.1-9B-A2B", {
          task: "query",
          image,
          question: "Extrae de esta foto los datos visibles del producto para inventario. Responde SOLO con JSON válido con estas claves: codigo, nombre, marca, modelo, categoria, descripcion, precio_compra, precio_venta. Si un dato no es visible, usa una cadena vacía o null. No inventes información.",
          reasoning: false,
          temperature: 0,
          max_tokens: 300
        });

        const answer = result?.answer || result?.response || "{}";
        let data = {};
        try {
          data = typeof answer === "string" ? JSON.parse(answer) : answer;
        } catch {
          const match = String(answer).match(/\{[\s\S]*\}/);
          if (match) {
            try { data = JSON.parse(match[0]); } catch {}
          }
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

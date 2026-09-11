export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ai" && request.method === "POST") {
      if (!env.AI) {
        return Response.json(
          { error: "La IA de Cloudflare todavía no está conectada." },
          { status: 503 }
        );
      }

      try {
        const body = await request.json();
        const message = typeof body?.message === "string" ? body.message.trim() : "";

        if (!message) {
          return Response.json({ error: "Falta el mensaje." }, { status: 400 });
        }

        const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          messages: [
            {
              role: "system",
              content:
                "Eres M.A.R.C., el asistente inteligente de un sistema operativo empresarial. Responde en español de forma clara, profesional y práctica."
            },
            { role: "user", content: message }
          ],
          max_tokens: 700
        });

        return Response.json({ text: result?.response || "No pude generar una respuesta." });
      } catch (error) {
        return Response.json(
          { error: "No se pudo procesar la solicitud de IA.", detail: String(error?.message || error) },
          { status: 500 }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};

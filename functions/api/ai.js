export async function onRequestPost(context) {
  const cors = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };

  try {
    const body = await context.request.json();
    const message = String(body?.message || '').trim();
    if (!message) return new Response(JSON.stringify({ error: 'Mensaje vacío' }), { status: 400, headers: cors });

    if (!context.env.AI) {
      return new Response(JSON.stringify({
        error: 'AI binding not configured',
        text: 'El núcleo visual y de voz está listo. Falta conectar Workers AI en Cloudflare para activar el razonamiento.'
      }), { status: 503, headers: cors });
    }

    const system = `Eres M.A.R.C., el asistente inteligente de un Business Operating System. Responde en español claro y profesional. Tu trabajo es ayudar a gestionar clientes, productos, servicios, inventario, cotizaciones, informes técnicos y documentos. No inventes datos del negocio que no estén en el contexto. Si falta información, pregunta exactamente qué necesitas. Cuando una tarea pueda convertirse en una acción del sistema, describe la acción de forma concreta.`;

    const result = await context.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: message }
      ],
      max_tokens: 700
    });

    const text = result?.response || result?.result?.response || 'No pude generar una respuesta.';
    return new Response(JSON.stringify({ text }), { status: 200, headers: cors });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'AI request failed', text: 'No pude procesar la solicitud en este momento.' }), { status: 500, headers: cors });
  }
}

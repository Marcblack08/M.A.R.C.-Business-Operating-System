import { onRequestPost as transcribeQuote } from './api/transcribe-quote.js';
import { onRequestPost as interpretQuote } from './api/interpret-quote.js';

const json = (body, status=404) => new Response(JSON.stringify(body), {
  status,
  headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/transcribe-quote') {
      if (request.method !== 'POST') return json({error:'Método no permitido'}, 405);
      return transcribeQuote({request, env, waitUntil: ctx.waitUntil.bind(ctx), next: async () => new Response(null, {status:404})});
    }

    if (url.pathname === '/api/interpret-quote') {
      if (request.method !== 'POST') return json({error:'Método no permitido'}, 405);
      return interpretQuote({request, env, waitUntil: ctx.waitUntil.bind(ctx), next: async () => new Response(null, {status:404})});
    }

    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/ai') return env.ASSETS.fetch(request);
      return json({error:'API route no encontrada'}, 404);
    }

    return env.ASSETS.fetch(request);
  }
};

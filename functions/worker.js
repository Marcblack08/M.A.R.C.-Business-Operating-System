export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/ai') {
        return env.ASSETS.fetch(request);
      }
      return new Response(JSON.stringify({error:'API route no encontrada'}), {status:404, headers:{'Content-Type':'application/json; charset=utf-8'}});
    }
    return env.ASSETS.fetch(request);
  }
};

export async function onRequestPost(context) {
  const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
  try {
    const body = await context.request.json();
    const audio = String(body?.audio || '').trim();
    if (!audio) return new Response(JSON.stringify({error:'Falta audio'}),{status:400,headers});
    if (!context.env.AI) return new Response(JSON.stringify({error:'AI binding not configured'}),{status:503,headers});
    const result = await context.env.AI.run('@cf/openai/whisper-large-v3-turbo',{
      audio,
      task:'transcribe',
      language:'es',
      vad_filter:true,
      initial_prompt:'Cotizaciones empresariales en español peruano. Clientes, bloques, cámaras IP, materiales, accesorios, instalación, soles, precios, cantidades y ubicaciones.'
    });
    const text = String(result?.text || '').trim();
    if (!text) return new Response(JSON.stringify({error:'Whisper no devolvió texto'}),{status:422,headers});
    return new Response(JSON.stringify({text,modelo:'@cf/openai/whisper-large-v3-turbo'}),{status:200,headers});
  } catch (error) {
    return new Response(JSON.stringify({error:String(error?.message || error)}),{status:500,headers});
  }
}

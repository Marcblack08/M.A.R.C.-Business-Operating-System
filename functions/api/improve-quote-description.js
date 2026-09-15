const schema={type:'object',properties:{descripcion:{type:'string'}},required:['descripcion']};
const clean=v=>{if(typeof v!=='string')return v;const s=v.trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();try{return JSON.parse(s)}catch{return null}};
export async function onRequestPost(context){
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
  try{
    const body=await context.request.json();
    const description=String(body?.description||'').trim();
    if(!description)return new Response(JSON.stringify({error:'Falta la descripción'}),{status:400,headers});
    const apiKey=String(context.env?.GEMINI_API_KEY2||'').trim();
    if(!apiKey)return new Response(JSON.stringify({error:'GEMINI_API_KEY2 no está configurada en Cloudflare'}),{status:503,headers});
    const contextText=String(body?.context||'').slice(0,10000);
    const prompt=`Eres el redactor técnico de un sistema profesional de cotizaciones en Perú. Mejora la siguiente descripción escrita por el usuario para que quede clara, profesional, precisa y fácil de entender para un cliente.

OBJETIVO:
- Mantén exactamente lo que el usuario quiso decir.
- Corrige ortografía, puntuación y repeticiones.
- Ordena el trabajo de forma lógica: qué se hará, dónde, cómo se realizará y para qué, cuando esos datos estén disponibles.
- Puedes convertir lenguaje coloquial en lenguaje técnico-profesional sin inventar especificaciones.
- No inventes marcas, modelos, cantidades, medidas, materiales, ángulos, normas, garantías, tiempos ni resultados que el usuario no haya indicado.
- Conserva cantidades, ubicaciones, equipos y objetivos mencionados.
- Usa párrafos breves o una redacción continua apropiada para una proforma.
- No agregues saludos, precios, condiciones comerciales ni publicidad.
- No menciones que eres IA.
- Devuelve únicamente JSON válido con la propiedad descripcion.

DESCRIPCIÓN DEL USUARIO:
${description}

DATOS DE CONTEXTO OPCIONALES:
${contextText}`;
    const models=['gemini-3.6-flash','gemini-3.5-flash-lite'];
    let detail='';
    for(const model of models){
      const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',responseSchema:schema,maxOutputTokens:1200}})});
      const j=await r.json();
      const raw=j?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
      const parsed=clean(raw);
      if(r.ok&&parsed?.descripcion)return new Response(JSON.stringify({descripcion:String(parsed.descripcion).trim(),modelo:model}),{status:200,headers});
      detail=j?.error?.message||`HTTP ${r.status}`;
      if(r.status!==429&&r.status!==503)break;
    }
    return new Response(JSON.stringify({error:`Gemini no disponible temporalmente: ${detail}`}),{status:502,headers});
  }catch(e){return new Response(JSON.stringify({error:String(e?.message||e)}),{status:503,headers});}
}

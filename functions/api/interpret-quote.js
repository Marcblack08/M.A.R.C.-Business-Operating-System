const schema = {
  type:'object',
  properties:{
    cliente_id:{type:'string'},cliente_texto:{type:'string'},ubicacion:{type:'string'},duracion:{type:'string'},modalidad_costo:{type:'string'},precio_total_explicito:{type:'number'},currency:{type:'string'},cantidad_global:{type:'number'},
    partidas:{type:'array',items:{type:'object',properties:{tipo:{type:'string'},nombre:{type:'string'},producto_id:{type:'string'},servicio_id:{type:'string'},cantidad:{type:'number'},unidad:{type:'string'},precio_unitario:{type:'number'},alcance_precio:{type:'string'},descripcion:{type:'string'}},required:['tipo','nombre','producto_id','servicio_id','cantidad','unidad','precio_unitario','alcance_precio','descripcion']}},
    confianza:{type:'number'},ambiguedades:{type:'array',items:{type:'string'}}
  },
  required:['cliente_id','cliente_texto','ubicacion','duracion','modalidad_costo','precio_total_explicito','currency','cantidad_global','partidas','confianza','ambiguedades']
};

const clean = value => {
  if (typeof value !== 'string') return value;
  const s=value.trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(s)}catch{return null}
};
const normalize = j => {
  const x=j||{};
  return {
    cliente_id:x.cliente_id?String(x.cliente_id):null,
    cliente_texto:String(x.cliente_texto||''),
    ubicacion:String(x.ubicacion||''),
    duracion:String(x.duracion||''),
    modalidad_costo:String(x.modalidad_costo||'DESGLOSADO').toUpperCase(),
    precio_total_explicito:Number(x.precio_total_explicito||0)||null,
    currency:String(x.currency||'PEN'),
    cantidad_global:Number(x.cantidad_global||1),
    partidas:Array.isArray(x.partidas)?x.partidas.map(p=>({
      tipo:String(p.tipo||'SERVICIO').toUpperCase(),nombre:String(p.nombre||'').trim(),producto_id:p.producto_id?String(p.producto_id):null,servicio_id:p.servicio_id?String(p.servicio_id):null,
      cantidad:Number(p.cantidad||1),unidad:String(p.unidad||'UND'),precio_unitario:Number(p.precio_unitario||0),alcance_precio:String(p.alcance_precio||'global').toLowerCase(),descripcion:String(p.descripcion||'')
    })).filter(p=>p.nombre&&p.precio_unitario>=0):[],
    confianza:Math.max(0,Math.min(1,Number(x.confianza||0))),
    ambiguedades:Array.isArray(x.ambiguedades)?x.ambiguedades.map(String):[]
  };
};
const promptFor = (text,ctx) => `Eres el motor semántico de M.A.R.C., un sistema empresarial de cotizaciones. Interpreta el dictado completo y devuelve SOLO JSON válido.

REGLAS CRÍTICAS:
1. Extrae cliente, ubicación, duración, modalidad de costo y partidas.
2. Usa únicamente clientes/productos/servicios que aparecen en el contexto. Nunca inventes IDs. Si no hay coincidencia, usa una cadena vacía en el ID correspondiente y conserva el texto hablado.
3. No confundas cliente con ubicación. Frases como "cliente es bloque 2" identifican cliente; frases después de "ubicación" identifican ubicación.
4. La cantidad global se aplica a las partidas cuando el dictado habla de varias unidades, por ejemplo "instalación de tres cámaras".
5. Un precio es POR UNIDAD si el dictado dice "cada", "por cámara", "por unidad", "por equipo", "por pieza", "por metro", "por hora" o equivalente. En esos casos alcance_precio="unitario".
6. Si dice solamente "materiales 80 soles" o "instalación 300", sin indicar por unidad, alcance_precio="global" y NO multipliques por la cantidad.
7. "TODO COSTO" solamente cuando el usuario lo dice o lo expresa inequívocamente. En TODO COSTO crea una única partida global con el total explícito y no inventes productos, materiales ni servicios.
8. Si existen partidas detalladas y además un precio total explícito, conserva ambos. No modifiques las partidas para hacerlas coincidir con el total.
9. Interpreta números hablados: "13.500" significa 13500 en contexto monetario peruano; "8 mil 200" significa 8200.
10. Si una frase es ambigua, no adivines: agrega una entrada en ambiguedades.
11. confianza debe reflejar la claridad del dictado, entre 0 y 1.
12. precio_total_explicito debe ser 0 cuando no se mencionó un total final explícito. Los IDs no encontrados deben ser cadenas vacías.

DICTADO:
${String(text||'').slice(0,12000)}

CLIENTES DISPONIBLES:
${JSON.stringify(ctx?.clientes||[]).slice(0,30000)}

PRODUCTOS DISPONIBLES:
${JSON.stringify(ctx?.productos||[]).slice(0,30000)}

SERVICIOS DISPONIBLES:
${JSON.stringify(ctx?.servicios||[]).slice(0,20000)}`;

export async function onRequestPost(context) {
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
  try {
    const body=await context.request.json();
    const text=String(body?.text||'').trim();
    if(!text)return new Response(JSON.stringify({error:'Falta el texto del dictado'}),{status:400,headers});
    const prompt=promptFor(text,body?.context||{});
    if(context.env.AI){
      const result=await context.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast',{messages:[{role:'system',content:'Devuelve únicamente JSON válido. Respeta exactamente el esquema solicitado.'},{role:'user',content:prompt}],response_format:{type:'json_schema',json_schema:{name:'quote',schema,strict:true}}});
      const parsed=clean(result?.response??result?.result?.response??result);
      if(parsed)return new Response(JSON.stringify({quote:normalize(parsed),modelo:'@cf/meta/llama-3.3-70b-instruct-fp8-fast'}),{status:200,headers});
    }
    if(context.env.GEMINI_API_KEY){
      const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key='+encodeURIComponent(context.env.GEMINI_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',responseSchema:schema,maxOutputTokens:5000}})});
      const j=await r.json();
      if(r.ok){const raw=j?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';const parsed=clean(raw);if(parsed)return new Response(JSON.stringify({quote:normalize(parsed),modelo:'gemini-3.6-flash'}),{status:200,headers});}
    }
    return new Response(JSON.stringify({error:'No hay motor de interpretación disponible'}),{status:503,headers});
  }catch(error){return new Response(JSON.stringify({error:String(error?.message||error)}),{status:503,headers});}
}

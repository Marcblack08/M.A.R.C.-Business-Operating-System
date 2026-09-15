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

const compact = (arr, fields, max=160) => (Array.isArray(arr)?arr:[]).slice(0,max).map(x=>{
  const o={};for(const k of fields)if(x?.[k]!==undefined&&x?.[k]!==null&&String(x[k]).trim()!=='')o[k]=x[k];return o;
});
const compactContext = ctx => ({
  clientes:compact(ctx?.clientes,['id','nombre','documento'],300),
  productos:compact(ctx?.productos,['id','codigo','nombre','marca','modelo','unidad','precio_venta'],160),
  servicios:compact(ctx?.servicios,['id','codigo','nombre','categoria','unidad','precio'],120)
});

const promptFor = (text,ctx) => `Eres el motor semántico de M.A.R.C., un sistema empresarial de cotizaciones en Perú. Interpreta el dictado completo y devuelve SOLO JSON válido.

REGLAS CRÍTICAS:
1. Extrae cliente, ubicación, duración, modalidad de costo y partidas.
2. Usa únicamente clientes/productos/servicios que aparecen en el contexto. Nunca inventes IDs. Si no hay coincidencia, usa una cadena vacía en el ID correspondiente y conserva el texto hablado.
3. No confundas cliente con ubicación. "cliente es X" identifica cliente; "ubicación X" identifica ubicación. Si no existe marcador suficiente, conserva el texto y agrega una ambigüedad en vez de adivinar.
4. "instalación de dos cámaras IP" significa cantidad 2 para la partida correspondiente.
5. Un precio es POR UNIDAD si el dictado dice "cada", "por cámara", "por unidad", "por equipo", "por pieza", "por metro", "por hora" o equivalente. En esos casos alcance_precio="unitario".
6. Si dice solamente "materiales 80 soles" o "instalación 300", sin indicar por unidad, alcance_precio="global" y NO multipliques por la cantidad.
7. "TODO COSTO" solamente cuando el usuario lo dice o lo expresa inequívocamente. En TODO COSTO crea una única partida global con el total explícito y no inventes productos, materiales ni servicios.
8. Si existen partidas detalladas y además un precio total explícito, conserva ambos. No modifiques las partidas para hacerlas coincidir con el total.
9. Interpreta números hablados y formato peruano: "13.500"=13500 y "8 mil 200"=8200.
10. Si el usuario describe características del equipo (por ejemplo 4 megapíxeles, ColorVu, tubular), intégralas en nombre/descripcion de la partida. No inventes un modelo exacto.
11. confianza debe reflejar la claridad del dictado, entre 0 y 1.
12. precio_total_explicito debe ser 0 cuando no se mencionó un total final explícito. Los IDs no encontrados deben ser cadenas vacías.
13. Para "dos cámaras IP, precio por cámara 250, materiales 80, instalación 300", devuelve cámara cantidad 2 precio unitario 250, materiales global 80 e instalación global 300.

DICTADO:
${String(text||'').slice(0,12000)}

CONTEXTO DISPONIBLE (solo candidatos reales; no inventes IDs):
${JSON.stringify(compactContext(ctx))}`;

const callGemini = async (apiKey, model, prompt) => {
  const url='https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent';
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',responseSchema:schema,maxOutputTokens:2500}})});
  const j=await r.json();
  const raw=j?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
  return {ok:r.ok, status:r.status, detail:j?.error?.message||'', parsed:clean(raw)};
};

export async function onRequestPost(context) {
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
  try {
    const body=await context.request.json();
    const text=String(body?.text||'').trim();
    if(!text)return new Response(JSON.stringify({error:'Falta el texto del dictado'}),{status:400,headers});
    const apiKey=String(context.env?.GEMINI_API_KEY2||'').trim();
    if(!apiKey)return new Response(JSON.stringify({error:'GEMINI_API_KEY2 no está configurada en Cloudflare'}),{status:503,headers});

    const prompt=promptFor(text,body?.context||{});
    const models=['gemini-3.6-flash','gemini-3.5-flash-lite'];
    let lastDetail='';
    for(const model of models){
      const result=await callGemini(apiKey,model,prompt);
      if(result.ok&&result.parsed)return new Response(JSON.stringify({quote:normalize(result.parsed),modelo:model}),{status:200,headers});
      lastDetail=result.detail||`HTTP ${result.status}`;
      if(result.status!==429&&result.status!==503)break;
    }
    return new Response(JSON.stringify({error:`Gemini no disponible temporalmente: ${lastDetail}`}),{status:502,headers});
  }catch(error){return new Response(JSON.stringify({error:String(error?.message||error)}),{status:503,headers});}
}

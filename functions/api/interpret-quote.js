const schema = {
  type:'object',
  properties:{
    cliente_id:{type:'string'},cliente_texto:{type:'string'},ubicacion:{type:'string'},duracion:{type:'string'},modalidad_costo:{type:'string'},precio_total_explicito:{type:'number'},currency:{type:'string'},cantidad_global:{type:'number'},
    descripcion_trabajo:{type:'string'},
    partidas:{type:'array',items:{type:'object',properties:{tipo:{type:'string'},nombre:{type:'string'},producto_id:{type:'string'},servicio_id:{type:'string'},cantidad:{type:'number'},unidad:{type:'string'},precio_unitario:{type:'number'},alcance_precio:{type:'string'},descripcion:{type:'string'}},required:['tipo','nombre','producto_id','servicio_id','cantidad','unidad','precio_unitario','alcance_precio','descripcion']}},
    confianza:{type:'number'},ambiguedades:{type:'array',items:{type:'string'}}
  },
  required:['cliente_id','cliente_texto','ubicacion','duracion','modalidad_costo','precio_total_explicito','currency','cantidad_global','descripcion_trabajo','partidas','confianza','ambiguedades']
};

const pricingSchema = {
  type:'object',
  properties:{
    precios:{type:'array',items:{type:'object',properties:{indice:{type:'integer'},precio_unitario:{type:'number'},alcance_precio:{type:'string'},cantidad:{type:'number'}},required:['indice','precio_unitario','alcance_precio','cantidad']}}
  },
  required:['precios']
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
    descripcion_trabajo:String(x.descripcion_trabajo||'').trim(),
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
1. Extrae cliente, ubicación, duración, modalidad de costo, una DESCRIPCIÓN DEL TRABAJO y TODAS las partidas con precio.
2. descripcion_trabajo debe ser una redacción profesional, clara y breve del trabajo que el cliente está solicitando. Debe explicar qué se hará, dónde se hará, qué se instalará o realizará y el objetivo o resultado cuando el usuario lo haya dicho. NO inventes ángulos, alturas, materiales, marcas, modelos, cantidades, zonas, procedimientos ni características que el usuario no haya mencionado. Si el dictado dice "instalación de dos cámaras IP en la puerta frontal y exterior para visualizar el acceso", redacta una descripción profesional con esos datos.
3. La descripción debe integrar los hechos del dictado en párrafos naturales, no una lista de precios. Los precios y cantidades detallados deben permanecer además en partidas.
4. El catálogo es SOLO una fuente opcional de IDs y datos de referencia. NUNCA descartes una partida porque no exista en productos o servicios. Si el usuario dice "cámara IP 250", "materiales 80" o "instalación 140" y no existe en el catálogo, crea igualmente la partida con producto_id="", servicio_id="" y conserva exactamente el nombre y precio indicado.
5. Para clientes sí usa únicamente candidatos reales del contexto. Nunca inventes IDs. Si no hay coincidencia, usa cliente_id="" y conserva el texto hablado en cliente_texto. Para productos/servicios, si no hay coincidencia, los IDs deben quedar vacíos pero la partida DEBE mantenerse como partida libre.
6. No confundas cliente con ubicación. "cliente es X" identifica cliente; "ubicación X" y "dirección X" identifican ubicación. Si aparecen varias referencias de ubicación o dirección, CONSÉRVALAS TODAS y combínalas en una sola ubicación clara; no elijas una y descartes la otra. Nunca pongas el nombre del cliente dentro de ubicación.
7. "instalación de dos cámaras IP" significa cantidad 2 para la partida correspondiente. Si luego se indica "cada cámara vale 250", aplica 250 como precio unitario a esa partida.
8. Un precio es POR UNIDAD si el dictado dice "cada", "por cámara", "por unidad", "por equipo", "por pieza", "por metro", "por hora" o equivalente. En esos casos alcance_precio="unitario".
9. Si dice solamente "materiales 80 soles" o "instalación 300", sin indicar por unidad, alcance_precio="global" y NO multipliques por la cantidad.
10. "TODO COSTO" solamente cuando el usuario lo dice o lo expresa inequívocamente. En TODO COSTO crea una única partida global con el total explícito y no inventes productos, materiales ni servicios.
11. Si existen partidas detalladas y además un precio total explícito, conserva ambos. No modifiques las partidas para hacerlas coincidir con el total.
12. Interpreta números hablados y formato peruano: "13.500"=13500, "8 mil 200"=8200 y "150 soles"=150.
13. Si el usuario describe características del equipo (por ejemplo 4 megapíxeles, ColorVu, doble vivo, bullet), intégralas en nombre/descripcion de la partida. No inventes un modelo exacto.
14. confianza debe reflejar la claridad del dictado, entre 0 y 1.
15. precio_total_explicito debe ser 0 cuando no se mencionó un total final explícito. Los IDs no encontrados deben ser cadenas vacías.
16. PARA ESTE TIPO DE DICTADO, ES OBLIGATORIO CONSERVAR CADA PRECIO DICHO: "instalación de dos cámaras IP, precio por cámara IP 150 soles, materiales necesarios 800 soles, precio de instalación 140 soles por cámara" debe producir exactamente estas partidas: cámara IP cantidad 2 precio unitario 150 alcance unitario; materiales cantidad 1 precio 800 alcance global; instalación cantidad 2 precio unitario 140 alcance unitario. No conviertas esos precios en cero ni los reemplaces por precios del catálogo.
17. Si un precio está claramente asociado a una partida por la frase "precio de X", "X vale Y", "X cuesta Y", "materiales Y" o "instalación Y", debes asignarlo a esa partida aunque el catálogo no tenga ese producto/servicio.
18. La salida debe representar lo que el usuario sabe y está cotizando, no lo que existe en la base de datos. El usuario puede conocer precios manualmente; esos precios tienen prioridad sobre los precios del catálogo.
19. Si el usuario habla de un trabajo sin suficientes detalles técnicos, redacta la descripción con lo que sí dijo y no rellenes los huecos con suposiciones.

DICTADO:
${String(text||'').slice(0,12000)}

CONTEXTO DISPONIBLE (solo candidatos reales; no inventes IDs):
${JSON.stringify(compactContext(ctx))}`;

const pricingPrompt = (text, parts) => `Eres un verificador de precios para una cotización en Perú. No redactes ni inventes nada. Recupera ÚNICAMENTE los precios y cantidades que el usuario dijo explícitamente y asígnalos a las partidas por significado.

DICTADO ORIGINAL:
${String(text||'').slice(0,12000)}

PARTIDAS YA DETECTADAS:
${JSON.stringify((parts||[]).map((p,i)=>({indice:i,nombre:p.nombre,cantidad:p.cantidad,precio_unitario:p.precio_unitario,alcance_precio:p.alcance_precio,descripcion:p.descripcion})))}

REGLAS:
- "cada cámara 150", "por cámara 150", "precio por cámara 150" => precio 150, alcance unitario.
- "materiales 800" sin "por cámara" => precio 800, alcance global.
- "instalación 140 por cámara" => precio 140, alcance unitario.
- Nunca uses precios del catálogo para sustituir un precio hablado.
- Si no existe un precio explícito para una partida, devuelve precio 0 para esa partida.
- Mantén el índice de cada partida.
- Devuelve SOLO JSON según el esquema.`;

const callGemini = async (apiKey, model, prompt, responseSchema=schema) => {
  const url='https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent';
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',responseSchema,maxOutputTokens:2500}})});
  const j=await r.json();
  const raw=j?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
  return {ok:r.ok,status:r.status,detail:j?.error?.message||'',parsed:clean(raw)};
};

const repairPricing = async (apiKey, model, text, quote) => {
  const needsRepair=quote.partidas.some(p=>Number(p.precio_unitario||0)<=0);
  if(!needsRepair||!quote.partidas.length)return quote;
  const result=await callGemini(apiKey,model,pricingPrompt(text,quote.partidas),pricingSchema);
  if(!result.ok||!result.parsed?.precios)return quote;
  const byIndex=new Map((result.parsed.precios||[]).map(x=>[Number(x.indice),x]));
  quote.partidas=quote.partidas.map((p,i)=>{
    const r=byIndex.get(i);if(!r)return p;
    const price=Number(r.precio_unitario||0);
    return {...p,precio_unitario:price>0?price:p.precio_unitario,cantidad:Number(r.cantidad||p.cantidad||1),alcance_precio:String(r.alcance_precio||p.alcance_precio||'global').toLowerCase()};
  });
  return quote;
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
      if(result.ok&&result.parsed){
        const quote=await repairPricing(apiKey,model,text,normalize(result.parsed));
        return new Response(JSON.stringify({quote,modelo:model}),{status:200,headers});
      }
      lastDetail=result.detail||`HTTP ${result.status}`;
      if(result.status!==429&&result.status!==503)break;
    }
    return new Response(JSON.stringify({error:`Gemini no disponible temporalmente: ${lastDetail}`}),{status:502,headers});
  }catch(error){return new Response(JSON.stringify({error:String(error?.message||error)}),{status:503,headers});}
}

function parseObject(value) {
  if (value && typeof value === 'object') {
    if (value.result && typeof value.result === 'object') return parseObject(value.result);
    if (value.response && typeof value.response === 'object') return parseObject(value.response);
    return value;
  }
  const text = String(value || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch {}
  return {};
}

function normalizeData(value) {
  if (value && typeof value === 'object') {
    if (value.response && typeof value.response === 'string') return parseObject(value.response);
    if (value.answer && typeof value.answer === 'string') return parseObject(value.answer);
    if (value.choices?.[0]?.message?.content) return parseObject(value.choices[0].message.content);
    if (value.result && typeof value.result === 'object') return normalizeData(value.result);
    return value;
  }
  return parseObject(value);
}

const PRODUCT_SCHEMA={type:'object',properties:{codigo:{type:'string'},nombre:{type:'string'},marca:{type:'string'},modelo:{type:'string'},categoria:{type:'string'},descripcion:{type:'string'},precio_compra:{type:'string'},precio_venta:{type:'string'}},required:['codigo','nombre','marca','modelo','categoria','descripcion','precio_compra','precio_venta']};
const CATALOG_SCHEMA={type:'object',properties:{items:{type:'array',items:{type:'object',properties:{codigo:{type:'string'},nombre:{type:'string'},marca:{type:'string'},modelo:{type:'string'},categoria:{type:'string'},descripcion:{type:'string'},precio_fuente:{type:'number'},unidad:{type:'string'},unidad_precio:{type:'string'},cantidad_paquete:{type:'number'},presentacion:{type:'string'}},required:['codigo','nombre','marca','modelo','categoria','descripcion','precio_fuente','unidad','unidad_precio','cantidad_paquete','presentacion']}}},required:['items']};
const SERVICE_SCHEMA={type:'object',properties:{tipo:{type:'string'},nombre:{type:'string'},descripcion:{type:'string'},unidad:{type:'string'},precio:{type:'number'}},required:['tipo','nombre','descripcion','unidad','precio']};

const CATALOG_TEXT_PROMPT=`Eres M.A.R.C., extractor profesional de catálogos para inventario empresarial. Lee UNA página de catálogo y devuelve TODOS los productos claramente identificables. Conserva exactamente código/SKU/referencia y modelo. Nunca inventes datos. Si la página es una portada, índice o no contiene productos, devuelve items vacíos. Si existe un precio rotulado PRECIO CAJA, PRECIO DOCENA, PRECIO UNIDAD u otra presentación, ese es precio_fuente y unidad_precio debe ser exactamente CAJA, DOCENA, UND u otra etiqueta visible. cantidad_paquete es el número de unidades indicado en la misma presentación, si existe. No conviertas especificaciones (5A, 65W, 20000mAh, 3.1A, 1000mm, etc.) en precios. Para catálogo PROVEEDOR, precio_fuente es precio de compra. Para catálogo PROPIO, precio_fuente es precio de venta. unidad es la unidad de inventario más fiel. descripcion debe resumir solo especificaciones visibles. marca solo si es visible o claramente indicada en la página. Devuelve SOLO JSON.`;
const CATALOG_VISION_PROMPT=`Eres M.A.R.C., especialista en lectura visual de catálogos comerciales. NO describas la imagen: conviértela en registros de inventario. Lee toda la página con máxima precisión.

REGLAS CRÍTICAS:
1. Detecta TODOS los productos de la página. Puede haber una sola ficha, varias fichas o una tabla con muchos productos.
2. Conserva EXACTAMENTE códigos, SKU y modelos. No confundas letras/números.
3. Identifica el precio SOLO cuando esté claramente rotulado como precio, especialmente PRECIO CAJA, PRECIO DOCENA o PRECIO UNIDAD. Los números de potencia, batería, capacidad, distancia, tamaño, voltaje o amperaje NO son precios.
4. Extrae presentación comercial y cantidad_paquete cuando estén visibles.
5. Si la página es portada/contraportada y no tiene producto, devuelve items: [].
6. Marca solo si es visible. No inventes marcas.
7. Modelo: conserva el modelo/código visible.
8. Categoria práctica para inventario.
9. descripcion solo con especificaciones visibles.
10. No inventes precios ni productos. Si un dato no es visible, usa vacío/0.
11. Devuelve ÚNICAMENTE JSON con {"items":[...]}.
12. Prioriza precisión sobre cantidad de texto.`;

function imageFromBody(raw){const value=typeof raw==='string'?raw.trim():'';if(!value)return '';if(value.startsWith('data:image/'))return value;return `data:image/jpeg;base64,${value.startsWith('data:')?(value.split(',',2)[1]||''):value}`;}

async function analyzeCatalogVision(env,image,tipo='PROVEEDOR',pagina=0){
  try{
    const r=await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct',{
      messages:[
        {role:'system',content:CATALOG_VISION_PROMPT+`\nTipo de catálogo: ${tipo}. Página: ${pagina}.`},
        {role:'user',content:'Lee visualmente TODA la página. Extrae todos los productos visibles. Responde únicamente con el JSON solicitado.'}
      ],
      image,
      max_tokens:1200,
      temperature:0,
      stream:false,
      response_format:{type:'json_schema',json_schema:CATALOG_SCHEMA}
    });
    const d=normalizeData(r?.response||r);
    if(Array.isArray(d.items))return d.items;
    throw new Error('La IA visual no devolvió una lista de productos.');
  }catch(e){
    const msg=String(e?.message||e||'Error desconocido');
    if(/3036|4006|daily free allocation|10,000 neurons|429/i.test(msg))throw new Error('LÍMITE_IA_DIARIO: Cloudflare Workers AI agotó los 10,000 Neurons gratuitos de hoy.');
    throw new Error(msg);
  }
}

async function analyzeCatalogText(env,text,tipo='PROVEEDOR'){
  const prompt=`${CATALOG_TEXT_PROMPT}\nTipo de catálogo: ${tipo}\nContenido de la página:\n${text}`;
  try{
    const r=await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast',{messages:[{role:'system',content:'Eres M.A.R.C. Devuelve exclusivamente el JSON solicitado.'},{role:'user',content:prompt}],max_tokens:1600,temperature:0,response_format:{type:'json_schema',json_schema:CATALOG_SCHEMA}});
    const d=normalizeData(r?.response||r);if(Array.isArray(d.items))return d.items;
    throw new Error('Respuesta sin items');
  }catch(e){
    const msg=String(e?.message||e||'Error desconocido');
    if(/3036|4006|daily free allocation|10,000 neurons|429/i.test(msg))throw new Error('LÍMITE_IA_DIARIO: Cloudflare Workers AI agotó los 10,000 Neurons gratuitos de hoy.');
    throw new Error(`No se pudo analizar el texto del catálogo: ${msg}`);
  }
}

export default {async fetch(request,env){const url=new URL(request.url);
  if(request.method==='POST'&&url.pathname==='/api/analyze-catalog-page'){
    if(!env.AI)return Response.json({error:'Workers AI no está conectado.'},{status:503});
    try{const body=await request.json();const image=imageFromBody(body?.image),tipo=String(body?.tipo||'PROVEEDOR'),pagina=Number(body?.pagina||0);if(!image)return Response.json({error:'Falta la imagen de la página.'},{status:400});if(image.length>12_000_000)return Response.json({error:'La imagen de la página es demasiado grande.'},{status:413});const items=await analyzeCatalogVision(env,image,tipo,pagina);return Response.json({items,model:'llama-3.2-11b-vision-instruct',pagina});}catch(e){const detail=String(e?.message||e||'Error desconocido');const quota=/LÍMITE_IA_DIARIO|3036|4006|daily free allocation|10,000 neurons/i.test(detail);return Response.json({error:quota?'Límite diario de IA alcanzado.':'No se pudo analizar la página.',detail,quota},{status:quota?429:503});}
  }
  if(request.method==='POST'&&url.pathname==='/api/analyze-catalog'){
    if(!env.AI)return Response.json({error:'Workers AI no está conectado.'},{status:503});
    try{const body=await request.json(),text=String(body?.text||'').trim(),tipo=String(body?.tipo||'PROVEEDOR');if(!text)return Response.json({error:'Falta el texto de la página.'},{status:400});const items=await analyzeCatalogText(env,text.slice(0,18000),tipo);return Response.json({items,model:'llama-3.1-8b-instruct-fast'});}catch(e){const detail=String(e?.message||e||'Error desconocido');const quota=/LÍMITE_IA_DIARIO|3036|4006|daily free allocation|10,000 neurons/i.test(detail);return Response.json({error:quota?'Límite diario de IA alcanzado.':'No se pudo analizar el catálogo.',detail,quota},{status:quota?429:500});}
  }
  if(request.method==='POST'&&url.pathname==='/api/analyze-product'){
    if(!env.AI)return Response.json({error:'Workers AI no está conectado.'},{status:503});
    try{const body=await request.json(),image=imageFromBody(body?.image);if(!image)return Response.json({error:'Falta la imagen del producto.'},{status:400});let data={},errors=[];try{const r=await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct',{messages:[{role:'system',content:'Eres un extractor OCR profesional. Lee únicamente información visible del producto. No inventes.'},{role:'user',content:'Extrae codigo, nombre, marca, modelo, categoria, descripcion, precio_compra y precio_venta. Devuelve JSON.'}],image,max_tokens:900,temperature:0,stream:false,response_format:{type:'json_schema',json_schema:PRODUCT_SCHEMA}});data=normalizeData(r?.response||r);}catch(e){errors.push(String(e?.message||e));}let fields=['codigo','nombre','marca','modelo','categoria','descripcion','precio_compra','precio_venta'].filter(k=>String(data?.[k]??'').trim()).length;if(fields<2){try{const r=await env.AI.run('@cf/moondream/moondream3.1-9B-A2B',{task:'query',image,question:'Lee el producto y responde: codigo: ; nombre: ; marca: ; modelo: ; categoria: ; descripcion: ; precio_compra: ; precio_venta:',reasoning:false,temperature:0,max_tokens:900,stream:false});const d=normalizeData(r?.answer||r?.response||r);if(Object.keys(d).length>Object.keys(data).length)data=d;}catch(e){errors.push(String(e?.message||e));}}const count=['codigo','nombre','marca','modelo','categoria','descripcion','precio_compra','precio_venta'].filter(k=>String(data?.[k]??'').trim()).length;if(!count)return Response.json({error:'La IA no pudo leer datos legibles.',detail:errors.join(' | ')},{status:422});return Response.json({text:JSON.stringify(data),fields:count});}catch(e){return Response.json({error:'No se pudo analizar la imagen.',detail:String(e?.message||e)},{status:500});}
  }
  if(request.method==='POST'&&url.pathname==='/api/analyze-service'){
    if(!env.AI)return Response.json({error:'Workers AI no está conectado.'},{status:503});
    try{const body=await request.json(),text=String(body?.text||'').trim();if(!text)return Response.json({error:'Falta la descripción del servicio.'},{status:400});const r=await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast',{messages:[{role:'system',content:'Eres M.A.R.C., especialista en servicios empresariales. Devuelve SOLO JSON.'},{role:'user',content:`Convierte esto en tipo,nombre,descripcion,unidad,precio. No inventes precio. Tipo: CCTV, COMPUTACION, REDES, MANTENIMIENTO, INSTALACION, SOPORTE u OTROS.\n${text}`}],max_tokens:500,temperature:0,response_format:{type:'json_schema',json_schema:SERVICE_SCHEMA}});return Response.json({data:normalizeData(r?.response||r)});}catch(e){return Response.json({error:'No se pudo analizar el servicio.',detail:String(e?.message||e)});}
  }
  if(request.method==='POST'&&url.pathname==='/api/ai'){
    if(!env.AI)return Response.json({error:'Workers AI no está conectado.'},{status:503});
    try{const body=await request.json(),message=String(body?.message||'').trim();if(!message)return Response.json({error:'Falta el mensaje.'},{status:400});const r=await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast',{messages:[{role:'system',content:'Eres M.A.R.C., asistente empresarial. Responde en español, claro y práctico.'},{role:'user',content:message}],max_tokens:700});return Response.json({text:r?.response||'No pude generar una respuesta.'});}catch(e){return Response.json({error:'No se pudo procesar la solicitud de IA.',detail:String(e?.message||e)});}
  }
  return env.ASSETS.fetch(request);
}};
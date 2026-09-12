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
const CATALOG_PROMPT=`Eres M.A.R.C., extractor profesional de catálogos comerciales para inventario empresarial. Analiza UNA página completa y devuelve TODOS los productos claramente visibles. Conserva exactamente código/SKU/referencia y modelo. Nunca inventes datos. Si es portada, índice o no hay productos, devuelve items vacíos. Identifica precios solo cuando estén claramente rotulados como precio, por ejemplo PRECIO CAJA, PRECIO DOCENA o PRECIO UNIDAD. NO conviertas potencia, batería, capacidad, voltaje, amperaje, medidas u otras especificaciones en precio. Extrae presentación y cantidad del paquete si son visibles. Para catálogo PROVEEDOR, precio_fuente es precio de compra; para PROPIO, precio_fuente es precio de venta. Marca solo si es visible. Categoria práctica para inventario. Descripcion solo con información visible. Si un dato no es visible, usa cadena vacía o 0. Devuelve ÚNICAMENTE JSON con {"items":[...]}.`;
function imageFromBody(raw){const value=typeof raw==='string'?raw.trim():'';if(!value)return '';if(value.startsWith('data:image/'))return value;return `data:image/jpeg;base64,${value.startsWith('data:')?(value.split(',',2)[1]||''):value}`;}
function extractGeminiText(data){
  const candidates=data?.candidates||data?.response?.candidates||[];
  for(const c of candidates){const parts=c?.content?.parts||[];const text=parts.map(p=>p?.text||'').join('');if(text)return text;}
  if(typeof data?.text==='string')return data.text;
  return '';
}
async function analyzeCatalogGemini(env,image,tipo='PROVEEDOR',pagina=0){
  if(!env.GEMINI_API_KEY)throw new Error('GEMINI_API_KEY no está configurada en Cloudflare.');
  const prompt=`${CATALOG_PROMPT}\nTipo de catálogo: ${tipo}. Página: ${pagina}.\nLee visualmente toda la página, incluyendo tablas, fichas y texto pequeño. Devuelve solo JSON válido.`;
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='+encodeURIComponent(env.GEMINI_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inline_data:{mime_type:'image/jpeg',data:image.split(',')[1]||image}}]}],generationConfig:{temperature:0,maxOutputTokens:1400,responseMimeType:'application/json',responseSchema:CATALOG_SCHEMA}})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){const msg=data?.error?.message||`HTTP ${r.status}`;if(r.status===429)throw new Error('GEMINI_LIMITE: Gemini alcanzó temporalmente su cuota gratuita.');throw new Error('Gemini: '+msg);}
  const text=extractGeminiText(data);const parsed=parseObject(text);if(Array.isArray(parsed.items))return parsed.items;throw new Error('Gemini no devolvió una lista de productos válida.');
}
async function analyzeCatalogVision(env,image,tipo='PROVEEDOR',pagina=0){
  try{return await analyzeCatalogGemini(env,image,tipo,pagina);}catch(e){
    const msg=String(e?.message||e||'Error desconocido');
    if(/GEMINI_LIMITE/i.test(msg))throw e;
    if(/GEMINI_API_KEY|Gemini:/i.test(msg))throw e;
    try{
      const r=await env.AI.run('@cf/google/gemma-4-26b-a4b-it',{messages:[{role:'system',content:CATALOG_PROMPT+`\nTipo de catálogo: ${tipo}. Página: ${pagina}.`},{role:'user',content:'Lee visualmente TODA la página y extrae todos los productos visibles. Responde únicamente JSON.'}],image,max_tokens:1000,temperature:0,stream:false,chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_schema',json_schema:CATALOG_SCHEMA}});
      const d=normalizeData(r?.response||r);if(Array.isArray(d.items))return d.items;throw new Error('Cloudflare no devolvió items.');
    }catch(cf){const cm=String(cf?.message||cf||'');if(/3036|4006|daily free allocation|10,000 neurons|429/i.test(cm))throw new Error('LÍMITE_IA_DIARIO: Gemini no respondió y Cloudflare Workers AI agotó los 10,000 Neurons gratuitos de hoy.');throw new Error(msg+' | Respaldo Cloudflare: '+cm);}
  }
}
async function analyzeCatalogText(env,text,tipo='PROVEEDOR'){
  const prompt=`${CATALOG_PROMPT}\nTipo de catálogo: ${tipo}\nContenido de la página:\n${text}`;
  try{const r=await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast',{messages:[{role:'system',content:'Eres M.A.R.C. Devuelve exclusivamente el JSON solicitado.'},{role:'user',content:prompt}],max_tokens:1600,temperature:0,response_format:{type:'json_schema',json_schema:CATALOG_SCHEMA}});const d=normalizeData(r?.response||r);if(Array.isArray(d.items))return d.items;throw new Error('Respuesta sin items');}catch(e){const msg=String(e?.message||e||'Error desconocido');if(/3036|4006|daily free allocation|10,000 neurons|429/i.test(msg))throw new Error('LÍMITE_IA_DIARIO: Cloudflare Workers AI agotó los 10,000 Neurons gratuitos de hoy.');throw new Error(`No se pudo analizar el texto del catálogo: ${msg}`);}
}
export default {async fetch(request,env){const url=new URL(request.url);
  if(request.method==='POST'&&url.pathname==='/api/analyze-catalog-page'){
    try{const body=await request.json();const image=imageFromBody(body?.image),tipo=String(body?.tipo||'PROVEEDOR'),pagina=Number(body?.pagina||0);if(!image)return Response.json({error:'Falta la imagen de la página.'},{status:400});if(image.length>12_000_000)return Response.json({error:'La imagen de la página es demasiado grande.'},{status:413});const items=await analyzeCatalogVision(env,image,tipo,pagina);return Response.json({items,model:'gemini-2.5-flash',pagina});}catch(e){const detail=String(e?.message||e||'Error desconocido');const quota=/GEMINI_LIMITE|LÍMITE_IA_DIARIO|3036|4006|daily free allocation|10,000 neurons/i.test(detail);return Response.json({error:quota?'Límite de IA alcanzado.':'No se pudo analizar la página.',detail,quota},{status:quota?429:503});}
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
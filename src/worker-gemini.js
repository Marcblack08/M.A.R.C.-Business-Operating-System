import base from './worker.js';

const MODEL='gemini-3.6-flash';
const SCHEMA={type:'object',properties:{items:{type:'array',items:{type:'object',properties:{codigo:{type:'string'},nombre:{type:'string'},marca:{type:'string'},modelo:{type:'string'},categoria:{type:'string'},descripcion:{type:'string'},precio_fuente:{type:'number'},unidad:{type:'string'},unidad_precio:{type:'string'},cantidad_paquete:{type:'number'},presentacion:{type:'string'}},required:['codigo','nombre','marca','modelo','categoria','descripcion','precio_fuente','unidad','unidad_precio','cantidad_paquete','presentacion']}}},required:['items']};
const PROMPT='Eres M.A.R.C., extractor profesional de catálogos comerciales para inventario empresarial. Lee TODA esta página. Extrae TODOS los productos claramente visibles, incluso si hay varios productos o una tabla. Conserva exactamente código/SKU/referencia y modelo. Nunca inventes datos. Identifica precios solo cuando estén claramente rotulados como PRECIO CAJA, PRECIO DOCENA, PRECIO UNIDAD u otra presentación visible. NO conviertas potencia, batería, capacidad, voltaje, amperaje o medidas en precios. Extrae marca solo si es visible. Extrae presentación y cantidad del paquete si aparecen. Para PROVEEDOR, precio_fuente es precio de compra; para PROPIO, precio_fuente es precio de venta. Si no hay productos, devuelve items vacíos. Devuelve únicamente JSON válido.';
function image(raw){const v=String(raw||'').trim();if(!v)return '';return v.startsWith('data:image/')?v.split(',')[1]||'':v.startsWith('data:')?(v.split(',',2)[1]||''):v;}
function parse(value){if(value&&typeof value==='object'){if(value.result&&typeof value.result==='object')return parse(value.result);if(value.response&&typeof value.response==='object')return parse(value.response);return value}const s=String(value||'').replace(/^```json/i,'').replace(/```$/,'').trim();try{return JSON.parse(s)}catch{}const m=s.match(/\{[\s\S]*\}/);try{return m?JSON.parse(m[0]):{}}catch{return {}}}
function geminiText(data){return(data?.candidates||[]).flatMap(c=>c?.content?.parts||[]).map(p=>p?.text||'').join('')||data?.text||''}
async function gemini(env,img,tipo,pagina){
 if(!env.GEMINI_API_KEY)throw Error('GEMINI_API_KEY no está configurada.');
 const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:`${PROMPT}\nTipo: ${tipo}. Página: ${pagina}.`},{inline_data:{mime_type:'image/jpeg',data:img}}]}],generationConfig:{maxOutputTokens:1400,responseMimeType:'application/json',responseSchema:SCHEMA}})});
 const d=await r.json().catch(()=>({}));
 if(!r.ok){const e=new Error(d?.error?.message||`HTTP ${r.status}`);e.status=r.status;throw e}
 const out=parse(geminiText(d));if(!Array.isArray(out.items))throw Error('Gemini no devolvió items.');return out.items;
}
async function cloudflare(env,img,tipo,pagina){
 if(!env.AI)throw Error('Workers AI no está conectado.');
 const r=await env.AI.run('@cf/google/gemma-4-26b-a4b-it',{messages:[{role:'system',content:PROMPT+`\nTipo: ${tipo}. Página: ${pagina}.`},{role:'user',content:'Lee toda la página y extrae todos los productos visibles. Responde únicamente JSON.'}],image:img,max_tokens:1200,stream:false,chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_schema',json_schema:SCHEMA}});
 const out=parse(r?.response||r);if(!Array.isArray(out.items))throw Error('Cloudflare AI no devolvió items.');return out.items;
}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);
 if(request.method==='POST'&&url.pathname==='/api/analyze-catalog-page'){
  try{
   const body=await request.json(),img=image(body?.image),tipo=String(body?.tipo||'PROVEEDOR'),pagina=Number(body?.pagina||0);
   if(!img)return Response.json({error:'Falta la imagen de la página.'},{status:400});
   let items,model=MODEL;
   try{items=await gemini(env,img,tipo,pagina)}catch(e){
    if(Number(e?.status)!==429 && !/quota|rate.?limit|resource.?exhausted|temporar/i.test(String(e?.message||e)))throw e;
    items=await cloudflare(env,img,tipo,pagina);model='@cf/google/gemma-4-26b-a4b-it';
   }
   return Response.json({items,model,pagina});
  }catch(e){const detail=String(e?.message||e||'Error desconocido');return Response.json({error:'No se pudo analizar la página.',detail,quota:/quota|rate.?limit|resource.?exhausted|3036|429/i.test(detail)},{status:503})}
 }
 return base.fetch(request,env,ctx);
}};
import base from './worker.js';

const MODEL='gemini-3.6-flash';
const OPENROUTER_MODEL='openrouter/free';
const CF_MODEL='@cf/google/gemma-4-26b-a4b-it';
const SCHEMA={type:'object',properties:{items:{type:'array',items:{type:'object',properties:{codigo:{type:'string'},nombre:{type:'string'},marca:{type:'string'},modelo:{type:'string'},categoria:{type:'string'},descripcion:{type:'string'},precio_fuente:{type:'number'},unidad:{type:'string'},unidad_precio:{type:'string'},cantidad_paquete:{type:'number'},presentacion:{type:'string'}},required:['codigo','nombre','marca','modelo','categoria','descripcion','precio_fuente','unidad','unidad_precio','cantidad_paquete','presentacion']}}},required:['items']};
const PROMPT='Eres M.A.R.C., extractor profesional de catálogos comerciales para inventario empresarial. Lee TODA esta página. Extrae TODOS los productos claramente visibles, incluso si hay varios productos o una tabla. Conserva exactamente código/SKU/referencia y modelo. Nunca inventes datos. Identifica precios solo cuando estén claramente rotulados como PRECIO CAJA, PRECIO DOCENA, PRECIO UNIDAD u otra presentación visible. NO conviertas potencia, batería, capacidad, voltaje, amperaje o medidas en precios. Extrae marca solo si es visible. Extrae presentación y cantidad del paquete si aparecen. Para PROVEEDOR, precio_fuente es precio de compra; para PROPIO, precio_fuente es precio de venta. Si no hay productos, devuelve items vacíos. Devuelve únicamente JSON válido.';
function image(raw){const v=String(raw||'').trim();if(!v)return '';return v.startsWith('data:image/')?v.split(',')[1]||'':v.startsWith('data:')?(v.split(',',2)[1]||''):v;}
function text(data){return (data?.candidates||[]).flatMap(c=>c?.content?.parts||[]).map(p=>p?.text||'').join('')||data?.text||'';}
function parse(value){const s=String(value||'').trim().replace(/^```json/i,'').replace(/```$/,'').trim();try{return JSON.parse(s)}catch{}const m=s.match(/\{[\s\S]*\}/);if(m)try{return JSON.parse(m[0])}catch{}return {}}
async function gemini(env,img,tipo,pagina){
 if(!env.GEMINI_API_KEY)throw new Error('GEMINI_API_KEY no está configurada en Cloudflare.');
 const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:`${PROMPT}\nTipo de catálogo: ${tipo}. Página: ${pagina}.`},{inline_data:{mime_type:'image/jpeg',data:img}}]}],generationConfig:{maxOutputTokens:1400,responseMimeType:'application/json',responseSchema:SCHEMA}})});
 const d=await r.json().catch(()=>({}));if(!r.ok){const m=d?.error?.message||`HTTP ${r.status}`;const e=new Error(m);e.quota=r.status===429;throw e}const p=parse(text(d));if(!Array.isArray(p.items))throw new Error('Gemini no devolvió una lista de productos válida.');return p.items;
}
async function openrouter(env,img,tipo,pagina){
 if(!env.OPENROUTER_API_KEY)throw new Error('OPENROUTER_API_KEY no está configurada en Cloudflare.');
 const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'Authorization':`Bearer ${env.OPENROUTER_API_KEY}`,'Content-Type':'application/json','HTTP-Referer':'https://m-a-r-c--business-operating-system.marcjjbeltran08.workers.dev','X-Title':'M.A.R.C. Business Operating System'},body:JSON.stringify({model:OPENROUTER_MODEL,messages:[{role:'user',content:[{type:'text',text:`${PROMPT}\nTipo de catálogo: ${tipo}. Página: ${pagina}.`},{type:'image_url',image_url:{url:`data:image/jpeg;base64,${img}`}}]}],temperature:0,max_tokens:1400,response_format:{type:'json_schema',json_schema:{name:'catalog_products',strict:true,schema:SCHEMA}}})});
 const d=await r.json().catch(()=>({}));if(!r.ok){const m=d?.error?.message||`HTTP ${r.status}`;const e=new Error(m);e.quota=r.status===429;throw e}const p=parse(d?.choices?.[0]?.message?.content||'');if(!Array.isArray(p.items))throw new Error('OpenRouter no devolvió una lista de productos válida.');return p.items;
}
async function cloudflare(env,img,tipo,pagina){
 if(!env.AI)throw new Error('Workers AI no está conectado.');
 const r=await env.AI.run(CF_MODEL,{messages:[{role:'system',content:`${PROMPT}\nTipo: ${tipo}. Página: ${pagina}.`},{role:'user',content:'Analiza visualmente TODA la página y extrae todos los productos visibles. Responde únicamente JSON.'}],image:img,max_tokens:1000,stream:false,chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_schema',json_schema:SCHEMA}});
 const p=parse(r?.response||r);if(!Array.isArray(p.items))throw new Error('Cloudflare no devolvió una lista de productos válida.');return p.items;
}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);
 if(request.method==='POST'&&url.pathname==='/api/analyze-catalog-page'){
  try{
   const body=await request.json();const img=image(body?.image),tipo=String(body?.tipo||'PROVEEDOR'),pagina=Number(body?.pagina||0);
   if(!img)return Response.json({error:'Falta la imagen de la página.'},{status:400});
   try{return Response.json({items:await gemini(env,img,tipo,pagina),model:MODEL,pagina,provider:'gemini'})}catch(g){
    try{return Response.json({items:await openrouter(env,img,tipo,pagina),model:OPENROUTER_MODEL,pagina,provider:'openrouter'})}catch(o){
     try{return Response.json({items:await cloudflare(env,img,tipo,pagina),model:CF_MODEL,pagina,backup:true,provider:'cloudflare'})}catch(c){
      const gm=String(g?.message||g),om=String(o?.message||o),cm=String(c?.message||c);const quota=/quota|429|rate limit|daily free allocation|10,000 neurons|3036|4006/i.test(gm)||/quota|429|rate limit/i.test(om)||/quota|429|daily free allocation|10,000 neurons|3036|4006/i.test(cm)||g?.quota||o?.quota;
      return Response.json({error:quota?'Límite de IA alcanzado.':'No se pudo analizar la página.',detail:`Gemini: ${gm} | OpenRouter: ${om} | Cloudflare: ${cm}`,quota},{status:quota?429:503});
     }
    }
   }
  }catch(e){return Response.json({error:'No se pudo analizar la página.',detail:String(e?.message||e)},{status:503})}
 }
 return base.fetch(request,env,ctx);
}};
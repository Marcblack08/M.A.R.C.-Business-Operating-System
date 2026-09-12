import base from './worker.js';

const MODEL='gemini-3.6-flash';
const SCHEMA={type:'object',properties:{items:{type:'array',items:{type:'object',properties:{codigo:{type:'string'},nombre:{type:'string'},marca:{type:'string'},modelo:{type:'string'},categoria:{type:'string'},descripcion:{type:'string'},precio_fuente:{type:'number'},unidad:{type:'string'},unidad_precio:{type:'string'},cantidad_paquete:{type:'number'},presentacion:{type:'string'}},required:['codigo','nombre','marca','modelo','categoria','descripcion','precio_fuente','unidad','unidad_precio','cantidad_paquete','presentacion']}}},required:['items']};
const PROMPT='Eres M.A.R.C., extractor profesional de catálogos comerciales para inventario empresarial. Lee TODA esta página. Extrae TODOS los productos claramente visibles, incluso si hay varios productos o una tabla. Conserva exactamente código/SKU/referencia y modelo. Nunca inventes datos. Identifica precios solo cuando estén claramente rotulados como PRECIO CAJA, PRECIO DOCENA, PRECIO UNIDAD u otra presentación visible. NO conviertas potencia, batería, capacidad, voltaje, amperaje o medidas en precios. Extrae marca solo si es visible. Extrae presentación y cantidad del paquete si aparecen. Para PROVEEDOR, precio_fuente es precio de compra; para PROPIO, precio_fuente es precio de venta. Si no hay productos, devuelve items vacíos. Devuelve únicamente JSON válido.';
function image(raw){const v=String(raw||'').trim();if(!v)return '';return v.startsWith('data:image/')?v.split(',')[1]||'':v.startsWith('data:')?(v.split(',',2)[1]||''):v;}
function text(data){return (data?.candidates||[]).flatMap(c=>c?.content?.parts||[]).map(p=>p?.text||'').join('')||data?.text||'';}
export default {async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method==='POST'&&url.pathname==='/api/analyze-catalog-page'){
    try{
      if(!env.GEMINI_API_KEY)throw new Error('GEMINI_API_KEY no está configurada en Cloudflare.');
      const body=await request.json();
      const img=image(body?.image); const tipo=String(body?.tipo||'PROVEEDOR'); const pagina=Number(body?.pagina||0);
      if(!img)return Response.json({error:'Falta la imagen de la página.'},{status:400});
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:`${PROMPT}\nTipo de catálogo: ${tipo}. Página: ${pagina}.`},{inline_data:{mime_type:'image/jpeg',data:img}}]}],generationConfig:{maxOutputTokens:1400,responseMimeType:'application/json',responseSchema:SCHEMA}})});
      const data=await r.json().catch(()=>({}));
      if(!r.ok){const msg=data?.error?.message||`HTTP ${r.status}`;if(r.status===429)throw new Error('GEMINI_LIMITE: Gemini alcanzó temporalmente su cuota gratuita.');throw new Error('Gemini: '+msg);}
      let parsed={};try{parsed=JSON.parse(text(data).replace(/^```json/i,'').replace(/```$/,'').trim());}catch{throw new Error('Gemini no devolvió JSON válido.');}
      if(!Array.isArray(parsed.items))throw new Error('Gemini no devolvió una lista de productos válida.');
      return Response.json({items:parsed.items,model:MODEL,pagina});
    }catch(e){const detail=String(e?.message||e||'Error desconocido');const quota=/GEMINI_LIMITE/i.test(detail);return Response.json({error:quota?'Límite gratuito de Gemini alcanzado.':'No se pudo analizar la página.',detail,quota},{status:quota?429:503});}
  }
  return base.fetch(request,env,ctx);
}};
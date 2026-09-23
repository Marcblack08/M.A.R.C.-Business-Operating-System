const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store",...headers}});
const SYSTEM_MODEL="@cf/meta/llama-3.1-8b-instruct-fast";
const GEMINI_MODEL_DEFAULT="gemini-3.8-flash";

async function geminiGenerate(env,input,options={}){
  const messages=Array.isArray(input)?input:(input?.messages||[]);
  const apiKey=env.GEMINI_API_KEY||env.GEMINI_API_KEY2;
  if(!apiKey)throw Object.assign(new Error("GEMINI_API_KEY no está configurada en el Worker."),{status:503});

  const primary=env.GEMINI_MODEL||GEMINI_MODEL_DEFAULT;
  const fallback1=env.GEMINI_MODEL_FALLBACK||"gemini-3.7-flash";
  const fallback2=env.GEMINI_MODEL_FALLBACK2||"gemini-3.6-flash";
  const models=[...new Set([primary,fallback1,fallback2].filter(Boolean))];

  const system=messages.filter(m=>m.role==="system").map(m=>String(m.content||"")).join("\n\n");
  const contents=messages.filter(m=>m.role!=="system").map(m=>({
    role:m.role==="assistant"||m.role==="model"?"model":"user",
    parts:[{text:String(m.content||"")}]
  }));

  const body={
    systemInstruction:system?{parts:[{text:system}]}:undefined,
    contents,
    generationConfig:{
      ...(options.maxTokens?{maxOutputTokens:options.maxTokens}:{}),
      ...(options.json?{responseMimeType:"application/json"}:{})
    }
  };
  if(!body.systemInstruction)delete body.systemInstruction;

  const transient=[429,500,502,503,504,529];
  let lastError=null;

  for(const model of models){
    for(const key of [apiKey,env.GEMINI_API_KEY2].filter((x,i,a)=>x&&a.indexOf(x)===i)){
      try{
        const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
          method:"POST",
          headers:{"content-type":"application/json","x-goog-api-key":key},
          body:JSON.stringify(body)
        });
        const raw=await r.text();
        let data=null;try{data=raw?JSON.parse(raw):null}catch{data=raw}
        if(r.ok)return data;
        const err=new Error(data?.error?.message||("Gemini API error "+r.status));
        err.status=r.status;err.details=data;err.model=model;
        lastError=err;
        if(!transient.includes(Number(r.status)))throw err;
      }catch(err){
        lastError=err;
        if(!transient.includes(Number(err?.status)))throw err;
      }
    }
  }

  throw lastError||Object.assign(new Error("Gemini no está disponible temporalmente."),{status:503});
}

function corsHeaders(request,env){
  const origin=request.headers.get("Origin")||"";
  const requestOrigin=new URL(request.url).origin;
  const configured=String(env?.ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
  const allowed=new Set([requestOrigin,...configured]);
  const headers={
    "access-control-allow-headers":"authorization,content-type",
    "access-control-allow-methods":"GET,POST,OPTIONS",
    "vary":"Origin",
    "x-content-type-options":"nosniff",
    "x-frame-options":"DENY",
    "referrer-policy":"no-referrer",
    "permissions-policy":"geolocation=(),camera=(self),microphone=()"
  };
  if(origin&&allowed.has(origin))headers["access-control-allow-origin"]=origin;
  return headers;
}

function safeClientError(err,fallback="Ocurrió un error al procesar la solicitud."){
  const status=Number(err?.status||500);
  if(status>=400&&status<500&&status!==429){
    const message=String(err?.message||"").trim();
    if(message&&message.length<=240)return message;
  }
  if(status===429)return "Demasiadas solicitudes. Intenta nuevamente en unos minutos.";
  return fallback;
}

async function rateLimit(env,key,maxHits,windowSeconds){
  const adminToken=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  if(!adminToken)return true;
  try{
    const rows=await sb(env,adminToken,"rpc/marc_rate_limit",{method:"POST",body:{p_key:String(key).slice(0,200),p_max_hits:maxHits,p_window_seconds:windowSeconds}});
    return rows===true;
  }catch(err){
    return true;
  }
}
function requestIp(request){
  return String(request.headers.get("CF-Connecting-IP")||request.headers.get("X-Forwarded-For")||"unknown").split(",")[0].trim().slice(0,80);
}

async function authUser(request,env){
  const auth=request.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer "))throw Object.assign(new Error("No autenticado"),{status:401});
  const token=auth.slice(7).trim();
  if(!token)throw Object.assign(new Error("No autenticado"),{status:401});
  const r=await fetch(env.SUPABASE_URL+"/auth/v1/user",{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:"Bearer "+token}});
  if(!r.ok)throw Object.assign(new Error("Sesión inválida o vencida"),{status:401});
  const user=await r.json();
  if(!user?.id)throw Object.assign(new Error("Sesión inválida"),{status:401});
  return {token,user};
}

function isAdminToken(env,token){
  return Boolean(token&&((env.SUPABASE_SECRET_KEY&&token===env.SUPABASE_SECRET_KEY)||(env.SUPABASE_SERVICE_ROLE_KEY&&token===env.SUPABASE_SERVICE_ROLE_KEY)));
}
async function sb(env,token,path,options={}){
  const admin=isAdminToken(env,token);
  const headers={
    apikey:admin?token:env.SUPABASE_PUBLISHABLE_KEY,
    "content-type":"application/json",
    Prefer:options.prefer||"return=representation"
  };
  // Las claves privilegiadas de Supabase (service_role o sb_secret_*) deben
  // autenticarse de forma consistente en REST. Esto evita que el portal
  // termine entrando como anon/authenticated y reciba "permission denied".
  if(admin)headers.Authorization="Bearer "+token;
  else headers.Authorization="Bearer "+token;
  const r=await fetch(env.SUPABASE_URL+"/rest/v1/"+path,{
    method:options.method||"GET",
    headers,
    body:options.body===undefined?undefined:JSON.stringify(options.body)
  });
  const raw=await r.text();
  let data=null;try{data=raw?JSON.parse(raw):null}catch{data=raw}
  if(!r.ok)throw Object.assign(new Error(data?.message||data?.hint||data?.details||"Error de datos"),{status:r.status,details:data});
  return data;
}

function cleanQ(value){
  return String(value||"").replace(/[^0-9A-Za-zÁÉÍÓÚáéíóúÑñÜü._ -]/g," ").replace(/\s+/g," ").trim().slice(0,60);
}
function orIlike(fields,q){
  const x=cleanQ(q).replace(/[*()%_,]/g," ");
  return "("+fields.map(f=>f+".ilike.*"+x+"*").join(",")+")";
}

async function searchClients(env,token,userId,query){
  const url=new URL(env.SUPABASE_URL+"/rest/v1/marc_clients");
  url.searchParams.set("select","id,name,document_type,document_number,contact_name,email,phone,address,notes");
  url.searchParams.set("user_id","eq."+userId);
  if(query && /^[0-9a-f-]{36}$/i.test(String(query)))url.searchParams.set("id","eq."+query);
  else if(query)url.searchParams.set("or",orIlike(["name","contact_name","email","phone","document_number"],query));
  url.searchParams.set("order","name.asc");
  url.searchParams.set("limit","8");
  return sb(env,token,url.pathname.slice("/rest/v1/".length)+url.search);
}

async function searchInventory(env,token,userId,query,limit=8){
  const url=new URL(env.SUPABASE_URL+"/rest/v1/marc_inventory");
  url.searchParams.set("select","id,name,sku,brand,model,category,unit,cost,price,stock,min_stock");
  url.searchParams.set("user_id","eq."+userId);
  url.searchParams.set("active","eq.true");
  if(query && /^[0-9a-f-]{36}$/i.test(String(query)))url.searchParams.set("id","eq."+query);
  else if(query)url.searchParams.set("or",orIlike(["name","sku","brand","model","category"],query));
  url.searchParams.set("order","name.asc");
  url.searchParams.set("limit",String(Math.max(1,Math.min(100,Number(limit)||8))));
  return sb(env,token,url.pathname.slice("/rest/v1/".length)+url.search);
}
async function countInventory(env,token,userId){
  const admin=isAdminToken(env,token);
  const headers={apikey:admin?token:env.SUPABASE_PUBLISHABLE_KEY,"content-type":"application/json",Prefer:"count=exact"};
  if(!admin)headers.Authorization="Bearer "+token;
  else if(env.SUPABASE_SERVICE_ROLE_KEY&&token===env.SUPABASE_SERVICE_ROLE_KEY)headers.Authorization="Bearer "+token;
  const url=new URL(env.SUPABASE_URL+"/rest/v1/marc_inventory");
  url.searchParams.set("select","id");url.searchParams.set("user_id","eq."+userId);url.searchParams.set("active","eq.true");url.searchParams.set("limit","1");
  const r=await fetch(url.toString(),{headers});
  if(!r.ok){const raw=await r.text();let data=null;try{data=raw?JSON.parse(raw):null}catch{data=raw}throw Object.assign(new Error(data?.message||data?.hint||"No se pudo contar el inventario."),{status:r.status,details:data});}
  const range=r.headers.get("content-range")||"";
  const match=range.match(/\/([0-9]+)$/);
  if(match)return Number(match[1]);
  const rows=await r.json().catch(()=>[]);
  return Array.isArray(rows)?rows.length:0;
}
async function inventoryInsight(env,token,userId,kind){
  const count=await countInventory(env,token,userId);
  const url=new URL(env.SUPABASE_URL+"/rest/v1/marc_inventory");
  url.searchParams.set("select","id,name,sku,brand,model,category,unit,cost,price,stock,min_stock");
  url.searchParams.set("user_id","eq."+userId);url.searchParams.set("active","eq.true");
  if(kind==="OUT_OF_STOCK")url.searchParams.set("stock","eq.0");
  if(kind==="MOST_EXPENSIVE")url.searchParams.set("order","price.desc.nullslast,name.asc");
  else if(kind==="CHEAPEST")url.searchParams.set("order","price.asc.nullslast,name.asc");
  else if(kind==="HIGHEST_STOCK")url.searchParams.set("order","stock.desc.nullslast,name.asc");
  else if(kind==="LOWEST_STOCK")url.searchParams.set("order","stock.asc.nullslast,name.asc");
  else url.searchParams.set("order","name.asc");
  url.searchParams.set("limit","8");
  const items=await sb(env,token,url.pathname.slice("/rest/v1/".length)+url.search);
  return {kind,count,items:Array.isArray(items)?items:[]};
}

async function listQuotes(env,token,userId){
  const url=new URL(env.SUPABASE_URL+"/rest/v1/marc_quotes");
  url.searchParams.set("select","id,number,title,status,total,client_id,created_at");
  url.searchParams.set("user_id","eq."+userId);
  url.searchParams.set("order","created_at.desc");
  url.searchParams.set("limit","10");
  return sb(env,token,url.pathname.slice("/rest/v1/".length)+url.search);
}

async function searchQuotes(env,token,userId,query,limit=10){
  const url=new URL(env.SUPABASE_URL+"/rest/v1/marc_quotes");
  url.searchParams.set("select","id,number,title,status,total,client_id,created_at");
  url.searchParams.set("user_id","eq."+userId);
  url.searchParams.set("deleted_at","is.null");
  if(query){
    const q=String(query).replace(/[,*()]/g," ").trim().slice(0,80);
    url.searchParams.set("or","number.ilike.*"+q+"*,title.ilike.*"+q+"*");
  }
  url.searchParams.set("order","created_at.desc");
  url.searchParams.set("limit",String(Math.max(1,Math.min(30,Number(limit)||10))));
  return sb(env,token,url.pathname.slice("/rest/v1/".length)+url.search);
}
async function searchQuotesByClient(env,token,userId,clientId,limit=10){
  const url=new URL(env.SUPABASE_URL+"/rest/v1/marc_quotes");
  url.searchParams.set("select","id,number,title,status,total,client_id,created_at");
  url.searchParams.set("user_id","eq."+userId);
  url.searchParams.set("client_id","eq."+encodeURIComponent(clientId));
  url.searchParams.set("deleted_at","is.null");
  url.searchParams.set("order","created_at.desc");
  url.searchParams.set("limit",String(Math.max(1,Math.min(30,Number(limit)||10))));
  return sb(env,token,url.pathname.slice("/rest/v1/".length)+url.search);
}
async function createClient(env,token,userId,p,source="AI_AGENT"){
  if(!p?.name?.trim())return {status:"NEEDS_INPUT",message:"Necesito el nombre o razón social del cliente."};
  const dup=await searchClients(env,token,userId,p.name.trim());
  if(dup.length===1 && String(dup[0].name).toLowerCase()===p.name.trim().toLowerCase()){
    return {status:"EXISTS",client:dup[0]};
  }
  const rows=await sb(env,token,"marc_clients",{method:"POST",body:{
    user_id:userId,name:p.name.trim(),document_type:p.document_type||"OTRO",
    document_number:p.document_number||null,contact_name:p.contact_name||null,
    phone:p.phone||null,email:p.email||null,address:p.address||null,notes:p.notes||null
  }});
  const client=rows?.[0];
  if(client)await audit(env,token,userId,"CLIENT",client.id,"CREATE",{},source);
  return {status:"CREATED",client};
}

async function resolveOneClient(env,token,userId,query){
  if(!query)return {status:"NONE"};
  const rows=await searchClients(env,token,userId,query);
  if(rows.length===0)return {status:"NOT_FOUND",query};
  if(rows.length>1)return {status:"AMBIGUOUS",query,options:rows.slice(0,5).map(x=>({id:x.id,name:x.name,phone:x.phone,email:x.email}))};
  return {status:"FOUND",client:rows[0]};
}

async function resolveInventory(env,token,userId,query){
  const rows=await searchInventory(env,token,userId,query);
  if(rows.length===0)return {status:"NOT_FOUND",query};
  if(rows.length>1){
    const exact=rows.filter(x=>String(x.name).toLowerCase()===String(query||"").toLowerCase());
    if(exact.length===1)return {status:"FOUND",item:exact[0]};
    return {status:"AMBIGUOUS",query,options:rows.slice(0,5).map(x=>({id:x.id,name:x.name,brand:x.brand,model:x.model,unit:x.unit,cost:x.cost,price:x.price,stock:x.stock}))};
  }
  return {status:"FOUND",item:rows[0]};
}

async function getQuoteForEdit(env,token,userId,query){
  const q=String(query||"").trim();
  if(!q)return {status:"NOT_FOUND"};
  const hit=await searchQuotes(env,token,userId,q,5);
  const rows=Array.isArray(hit)?hit:[];
  if(!rows.length)return {status:"NOT_FOUND",query:q};
  const exact=rows.filter(x=>String(x.number||"").toLowerCase()===q.toLowerCase());
  if(rows.length>1&&!exact.length)return {status:"AMBIGUOUS",query:q,quotes:rows};
  const quote=exact[0]||rows[0];
  const url=new URL(env.SUPABASE_URL+"/rest/v1/marc_quote_items");
  url.searchParams.set("select","id,inventory_id,item_type,name,description,quantity,unit,unit_price,cost");
  url.searchParams.set("user_id","eq."+userId);
  url.searchParams.set("quote_id","eq."+quote.id);
  url.searchParams.set("order","created_at.asc");
  const items=await sb(env,token,url.pathname.slice("/rest/v1/".length)+url.search);
  let client=null;
  if(quote.client_id){
    const cr=await sb(env,token,"marc_clients?select=id,name,phone,email,address&id=eq."+encodeURIComponent(quote.client_id)+"&user_id=eq."+encodeURIComponent(userId)+"&limit=1").catch(()=>[]);
    client=Array.isArray(cr)?cr[0]||null:null;
  }
  return {status:"FOUND",quote,client,items:Array.isArray(items)?items:[]};
}

async function createQuote(env,token,userId,p,source="AI_AGENT"){
  const items=Array.isArray(p?.items)?p.items:[];
  if(!items.length)return {status:"NEEDS_INPUT",message:"Necesito al menos una partida para crear la cotización."};
  let client={status:"NONE"};
  if(p.client_id){
    const rows=await sb(env,token,"marc_clients?select=id,name,phone,email,address&id=eq."+encodeURIComponent(p.client_id)+"&user_id=eq."+encodeURIComponent(userId)+"&limit=1").catch(()=>[]);
    if(Array.isArray(rows)&&rows[0])client={status:"FOUND",client:rows[0]}; else return {status:"NEEDS_INPUT",field:"client_id",message:"No encontré el cliente asociado a la cotización."};
  }else{
    client=await resolveOneClient(env,token,userId,p.client_query||"");
    if(client.status==="AMBIGUOUS"||client.status==="NOT_FOUND")return {status:"NEEDS_INPUT",field:"client_query",detail:client};
  }
  const resolved=[];
  const taxEnabled=p.tax_enabled===undefined?true:Boolean(p.tax_enabled);
  const taxIncluded=Boolean(p.tax_included)&&taxEnabled;
  const taxRate=Number(p.tax_rate||18);
  if(!Number.isFinite(taxRate)||taxRate<0||taxRate>100)return {status:"NEEDS_INPUT",field:"tax_rate",message:"La tasa de impuesto debe estar entre 0% y 100%."};
  for(const raw of items){
    const qty=Math.max(0.01,Number(raw.quantity||1));
    const rawPrice=Number(raw.unit_price);
    const priceIsTotal=Boolean(raw.price_is_total);
    const grossPrice=Number(raw.gross_unit_price);
    const suppliedPrice=Number.isFinite(grossPrice)&&grossPrice>0?grossPrice:rawPrice;
    const normalizedUnit=taxIncluded&&!p.prices_are_net&&Number.isFinite(suppliedPrice)&&suppliedPrice>0?suppliedPrice/(1+taxRate/100):suppliedPrice;
    const unitPrice=priceIsTotal?normalizedUnit/qty:normalizedUnit;
    if(!Number.isFinite(unitPrice)||unitPrice<=0){
      return {status:"NEEDS_INPUT",field:"price",item:raw,message:"Indícame un precio válido para «"+String(raw.name||raw.description||"la partida")+"»."};
    }
    if(String(raw.type||"").toUpperCase()==="PRODUCTO"){
      const hit=await resolveInventory(env,token,userId,raw.inventory_query||raw.name||"");
      if(hit.status!=="FOUND")return {status:"NEEDS_INPUT",field:"inventory",item:raw,detail:hit};
      const it=hit.item;
      const price=(raw.unit_price===null||raw.unit_price===undefined)?Number(it.price||0):unitPrice;
      if(!Number.isFinite(price)||price<=0)return {status:"NEEDS_INPUT",field:"product_price",item:raw,message:"El producto «"+String(it.name||raw.name||"Producto")+"» no tiene un precio válido. Indícame el precio para esta cotización."};
      resolved.push({inventory_id:it.id,item_type:"PRODUCTO",name:it.name,description:raw.description||null,quantity:qty,unit:it.unit||"UND",unit_price:Math.max(0,price),gross_unit_price:taxIncluded?suppliedPrice:null,cost:Number(it.cost||0)});
    }else{
      const price=unitPrice;
      resolved.push({inventory_id:null,item_type:"TRABAJO",name:String(raw.name||"Trabajo"),description:raw.description||null,quantity:qty,unit:raw.unit||"UND",unit_price:price,gross_unit_price:taxIncluded?suppliedPrice:null,cost:Number(raw.cost||0)});
    }
  }
  const payload={
    p_quote_id:p.quote_id||null,
    p_client_id:client.status==="FOUND"?client.client.id:null,
    p_title:p.title||"Cotización",
    p_status:p.status||"BORRADOR",
    p_tax_enabled:taxEnabled,
    p_tax_rate:taxRate,
    p_notes:p.notes||null,
    p_items:resolved,p_source:source
  };
  try{
    const quote=await sb(env,token,"rpc/marc_save_quote",{method:"POST",body:payload});
    const q=Array.isArray(quote)?quote[0]:quote;
    if(!q)throw new Error("No se pudo crear la cotización.");
    return {status:"CREATED",quote:q,client:client.status==="FOUND"?client.client:null,items:resolved};
  }catch(e){
    const m=String(e?.message||"");
    if(m.includes("TRIAL_QUOTE_LIMIT"))return {status:"LIMIT_REACHED",message:"Llegaste al límite de 5 cotizaciones de la prueba gratuita."};
    if(m.includes("TRIAL_EXPIRED"))return {status:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."};
    throw e;
  }
}

async function adjustInventory(env,token,userId,p,source="AI_AGENT"){
  const hit=await resolveInventory(env,token,userId,p.inventory_query||"");
  if(hit.status!=="FOUND")return {status:"NEEDS_INPUT",field:"inventory",detail:hit};
  const quantity=Number(p.quantity);
  if(!Number.isFinite(quantity)||quantity<=0)return {status:"NEEDS_INPUT",field:"quantity",message:"Indícame una cantidad mayor que cero."};
  const type=String(p.type||"").toUpperCase();
  if(!["ENTRADA","SALIDA","AJUSTE"].includes(type))return {status:"NEEDS_INPUT",field:"type",message:"Indícame si es ENTRADA, SALIDA o AJUSTE."};
  const rows=await sb(env,token,"rpc/marc_adjust_inventory",{method:"POST",body:{
    p_inventory_id:hit.item.id,p_type:type,p_quantity:quantity,p_reason:p.reason||"Movimiento realizado por M.A.R.C.",p_reference:p.reference||"AI_AGENT"
  }});
  const item=Array.isArray(rows)?rows[0]:rows;
  await audit(env,token,userId,"INVENTORY",hit.item.id,"ADJUST",{type,quantity},source);
  return {status:"UPDATED",item};
}

async function audit(env,token,userId,entityType,entityId,action,metadata,source="WEB"){
  await sb(env,token,"marc_audit_log",{method:"POST",body:{user_id:userId,entity_type:entityType,entity_id:entityId,action,source,metadata:metadata||{}}}).catch(()=>{});
}

async function recentMessages(env,token,userId,conversationId){
  if(!userId)return [];
  const url=new URL(env.SUPABASE_URL+"/rest/v1/marc_messages");
  url.searchParams.set("select","role,content,created_at,conversation_id");
  url.searchParams.set("user_id","eq."+userId);
  if(conversationId)url.searchParams.set("conversation_id","eq."+conversationId);
  url.searchParams.set("order","created_at.desc");
  url.searchParams.set("limit","20");
  const rows=await sb(env,token,url.pathname.slice("/rest/v1/".length)+url.search);
  return rows.reverse();
}

async function getConversationContext(env,token,userId,conversationId){
  if(!conversationId)return {};
  try{
    const rows=await sb(env,token,"marc_conversation_context?select=context&user_id=eq."+encodeURIComponent(userId)+"&conversation_id=eq."+encodeURIComponent(conversationId)+"&limit=1");
    return rows?.[0]?.context||{};
  }catch{return {}}
}
async function saveConversationContext(env,token,userId,conversationId,context){
  if(!conversationId)return;
  const safe={...context,updated_at:new Date().toISOString()};
  await sb(env,token,"marc_conversation_context?on_conflict=conversation_id",{
    method:"POST",prefer:"resolution=merge-duplicates,return=minimal",
    body:{conversation_id:conversationId,user_id:userId,context:safe}
  }).catch(()=>{});
}
function resolveEntityReference(message,context={}){
  const s=String(message||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
  const m=s.match(/\b(el|la|los|las)\s+(primero|primera|segundo|segunda|tercero|tercera|cuarto|cuarta|quinto|quinta|uno|una|dos|tres|cuatro|cinco)\b/);
  if(!m)return null;
  const map={primero:1,primera:1,uno:1,una:1,segundo:2,segunda:2,tercero:3,tercera:3,cuarto:4,cuarta:4,quinto:5,quinta:5,dos:2,tres:3,cuatro:4,cinco:5};
  const index=map[m[2]];
  const type=context.last_entity_type;
  const list=type==="client"?context.clients:type==="product"?context.products:type==="quote"?context.quotes:null;
  if(!Array.isArray(list)||!list[index-1])return {status:"AMBIGUOUS",index,type};
  return {status:"FOUND",index,type,item:list[index-1]};
}

function buildEntityContext(execution,previous={}){
  const action=String(execution?.action||""),result=execution?.result,next={...previous};
  if(action==="SEARCH_CLIENTS"&&Array.isArray(result)&&result.length){
    next.clients=result.slice(0,8).map((x,i)=>({index:i+1,id:x.id,name:x.name,phone:x.phone||null,email:x.email||null}));
    next.last_entity_type="client";
  }
  if(action==="SEARCH_INVENTORY"){
    const items=Array.isArray(result)?result:(Array.isArray(result?.items)?result.items:[]);
    if(items.length){
      next.products=items.slice(0,8).map((x,i)=>({index:i+1,id:x.id,name:x.name,sku:x.sku||null,price:x.price??null,stock:x.stock??null}));
      next.last_entity_type="product";
    }
  }
  if(action==="LIST_QUOTES"&&Array.isArray(result)&&result.length){
    next.quotes=result.slice(0,8).map((x,i)=>({index:i+1,id:x.id,number:x.number,title:x.title,total:x.total,status:x.status}));
    next.last_entity_type="quote";
  }
  if(action==="CREATE_QUOTE"&&result?.status==="CREATED"&&result.quote){
    const q=result.quote;
    next.quotes=[{index:1,id:q.id,number:q.number||q.numero||null,title:q.title||null,total:q.total??null,status:q.status||"BORRADOR"},...(Array.isArray(previous.quotes)?previous.quotes:[]).filter(x=>x.id!==q.id)].slice(0,8)
      .map((x,i)=>({...x,index:i+1}));
    next.last_entity_type="quote";
  }
  if(action==="CREATE_CLIENT"&&result?.status==="CREATED"&&result.client){
    const cl=result.client;
    next.clients=[{index:1,id:cl.id,name:cl.name||cl.nombre_razon_social||null,phone:cl.phone||null,email:cl.email||null},...(Array.isArray(previous.clients)?previous.clients:[]).filter(x=>x.id!==cl.id)]
      .slice(0,8).map((x,i)=>({...x,index:i+1}));
    next.last_entity_type="client";
  }
  if(action==="CASH_STATUS"||action==="CASH_LAST_CLOSE")next.last_entity_type="cash";
  return next;
}

function extractJson(text){
  const fence=String.fromCharCode(96).repeat(3);
  const raw=String(text||"").replaceAll(fence+"json","").replaceAll(fence,"").trim();
  const a=raw.indexOf("{"),b=raw.lastIndexOf("}");
  if(a<0||b<=a)throw new Error("El plan del agente no llegó en JSON.");
  return JSON.parse(raw.slice(a,b+1));
}

function recoverQuoteDraft(responseText,description,clientQuery,allCost){
  const raw=String(responseText||"").trim();
  let parsed=null;
  try{parsed=extractJson(raw)}catch{}
  const titleMatch=raw.match(/"title"\s*:\s*"((?:\\.|[^"])*)"/);
  let title="";
  if(titleMatch){
    try{title=JSON.parse('"'+titleMatch[1]+'"')}catch{title=titleMatch[1]}
  }
  title=String(title||"").trim();
  if(!title){
    const first=String(description||"").split(/[.!?\n]/)[0].trim();
    title=first?first.slice(0,90):"Trabajo";
  }
  const priceMatch=String(description||"").match(/(?:s\/|s\.?|soles?|precio|costo|total)\s*[:=]?\s*(\d+(?:[.,]\d{1,2})?)/i);
  const extractedPrice=priceMatch?Number(String(priceMatch[1]).replace(",",".")):null;
  const item=parsed?.items?.[0]||{};
  return {
    title,
    client_query:String(parsed?.client_query||clientQuery||"").slice(0,200),
    all_cost:allCost,
    items:[{
      type:"TRABAJO",
      name:String(item.name||title||"Trabajo").slice(0,180),
      description:String(item.description||description).slice(0,2000),
      quantity:1,
      unit_price:item.unit_price!=null&&Number.isFinite(Number(item.unit_price))?Number(item.unit_price):extractedPrice
    }]
  };
}

function parseReminderRequest(message){
  const raw=String(message||"").trim();
  const s=raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
  if(!/\b(recu[eé]rdame|recordarme|av[ií]same|avisame|no olvides|programa(?:me)?|ponme un recordatorio)\b/.test(s))return null;
  const relative=s.match(/\b(en\s+)(\d+)\s*(minutos?|mins?|horas?|d[ií]as?|semanas?)\b/);
  const tomorrow=s.match(/\b(ma[nñ]ana)\b/);
  const time=s.match(/\b(?:a\s+las?\s*)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  let when=new Date();
  if(relative){
    const n=Number(relative[2]);const unit=relative[3];
    if(/^min/i.test(unit))when.setMinutes(when.getMinutes()+n);
    else if(/^hora/i.test(unit))when.setHours(when.getHours()+n);
    else if(/^d[ií]a/i.test(unit))when.setDate(when.getDate()+n);
    else when.setDate(when.getDate()+n*7);
  }else{
    if(tomorrow)when.setDate(when.getDate()+1);
    if(time){
      let h=Number(time[1]);const ap=String(time[3]||"").toLowerCase();
      if(ap==="pm"&&h<12)h+=12;if(ap==="am"&&h===12)h=0;
      when.setHours(h,Number(time[2]||0),0,0);
      if(!tomorrow&&when.getTime()<=Date.now())when.setDate(when.getDate()+1);
    }else if(!tomorrow)return {needs_time:true};
  }
  const title=raw.replace(/\b(recu[eé]rdame|recordarme|av[ií]same|avisame|no olvides|programa(?:me)?|ponme un recordatorio)\b/ig,"")
    .replace(/\b(en\s+\d+\s*(?:minutos?|mins?|horas?|d[ií]as?|semanas?)|ma[nñ]ana|a\s+las?\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/ig,"")
    .replace(/^[\s,:-]+|[\s,:-]+$/g,"").trim();
  return {title:title.slice(0,120)||"Recordatorio de M.A.R.C.",body:title.slice(0,500)||"Tienes un recordatorio pendiente.",when:when.toISOString()};
}

function deterministicIntent(message){
  const s=String(message||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
  const readOnly=/\b(agrega|agregar|ingresa|ingresar|suma|sumar|resta|restar|ajusta|ajustar|crea|crear|registra|registrar|elimina|eliminar|abre|abrir|cierra|cerrar|paga|pagar)\b/.test(s);
  if(!readOnly && /\b(caja|efectivo|dinero)\b/.test(s) && /\b(como esta|estado|saldo|cuanto tengo|cuanto hay|disponible)\b/.test(s))return {action:"CASH_STATUS",execute:false,params:{}};
  if(!readOnly && /\b(ultimo|ultima|reciente)\b/.test(s) && /\b(cierre|caja)\b/.test(s) && /\b(movimiento|movimientos|ingreso|ingresos|egreso|egresos|gasto|gastos|venta|ventas|como estuvo|como esta|resumen)\b/.test(s))return {action:"CASH_LAST_CLOSE",execute:false,params:{}};
  if(!readOnly && /\b(cierre|cierres)\b/.test(s) && /\b(ultimo|ultima|reciente|historial|anteriores)\b/.test(s))return {action:"CASH_LAST_CLOSE",execute:false,params:{}};

  if(!readOnly && /\b(mas caro|mayor precio|precio mas alto|producto mas caro|productos mas caros)\b/.test(s) && /\b(producto|productos|inventario|articulo|articulos|item|items)\b/.test(s))return {action:"INVENTORY_INSIGHT",execute:false,params:{kind:"MOST_EXPENSIVE"}};
  if(!readOnly && /\b(mas barato|menor precio|precio mas bajo|producto mas barato|productos mas baratos)\b/.test(s) && /\b(producto|productos|inventario|articulo|articulos|item|items)\b/.test(s))return {action:"INVENTORY_INSIGHT",execute:false,params:{kind:"CHEAPEST"}};
  if(!readOnly && /\b(mas stock|mayor stock|mas unidades|mayor cantidad)\b/.test(s) && /\b(producto|productos|inventario|articulo|articulos|item|items|stock)\b/.test(s))return {action:"INVENTORY_INSIGHT",execute:false,params:{kind:"HIGHEST_STOCK"}};
  if(!readOnly && /\b(menos stock|menor stock|stock mas bajo|stock bajo)\b/.test(s) && /\b(producto|productos|inventario|articulo|articulos|item|items|stock)\b/.test(s))return {action:"INVENTORY_INSIGHT",execute:false,params:{kind:"LOWEST_STOCK"}};
  if(!readOnly && /\b(agotados?|sin stock|stock agotado)\b/.test(s) && /\b(producto|productos|inventario|articulo|articulos|item|items|stock)\b/.test(s))return {action:"INVENTORY_INSIGHT",execute:false,params:{kind:"OUT_OF_STOCK"}};
  if(!readOnly && /\b(revisa|revisar|ver|muestra|muestreme|mostrar|consulta|consultar|que|cuanto|cuantos|cual|cuales)\b/.test(s) && /\binventario\b|\bstock\b|\bproductos\b/.test(s))return {action:"SEARCH_INVENTORY",execute:false,params:{query:"",summary:true}};
  if(/\b(que|cuales|muestra|mostrar|listar|lista|revisa|revisar)\b/.test(s) && /\bcotizaciones?\b|\bproformas?\b/.test(s))return {action:"LIST_QUOTES",execute:false,params:{}};
  if(/\b(busca|buscar|muestra|mostrar|consulta|consultar|revisa|revisar)\b/.test(s) && /\b(cliente|clientes)\b/.test(s)){const q=s.replace(/.*\b(cliente|clientes)\b\s*/,"").trim();return {action:"SEARCH_CLIENTS",execute:false,params:{query:q}};}
  return null;
}
async function plan(env,message,history,entityContext={},contextToken="",contextUserId=""){
  const reminder=parseReminderRequest(message);
  if(reminder&&!reminder.needs_time)return {action:"SCHEDULE_REMINDER",execute:false,params:reminder};
  if(reminder?.needs_time)return {action:"CHAT",execute:false,params:{clarification:"Claro. ¿Cuándo quieres que te lo recuerde? Por ejemplo: «mañana a las 9» o «en 2 horas».",reminder_pending:true}};

  const reference=resolveEntityReference(message,entityContext);
  const s=String(message||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
  if(reference?.status==="AMBIGUOUS")return {action:"CHAT",execute:false,params:{clarification:"¿A cuál resultado te refieres? Indícame el número o el nombre."}};
  if(reference?.status==="FOUND"){
    const item=reference.item;
    if(reference.type==="product" && /\b(agrega|agregar|entrada|ingresa|ingresar|suma|sumar|quita|quitar|salida|resta|restar|ajusta|ajustar)\b/.test(s)){
      const qty=s.match(/\b(\d+(?:[.,]\d+)?)\b/);
      const type=/\b(quita|quitar|salida|resta|restar)\b/.test(s)?"SALIDA":/\b(ajusta|ajustar)\b/.test(s)?"AJUSTE":"ENTRADA";
      if(!qty)return {action:"CHAT",execute:false,params:{clarification:"¿Qué cantidad quieres mover para "+item.name+"?"}};
      return {action:"ADJUST_INVENTORY",execute:false,params:{inventory_query:item.id,quantity:Number(qty[1].replace(",",".")),type,reason:"Movimiento solicitado desde Telegram"}};
    }
    if(reference.type==="product" && /\b(stock|cuanto|cuánta|cuanto tiene|precio|cuesta)\b/.test(s))
      return {action:"SEARCH_INVENTORY",execute:false,params:{query:item.id}};
    if(reference.type==="client" && /\b(cotiz|proforma|presupuesto)\b/.test(s)){
      const hasWork=/\b(instal|manten|repar|configur|servicio|trabajo|venta|suministr|cambi|pod|limpi|cable|camar|red|mano de obra)\w*/.test(s);
      if(!hasWork)return {action:"CHAT",execute:false,params:{clarification:"Claro. ¿Qué trabajo o servicio quieres cotizarle a "+String(item.name||"ese cliente")+"?"}};
      const priceMatches=[...s.matchAll(/(?:a|por|precio|costo|total)\s*(?:s\/?\.?\s*)?(\d+(?:[.,]\d{1,2})?)/g)];
      const price=priceMatches.length?Number(priceMatches[priceMatches.length-1][1].replace(",",".")):null;
      const original=String(message||"").replace(/^(?:el|la|los|las)\s+(?:primero|primera|segundo|segunda|tercero|tercera|cuarto|cuarta|quinto|quinta|uno|una|dos|tres|cuatro|cinco)\s*/i,"").trim();
      const description=original.replace(/\b(?:cotiz|cotiza|cotizar|proforma|presupuesto)\w*\b/gi,"").replace(/\b(?:a|por|precio|costo|total)\s*(?:s\/?\.?\s*)?\d+(?:[.,]\d{1,2})?/gi,"").replace(/\s+/g," ").trim();
      const qtyMatch=s.match(/\b(\d+(?:[.,]\d+)?)\s+(?:camar|cable|unidad|unidades|pieza|piezas|hora|horas|servicio|servicios|trabajo|trabajos)\w*/);
      const quantity=qtyMatch?Number(qtyMatch[1].replace(",",".")):1;
      const items=[{type:"TRABAJO",name:description.slice(0,180)||"Trabajo solicitado",description:description.slice(0,2000)||original.slice(0,2000),quantity,unit_price:Number.isFinite(price)&&price>0?price:null}];
      return {action:"CREATE_QUOTE",execute:false,params:{client_query:item.id,title:"Cotización · "+String(item.name||"Cliente"),items}};
    }
    if(reference.type==="client")return {action:"SEARCH_CLIENTS",execute:false,params:{query:item.id}};
  }
    const addExistingMatch=s.match(/\b(?:agrega|añade|anade|incluye|suma)\b[\s\S]{0,120}?(?:a|en)\s+(?:la\s+)?(?:cotizacion|proforma|presupuesto)\s+(COT-\d{6}-\d{4})/i);
  if(addExistingMatch){
    const ref=addExistingMatch[1];
    const found=await getQuoteForEdit(env,contextToken,contextUserId,ref);
    if(found.status==="NOT_FOUND")return {action:"CHAT",execute:false,params:{clarification:"No encontré la cotización "+ref+"."}};
    const rawAdd=String(message||"").replace(new RegExp("\\b"+ref+"\\b","i"),"").replace(/\b(?:agrega|añade|anade|incluye|suma)\b/i,"").replace(/\b(?:a|en)\s+(?:la\s+)?(?:cotizacion|proforma|presupuesto)\s*$/i,"").trim();
    const pm=rawAdd.match(/^(?:(\d+(?:[.,]\d+)?)\s+)?(.+?)\s+(?:por|a)\s+(?:s\/\.?\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:soles?)?$/i);
    if(!pm)return {action:"CHAT",execute:false,params:{clarification:"Indícame la partida y el precio, por ejemplo: «agrega 3 cámaras Hikvision por 280 a la cotización "+ref+"»."}};
    const quantity=Math.max(1,Number(String(pm[1]||"1").replace(",",".")));
    const name=String(pm[2]||"").trim();
    const value=Number(String(pm[3]||"").replace(",","."));
    if(!name||!Number.isFinite(value)||value<=0)return {action:"CHAT",execute:false,params:{clarification:"Necesito un nombre de partida y un precio válido."}};
    const items=found.items.map(x=>({type:String(x.item_type||"TRABAJO").toUpperCase(),inventory_id:x.inventory_id||null,name:x.name||"Partida",description:x.description||null,quantity:Number(x.quantity||1),unit:x.unit||"UND",unit_price:Number(x.unit_price||0),cost:Number(x.cost||0)}));
    const inv=await resolveInventory(env,contextToken,contextUserId,name);
    if(inv.status==="FOUND"){
      const it=inv.item;
      items.push({type:"PRODUCTO",inventory_id:it.id,name:it.name,description:null,quantity,unit:it.unit||"UND",unit_price:value,cost:Number(it.cost||0)});
    }else if(inv.status==="AMBIGUOUS"){
      const opts=(inv.options||[]).map((x,i)=>(i+1)+". "+String(x.name||"Producto")+" — S/ "+Number(x.price||0).toFixed(2)).join("\n");
      return {action:"CHAT",execute:false,params:{clarification:"Encontré varios productos para «"+name+"»:\n"+opts+"\n\nIndícame cuál deseas agregar."}};
    }else{
      items.push({type:"TRABAJO",name:name.slice(0,180),description:name.slice(0,2000),quantity,unit:"UND",unit_price:value});
    }
    return {action:"UPDATE_QUOTE",execute:false,params:{quote_id:found.quote.id,quote_number:found.quote.number,client_query:found.quote.client_id||"",client_name:found.client?.name||"",title:found.quote.title||"Cotización",items,tax_enabled:found.quote.tax_enabled!==false,tax_rate:Number(found.quote.tax_rate||18),tax_included:false,prices_are_net:true,notes:found.quote.notes||null,status:found.quote.status||"BORRADOR"}};
  }
const editQuoteMatch=s.match(/\b(?:modifica|modificar|edita|editar|abre|abrir|actualiza|actualizar)\b[\s\S]{0,40}?(?:cotizacion|proforma|presupuesto)\s+(COT-\d{6}-\d{4})/i);
  if(editQuoteMatch){
    const ref=editQuoteMatch[1];
    const found=await getQuoteForEdit(env,contextToken,contextUserId,ref);
    if(found.status==="NOT_FOUND")return {action:"CHAT",execute:false,params:{clarification:"No encontré la cotización "+ref+"."}};
    if(found.status==="AMBIGUOUS")return {action:"CHAT",execute:false,params:{clarification:"Encontré varias cotizaciones. Indícame el número exacto."}};
    const q=found.quote;
    const items=found.items.map(x=>({type:String(x.item_type||"TRABAJO").toUpperCase(),inventory_id:x.inventory_id||null,name:x.name||"Partida",description:x.description||null,quantity:Number(x.quantity||1),unit:x.unit||"UND",unit_price:Number(x.unit_price||0),cost:Number(x.cost||0)}));
    return {action:"UPDATE_QUOTE",execute:false,params:{quote_id:q.id,quote_number:q.number,client_query:q.client_id||"",client_name:found.client?.name||"",title:q.title||"Cotización",items,tax_enabled:q.tax_enabled!==false,tax_rate:Number(q.tax_rate||18),tax_included:false,notes:q.notes||null,status:q.status||"BORRADOR"}};
  }
  if(entityContext?.pending_action?.action==="UPDATE_QUOTE"){
    return {action:"UPDATE_QUOTE",execute:false,params:entityContext.pending_action.params||{}};
  }
  if(entityContext?.pending_action?.action==="CREATE_QUOTE"){
    const pending=entityContext.pending_action.params||{};
    const text=String(message||"").trim();

    // Si la cotización quedó pendiente por un precio faltante, acepta una respuesta
    // corta como "350", "350 soles" o "a 350" y completa la primera partida sin precio.
    const pendingItems=Array.isArray(pending.items)?pending.items:[];
    const missingIndex=pendingItems.findIndex(x=>!Number.isFinite(Number(x.unit_price))||Number(x.unit_price)<=0);
    if(missingIndex>=0){
      const priceOnly=text.match(/^(?:a\s*)?(?:s\/?\.?\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:soles?|pen)?$/i);
      if(priceOnly){
        const value=Number(priceOnly[1].replace(",","."));
        if(Number.isFinite(value)&&value>0){
          const items=pendingItems.map((x,i)=>i===missingIndex?{...x,unit_price:value}:x);
          return {action:"CREATE_QUOTE",execute:false,params:{...pending,items}};
        }
      }
    }
    if(/\b(para|cliente)\b/i.test(text) && !/\b(agrega|añade|anade|incluye)\b/i.test(text)){
      const m=text.match(/\b(?:para|cliente)\s+(.+?)(?:\s+(?:con|por|a|precio|costo)\b|$)/i);
      if(m?.[1]){
        const clientQuery=m[1].trim();
        const hit=await resolveOneClient(env,contextToken,contextUserId,clientQuery).catch(()=>null);
        const nextClient=hit?.status==="FOUND"?hit.client.name:clientQuery;
        return {action:"CREATE_QUOTE",execute:false,params:{...pending,client_query:nextClient,client_id:hit?.status==="FOUND"?hit.client.id:undefined}};
      }
    }
    if(/\b(agrega|añade|anade|tambien|también|otro|otra|incluye|incluyendo)\b/i.test(text)){
      const priceMatch=text.match(/(?:a|por|precio|costo|total)\s*(?:s\/?\.?\s*)?(\d+(?:[.,]\d{1,2})?)/i);
      const qtyMatch=text.match(/\b(\d+(?:[.,]\d+)?)\s+(?=\S)/);
      const price=priceMatch?Number(priceMatch[1].replace(",",".")):null;
      const quantity=qtyMatch?Number(qtyMatch[1].replace(",",".")):1;
      const addAllCost=/\b(?:a\s+todo\s+costo|todo\s+costo|a\s+todo\s+coste|por\s+todo\s+incluido)\b/i.test(text);
      const addClientSupplies=/\b(?:el\s+cliente|cliente)\s+(?:pone|pondrá|pondra|suministra|suministrará|suministrara|ya\s+tiene|trae)\s+(?:el\s+)?(?:material|equipo|producto)s?\b|\bmaterial(?:es)?\s+(?:por\s+cuenta|a\s+cargo)\s+del\s+cliente\b/i.test(text);
      const addServiceOnly=addAllCost||addClientSupplies;
      const cleaned=text
        .replace(/^.*?\b(agrega|añade|anade|tambien|también|otro|otra|incluye|incluyendo)\b/i,"")
        .replace(/(?:a|por|precio|costo|total)\s*(?:s\/?\.?\s*)?\d+(?:[.,]\d{1,2})?/gi,"")
        .replace(/^\s*\d+(?:[.,]\d+)?\s+/,"")
        .replace(/\s+/g," ").trim();
      const items=Array.isArray(pending.items)?pending.items.slice():[];
      // "A todo costo" o material aportado por el cliente convierte la partida en servicio:
      // no dependemos del catálogo ni exigimos stock.
      const hit=addServiceOnly?null:await resolveInventory(env,contextToken,contextUserId,cleaned).catch(()=>null);
      if(hit?.status==="AMBIGUOUS"){
        return {action:"CHAT",execute:false,params:{clarification:"Encontré varios productos para «"+cleaned+"». Indícame cuál quieres agregar."}};
      }
      if(hit?.status==="FOUND"){
        const it=hit.item;
        items.push({type:"PRODUCTO",inventory_query:it.name,name:it.name,description:null,quantity,unit_price:Number.isFinite(price)&&price>0?price:null,gross_unit_price:Number.isFinite(grossPrice)&&grossPrice>0?grossPrice:null,price_includes_tax:taxIncluded,price_is_total:priceIsTotal});
      }else{
        items.push({type:"TRABAJO",name:cleaned.slice(0,180)||"Trabajo adicional",description:cleaned.slice(0,2000),quantity,unit_price:Number.isFinite(price)&&price>0?price:null,all_cost:addAllCost,material_supplied_by_client:addClientSupplies||addAllCost});
      }
      return {action:"CREATE_QUOTE",execute:false,params:{...pending,items}};
    }
    if(/\b(pon|cambia|modifica|actualiza)\b.*\bprecio\b/i.test(text)){
      const priceMatch=text.match(/(?:a|por|precio)\s*(?:s\/?\.?\s*)?(\d+(?:[.,]\d{1,2})?)/i);
      if(priceMatch){
        const target=text.replace(/\b(pon|cambia|modifica|actualiza)\b/gi,"").replace(/\bprecio\b/gi,"").replace(/(?:a|por)\s*(?:s\/?\.?\s*)?\d+(?:[.,]\d{1,2})?/gi,"").trim();
        const items=Array.isArray(pending.items)?pending.items.map((x,i)=>{
          if(!target)return i===0?{...x,unit_price:Number(priceMatch[1].replace(",","."))}:x;
          return String(x.name||"").toLowerCase().includes(target.toLowerCase())?{...x,unit_price:Number(priceMatch[1].replace(",","."))}:x;
        }):[];
        return {action:"CREATE_QUOTE",execute:false,params:{...pending,items}};
      }
    }
  }
  // Cotización estructurada: si la orden ya trae cliente y partidas, evitamos Gemini
  // y reutilizamos el flujo seguro de confirmación.
  // Ajustes fiscales cortos sobre una cotización pendiente: no necesitan Gemini.
  const taxOnly=/^(?:sin|no)\s+(?:igv|igb|impuesto)(?:\s+(?:incluyas?|le\s+pongas?))?\s*[.!?]*$/i.test(String(message||"").trim());
  const taxYesOnly=/^(?:con|incluye|incluido)\s+(?:el\s+)?(?:igv|igb|impuesto)(?:\s+incluido)?\s*[.!?]*$/i.test(String(message||"").trim());
  if(entityContext?.pending_action?.action==="CREATE_QUOTE" && (taxOnly||taxYesOnly)){
    const pending=entityContext.pending_action.params||{};
    return {action:"CREATE_QUOTE",execute:false,params:{...pending,tax_enabled:!taxOnly,tax_included:taxYesOnly}};
  }

  const quoteCommand=/^(?:crea|crear|creemos|haz|hacer|hagamos|prepara|preparar|genera|generar|cotiza|cotizar|elabora|elaborar|necesito|quiero|armemos|vamos\s+a\s+hacer)\s+(?:una\s+)?(?:cotizacion|cotización|proforma|presupuesto)\b/i.test(String(message||"").trim());
  if(quoteCommand){
    const rawMessage=String(message||"").trim();
    // Normalizamos errores/variantes habituales para que el lenguaje del usuario
    // no tenga que coincidir literalmente con "IGV".
    const fiscalText=rawMessage
      .replace(/\bigb\b/gi,"igv")
      .replace(/\big\.v\.\b/gi,"igv")
      .replace(/\bimpuesto\s+general\s+a\s+las\s+ventas\b/gi,"igv");
    const taxExcluded=/\b(?:sin\s+igv|no\s+incluye\s+igv|sin\s+impuesto|no\s+incluye\s+impuesto|mas\s+igv|más\s+igv)\b/i.test(fiscalText);
    const taxIncluded=!taxExcluded && /\b(?:con\s+igv|igv\s+incluido|incluye\s+(?:el\s+)?igv|con\s+impuesto|impuesto\s+incluido)\b/i.test(fiscalText);
    const taxEnabled=!taxExcluded;
    const taxRateMatch=fiscalText.match(/\bigv\s*(?:de|al)?\s*(\d+(?:[.,]\d+)?)\s*%?/i);
    const taxRate=taxRateMatch?Number(taxRateMatch[1].replace(",",".")):18;

    let clientQuery="";
    let clientMatch=rawMessage.match(/\b(?:para|cliente)\s+(?:es\s+|:\s*)?(.+?)(?=\s+(?:por|a|precio|costo|total)\s+|\s*[:,-]\s*|$)/i);
    // "el cliente es ..." suele venir al final de la orden.
    if(!clientMatch)clientMatch=rawMessage.match(/\bcliente\s+es\s+(.+?)\s*$/i);
    if(clientMatch)clientQuery=clientMatch[1].trim();
    if(!clientQuery)return {action:"CHAT",execute:false,params:{clarification:"Con gusto. ¿Para qué cliente desea preparar la cotización?"}};

    const hit=await resolveOneClient(env,contextToken,contextUserId,clientQuery).catch(()=>null);
    if(hit?.status==="AMBIGUOUS")return {action:"CHAT",execute:false,params:{clarification:"Encontré varios clientes para «"+clientQuery+"». Indícame cuál desea usar."}};
    let newClientDraft=null;
    if(hit?.status==="NOT_FOUND"){
      let clientName=clientQuery.replace(/\b(?:ubicacion|ubicación|direccion|dirección)\s+.+$/i,"").trim()||clientQuery;
      const addressMatch=clientQuery.match(/\b(?:ubicacion|ubicación|direccion|dirección)\s+(.+)$/i);
      newClientDraft={name:clientName.slice(0,180),address:addressMatch?.[1]?.trim()?.slice(0,300)||null};
    }
    const client=hit?.client||null;
    if(!client && !newClientDraft)return {action:"CHAT",execute:false,params:{clarification:"No pude identificar al cliente. Indícame el nombre exacto, por favor."}};

    const allCost=/\b(?:a\s+todo\s+costo|todo\s+costo|a\s+coste\s+total|por\s+todo\s+incluido|a\s+todo\s+coste)\b/i.test(rawMessage);
    const clientSupplies=/\b(?:el\s+cliente|cliente)\s+(?:pone|pondrá|pondra|suministra|suministrará|suministrara|ya\s+tiene|trae)\s+(?:el\s+)?(?:material|equipo|producto)s?\b|\bmaterial(?:es)?\s+(?:por\s+cuenta|a\s+cargo)\s+del\s+cliente\b/i.test(rawMessage);
    const serviceOnly=allCost||clientSupplies;
    let body=fiscalText
      .replace(/\b(?:sin\s+igv|no\s+incluye\s+igv|sin\s+impuesto|no\s+incluye\s+impuesto)\b/gi,"")
      .replace(/^(?:crea|crear|creemos|hagamos|haz|hacer|prepara|preparar|genera|generar|cotiza|cotizar|elabora|elaborar|necesito|quiero|armemos|vamos\s+a\s+hacer)\s+(?:una\s+)?(?:cotizacion|cotización|proforma|presupuesto)\s*/i,"")
      .replace(/\b(?:para|cliente)\s+(?:es\s+|:\s*)?.+?(?=\s+(?:por|a|precio|costo|total|de|con)\s+|\s*[:,-]\s*|$)/i,"")
      .replace(/\bcliente\s+es\s+.+?$/i,"")
      .replace(/\s+/g," ").trim();

    // Separadores naturales de partidas: coma, punto y coma o "y".
    // "y" solo separa cuando viene después de una partida ya expresada.
    const rawParts=body.split(/\s*[,;]\s*|\s+\by\b\s+/i).map(x=>x.trim()).filter(Boolean);
    const parts=rawParts.length?rawParts:[body];
    const items=[];
    for(const part of parts){
      let textPart=part.trim();
      if(!textPart)continue;

      const qtyMatch=textPart.match(/^(\d+(?:[.,]\d+)?)\s+(?=\S)/);
      const quantity=qtyMatch?Number(qtyMatch[1].replace(",",".")):1;
      if(qtyMatch)textPart=textPart.slice(qtyMatch[0].length).trim();

      let price=null;
      let priceMatch=textPart.match(/(?:\b(?:a|por|precio|costo|total)\s*[:=]?\s*|\bs\/\.?\s*)(\d+(?:[.,]\d{1,2})?)(?:\s*(?:soles?|pen))?\s*$/i);
      let priceIsTotal=false;
      if(priceMatch){
        price=Number(priceMatch[1].replace(",","."));
        priceIsTotal=/\btotal\b/i.test(priceMatch[0]+" "+textPart);
        textPart=textPart.slice(0,priceMatch.index).trim();
      }else{
        // También acepta "mano de obra 300" o "instalación 850" al final.
        const trailing=textPart.match(/(?:\s|^)\b(\d+(?:[.,]\d{1,2})?)\s*(?:soles?|pen)?$/i);
        if(trailing){
          price=Number(trailing[1].replace(",","."));
          textPart=textPart.slice(0,trailing.index).trim();
        }
      }

      if(!textPart)continue;
      if(price!==null && priceIsTotal && quantity>0)price=price/quantity;
      const grossPrice=price;
      if(price!==null && taxIncluded)price=price/(1+(taxRate/100));
      // "A todo costo" significa que el importe es por el servicio completo:
      // no dependemos del catálogo ni exigimos que el material exista en inventario.
      if(serviceOnly){
        items.push({type:"TRABAJO",name:textPart.slice(0,180),description:textPart.slice(0,2000),quantity,unit_price:Number.isFinite(price)&&price>0?price:null,gross_unit_price:Number.isFinite(grossPrice)&&grossPrice>0?grossPrice:null,price_includes_tax:taxIncluded,price_is_total:priceIsTotal,all_cost:allCost,material_supplied_by_client:clientSupplies||allCost});
        continue;
      }
      const inv=await resolveInventory(env,contextToken,contextUserId,textPart).catch(()=>null);
      if(inv?.status==="AMBIGUOUS"){
        return {action:"CHAT",execute:false,params:{clarification:"Encontré varios productos para «"+textPart+"». Indícame cuál quieres usar."}};
      }
      if(inv?.status==="FOUND"){
        const it=inv.item;
        items.push({type:"PRODUCTO",inventory_query:it.name,name:it.name,description:null,quantity,unit_price:Number.isFinite(price)&&price>0?price:null});
      }else{
        items.push({type:"TRABAJO",name:textPart.slice(0,180),description:textPart.slice(0,2000),quantity,unit_price:Number.isFinite(price)&&price>0?price:null,gross_unit_price:Number.isFinite(grossPrice)&&grossPrice>0?grossPrice:null,price_includes_tax:taxIncluded,price_is_total:priceIsTotal});
      }
    }

    if(!items.length)return {action:"CHAT",execute:false,params:{clarification:"Indícame al menos un trabajo, producto o servicio para la cotización."}};
    if(newClientDraft){
      return {action:"CREATE_CLIENT",execute:false,params:{
        name:newClientDraft.name,
        address:newClientDraft.address,
        _next_quote:{
          client_name:newClientDraft.name,
          tax_enabled:taxEnabled,
          tax_included:taxIncluded,
          tax_rate:Number.isFinite(taxRate)&&taxRate>0?taxRate:18,
          title:"Cotización · "+newClientDraft.name.slice(0,120),
          items
        }
      }};
    }
    return {action:"CREATE_QUOTE",execute:false,params:{
      client_query:client.id,
      client_id:client.id,
      client_name:String(client.name||clientQuery),
      tax_enabled:taxEnabled,
      tax_included:taxIncluded,
      tax_rate:Number.isFinite(taxRate)&&taxRate>0?taxRate:18,
      title:"Cotización · "+String(client.name||clientQuery),
      items
    }};
  }
  if(/\b(historial|historia|historial comercial|historial del cliente|historia del cliente)\b/.test(s) && /\b(cliente|delgado|cliente\s+de)\b/.test(s)){
    const q=s.replace(/.*\bhistorial(?:\s+del|\s+de)?\s*(?:cliente)?\s*/,"").trim();
    if(q)return {action:"CLIENT_HISTORY",execute:false,params:{client_query:q}};
  }
  const deterministic=deterministicIntent(message);
  if(deterministic)return deterministic;
  const context=history.map((x,i)=>"["+i+"] "+x.role+":"+x.content).join("\n").slice(-8000);
  const entityMemory=JSON.stringify(entityContext||{}).slice(0,6000);
  const prompt={messages:[
    {role:"system",content:'Eres el enrutador de M.A.R.C. Devuelve SOLO JSON válido, sin markdown ni explicación. Convierte lenguaje natural en una sola acción segura. Usa el historial reciente como contexto conversacional real: si el usuario dice "el primero", "el segundo", "ese", "esa", "ahí", "lo anterior", "el mismo", "también", "ahora", "cuánto es", etc., resuelve el referente usando el último resultado relevante del historial. No inventes referentes: si hay más de una interpretación posible, usa CHAT y pide una aclaración breve. Acciones: SEARCH_CLIENTS, CLIENT_HISTORY, SEARCH_INVENTORY, LIST_QUOTES, CASH_STATUS, CASH_LAST_CLOSE, CREATE_CLIENT, CREATE_QUOTE, UPDATE_QUOTE, ADJUST_INVENTORY, CHAT. Para cualquier consulta, pregunta o solicitud de revisar, usa una acción de consulta. Solo usa execute=true para una operación que el usuario pidió explícitamente ejecutar. Nunca inventes IDs, precios, stock, clientes o productos. Para CREATE_QUOTE: items es un arreglo. Producto {type:"PRODUCTO",inventory_query:"texto",quantity:number,unit_price:number|null}; Trabajo {type:"TRABAJO",name:"texto",quantity:number,unit_price:number|null}. Para ADJUST_INVENTORY type es ENTRADA, SALIDA o AJUSTE. M.A.R.C. es un mayordomo digital empresarial. Su identidad debe sentirse siempre presente: elegante, atento, discreto, educado, seguro y resolutivo, como un buen mayordomo que conoce la casa y está pendiente de los asuntos de su señor. Trata al usuario con respeto, usando "señor" de forma natural y sin repetirlo en cada frase. Anticípate cuando sea razonable, mantén orden en la información y presenta primero lo importante. Puede usar expresiones como "A sus órdenes", "Con gusto", "Permítame revisar", "Listo, señor" o "Hecho, señor", pero con moderación para que no resulte teatral. Nunca debe sonar servil, exagerado ni infantil. No inventes emociones, datos ni acciones realizadas. Evita respuestas robóticas y frases genéricas como "no dispongo de información" cuando sí puedes consultar la cuenta. Formato: {"action":"CHAT","execute":false,"params":{}}'},
    ...(context?[{role:"user",content:"Historial reciente:\n"+context}]:[]),
    ...(entityMemory?[{role:"user",content:"Memoria de entidades de esta conversación (datos reales, no inventar):\n"+entityMemory}]:[]),
    {role:"user",content:message}
  ]};
  const out=await geminiGenerate(env,prompt,{json:true,maxTokens:1000});
  const responseText=out?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
  try{return extractJson(responseText)}catch{return {action:"CHAT",execute:false,params:{}}}
}

async function executePlan(env,token,user,pl,source="AI_AGENT"){
  const action=String(pl?.action||"CHAT").toUpperCase(),p=pl?.params||{};
  if(action==="SEARCH_CLIENTS")return {action,result:await searchClients(env,token,user.id,p.query||"")};
  if(action==="CLIENT_HISTORY"){
    const hit=await resolveOneClient(env,token,user.id,p.client_query||p.query||"");
    if(hit.status!=="FOUND")return {action,result:{status:hit.status,query:p.client_query||p.query||"",options:hit.options||[]}};
    const client=hit.client;
    const [quotes,reports,history]=await Promise.all([
      sb(env,token,"marc_quotes?select=id,number,title,status,total,created_at&user_id=eq."+encodeURIComponent(user.id)+"&client_id=eq."+encodeURIComponent(client.id)+"&deleted_at=is.null&order=created_at.desc&limit=20"),
      sb(env,token,"technical_reports?select=id,number,title,report_type,report_date,status,created_at&user_id=eq."+encodeURIComponent(user.id)+"&client_id=eq."+encodeURIComponent(client.id)+"&order=created_at.desc&limit=20").catch(()=>[]),
      sb(env,token,"marc_client_history?select=id,event_type,title,description,metadata,created_at&user_id=eq."+encodeURIComponent(user.id)+"&client_id=eq."+encodeURIComponent(client.id)+"&order=created_at.desc&limit=30").catch(()=>[])
    ]);
    const quoteIds=(quotes||[]).map(x=>x.id);
    let items=[];
    if(quoteIds.length)items=await sb(env,token,"marc_quote_items?select=quote_id,item_type,name,quantity,unit,unit_price,line_total&user_id=eq."+encodeURIComponent(user.id)+"&quote_id=in.("+quoteIds.join(",")+")&order=created_at.asc").catch(()=>[]);
    return {action,result:{status:"FOUND",client,quotes:quotes||[],reports:reports||[],history:history||[],items:items||[]}};
  }
  if(action==="CASH_STATUS"){
    const rows=await sb(env,token,"marc_cash_registers?select=*&user_id=eq."+encodeURIComponent(user.id)+"&status=eq.OPEN&order=opened_at.desc&limit=1");
    const r=rows?.[0];
    if(!r)return {action,result:{status:"CLOSED"}};
    const mv=await sb(env,token,"marc_cash_movements?select=type,amount&user_id=eq."+encodeURIComponent(user.id)+"&cash_register_id=eq."+encodeURIComponent(r.id)+"&order=created_at.asc");
    const movements=Array.isArray(mv)?mv:[];
    const income=movements.filter(x=>String(x.type||"").toUpperCase()==="INCOME").reduce((s,x)=>s+Number(x.amount||0),0);
    const expense=movements.filter(x=>String(x.type||"").toUpperCase()==="EXPENSE").reduce((s,x)=>s+Number(x.amount||0),0);
    return {action,result:{status:"OPEN",opening:Number(r.opening_amount||0),income,expense,expected:Number(r.opening_amount||0)+income-expense,movements:movements.length}};
  }
  if(action==="CASH_LAST_CLOSE"){
    const rows=await sb(env,token,"marc_cash_registers?select=*&user_id=eq."+encodeURIComponent(user.id)+"&status=eq.CLOSED&order=closed_at.desc,updated_at.desc&limit=1");
    const r=rows?.[0];
    if(!r)return {action,result:{status:"NOT_FOUND"}};
    const mv=await sb(env,token,"marc_cash_movements?select=*&user_id=eq."+encodeURIComponent(user.id)+"&cash_register_id=eq."+encodeURIComponent(r.id)+"&order=created_at.asc");
    const movements=Array.isArray(mv)?mv:[];
    const income=movements.filter(x=>String(x.type||"").toUpperCase()==="INCOME").reduce((s,x)=>s+Number(x.amount||0),0);
    const expense=movements.filter(x=>String(x.type||"").toUpperCase()==="EXPENSE").reduce((s,x)=>s+Number(x.amount||0),0);
    const expected=Number(r.expected_amount??(Number(r.opening_amount||0)+income-expense));
    const counted=Number(r.closing_amount??r.counted_amount??0);
    const difference=Number(r.difference??(counted-expected));
    return {action,result:{status:"FOUND",closed_at:r.closed_at||r.updated_at||r.opened_at,opening:Number(r.opening_amount||0),income,expense,expected,counted,difference,movements}};
  }
  if(action==="SEARCH_INVENTORY"){if(p.summary){const [count,items]=await Promise.all([countInventory(env,token,user.id),searchInventory(env,token,user.id,"",8)]);return {action,result:{count,items}};}return {action,result:await searchInventory(env,token,user.id,p.query||"")};}
  if(action==="INVENTORY_INSIGHT")return {action,result:await inventoryInsight(env,token,user.id,String(p.kind||"").toUpperCase())};
  if(action==="LIST_QUOTES")return {action,result:await listQuotes(env,token,user.id)};
  if(action==="CLIENT_HISTORY"){
    const hit=await resolveOneClient(env,token,user.id,p.client_query||p.query||"");
    if(hit.status!=="FOUND")return {action,result:{status:hit.status,query:p.client_query||p.query||"",options:hit.options||[]}};
    const client=hit.client;
    const [quotes,reports,history]=await Promise.all([
      sb(env,token,"marc_quotes?select=id,number,title,status,total,created_at&user_id=eq."+encodeURIComponent(user.id)+"&client_id=eq."+encodeURIComponent(client.id)+"&deleted_at=is.null&order=created_at.desc&limit=20"),
      sb(env,token,"technical_reports?select=id,number,title,report_type,report_date,status,created_at&user_id=eq."+encodeURIComponent(user.id)+"&client_id=eq."+encodeURIComponent(client.id)+"&order=created_at.desc&limit=20").catch(()=>[]),
      sb(env,token,"marc_client_history?select=id,event_type,title,description,metadata,created_at&user_id=eq."+encodeURIComponent(user.id)+"&client_id=eq."+encodeURIComponent(client.id)+"&order=created_at.desc&limit=30").catch(()=>[])
    ]);
    const quoteIds=(quotes||[]).map(x=>x.id);
    const items=quoteIds.length?await sb(env,token,"marc_quote_items?select=quote_id,item_type,name,quantity,unit,unit_price,line_total&user_id=eq."+encodeURIComponent(user.id)+"&quote_id=in.("+quoteIds.join(",")+")&order=created_at.asc").catch(()=>[]):[];
    return {action,result:{status:"FOUND",client,quotes:quotes||[],reports:reports||[],history:history||[],items}};
  }
  if(action==="SCHEDULE_REMINDER")return {action,result:{status:"REMINDER_READY",title:p.title,body:p.body,when:p.when,channel:p.channel||"BOTH"}};
  if(action==="CREATE_CLIENT")return {action,result:{status:"CONFIRMATION_REQUIRED",params:p}};
  if(action==="CREATE_QUOTE"||action==="UPDATE_QUOTE")return {action,result:{status:"CONFIRMATION_REQUIRED",params:p}};
  if(action==="ADJUST_INVENTORY")return {action,result:{status:"CONFIRMATION_REQUIRED",params:p}};
  return {action:"CHAT",result:null};
}

function normalizeData(x){
  try{return JSON.stringify(x).slice(0,14000)}catch{return String(x).slice(0,14000)}
}

async function finalReply(env,message,planData,userName=""){
  const execution=planData?.execution||{};
  const result=execution?.result;
  const requestText=String(message||"").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim();
  const displayName=String(userName||"").trim();
  if(/\b(que puede hacer|que puedes hacer|que haces|capacidades|como puedes ayudar|para que sirves)\b/.test(requestText)){
    const who=displayName?displayName:"señor";
    return "🫡 A sus órdenes, señor "+who+".\n\nSoy M.A.R.C., su mayordomo digital. Ya estoy atento a la operación y puedo ocuparme de los asuntos de su negocio con discreción y orden.\n\n🧾 COTIZACIONES Y PROFORMAS\n• Consultar sus cotizaciones y proformas.\n• Preparar nuevas cotizaciones de productos o servicios.\n• Añadir partidas, precios e IGV y dejar la propuesta lista para su aprobación.\n\n📦 INVENTARIO\n• Buscar productos, precios y existencias.\n• Detectar stock bajo o productos agotados.\n• Registrar entradas, salidas y ajustes, solicitando su autorización antes de modificar existencias.\n\n👤 CLIENTES\n• Localizar clientes y consultar sus datos.\n• Registrar nuevos clientes cuando usted lo autorice.\n\n💰 CAJA\n• Revisar el estado de la caja.\n• Consultar ingresos, egresos y efectivo esperado.\n• Revisar cierres y movimientos.\n\n🧠 Y, por supuesto, conservo el contexto de nuestra conversación para que no tenga que repetir lo que ya me indicó.\n\nDígame, señor "+who+"… ¿qué asunto desea que atienda primero?";
  }
  if(result?.status==="CONFIRMATION_REQUIRED"){
    const p=result.params||{};
    if(execution.action==="ADJUST_INVENTORY"){
      const type=String(p.type||"ENTRADA").toUpperCase();
      return "⚠️ Confirma este movimiento de inventario:\n\n📦 Producto: "+String(p.inventory_query||"seleccionado")+"\n🔄 Tipo: "+type+"\n🔢 Cantidad: "+Number(p.quantity||0)+"\n\nResponde «sí» para ejecutarlo o «cancelar» para no realizar cambios.";
    }
    if(execution.action==="CREATE_CLIENT"){
      const chained=Boolean(p._next_quote);
      return "⚠️ Voy a registrar este cliente:\n\n👤 "+String(p.name||"Sin nombre")+(p.document_number?"\n🪪 Documento: "+p.document_number:"")+(p.phone?"\n📞 "+p.phone:"")+(p.email?"\n✉️ "+p.email:"")+(p.address?"\n📍 "+p.address:"")+
        (chained?"\n\n🧾 Después prepararé automáticamente la cotización que me indicó.":"")+
        "\n\nResponde «sí» para confirmar o «cancelar» para detener la operación.";
    }
    if(execution.action==="UPDATE_QUOTE"){
      const p=result.params||{};
      const items=Array.isArray(p.items)?p.items:[];
      const subtotal=items.reduce((s,x)=>s+Math.max(0,Number(x.quantity||1))*Math.max(0,Number(x.unit_price||0)),0);
      const tax=p.tax_enabled===false?0:subtotal*Number(p.tax_rate||18)/100;
      return "⚠️ PREPARÉ LA ACTUALIZACIÓN\n\n🧾 "+String(p.quote_number||"Cotización")+"\n"+String(p.title||"Cotización")+"\n\n"+items.map((x,i)=>"• "+(i+1)+". "+String(x.name||"Partida")+" · "+Number(x.quantity||1)+" × S/ "+Number(x.unit_price||0).toFixed(2)).join("\n")+"\n\nSubtotal: S/ "+subtotal.toFixed(2)+"\n"+(p.tax_enabled===false?"IGV: NO INCLUIDO":"IGV "+Number(p.tax_rate||18)+"%: S/ "+tax.toFixed(2))+"\n💰 TOTAL: S/ "+(subtotal+tax).toFixed(2)+"\n\nResponde «sí» para guardar los cambios o «cancelar» para descartarlos.";
    }
    if(execution.action==="CREATE_QUOTE"){
      const items=Array.isArray(p.items)?p.items:[];
      const missingPrice=items.find(x=>String(x.type||"").toUpperCase()!=="PRODUCTO"&&(!Number.isFinite(Number(x.unit_price))||Number(x.unit_price)<=0));
      if(missingPrice)return "⚠️ Me falta el precio de: "+String(missingPrice.name||missingPrice.description||"Trabajo")+" .\n\nIndícame el precio, por ejemplo: «a 350 soles».";
      const taxEnabled=p.tax_enabled!==false;
      const taxRate=Number(p.tax_rate||18);
      const taxIncluded=Boolean(p.tax_included);
      const subtotal=items.reduce((s,x)=>{
        const qty=Math.max(0,Number(x.quantity||1)),unit=Math.max(0,Number(x.unit_price||0));
        return s+qty*unit;
      },0);
      const igv=taxEnabled?subtotal*taxRate/100:0;
      const total=subtotal+igv;
      const grossSubtotal=items.reduce((s,x)=>{
        const qty=Math.max(0,Number(x.quantity||1));
        const unit=Number.isFinite(Number(x.gross_unit_price))&&Number(x.gross_unit_price)>0?Number(x.gross_unit_price):Number(x.unit_price||0);
        return s+qty*unit;
      },0);
      const rows=items.map((x,i)=>{
        const qty=Number(x.quantity||1);
        const shownUnit=taxIncluded&&Number(x.gross_unit_price)>0?Number(x.gross_unit_price):Number(x.unit_price||0);
        const line=taxIncluded&&Number(x.gross_unit_price)>0?shownUnit*qty:Number(x.unit_price||0)*qty;
        return "• "+(i+1)+". "+String(x.name||x.description||"Partida")+" · "+qty+" × S/ "+shownUnit.toFixed(2)+" = S/ "+line.toFixed(2);
      });
      return "⚠️ PREPARÉ ESTA COTIZACIÓN\n\n👤 Cliente: "+String(p.client_name||p.client_query||"seleccionado")+"\n🧾 "+String(p.title||"Cotización")+"\n\n"+(rows.length?rows.join("\n"):"• Falta agregar una partida")+
        "\n\n"+(taxIncluded?"Base imponible: S/ "+subtotal.toFixed(2)+"\nIGV "+taxRate+"% incluido: S/ "+(total-subtotal).toFixed(2)+"\n💰 TOTAL CON IGV: S/ "+total.toFixed(2):"Subtotal: S/ "+subtotal.toFixed(2)+"\n"+(taxEnabled?"IGV "+taxRate+"%: S/ "+igv.toFixed(2)+"\n":"IGV: No incluido\n")+"💰 TOTAL: S/ "+total.toFixed(2))+
        "\n\nResponde «sí» para crearla, «agrega ...» para añadir otra partida, o «cancelar» para no realizar cambios.";
    }
  }
  if(execution?.action==="CASH_STATUS" && result){
    if(result.status==="CLOSED")return "▣ CAJA\n\nNo hay una caja abierta en este momento.";
    return "▣ CAJA ABIERTA\n\n💵 Apertura: "+moneyText(result.opening)+"\n📥 Ingresos: "+moneyText(result.income)+"\n📤 Egresos: "+moneyText(result.expense)+"\n💰 Efectivo esperado: "+moneyText(result.expected)+"\n\nMovimientos registrados: "+Number(result.movements||0)+".";
  }
  if(execution?.action==="CASH_LAST_CLOSE" && result){
    if(result.status==="NOT_FOUND")return "▣ ÚLTIMO CIERRE\n\nNo encuentro ningún cierre de caja registrado todavía.";
    const movements=Array.isArray(result.movements)?result.movements:[];
    const date=result.closed_at?new Date(result.closed_at).toLocaleString("es-PE"):"Fecha no disponible";
    const lines=["▣ ÚLTIMO CIERRE DE CAJA","", "📅 "+date,"💵 Apertura: "+moneyText(result.opening),"📥 Ingresos: "+moneyText(result.income),"📤 Egresos: "+moneyText(result.expense),"💰 Esperado: "+moneyText(result.expected),"🧾 Contado: "+moneyText(result.counted),"↕ Diferencia: "+moneyText(result.difference),"","Movimientos: "+movements.length];
    if(movements.length){
      lines.push(...movements.slice(0,25).map(x=>(String(x.type||"").toUpperCase()==="INCOME"?"📥":"📤")+" "+moneyText(x.amount)+" · "+String(x.concept||x.description||x.notes||"Movimiento de caja").trim()));
      if(movements.length>25)lines.push("… y "+(movements.length-25)+" movimientos más.");
    }else lines.push("Sin movimientos registrados en ese cierre.");
    return lines.join("\n");
  }
  if(execution?.action==="CLIENT_HISTORY" && result){
    if(result.status==="NOT_FOUND")return "No encontré ese cliente en tu cuenta.";
    if(result.status==="AMBIGUOUS")return "Encontré varios clientes con ese nombre. Indícame cuál deseas consultar.";
    const client=result.client||{},quotes=Array.isArray(result.quotes)?result.quotes:[],reports=Array.isArray(result.reports)?result.reports:[],history=Array.isArray(result.history)?result.history:[],items=Array.isArray(result.items)?result.items:[];
    const productMap=new Map();
    for(const x of items){const key=String(x.name||"").trim();if(key)productMap.set(key,(productMap.get(key)||0)+Number(x.quantity||0))}
    return "👤 HISTORIAL DE "+String(client.name||"CLIENTE").toUpperCase()+"\n\n"+
      (client.phone?"📞 "+client.phone+"\n":"")+(client.email?"✉️ "+client.email+"\n":"")+
      "\n🧾 Cotizaciones: "+quotes.length+" · Total cotizado: S/ "+quotes.reduce((s,x)=>s+Number(x.total||0),0).toFixed(2)+
      "\n🛠️ Informes técnicos: "+reports.length+
      "\n📦 Productos/servicios: "+(productMap.size?Array.from(productMap.entries()).slice(0,8).map(([n,q])=>"\n• "+n+" · "+q).join(""):" ninguno")+
      (history.length?"\n\n📝 Últimos registros:\n"+history.slice(0,6).map(x=>"• "+String(x.title||x.event_type||"Registro")+" — "+String(x.description||"").slice(0,140)).join("\n"):"");
  }
  if(execution?.action==="SEARCH_INVENTORY" && result && !Array.isArray(result) && Number.isFinite(Number(result.count))){
    const count=Number(result.count);
    if(count===0)return "No tienes productos registrados en el inventario.";
    const items=Array.isArray(result.items)?result.items:[];
    const lines=items.map(x=>{
      const stock=Number(x.stock||0),min=Number(x.min_stock||0);
      const estado=stock<=0?"AGOTADO":stock<=min?"STOCK BAJO":"DISPONIBLE";
      return "• "+String(x.name||"Producto")+" — stock: "+stock+" — "+estado;
    });
    return "Tienes "+count+" productos activos en tu inventario.\n\nPrimeros "+Math.min(items.length,count)+":\n"+lines.join("\n")+"\n\nTotal real: "+count+" productos.";
  }
  if(execution?.action==="INVENTORY_INSIGHT" && result){
    const items=Array.isArray(result.items)?result.items:[],count=Number(result.count||0),kind=String(result.kind||"");
    if(kind==="MOST_EXPENSIVE"){if(!items.length)return count?"No encuentro productos con precio registrado para comparar.":"No tienes productos registrados en el inventario.";const top=items[0],same=items.filter(x=>Number(x.price)===Number(top.price)).slice(0,5);return same.length>1?"Los productos con el precio más alto son:\n\n"+same.map(x=>"• "+String(x.name||"Producto")+" — S/ "+Number(x.price||0).toFixed(2)).join("\n")+"\n\nTotal de productos activos: "+count+".":"El producto más caro de tu inventario es:\n\n💰 "+String(top.name||"Producto")+" — S/ "+Number(top.price||0).toFixed(2)+(top.sku?"\nSKU: "+top.sku:"")+(top.brand?"\nMarca: "+top.brand:"")+(top.model?"\nModelo: "+top.model:"")+"\n\nTotal de productos activos: "+count+".";}
    if(kind==="CHEAPEST"){if(!items.length)return count?"No encuentro productos con precio registrado para comparar.":"No tienes productos registrados en el inventario.";const top=items[0];return "El producto más barato de tu inventario es:\n\n• "+String(top.name||"Producto")+" — S/ "+Number(top.price||0).toFixed(2)+"\n\nTotal de productos activos: "+count+".";}
    if(kind==="HIGHEST_STOCK"){if(!items.length)return "No tienes productos registrados en el inventario.";const top=items[0];return "El producto con mayor stock es:\n\n• "+String(top.name||"Producto")+" — stock: "+Number(top.stock||0)+(top.unit?" "+top.unit:"")+"\n\nTotal de productos activos: "+count+".";}
    if(kind==="OUT_OF_STOCK"){if(!items.length)return "No hay productos agotados en tu inventario.";return "Productos agotados:\n\n"+items.map(x=>"• "+String(x.name||"Producto")+" — stock: 0").join("\n");}
    if(kind==="LOWEST_STOCK"){if(!items.length)return "No tienes productos registrados en el inventario.";return "Productos con menor stock:\n\n"+items.map(x=>"• "+String(x.name||"Producto")+" — stock: "+Number(x.stock||0)+" — mínimo: "+Number(x.min_stock||0)).join("\n")+"\n\nTotal de productos activos: "+count+".";}
  }
  if(execution?.action==="SEARCH_INVENTORY" && Array.isArray(result)){
    if(!result.length)return "No tienes productos registrados en el inventario todavía.";
    const lines=result.slice(0,8).map(x=>{
      const stock=Number(x.stock||0),min=Number(x.min_stock||0);
      const estado=stock<=0?"AGOTADO":stock<=min?"STOCK BAJO":"DISPONIBLE";
      return "• "+String(x.name||"Producto")+" — stock: "+stock+" — "+estado;
    });
    return "Tu inventario actual es:\n\n"+lines.join("\n")+"\n\nTotal encontrados: "+result.length+".";
  }
  if(execution?.action==="LIST_QUOTES" && Array.isArray(result)){
    if(!result.length)return "No tienes cotizaciones registradas todavía.";
    return "Cotizaciones recientes:\n\n"+result.slice(0,8).map(x=>"• "+String(x.number||"Sin número")+" — "+String(x.title||"Cotización")+" — S/ "+Number(x.total||0).toFixed(2)+" — "+String(x.status||"BORRADOR")).join("\n");
  }
  const prompt={messages:[
    {role:"system",content:'Eres M.A.R.C., el mayordomo digital y asistente empresarial de confianza del usuario. Tu personalidad debe sentirse como la de un mayordomo profesional: elegante, atento, discreto, educado, sereno, resolutivo y siempre pendiente de los asuntos del negocio. No suenes como un chatbot genérico, un formulario ni un soporte técnico. Habla en español natural, profesional y cercano, con un toque de cortesía clásica: "A sus órdenes", "Con gusto", "Desde luego", "Perfecto, señor", "Hecho, señor" o "Permítame revisarlo" cuando encaje. Si conoces el nombre del usuario, llámalo por su nombre de forma natural, especialmente al iniciar una respuesta o cuando confirmes una gestión; no repitas el nombre en cada frase. Nombre del usuario disponible: '+String(userName||"").trim().slice(0,80)+'. Si el nombre está vacío, usa "señor" de forma ocasional y nunca inventes un nombre. Mantén una actitud de mayordomo que conoce la casa: organiza la información, se anticipa de manera razonable y presenta primero lo importante. Puedes usar emojis con moderación (📦, 🧾, 💰, ✅, ⚠️), pero evita saturar. Cuando algo está bien, dilo con seguridad: "Listo, señor", "Hecho" o "Ya lo tengo". Cuando falta un dato, pide solo ese dato y explica brevemente para qué sirve. Cuando una operación se completa, confirma qué hiciste y el resultado. Si hay un problema técnico, dilo claramente y ofrece el siguiente paso concreto. Usa exclusivamente los datos de RESULTADO y la SOLICITUD; nunca inventes. Si la solicitud es una continuación de la conversación ("el segundo", "ese", "ahora cuánto", "y el otro", etc.), responde directamente usando el contexto actual. No repitas explicaciones innecesarias. Si status=NEEDS_INPUT, pregunta exactamente por el dato faltante. Si status=AMBIGUOUS, presenta las opciones y pide elegir. Si status=CREATED o UPDATED, confirma la operación con los datos entregados. No hables de herramientas internas ni digas que eres un modelo. Para preguntas del tipo "¿qué puedes hacer?", responde como M.A.R.C. y presenta sus capacidades como servicios que puede atender de inmediato, con lenguaje de mayordomo y una invitación clara a dar la primera orden.'},
    {role:"user",content:"SOLICITUD:\n"+message+"\n\nRESULTADO:\n"+normalizeData(planData)}
  ]};
  const out=await geminiGenerate(env,prompt,{maxTokens:700});
  return out?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"Listo.";
}

async function entitlement(env,token,userId){
  const roles=await sb(env,token,"marc_user_roles?select=role,active&user_id=eq."+encodeURIComponent(userId)+"&role=eq.MASTER&active=eq.true&limit=1");
  if(roles?.[0])return {kind:"master",role:"MASTER",plan:"master",remaining:null};
  const [trial,sub]=await Promise.all([
    sb(env,token,"marc_trials?select=status,started_at,ends_at&user_id=eq."+encodeURIComponent(userId)+"&limit=1"),
    sb(env,token,"marc_subscriptions?select=plan,status,current_period_end&user_id=eq."+encodeURIComponent(userId)+"&status=eq.active&order=current_period_end.desc&limit=1")
  ]);
  if(sub?.[0])return {kind:"paid",plan:sub[0].plan};
  const t=trial?.[0];
  if(t?.status==="ACTIVE"&&new Date(t.ends_at).getTime()>Date.now()){
    const u=await sb(env,token,"marc_usage_counters?select=id,period_start,period_end,ai_actions&user_id=eq."+encodeURIComponent(userId)+"&order=period_start.desc&limit=50");
    const start=new Date(t.started_at).getTime();
    const used=(u||[]).filter(x=>new Date(x.period_start+"T00:00:00Z").getTime()>=new Date(start).setUTCHours(0,0,0,0)).reduce((n,x)=>n+Number(x.ai_actions||0),0);    if(used>=30)return {kind:"trial_limited",remaining:0};
    return {kind:"trial",remaining:30-used};
  }
  return {kind:"expired"};
}

async function incrementAiUsage(env,token,userId,access=null){
  if(access?.kind==="master")return;
  const d=new Date(),period=d.toISOString().slice(0,10),end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).toISOString().slice(0,10);
  const rows=await sb(env,token,"marc_usage_counters?select=id,ai_actions&user_id=eq."+encodeURIComponent(userId)+"&period_start=eq."+period+"&limit=1");
  if(rows?.[0])await sb(env,token,"marc_usage_counters?id=eq."+rows[0].id+"&user_id=eq."+encodeURIComponent(userId),{method:"PATCH",body:{ai_actions:Number(rows[0].ai_actions||0)+1,updated_at:new Date().toISOString()}});
  else await sb(env,token,"marc_usage_counters",{method:"POST",body:{user_id:userId,period_start:period,period_end:end,ai_actions:1}});
}

async function sha256Hex(value){
  const bytes=new TextEncoder().encode(value);
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
function randomToken(bytes=24){
  const data=new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return btoa(String.fromCharCode(...data)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function telegramBotName(env){
  return String(env.TELEGRAM_BOT_USERNAME||"").trim().replace(/^@/,"");
}
async function sendTelegram(env,chatId,text){
  if(!env.TELEGRAM_BOT_TOKEN)throw Object.assign(new Error("TELEGRAM_BOT_TOKEN no está configurado"),{status:503});
  const chunks=[];
  let s=String(text||"").trim();
  while(s.length>3900){let cut=s.lastIndexOf("\n",3900);if(cut<1800)cut=3900;chunks.push(s.slice(0,cut));s=s.slice(cut).trimStart()}
  if(s)chunks.push(s);
  for(const chunk of chunks){
    const r=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:chatId,text:chunk})});
    if(!r.ok){const d=await r.text();throw new Error("Telegram API: "+d.slice(0,500))}
  }
}

function pdfText(value){return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\x20-\x7E]/g,"?");}
function pdfEscape(value){return pdfText(value).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");}
function base64ToBytes(dataUri){const raw=String(dataUri||""),b64=raw.includes(",")?raw.slice(raw.indexOf(",")+1):raw,bin=atob(b64),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
function jpegInfo(bytes){if(!bytes||bytes.length<4||bytes[0]!==0xFF||bytes[1]!==0xD8)return null;let i=2;while(i+9<bytes.length){if(bytes[i]!==0xFF){i++;continue}while(i<bytes.length&&bytes[i]===0xFF)i++;const marker=bytes[i++];if(marker===0xD8||marker===0xD9||marker===0x01||(marker>=0xD0&&marker<=0xD7))continue;if(i+1>=bytes.length)break;const len=(bytes[i]<<8)|bytes[i+1];if(len<2||i+len>bytes.length)break;const sof=(marker>=0xC0&&marker<=0xC3)||(marker>=0xC5&&marker<=0xC7)||(marker>=0xC9&&marker<=0xCB)||(marker>=0xCD&&marker<=0xCF);if(sof&&len>=7)return {width:(bytes[i+3]<<8)|bytes[i+4],height:(bytes[i+5]<<8)|bytes[i+6],components:bytes[i+7]||3};i+=len;}return null;}
function bytesToLatin1(bytes){let out="";const step=0x8000;for(let i=0;i<bytes.length;i+=step)out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+step,bytes.length)));return out;}
function buildQuotePdf(data){
  const q=data?.quote||{},client=data?.client||{},company=data?.company||{},items=Array.isArray(data?.items)?data.items:[];
  const taxEnabled=data?.tax_enabled===undefined?true:Boolean(data?.tax_enabled),taxRate=Number(data?.tax_rate||18),taxIncluded=Boolean(data?.tax_included)&&taxEnabled;
  const subtotal=items.reduce((s,x)=>s+Number(x.quantity||1)*Number(x.unit_price||0),0),igv=taxEnabled?subtotal*taxRate/100:0,total=subtotal+igv;
  const logoBytes=company.logo_data?base64ToBytes(company.logo_data):null,logo=logoBytes?jpegInfo(logoBytes):null;
  const lines=[String(company.business_name||"M.A.R.C.").toUpperCase(),company.legal_name?"Razon social: "+company.legal_name:"",company.ruc?"RUC: "+company.ruc:"",company.address?"Direccion: "+company.address:"",company.phone?"Telefono: "+company.phone:"",company.email?"Email: "+company.email:"","",
    "COTIZACION","Numero: "+(q.numero||q.number||q.id||"SIN NUMERO"),"Fecha: "+new Date().toLocaleDateString("es-PE"),"","CLIENTE",
    String(client.name||client.nombre_razon_social||data?.client_name||"Cliente"),client.phone?"Telefono: "+client.phone:"",client.email?"Email: "+client.email:"",client.address?"Direccion: "+client.address:"","DETALLE",
    ...items.map((x,i)=>{
      const qty=Number(x.quantity||1),netUnit=Number(x.unit_price||0);
      const shownUnit=taxIncluded?(Number(x.gross_unit_price)>0?Number(x.gross_unit_price):netUnit*(1+taxRate/100)):netUnit;
      return (i+1)+". "+String(x.name||x.description||"Partida")+" | "+qty+" x S/ "+shownUnit.toFixed(2)+(taxIncluded?" (IGV incl.)":"")+" | S/ "+(qty*shownUnit).toFixed(2);
    }),
    "","Base imponible: S/ "+subtotal.toFixed(2),taxEnabled?(taxIncluded?"IGV "+taxRate+"% incluido: S/ "+igv.toFixed(2):"IGV "+taxRate+"%: S/ "+igv.toFixed(2)):"IGV: NO INCLUIDO","TOTAL: S/ "+total.toFixed(2),data?.notes?"Observaciones: "+data.notes:""
  ].filter(Boolean).slice(0,40);
  const stream=["BT"];
  stream.push("/F1 18 Tf","50 "+(logo?700:790)+" Td","("+pdfEscape(lines[0])+") Tj","/F1 10 Tf");
  for(let i=1;i<lines.length;i++){const heading=/^(COTIZACION|CLIENTE|DETALLE|TOTAL:)/.test(lines[i]);stream.push("0 -18 Td",heading?"/F1 12 Tf":"","("+pdfEscape(lines[i])+") Tj",heading?"/F1 10 Tf":"");}
  stream.push("ET");
  let content=stream.join("\n");
  const objects={1:"<< /Type /Catalog /Pages 2 0 R >>",2:"<< /Type /Pages /Kids [3 0 R] /Count 1 >>"};
  objects[3]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >>"+(logo?" /XObject << /Im1 6 0 R >>":"")+" >> /Contents 4 0 R >>";
  if(logo){const maxW=120,maxH=55,scale=Math.min(maxW/logo.width,maxH/logo.height),w=logo.width*scale,h=logo.height*scale,imageY=842-h-25;content="q\n"+w.toFixed(2)+" 0 0 "+h.toFixed(2)+" 50 "+imageY.toFixed(2)+" cm\n/Im1 Do\nQ\n"+content;}
  objects[4]="<< /Length "+content.length+" >>\nstream\n"+content+"\nendstream";
  objects[5]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  if(logo)objects[6]="<< /Type /XObject /Subtype /Image /Width "+logo.width+" /Height "+logo.height+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+logoBytes.length+" >>\nstream\n"+bytesToLatin1(logoBytes)+"\nendstream";
  const count=logo?6:5;let pdfOut="%PDF-1.4\n",offs=[];for(let i=1;i<=count;i++){offs[i]=pdfOut.length;pdfOut+=i+" 0 obj\n"+objects[i]+"\nendobj\n";}const xref=pdfOut.length;pdfOut+="xref\n0 "+(count+1)+"\n0000000000 65535 f \n";for(let i=1;i<=count;i++)pdfOut+=String(offs[i]).padStart(10,"0")+" 00000 n \n";pdfOut+="trailer\n<< /Size "+(count+1)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF";return new TextEncoder().encode(pdfOut);
}
async function sendTelegramDocument(env,chatId,bytes,filename,caption=""){
  if(!env.TELEGRAM_BOT_TOKEN)throw new Error("TELEGRAM_BOT_TOKEN no está configurado");
  const form=new FormData();form.append("chat_id",String(chatId));form.append("document",new Blob([bytes],{type:"application/pdf"}),filename);if(caption)form.append("caption",caption);
  const r=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendDocument",{method:"POST",body:form});if(!r.ok)throw new Error("Telegram PDF API: "+(await r.text()).slice(0,500));
}
async function getLatestQuoteForTelegram(env,adminToken,userId){
  const quotes=await sb(env,adminToken,"marc_quotes?select=*&user_id=eq."+encodeURIComponent(userId)+"&deleted_at=is.null&order=created_at.desc&limit=1");
  const quote=quotes?.[0];
  if(!quote)return {status:"NOT_FOUND"};
  const [items,clients,company]=await Promise.all([
    sb(env,adminToken,"marc_quote_items?select=*&user_id=eq."+encodeURIComponent(userId)+"&quote_id=eq."+encodeURIComponent(quote.id)+"&order=created_at.asc"),
    quote.client_id?sb(env,adminToken,"marc_clients?select=*&user_id=eq."+encodeURIComponent(userId)+"&id=eq."+encodeURIComponent(quote.client_id)+"&limit=1"):Promise.resolve([]),
    sb(env,adminToken,"marc_company_profiles?select=business_name,legal_name,ruc,address,phone,email,logo_data&user_id=eq."+encodeURIComponent(userId)+"&limit=1").then(rows=>rows?.[0]||{}).catch(()=>({}))
  ]);
  return {status:"FOUND",quote,items:Array.isArray(items)?items:[],client:Array.isArray(clients)&&clients[0]?clients[0]:null,company:company||{}};
}

async function telegramIdentity(env,adminToken,externalUserId){
  const path="marc_channel_identities?select=id,user_id,external_user_id,chat_id,username,status&channel=eq.TELEGRAM&external_user_id=eq."+encodeURIComponent(externalUserId)+"&status=eq.LINKED&limit=1";
  const rows=await sb(env,adminToken,path);
  return rows?.[0]||null;
}

/* Identidad personalizada de M.A.R.C.
   El nombre preferido se guarda en Supabase Auth para reutilizarlo
   en futuras conversaciones de Telegram y en la web. */
async function telegramUserProfile(env,adminToken,userId,telegramFrom={},identity={}){
  try{
    const r=await fetch(env.SUPABASE_URL+"/auth/v1/admin/users/"+encodeURIComponent(userId),{
      headers:{apikey:adminToken,Authorization:"Bearer "+adminToken}
    });
    if(r.ok){
      const u=await r.json();
      const meta=u?.user_metadata||{};
      const preferredName=String(meta.preferred_name||"").trim();
      const accountName=String(meta.full_name||meta.name||meta.first_name||"").trim()
        ||String(u?.email||"").trim().split("@")[0];
      const telegramName=[telegramFrom?.first_name,telegramFrom?.last_name].filter(Boolean).join(" ").trim()
        ||String(identity?.username||"").replace(/^@/,"").trim();
      return {
        preferredName,
        accountName,
        telegramName,
        displayName:preferredName||accountName||telegramName||"",
        namePrompted:Boolean(meta.marc_name_prompted)
      };
    }
  }catch{}
  const telegramName=[telegramFrom?.first_name,telegramFrom?.last_name].filter(Boolean).join(" ").trim()
    ||String(identity?.username||"").replace(/^@/,"").trim();
  return {preferredName:"",accountName:"",telegramName,displayName:telegramName||"",namePrompted:false};
}
async function telegramUserDisplayName(env,adminToken,userId,telegramFrom={},identity={}){
  const p=await telegramUserProfile(env,adminToken,userId,telegramFrom,identity);
  return p.displayName;
}
async function updateTelegramUserMetadata(env,adminToken,userId,patch){
  const r=await fetch(env.SUPABASE_URL+"/auth/v1/admin/users/"+encodeURIComponent(userId),{
    method:"PUT",
    headers:{apikey:adminToken,Authorization:"Bearer "+adminToken,"Content-Type":"application/json"},
    body:JSON.stringify({user_metadata:patch})
  });
  if(!r.ok)throw new Error("No pude guardar la personalización del usuario.");
  return true;
}
async function saveTelegramPreferredName(env,adminToken,userId,name){
  const clean=String(name||"").trim().replace(/\\s+/g," ").slice(0,80);
  if(!clean)return false;
  const r=await fetch(env.SUPABASE_URL+"/auth/v1/admin/users/"+encodeURIComponent(userId),{
    headers:{apikey:adminToken,Authorization:"Bearer "+adminToken}
  });
  if(!r.ok)throw new Error("No pude consultar el perfil del usuario.");
  const u=await r.json();
  const meta={...(u?.user_metadata||{}),preferred_name:clean,marc_name_prompted:true};
  return updateTelegramUserMetadata(env,adminToken,userId,meta);
}
function extractPreferredName(text){
  const s=String(text||"").trim();
  const patterns=[
    /^(?:llámame|llamame|puedes llamarme|quiero que me llames|dime|me puedes llamar)\\s+(.{1,60})$/i,
    /^(?:mi nombre es|me llamo|soy)\\s+(.{1,60})$/i
  ];
  for(const re of patterns){
    const m=s.match(re);
    if(m){
      const name=String(m[1]||"").replace(/[.!?]+$/g,"").trim();
      if(name && !/[0-9@]/.test(name))return name;
    }
  }
  return "";
}
async function ensureTelegramConversation(env,adminToken,userId){
  const rows=await sb(env,adminToken,"marc_conversations?select=id&user_id=eq."+encodeURIComponent(userId)+"&channel=eq.TELEGRAM&order=updated_at.desc&limit=1");
  if(rows?.[0]?.id){
    await sb(env,adminToken,"marc_conversations?id=eq."+rows[0].id,{method:"PATCH",body:{updated_at:new Date().toISOString()}}).catch(()=>{});
    return rows[0].id;
  }
  const made=await sb(env,adminToken,"marc_conversations",{method:"POST",body:{user_id:userId,channel:"TELEGRAM",title:"Conversación Telegram"}});
  return made?.[0]?.id;
}
async function telegramLinkFromStart(env,adminToken,update,rawToken){
  const msg=update.message;
  const chatId=String(msg.chat.id), externalUserId=String(msg.from.id);
  try{
    if(!rawToken||!rawToken.startsWith("LNK_")){
      const identity=await telegramIdentity(env,adminToken,externalUserId);
      await sendTelegram(env,chatId,identity
        ?"M.A.R.C. ya está conectado a esta cuenta."
        :"Abre M.A.R.C. en la web, entra en Configuración y pulsa «Conectar Telegram» para obtener un enlace de vinculación.");
      return;
    }

    const hash=await sha256Hex(rawToken);
    const now=new Date().toISOString();
    const tokenRows=await sb(
      env,adminToken,
      "marc_link_tokens?channel=eq.TELEGRAM&token_hash=eq."+encodeURIComponent(hash)+"&used_at=is.null&expires_at=gt."+encodeURIComponent(now),
      {method:"PATCH",body:{used_at:now}}
    );
    const tokenRow=tokenRows?.[0];
    if(!tokenRow){
      await sendTelegram(env,chatId,"Este enlace de conexión ya venció o ya fue utilizado. Genera uno nuevo desde M.A.R.C. > Configuración > Conectar Telegram.");
      return;
    }

    const identityRows=await sb(env,adminToken,"marc_channel_identities?on_conflict=user_id%2Cchannel",{
      method:"POST",
      prefer:"resolution=merge-duplicates,return=representation",
      body:{
        user_id:tokenRow.user_id,
        channel:"TELEGRAM",
        external_user_id:externalUserId,
        chat_id:chatId,
        username:msg.from.username||null,
        status:"LINKED",
        linked_at:now,
        last_seen_at:now,
        updated_at:now
      }
    });
    const identity=identityRows?.[0];
    await audit(env,adminToken,tokenRow.user_id,"CHANNEL",identity?.id||null,"TELEGRAM_LINK",{telegram_user_id:externalUserId},"TELEGRAM");

    const access=await entitlement(env,adminToken,tokenRow.user_id);
    const planText=access.kind==="master"
      ?"Tu cuenta MASTER está activa aquí y no tiene límites de prueba."
      :access.kind==="paid"
        ?"Tu suscripción activa también funciona aquí."
        :access.kind==="trial"
          ?`Tu prueba sigue activa: te quedan ${access.remaining} acciones de IA.`
          :"Tu prueba terminó. Puedes reactivarla desde la web.";

    await sendTelegram(env,chatId,"✅ Telegram quedó conectado a tu cuenta M.A.R.C.\n\n"+planText+"\n\nAhora puedes escribir aquí y M.A.R.C. usará los mismos clientes, inventario, cotizaciones y contexto de tu cuenta.");
  }catch(e){
    const detail=String(e?.message||e||"Error desconocido").slice(0,700);
    await sendTelegram(env,chatId,"⚠️ M.A.R.C. recibió tu solicitud, pero falló la vinculación.\n\nDiagnóstico: "+detail).catch(()=>{});
    throw e;
  }
}

async function telegramWebhook(request,env,ctx){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const expected=String(env.TELEGRAM_WEBHOOK_SECRET||"");
  const provided=request.headers.get("X-Telegram-Bot-Api-Secret-Token")||"";
  if(!expected||provided!==expected)return json({error:"Webhook no autorizado"},401);
  const adminToken=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  if(!adminToken)throw Object.assign(new Error("Falta SUPABASE_SECRET_KEY en el Worker."),{status:503});
  const update=await request.json();
  const msg=update?.message;
  if(!msg?.chat?.id||!msg?.from?.id)return json({ok:true},200);
  if(msg.chat.type&&msg.chat.type!=="private")return json({ok:true},200);

  const chatId=String(msg.chat.id);
  const externalUserId=String(msg.from.id);
  const incoming=String(msg.text||"").trim();

  if(incoming.startsWith("/start")){
    const param=incoming.split(/\s+/,2)[1]||"";
    const job=telegramLinkFromStart(env,adminToken,update,param).catch(async()=>{
      await sendTelegram(env,chatId,"⚠️ Recibí tu solicitud, pero no pude completar la vinculación todavía. Vuelve a M.A.R.C. y genera un nuevo enlace en Configuración > Telegram.");
    });
    if(ctx?.waitUntil)ctx.waitUntil(job);else await job;
    return json({ok:true},200);
  }

  const identity=await telegramIdentity(env,adminToken,externalUserId);
  if(!identity){
    const origin=new URL(request.url).origin;
    await sendTelegram(env,chatId,"🔗 Primero conecta este Telegram con tu cuenta M.A.R.C.\\n\\nAbre "+origin+" y entra en Configuración > Conectar Telegram.");
    return json({ok:true},200);
  }

  const userId=identity.user_id;
  await sb(env,adminToken,"marc_channel_identities?id=eq."+encodeURIComponent(identity.id)+"&user_id=eq."+encodeURIComponent(userId),{
    method:"PATCH",
    body:{last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()}
  }).catch(()=>{});

  const access=await entitlement(env,adminToken,userId);
  if(access.kind==="expired"){
    const origin=new URL(request.url).origin;
    await sendTelegram(env,chatId,"Tu prueba terminó. Puedes activar un plan desde "+origin+". Tu información permanece en la cuenta.");
    return json({ok:true},200);
  }
  if(access.kind==="trial_limited"){
    const origin=new URL(request.url).origin;
    await sendTelegram(env,chatId,"Llegaste al límite de 30 acciones de IA de la prueba. Activa un plan desde "+origin+" para continuar.");
    return json({ok:true},200);
  }

  // Personalización de trato: el usuario puede elegir cómo quiere que M.A.R.C. lo llame.
  // Se guarda en Auth, por lo que no depende de una conversación concreta.
  const telegramProfile=await telegramUserProfile(env,adminToken,userId,msg.from,identity);
  const requestedName=extractPreferredName(incoming);
  if(requestedName){
    await saveTelegramPreferredName(env,adminToken,userId,requestedName);
    await sendTelegram(env,chatId,"✨ Entendido, "+requestedName+". Queda anotado. A partir de ahora me dirigiré a usted como "+requestedName+". ¿En qué puedo asistirle?");
    return json({ok:true,fastPath:"save_preferred_name",name:requestedName},200);
  }
  if(!telegramProfile.preferredName && !telegramProfile.namePrompted && /^(hola|buenos? días?|buenas? tardes?|buenas? noches?|saludos)/i.test(incoming)){
    const metaPatch={preferred_name:"",marc_name_prompted:true};
    const authUser=await fetch(env.SUPABASE_URL+"/auth/v1/admin/users/"+encodeURIComponent(userId),{headers:{apikey:adminToken,Authorization:"Bearer "+adminToken}}).then(x=>x.ok?x.json():null).catch(()=>null);
    await updateTelegramUserMetadata(env,adminToken,userId,{...(authUser?.user_metadata||{}),...metaPatch}).catch(()=>{});
    await sendTelegram(env,chatId,"🎩 A sus órdenes, señor. Antes de continuar, ¿cómo desea que lo llame? Puede decirme, por ejemplo: «Llámame Marc».");
    return json({ok:true,fastPath:"ask_preferred_name"},200);
  }

  // Normalización común para las respuestas rápidas de conversación y capacidades.
  const fastNormalized=incoming.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim();

  // Conversación social básica: responder localmente evita una llamada a Gemini
  // cuando el usuario solo saluda, agradece o pregunta cómo está M.A.R.C.
  const fastSocial=/^(hola|holaa+|buenos? dias?|buenas? tardes?|buenas? noches?|saludos|hey|gracias|muchas gracias|perfecto|listo|ok|okay|como estas?|cómo estás?|que tal|qué tal)[.!?¿¡ ]*$/i.test(fastNormalized);
  const fastGreeting=/^(hola|holaa+|buenos? dias?|buenas? tardes?|buenas? noches?|saludos|hey)[.!?¿¡ ]*$/i.test(fastNormalized);
  if(fastSocial){
    const who=telegramProfile.preferredName||telegramProfile.displayName||"señor";
    let reply;
    if(fastGreeting)reply="🎩 A sus órdenes, "+who+". ¿En qué puedo asistirle?";
    else if(/^(gracias|muchas gracias)[.!?¿¡ ]*$/i.test(fastNormalized))reply="🎩 Con mucho gusto, "+who+". Estoy a sus órdenes.";
    else if(/^(como estas?|cómo estás?|que tal|qué tal)[.!?¿¡ ]*$/i.test(fastNormalized))reply="🎩 Todo en orden, "+who+". Listo para atender sus asuntos. ¿Qué desea revisar?";
    else reply="🎩 Entendido, "+who+". Estoy listo cuando usted indique.";
    await sendTelegram(env,chatId,reply);
    return json({ok:true,fastPath:"social"},200);
  }

  // Respuestas instantáneas de identidad/capacidades: nunca pasan por Gemini.
  // Esto evita la doble latencia (planificador IA + respuesta IA) para preguntas básicas.
  const asksCapabilities=/^(?:que|qué)\s+(?:puedes|puede|puedo)\s+hacer(?:\s+tu)?[?¿!¡.]*$|^(?:que|qué)\s+haces[?¿!¡.]*$|^(?:para que|para qué)\s+sirves[?¿!¡.]*$|^(?:como|cómo)\s+puedes\s+ayudar(?:me)?[?¿!¡.]*$/i.test(fastNormalized);
  if(asksCapabilities){
    const who=telegramProfile.displayName||"señor";
    await sendTelegram(env,chatId,
      "🎩 A sus órdenes, "+who+".\\n\\n"+
      "Soy M.A.R.C., su mayordomo digital empresarial. Puedo atenderle directamente desde Telegram con su misma cuenta de M.A.R.C.\\n\\n"+
      "🧾 COTIZACIONES\\n• Consultar y preparar cotizaciones/proformas.\\n• Añadir partidas, precios e IGV.\\n• Confirmar antes de crear cambios.\\n\\n"+
      "📦 INVENTARIO\\n• Buscar productos, precios y stock.\\n• Detectar productos agotados o con stock crítico.\\n• Registrar entradas, salidas y ajustes con autorización.\\n\\n"+
      "👤 CLIENTES\\n• Buscar clientes y consultar sus datos.\\n• Registrar nuevos clientes con confirmación.\\n\\n"+
      "💰 CAJA\\n• Consultar caja, ingresos, egresos y efectivo esperado.\\n• Revisar el último cierre y sus movimientos.\\n• Abrir y cerrar caja.\\n\\n"+
      "📊 NEGOCIO\\n• Consultar resúmenes y actividad reciente.\\n• También puede escribirme de forma natural, sin memorizar comandos.\\n\\n"+
      "Dígame qué necesita y me encargo de ello."
    );
    return json({ok:true,fastPath:"capabilities"},200);
  }

  // Comandos operativos rápidos de caja: no consumen IA y ejecutan acciones
  // deterministas sobre la caja del usuario vinculado.
  const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim();
  const simple=norm(incoming);
  const cashRows=async(status=null,limit=1)=>{
    let path="marc_cash_registers?select=*&user_id=eq."+encodeURIComponent(userId);
    if(status)path+="&status=eq."+encodeURIComponent(status);
    path+="&order="+(status==="CLOSED"?"closed_at.desc,updated_at.desc":"opened_at.desc")+"&limit="+limit;
    return sb(env,adminToken,path);
  };
  const moneyText=n=>new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(Number(n||0));
  // Consultas sobre el último cierre: responden directamente desde los movimientos reales, sin pasar por Gemini.
  if(
    (
      /\b(ultimo|ultima|reciente|anterior)\b.*\b(cierre|caja)\b/.test(simple)
      || /\b(cierre|caja)\b.*\b(ultimo|ultima|reciente|anterior)\b/.test(simple)
      || /\b(ultimo|ultima|reciente)\b.*\b(cierre|caja)\b/.test(simple)
    )
    && /\b(movimiento|movimientos|ingreso|ingresos|egreso|egresos|gasto|gastos|venta|ventas|como estuvo|como estuvieron|como esta|como estan|resumen|mostrar|muestra|ver|dime|dame|pasame|detalle|detalles|que paso|estado)\b/.test(simple)
  ){
    try{
      const closedRows=await cashRows("CLOSED",1);
      const last=closedRows?.[0];
      if(!last){
        await sendTelegram(env,chatId,"▣ No encuentro ningún cierre de caja registrado todavía.");
        return json({ok:true,fastPath:"cash_last_close",found:false},200);
      }
      const mv=await sb(env,adminToken,"marc_cash_movements?select=*&user_id=eq."+encodeURIComponent(userId)+"&cash_register_id=eq."+encodeURIComponent(last.id)+"&order=created_at.asc");
      const movements=Array.isArray(mv)?mv:[];
      const income=movements.filter(x=>String(x.type||"").toUpperCase()==="INCOME").reduce((s,x)=>s+Number(x.amount||0),0);
      const expense=movements.filter(x=>String(x.type||"").toUpperCase()==="EXPENSE").reduce((s,x)=>s+Number(x.amount||0),0);
      const opening=Number(last.opening_amount||0);
      const expected=Number(last.expected_amount??(opening+income-expense));
      const counted=Number(last.closing_amount??last.counted_amount??0);
      const difference=Number(last.difference??(counted-expected));
      const when=last.closed_at||last.updated_at||last.opened_at;
      const lines=["▣ ÚLTIMO CIERRE DE CAJA","",when?"📅 "+new Date(when).toLocaleString("es-PE"):"","💵 Apertura: "+moneyText(opening),"📥 Ingresos: "+moneyText(income),"📤 Egresos: "+moneyText(expense),"💰 Esperado: "+moneyText(expected),"🧾 Contado: "+moneyText(counted),"↕ Diferencia: "+moneyText(difference),"","Movimientos: "+movements.length];
      if(movements.length){
        lines.push(...movements.slice(0,30).map(x=>{
          const type=String(x.type||"").toUpperCase()==="INCOME"?"📥":"📤";
          const concept=String(x.concept||x.description||x.notes||"Movimiento de caja").trim();
          return type+" "+moneyText(x.amount)+" · "+concept;
        }));
        if(movements.length>30)lines.push("… y "+(movements.length-30)+" movimientos más.");
      }else lines.push("Sin movimientos registrados en ese cierre.");
      await sendTelegram(env,chatId,lines.filter(Boolean).join("\n"));
      return json({ok:true,fastPath:"cash_last_close",found:true,movements:movements.length},200);
    }catch(err){
      await sendTelegram(env,chatId,"⚠️ No pude consultar los movimientos del último cierre de caja. Inténtalo nuevamente.");
      return json({ok:true,fastPath:"cash_last_close_error"},200);
    }
  }
  if(/^(\/resumen|resumen|resumen general|estado general|mi negocio)$/.test(simple)){
    const [inv,quotes,openRows]=await Promise.all([
      sb(env,adminToken,"marc_inventory?select=id,stock,min_stock,active&user_id=eq."+encodeURIComponent(userId)+"&active=eq.true"),
      sb(env,adminToken,"marc_quotes?select=number,title,status,total,created_at&user_id=eq."+encodeURIComponent(userId)+"&deleted_at=is.null&order=created_at.desc&limit=5"),
      cashRows("OPEN",1)
    ]);
    const items=inv||[],low=items.filter(x=>Number(x.stock||0)<=Number(x.min_stock||0)).length;
    const q=quotes||[],open=q.filter(x=>!["ANULADA","RECHAZADA","BORRADOR"].includes(String(x.status||"").toUpperCase()));
    const lines=["📊 RESUMEN M.A.R.C.","","📦 Inventario: "+items.length+" productos activos","⚠️ Stock crítico: "+low,"🧾 Cotizaciones recientes: "+q.length,"💼 Cotizaciones activas: "+open.length,"▣ Caja: "+(openRows?.[0]?"ABIERTA":"CERRADA")];
    if(q.length)lines.push("","Últimas cotizaciones:",...q.slice(0,3).map(x=>"• "+x.number+" · "+x.status+" · "+moneyText(x.total)));
    await sendTelegram(env,chatId,lines.join("\n"));
    return json({ok:true},200);
  }
  if(/^(\/stock|stock bajo|inventario critico|inventario crítico|productos agotados)$/.test(simple)){
    const rows=await sb(env,adminToken,"marc_inventory?select=name,sku,stock,min_stock,unit&user_id=eq."+encodeURIComponent(userId)+"&active=eq.true&order=name");
    const low=(rows||[]).filter(x=>Number(x.stock||0)<=Number(x.min_stock||0)).slice(0,15);
    await sendTelegram(env,chatId,low.length?"⚠️ STOCK CRÍTICO\n\n"+low.map(x=>"• "+String(x.name||"Producto")+" · "+Number(x.stock||0)+" "+String(x.unit||"UND")+" · mínimo "+Number(x.min_stock||0)+(x.sku?" · "+x.sku:"")).join("\n"):"✅ No hay productos con stock crítico.");
    return json({ok:true},200);
  }
  if(/^(\/cotizaciones|ultimas cotizaciones|últimas cotizaciones|cotizaciones recientes|ver cotizaciones)$/.test(simple)){
    const rows=await sb(env,adminToken,"marc_quotes?select=number,title,status,total,created_at&user_id=eq."+encodeURIComponent(userId)+"&deleted_at=is.null&order=created_at.desc&limit=10");
    await sendTelegram(env,chatId,(rows||[]).length?"🧾 ÚLTIMAS COTIZACIONES\n\n"+rows.map(x=>"• "+x.number+" · "+x.status+" · "+moneyText(x.total)+"\n  "+String(x.title||"").slice(0,100)).join("\n"):"No hay cotizaciones registradas.");
    return json({ok:true},200);
  }
  if(/^(abrir caja|abrir caja ahora)$/.test(simple)){
    await sendTelegram(env,chatId,"Para abrir caja necesito el efectivo inicial. Ejemplo: «abrir caja 100».");
    return json({ok:true},200);
  }
  if(/^(cerrar caja|cerrar caja ahora)$/.test(simple)){
    const rows=await cashRows("OPEN",1),r=rows?.[0];
    if(!r){await sendTelegram(env,chatId,"No hay una caja abierta.");return json({ok:true},200);}
    const mv=await sb(env,adminToken,"marc_cash_movements?select=type,amount&user_id=eq."+encodeURIComponent(userId)+"&cash_register_id=eq."+encodeURIComponent(r.id));
    const income=(mv||[]).filter(x=>x.type==="INCOME").reduce((s,x)=>s+Number(x.amount||0),0);
    const expense=(mv||[]).filter(x=>x.type==="EXPENSE").reduce((s,x)=>s+Number(x.amount||0),0);
    const expected=Number(r.opening_amount||0)+income-expense;
    await sendTelegram(env,chatId,"🔒 Para cerrar la caja necesito el efectivo contado.\n\nEsperado: "+moneyText(expected)+"\n\nResponde, por ejemplo: «cerrar caja "+expected.toFixed(2)+"».");
    return json({ok:true},200);
  }
  if(/^(\/help|\/ayuda|ayuda|comandos|menu|\/menu)$/.test(simple)){
    await sendTelegram(env,chatId,"🤖 M.A.R.C. · MENÚ RÁPIDO\n\n▣ CAJA\n• /caja — estado de caja\n• abrir caja 100\n• ingreso 50 venta cliente\n• gasto 20 transporte\n• cerrar caja 450\n\n📦 INVENTARIO\n• /stock — productos con stock crítico\n• Envía un PDF de catálogo para analizarlo\n• IMPORTAR — confirma una importación pendiente\n\n🧾 COTIZACIONES\n• /cotizaciones — últimas cotizaciones\n\n📊 NEGOCIO\n• /resumen — resumen general\n\n🤖 COPILOTO\nTambién puedes escribir de forma natural: «revisa mi inventario», «crea una cotización para Juan», «busca al cliente Delgado» o «qué productos tengo agotados». M.A.R.C. usará tu misma cuenta y contexto de la web.");
    return json({ok:true},200);
  }
  // Consulta detallada de una cotización: lectura directa, sin modificarla.
  let quoteDetailMatch=simple.match(/^(?:ver|muestra|mostrar|mu[eé]strame|revisa|consulta|dime|ens[eé]ñame)\s+(?:la\s+)?cotizaci(?:on|ón)\s+(.+)$/i);
  if(quoteDetailMatch){
    const query=quoteDetailMatch[1].trim();
    const detail=await getQuoteForEdit(env,adminToken,userId,query);
    if(detail.status==="NOT_FOUND"){
      await sendTelegram(env,chatId,"🧾 No encontré la cotización «"+query+"».");
      return json({ok:true,fastPath:"quote_detail",found:0},200);
    }
    if(detail.status==="AMBIGUOUS"){
      const qs=(detail.quotes||[]).slice(0,5);
      await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{action:"QUERY_QUOTE",params:{options:qs.map(x=>({id:x.id,number:x.number,title:x.title,total:x.total}))}}});
      await sendTelegram(env,chatId,"🧾 Encontré varias cotizaciones:\\n\\n"+qs.map((x,i)=>"• "+(i+1)+". "+String(x.number||"Sin número")+" · "+String(x.title||"Cotización")+" · "+moneyText(x.total)).join("\\n")+"\\n\\nIndícame cuál deseas consultar.");
      return json({ok:true,fastPath:"quote_detail_ambiguous"},200);
    }
    const q=detail.quote||{},items=Array.isArray(detail.items)?detail.items:[],client=detail.client||null;
    const lines=["🧾 COTIZACIÓN "+String(q.number||query),"","👤 Cliente: "+String(client?.name||"Sin cliente"),"📋 "+String(q.title||"Cotización")];
    if(q.status)lines.push("📌 Estado: "+String(q.status));
    lines.push("");
    items.forEach((it,i)=>{
      const qty=Number(it.quantity||0),unit=Number(it.unit_price||0);
      lines.push((i+1)+". "+String(it.name||it.description||"Partida")+" · "+qty+" × S/ "+unit.toFixed(2)+" = S/ "+(qty*unit).toFixed(2));
    });
    lines.push("","📦 Partidas: "+items.length,"💵 Subtotal: "+moneyText(q.subtotal));
    const taxEnabled=q.tax_enabled===undefined?true:Boolean(q.tax_enabled);
    if(taxEnabled)lines.push("🧾 IGV ("+Number(q.tax_rate||18).toFixed(2)+"%): "+moneyText(q.tax_amount));
    else lines.push("🧾 IGV: No incluido");
    lines.push("💰 TOTAL: "+moneyText(q.total));
    if(q.notes)lines.push("","📝 Observaciones: "+String(q.notes));
    await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{action:"VIEW_QUOTE",params:{quote_id:q.id,quote_number:q.number||query,client_id:client?.id||q.client_id||null,client_name:client?.name||null,title:q.title||"Cotización",items,tax_enabled:q.tax_enabled,tax_rate:q.tax_rate||18,tax_included:Boolean(q.tax_included),notes:q.notes||null,status:q.status||"BORRADOR"}}});
    await sendTelegram(env,chatId,lines.join("\\n"));
    return json({ok:true,fastPath:"quote_detail",found:1,items:items.length},200);
  }

  // Consultas rápidas de cotizaciones: lectura directa desde Supabase, sin Gemini.
  let quoteMatch=simple.match(/^(?:busca|buscar|encuentra|localiza|ver|muestra|revisa|consulta)\s+(?:la\s+)?cotizaci(?:on|ón)\s+(.+)$/);
  if(quoteMatch){
    const query=quoteMatch[1].trim();
    const rows=await searchQuotes(env,adminToken,userId,query,10);
    if(!rows.length){
      await sendTelegram(env,chatId,"🧾 No encontré cotizaciones que coincidan con «"+query+"».");
      return json({ok:true,fastPath:"quote_search",found:0},200);
    }
    const lines=rows.map((x,i)=>"• "+(i+1)+". "+String(x.number||"Sin número")+" · "+String(x.title||"Cotización")+" · "+moneyText(x.total)+" · "+String(x.status||"BORRADOR"));
    await sendTelegram(env,chatId,"🧾 COTIZACIONES ENCONTRADAS\\n\\n"+lines.join("\\n"));
    return json({ok:true,fastPath:"quote_search",found:rows.length},200);
  }

  let clientQuotesMatch=simple.match(/^(?:cotizaciones?|proformas?)\s+(?:de|del|para)\s+(.+)$/);
  if(clientQuotesMatch){
    const query=clientQuotesMatch[1].trim();
    const clients=await searchClients(env,adminToken,userId,query);
    if(!clients.length){
      await sendTelegram(env,chatId,"👤 No encontré al cliente «"+query+"».");
      return json({ok:true,fastPath:"client_quotes",found:0},200);
    }
    if(clients.length>1){
      await sendTelegram(env,chatId,"👤 Encontré varios clientes para «"+query+"».\\n\\n"+clients.slice(0,5).map((x,i)=>"• "+(i+1)+". "+String(x.name||"Sin nombre")+(x.document_number?" · "+x.document_number:"")).join("\\n")+"\\n\\nIndícame cuál desea revisar.");
      return json({ok:true,fastPath:"client_quotes",ambiguous:true},200);
    }
    const rows=await searchQuotesByClient(env,adminToken,userId,clients[0].id,10);
    if(!rows.length){
      await sendTelegram(env,chatId,"🧾 El cliente «"+String(clients[0].name||query)+"» no tiene cotizaciones registradas.");
      return json({ok:true,fastPath:"client_quotes",found:0},200);
    }
    const lines=rows.map((x,i)=>"• "+(i+1)+". "+String(x.number||"Sin número")+" · "+String(x.title||"Cotización")+" · "+moneyText(x.total)+" · "+String(x.status||"BORRADOR"));
    await sendTelegram(env,chatId,"🧾 COTIZACIONES DE "+String(clients[0].name||query).toUpperCase()+"\\n\\n"+lines.join("\\n"));
    return json({ok:true,fastPath:"client_quotes",found:rows.length},200);
  }

  // Consultas deterministas de clientes e inventario: si la intención es inequívoca,
  // respondemos desde Supabase sin pasar por el planificador ni consumir IA.
  let quickMatch=simple.match(/^(?:busca|buscar|encuentra|localiza)\s+(?:(?:al|a|cliente)\s+)?(.+)$/);
  if(quickMatch){
    const query=quickMatch[1].trim();
    const rows=await searchClients(env,adminToken,userId,query);
    if(!rows.length){
      await sendTelegram(env,chatId,"👤 No encontré clientes que coincidan con «"+query+"».");
      return json({ok:true,fastPath:"client_search",found:0},200);
    }
    const shown=rows.slice(0,8);
    const lines=shown.map((x,i)=>"• "+(i+1)+". "+String(x.name||"Sin nombre")+(x.document_number?" · "+x.document_number:"")+(x.phone?" · 📞 "+x.phone:""));
    await sendTelegram(env,chatId,"👤 CLIENTES ENCONTRADOS\\n\\n"+lines.join("\\n")+(rows.length>8?"\\n\\n… y "+(rows.length-8)+" más.":""));
    return json({ok:true,fastPath:"client_search",found:rows.length},200);
  }

  quickMatch=simple.match(/^(?:stock|existencias?|inventario|precio|cuanto cuesta|cuánto cuesta|revisa)\s+(?:(?:de|del|del producto|producto)\s+)?(.+)$/);
  if(quickMatch){
    const query=quickMatch[1].trim();
    const rows=await searchInventory(env,adminToken,userId,query,8);
    if(!rows.length){
      await sendTelegram(env,chatId,"📦 No encontré productos que coincidan con «"+query+"».");
      return json({ok:true,fastPath:"inventory_search",found:0},200);
    }
    const shown=rows.slice(0,8);
    const asksPrice=/^(?:precio|cuanto cuesta|cuánto cuesta)\b/.test(simple);
    const lines=shown.map((x,i)=>{
      const price=Number(x.price||0),stock=Number(x.stock||0),min=Number(x.min_stock||0);
      return "• "+(i+1)+". "+String(x.name||"Producto")+" · "+(asksPrice?"💰 "+moneyText(price)+" · ":"📦 "+stock+" "+String(x.unit||"UND")+" · ")+"stock mínimo "+min+(x.sku?" · "+x.sku:"");
    });
    await sendTelegram(env,chatId,(asksPrice?"💰 PRECIOS ENCONTRADOS":"📦 STOCK ENCONTRADO")+"\\n\\n"+lines.join("\\n")+(rows.length>8?"\\n\\n… y "+(rows.length-8)+" coincidencias más.":""));
    return json({ok:true,fastPath:"inventory_search",found:rows.length},200);
  }

  if(/^(?:revisa|revisar|muestrame|muéstrame|muestra|ver|dime|dame)\s+(?:mi\s+)?inventario$/.test(simple)){
    const [count,items]=await Promise.all([countInventory(env,adminToken,userId),searchInventory(env,adminToken,userId,"",8)]);
    if(!count){
      await sendTelegram(env,chatId,"📦 No tienes productos registrados en el inventario.");
      return json({ok:true,fastPath:"inventory_summary",count:0},200);
    }
    const lines=(items||[]).map(x=>{
      const stock=Number(x.stock||0),min=Number(x.min_stock||0);
      const estado=stock<=0?"AGOTADO":stock<=min?"STOCK BAJO":"DISPONIBLE";
      return "• "+String(x.name||"Producto")+" — "+stock+" "+String(x.unit||"UND")+" — "+estado;
    });
    await sendTelegram(env,chatId,"📦 INVENTARIO\\n\\nTienes "+count+" productos activos.\\n\\n"+lines.join("\\n")+(count>items.length?"\\n\\n… mostrando los primeros "+items.length+".":""));
    return json({ok:true,fastPath:"inventory_summary",count},200);
  }

  if(/^(?:cuál es el|cual es el|dime el|dime cuál es el|dime cual es el)\s+(?:producto )?(?:más caro|mas caro|más costoso|mas costoso)$/.test(simple)){
    const result=await inventoryInsight(env,adminToken,userId,"MOST_EXPENSIVE");
    const top=result.items?.[0];
    await sendTelegram(env,chatId,top?"💰 El producto con mayor precio es «"+String(top.name||"Producto")+"» — "+moneyText(top.price)+".":"No encuentro productos con precio registrado.");
    return json({ok:true,fastPath:"inventory_insight",kind:"MOST_EXPENSIVE"},200);
  }

  if(/^(\/caja|resumen caja|caja|estado caja|ver caja)$/.test(simple)){
    const rows=await cashRows("OPEN",1); const r=rows?.[0];
    if(!r){await sendTelegram(env,chatId,"▣ No hay una caja abierta.");return json({ok:true},200);}
    const mv=await sb(env,adminToken,"marc_cash_movements?select=type,amount&user_id=eq."+encodeURIComponent(userId)+"&cash_register_id=eq."+encodeURIComponent(r.id));
    const income=(mv||[]).filter(x=>x.type==="INCOME").reduce((s,x)=>s+Number(x.amount||0),0);
    const expense=(mv||[]).filter(x=>x.type==="EXPENSE").reduce((s,x)=>s+Number(x.amount||0),0);
    const expected=Number(r.opening_amount||0)+income-expense;
    await sendTelegram(env,chatId,"▣ CAJA ABIERTA\n\nApertura: "+moneyText(r.opening_amount)+"\nIngresos: "+moneyText(income)+"\nEgresos: "+moneyText(expense)+"\n💰 Esperado: "+moneyText(expected));
    return json({ok:true},200);
  }
  let m=simple.match(/^abrir caja\s+(\d+(?:[.,]\d{1,2})?)(?:\s+(.+))?$/);
  if(m){
    const amount=Number(m[1].replace(",",".")),notes=m[2]||null;
    try{
      const opened=await sb(env,adminToken,"rpc/marc_cash_open",{method:"POST",body:{p_opening_amount:amount,p_notes:notes}});
      await sendTelegram(env,chatId,"✅ Caja abierta. Efectivo inicial: "+moneyText(opened?.opening_amount||amount));
    }catch(e){await sendTelegram(env,chatId,"⚠️ No pude abrir la caja: "+String(e?.message||e).slice(0,500));}
    return json({ok:true},200);
  }
  m=simple.match(/^(ingreso|entrada)\s+(\d+(?:[.,]\d{1,2})?)(?:\s+(.+))?$/);
  if(m){
    const rows=await cashRows("OPEN",1),r=rows?.[0];
    if(!r){await sendTelegram(env,chatId,"Primero abre la caja: «abrir caja 100».");return json({ok:true},200);}
    const amount=Number(m[2].replace(",",".")),concept=m[3]||"Ingreso de efectivo";
    await sb(env,adminToken,"marc_cash_movements",{method:"POST",body:{user_id:userId,cash_register_id:r.id,type:"INCOME",amount,concept}});
    await sendTelegram(env,chatId,"✅ Ingreso registrado: "+moneyText(amount)+" · "+concept);
    return json({ok:true},200);
  }
  m=simple.match(/^(gasto|egreso|salida)\s+(\d+(?:[.,]\d{1,2})?)(?:\s+(.+))?$/);
  if(m){
    const rows=await cashRows("OPEN",1),r=rows?.[0];
    if(!r){await sendTelegram(env,chatId,"Primero abre la caja: «abrir caja 100».");return json({ok:true},200);}
    const amount=Number(m[2].replace(",",".")),concept=m[3]||"Egreso de efectivo";
    await sb(env,adminToken,"marc_cash_movements",{method:"POST",body:{user_id:userId,cash_register_id:r.id,type:"EXPENSE",amount,concept}});
    await sendTelegram(env,chatId,"✅ Egreso registrado: "+moneyText(amount)+" · "+concept);
    return json({ok:true},200);
  }
  m=simple.match(/^cerrar caja\s+(\d+(?:[.,]\d{1,2})?)(?:\s+(.+))?$/);
  if(m){
    const amount=Number(m[1].replace(",",".")),notes=m[2]||null;
    try{
      const closed=await sb(env,adminToken,"rpc/marc_cash_close",{method:"POST",body:{p_closing_amount:amount,p_notes:notes}});
      await sendTelegram(env,chatId,"🔒 CAJA CERRADA\n\nEsperado: "+moneyText(closed?.expected_amount)+"\nContado: "+moneyText(closed?.closing_amount)+"\nDiferencia: "+moneyText(closed?.difference));
    }catch(e){await sendTelegram(env,chatId,"⚠️ No pude cerrar la caja: "+String(e?.message||e).slice(0,500));}
    return json({ok:true},200);
  }
  if(msg.document){
    const isPdf=String(msg.document.mime_type||"").toLowerCase()==="application/pdf"||String(msg.document.file_name||"").toLowerCase().endsWith(".pdf");
    if(!isPdf){
      await sendTelegram(env,chatId,"📄 Puedo importar catálogos en PDF. Envíame un archivo PDF.");
      return json({ok:true},200);
    }
    await sendTelegram(env,chatId,"📄 Recibí el PDF. Voy a analizar el catálogo con Gemini y preparar una vista previa…");
    const job=processTelegramInventoryPdf(env,adminToken,userId,chatId,msg.document).catch(async e=>{
      await sendTelegram(env,chatId,"⚠️ No pude analizar el PDF: "+String(e?.message||"Error desconocido").slice(0,700));
    });
    if(ctx?.waitUntil)ctx.waitUntil(job);else await job;
    return json({ok:true},200);
  }

  if(/^(IMPORTAR|IMPORTA|SI|SÍ)$/i.test(incoming)){
    const pendingRows=await sb(env,adminToken,"marc_pending_imports?select=id&user_id=eq."+encodeURIComponent(userId)+"&channel=eq.TELEGRAM&chat_id=eq."+encodeURIComponent(chatId)+"&status=eq.PENDING&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&order=created_at.desc&limit=1");
    const pending=pendingRows?.[0];
    if(!pending){
      await sendTelegram(env,chatId,"No hay una importación de PDF pendiente. Envía primero el catálogo PDF.");
      return json({ok:true},200);
    }
    try{
      const result=await importPendingInventory(env,adminToken,userId,pending.id,true,"TELEGRAM");
      await sendTelegram(env,chatId,"✅ Inventario actualizado.\\n\\nProductos procesados: "+result.total+"\\nNuevos: "+result.created+"\\nActualizados: "+result.updated);
    }catch(err){
      await sendTelegram(env,chatId,"⚠️ No pude importar los productos: "+String(err?.message||"Error").slice(0,700));
    }
    return json({ok:true},200);
  }

  if(/^(CANCELAR|CANCEL)$/i.test(incoming)){
    await sb(env,adminToken,"marc_pending_imports?user_id=eq."+encodeURIComponent(userId)+"&channel=eq.TELEGRAM&chat_id=eq."+encodeURIComponent(chatId)+"&status=eq.PENDING",{
      method:"PATCH",
      body:{status:"CANCELLED",updated_at:new Date().toISOString()}
    });
    await sendTelegram(env,chatId,"Importación cancelada.");
    return json({ok:true},200);
  }

  if(!incoming){
    await sendTelegram(env,chatId,"Escríbeme una operación o una pregunta. Por ejemplo: «revisa mi inventario» o «crea una cotización».");
    return json({ok:true},200);
  }

  // Caja: consultas simples se resuelven directamente, sin Gemini.
  const normalizedIncoming=incoming.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
  const fastCashStatus=/^(?:como esta|como se encuentra|estado de|revisa|muestrame|muestra|dime|dame|ver)\s+(?:la\s+)?caja(?:\s+(?:ahora|actual))?$/i.test(normalizedIncoming)
    || /^(?:caja|estado caja|resumen caja|ver caja)$/i.test(normalizedIncoming);
  if(fastCashStatus){
    try{
      const rows=await cashRows("OPEN",1),r=rows?.[0];
      if(!r){
        await sendTelegram(env,chatId,"🎩 A sus órdenes, señor. En este momento no hay una caja abierta.");
        return json({ok:true,fastPath:"cash_status",open:false},200);
      }
      const mv=await sb(env,adminToken,"marc_cash_movements?select=type,amount,concept,created_at&user_id=eq."+encodeURIComponent(userId)+"&cash_register_id=eq."+encodeURIComponent(r.id)+"&order=created_at.asc");
      const movements=Array.isArray(mv)?mv:[];
      const income=movements.filter(x=>String(x.type||"").toUpperCase()==="INCOME").reduce((s,x)=>s+Number(x.amount||0),0);
      const expense=movements.filter(x=>String(x.type||"").toUpperCase()==="EXPENSE").reduce((s,x)=>s+Number(x.amount||0),0);
      const opening=Number(r.opening_amount||0),expected=opening+income-expense;
      const lines=[
        "🎩 A sus órdenes, señor.",
        "",
        "▣ ESTADO DE CAJA",
        "🟢 Caja abierta",
        "💵 Apertura: "+moneyText(opening),
        "📥 Ingresos: "+moneyText(income),
        "📤 Egresos: "+moneyText(expense),
        "💰 Efectivo esperado: "+moneyText(expected),
        "🧾 Movimientos: "+movements.length
      ];
      if(movements.length)lines.push("","Últimos movimientos:",...movements.slice(-8).reverse().map(x=>(String(x.type||"").toUpperCase()==="INCOME"?"📥 ":"📤 ")+moneyText(x.amount)+" · "+String(x.concept||"Movimiento")));
      await sendTelegram(env,chatId,lines.join("\n"));
      return json({ok:true,fastPath:"cash_status",open:true,movements:movements.length},200);
    }catch(err){
      await sendTelegram(env,chatId,"🎩 Señor, estoy teniendo dificultades para consultar la caja en este momento. La conexión de su cuenta sigue activa; volveré a intentarlo cuando me lo indique.");
      return json({ok:true,fastPath:"cash_status_error"},200);
    }
  }

  // Último cierre: consulta determinística y nunca se envía al modelo.
  const fastLastClose=/\b(?:ultimo|ultima|reciente|anterior)\b.*\b(?:cierre|caja)\b/i.test(normalizedIncoming)
    && /\b(?:movimiento|movimientos|ingreso|ingresos|egreso|egresos|gasto|gastos|resumen|estado|como estuvo|como estuvieron|que paso|detalle|detalles)\b/i.test(normalizedIncoming);
  if(fastLastClose){
    try{
      const closedRows=await cashRows("CLOSED",1),last=closedRows?.[0];
      if(!last){
        const openRows=await cashRows("OPEN",1),open=openRows?.[0];
        if(open){
          await sendTelegram(env,chatId,"🎩 Señor, revisé sus registros. Aún no existe un cierre de caja anterior; actualmente tiene una caja abierta con "+moneyText(open.opening_amount)+" de apertura.");
        }else{
          await sendTelegram(env,chatId,"🎩 Señor, revisé sus registros y todavía no encuentro un cierre de caja.");
        }
        return json({ok:true,fastPath:"cash_last_close",found:false},200);
      }
    }catch(err){
      await sendTelegram(env,chatId,"🎩 Señor, no he podido consultar los registros del último cierre en este momento. Permítame intentarlo nuevamente.");
      return json({ok:true,fastPath:"cash_last_close_error"},200);
    }
  }

  // Consultas frecuentes de inventario: responder sin Gemini ni historial para reducir latencia.
  const fastInventoryQuestion=/^(?:cuantos|cuantas|cuanto|total de|dime cuantos|dime cuantas|que cantidad de)\b.*\b(?:productos|articulos|items|inventario)\b/i.test(
    incoming.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim()
  );
  if(fastInventoryQuestion){
    try{
      const [count,items]=await Promise.all([
        countInventory(env,adminToken,userId),
        searchInventory(env,adminToken,userId,"",8)
      ]);
      if(!count){
        await sendTelegram(env,chatId,"No tienes productos registrados en el inventario.");
      }else{
        const lines=items.map(x=>{
          const stock=Number(x.stock||0),min=Number(x.min_stock||0);
          const estado=stock<=0?"AGOTADO":stock<=min?"STOCK BAJO":"DISPONIBLE";
          return "• "+String(x.name||"Producto")+" — stock: "+stock+" — "+estado;
        });
        await sendTelegram(env,chatId,"📦 Tienes "+count+" productos activos en tu inventario.\\n\\nPrimeros "+Math.min(items.length,count)+":\\n"+lines.join("\\n")+"\\n\\nTotal real: "+count+" productos.");
      }
      return json({ok:true,fastPath:"inventory_count",count},200);
    }catch(err){
      await sendTelegram(env,chatId,"⚠️ No pude consultar el inventario ahora. Inténtalo nuevamente.");
      return json({ok:true,fastPath:"inventory_count_error"},200);
    }
  }

  {
    const conversationId=await ensureTelegramConversation(env,adminToken,userId);
    const ctxMem=await getConversationContext(env,adminToken,userId,conversationId);
    const pending=ctxMem?.pending_action;
    if(pending?.params){
      const text=String(incoming||"").trim();
      const fiscalNoTax=/\b(?:sin|no)\s+(?:igv|igb|impuesto)\b|\bno\s+incluyas?\s+(?:igv|igb|impuesto)\b/i.test(text);
      const fiscalWithTax=/\b(?:con|incluye|incluido)\s+(?:el\s+)?(?:igv|igb|impuesto)\b/i.test(text);
      if(pending.action==="CREATE_CLIENT" && pending.params._next_quote && (fiscalNoTax||fiscalWithTax)){
        const nextQuote={...pending.params._next_quote,tax_enabled:!fiscalNoTax,tax_included:fiscalWithTax};
        const next={...ctxMem,pending_action:{...pending,params:{...pending.params,_next_quote:nextQuote}}};
        await saveConversationContext(env,adminToken,userId,conversationId,next);
        await sendTelegram(env,chatId,"🧾 Actualicé el tratamiento del impuesto en la cotización encadenada: "+(fiscalNoTax?"sin IGV.":"IGV incluido.")+"\n\nResponde «sí» para continuar.");
        return json({ok:true,fastPath:"client_quote_tax"},200);
      }
      // Selección pendiente al consultar una cotización ambigua.
      if(pending.action==="QUERY_QUOTE" && pending.params){
        const qp=pending.params;
        const choice=text.match(/^(?:cotizacion|cotización|opcion|opción)?\s*([1-5])$/i);
        if(choice&&Array.isArray(qp.options)){
          const n=Number(choice[1]),selected=qp.options[n-1];
          if(!selected){
            await sendTelegram(env,chatId,"La opción "+n+" no está disponible. Indícame un número entre 1 y "+Math.min(5,qp.options.length)+".");
            return json({ok:true,fastPath:"quote_detail_choice_invalid"},200);
          }
          const detail=await getQuoteForEdit(env,adminToken,userId,String(selected.number||selected.id||""));
          if(detail.status!=="FOUND"){
            await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:null});
            await sendTelegram(env,chatId,"⚠️ No pude recuperar esa cotización. Inténtalo nuevamente con su número.");
            return json({ok:true,fastPath:"quote_detail_choice_error"},200);
          }
          const q=detail.quote||{},items=Array.isArray(detail.items)?detail.items:[],client=detail.client||null;
          const lines=["🧾 COTIZACIÓN "+String(q.number||selected.number||""),"","👤 Cliente: "+String(client?.name||"Sin cliente"),"📋 "+String(q.title||"Cotización")];
          if(q.status)lines.push("📌 Estado: "+String(q.status));
          lines.push("");
          items.forEach((it,i)=>{const qty=Number(it.quantity||0),unit=Number(it.unit_price||0);lines.push((i+1)+". "+String(it.name||it.description||"Partida")+" · "+qty+" × S/ "+unit.toFixed(2)+" = S/ "+(qty*unit).toFixed(2));});
          lines.push("","📦 Partidas: "+items.length,"💵 Subtotal: "+moneyText(q.subtotal));
          const taxEnabled=q.tax_enabled===undefined?true:Boolean(q.tax_enabled);
          if(taxEnabled)lines.push("🧾 IGV ("+Number(q.tax_rate||18).toFixed(2)+"%): "+moneyText(q.tax_amount));
          else lines.push("🧾 IGV: No incluido");
          lines.push("💰 TOTAL: "+moneyText(q.total));
          if(q.notes)lines.push("","📝 Observaciones: "+String(q.notes));
          await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{action:"VIEW_QUOTE",params:{quote_id:q.id,quote_number:q.number||selected.number,client_id:client?.id||q.client_id||null,client_name:client?.name||null,title:q.title||"Cotización",items,tax_enabled:q.tax_enabled,tax_rate:q.tax_rate||18,tax_included:Boolean(q.tax_included),notes:q.notes||null,status:q.status||"BORRADOR"}}});
          await sendTelegram(env,chatId,lines.join("\n"));
          return json({ok:true,fastPath:"quote_detail_choice"},200);
        }
      }

      if(pending.action==="VIEW_QUOTE" && pending.params){
        const vp=pending.params;
        if(/^(?:pdf|pásame el pdf|pasame el pdf|envíame el pdf|enviame el pdf|mándame el pdf|mandame el pdf|genera el pdf|generame el pdf|descarga el pdf|descargar pdf)$/i.test(text)){
          const detail=await getQuoteForEdit(env,adminToken,userId,String(vp.quote_number||vp.quote_id||""));
          if(detail.status!=="FOUND"){
            await sendTelegram(env,chatId,"⚠️ No pude recuperar la cotización para generar el PDF.");
            return json({ok:true,fastPath:"quote_view_pdf_error"},200);
          }
          try{
            const q=detail.quote||{},items=Array.isArray(detail.items)?detail.items:[],client=detail.client||null;
            const company=await telegramCompanyProfile(env,adminToken,userId);
            const bytes=buildQuotePdf({quote:q,client,company,items,tax_enabled:q.tax_enabled===undefined?true:q.tax_enabled,tax_included:Boolean(q.tax_included),tax_rate:q.tax_rate||18,notes:q.notes||""});
            const number=String(q.number||vp.quote_number||q.id||"cotizacion").slice(0,40);
            await sendTelegramDocument(env,chatId,bytes,"Cotizacion-"+number+".pdf","📄 PDF de la cotización "+number);
            return json({ok:true,fastPath:"quote_view_pdf"},200);
          }catch(e){
            await sendTelegram(env,chatId,"⚠️ No pude generar el PDF de la cotización en este momento.");
            return json({ok:true,fastPath:"quote_view_pdf_error"},200);
          }
        }
        if(/^(cancelar|cancela|salir|cerrar|listo|no)$/i.test(text)){
          await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:null});
          await sendTelegram(env,chatId,"Listo, señor. Cerré la consulta sin realizar cambios.");
          return json({ok:true,fastPath:"quote_view_close"},200);
        }
        if(/^(si|sí|ok|dale|confirmar)$/i.test(text)){
          await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:null});
          await sendTelegram(env,chatId,"La cotización solo fue consultada; no hay cambios pendientes para guardar.");
          return json({ok:true,fastPath:"quote_view_no_changes"},200);
        }
        if(/\b(?:cambia|cambiar|modifica|modificar|edita|editar|actualiza|actualizar|agrega|agregar|añade|anade|quita|quitar|elimina|eliminar|borra|borrar|marca|marcar|pon|poner)\b/i.test(text)){
          const nextParams={
            quote_id:vp.quote_id,quote_number:vp.quote_number,client_id:vp.client_id||null,
            client_query:vp.client_id||vp.client_name||"",client_name:vp.client_name||null,
            title:vp.title||"Cotización",items:Array.isArray(vp.items)?vp.items:[],
            tax_enabled:vp.tax_enabled===undefined?true:vp.tax_enabled,tax_rate:Number(vp.tax_rate||18),
            tax_included:Boolean(vp.tax_included),prices_are_net:true,notes:vp.notes||null,status:vp.status||"BORRADOR"
          };
          await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{action:"UPDATE_QUOTE",params:nextParams}});
          await sendTelegram(env,chatId,"✏️ He dejado "+String(vp.quote_number||"la cotización")+" lista para editar. Indíqueme el cambio que desea realizar.");
          return json({ok:true,fastPath:"quote_view_to_edit"},200);
        }
      }

      const quoteUndoSummary=(previewItems,params)=>{
        let subtotal=0;
        const taxEnabled=params.tax_enabled===undefined?true:Boolean(params.tax_enabled);
        const rate=Number(params.tax_rate||18);
        for(const it of (Array.isArray(previewItems)?previewItems:[])){
          subtotal+=Math.max(0,Number(it.quantity||0))*Math.max(0,Number(it.unit_price||0));
        }
        const tax=taxEnabled?subtotal*rate/100:0;
        return "\n\n📊 Resumen: "+(Array.isArray(previewItems)?previewItems.length:0)+" partidas · Subtotal S/ "+subtotal.toFixed(2)+(taxEnabled?" · IGV S/ "+tax.toFixed(2):" · Sin IGV")+" · Total S/ "+(subtotal+tax).toFixed(2)+"\n\nPuede seguir editando o responder «sí» para guardar.";
      };

      if(pending.action==="UPDATE_QUOTE" && pending.params && /^(deshacer|deshace|undo)$/i.test(text)){
        const pUndo=pending.params;
        if(Array.isArray(pUndo._quote_undo_items)){
          const restored={...pUndo,items:pUndo._quote_undo_items};
          delete restored._quote_undo_items;
          await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{...pending,params:restored}});
          await sendTelegram(env,chatId,"↩️ Deshice el último cambio de partidas."+quoteUndoSummary(restored.items,restored));
        }else{
          await sendTelegram(env,chatId,"No hay un cambio de partidas reciente que pueda deshacer.");
        }
        return json({ok:true,fastPath:"quote_update_undo"},200);
      }

        if(/^(?:pdf|pásame el pdf|pasame el pdf|envíame el pdf|enviame el pdf|mándame el pdf|mandame el pdf|genera el pdf|generame el pdf|descarga el pdf|descargar pdf)$/i.test(text)){
          const p=pending.params,items=Array.isArray(p.items)?p.items:[];
          try{
            const taxEnabled=p.tax_enabled===undefined?true:Boolean(p.tax_enabled),rate=Number(p.tax_rate||18);
            let subtotal=0;
            for(const it of items)subtotal+=Math.max(0,Number(it.quantity||0))*Math.max(0,Number(it.unit_price||0));
            const tax=taxEnabled?subtotal*rate/100:0;
            const quote={id:p.quote_id||null,number:p.quote_number||"BORRADOR",title:p.title||"Cotización",status:p.status||"BORRADOR",subtotal,tax_amount:tax,total:subtotal+tax,tax_enabled:taxEnabled,tax_rate:rate,tax_included:Boolean(p.tax_included),notes:p.notes||null};
            const client={id:p.client_id||null,name:p.client_name||p.client_query||"Cliente"};
            const company=await telegramCompanyProfile(env,adminToken,userId);
            const bytes=buildQuotePdf({quote,client,company,items,tax_enabled:taxEnabled,tax_included:Boolean(p.tax_included),tax_rate:rate,notes:p.notes||""});
            const number=String(p.quote_number||p.quote_id||"borrador").slice(0,40);
            await sendTelegramDocument(env,chatId,bytes,"Cotizacion-"+number+"-PREVIA.pdf","📄 PDF de vista previa. La cotización todavía no se ha guardado.");
            return json({ok:true,fastPath:"quote_update_pdf_preview"},200);
          }catch(e){
            await sendTelegram(env,chatId,"⚠️ No pude generar la vista previa PDF de esta cotización.");
            return json({ok:true,fastPath:"quote_update_pdf_preview_error"},200);
          }
        }

      if(pending.action==="UPDATE_QUOTE" && pending.params){
        if(/^(si|sí|confirmar|confirmo|guarda|guardar|ok|dale|hazlo)$/i.test(text)){
          const p=pending.params;
          const result=await createQuote(env,adminToken,userId,p,"TELEGRAM");
          if(result.status==="CREATED"){
            await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:null});
            const q=result.quote;
            await sendTelegram(env,chatId,"✅ Cotización "+String(q.number||p.quote_number||"")+" actualizada correctamente.\n💰 Total: S/ "+Number(q.total||0).toFixed(2));
            try{
              const company=await telegramCompanyProfile(env,adminToken,userId);
              const bytes=buildQuotePdf({quote:q,client:result.client,company,items:result.items,tax_enabled:p.tax_enabled===undefined?true:p.tax_enabled,tax_included:Boolean(p.tax_included),tax_rate:p.tax_rate||18,notes:p.notes||""});
              const number=String(q.number||p.quote_number||q.id||"cotizacion").slice(0,40);
              await sendTelegramDocument(env,chatId,bytes,"Cotizacion-"+number+".pdf","📄 PDF actualizado de la cotización "+number);
            }catch(e){}
            return json({ok:true,fastPath:"quote_update_saved"},200);
          }
          await sendTelegram(env,chatId,"⚠️ No pude actualizar la cotización: "+String(result.message||"verifica los datos."));
          return json({ok:true,fastPath:"quote_update_error"},200);
        }
        if(/^(cancelar|cancela|no|anular)$/i.test(text)){
          await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:null});
          await sendTelegram(env,chatId,"🛑 Actualización cancelada.");
          return json({ok:true,fastPath:"quote_update_cancel"},200);
        }
        const quoteEditPreview=(previewItems)=>{
          const taxEnabled=pending.params.tax_enabled===undefined?true:Boolean(pending.params.tax_enabled);
          const taxIncluded=Boolean(pending.params.tax_included)&&taxEnabled;
          const rate=Number(pending.params.tax_rate||18);
          let subtotal=0;
          for(const it of (Array.isArray(previewItems)?previewItems:[])){
            const qty=Math.max(0,Number(it.quantity||0));
            const raw=Number(it.unit_price||0);
            const gross=Number(it.gross_unit_price);
            const unit=taxIncluded&&Number.isFinite(gross)&&gross>0?gross/(1+rate/100):raw;
            subtotal+=qty*(Number.isFinite(unit)?unit:0);          }
          const tax=taxEnabled?subtotal*(rate/100):0;
          return {subtotal,tax,total:subtotal+tax,count:Array.isArray(previewItems)?previewItems.length:0,taxEnabled};
        };
        const quotePreviewText=(previewItems,options={})=>{
          const v=quoteEditPreview(previewItems);
          const clientName=String(options.clientName||pending.params.client_name||"Cliente");
          const title=String(options.title||pending.params.title||"Cotización");
          const lines=[
            "🧾 *Resumen de cotización*",
            "👤 Cliente: "+clientName,
            "📋 "+title,
            ""
          ];
          (Array.isArray(previewItems)?previewItems:[]).forEach((it,i)=>{
            const qty=Number(it.quantity||0);
            const unit=Number(it.unit_price||0);
            lines.push((i+1)+". "+String(it.name||it.description||"Partida")+" · "+qty+" × S/ "+unit.toFixed(2)+" = S/ "+(qty*unit).toFixed(2));
          });
          lines.push("");
          lines.push("📦 Partidas: "+v.count);
          lines.push("💵 Subtotal: S/ "+v.subtotal.toFixed(2));
          if(v.taxEnabled)lines.push("🧾 IGV ("+Number(pending.params.tax_rate||18).toFixed(2)+"%): S/ "+v.tax.toFixed(2));
          else lines.push("🧾 IGV: No incluido");
          lines.push("💰 *TOTAL: S/ "+v.total.toFixed(2)+"*");
          if(pending.params.notes)lines.push("📝 Observaciones: "+String(pending.params.notes).slice(0,500));
          return "\n\n"+lines.join("\n");
        };
        const p=pending.params,items=Array.isArray(p.items)?p.items:[];

        // Si la búsqueda de inventario anterior fue ambigua, permite elegir
        // el producto por número sin volver a consultar Gemini.
        if(p._pending_inventory_add){
          const choice=text.match(/^(?:producto\s+)?([1-5])$/i);
          if(choice){
            const n=Number(choice[1]),pendingAdd=p._pending_inventory_add,option=(pendingAdd.options||[])[n-1];
            if(!option){
              await sendTelegram(env,adminToken,"La opción "+n+" ya no está disponible. Indícame un número entre 1 y "+Math.min(5,(pendingAdd.options||[]).length)+".");
              return json({ok:true,fastPath:"quote_update_add_choice_invalid"},200);
            }
            const item={type:"PRODUCTO",inventory_id:option.id,name:option.name,description:null,quantity:Number(pendingAdd.quantity||1),unit:option.unit||"UND",unit_price:Number(pendingAdd.value),cost:Number(option.cost||0)};
            const nextItems=[...items,item],nextParams={...p,items:nextItems};
            delete nextParams._pending_inventory_add;
            await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{...pending,params:nextParams}});
            await sendTelegram(env,chatId,"➕ Agregué "+Number(pendingAdd.quantity||1)+" × "+String(option.name||"Producto")+" · S/ "+Number(pendingAdd.value).toFixed(2)+" por unidad.\n📦 Vinculado al inventario.\n\nResponde «sí» para guardar o continúa editando.");
            return json({ok:true,fastPath:"quote_update_add_choice"},200);
          }
        }

        // Edición por nombre de partida: permite trabajar con la descripción real
        // de la cotización, sin obligar al usuario a recordar el número ordinal.
        const normQuoteItem=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/[^a-z0-9\\s]/g," ").replace(/\\s+/g," ").trim();
        const findQuoteItem=(query)=>{
          const q=normQuoteItem(query);
          if(!q)return {status:"NOT_FOUND"};
          const candidates=items.map((x,i)=>({x,i,n:normQuoteItem(x.name||x.description)}));
          const exact=candidates.filter(a=>a.n===q);
          if(exact.length===1)return {status:"FOUND",index:exact[0].i};
          if(exact.length>1)return {status:"AMBIGUOUS",options:exact};
          const contains=candidates.filter(a=>a.n.includes(q)||q.includes(a.n));
          if(contains.length===1)return {status:"FOUND",index:contains[0].i};
          if(contains.length>1)return {status:"AMBIGUOUS",options:contains};
          return {status:"NOT_FOUND"};
        };
        if(p._pending_quote_item_target){
          const choice=text.match(/^(?:partida|producto|servicio)?\s*([1-5])$/i);
          if(choice){
            const n=Number(choice[1]),target=(p._pending_quote_item_target.options||[])[n-1];
            if(!target){
              await sendTelegram(env,chatId,"La opción "+n+" no está disponible. Indícame un número entre 1 y "+Math.min(5,(p._pending_quote_item_target.options||[]).length)+".");
              return json({ok:true,fastPath:"quote_item_choice_invalid"},200);
            }
            const nextParams={...p,_selected_quote_item_index:target.i};
            delete nextParams._pending_quote_item_target;
            await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{...pending,params:nextParams}});
            await sendTelegram(env,chatId,"🧾 Seleccioné la partida "+(target.i+1)+": «"+String(target.x.name||target.x.description||"Partida")+"». Ahora indícame el cambio o responde «sí» si ya quedó como desea.");
            return json({ok:true,fastPath:"quote_item_choice"},200);
          }
        }
        // Operaciones múltiples sobre partidas: agregar y/o eliminar varias en un solo mensaje.
        // Se ejecutan sobre el borrador en memoria y se solicita una única confirmación.
        const multiOps=text.split(/\\s+(?:y|ademas|además|tambien|también)\\s+/i).map(s=>s.trim()).filter(Boolean);
        if(multiOps.length>=2){
          let multiItems=[...items],multiChanged=false,multiLabels=[];
          for(const op of multiOps){
            const rm=op.match(/^(?:quita|quitar|elimina|eliminar|borra|borrar)\s+(?:la|el|partida|servicio|producto)?\s*(.+?)\s*$/i);
            if(rm){
              const hit=findQuoteItem(rm[1].trim());
              if(hit.status==="AMBIGUOUS"){
                const opts=(hit.options||[]).slice(0,5);
                const pendingParams={...p,_pending_quote_item_target:{query:rm[1].trim(),options:opts.map(a=>({i:a.i,x:a.x})),multi_ops:multiOps}};
                await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{...pending,params:pendingParams}});
                await sendTelegram(env,chatId,"🧾 Hay varias partidas que coinciden con «"+rm[1].trim()+"». Elige una opción (1–"+opts.length+").");
                return json({ok:true,fastPath:"quote_multi_ops_ambiguous"},200);
              }
              if(hit.status==="FOUND"){
                const target=multiItems[hit.index];
                multiItems=multiItems.filter((_,i)=>i!==hit.index);
                multiChanged=true;multiLabels.push("🗑️ "+String(target.name||target.description||"Partida"));
                continue;
              }
            }
            const add=op.match(/^(?:agrega|agregar|añade|anade|incluye|incluir|suma)\s+(?:(\d+(?:[.,]\d+)?)\s+)?(?:una\s+)?(?:partida\s+de\s+)?(.+?)\s+(?:a|por|en)\s*(?:s\/\.?\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:soles?)?$/i);
            if(add){
              const quantity=Math.max(0.01,Number(String(add[1]||"1").replace(",","."))),name=String(add[2]||"").trim(),value=Number(String(add[3]||"").replace(",","."));
              if(name&&Number.isFinite(value)&&value>0){
                const hit=await resolveInventory(env,adminToken,userId,name);
                if(hit.status==="AMBIGUOUS"){
                  const opts=(hit.options||[]).slice(0,5);
                  const pendingParams={...p,_pending_inventory_add:{name,quantity,value,options:opts},_multi_ops:multiOps};
                  await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{...pending,params:pendingParams}});
                  await sendTelegram(env,chatId,"📦 Hay varios productos para «"+name+"». Elige uno (1–"+opts.length+").");
                  return json({ok:true,fastPath:"quote_multi_ops_inventory_ambiguous"},200);
                }
                const product=hit.status==="FOUND"?hit.item:null;
                const item=product
                  ?{type:"PRODUCTO",inventory_id:product.id,name:product.name,description:null,quantity,unit:product.unit||"UND",unit_price:value,cost:Number(product.cost||0)}
                  :{type:"TRABAJO",name:name.slice(0,180),description:name.slice(0,2000),quantity,unit:"UND",unit_price:value};
                multiItems.push(item);multiChanged=true;
                multiLabels.push("➕ "+quantity+" × "+String(item.name||name)+" · S/ "+value.toFixed(2));
                continue;
              }
            }
            // Si una cláusula no es una operación soportada, dejamos que los manejadores normales la procesen.
            multiChanged=false;break;
          }
          if(multiChanged){
            const nextParams={...p,items:multiItems,_quote_undo_items:items};
            delete nextParams._selected_quote_item_index; delete nextParams._pending_quote_item_target; delete nextParams._multi_ops;
            await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{...pending,params:nextParams}});
            await sendTelegram(env,chatId,"🧾 Apliqué los cambios en la cotización:\n\n"+multiLabels.join("\n")+
              quotePreviewText(multiItems)+"\n\nPuede seguir editando o responder «sí» para guardar todos los cambios.");
            return json({ok:true,fastPath:"quote_multi_ops"},200);
          }
        }

        const selectedIndex=Number.isInteger(p._selected_quote_item_index)?p._selected_quote_item_index:null;

        // Varias modificaciones en una sola instrucción.
        const combinedSameItem=text.match(/^\s*(?:cambia|cambiar|modifica|modificar|pon|poner|ajusta|ajustar)\s+(?:el\s+)?(?:precio|valor|costo|coste)\s+(?:de|del|de la|para)\s+(.+?)\s+(?:a|en)\s*(?:s\/\.?\s*)?(\d+(?:[.,]\d{1,2})?)\s+(?:y|e)\s+(?:cambia|cambiar|modifica|modificar|pon|poner|ajusta|ajustar)?\s*(?:la\s+)?(?:cantidad|unidades)\s+(?:a|en)\s*(\d+(?:[.,]\d+)?)(?:\s*soles?)?$/i);
        if(combinedSameItem){
          const query=String(combinedSameItem[1]||"").trim(),hit=findQuoteItem(query);
          if(hit.status==="AMBIGUOUS"){
            const opts=(hit.options||[]).slice(0,5);
            const pendingParams={...p,_pending_quote_item_target:{query,options:opts.map(a=>({i:a.i,x:a.x}))}};
            await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{...pending,params:pendingParams}});
            await sendTelegram(env,chatId,"🧾 Encontré varias partidas para «"+query+"»:\n\n"+opts.map((a,i)=>(i+1)+". "+String(a.x.name||a.x.description||"Partida")).join("\n")+"\n\nIndícame cuál deseas modificar.");
            return json({ok:true,fastPath:"quote_multi_edit_ambiguous"},200);
          }
          if(hit.status==="FOUND"){
            const idx=hit.index,price=Number(String(combinedSameItem[2]).replace(",",".")),qty=Number(String(combinedSameItem[3]).replace(",","."));
            if(Number.isFinite(price)&&price>0&&Number.isFinite(qty)&&qty>0&&idx<items.length){
              const nextItems=items.map((x,i)=>i===idx?{...x,unit_price:price,quantity:qty,gross_unit_price:p.tax_included?price:x.gross_unit_price}:x);
              const nextParams={...p,items:nextItems,_quote_undo_items:items};
              delete nextParams._selected_quote_item_index; delete nextParams._pending_quote_item_target;
              await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{...pending,params:nextParams}});
              await sendTelegram(env,chatId,"🧾 Actualicé «"+String(items[idx].name||items[idx].description||"Partida")+"».\n💰 Precio: S/ "+price.toFixed(2)+"\n🔢 Cantidad: "+qty+"\n\nPuede seguir editando o responder «sí» para guardar.");
              return json({ok:true,fastPath:"quote_multi_edit_same_item"},200);
            }
          }
        }

        const twoPriceEdit=text.match(/^\s*(?:cambia|cambiar|modifica|modificar|pon|poner|ajusta|ajustar)\s+(?:el\s+)?(?:precio|valor|costo|coste)\s+(?:de|del|de la|para)\s+(.+?)\s+(?:a|en)\s*(?:s\/\.?\s*)?(\d+(?:[.,]\d{1,2})?)\s+y\s+(?:cambia|cambiar|modifica|modificar|pon|poner|ajusta|ajustar)\s+(?:el\s+)?(?:precio|valor|costo|coste)\s+(?:de|del|de la|para)\s+(.+?)\s+(?:a|en)\s*(?:s\/\.?\s*)?(\d+(?:[.,]\d{1,2})?)$/i);
        if(twoPriceEdit){
          const hitA=findQuoteItem(String(twoPriceEdit[1]||"").trim()),hitB=findQuoteItem(String(twoPriceEdit[3]||"").trim());
          if(hitA.status==="AMBIGUOUS"||hitB.status==="AMBIGUOUS"){
            const ambiguous=hitA.status==="AMBIGUOUS"?hitA:hitB,query=hitA.status==="AMBIGUOUS"?twoPriceEdit[1]:twoPriceEdit[3],opts=(ambiguous.options||[]).slice(0,5);
            const pendingParams={...p,_pending_quote_item_target:{query,options:opts.map(a=>({i:a.i,x:a.x}))}};
            await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{...pending,params:pendingParams}});
            await sendTelegram(env,chatId,"🧾 Hay varias partidas que coinciden con «"+String(query).trim()+"»:\n\n"+opts.map((a,i)=>(i+1)+". "+String(a.x.name||a.x.description||"Partida")).join("\n")+"\n\nIndícame cuál deseas usar.");
            return json({ok:true,fastPath:"quote_multi_edit_ambiguous"},200);
          }
          if(hitA.status==="FOUND"&&hitB.status==="FOUND"&&hitA.index!==hitB.index){
            const va=Number(String(twoPriceEdit[2]).replace(",",".")),vb=Number(String(twoPriceEdit[4]).replace(",","."));
            if(va>0&&vb>0){
              const nextItems=items.map((x,i)=>i===hitA.index?{...x,unit_price:va,gross_unit_price:p.tax_included?va:x.gross_unit_price}:i===hitB.index?{...x,unit_price:vb,gross_unit_price:p.tax_included?vb:x.gross_unit_price}:x);
              const nextParams={...p,items:nextItems,_quote_undo_items:items};
              delete nextParams._selected_quote_item_index; delete nextParams._pending_quote_item_target;
              await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{...pending,params:nextParams}});
              await sendTelegram(env,chatId,"🧾 Apliqué los dos cambios:\n\n• "+String(items[hitA.index].name||"Partida")+" → S/ "+va.toFixed(2)+"\n• "+String(items[hitB.index].name||"Partida")+" → S/ "+vb.toFixed(2)+quotePreviewText(nextItems)+"\n\nResponde «sí» para guardar o continúa editando.");
              return json({ok:true,fastPath:"quote_multi_edit_two_items"},200);
            }
          }
        }
        const namePrice=text.match(/\b(?:cambia|cambiar|modifica|modificar|pon|poner|ajusta|ajustar)\b[\s\S]{0,80}?\b(?:precio|valor|costo|coste)\s+(?:de|del|de la|para)\s+(.+?)\s+(?:a|en)\s*(?:s\/\\.?\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*soles?)?$/i);
        const nameQty=text.match(/\b(?:cambia|cambiar|modifica|modificar|pon|poner|ajusta|ajustar)\b[\s\S]{0,80}?\b(?:cantidad|unidades)\s+(?:de|del|de la|para)\s+(.+?)\s+(?:a|en)\s*(\d+(?:[.,]\d+)?)/i);
        const nameRemove=text.match(/\b(?:quita|quitar|elimina|eliminar|borra|borrar)\b(?:\s+(?:la|el|partida|servicio|producto))?\s+(.+?)$/i);
        const namedEdit=namePrice||nameQty||nameRemove;
        if(namedEdit){
          const query=String(namedEdit[1]||"").trim().replace(/[.]+$/,"");
          let targetIndex=selectedIndex;
          if(!Number.isInteger(targetIndex)){
            const hit=findQuoteItem(query);
            if(hit.status==="NOT_FOUND"){
              // No interceptamos frases que no parecen una edición válida.
              targetIndex=null;
            }else if(hit.status==="AMBIGUOUS"){
              const opts=(hit.options||[]).slice(0,5);
              const pendingParams={...p,_pending_quote_item_target:{query,options:opts.map(a=>({i:a.i,x:a.x}))}};
              await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{...pending,params:pendingParams}});
              await sendTelegram(env,chatId,"🧾 Encontré varias partidas que coinciden con «"+query+"»:\n\n"+opts.map((a,i)=>(i+1)+". "+String(a.x.name||a.x.description||"Partida")).join("\n")+"\n\nIndícame el número de la partida que deseas modificar.");
              return json({ok:true,fastPath:"quote_item_ambiguous"},200);
            }else targetIndex=hit.index;
          }
          if(Number.isInteger(targetIndex)&&targetIndex>=0&&targetIndex<items.length){
            let nextItems=items;
            if(namePrice){
              const value=Number(String(namePrice[2]).replace(",","."));
              if(Number.isFinite(value)&&value>0)nextItems=items.map((x,i)=>i===targetIndex?{...x,unit_price:value,gross_unit_price:p.tax_included?value:x.gross_unit_price}:x);
              else targetIndex=null;
            }else if(nameQty){
              const value=Number(String(nameQty[2]).replace(",","."));
              if(Number.isFinite(value)&&value>0)nextItems=items.map((x,i)=>i===targetIndex?{...x,quantity:value}:x);
              else targetIndex=null;
            }else{
              nextItems=items.filter((_,i)=>i!==targetIndex);
            }
            if(Number.isInteger(targetIndex)){
              const nextParams={...p,items:nextItems,_quote_undo_items:items};
              delete nextParams._selected_quote_item_index;
              delete nextParams._pending_quote_item_target;
              await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{...pending,params:nextParams}});
              const item=items[targetIndex];
              const label=String(item.name||item.description||"Partida");
              const actionText=namePrice?"💰 Precio de «"+label+"» actualizado a S/ "+Number(namePrice[2].replace(",","." )).toFixed(2)+".":nameQty?"🔢 Cantidad de «"+label+"» actualizada a "+Number(nameQty[2].replace(",","."))+".":"🗑️ Eliminé «"+label+"» de la cotización.";
              await sendTelegram(env,chatId,actionText+"\\n\\nResponde «sí» para guardar o continúa editando.");
              return json({ok:true,fastPath:namePrice?"quote_update_named_price":nameQty?"quote_update_named_quantity":"quote_update_named_remove"},200);
            }
          }
        }
        const clientEdit=text.match(/\b(?:cambia|cambiar|modifica|modificar)\s+(?:el\s+)?cliente\s+(?:a|por|de)\s+(.+)$/i);
        if(clientEdit){
          const query=String(clientEdit[1]||"").trim().replace(/[.]+$/,"");
          if(!query)return json({ok:true,fastPath:"quote_update_client_need"},200);
          const hit=await resolveOneClient(env,adminToken,userId,query);
          if(hit.status==="NOT_FOUND"){
            await sendTelegram(env,chatId,"⚠️ No encontré un cliente llamado «"+query+"».");
            return json({ok:true,fastPath:"quote_update_client_not_found"},200);
          }
          if(hit.status==="AMBIGUOUS"){
            const opts=(hit.options||[]).map((x,i)=>(i+1)+". "+String(x.name||"Cliente")).join("\n");
            await sendTelegram(env,chatId,"Encontré varios clientes:\n"+opts+"\n\nIndícame cuál deseas usar.");
            return json({ok:true,fastPath:"quote_update_client_ambiguous"},200);
          }
          const next={...ctxMem,pending_action:{...pending,params:{...p,client_id:hit.client.id,client_query:hit.client.id,client_name:hit.client.name}}};
          await saveConversationContext(env,adminToken,userId,conversationId,next);
          await sendTelegram(env,chatId,"👤 Cliente cambiado a «"+hit.client.name+"».\n\nResponde «sí» para guardar.");
          return json({ok:true,fastPath:"quote_update_client"},200);
        }
        const titleEdit=text.match(/\b(?:cambia|cambiar|modifica|modificar|pon|poner)\s+(?:el\s+)?(?:t[ií]tulo|nombre\s+de\s+la\s+cotizaci[oó]n)\s+(?:a|por|en)\s+(.+)$/i);
        if(titleEdit){
          const value=String(titleEdit[1]||"").trim().replace(/[.]+$/,"").slice(0,180);
          if(value){
            const next={...ctxMem,pending_action:{...pending,params:{...p,title:value}}};
            await saveConversationContext(env,adminToken,userId,conversationId,next);
            await sendTelegram(env,chatId,"📝 Título actualizado a «"+value+"».\n\nResponde «sí» para guardar.");
            return json({ok:true,fastPath:"quote_update_title"},200);
          }
        }
        const notesEdit=text.match(/\b(?:agrega|añade|anade|cambia|modifica|actualiza)\s+(?:la\s+)?(?:observaci[oó]n|nota|notas)\s*(?:a|:|por|con)?\s*(.+)$/i);
        if(notesEdit){
          const value=String(notesEdit[1]||"").trim().replace(/[.]+$/,"").slice(0,4000);
          if(value){
            const next={...ctxMem,pending_action:{...pending,params:{...p,notes:value}}};
            await saveConversationContext(env,adminToken,userId,conversationId,next);
            await sendTelegram(env,chatId,"🗒️ Observaciones actualizadas.\n\nResponde «sí» para guardar.");
            return json({ok:true,fastPath:"quote_update_notes"},200);
          }
        }
        // Cambios de estado de una cotización: se preparan y siempre requieren confirmación.
        const statusEdit=text.match(/\b(?:marca|marcar|cambia|cambiar|pon|poner|actualiza|actualizar)\b[\s\S]{0,80}?\b(?:estado|status)?\s*(?:a|como|en)\s+(borrador|enviada|aceptada|rechazada|anulada|cobrada)\b/i)
          ||text.match(/\b(?:marca|marcar|cambia|cambiar|pon|poner)\s+(?:la\s+)?cotizaci[oó]n\s+(?:como|en)\s+(borrador|enviada|aceptada|rechazada|anulada|cobrada)\b/i);
        if(statusEdit){
          const rawStatus=String(statusEdit[1]||"").toUpperCase();
          const statusMap={BORRADOR:"BORRADOR",ENVIADA:"ENVIADA",ACEPTADA:"ACEPTADA",RECHAZADA:"RECHAZADA",ANULADA:"ANULADA",COBRADA:"COBRADA"};
          const newStatus=statusMap[rawStatus];
          if(newStatus){
            if(["ANULADA","COBRADA"].includes(newStatus)){
              await sendTelegram(env,chatId,"⚠️ El cambio de estado a «"+newStatus+"» es una operación sensible. La prepararé, pero deberá confirmarla respondiendo «sí».");
            }else{
              await sendTelegram(env,chatId,"🧾 Estado preparado: «"+newStatus+"». Responde «sí» para guardar o «cancelar» para descartarlo.");
            }
            const next={...ctxMem,pending_action:{...pending,params:{...p,status:newStatus}}};
            await saveConversationContext(env,adminToken,userId,conversationId,next);
            return json({ok:true,fastPath:"quote_update_status"},200);
          }
        }
                const fiscalNoTax=/\b(?:sin|no)\s+(?:igv|igb|impuesto)\b|\bno\s+incluyas?\s+(?:igv|igb|impuesto)\b/i.test(text);
        const fiscalWithTax=/\b(?:con|incluye|incluido)\s+(?:el\s+)?(?:igv|igb|impuesto)\b/i.test(text);
        if(fiscalNoTax||fiscalWithTax){
          const next={...ctxMem,pending_action:{...pending,params:{...p,tax_enabled:!fiscalNoTax,tax_included:fiscalWithTax,prices_are_net:true}}};
          await saveConversationContext(env,adminToken,userId,conversationId,next);
          await sendTelegram(env,chatId,"🧾 Actualicé el tratamiento del impuesto: "+(fiscalNoTax?"sin IGV.":"IGV incluido.")+"\n\nResponde «sí» para guardar.");
          return json({ok:true,fastPath:"quote_update_tax"},200);
        }
        const addMatch=text.match(/\b(?:agrega|añade|anade|incluye|suma)\s+(?:(\d+(?:[.,]\d+)?)\s+)?(?:una\s+)?(?:partida\s+de\s+)?(.+?)(?:\s+(?:a|por|en)\s+(?:s\/\.?\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:soles?)?)?$/i);
        if(addMatch){
          const quantity=Math.max(0.01,Number(String(addMatch[1]||"1").replace(",",".")||1));
          const name=String(addMatch[2]||"").trim();
          const value=addMatch[3]?Number(addMatch[3].replace(",",".")):null;
          if(name&&value&&value>0){
            const hit=await resolveInventory(env,adminToken,userId,name);
            if(hit.status==="AMBIGUOUS"){
              const opts=(hit.options||[]).slice(0,5);
              const pendingParams={...p,_pending_inventory_add:{name,quantity,value,options:opts}};
              await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{...pending,params:pendingParams}});
              await sendTelegram(env,chatId,"📦 Encontré varios productos para «"+name+"»:\n\n"+opts.map((x,i)=>(i+1)+". "+String(x.name||"Producto")+" · S/ "+Number(x.price||0).toFixed(2)+(x.stock!=null?" · stock "+Number(x.stock):"")).join("\n")+"\n\nIndícame el número del producto que deseas agregar.");
              return json({ok:true,fastPath:"quote_update_add_ambiguous"},200);
            }
            const product=hit.status==="FOUND"?hit.item:null;
            const item=product
              ?{type:"PRODUCTO",inventory_id:product.id,name:product.name,description:null,quantity,unit:product.unit||"UND",unit_price:value,cost:Number(product.cost||0)}
              :{type:"TRABAJO",name:name.slice(0,180),description:name.slice(0,2000),quantity,unit:"UND",unit_price:value};
            const nextItems=[...items,item];
            const nextParams={...p,items:nextItems,_quote_undo_items:items};
            delete nextParams._pending_inventory_add;
            await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{...pending,params:nextParams}});
            await sendTelegram(env,chatId,"➕ Agregué "+quantity+" × "+String(item.name||name)+" · S/ "+value.toFixed(2)+" por unidad."+(product?"\n📦 Vinculado al inventario.":"\n🛠️ Lo trataré como trabajo/servicio.")+"\n\nResponde «sí» para guardar o continúa editando.");
            return json({ok:true,fastPath:"quote_update_add"},200);
          }
        }
        const ord=text.toLowerCase().match(/\b(primera|primer|segunda|segundo|tercera|tercer|cuarta|cuarto|quinta|quinto|ultima|última)\b/);
        const map={primera:0,primer:0,segunda:1,segundo:1,tercera:2,tercer:2,cuarta:3,cuarto:3,quinta:4,quinto:4,ultima:Math.max(0,items.length-1),"última":Math.max(0,items.length-1)};
        const idx=ord?map[ord[1]]:(items.length?items.length-1:0);
        const pm=text.match(/\b(?:cambia|modifica|pon|ajusta)\b[\s\S]{0,60}?(?:precio|valor|costo|coste)\s*(?:a|en|de)?\s*(?:s\/\\.?\s*)?(\d+(?:[.,]\d{1,2})?)/i);
        if(pm&&idx<items.length){
          const value=Number(pm[1].replace(",",".")); const nextItems=items.map((x,i)=>i===idx?{...x,unit_price:value}:x);
          await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{...pending,params:{...p,items:nextItems}}});
          await sendTelegram(env,chatId,"🧾 Actualicé el precio de la partida "+(idx+1)+" a S/ "+value.toFixed(2)+".\n\nPuedes seguir editando o responder «sí» para guardar.");
          return json({ok:true,fastPath:"quote_update_edit"},200);
        }
        const qm=text.match(/\b(?:cambia|modifica|pon|ajusta)\b[\s\S]{0,60}?(?:cantidad|unidades)\s*(?:a|en|de)?\s*(\d+(?:[.,]\d+)?)/i);
        if(qm&&idx<items.length){
          const value=Number(qm[1].replace(",","."));
          if(value>0){const nextItems=items.map((x,i)=>i===idx?{...x,quantity:value}:x);await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{...pending,params:{...p,items:nextItems}}});await sendTelegram(env,chatId,"🔢 Cantidad actualizada en la partida "+(idx+1)+".\n\nResponde «sí» para guardar.");return json({ok:true,fastPath:"quote_update_qty"},200);}
        }
        const rm=text.match(/\b(?:quita|elimina|borra)\b(?:\s+(?:la|el|partida))?\s*(primera|primer|segunda|segundo|tercera|tercer|cuarta|cuarto|quinta|quinto|ultima|última)\b/i);
        if(rm&&items.length){
          const ri=map[rm[1]]; if(Number.isInteger(ri)&&ri<items.length){const nextItems=items.filter((_,i)=>i!==ri);await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:{...pending,params:{...p,items:nextItems}}});await sendTelegram(env,chatId,"🗑️ Eliminé la partida "+(ri+1)+".\n\nResponde «sí» para guardar.");return json({ok:true,fastPath:"quote_update_remove"},200);}
        }
      }
      if(pending.action==="CREATE_QUOTE" && pending.params){
        const p=pending.params, items=Array.isArray(p.items)?p.items:[];
        // Ediciones cortas de la cotización pendiente: se resuelven localmente.
        const ordinalMap={primera:0,primer:0,segunda:1,segundo:1,tercera:2,tercer:2,cuarta:3,cuarto:3,quinta:4,quinto:4,ultima:Math.max(0,items.length-1),última:Math.max(0,items.length-1)};
        const ord=text.toLowerCase().match(/\b(primera|primer|segunda|segundo|tercera|tercer|cuarta|cuarto|quinta|quinto|ultima|última)\b/);
        const targetIndex=ord?ordinalMap[ord[1]]:(items.length?items.length-1:0);
        const priceEdit=text.match(/\b(?:cambia|cambiar|modifica|modificar|pon|poner|ajusta|ajustar)\b[^\d]{0,80}(?:precio|valor|costo|coste)\s*(?:a|en|de)?\s*(?:s\/\.?\s*)?(\d+(?:[.,]\d{1,2})?)/i)
          ||text.match(/\b(?:precio|costo|coste)\s*(?:a|en|de)?\s*(?:s\/\.?\s*)?(\d+(?:[.,]\d{1,2})?)\b/i);
        if(priceEdit&&items.length){
          const value=Number(priceEdit[1].replace(",","."));
          if(Number.isFinite(value)&&value>0&&targetIndex<items.length){
            const nextItems=items.map((x,i)=>i===targetIndex?{...x,unit_price:value,gross_unit_price:p.tax_included?value:x.gross_unit_price}:x);
            const next={...ctxMem,pending_action:{...pending,params:{...p,items:nextItems}}};
            await saveConversationContext(env,adminToken,userId,conversationId,next);
            await sendTelegram(env,chatId,"🧾 Precio actualizado en "+(targetIndex===items.length-1?"la última partida":"la partida "+(targetIndex+1))+".\n\nS/ "+value.toFixed(2)+" por unidad.\n\nResponde «sí» para crearla o continúa indicándome cambios.");
            return json({ok:true,fastPath:"quote_edit_price"},200);
          }
        }
        const qtyEdit=text.match(/\b(?:cambia|cambiar|modifica|modificar|pon|poner|ajusta|ajustar)\b[^\d]{0,80}(?:cantidad|unidades)\s*(?:a|en|de)?\s*(\d+(?:[.,]\d+)?)\b/i);
        if(qtyEdit&&items.length){
          const value=Number(qtyEdit[1].replace(",",".")); 
          if(Number.isFinite(value)&&value>0&&targetIndex<items.length){
            const nextItems=items.map((x,i)=>i===targetIndex?{...x,quantity:value}:x);
            const next={...ctxMem,pending_action:{...pending,params:{...p,items:nextItems}}};
            await saveConversationContext(env,adminToken,userId,conversationId,next);
            await sendTelegram(env,chatId,"🔢 Cantidad actualizada en la partida "+(targetIndex+1)+": "+value+".\n\nResponde «sí» para crearla o continúa indicándome cambios.");
            return json({ok:true,fastPath:"quote_edit_quantity"},200);
          }
        }
        const removeMatch=text.match(/\b(?:quita|quitar|elimina|eliminar|borra|borrar)\b(?:\s+(?:la|el|partida))?\s*(primera|primer|segunda|segundo|tercera|tercer|cuarta|cuarto|quinta|quinto|ultima|última)\b/i);
        if(removeMatch&&items.length){
          const idx=ordinalMap[String(removeMatch[1]).toLowerCase()];
          if(Number.isInteger(idx)&&idx>=0&&idx<items.length){
            const removed=items[idx];
            const nextItems=items.filter((_,i)=>i!==idx);
            const next={...ctxMem,pending_action:{...pending,params:{...p,items:nextItems}}};
            await saveConversationContext(env,adminToken,userId,conversationId,next);
            await sendTelegram(env,chatId,"🗑️ Eliminé la partida "+(idx+1)+": "+String(removed.name||removed.description||"Partida")+".\n\n"+(nextItems.length?"Responde «sí» para crearla o continúa editándola.":"La cotización quedó sin partidas; puedes agregar una nueva."));
            return json({ok:true,fastPath:"quote_remove_item"},200);
          }
        }
      if(/\b(?:sin|no)\s+igv\b|\bno\s+incluyas?\s+igv\b|\bsin\s+igb\b|\bno\s+incluyas?\s+igb\b|\bsin\s+impuesto\b|\bno\s+incluyas?\s+impuesto\b/i.test(text)){
        const next={...ctxMem,pending_action:{...pending,params:{...pending.params,tax_enabled:false}}};
        await saveConversationContext(env,adminToken,userId,conversationId,next);
        const p=next.pending_action.params,items=Array.isArray(p.items)?p.items:[],subtotal=items.reduce((s,x)=>s+Number(x.quantity||1)*Number(x.unit_price||0),0);
        await sendTelegram(env,chatId,"🧾 Cotización actualizada.\n\nSubtotal: S/ "+subtotal.toFixed(2)+"\nIGV: No incluido\n💰 Total: S/ "+subtotal.toFixed(2)+"\n\nResponde «sí» para crearla o agrega otra partida.");
        return json({ok:true,fastPath:"quote_remove_tax"},200);
      }
      if(/\b(igv|incluye|incluido)\b/i.test(text) && /\b(18|dieciocho)\b/i.test(text)){
        const next={...ctxMem,pending_action:{...pending,params:{...pending.params,tax_enabled:true,tax_rate:18}}};
        await saveConversationContext(env,adminToken,userId,conversationId,next);
        await sendTelegram(env,chatId,"🧾 IGV 18% incluido. Responde «sí» para crear la cotización o agrega otra partida.");
        return json({ok:true,fastPath:"quote_add_tax"},200);
      }
      }
    }
  }

  async function telegramCompanyProfile(env,adminToken,userId){
  const rows=await sb(env,adminToken,"marc_company_profiles?select=business_name,legal_name,ruc,address,phone,email,logo_data&user_id=eq."+encodeURIComponent(userId)+"&limit=1").catch(()=>[]);
  return rows?.[0]||{};
}

if(/^(si|sí|confirmo|confirmar|dale|hazlo|ejecuta|ejecutar)$/i.test(incoming)){
    const conversationId=await ensureTelegramConversation(env,adminToken,userId);
    const ctxMem=await getConversationContext(env,adminToken,userId,conversationId);
    const pending=ctxMem?.pending_action;
    if(pending?.action && pending?.params){
      const age=Date.now()-new Date(pending.created_at||0).getTime();
      if(!Number.isFinite(age)||age>15*60*1000){
        await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:null});
        await sendTelegram(env,chatId,"⏱️ Esta operación pendiente expiró. Vuelve a indicarme la operación para preparar una nueva confirmación.");
        return json({ok:true,fastPath:"expired_pending_action"},200);
      }
      try{
        let done;
        if(pending.action==="ADJUST_INVENTORY")done=await adjustInventory(env,adminToken,userId,pending.params,"TELEGRAM");
        else if(pending.action==="CREATE_CLIENT")done=await createClient(env,adminToken,userId,pending.params,"TELEGRAM");
        else if(pending.action==="CREATE_QUOTE")done=await createQuote(env,adminToken,userId,pending.params,"TELEGRAM");
        else throw new Error("Operación pendiente no reconocida.");

        const success=(pending.action==="ADJUST_INVENTORY"&&done?.status==="UPDATED")
          ||(pending.action==="CREATE_CLIENT"&&done?.status==="CREATED")
          ||(pending.action==="CREATE_QUOTE"&&done?.status==="CREATED");

        if(!success){
          if(done?.status==="NEEDS_INPUT"){
            const detail=done?.message||(
              done?.field==="work_price"
                ?"Falta indicar el precio del trabajo: "+String(done?.item?.name||pending.params?.title||"Trabajo")+"."
                :done?.field==="product_price"
                  ?"El producto no tiene un precio válido. Indícame el precio para esta cotización."
                  :done?.field==="client_query"
                    ?"No pude resolver el cliente. Indícame el nombre exacto."
                    :done?.field==="inventory"
                      ?"No pude resolver una de las partidas del inventario. Indícame el producto exacto."
                      :"Necesito un dato adicional para completar la operación."
            );
            await sendTelegram(env,chatId,"⚠️ "+detail+"\n\nLa operación sigue pendiente. Puedes completar el dato y luego responder «sí».");
            return json({ok:true,fastPath:"pending_needs_input"},200);
          }
          await sendTelegram(env,chatId,"⚠️ No se realizó el cambio. "+String(done?.message||done?.status||"La operación no pudo completarse.").slice(0,400));
          return json({ok:true,fastPath:"pending_not_completed"},200);
        }

        await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:null});
        if(pending.action==="ADJUST_INVENTORY"){
          const item=done?.item||{};
          await sendTelegram(env,chatId,"✅ Movimiento de inventario realizado.\n\n📦 "+String(item.name||pending.params.inventory_query||"Producto")+"\n🔄 "+pending.params.type+" · "+pending.params.quantity);
        }else if(pending.action==="CREATE_CLIENT"){
          const client=done?.client||{};
          const nextQuote=pending.params?._next_quote;
          if(nextQuote && client.id){
            const quoteParams={...nextQuote,client_query:client.id,client_id:client.id,client_name:client.name||nextQuote.client_name};
            const quoteDone=await createQuote(env,adminToken,userId,quoteParams,"TELEGRAM");
            if(quoteDone?.status==="CREATED"){
              await sendTelegram(env,chatId,"✅ Cliente registrado.\n\n👤 "+String(client.name||"Cliente")+(client.address?"\n📍 "+client.address:"")+"\n\n🧾 También preparé la cotización solicitada.");
              const q=quoteDone.quote||{};
              await sendTelegram(env,chatId,"📋 Cotización: "+String(q.numero||q.number||"Cotización")+"\n💰 "+moneyText(q.total||0));
              try{
                const company=await telegramCompanyProfile(env,adminToken,userId);
                const bytes=buildQuotePdf({quote:q,client:quoteDone.client||client,company,items:quoteDone.items,tax_enabled:quoteParams.tax_enabled===undefined?true:quoteParams.tax_enabled,tax_included:Boolean(quoteParams.tax_included),tax_rate:quoteParams.tax_rate||18,notes:quoteParams.notes||""});
                const number=String(q.numero||q.number||q.id||"cotizacion").slice(0,40);
                await sendTelegramDocument(env,chatId,bytes,"Cotizacion-"+number+".pdf","📄 PDF de la cotización "+number);
              }catch(pdfErr){
                await sendTelegram(env,chatId,"⚠️ El cliente fue registrado y la cotización creada, pero el PDF no pudo enviarse.");
              }
            }else{
              await sendTelegram(env,chatId,"✅ Cliente registrado.\n\n👤 "+String(client.name||"Cliente")+"\n\n⚠️ No pude completar automáticamente la cotización: "+String(quoteDone?.message||"falta un dato")+"");
            }
          }else{
            await sendTelegram(env,chatId,"✅ Cliente registrado.\n\n👤 "+String(client.name||pending.params.name||"Cliente")+(client.phone?"\n📞 "+client.phone:""));
          }
        }else{
          const q=done?.quote||{};
          await sendTelegram(env,chatId,"✅ Cotización creada.\n\n🧾 "+String(q.numero||q.number||"Cotización")+"\n"+String(q.title||pending.params.title||"Cotización")+"\n💰 "+moneyText(q.total||0));
          try{
            const company=await telegramCompanyProfile(env,adminToken,userId);
            const bytes=buildQuotePdf({quote:q,client:done?.client,company,items:done?.items,tax_enabled:pending.params?.tax_enabled===undefined?true:pending.params.tax_enabled,tax_included:Boolean(pending.params?.tax_included),tax_rate:pending.params?.tax_rate||18,notes:pending.params?.notes||""});
            const number=String(q.numero||q.number||q.id||"cotizacion").slice(0,40);
            await sendTelegramDocument(env,chatId,bytes,"Cotizacion-"+number+".pdf","📄 PDF de la cotización "+number);
          }catch(pdfErr){
            await sendTelegram(env,chatId,"⚠️ La cotización fue creada, pero el PDF no pudo enviarse: "+String(pdfErr?.message||pdfErr).slice(0,300));
          }
        }
      }catch(e){
        await sendTelegram(env,chatId,"⚠️ No pude ejecutar la operación pendiente: "+String(e?.message||"error").slice(0,500));
      }
      return json({ok:true,fastPath:"confirm_pending_action"},200);
    }
  }

  if(/^(no|nop|cancelar|cancela|cancel)$/i.test(incoming)){
    const conversationId=await ensureTelegramConversation(env,adminToken,userId);
    const ctxMem=await getConversationContext(env,adminToken,userId,conversationId);
    if(ctxMem?.pending_action){
      await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:null});
      await sendTelegram(env,chatId,"Operación cancelada. No se realizó ningún cambio.");
      return json({ok:true,fastPath:"cancel_pending_action"},200);
    }
  }

  const conversationId=await ensureTelegramConversation(env,adminToken,userId);
  await sb(env,adminToken,"marc_messages",{method:"POST",body:{
    conversation_id:conversationId,user_id:userId,role:"USER",content:incoming,action_type:"TELEGRAM",
    action_payload:{telegram_update_id:update.update_id,telegram_user_id:externalUserId}
  }});
  let pl=null,executed=null,answer="";
  try{
    const history=await recentMessages(env,adminToken,userId,conversationId);
    const entityContext=await getConversationContext(env,adminToken,userId,conversationId);
    pl=await plan(env,incoming,history,entityContext,adminToken,userId);
    executed=await executePlan(env,adminToken,{id:userId},pl,"TELEGRAM");
    const nextContext=buildEntityContext(executed,entityContext);
    if(executed?.result?.status==="CONFIRMATION_REQUIRED")nextContext.pending_action={action:executed.action,params:executed.result.params,created_at:new Date().toISOString()};
    await saveConversationContext(env,adminToken,userId,conversationId,nextContext);
    await incrementAiUsage(env,adminToken,userId,access);
    const telegramDisplayName=(await telegramUserProfile(env,adminToken,userId,msg.from,identity)).displayName;
    answer=String(await finalReply(env,incoming,{plan:pl,execution:executed,entitlement:access},telegramDisplayName)||"").trim();
    const refreshedProfile=await telegramUserProfile(env,adminToken,userId,msg.from,identity);
    if(!refreshedProfile.preferredName && !refreshedProfile.namePrompted){
      answer+="\n\n🎩 Por cierto, ¿cómo desea que lo llame? Puede responder «Llámame + su nombre» y lo recordaré para futuras conversaciones.";
      const authUser=await fetch(env.SUPABASE_URL+"/auth/v1/admin/users/"+encodeURIComponent(userId),{headers:{apikey:adminToken,Authorization:"Bearer "+adminToken}}).then(x=>x.ok?x.json():null).catch(()=>null);
      await updateTelegramUserMetadata(env,adminToken,userId,{...(authUser?.user_metadata||{}),marc_name_prompted:true}).catch(()=>{});
    }
  }catch(err){
    const detail=String(err?.message||"").toLowerCase();
    if(/gemini|modelo|api|temporar|timeout|fetch/.test(detail)){
      answer="🤖 M.A.R.C.\n\nEstoy teniendo una demora con el análisis inteligente. Las consultas rápidas de caja, inventario, clientes y cotizaciones siguen disponibles.\n\nIntenta nuevamente en unos segundos.";
    }else if(/permission|forbidden|unauthorized|rls/.test(detail)){
      answer="⚠️ M.A.R.C. no pudo acceder temporalmente a esos datos. Tu cuenta sigue conectada; vuelve a intentarlo.";
    }else{
      answer="⚠️ No pude completar esa consulta ahora. Prueba con algo como «revisa mi caja», «busca a Delgado» o «muestra mi inventario».";
    }
  }
  if(!answer)answer="Listo. ¿Qué necesitas revisar?";
  await sb(env,adminToken,"marc_messages",{method:"POST",body:{
    conversation_id:conversationId,user_id:userId,role:"ASSISTANT",content:answer,action_type:executed?.action||"CHAT",
    action_payload:{channel:"TELEGRAM",action:executed?.action||"CHAT",plan:pl||null,result:executed?.result||null}
  }}).catch(()=>{});
  await sb(env,adminToken,"marc_conversations?id="+encodeURIComponent(conversationId)+"&user_id="+encodeURIComponent(userId),{
    method:"PATCH",body:{updated_at:new Date().toISOString()}
  }).catch(()=>{});
  await sendTelegram(env,chatId,answer);
  return json({ok:true},200);
}

async function companyProfile(request,env){
  const {user}=await authUser(request,env);
  const adminToken=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  if(!adminToken)throw Object.assign(new Error("Falta la clave de servidor de Supabase."),{status:503});
  const rows=await sb(env,adminToken,"marc_company_profiles?select=user_id,business_name,legal_name,ruc,address,phone,email,logo_data,updated_at&user_id=eq."+encodeURIComponent(user.id)+"&limit=1");
  return json({profile:rows?.[0]||null},200,corsHeaders(request,env));
}
async function saveCompanyProfile(request,env){
  const {user}=await authUser(request,env);
  const userToken=request.headers.get("Authorization")?.replace(/^Bearer\s+/i,"")||"";
  const access=await entitlement(env,userToken,user.id);
  if(access.kind!=="master" && access.kind!=="paid"){
    throw Object.assign(new Error("El perfil empresarial, logo y marca en PDF requieren M.A.R.C. Pro o Business."),{status:403});
  }
  const body=await request.json();
  const profile={
    user_id:user.id,
    business_name:String(body?.business_name||"").trim().slice(0,160)||null,
    legal_name:String(body?.legal_name||"").trim().slice(0,200)||null,
    ruc:String(body?.ruc||"").trim().slice(0,40)||null,
    address:String(body?.address||"").trim().slice(0,240)||null,
    phone:String(body?.phone||"").trim().slice(0,60)||null,
    email:String(body?.email||"").trim().slice(0,180)||null,
    logo_data:typeof body?.logo_data==="string"&&body.logo_data.length<700000?body.logo_data:null,
    updated_at:new Date().toISOString()
  };
  if(body?.logo_data && typeof body.logo_data==="string" && body.logo_data.length>=700000){
    throw Object.assign(new Error("El logo es demasiado grande. Usa una imagen de hasta 500 KB."),{status:413});
  }
  const adminToken=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  if(!adminToken)throw Object.assign(new Error("Falta la clave de servidor de Supabase."),{status:503});
  const rows=await sb(env,adminToken,"marc_company_profiles?on_conflict=user_id",{
    method:"POST",
    prefer:"resolution=merge-duplicates,return=representation",
    body:profile
  });
  return json({profile:rows?.[0]||profile,entitlement:access},200,corsHeaders(request,env));
}


function bytesToBase64(bytes){
  let out="";
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    const part=bytes.subarray(i,Math.min(i+chunk,bytes.length));
    out+=String.fromCharCode(...part);
  }
  return btoa(out);
}

async function geminiGeneratePdf(env,pdfBytes,prompt,options={}){
  const apiKeys=[env.GEMINI_API_KEY,env.GEMINI_API_KEY2].filter((x,i,a)=>x&&a.indexOf(x)===i);
  if(!apiKeys.length)throw Object.assign(new Error("GEMINI_API_KEY no está configurada en el Worker."),{status:503});
  const models=(Array.isArray(options.models)&&options.models.length?options.models:[env.GEMINI_MODEL||GEMINI_MODEL_DEFAULT,env.GEMINI_MODEL_FALLBACK||"gemini-3.7-flash",env.GEMINI_MODEL_FALLBACK2||"gemini-3.6-flash"]).filter((x,i,a)=>x&&a.indexOf(x)===i);
  const data=bytesToBase64(new Uint8Array(pdfBytes));
  let last=null;
  for(const model of models){
    for(const key of apiKeys){
      try{
        const body={
          contents:[{parts:[
            {text:String(prompt)},
            {inlineData:{mimeType:"application/pdf",data}}
          ]}],
          generationConfig:{
            responseMimeType:"application/json",
            maxOutputTokens:options.maxTokens||8000
          }
        };
        const res=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
          method:"POST",
          headers:{"content-type":"application/json","x-goog-api-key":key},
          body:JSON.stringify(body)
        });
        const raw=await res.text();
        let json=null;try{json=raw?JSON.parse(raw):null}catch{}
        if(res.ok)return json;
        const err=new Error(json?.error?.message||"Gemini PDF error");
        err.status=res.status;err.details=json;
        last=err;
        if(![429,500,502,503,504,529].includes(Number(res.status)))throw err;
      }catch(err){
        last=err;
        if(![429,500,502,503,504,529].includes(Number(err?.status)))throw err;
      }
    }
  }
  throw last||Object.assign(new Error("Gemini no está disponible temporalmente."),{status:503});
}

function sanitizePdfItems(items){
  if(!Array.isArray(items))return [];
  const out=[];
  for(const raw of items.slice(0,500)){
    const name=String(raw?.name||"").trim().slice(0,180);
    if(!name)continue;
    const n=v=>{
      if(v===null||v===undefined||v==="")return null;
      const x=Number(String(v).replace(",",".").replace(/[^\d.-]/g,""));
      return Number.isFinite(x)?x:null;
    };
    out.push({
      sku:String(raw?.sku||"").trim().slice(0,80)||null,
      name,
      brand:String(raw?.brand||"").trim().slice(0,100)||null,
      model:String(raw?.model||"").trim().slice(0,120)||null,
      category:String(raw?.category||"").trim().slice(0,100)||null,
      unit:String(raw?.unit||"UND").trim().slice(0,20)||"UND",
      cost:n(raw?.cost),
      price:n(raw?.price),
      stock:n(raw?.stock),
      min_stock:n(raw?.min_stock)
    });
  }
  const seen=new Set(),clean=[];
  for(const x of out){
    const key=(x.sku||[x.name,x.brand,x.model].filter(Boolean).join("|")).toLowerCase();
    if(seen.has(key))continue;
    seen.add(key);clean.push(x);
  }
  return clean;
}

async function analyzeInventoryPdf(env,pdfBytes,filename){
  const prompt='Analiza este catálogo PDF y extrae exclusivamente PRODUCTOS que puedan convertirse en registros de inventario. Devuelve SOLO JSON válido con esta forma: {"items":[{"sku":string|null,"name":string,"brand":string|null,"model":string|null,"category":string|null,"unit":string|null,"cost":number|null,"price":number|null,"stock":number|null,"min_stock":number|null}]}. No inventes valores. Si el PDF no muestra precio, stock o costo, usa null. Conserva códigos SKU/modelo cuando aparezcan. Si una fila contiene variantes reales, sepáralas solo cuando el documento las presenta como productos diferentes. Ignora servicios, textos promocionales, títulos, imágenes decorativas y accesorios que no estén identificados como productos. Nombre y descripción deben ser suficientemente claros para identificar cada producto. Archivo: '+String(filename||"catalogo.pdf");
  const out=await geminiGeneratePdf(env,pdfBytes,prompt,{maxTokens:10000});
  const text=out?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
  if(!text)throw Object.assign(new Error("Gemini no devolvió productos del PDF."),{status:502});
  let parsed;
  try{parsed=extractJson(text)}catch{throw Object.assign(new Error("Gemini analizó el PDF pero no devolvió JSON válido."),{status:502,details:{preview:text.slice(0,500)}})}
  const items=sanitizePdfItems(parsed?.items);
  return {items,raw_preview:text.slice(0,1000)};
}

async function storePdfDocument(env,adminToken,userId,source,filename,pdfBytes,items){
  const safeName=String(filename||"catalogo.pdf").replace(/[^A-Za-z0-9._-]/g,"_").slice(-120)||"catalogo.pdf";
  const path=userId+"/"+Date.now()+"-"+crypto.randomUUID()+"-"+safeName;
  const upload=await fetch(env.SUPABASE_URL+"/storage/v1/object/marc-documents/"+path,{
    method:"POST",
    headers:{
      Authorization:"Bearer "+adminToken,
      apikey:adminToken,
      "Content-Type":"application/pdf",
      "x-upsert":"false"
    },
    body:pdfBytes
  });
  if(!upload.ok){
    const t=await upload.text();
    throw new Error("No se pudo guardar el PDF: "+t.slice(0,500));
  }
  const rows=await sb(env,adminToken,"marc_documents",{
    method:"POST",
    body:{
      user_id:userId,source,filename:safeName,mime_type:"application/pdf",size_bytes:pdfBytes.byteLength,
      storage_path:path,status:"ANALYZED",extracted_count:items.length,metadata:{source,ai:"gemini"}
    }
  });
  return rows?.[0];
}

async function createPendingImport(env,adminToken,userId,channel,chatId,filename,pdfBytes){
  if(pdfBytes.byteLength>20*1024*1024)throw Object.assign(new Error("El PDF supera el límite de 20 MB."),{status:413});
  const analyzed=await analyzeInventoryPdf(env,pdfBytes,filename);
  if(!analyzed.items.length)throw Object.assign(new Error("No encontré productos identificables en el PDF."),{status:422});
  const document=await storePdfDocument(env,adminToken,userId,channel,filename,pdfBytes,analyzed.items);
  const rows=await sb(env,adminToken,"marc_pending_imports",{
    method:"POST",
    body:{
      user_id:userId,channel,chat_id:chatId||null,document_id:document?.id||null,
      items:analyzed.items,status:"PENDING",expires_at:new Date(Date.now()+15*60*1000).toISOString()
    }
  });
  return {pending:rows?.[0],document,items:analyzed.items};
}

async function findExistingInventory(env,adminToken,userId,item){
  if(item.sku){
    const rows=await sb(env,adminToken,"marc_inventory?select=id&user_id=eq."+encodeURIComponent(userId)+"&sku=eq."+encodeURIComponent(item.sku)+"&limit=1");
    if(rows?.[0])return rows[0];
  }
  const url=new URL(env.SUPABASE_URL+"/rest/v1/marc_inventory");
  url.searchParams.set("select","id");
  url.searchParams.set("user_id","eq."+userId);
  url.searchParams.set("name","eq."+item.name);
  if(item.brand)url.searchParams.set("brand","eq."+item.brand); else url.searchParams.set("brand","is.null");
  if(item.model)url.searchParams.set("model","eq."+item.model); else url.searchParams.set("model","is.null");
  url.searchParams.set("limit","1");
  return (await sb(env,adminToken,url.pathname.slice("/rest/v1/".length)+url.search))[0]||null;
}

async function importPendingInventory(env,adminToken,userId,pendingId,updateExisting=true,source="WEB"){
  const rows=await sb(env,adminToken,"marc_pending_imports?select=id,user_id,items,status,expires_at&user_id=eq."+encodeURIComponent(userId)+"&id=eq."+encodeURIComponent(pendingId)+"&status=eq.PENDING&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&limit=1");
  const pending=rows?.[0];
  if(!pending)throw Object.assign(new Error("La importación ya venció, fue importada o no existe."),{status:404});
  const items=sanitizePdfItems(pending.items);
  let created=0,updated=0;
  for(const item of items){
    const existing=updateExisting?await findExistingInventory(env,adminToken,userId,item):null;
    if(existing){
      // El PDF puede no contener precio, costo o stock. En un producto existente,
      // nunca reemplazar datos reales por null/0 solo porque el catálogo no los muestra.
      const patch={
        sku:item.sku,name:item.name,brand:item.brand,model:item.model,category:item.category,
        unit:item.unit,active:true,updated_at:new Date().toISOString()
      };
      if(item.cost!==null&&item.cost!==undefined)patch.cost=item.cost;
      if(item.price!==null&&item.price!==undefined)patch.price=item.price;
      if(item.min_stock!==null&&item.min_stock!==undefined)patch.min_stock=item.min_stock;
      if(item.stock!==null&&item.stock!==undefined)patch.stock=item.stock;
      await sb(env,adminToken,"marc_inventory?id=eq."+encodeURIComponent(existing.id)+"&user_id=eq."+encodeURIComponent(userId),{method:"PATCH",body:patch});
      updated++;
    }else{
      const row={
        user_id:userId,sku:item.sku,name:item.name,brand:item.brand,model:item.model,category:item.category,
        unit:item.unit,cost:item.cost??0,price:item.price??0,stock:item.stock??0,min_stock:item.min_stock??0,
        active:true,updated_at:new Date().toISOString()
      };
      await sb(env,adminToken,"marc_inventory",{method:"POST",body:row});
      created++;
    }
  }
  await sb(env,adminToken,"marc_pending_imports?id=eq."+encodeURIComponent(pendingId)+"&user_id=eq."+encodeURIComponent(userId),{method:"PATCH",body:{status:"IMPORTED",updated_at:new Date().toISOString()}});
  await audit(env,adminToken,userId,"DOCUMENT",pendingId,"INVENTORY_IMPORT",{created,updated,count:items.length},source);
  return {status:"IMPORTED",created,updated,total:items.length};
}


async function inventoryPdfStart(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env);
  const access=await entitlement(env,token,user.id);
  if(!(await rateLimit(env,"ai:"+user.id+":pdf-preview",20,3600)))return json({error:"Has alcanzado el límite temporal de análisis de PDF. Intenta nuevamente más tarde."},429,corsHeaders(request,env));
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request,env));
  if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de IA de la prueba."},429,corsHeaders(request,env));
  const body=await request.json().catch(()=>({}));
  const filename=String(body?.filename||"catalogo.pdf").slice(0,180);
  const rows=await sb(env,env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY,"marc_pending_imports",{
    method:"POST",
    body:{
      user_id:user.id,
      channel:"WEB",
      chat_id:null,
      document_id:null,
      items:[],
      status:"PENDING",
      expires_at:new Date(Date.now()+60*60*1000).toISOString()
    }
  });
  await incrementAiUsage(env,token,user.id,access);
  return json({pendingId:rows?.[0]?.id||null,filename},200,corsHeaders(request,env));
}

async function geminiGenerateText(env,text,prompt,options={}){
  const messages=[{
    role:"system",
    content:"Eres un extractor de catálogos. Usa únicamente el texto proporcionado. Devuelve una línea por producto con este formato exacto: NOMBRE || SKU || MARCA || MODELO || PRECIO. Una línea por producto, sin encabezado, sin explicaciones. Conserva el nombre completo del producto y sus variantes."
  },{
    role:"user",
    content:String(prompt)+"\n\nTEXTO DE LA PÁGINA:\n"+String(text||"")
  }];
  const out=await geminiGenerate(env,messages,{maxTokens:options.maxTokens||3200});
  return out?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
}

async function geminiGenerateImage(env,imageBase64,prompt,options={}){
  const apiKeys=[env.GEMINI_API_KEY,env.GEMINI_API_KEY2].filter((x,i,a)=>x&&a.indexOf(x)===i);
  if(!apiKeys.length)throw Object.assign(new Error("GEMINI_API_KEY no está configurada en el Worker."),{status:503});
  const models=[env.GEMINI_MODEL||GEMINI_MODEL_DEFAULT,env.GEMINI_MODEL_FALLBACK||"gemini-3.7-flash",env.GEMINI_MODEL_FALLBACK2||"gemini-3.6-flash"].filter((x,i,a)=>x&&a.indexOf(x)===i);
  const clean=String(imageBase64||"").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/,"");
  const parts=Array.isArray(imageBase64)?imageBase64:[{inlineData:{mimeType:options.mimeType||"image/jpeg",data:clean}},{text:String(prompt)}];
  const body={
    contents:[{parts}],
    generationConfig:{maxOutputTokens:options.maxTokens||3200,...(options.json?{responseMimeType:"application/json"}:{})}
  };
  const transient=[429,500,502,503,504,529];
  let last=null;
  for(const model of models){
    for(const key of apiKeys){
      try{
        const res=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
          method:"POST",
          headers:{"content-type":"application/json","x-goog-api-key":key},
          body:JSON.stringify(body)
        });
        const raw=await res.text();
        let data=null;try{data=raw?JSON.parse(raw):null}catch{}
        if(res.ok)return data;
        const err=new Error(data?.error?.message||"Gemini image error");
        err.status=res.status;err.details=data;last=err;
        if(!transient.includes(Number(res.status)))throw err;
      }catch(err){
        last=err;
        if(!transient.includes(Number(err?.status)))throw err;
      }
    }
  }
  throw last||Object.assign(new Error("Gemini no está disponible temporalmente."),{status:503});
}


async function marketingProductAi(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env);
  const access=await entitlement(env,token,user.id);
  if(!(await rateLimit(env,"ai:"+user.id+":marketing-product",30,3600)))return json({error:"Has alcanzado el límite temporal de solicitudes de IA. Intenta nuevamente más tarde."},429,corsHeaders(request,env));
  if(access.kind==="expired"}return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request,env));
  if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de IA de la prueba."},429,corsHeaders(request,env));
  const body=await request.json().catch(()=>({}));
  let image=String(body?.imageBase64||"").trim();
  const mime=String(body?.mimeType||"image/jpeg").trim().toLowerCase();
  const brief=String(body?.brief||"").trim().slice(0,2500);
  if(!image)return json({error:"No se recibió la foto del producto."},400,corsHeaders(request,env));
  if(!["image/jpeg","image/png","image/webp"].includes(mime))return json({error:"Formato de imagen no permitido."},400,corsHeaders(request,env));
  image=image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/,"");
  if(image.length>7000000)return json({error:"La imagen es demasiado grande para analizarla. Usa una foto menor de 6 MB."},413,corsHeaders(request,env));
  const prompt=[
    "Analiza esta foto de un producto para crear una publicidad profesional.",
    "Extrae solamente datos que puedas leer o identificar con suficiente seguridad. NO inventes especificaciones, certificaciones, garantías, precios, descuentos, disponibilidad ni beneficios técnicos.",
    "Si el usuario dio un brief, úsalo para orientar la descripción, pero no conviertas deseos en características reales del producto.",
    "Devuelve SOLO JSON válido con exactamente estos campos:",
    '{"name":"","sku":null,"brand":null,"model":null,"category":"","description":"","marketing_description":"","key_points":[],"confidence":0}',
    "description: descripción objetiva breve del producto.",
    "marketing_description: texto comercial atractivo, profesional y prudente, listo para usar como base de una publicación.",
    "key_points: arreglo de hasta 6 puntos que sean visibles o estén sustentados por la imagen.",
    "confidence: número entre 0 y 1.",
    "BRIEF DEL USUARIO: "+brief
  ].join("\n");
  const analysisParts=[
    {text:prompt},
    {inlineData:{mimeType,data:image}}
  ];
  if(referenceImage){
    analysisParts.push({text:"FOTO DE REFERENCIA ADICIONAL: úsala para identificar marca, modelo, etiqueta, caja, especificaciones visibles o detalles que no sean legibles en la foto principal. No confundas la foto de referencia con el producto anunciado."});
    analysisParts.push({inlineData:{mimeType:referenceMime,data:referenceImage}});
  }
  const out=await geminiGenerateImage(env,analysisParts,prompt,{maxTokens:1000,json:true});
  const text=out?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
  if(!text)throw Object.assign(new Error("Gemini no devolvió datos del producto."),{status:502});
  let parsed;try{parsed=extractJson(text)}catch{throw Object.assign(new Error("Gemini no devolvió un JSON válido para el producto."),{status:502})}
  const product={
    name:String(parsed?.name||"").trim().slice(0,180),
    sku:parsed?.sku?String(parsed.sku).trim().slice(0,120):null,
    brand:parsed?.brand?String(parsed.brand).trim().slice(0,120):null,
    model:parsed?.model?String(parsed.model).trim().slice(0,120):null,
    category:String(parsed?.category||"").trim().slice(0,120),
    description:String(parsed?.description||"").trim().slice(0,1200),
    marketing_description:String(parsed?.marketing_description||"").trim().slice(0,1800),
    key_points:Array.isArray(parsed?.key_points)?parsed.key_points.map(x=>String(x).trim()).filter(Boolean).slice(0,6):[],
    confidence:Math.min(1,Math.max(0,Number(parsed?.confidence||0)))
  };
  await incrementAiUsage(env,token,user.id,access);
  await audit(env,token,user.id,"MARKETING",null,"ANALYZE_PRODUCT_PHOTO",{confidence:product.confidence,identified:Boolean(product.name)},"WEB");
  return json({status:"ANALYZED",product},200,corsHeaders(request,env));
}

async function analyzeInventoryProductPhoto(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env);
  const access=await entitlement(env,token,user.id);
  if(!(await rateLimit(env,"ai:"+user.id+":inventory-photo",30,3600)))return json({error:"Has alcanzado el límite temporal de solicitudes de IA. Intenta nuevamente más tarde."},429,corsHeaders(request,env));
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request,env));
  if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de IA de la prueba."},429,corsHeaders(request,env));
  const body=await request.json().catch(()=>({}));
  let image=String(body?.imageBase64||"").trim();
  const mime=String(body?.mimeType||"image/jpeg").trim().toLowerCase();
  if(!image)return json({error:"No se recibió la foto del producto."},400,corsHeaders(request,env));
  if(!["image/jpeg","image/png","image/webp"].includes(mime))return json({error:"Formato de imagen no permitido."},400,corsHeaders(request,env));
  image=image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/,"");
  if(image.length>7000000)return json({error:"La imagen es demasiado grande para analizarla. Usa una foto más pequeña."},413,corsHeaders(request,env));
  const prompt='Analiza esta foto de la caja o empaque de un producto para inventario. Extrae SOLO información que realmente puedas leer o identificar en la imagen. No inventes SKU, marca, modelo, categoría ni número de serie. No extraigas ni calcules precios de venta. Devuelve SOLO JSON con este formato exacto: {"name":"","sku":null,"brand":null,"model":null,"category":"","serial_number":null,"confidence":0}. name es el nombre comercial visible. sku es el código/SKU/part number del producto. serial_number es el número de serie único de ESTA unidad si aparece claramente en la caja o etiqueta; no confundas SKU o modelo con serial y usa null si no es visible. brand y model solo si aparecen. category solo si es evidente. confidence entre 0 y 1.';
  const out=await geminiGenerateImage(env,image,prompt,{maxTokens:700,json:true,mimeType:mime});
  const text=out?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
  if(!text)throw Object.assign(new Error("Gemini no devolvió datos de la imagen."),{status:502});
  let parsed;
  try{parsed=extractJson(text)}catch{throw Object.assign(new Error("Gemini no devolvió un JSON válido para la caja del producto."),{status:502})}
  const product={
    name:String(parsed?.name||"").trim().slice(0,180),
    sku:parsed?.sku?String(parsed.sku).trim().slice(0,120):null,
    brand:parsed?.brand?String(parsed.brand).trim().slice(0,120):null,
    model:parsed?.model?String(parsed.model).trim().slice(0,120):null,
    category:String(parsed?.category||"").trim().slice(0,120),
    serial_number:parsed?.serial_number?String(parsed.serial_number).trim().slice(0,180):null,
    confidence:Math.min(1,Math.max(0,Number(parsed?.confidence||0)))
  };
  await incrementAiUsage(env,token,user.id,access);
  await audit(env,token,user.id,"INVENTORY",null,"ANALYZE_PRODUCT_PHOTO",{confidence:product.confidence,identified:Boolean(product.name)},"WEB");
  return json({status:"ANALYZED",product},200,corsHeaders(request,env));
}

function parseInventoryProductLines(text,pageNumber){
  const raw=String(text||"").trim();
  const out=[];
  const seen=new Set();

  const add=(name,sku="",brand="",model="",price="")=>{
    name=String(name||"").replace(/^[•*\-\d.)\s]+/,"").trim();
    if(name.length<3)return;
    const lower=name.toLowerCase();
    if(/^(catalogo|catálogo|productos|accesorios|descripción|precio|codigo|código|sku|marca|modelo)$/.test(lower))return;
    if(/^(pagina|página)\s*\d+$/i.test(name))return;
    const key=(name+"|"+String(sku||"")+"|"+String(model||"")).toLowerCase();
    if(seen.has(key))return;
    seen.add(key);
    const n=v=>{const m=String(v||"").replace(",",".").replace(/[^\d.-]/g,"");const x=Number(m);return Number.isFinite(x)?x:null};
    out.push({
      sku:String(sku||"").trim()||null,
      name:name.slice(0,180),
      brand:String(brand||"").trim()||null,
      model:String(model||"").trim()||null,
      category:null,
      unit:"UND",
      cost:null,
      price:n(price),
      stock:null,
      min_stock:null,
      page_number:pageNumber
    });
  };

  // Preferred compact line format: NAME || SKU || BRAND || MODEL || PRICE
  for(const rawLine of raw.split(/\r?\n/)){
    const line=rawLine.trim();
    if(!line)continue;
    if(line.includes("||")){
      const p=line.split("||").map(x=>x.trim());
      add(p[0],p[1]||"",p[2]||"",p[3]||"",p[4]||"");
      continue;
    }
    // Fallback for bullets or plain one-product-per-line output.
    if(/^[•*\-\d]/.test(line) && line.length>=4){
      add(line);
    }
  }

  // JSON fallback if the model ignored the line format.
  if(!out.length){
    try{
      const parsed=extractJson(raw);
      const items=Array.isArray(parsed)?parsed:(Array.isArray(parsed?.items)?parsed.items:[]);
      for(const x of items){
        if(typeof x==="string")add(x,"","","","");
        else add(x?.name,x?.sku,x?.brand,x?.model,x?.price);
      }
    }catch{}
  }
  return out;
}

async function inventoryPdfPageAnalyze(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {user}=await authUser(request,env);
  const adminToken=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  const body=await request.json();
  const pendingId=String(body?.pendingId||"");
  const pageNumber=Math.max(1,Number(body?.pageNumber||1));
  const totalPages=Math.max(pageNumber,Number(body?.totalPages||pageNumber));
  const image=String(body?.image||"");
  const pageText=String(body?.text||"").trim();
  if(!pendingId||(!image&&!pageText))return json({error:"Faltan los datos de la página."},400,corsHeaders(request,env));
  if(image.length>6*1024*1024)return json({error:"La imagen de la página es demasiado grande."},413,corsHeaders(request,env));

  const rows=await sb(env,adminToken,"marc_pending_imports?select=id,items,status,expires_at&user_id=eq."+encodeURIComponent(user.id)+"&id=eq."+encodeURIComponent(pendingId)+"&status=eq.PENDING&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&limit=1");
  if(!rows?.[0])return json({error:"La sesión de análisis expiró o no existe."},404,corsHeaders(request,env));

  const prompt=
    "Lee la página "+pageNumber+" de "+totalPages+" de un catálogo. "+
    "Extrae CADA producto real visible, uno por línea. No agrupes productos diferentes. "+
    "Conserva el NOMBRE COMPLETO del producto, incluyendo variante, color, capacidad o modelo cuando formen parte del nombre. "+
    "Ignora encabezados, títulos de sección, textos promocionales, servicios y elementos decorativos. "+
    "Si aparecen SKU, marca, modelo o precio, inclúyelos. Si no aparecen, deja ese campo vacío. NO inventes datos. "+
    "Devuelve SOLO líneas con este formato: NOMBRE || SKU || MARCA || MODELO || PRECIO.";

  let text="";
  let mode="TEXT";
  if(pageText.length>=120){
    text=await geminiGenerateText(env,pageText,prompt,{maxTokens:3200});
  }else{
    mode="IMAGE";
    const out=await geminiGenerateImage(env,image,prompt,{maxTokens:3200});
    text=out?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
  }

  if(!text)throw Object.assign(new Error("Gemini no devolvió productos para la página "+pageNumber+"."),{status:502});
  const items=parseInventoryProductLines(text,pageNumber);
  if(!items.length){
    throw Object.assign(new Error("No se reconocieron productos en la página "+pageNumber+"."),{status:502,details:{mode,preview:text.slice(0,700)}});
  }

  return json({pageNumber,totalPages,found:items.length,totalFound:items.length,items,mode},200,corsHeaders(request,env));
}

async function inventoryPdfFinalize(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env);
  if(!(await rateLimit(env,"ai:"+user.id+":pdf-finalize",10,3600)))return json({error:"Has alcanzado el límite temporal de finalización de PDF. Intenta nuevamente más tarde."},429,corsHeaders(request,env));
  if(!(await rateLimit(env,"ai:"+user.id+":pdf-page",60,3600)))return json({error:"Has alcanzado el límite temporal de análisis de páginas PDF. Intenta nuevamente más tarde."},429,corsHeaders(request,env));
  const adminToken=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  const form=await request.formData();
  const pendingId=String(form.get("pendingId")||"");
  const file=form.get("file");
  const submittedItems=String(form.get("items")||"");
  if(!pendingId||!file||typeof file.arrayBuffer!=="function")return json({error:"Faltan el PDF o la importación pendiente."},400,corsHeaders(request,env));
  const bytes=await file.arrayBuffer();
  if(bytes.byteLength>20*1024*1024)return json({error:"El PDF supera el límite de 20 MB."},413,corsHeaders(request,env));

  const rows=await sb(env,adminToken,"marc_pending_imports?select=id,user_id,items,status,expires_at&user_id=eq."+encodeURIComponent(user.id)+"&id=eq."+encodeURIComponent(pendingId)+"&status=eq.PENDING&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&limit=1");
  const pending=rows?.[0];
  if(!pending)return json({error:"La importación expiró o ya fue finalizada."},404,corsHeaders(request,env));
  let submitted=[];
  if(submittedItems){
    try{submitted=JSON.parse(submittedItems)}catch{}
  }
  const items=sanitizePdfItems(Array.isArray(submitted)&&submitted.length?submitted:pending.items);
  if(!items.length)return json({error:"No se detectaron productos para mostrar."},422,corsHeaders(request,env));

  const safeName=String(file.name||"catalogo.pdf").replace(/[^A-Za-z0-9._-]/g,"_").slice(-120)||"catalogo.pdf";
  const path=user.id+"/"+Date.now()+"-"+crypto.randomUUID()+"-"+safeName;
  const upload=await fetch(env.SUPABASE_URL+"/storage/v1/object/marc-documents/"+path,{
    method:"POST",
    headers:{Authorization:"Bearer "+adminToken,apikey:adminToken,"Content-Type":"application/pdf","x-upsert":"false"},
    body:bytes
  });
  if(!upload.ok){
    const t=await upload.text();
    throw new Error("No se pudo guardar el PDF: "+t.slice(0,500));
  }
  const docs=await sb(env,adminToken,"marc_documents",{
    method:"POST",
    body:{user_id:user.id,source:"WEB",filename:safeName,mime_type:"application/pdf",size_bytes:bytes.byteLength,storage_path:path,status:"ANALYZED",extracted_count:items.length,metadata:{ai:"gemini"}}
  });
  const documentId=docs?.[0]?.id||null;
  await sb(env,adminToken,"marc_pending_imports?id=eq."+encodeURIComponent(pendingId)+"&user_id=eq."+encodeURIComponent(user.id),{
    method:"PATCH",body:{document_id:documentId,items,updated_at:new Date().toISOString()}
  });
  return json({pendingId,documentId,count:items.length,items},200,corsHeaders(request,env));
}

async function inventoryPdfPreview(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env);
  const access=await entitlement(env,token,user.id);
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request,env));
  if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de IA de la prueba."},429,corsHeaders(request,env));
  const form=await request.formData();
  const file=form.get("file");
  if(!file||typeof file.arrayBuffer!=="function")return json({error:"Adjunta un archivo PDF."},400,corsHeaders(request,env));
  const mime=String(file.type||"application/pdf").toLowerCase(),name=String(file.name||"catalogo.pdf");
  if(mime!=="application/pdf"&&!name.toLowerCase().endsWith(".pdf"))return json({error:"Solo se aceptan archivos PDF."},400,corsHeaders(request,env));
  const bytes=await file.arrayBuffer();
  if(bytes.byteLength>20*1024*1024)return json({error:"El PDF supera el límite de 20 MB."},413,corsHeaders(request,env));
  const adminToken=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  const job=await createPendingImport(env,adminToken,user.id,"WEB",null,name,bytes);
  await incrementAiUsage(env,token,user.id,access);
  return json({pendingId:job.pending.id,documentId:job.document?.id||null,count:job.items.length,items:job.items.slice(0,50)},200,corsHeaders(request,env));
}

async function inventoryPdfImport(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env);
  if(!(await rateLimit(env,"ai:"+user.id+":pdf-import",20,3600)))return json({error:"Has alcanzado el límite temporal de importación de PDF. Intenta nuevamente más tarde."},429,corsHeaders(request,env));
  const body=await request.json();
  const access=await entitlement(env,token,user.id);
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request,env));
  const result=await importPendingInventory(env,env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY,user.id,String(body?.pendingId||""),body?.updateExisting!==false,"WEB");
  return json(result,200,corsHeaders(request,env));
}

async function processTelegramInventoryPdf(env,adminToken,userId,chatId,document){
  const fileId=String(document?.file_id||"");
  if(!fileId)return;
  if(Number(document?.file_size||0)>20*1024*1024){
    await sendTelegram(env,chatId,"📄 El PDF supera el límite de 20 MB para archivos de Telegram.");
    return;
  }
  const meta=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/getFile?file_id="+encodeURIComponent(fileId));
  const mj=await meta.json().catch(()=>null);
  if(!meta.ok||!mj?.ok||!mj?.result?.file_path)throw new Error(mj?.description||"Telegram no pudo preparar el PDF.");
  const dl=await fetch("https://api.telegram.org/file/bot"+env.TELEGRAM_BOT_TOKEN+"/"+mj.result.file_path);
  if(!dl.ok)throw new Error("No pude descargar el PDF desde Telegram.");
  const bytes=await dl.arrayBuffer();
  const name=String(document.file_name||"catalogo.pdf");
  const job=await createPendingImport(env,adminToken,userId,"TELEGRAM",chatId,name,bytes);
  const preview=job.items.slice(0,10).map((x,i)=>(i+1)+". "+x.name+(x.brand?" · "+x.brand:"")+(x.model?" · "+x.model:"")+(x.price!=null?" · S/ "+x.price.toFixed(2):"")).join("\n");
  await sendTelegram(env,chatId,"📦 Analicé el PDF con Gemini.\n\nEncontré "+job.items.length+" productos.\n\n"+preview+"\n"+(job.items.length>10?"\n…y "+(job.items.length-10)+" más.\n":"")+"\nResponde IMPORTAR para agregarlos al inventario o CANCELAR para descartarlos. El enlace de importación dura 15 minutos.");
}
async function quoteAiDraft(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env);
  const access=await entitlement(env,token,user.id);
  if(!(await rateLimit(env,"ai:"+user.id+":quote",40,3600)))return json({error:"Has alcanzado el límite temporal de generación de cotizaciones con IA. Intenta nuevamente más tarde."},429,corsHeaders(request,env));
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request,env));
  if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de IA de la prueba."},429,corsHeaders(request,env));
  const body=await request.json();
  const improveLines=Boolean(body?.improveLines);
  const rawLines=Array.isArray(body?.items)?body.items:[];
  const description=String(body?.description||"").trim().slice(0,4000);
  const allCost=Boolean(body?.allCost);
  const improveOnly=Boolean(body?.improveOnly);
  const clientQuery=String(body?.clientQuery||"").trim().slice(0,200);
  if(body?.reviewQuote){
    const items=rawLines.map((x,i)=>({index:Number.isInteger(Number(x?.index))?Number(x.index):i,type:String(x?.type||"TRABAJO"),name:String(x?.name||"").trim(),description:String(x?.description||"").trim(),quantity:Number(x?.quantity||0),unit_price:Number(x?.unit_price||0),cost:Number(x?.cost||0),transport:Number(x?.transport||0),labor:Number(x?.labor||0),other:Number(x?.other||0),material_provider:String(x?.material_provider||"CLIENT")})).slice(0,40);
    if(!items.length)return json({error:"Agrega al menos una partida para revisar."},400,corsHeaders(request,env));
    const subtotal=items.reduce((s,x)=>s+(x.quantity*x.unit_price),0),internalCost=items.reduce((s,x)=>s+(x.quantity*x.cost)+x.transport+x.labor+x.other,0);
    const prompt={messages:[
      {role:"system",content:'Eres un revisor técnico de cotizaciones. Devuelve SOLO JSON válido con {"issues":[{"title":"...","detail":"..."}],"positives":[{"title":"...","detail":"..."}]}. Analiza únicamente los datos recibidos. Detecta descripciones vacías o poco específicas, cantidades/precios/costos incoherentes, trabajos sin detalles suficientes, costos internos faltantes cuando sean relevantes y posibles inconsistencias entre tipo de partida y sus datos. NO inventes precios de mercado ni afirmes que un precio es caro o barato. No inventes información. Las observaciones deben ser concretas y útiles. Máximo 8 observaciones.'},
      {role:"user",content:"TÍTULO: "+String(body?.title||"Cotización")+"\nIGV: "+String(body?.taxEnabled?"SI":"NO")+" · "+String(body?.taxRate||18)+"%\nNOTAS: "+String(body?.notes||"")+"\nSUBTOTAL CALCULADO: "+subtotal+"\nCOSTO INTERNO CALCULADO: "+internalCost+"\nPARTIDAS:\n"+JSON.stringify(items)}
    ]};
    let out;try{out=await geminiGenerate(env,prompt,{json:true,maxTokens:1800})}catch(err){throw Object.assign(new Error("Gemini: "+String(err?.message||"Error de API").slice(0,800)),{status:err?.status||502,details:err?.details||null})}
    const textOut=out?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
    if(!textOut)throw Object.assign(new Error("Gemini devolvió una respuesta vacía."),{status:502});
    let review;try{review=JSON.parse(textOut.replace(/^```json\s*|^```\s*$/g,"").trim())}catch{throw Object.assign(new Error("Gemini devolvió una revisión en un formato no válido. Inténtalo nuevamente."),{status:502,details:{raw:textOut.slice(0,500)}})}
    await incrementAiUsage(env,token,user.id,access);
    return json({review:{issues:Array.isArray(review.issues)?review.issues.slice(0,8):[],positives:Array.isArray(review.positives)?review.positives.slice(0,8):[]},entitlement:access},200,corsHeaders(request,env));
  }
  if(improveLines){
    const items=rawLines.map((x,i)=>({index:Number.isInteger(Number(x?.index))?Number(x.index):i,type:String(x?.type||"TRABAJO").slice(0,20),name:String(x?.name||"").trim().slice(0,180),description:String(x?.description||"").trim().slice(0,2000)})).filter(x=>x.description).slice(0,40);
    if(!items.length)return json({error:"Escribe al menos una descripción para mejorar."},400,corsHeaders(request,env));
    const prompt={messages:[
      {role:"system",content:'Eres un redactor técnico de cotizaciones para una empresa de servicios. Devuelve SOLO JSON válido con {"items":[{"index":0,"title":"...","description":"..."}]}. Mejora únicamente la redacción de cada descripción recibida. Conserva todos los datos aportados y NO inventes datos técnicos, cantidades, precios, materiales, marcas, medidas, plazos ni trabajos. No agregues información que no esté escrita. Haz el texto profesional, claro, específico y apto para una cotización. El índice debe conservar exactamente el índice recibido.'},
      {role:"user",content:"PARTIDAS A MEJORAR:\n"+JSON.stringify(items)}
    ]};
    let out;try{out=await geminiGenerate(env,prompt,{json:true,maxTokens:2200})}catch(err){throw Object.assign(new Error("Gemini: "+String(err?.message||"Error de API").slice(0,800)),{status:err?.status||502,details:err?.details||null})}
    const responseText=out?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
    if(!responseText)throw Object.assign(new Error("Gemini devolvió una respuesta vacía."),{status:502});
    let parsed;try{parsed=JSON.parse(responseText.replace(/^```json\s*|^```\s*$/g,"").trim())}catch{parsed={items:[]}}
    const improvedLines=Array.isArray(parsed?.items)?parsed.items.map((x,i)=>({index:Number.isInteger(Number(x?.index))?Number(x.index):items[i]?.index,title:String(x?.title||"").trim().slice(0,180),description:String(x?.description||"").trim().slice(0,2000)})).filter(x=>Number.isInteger(x.index)&&x.description):[];
    await incrementAiUsage(env,token,user.id,access);
    return json({improvedLines,entitlement:access},200,corsHeaders(request,env));
  }
  if(!description)return json({error:"Escribe la descripción del trabajo."},400,corsHeaders(request,env));
  const prompt=improveOnly?{messages:[
    {role:"system",content:'Eres un redactor técnico de cotizaciones para una empresa de servicios. Devuelve SOLO JSON válido con {"title":"...","description":"..."}. Mejora la redacción del texto sin inventar datos técnicos, cantidades, precios, materiales, marcas, medidas ni trabajos que no estén escritos. Conserva todos los datos aportados. Hazlo profesional, claro, específico y apto para una cotización. Si faltan datos, no los inventes.'},
    {role:"user",content:"TEXTO ORIGINAL:\n"+description}
  ]}:{messages:[
    {role:"system",content:'Eres el asistente de cotizaciones de M.A.R.C. Devuelve SOLO JSON válido. No inventes precios, clientes, productos ni cantidades. Si el usuario escribe un precio, extrae el número. Si no escribe precio, unit_price debe ser null. En modo A TODO COSTO la cotización debe tener una sola partida de tipo TRABAJO, cantidad 1, y el nombre debe ser un título corto; la descripción debe conservar los detalles técnicos del trabajo. Si el texto contiene "a todo costo", mantén esa idea en la descripción. Extrae un título profesional. Formato exacto: {"title":"...","client_query":"...","items":[{"type":"TRABAJO","name":"...","description":"...","quantity":1,"unit_price":number|null}]}.'},
    {role:"user",content:"MODO A TODO COSTO: "+(allCost?"SI":"NO")+"\nCLIENTE SUGERIDO: "+clientQuery+"\nDESCRIPCIÓN:\n"+description}
  ]};
  let out;try{out=await geminiGenerate(env,prompt,{json:true,maxTokens:500})}catch(err){throw Object.assign(new Error("Gemini: "+String(err?.message||"Error de API").slice(0,800)),{status:err?.status||502,details:err?.details||null})}
  const responseText=out?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
  if(!responseText)throw Object.assign(new Error("Gemini devolvió una respuesta vacía. Revisa el modelo y la cuota de la API key."),{status:502,details:{finishReason:out?.candidates?.[0]?.finishReason||null}});
  if(improveOnly){let improved;try{improved=JSON.parse(responseText.replace(/^```json\s*|^```\s*$/g,"").trim())}catch{improved={title:"",description:description}}await incrementAiUsage(env,token,user.id,access);return json({improved:{title:String(improved.title||"").trim(),description:String(improved.description||description).trim()},entitlement:access},200,corsHeaders(request,env))}
  const draft=recoverQuoteDraft(responseText,description,clientQuery,allCost);
  if(!draft?.items?.length)throw Object.assign(new Error("La IA no generó una partida."),{status:502});
  await incrementAiUsage(env,token,user.id,access);
  return json({draft,entitlement:access},200,corsHeaders(request,env));
}
async function marketingImage(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env),access=await entitlement(env,token,user.id);
  if(!(await rateLimit(env,"ai:"+user.id+":image",20,3600)))return json({error:"Has alcanzado el límite temporal de generación de imágenes. Intenta nuevamente más tarde."},429,corsHeaders(request,env));
  if(!(await rateLimit(env,"ai:"+user.id+":image",20,3600)))return json({error:"Has alcanzado el límite temporal de generación de imágenes. Intenta nuevamente más tarde."},429,corsHeaders(request,env));
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request,env));
  if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de IA de la prueba."},429,corsHeaders(request,env));

  const body=await request.json();
  const p=body?.product||{};
  const campaign=body?.campaign||{};
  const apiKey=env.GEMINI_API_KEY||env.GEMINI_API_KEY2;
  if(!apiKey)throw Object.assign(new Error("GEMINI_API_KEY no está configurada en el Worker."),{status:503});

  const format=String(body?.format||"1080x1080");
  const ratio=format==="1080x1350"?"4:5":format==="1080x1920"?"9:16":"1:1";
  const platform=String(body?.platform||"INSTAGRAM").toUpperCase();
  const requested=Array.isArray(body?.variants)&&body.variants.length?body.variants:["MODERN"];
  const variants=[...new Set(requested.map(x=>String(x||"MODERN").toUpperCase()))].slice(0,3);
  const styleMap={
    COMMERCIAL:"Comercial: impacto visual inmediato, producto protagonista, contraste claro, energía de venta y composición pensada para captar atención rápidamente.",
    PROFESSIONAL:"Profesional: limpio, sobrio y confiable, iluminación equilibrada, espacio ordenado, estética empresarial y tecnológica.",
    PREMIUM:"Premium: elegante, sofisticado, iluminación cinematográfica, profundidad, materiales visualmente refinados y sensación de alta gama."
  };

  const rawImage=String(body?.imageData||"");
  const imageData=rawImage?rawImage.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/):null;
  if(rawImage&&!imageData)throw Object.assign(new Error("La imagen enviada no tiene un formato válido."),{status:400});
  if(imageData&&imageData[2].length>8_500_000)throw Object.assign(new Error("La foto es demasiado grande. Usa una imagen menor de 6 MB."),{status:413});

  const models=[env.GEMINI_IMAGE_MODEL||"gemini-2.5-flash-image","gemini-3.1-flash-image"].filter((x,i,a)=>x&&a.indexOf(x)===i);
  const images=[];
  let lastError=null;

  for(const variant of variants){
    const visualPrompt=[
      "Crea una pieza visual publicitaria profesional usando la FOTO PRINCIPAL como fuente absoluta de verdad.",
      "IDENTIDAD DEL PRODUCTO: conserva exactamente el objeto fotografiado. No lo reemplaces, no lo conviertas en otro producto, no cambies su categoría, marca visible, forma, estructura, color principal ni características físicas.",
      "Si los datos escritos dicen una cosa diferente a la foto, IGNORA los datos contradictorios y sigue la foto. Nunca conviertas un ventilador en una cámara, una herramienta en otro producto ni un producto TOTAL en otro producto.",
      "Puedes mejorar el entorno: elimina fondos descuidados, manos, piernas, superficies pobres y elementos distractores cuando sea posible; crea un fondo profesional coherente con el uso real del producto; mejora iluminación, sombras, profundidad, nitidez y composición.",
      "El producto debe permanecer reconocible y físicamente fiel. No inventes accesorios importantes ni cambies piezas del producto.",
      "No escribas texto, letras, números, precios, especificaciones, marcas nuevas, logotipos nuevos, códigos QR, botones ni interfaces dentro de la imagen. La aplicación colocará posteriormente los textos exactos y el logo real.",
      "Deja una zona visual limpia y equilibrada para que la aplicación coloque titular, precio y llamada a la acción.",
      "Estética: anuncio comercial profesional para redes sociales, producto grande y protagonista, fondo relacionado con su uso, iluminación atractiva, profundidad y composición moderna. Evita plantillas genéricas vacías.",
      "Relación de aspecto: "+ratio+".",
      "PROPUESTA VISUAL: "+variant+". "+(styleMap[variant]||"Composición moderna y comercial equilibrada."),
      "DATOS AUXILIARES DEL PRODUCTO (solo sirven para contexto y nunca pueden contradecir la foto): "+JSON.stringify({
        name:String(p.name||""),brand:String(p.brand||""),model:String(p.model||""),category:String(p.category||""),details:String(body?.details||"")
      })
    ].join("\n");

    const parts=[{text:visualPrompt}];
    if(imageData)parts.push({inlineData:{mimeType:imageData[1]==="image/jpg"?"image/jpeg":imageData[1],data:imageData[2]}});
    const refRaw=String(body?.referenceImageData||"");
    const refMatch=refRaw.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
    if(refMatch){
      parts.push({text:"FOTO DE REFERENCIA: úsala únicamente para confirmar modelo, marca, etiqueta o detalles visibles. No la uses para cambiar la identidad del producto principal."});
      parts.push({inlineData:{mimeType:refMatch[1]==="image/jpg"?"image/jpeg":refMatch[1],data:refMatch[2]}});
    }
    let variantImage=null;
    for(const model of models){
      try{
        const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
          method:"POST",
          headers:{"content-type":"application/json","x-goog-api-key":apiKey},
          body:JSON.stringify({
            contents:[{parts}],
            generationConfig:{
              responseModalities:["IMAGE"],
              responseFormat:{image:{aspectRatio:ratio}}
            }
          })
        });
        const raw=await r.text();let data=null;try{data=raw?JSON.parse(raw):null}catch{}
        if(!r.ok){
          const er=new Error(data?.error?.message||("Gemini Image API error "+r.status));
          er.status=r.status;er.details=data;throw er;
        }
        const imagePart=data?.candidates?.[0]?.content?.parts?.find(x=>x?.inlineData?.data||x?.inline_data?.data);
        const image=imagePart?.inlineData||imagePart?.inline_data;
        if(!image?.data)throw Object.assign(new Error("Gemini no devolvió una imagen."),{status:502,details:data});
        variantImage={variant,mimeType:image.mimeType||image.mime_type||"image/png",data:image.data,model};
        break;
      }catch(err){
        lastError=err;
        if(![429,500,502,503,504].includes(Number(err?.status)))break;
      }
    }
    if(variantImage)images.push(variantImage);
  }

  if(!images.length)throw Object.assign(new Error("No se pudo generar el banner con IA: "+String(lastError?.message||"Gemini no disponible.").slice(0,500)),{status:lastError?.status||502,details:lastError?.details||null});
  await incrementAiUsage(env,token,user.id,access);
  return json({
    images,
    image:{mimeType:images[0].mimeType,data:images[0].data},
    model:images[0].model
  },200,corsHeaders(request,env));
}

async function marketingVideoStart(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env),access=await entitlement(env,token,user.id);
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request,env));
  if(access.kind==="trial"||access.kind==="trial_limited")return json({
    error:"VIDEO_SUBSCRIPTION_REQUIRED",
    message:"La generación de videos con IA está incluida en las suscripciones activas. Activa un plan para usar esta función.",
    includedInSubscription:true
  },402,corsHeaders(request,env));

  const body=await request.json(),product=body?.product||{},campaign=body?.campaign||{};
  const apiKey=env.GEMINI_API_KEY||env.GEMINI_API_KEY2;
  if(!apiKey)throw Object.assign(new Error("GEMINI_API_KEY no está configurada en el Worker."),{status:503});

  const requestedModel=String(body?.model||env.GEMINI_VIDEO_MODEL||"veo-3.1-lite-generate-preview");
  const allowedModels=new Set(["veo-3.1-lite-generate-preview","veo-3.1-fast-generate-preview","veo-3.1-generate-preview"]);
  const model=allowedModels.has(requestedModel)?requestedModel:"veo-3.1-lite-generate-preview";
  const format=String(body?.format||"1080x1920");
  const aspectRatio=format==="1080x1920"||format==="1080x1350"?"9:16":"16:9";
  const rawImage=String(body?.imageData||"");
  const imageMatch=rawImage?rawImage.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/):null;
  if(rawImage&&!imageMatch)throw Object.assign(new Error("La imagen enviada no tiene un formato válido."),{status:400});
  if(imageMatch&&imageMatch[2].length>8_500_000)throw Object.assign(new Error("La foto es demasiado grande. Usa una imagen menor de 6 MB."),{status:413});

  const prompt=[
    "Crea un video publicitario vertical u horizontal de 8 segundos para un negocio real.",
    "La prioridad es mostrar el producto de forma atractiva, realista y comercial.",
    "No inventes características técnicas ni afirmaciones que no estén en los datos recibidos.",
    "No dependas de texto escrito dentro del video para comunicar precio, teléfono, logo o CTA; esos datos pueden añadirse después por la aplicación.",
    "Usa movimientos de cámara suaves y una presentación profesional del producto.",
    "Producto: "+JSON.stringify({
      name:String(product.name||"Producto"),
      brand:String(product.brand||""),
      model:String(product.model||""),
      category:String(product.category||""),
      description:String(product.description||product.marketing_description||"")
    }),
    "Idea del usuario: "+String(body?.details||""),
    "Texto publicitario disponible: "+String(campaign.headline||campaign.banner_text||""),
    "Objetivo: "+String(body?.objective||"VENDER"),
    "Tono: "+String(body?.tone||"PROFESIONAL"),
    "Plataforma: "+String(body?.platform||"INSTAGRAM"),
    "Relación de aspecto: "+aspectRatio
  ].join("\n");

  const instances=[{prompt}];
  if(imageMatch)instances[0].image={inlineData:{mimeType:imageMatch[1]==="image/jpg"?"image/jpeg":imageMatch[1],data:imageMatch[2]}};

  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":predictLongRunning",{
    method:"POST",
    headers:{"content-type":"application/json","x-goog-api-key":apiKey},
    body:JSON.stringify({instances,parameters:{aspectRatio,resolution:"720p",durationSeconds:"8"}})
  });
  const data=await r.json().catch(()=>null);
  if(!r.ok||!data?.name){
    throw Object.assign(new Error(data?.error?.message||("Veo rechazó la solicitud ("+r.status+").")),{
      status:r.status||502,details:data
    });
  }
  return json({
    status:"PROCESSING",
    operationName:data.name,
    model,
    aspectRatio,
    durationSeconds:8,
    message:"Video iniciado. La generación es asíncrona; M.A.R.C. consultará el estado."
  },202,corsHeaders(request,env));
}

async function marketingVideoStatus(request,env){
  const method=request.method;
  if(method!=="GET"&&method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env),access=await entitlement(env,token,user.id);
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request,env));
  if(access.kind!=="paid"&&access.kind!=="master")return json({error:"VIDEO_SUBSCRIPTION_REQUIRED",message:"La generación de videos está incluida en una suscripción activa de M.A.R.C."},402,corsHeaders(request,env));

  let operationName="";
  let download=false;
  if(method==="GET"){
    const url=new URL(request.url);
    operationName=String(url.searchParams.get("operationName")||"").trim();
    download=url.searchParams.get("download")==="1";
  }else{
    const body=await request.json();
    operationName=String(body?.operationName||"").trim();
    download=Boolean(body?.download);
  }
  if(!operationName||!/^operations\/[A-Za-z0-9._-]+$/.test(operationName)){
    return json({error:"operationName inválido."},400,corsHeaders(request,env));
  }

  const apiKey=env.GEMINI_API_KEY||env.GEMINI_API_KEY2;
  if(!apiKey)throw Object.assign(new Error("GEMINI_API_KEY no está configurada en el Worker."),{status:503});
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/"+operationName,{headers:{"x-goog-api-key":apiKey}});
  const data=await r.json().catch(()=>null);
  if(!r.ok)throw Object.assign(new Error(data?.error?.message||("No se pudo consultar Veo ("+r.status+").")),{status:r.status||502,details:data});

  if(!data?.done){
    return json({status:"PROCESSING",operationName},200,corsHeaders(request,env));
  }
  if(data?.error){
    return json({status:"FAILED",operationName,error:data.error.message||"Veo no pudo generar el video.",detail:data.error},200,corsHeaders(request,env));
  }

  const sample=data?.response?.generateVideoResponse?.generatedSamples?.[0]||data?.response?.generatedVideos?.[0]||null;
  const videoUri=sample?.video?.uri||null;
  if(!videoUri)return json({status:"FAILED",operationName,error:"Veo terminó, pero no devolvió un archivo de video."},200,corsHeaders(request,env));

  if(!download){
    await incrementAiUsage(env,token,user.id,access);
    return json({status:"READY",operationName,downloadUrl:"/api/marketing-video-status?operationName="+encodeURIComponent(operationName)+"&download=1",mimeType:"video/mp4",durationSeconds:8},200,corsHeaders(request,env));
  }

  const video=await fetch(videoUri,{headers:{"x-goog-api-key":apiKey}});
  if(!video.ok)throw Object.assign(new Error("Veo generó el video, pero no se pudo descargar el archivo."),{status:502});
  const headers=new Headers(corsHeaders(request,env));
  headers.set("content-type",video.headers.get("content-type")||"video/mp4");
  headers.set("content-disposition",'attachment; filename="MARC_Publicidad_Video.mp4"');
  headers.set("cache-control","private, no-store");
  return new Response(video.body,{status:200,headers});
}

async function createClientPortal(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405,corsHeaders(request,env));
  const {token,user}=await authUser(request,env);
  const body=await request.json().catch(()=>({}));
  const clientId=String(body?.clientId||"").trim();
  if(!clientId)return json({error:"clientId requerido"},400,corsHeaders(request,env));
  const clientRows=await sb(env,token,"marc_clients?id=eq."+encodeURIComponent(clientId)+"&user_id=eq."+encodeURIComponent(user.id)+"&select=id,name,portal_enabled&limit=1");
  const client=clientRows?.[0];
  if(!client)return json({error:"Cliente no encontrado"},404,corsHeaders(request,env));
  const rawToken=randomToken(32);
  const hash=await sha256Hex(rawToken);
  await sb(env,token,"marc_clients?id=eq."+encodeURIComponent(clientId)+"&user_id=eq."+encodeURIComponent(user.id),{
    method:"PATCH",
    body:{portal_enabled:true,portal_token_hash:hash,portal_created_at:new Date().toISOString(),portal_last_seen_at:null}
  });
  await audit(env,token,user.id,"CLIENT",clientId,"PORTAL_CREATE",{client_name:client.name},"WEB");
  const origin=new URL(request.url).origin;
  return json({ok:true,clientId,name:client.name,token:rawToken,portalUrl:origin+"/?cliente_token="+encodeURIComponent(rawToken)},200,corsHeaders(request,env));
}

async function revokeClientPortal(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405,corsHeaders(request,env));
  const {token,user}=await authUser(request,env);
  const body=await request.json().catch(()=>({}));
  const clientId=String(body?.clientId||"").trim();
  if(!clientId)return json({error:"clientId requerido"},400,corsHeaders(request,env));
  const rows=await sb(env,token,"marc_clients?id=eq."+encodeURIComponent(clientId)+"&user_id=eq."+encodeURIComponent(user.id)+"&select=id,name&limit=1");
  if(!rows?.[0])return json({error:"Cliente no encontrado"},404,corsHeaders(request,env));
  await sb(env,token,"marc_clients?id=eq."+encodeURIComponent(clientId)+"&user_id=eq."+encodeURIComponent(user.id),{
    method:"PATCH",body:{portal_enabled:false,portal_token_hash:null,portal_created_at:null,portal_last_seen_at:null}
  });
  return json({ok:true},200,corsHeaders(request,env));
}

async function clientPortalView(request,env){
  if(request.method!=="GET")return json({error:"Método no permitido"},405,corsHeaders(request,env));
  const url=new URL(request.url);
  const rawToken=String(url.searchParams.get("token")||"").trim();
  if(rawToken.length<20)return json({error:"Enlace de cliente inválido o vencido."},401,corsHeaders(request,env));
  const hash=await sha256Hex(rawToken);
  const adminToken=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;
  if(!adminToken)throw Object.assign(new Error("El portal de clientes requiere SUPABASE_SERVICE_ROLE_KEY."),{status:503});
  const rows=await sb(env,adminToken,"marc_clients?portal_enabled=eq.true&portal_token_hash=eq."+encodeURIComponent(hash)+"&select=id,user_id,name,document_type,document_number,contact_name,email,phone,address,portal_last_seen_at&limit=1");
  const client=rows?.[0];
  if(!client)return json({error:"Enlace de cliente inválido o vencido."},401,corsHeaders(request,env));
  const uid=client.user_id,cid=client.id;
  const [company,quotes,reports,history]=await Promise.all([
    sb(env,adminToken,"marc_company_profiles?user_id=eq."+encodeURIComponent(uid)+"&select=business_name,phone,email,logo_data&limit=1"),
    sb(env,adminToken,"marc_quotes?user_id=eq."+encodeURIComponent(uid)+"&client_id=eq."+encodeURIComponent(cid)+"&deleted_at=is.null&select=id,number,title,status,total,tax_enabled,tax_rate,notes,created_at,updated_at&order=created_at.desc&limit=100"),
    sb(env,adminToken,"technical_reports?user_id=eq."+encodeURIComponent(uid)+"&client_id=eq."+encodeURIComponent(cid)+"&select=id,number,title,report_type,report_date,technician,location,equipment,problem,diagnosis,work_performed,recommendations,conclusions,observations,status,created_at&order=created_at.desc&limit=100"),
    sb(env,adminToken,"marc_client_history?user_id=eq."+encodeURIComponent(uid)+"&client_id=eq."+encodeURIComponent(cid)+"&visible_to_client=eq.true&select=id,event_type,title,description,metadata,created_at&order=created_at.desc&limit=100")
  ]);
  const quoteIds=(quotes||[]).map(x=>x.id);
  let items=[],payments=[];
  if(quoteIds.length){
    const inList=quoteIds.map(id=>encodeURIComponent(id)).join(",");
    [items,payments]=await Promise.all([
      sb(env,adminToken,"marc_quote_items?user_id=eq."+encodeURIComponent(uid)+"&quote_id=in.("+inList+")&select=quote_id,item_type,name,description,quantity,unit,unit_price,line_total&order=created_at.asc"),
      sb(env,adminToken,"marc_cash_movements?user_id=eq."+encodeURIComponent(uid)+"&quote_id=in.("+inList+")&type=eq.INCOME&select=quote_id,amount,concept,reference,created_at&order=created_at.desc")
    ]);
  }
  const safeQuotes=(quotes||[]).filter(q=>!["BORRADOR","RECHAZADA","ANULADA"].includes(String(q.status||"").toUpperCase())).map(q=>({
    id:q.id,number:q.number,title:q.title,status:q.status,total:Number(q.total||0),
    tax_enabled:Boolean(q.tax_enabled),tax_rate:Number(q.tax_rate||0),notes:q.notes||null,
    created_at:q.created_at,
    items:(items||[]).filter(i=>i.quote_id===q.id).map(i=>({
      item_type:i.item_type,name:i.name,description:i.description,quantity:Number(i.quantity||0),unit:i.unit,
      unit_price:Number(i.unit_price||0),line_total:Number(i.line_total||0)
    })),
    payments:(payments||[]).filter(p=>p.quote_id===q.id).map(p=>({amount:Number(p.amount||0),concept:p.concept||null,reference:p.reference||null,created_at:p.created_at})),
    paid_total:(payments||[]).filter(p=>p.quote_id===q.id).reduce((s,p)=>s+Number(p.amount||0),0)
  }));
  const visibleHistory=[
    ...safeQuotes.map(q=>({id:"quote-"+q.id,event_type:"QUOTE",title:q.title||("Cotización "+q.number),description:q.notes||("Estado: "+q.status),created_at:q.created_at,metadata:{number:q.number,status:q.status,total:q.total}})),
    ...(reports||[]).map(r=>({id:"report-"+r.id,event_type:"REPORT",title:r.title||("Informe "+r.number),description:r.work_performed||r.conclusions||r.observations||null,created_at:r.created_at,metadata:{number:r.number,status:r.status,report_date:r.report_date,technician:r.technician}})),
    ...(history||[]).map(h=>({id:h.id,event_type:h.event_type,title:h.title,description:h.description,created_at:h.created_at,metadata:h.metadata||{}}))
  ].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  await sb(env,adminToken,"marc_clients?id=eq."+encodeURIComponent(cid)+"&user_id=eq."+encodeURIComponent(uid),{method:"PATCH",body:{portal_last_seen_at:new Date().toISOString()}});
  const c=company?.[0]||{};
  return json({
    ok:true,client:{id:cid,name:client.name,document_type:client.document_type,document_number:client.document_number,contact_name:client.contact_name,email:client.email,phone:client.phone,address:client.address},
    company:{business_name:c.business_name||"M.A.R.C.",phone:c.phone||null,email:c.email||null,logo_data:c.logo_data||null},
    summary:{
      quotes:safeQuotes.length,
      accepted:safeQuotes.filter(q=>["ACEPTADA","COBRADA","FINALIZADO","APROBADO"].includes(String(q.status||"").toUpperCase())).length,
      quotedTotal:safeQuotes.reduce((s,q)=>s+Number(q.total||0),0),
      reports:(reports||[]).length,
      products:[...new Map((items||[]).map(i=>[String(i.name||"").toLowerCase(),{name:i.name,unit:i.unit}]).filter(([k])=>k)).values()]
    },
    quotes:safeQuotes,
    reports:(reports||[]).map(r=>({id:r.id,number:r.number,title:r.title,report_type:r.report_type,report_date:r.report_date,technician:r.technician,location:r.location,equipment:r.equipment,problem:r.problem,diagnosis:r.diagnosis,work_performed:r.work_performed,recommendations:r.recommendations,conclusions:r.conclusions,observations:r.observations,status:r.status,created_at:r.created_at})),
    history:visibleHistory
  },200,corsHeaders(request,env));
}

async function marketingAi(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env),access=await entitlement(env,token,user.id);
  if(!(await rateLimit(env,"ai:"+user.id+":marketing",30,3600)))return json({error:"Has alcanzado el límite temporal de generación publicitaria. Intenta nuevamente más tarde."},429,corsHeaders(request,env));
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request,env));
  if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de IA de la prueba."},429,corsHeaders(request,env));
  const body=await request.json(),p=body?.product||{},platform=String(body?.platform||"WHATSAPP").toUpperCase();
  const imageData=String(body?.imageData||"").trim().match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
  const referenceData=String(body?.referenceImageData||"").trim().match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
  const systemText='Eres el director creativo y copywriter de M.A.R.C. Debes crear publicidad basada en el PRODUCTO REAL mostrado en las fotos. REGLA ABSOLUTA DE IDENTIDAD: la foto principal es la fuente de verdad sobre qué producto se anuncia. Si los datos escritos contradicen lo que aparece en la foto, IGNORA el dato contradictorio y describe únicamente el producto visible. NUNCA conviertas un ventilador en una cámara, una herramienta en otro producto, ni una marca en otra. No inventes características técnicas, certificaciones, garantías, descuentos, disponibilidad, medidas, marcas, precios, resultados ni beneficios no sustentados. La foto de referencia adicional solo sirve para leer modelo, marca, etiqueta o detalles; no sustituye la identidad del producto principal. Si un dato no puede confirmarse, usa una descripción prudente. Devuelve SOLO JSON válido con title, headline, primary_text, short_text, whatsapp_text, banner_text, hashtags. headline breve; primary_text completo; short_text corto; whatsapp_text natural y termina con el CTA; banner_text máximo 3 líneas; hashtags arreglo de 3 a 8.';
  const userText="PLATAFORMA: "+platform+"\nOBJETIVO: "+String(body?.objective||"")+"\nOFERTA: "+String(body?.offer||"")+"\nCTA: "+String(body?.cta||"")+"\nBRIEF: "+String(body?.details||"")+"\nDATOS PROPORCIONADOS (solo si coinciden con la imagen): "+JSON.stringify({name:String(p.name||""),brand:String(p.brand||""),model:String(p.model||""),category:String(p.category||""),price:p.price==null||p.price===""?null:Number(p.price)});
  let out;
  try{
    if(imageData){
      const parts=[{text:systemText+"\n\n"+userText+"\n\nAnaliza primero la foto principal para identificar el producto real."},{inlineData:{mimeType:imageData[1]==="image/jpg"?"image/jpeg":imageData[1],data:imageData[2]}}];
      if(referenceData){parts.push({text:"FOTO DE REFERENCIA: úsala solo para confirmar marca, modelo o detalles visibles."});parts.push({inlineData:{mimeType:referenceData[1]==="image/jpg"?"image/jpeg":referenceData[1],data:referenceData[2]}})}
      out=await geminiGenerateImage(env,parts,systemText,{json:true,maxTokens:1100,models:[env.GEMINI_MARKETING_MODEL||"gemini-3.1-flash-lite",env.GEMINI_MODEL_FALLBACK||"gemini-3.7-flash"]});
    }else{
      out=await geminiGenerate(env,{messages:[{role:"system",content:systemText},{role:"user",content:userText}]},{json:true,maxTokens:1300});
    }
  }catch(err){throw Object.assign(new Error("Gemini: "+String(err?.message||"Error de API").slice(0,800)),{status:err?.status||502,details:err?.details||null})}
  const responseText=out?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("")||"";if(!responseText)throw Object.assign(new Error("Gemini devolvió una respuesta vacía."),{status:502});
  let parsed;try{parsed=extractJson(responseText)}catch{throw Object.assign(new Error("La IA devolvió un formato publicitario no válido."),{status:502})}
  await incrementAiUsage(env,token,user.id,access);
  return json({campaign:{title:String(parsed?.title||p.name||"Publicidad").trim().slice(0,180),headline:String(parsed?.headline||p.name||"").trim().slice(0,180),primary_text:String(parsed?.primary_text||"").trim().slice(0,4000),short_text:String(parsed?.short_text||"").trim().slice(0,1200),whatsapp_text:String(parsed?.whatsapp_text||"").trim().slice(0,2000),banner_text:String(parsed?.banner_text||parsed?.headline||p.name||"").trim().slice(0,300),hashtags:Array.isArray(parsed?.hashtags)?parsed.hashtags.map(x=>String(x).trim()).filter(Boolean).slice(0,8):[]},entitlement:access},200,corsHeaders(request,env));
}


function b64u(bytes){
  let s=""; for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function unb64u(s){
  const x=String(s||"").replace(/-/g,"+").replace(/_/g,"/")+"===".slice((String(s||"").length+3)%4);
  const raw=atob(x); const out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}
async function tokenKey(env){
  if(!env.META_TOKEN_ENCRYPTION_KEY)throw Object.assign(new Error("Falta META_TOKEN_ENCRYPTION_KEY en el Worker."),{status:503});
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(env.META_TOKEN_ENCRYPTION_KEY)));
  return crypto.subtle.importKey("raw",digest,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
async function encryptSecret(env,value){
  const iv=crypto.getRandomValues(new Uint8Array(12)),key=await tokenKey(env);
  const data=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(String(value)));
  return "v1."+b64u(iv)+"."+b64u(new Uint8Array(data));
}
async function decryptSecret(env,value){
  const parts=String(value||"").split(".");
  if(parts.length!==3||parts[0]!=="v1")throw new Error("Token protegido no válido.");
  const key=await tokenKey(env);
  const data=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64u(parts[1])},key,unb64u(parts[2]));
  return new TextDecoder().decode(data);
}
async function uploadMarketingDataUrl(env,adminToken,userId,dataUrl){
  const m=String(dataUrl||"").match(/^data:([^;,]+)(?:;base64)?,(.*)$/s);
  if(!m) return String(dataUrl||"");
  const mime=m[1]||"image/png", raw=m[2]||"";
  if(!/;base64$/.test(String(dataUrl).split(",")[0])) throw Object.assign(new Error("La imagen de publicidad debe estar en formato base64."),{status:400});
  const bin=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));
  if(bin.byteLength>8*1024*1024)throw Object.assign(new Error("La imagen de publicidad supera 8 MB."),{status:413});
  const ext=mime.includes("jpeg")||mime.includes("jpg")?"jpg":mime.includes("webp")?"webp":"png";
  const path="marketing/"+userId+"/"+crypto.randomUUID()+"."+ext;
  const r=await fetch(env.SUPABASE_URL+"/storage/v1/object/inventory-images/"+path,{method:"POST",headers:{apikey:adminToken,Authorization:"Bearer "+adminToken,"content-type":mime,"x-upsert":"false"},body:bin});
  if(!r.ok){const rawErr=await r.text();throw Object.assign(new Error("No se pudo guardar la imagen de publicidad."),{status:502,details:rawErr});}
  const signed=await fetch(env.SUPABASE_URL+"/storage/v1/object/sign/inventory-images/"+path,{
    method:"POST",
    headers:{apikey:adminToken,Authorization:"Bearer "+adminToken,"content-type":"application/json"},
    body:JSON.stringify({expiresIn:3600})
  });
  const signedData=await signed.json().catch(()=>null);
  if(!signed.ok||!signedData?.signedURL)throw Object.assign(new Error("No se pudo generar el enlace temporal de la imagen."),{status:502});
  return String(signedData.signedURL).startsWith("http")?String(signedData.signedURL):env.SUPABASE_URL+"/storage/v1"+String(signedData.signedURL);
}
async function metaPublish(request,env){
  const internal= request.headers.get("X-MARC-Internal")==="1" && isAdminToken(env,(request.headers.get("Authorization")||"").replace(/^Bearer\\s+/,""));
  let token,user;
  if(internal){ token=(request.headers.get("Authorization")||"").replace(/^Bearer\\s+/,""); const body=await request.clone().json().catch(()=>({})); if(!body?.userId)throw Object.assign(new Error("Falta userId interno."),{status:400}); user={id:String(body.userId)}; }
  else { const auth=await authUser(request,env); token=auth.token; user=auth.user; }
  const access=await entitlement(env,token,user.id);
  if(access.kind!=="master")throw Object.assign(new Error("Publicar en redes sociales requiere el plan MASTER."),{status:403});
  if(request.method!=="POST")return json({error:"Método no permitido"},405,corsHeaders(request,env));
  const body=await request.json().catch(()=>({}));
  const publicationId=String(body?.publicationId||"").trim();
  if(!publicationId)throw Object.assign(new Error("Falta publicationId."),{status:400});
  const rows=await sb(env,token,"marc_publications?select=id,user_id,platform,status,title,headline,body,short_text,hashtags,media_url,media_type&user_id=eq."+encodeURIComponent(user.id)+"&id=eq."+encodeURIComponent(publicationId)+"&limit=1");
  const publication=rows?.[0];
  if(!publication)throw Object.assign(new Error("No encontré la publicación."),{status:404});
  if(["PUBLISHED","PUBLISHING"].includes(publication.status))return json({ok:true,status:publication.status,publication},200,corsHeaders(request,env));
  const platform=String(publication.platform||"").toUpperCase();
  if(!["FACEBOOK","INSTAGRAM"].includes(platform))throw Object.assign(new Error("La publicación real está habilitada por ahora para Facebook e Instagram."),{status:422});
  const conRows=await sb(env,token,"marc_social_connections?select=id,platform,account_name,external_account_id,token_ref,status&user_id=eq."+encodeURIComponent(user.id)+"&platform=eq."+platform+"&status=eq.CONNECTED&limit=1");
  const connection=conRows?.[0];
  if(!connection?.token_ref)throw Object.assign(new Error("Conecta primero la cuenta de "+platform+"."),{status:409});
  const secret=await decryptSecret(env,connection.token_ref);
  let meta=secret;try{meta=JSON.parse(secret)}catch{}
  const tokenValue=meta?.page_access_token||secret;
  const version=String(env.META_GRAPH_VERSION||"v23.0");
  const message=[publication.headline,publication.body,publication.short_text,Array.isArray(publication.hashtags)?publication.hashtags.join(" "):""].filter(Boolean).join("\\n\\n").slice(0,10000);
  const mediaUrl=await uploadMarketingDataUrl(env,env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY,user.id,publication.media_url);
  await sb(env,token,"marc_publications?id=eq."+encodeURIComponent(publication.id)+"&user_id=eq."+encodeURIComponent(user.id),{method:"PATCH",body:{status:"PUBLISHING",last_error:null,updated_at:new Date().toISOString()}});
  try{
    let externalId="",externalUrl=null;
    if(platform==="FACEBOOK"){
      const pageId=meta?.page_id||connection.external_account_id;
      const endpoint="https://graph.facebook.com/"+version+"/"+encodeURIComponent(pageId)+"/"+(mediaUrl?"photos":"feed");
      const form=new URLSearchParams({access_token:tokenValue});
      if(mediaUrl){form.set("url",mediaUrl);form.set("caption",message)}else form.set("message",message);
      const r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:form});
      const d=await r.json().catch(()=>null);
      if(!r.ok||d?.error)throw Object.assign(new Error(d?.error?.message||"Meta rechazó la publicación en Facebook."),{status:502,details:d});
      externalId=String(d?.post_id||d?.id||"");
      if(externalId)externalUrl="https://www.facebook.com/"+externalId.replace("_","/posts/");
    }else{
      if(!mediaUrl)throw Object.assign(new Error("Instagram requiere una imagen pública para publicar."),{status:422});
      const createUrl="https://graph.facebook.com/"+version+"/"+encodeURIComponent(connection.external_account_id)+"/media";
      const form=new URLSearchParams({image_url:mediaUrl,caption:message,access_token:tokenValue});
      const cr=await fetch(createUrl,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:form});
      const cd=await cr.json().catch(()=>null);
      if(!cr.ok||cd?.error||!cd?.id)throw Object.assign(new Error(cd?.error?.message||"Meta rechazó la creación del contenido de Instagram."),{status:502,details:cd});
      const pubUrl="https://graph.facebook.com/"+version+"/"+encodeURIComponent(connection.external_account_id)+"/media_publish";
      const pf=new URLSearchParams({creation_id:cd.id,access_token:tokenValue});
      const pr=await fetch(pubUrl,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:pf});
      const pd=await pr.json().catch(()=>null);
      if(!pr.ok||pd?.error||!pd?.id)throw Object.assign(new Error(pd?.error?.message||"Meta rechazó la publicación de Instagram."),{status:502,details:pd});
      externalId=String(pd.id);
    }
    await sb(env,token,"marc_publications?id=eq."+encodeURIComponent(publication.id)+"&user_id=eq."+encodeURIComponent(user.id),{method:"PATCH",body:{status:"PUBLISHED",published_at:new Date().toISOString(),external_post_id:externalId||null,external_url:externalUrl,last_error:null,updated_at:new Date().toISOString()}});
    return json({ok:true,status:"PUBLISHED",platform,externalPostId:externalId,externalUrl,mediaUrl},200,corsHeaders(request,env));
  }catch(err){
    await sb(env,token,"marc_publications?id=eq."+encodeURIComponent(publication.id)+"&user_id=eq."+encodeURIComponent(user.id),{method:"PATCH",body:{status:"FAILED",last_error:String(err?.message||"Error de publicación"),updated_at:new Date().toISOString()}}).catch(()=>{});
    throw err;
  }
}

async function metaConnect(request,env){
  const {token,user}=await authUser(request,env);
  const access=await entitlement(env,token,user.id);
  if(access.kind!=="master")throw Object.assign(new Error("Conectar redes sociales requiere el plan MASTER."),{status:403});
  if(!env.META_APP_ID||!env.META_APP_SECRET)throw Object.assign(new Error("Configura META_APP_ID y META_APP_SECRET en el Worker."),{status:503});
  const state=randomToken(32),expires=new Date(Date.now()+10*60*1000).toISOString();
  await sb(env,token,"marc_oauth_states",{method:"POST",body:{user_id:user.id,provider:"META",state,expires_at:expires}});
  const redirectUri=new URL("/api/social/meta/callback",request.url).toString();
  const version=String(env.META_GRAPH_VERSION||"v23.0");
  const params=new URLSearchParams({
    client_id:String(env.META_APP_ID),redirect_uri:redirectUri,state,
    response_type:"code",
    scope:"pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish"
  });
  return Response.redirect("https://www.facebook.com/"+version+"/dialog/oauth?"+params.toString(),302);
}
async function metaCallback(request,env){
  const url=new URL(request.url),error=url.searchParams.get("error"),errorDescription=url.searchParams.get("error_description");
  const state=url.searchParams.get("state"),code=url.searchParams.get("code");
  if(error) return new Response("M.A.R.C. · Meta canceló la conexión. "+String(errorDescription||error),{status:400,headers:{"content-type":"text/plain; charset=utf-8"}});
  if(!state||!code)return new Response("M.A.R.C. · Faltan parámetros OAuth.",{status:400});
  const adminToken=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;
  if(!adminToken)throw Object.assign(new Error("Falta la clave privada de Supabase para validar OAuth."),{status:503});
  const lookup=await fetch(env.SUPABASE_URL+"/rest/v1/marc_oauth_states?select=id,user_id,provider,expires_at&state=eq."+encodeURIComponent(state)+"&provider=eq.META&limit=1",{headers:{apikey:adminToken,Authorization:"Bearer "+adminToken}});
  const states=await lookup.json().catch(()=>[]);
  const st=states?.[0];
  if(!st||new Date(st.expires_at).getTime()<Date.now())return new Response("M.A.R.C. · La sesión de conexión expiró. Vuelve a intentarlo.",{status:400});
  if(!env.META_APP_ID||!env.META_APP_SECRET)throw new Error("Meta no está configurado.");
  const redirectUri=new URL("/api/social/meta/callback",request.url).toString(),version=String(env.META_GRAPH_VERSION||"v23.0");
  const tokenUrl=new URL("https://graph.facebook.com/"+version+"/oauth/access_token");
  tokenUrl.searchParams.set("client_id",env.META_APP_ID);tokenUrl.searchParams.set("client_secret",env.META_APP_SECRET);tokenUrl.searchParams.set("redirect_uri",redirectUri);tokenUrl.searchParams.set("code",code);
  const tr=await fetch(tokenUrl);const td=await tr.json().catch(()=>null);
  if(!tr.ok||!td?.access_token)throw Object.assign(new Error(td?.error?.message||"Meta no devolvió un token."),{status:502});
  const pageUrl=new URL("https://graph.facebook.com/"+version+"/me/accounts");
  pageUrl.searchParams.set("fields","id,name,access_token,instagram_business_account{id,username}");
  pageUrl.searchParams.set("access_token",td.access_token);
  const pr=await fetch(pageUrl);const pd=await pr.json().catch(()=>null);
  if(!pr.ok||!Array.isArray(pd?.data))throw Object.assign(new Error(pd?.error?.message||"No se pudieron obtener las páginas de Meta."),{status:502});
  if(!adminToken)throw Object.assign(new Error("Falta la clave privada de Supabase para finalizar OAuth."),{status:503});
  const encrypted=[];
  for(const page of pd.data){
    if(!page?.id||!page?.access_token)continue;
    const tokenRef=await encryptSecret(env,JSON.stringify({page_access_token:page.access_token,page_id:page.id}));
    encrypted.push({platform:"FACEBOOK",account_name:page.name||"Página de Facebook",external_account_id:page.id,token_ref:tokenRef,scopes:["pages_show_list","pages_read_engagement","pages_manage_posts"],status:"CONNECTED",connected_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    const ig=page.instagram_business_account;
    if(ig?.id){
      encrypted.push({platform:"INSTAGRAM",account_name:ig.username||("Instagram "+ig.id),external_account_id:ig.id,token_ref:tokenRef,scopes:["instagram_basic","instagram_content_publish"],status:"CONNECTED",connected_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    }
  }
  if(!encrypted.length)throw Object.assign(new Error("Meta no devolvió una Página administrable con una cuenta de Instagram profesional asociada."),{status:422});
  for(const x of encrypted){
    await sb(env,adminToken,"marc_social_connections?user_id=eq."+encodeURIComponent(st.user_id)+"&platform=eq."+encodeURIComponent(x.platform),{method:"DELETE"});
    await sb(env,adminToken,"marc_social_connections",{method:"POST",body:{...x,user_id:st.user_id}});
  }
  await sb(env,adminToken,"marc_oauth_states?id=eq."+encodeURIComponent(st.id),{method:"DELETE"});
  return new Response("<!doctype html><html><body style='font-family:system-ui;padding:40px'><h2>✓ Meta conectada</h2><p>Facebook e Instagram ya están registrados en M.A.R.C. Puedes volver a la aplicación.</p><script>setTimeout(()=>location.href='/',1200)</script></body></html>",{status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
}

async function telegramDiagnostics(request,env){
  if(request.method!=="GET")return json({error:"Método no permitido"},405);
  if(!env.TELEGRAM_BOT_TOKEN)return json({ok:false,error:"TELEGRAM_BOT_TOKEN missing"},503);
  const r=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/getWebhookInfo");
  const d=await r.json().catch(()=>null);
  if(!r.ok||!d?.ok)return json({ok:false,error:d?.description||"Telegram error"},502);
  const x=d.result||{};
  return json({
    ok:true,
    url:x.url||"",
    pending_update_count:Number(x.pending_update_count||0),
    last_error_date:x.last_error_date||null,
    last_error_message:x.last_error_message||null,
    ip_address:x.ip_address||null
  });
}

async function telegramSetup(request,env){
  const {token,user}=await authUser(request,env);
  const access=await entitlement(env,token,user.id);
  if(access.kind!=="master" && access.kind!=="paid"){
    throw Object.assign(new Error("Solo una cuenta MASTER o con suscripción activa puede activar Telegram."),{status:403});
  }
  if(!env.TELEGRAM_BOT_TOKEN)throw Object.assign(new Error("Falta TELEGRAM_BOT_TOKEN."),{status:503});
  if(!env.TELEGRAM_WEBHOOK_SECRET)throw Object.assign(new Error("Falta TELEGRAM_WEBHOOK_SECRET."),{status:503});
  const webhookUrl=new URL("/api/telegram/webhook",request.url).toString();
  const r=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/setWebhook",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      url:webhookUrl,
      secret_token:env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates:["message"],
      drop_pending_updates:false
    })
  });
  const data=await r.json().catch(()=>({ok:false,description:"Respuesta inválida de Telegram"}));
  if(!r.ok||!data?.ok)throw Object.assign(new Error(data?.description||"Telegram rechazó la configuración del webhook."),{status:502});
  const infoR=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/getWebhookInfo");
  const info=await infoR.json().catch(()=>null);
  return json({ok:true,webhookUrl,botUsername:telegramBotName(env),webhook:info?.result||null},200,corsHeaders(request,env));
}

async function telegramStatus(request,env){
  const {token,user}=await authUser(request,env);
  const rows=await sb(env,token,"marc_channel_identities?select=id,channel,external_user_id,chat_id,username,status,linked_at,last_seen_at&channel=eq.TELEGRAM&user_id=eq."+encodeURIComponent(user.id)+"&limit=1");
  const access=await entitlement(env,token,user.id);
  let webhook=null;
  if(access.kind==="master"||access.kind==="paid"){
    if(env.TELEGRAM_BOT_TOKEN){
      const wr=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/getWebhookInfo");
      const wd=await wr.json().catch(()=>null);
      if(wd?.ok)webhook=wd.result||null;
      else webhook={error:wd?.description||"Telegram no devolvió información del webhook."};
    }else webhook={error:"TELEGRAM_BOT_TOKEN no configurado."};
  }
  return json({
    linked:Boolean(rows?.[0]?.status==="LINKED"),
    identity:rows?.[0]||null,
    entitlement:access,
    webhook:webhook?{
      url:webhook.url||"",
      pending_update_count:Number(webhook.pending_update_count||0),
      last_error_date:webhook.last_error_date||null,
      last_error_message:webhook.last_error_message||null,
      max_connections:webhook.max_connections||null,
      has_custom_certificate:Boolean(webhook.has_custom_certificate),
      error:webhook.error||null
    }:null
  },200,corsHeaders(request,env));
}
async function telegramLink(request,env){
  const {token,user}=await authUser(request,env);
  const bot=telegramBotName(env);
  if(!bot)throw Object.assign(new Error("Configura TELEGRAM_BOT_USERNAME en el Worker."),{status:503});
  const rawToken="LNK_"+randomToken(24);
  const hash=await sha256Hex(rawToken);
  const expires=new Date(Date.now()+10*60*1000).toISOString();
  await sb(env,token,"marc_link_tokens?user_id=eq."+encodeURIComponent(user.id)+"&channel=eq.TELEGRAM&used_at=is.null",{method:"DELETE"});
  await sb(env,token,"marc_link_tokens",{method:"POST",body:{user_id:user.id,channel:"TELEGRAM",token_hash:hash,expires_at:expires}});
  return json({deepLink:"https://t.me/"+bot+"?start="+encodeURIComponent(rawToken),expiresAt:expires},200,corsHeaders(request,env));
}
async function telegramUnlink(request,env){
  const {token,user}=await authUser(request,env);
  await sb(env,token,"marc_channel_identities?user_id=eq."+encodeURIComponent(user.id)+"&channel=eq.TELEGRAM&status=eq.LINKED",{method:"PATCH",body:{status:"REVOKED",updated_at:new Date().toISOString()}});
  return json({ok:true},200,corsHeaders(request,env));
}

async function processOperationalAlerts(env){
  const adminToken=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;
  if(!adminToken)return {ok:false};
  const [a,b,cash]=await Promise.all([
    sb(env,adminToken,"marc_inventory?select=user_id&limit=1000").catch(()=>[]),
    sb(env,adminToken,"marc_quotes?select=user_id&limit=1000").catch(()=>[]),
    sb(env,adminToken,"marc_cash_registers?select=user_id&limit=1000").catch(()=>[])
  ]);
  const userIds=[...new Set([...a,...b,...cash].map(x=>x?.user_id).filter(Boolean))];
  const out=[];
  for(const uid of userIds){
    try{
      const inv=await sb(env,adminToken,"marc_inventory?select=id,name,stock,min_stock&user_id=eq."+encodeURIComponent(uid)+"&active=eq.true&or=(stock.eq.0,min_stock.gt.0)&limit=100");
      for(const item of Array.isArray(inv)?inv:[]){
        const stock=Number(item.stock||0), min=Number(item.min_stock||0);
        const level=stock<=0?"OUT":(min>0&&stock<=min?"LOW":"OK");
        if(level==="OK")continue;
        const key="STOCK:"+item.id+":"+level;
        const old=(await sb(env,adminToken,"marc_alert_state?select=last_value&user_id=eq."+encodeURIComponent(uid)+"&alert_key=eq."+encodeURIComponent(key)+"&limit=1").catch(()=>[]))?.[0];
        if(old?.last_value===String(stock))continue;
        const title=level==="OUT"?"📦 Stock agotado":"📦 Stock bajo";
        const body=level==="OUT"?"El producto "+item.name+" llegó a 0 unidades.":item.name+" tiene "+stock+" unidades. Su mínimo configurado es "+min+".";
        await sb(env,adminToken,"marc_reminders",{method:"POST",body:{user_id:uid,title,body,due_at:new Date().toISOString(),status:"PENDING",channel:"BOTH",entity_type:"INVENTORY",entity_id:item.id,metadata:{alert:"STOCK",level,stock,min_stock:min}}});
        const stateBody={user_id:uid,alert_key:key,last_value:String(stock),last_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()};
        if(old)await sb(env,adminToken,"marc_alert_state?user_id=eq."+encodeURIComponent(uid)+"&alert_key=eq."+encodeURIComponent(key),{method:"PATCH",body:stateBody}).catch(()=>{});
        else await sb(env,adminToken,"marc_alert_state",{method:"POST",body:stateBody}).catch(()=>{});
        out.push({user_id:uid,key});
      }
      const cashRows=await sb(env,adminToken,"marc_cash_registers?select=id,opened_at&user_id=eq."+encodeURIComponent(uid)+"&status=eq.OPEN&opened_at=lte."+encodeURIComponent(new Date(Date.now()-24*86400000).toISOString())+"&limit=1").catch(()=>[]);
      const openCash=cashRows?.[0];
      if(openCash){
        const key="CASH_OPEN:"+openCash.id;
        const oldCash=(await sb(env,adminToken,"marc_alert_state?select=last_value&user_id=eq."+encodeURIComponent(uid)+"&alert_key=eq."+encodeURIComponent(key)+"&limit=1").catch(()=>[]))?.[0];
        if(!oldCash){
          await sb(env,adminToken,"marc_reminders",{method:"POST",body:{user_id:uid,title:"💰 Caja pendiente de cierre",body:"La caja lleva más de 24 horas abierta. Revisa los movimientos y realiza el cierre cuando corresponda.",due_at:new Date().toISOString(),status:"PENDING",channel:"BOTH",entity_type:"CASH",entity_id:openCash.id,metadata:{alert:"CASH_OPEN"}}});
          await sb(env,adminToken,"marc_alert_state",{method:"POST",body:{user_id:uid,alert_key:key,last_value:"1",last_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}}).catch(()=>{});
          out.push({user_id:uid,key});
        }
      }
      const quotes=await sb(env,adminToken,"marc_quotes?select=id,number,title,total,status,created_at,client_id&user_id=eq."+encodeURIComponent(uid)+"&deleted_at=is.null&status=eq.BORRADOR&created_at=lte."+encodeURIComponent(new Date(Date.now()-5*86400000).toISOString())+"&order=created_at.asc&limit=20").catch(()=>[]);
      for(const q of Array.isArray(quotes)?quotes:[]){
        const key="QUOTE_FOLLOWUP:"+q.id;
        const old=(await sb(env,adminToken,"marc_alert_state?select=last_value&user_id=eq."+encodeURIComponent(uid)+"&alert_key=eq."+encodeURIComponent(key)+"&limit=1").catch(()=>[]))?.[0];
        if(old)continue;
        const client=(await sb(env,adminToken,"marc_clients?select=id,name,phone&user_id=eq."+encodeURIComponent(uid)+"&id=eq."+encodeURIComponent(q.client_id||"")+"&limit=1").catch(()=>[]))?.[0]||{};
        const title="🧾 Cotización sin seguimiento";
        const body="La cotización "+(q.number||q.title||"pendiente")+" lleva más de 5 días en borrador. Conviene revisarla y contactar al cliente.";
        const followup="Hola "+(client.name||"")+" , le escribo para consultar si pudo revisar la cotización "+(q.number||q.title||"")+" por "+(Number(q.total||0).toLocaleString("es-PE",{style:"currency",currency:"PEN"}))+". Quedo atento a cualquier consulta o ajuste que necesite.";
        await sb(env,adminToken,"marc_reminders",{method:"POST",body:{user_id:uid,title,body,due_at:new Date().toISOString(),status:"PENDING",channel:"BOTH",entity_type:"QUOTE",entity_id:q.id,metadata:{alert:"QUOTE_FOLLOWUP",quote_id:q.id,quote_number:q.number||"",client_id:q.client_id||null,client_name:client.name||"",client_phone:client.phone||"",quote_total:Number(q.total||0),followup_message:followup}}});
        await sb(env,adminToken,"marc_alert_state",{method:"POST",body:{user_id:uid,alert_key:key,last_value:"1",last_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}}).catch(()=>{});
        out.push({user_id:uid,key});
      }
    }catch(e){}
  }
  return {ok:true,alerts:out.length,items:out};
}

async function processDueReminders(env){
  const adminToken=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;
  if(!adminToken)return {ok:false,error:"Falta la clave privada de Supabase."};
  const now=new Date().toISOString();
  const rows=await sb(env,adminToken,"marc_reminders?select=id,user_id,title,body,due_at,channel,status&status=eq.PENDING&due_at=lte."+encodeURIComponent(now)+"&order=due_at.asc&limit=50");
  const results=[];
  for(const r of Array.isArray(rows)?rows:[]){
    try{
      let sent=false;
      if(["TELEGRAM","BOTH"].includes(String(r.channel||"").toUpperCase())&&env.TELEGRAM_BOT_TOKEN){
        const ids=await sb(env,adminToken,"marc_channel_identities?select=chat_id,status&user_id=eq."+encodeURIComponent(r.user_id)+"&channel=eq.TELEGRAM&status=eq.LINKED&limit=5").catch(()=>[]);
        for(const id of Array.isArray(ids)?ids:[]){
          if(id.chat_id){await sendTelegram(env,id.chat_id,"🔔 M.A.R.C. · Recordatorio\n\n"+String(r.title||"Recordatorio")+"\n"+String(r.body||""));sent=true;}
        }
      }
      const ch=String(r.channel||"").toUpperCase(); const nextStatus=sent||ch==="IN_APP"?"SENT":ch==="BOTH"?"PENDING":"FAILED";
      await sb(env,adminToken,"marc_reminders?id=eq."+encodeURIComponent(r.id),{method:"PATCH",body:{status:nextStatus,sent_at:sent?new Date().toISOString():null}});
      if(sent)results.push({id:r.id,status:"SENT"});else results.push({id:r.id,status:"PENDING_WEB"});
    }catch(err){
      await sb(env,adminToken,"marc_reminders?id=eq."+encodeURIComponent(r.id),{method:"PATCH",body:{status:"FAILED",metadata:{error:String(err?.message||"Error enviando recordatorio")}}}).catch(()=>{});
      results.push({id:r.id,status:"FAILED",error:String(err?.message||"Error")});
    }
  }
  return {ok:true,processed:results.length,results};
}

async function processDuePublicationJobs(env){
  const adminToken=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;
  if(!adminToken)return {ok:false,error:"Falta la clave privada de Supabase."};
  const now=new Date().toISOString();
  const jobs=await sb(env,adminToken,"marc_publication_jobs?select=id,publication_id,user_id,attempt,status,run_after&status=eq.PENDING&run_after=lte."+encodeURIComponent(now)+"&order=run_after.asc&limit=20");
  const results=[];
  for(const job of Array.isArray(jobs)?jobs:[]){
    await sb(env,adminToken,"marc_publication_jobs?id=eq."+encodeURIComponent(job.id)+"&status=eq.PENDING",{method:"PATCH",body:{status:"RUNNING",started_at:now,attempt:Number(job.attempt||0)+1}}).catch(()=>{});
    try{
      const userRows=await sb(env,adminToken,"auth.users?select=id&id=eq."+encodeURIComponent(job.user_id)+"&limit=1").catch(()=>[]);
      if(!userRows?.length)throw new Error("Usuario no encontrado.");
      const pubRows=await sb(env,adminToken,"marc_publications?select=id,user_id,inventory_id,campaign_id,platform,status,title,headline,body,short_text,hashtags,media_url,media_type,scheduled_for&user_id=eq."+encodeURIComponent(job.user_id)+"&id=eq."+encodeURIComponent(job.publication_id)+"&status=eq.SCHEDULED&limit=1");
      if(!pubRows?.[0])throw new Error("La publicación ya no está programada o no existe.");
      const fakeRequest=new Request("https://worker.internal/api/social/meta/publish",{method:"POST",headers:{Authorization:"Bearer "+adminToken,"X-MARC-Internal":"1","content-type":"application/json"},body:JSON.stringify({publicationId:job.publication_id,userId:job.user_id})});
      const response=await metaPublish(fakeRequest,env);
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data?.ok)throw Object.assign(new Error(data?.error||data?.message||"No se pudo publicar."),{status:response.status,details:data});
      await sb(env,adminToken,"marc_publication_jobs?id=eq."+encodeURIComponent(job.id),{method:"PATCH",body:{status:"DONE",finished_at:new Date().toISOString(),response_metadata:data,error_message:null}});
      results.push({id:job.id,status:"DONE"});
    }catch(err){
      const attempt=Number(job.attempt||0)+1;
      const retry=attempt<3;
      await sb(env,adminToken,"marc_publication_jobs?id=eq."+encodeURIComponent(job.id),{method:"PATCH",body:{status:retry?"PENDING":"FAILED",run_after:retry?new Date(Date.now()+attempt*5*60*1000).toISOString():job.run_after,finished_at:retry?null:new Date().toISOString(),error_message:String(err?.message||"Error de publicación"),response_metadata:{status:err?.status||500}}}).catch(()=>{});
      results.push({id:job.id,status:retry?"RETRY":"FAILED",error:String(err?.message||"Error")});
    }
  }
  return {ok:true,processed:results.length,results};
}

export default{
  async scheduled(event,env,ctx){
    ctx.waitUntil((async()=>{await processOperationalAlerts(env).catch(()=>{});await processDueReminders(env).catch(()=>{});await processDuePublicationJobs(env).catch(()=>{});})());
  },
  async fetch(request,env,ctx){
    const headers=corsHeaders(request,env);
    const requestOrigin=request.headers.get("Origin")||"";
    const requestOriginUrl=new URL(request.url).origin;
    const configuredOrigins=String(env?.ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
    const allowedOrigins=new Set([requestOriginUrl,...configuredOrigins]);
    if(request.method==="OPTIONS"){
      if(requestOrigin&&!allowedOrigins.has(requestOrigin))return new Response(null,{status:403,headers});
      return new Response(null,{status:204,headers});
    }
    const url=new URL(request.url);
    if(url.pathname==="/api/auth/signup"){
      if(request.method!=="POST")return json({error:"Método no permitido"},405,headers);
      if(!(await rateLimit(env,"signup:ip:"+requestIp(request),8,900)))return json({error:"Demasiados intentos. Intenta nuevamente más tarde."},429,headers);
      try{
        const body=await request.json().catch(()=>({}));
        const email=String(body?.email||"").trim().toLowerCase();
        const password=String(body?.password||"");
        if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)||password.length<6)return json({error:"Correo o contraseña inválidos"},400,headers);
        const adminToken=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
        if(!adminToken)return json({error:"El servidor de autenticación no está configurado."},503,headers);
        const ar=await fetch(env.SUPABASE_URL+"/auth/v1/admin/users",{method:"POST",headers:{"content-type":"application/json",apikey:adminToken,Authorization:"Bearer "+adminToken},body:JSON.stringify({email,password,email_confirm:true})});
        const ad=await ar.json().catch(()=>null);
        if(!ar.ok){
          const msg=String(ad?.msg||ad?.message||ad?.error_description||"");
          if(ar.status===422&&/already|exists|registered|duplicate/i.test(msg))return json({error:"No se pudo crear la cuenta con esos datos."},400,headers);
          return json({error:"No se pudo crear la cuenta. Verifica los datos e inténtalo nuevamente."},400,headers);
        }
        return json({ok:true,user:{id:ad?.id,email:ad?.email}},200,headers);
      }catch(err){return json({error:safeClientError(err,"No se pudo crear la cuenta.")},500,headers)}
    }
    if(url.pathname==="/api/cash-staff/login"){
      if(request.method!=="POST")return json({error:"Método no permitido"},405,headers);
      if(!(await rateLimit(env,"cash-login:ip:"+requestIp(request),10,900)))return json({error:"Demasiados intentos. Intenta nuevamente más tarde."},429,headers);
      try{
        const body=await request.json();
        const username=String(body?.username||"").trim().toLowerCase().replace(/[^a-z0-9._-]/g,"").slice(0,40);
        const password=String(body?.password||"");
        if(!username||password.length<6)return json({error:"Usuario o contraseña inválidos"},400,headers);
        const lookup=await sb(env,env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY,
          "marc_cash_staff?select=owner_user_id,auth_user_id,username,display_name,role,active&username=eq."+encodeURIComponent(username)+"&limit=1");
        const staff=lookup?.[0];
        if(!staff||!staff.active)return json({error:"Usuario o contraseña incorrectos"},401,headers);
        const adminToken=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
        let loginEmail=username+"@cash.marc.pe";
        if(adminToken&&staff.auth_user_id){
          const ur=await fetch(env.SUPABASE_URL+"/auth/v1/admin/users/"+encodeURIComponent(staff.auth_user_id),{headers:{apikey:adminToken,Authorization:"Bearer "+adminToken}});
          const ud=await ur.json().catch(()=>null);
          if(ur.ok&&ud?.email)loginEmail=String(ud.email).toLowerCase();
        }
        const tokenUrl=env.SUPABASE_URL+"/auth/v1/token?grant_type=password";
        const tr=await fetch(tokenUrl,{method:"POST",headers:{"content-type":"application/json",apikey:env.SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({email:loginEmail,password})});
        const td=await tr.json().catch(()=>null);
        if(!tr.ok)return json({error:"Usuario o contraseña incorrectos"},401,headers);
        return json({session:td,staff},200,headers);
      }catch(err){return json({error:safeClientError(err,"No se pudo iniciar sesión de caja")},err?.status||500,headers)}
    }
    if(url.pathname==="/api/cash-staff"){
      try{
        const {token,user}=await authUser(request,env);
        const adminToken=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
        if(!adminToken)throw Object.assign(new Error("Falta la clave administrativa del Worker."),{status:503});
        const masterRows=await sb(env,adminToken,"marc_user_roles?select=role,active&user_id=eq."+encodeURIComponent(user.id)+"&role=eq.MASTER&active=eq.true&limit=1");
        if(!masterRows?.length)return json({error:"Solo el administrador principal puede gestionar el personal de caja."},403,headers);

        if(request.method==="GET"){
          const rows=await sb(env,token,"marc_cash_staff?select=id,username,display_name,role,active,created_at,auth_user_id&owner_user_id=eq."+encodeURIComponent(user.id)+"&order=created_at.asc");
          return json({staff:rows||[]},200,headers);
        }

        const body=await request.json().catch(()=>({}));
        if(request.method==="POST"){
          const username=String(body?.username||"").trim().toLowerCase().replace(/[^a-z0-9._-]/g,"").slice(0,40);
          const displayName=String(body?.display_name||"").trim().slice(0,100);
          const password=String(body?.password||"");
          if(!username||!displayName||password.length<6)return json({error:"Completa usuario, nombre y una contraseña de mínimo 6 caracteres."},400,headers);
          const exists=await sb(env,token,"marc_cash_staff?select=id&owner_user_id=eq."+encodeURIComponent(user.id)+"&username=eq."+encodeURIComponent(username)+"&limit=1");
          if(exists?.length)return json({error:"Ese usuario de caja ya existe."},409,headers);
          const email=username+"@cash.marc.pe";
          let authUserId=null;
          const ar=await fetch(env.SUPABASE_URL+"/auth/v1/admin/users",{method:"POST",headers:{"content-type":"application/json",apikey:adminToken,Authorization:"Bearer "+adminToken},body:JSON.stringify({email,password,email_confirm:true,user_metadata:{cash_username:username,cash_owner_id:user.id}})});
          let ad=await ar.json().catch(()=>null);
          if(ar.ok){
            authUserId=ad?.user?.id||ad?.id;
          }else if(String(ad?.msg||ad?.message||ad?.error_description||ad?.error||"").toLowerCase().includes("already registered")){
            // Recupera una cuenta Auth huérfana creada por un intento anterior.
            let page=1;
            while(!authUserId && page<=10){
              const lr=await fetch(env.SUPABASE_URL+"/auth/v1/admin/users?page="+page+"&per_page=100",{method:"GET",headers:{apikey:adminToken,Authorization:"Bearer "+adminToken}});
              const lj=await lr.json().catch(()=>null);
              const found=(lj?.users||[]).find(x=>String(x?.email||"").toLowerCase()===email.toLowerCase());
              if(found)authUserId=found.id;
              if(!lj?.users?.length || lj.users.length<100)break;
              page++;
            }
            if(authUserId){
              const linked=await sb(env,adminToken,"marc_cash_staff?select=id,owner_user_id&auth_user_id=eq."+encodeURIComponent(authUserId)+"&limit=1");
              if(linked?.length)throw Object.assign(new Error("Ese usuario de cajero ya está registrado."),{status:409});
              const ur=await fetch(env.SUPABASE_URL+"/auth/v1/admin/users/"+encodeURIComponent(authUserId),{method:"PUT",headers:{"content-type":"application/json",apikey:adminToken,Authorization:"Bearer "+adminToken},body:JSON.stringify({password,email_confirm:true,user_metadata:{cash_username:username,cash_owner_id:user.id}})});
              if(!ur.ok)throw Object.assign(new Error("La cuenta de cajero ya existe pero no se pudo recuperar."),{status:502});
            }
          }else{
            throw Object.assign(new Error(ad?.msg||ad?.message||ad?.error_description||ad?.error||"No se pudo crear el usuario de caja."),{status:ar.status,details:ad});
          }
          if(!authUserId)throw Object.assign(new Error("Supabase no devolvió el ID del usuario de caja."),{status:502,details:ad});
          const rows=await sb(env,adminToken,"marc_cash_staff",{method:"POST",body:{owner_user_id:user.id,auth_user_id:authUserId,username,display_name:displayName,employee_code:String(body?.employee_code||"").trim().slice(0,60),role:"CASHIER",active:true}});
          return json({staff:rows?.[0]||null},201,headers);
        }

        if(request.method==="PATCH"){
          const id=String(body?.id||"").trim();
          if(!id)return json({error:"Falta el identificador del usuario de caja."},400,headers);
          const current=(await sb(env,adminToken,"marc_cash_staff?select=id,auth_user_id,username,display_name,active,owner_user_id&id=eq."+encodeURIComponent(id)+"&owner_user_id=eq."+encodeURIComponent(user.id)+"&limit=1"))?.[0];
          if(!current)return json({error:"Usuario de caja no encontrado."},404,headers);
          const updates={};
          if(body?.display_name!==undefined){
            const displayName=String(body.display_name||"").trim().slice(0,100);
            if(!displayName)return json({error:"El nombre no puede quedar vacío."},400,headers);
            updates.display_name=displayName;
          }
          if(body?.active!==undefined)updates.active=!!body.active;
          const password=String(body?.password||"");
          if(password){
            if(password.length<6)return json({error:"La contraseña debe tener al menos 6 caracteres."},400,headers);
            const ar=await fetch(env.SUPABASE_URL+"/auth/v1/admin/users/"+encodeURIComponent(current.auth_user_id),{method:"PUT",headers:{"content-type":"application/json",apikey:adminToken,Authorization:"Bearer "+adminToken},body:JSON.stringify({password})});
            const ad=await ar.json().catch(()=>null);
            if(!ar.ok)throw Object.assign(new Error(ad?.msg||ad?.message||ad?.error_description||"No se pudo actualizar la contraseña."),{status:ar.status});
          }
          if(Object.keys(updates).length){
            const rows=await sb(env,adminToken,"marc_cash_staff?id=eq."+encodeURIComponent(id)+"&owner_user_id=eq."+encodeURIComponent(user.id),{method:"PATCH",body:updates});
            return json({staff:rows?.[0]||null},200,headers);
          }
          return json({staff:current},200,headers);
        }

        return json({error:"Método no permitido"},405,headers);
      }catch(err){return json({error:safeClientError(err,"No se pudo gestionar el personal de caja")},err?.status||500,headers)}
    }
    if(url.pathname==="/api/notifications"){
      if(request.method!=="GET")return json({error:"Método no permitido"},405,headers);
      try{
        const {token,user}=await authUser(request,env);
        const rows=await sb(env,token,"marc_reminders?select=id,title,body,due_at,status,channel,created_at,sent_at&user_id=eq."+encodeURIComponent(user.id)+"&order=due_at.desc&limit=50");
        return json({notifications:rows||[]},200,headers);
      }catch(err){return json({error:safeClientError(err,"No se pudieron cargar las notificaciones")},err?.status||500,headers)}
    }
    if(url.pathname==="/api/chat"){
      if(request.method!=="POST")return json({error:"Método no permitido"},405,headers);
      try{
        const {token,user}=await authUser(request,env);
        const access=await entitlement(env,token,user.id);
        if(!(await rateLimit(env,"ai:"+user.id+":chat",60,3600)))return json({error:"Has alcanzado el límite temporal del asistente. Intenta nuevamente más tarde."},429,headers);
        if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para seguir usando M.A.R.C."},402,headers);
        if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de 30 acciones de IA de la prueba."},429,headers);
        const body=await request.json();
        const message=String(body?.message||"").trim();
        if(!message)return json({error:"Mensaje vacío"},400,headers);
        const conversationId=String(body?.conversationId||"");
        const history=await recentMessages(env,token,user.id,conversationId);
        const context=await getConversationContext(env,token,user.id,conversationId);
        const normalized=message.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim();
        const preferredName=extractPreferredName(message);
        if(preferredName){
          await saveTelegramPreferredName(env,env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY,user.id,preferredName).catch(()=>{});
          return json({text:"✨ Entendido, "+preferredName+". Queda anotado. A partir de ahora me dirigiré a usted como "+preferredName+". ¿En qué puedo asistirle?",action:"PROFILE_UPDATED",result:{preferred_name:preferredName}},200,headers);
        }

        // El chat web comparte el mismo flujo de confirmación que Telegram.
        // Nunca ejecutamos una modificación sensible sin una confirmación explícita.
        if(context?.pending_action){
          const pending=context.pending_action;
          const yes=/^(si|sí|ok|dale|confirmar|confirmo|hazlo|hacerlo|guarda|guardar|procede|proceder)$/i.test(normalized);
          const no=/^(no|cancelar|cancela|cancel|salir|descarta|descartar)$/i.test(normalized);
          if(yes){
            let result=null;
            const p=pending.params||{};
            if(pending.action==="CREATE_CLIENT"){
              result=await createClient(env,token,user.id,p,"WEB");
              if(result.status==="CREATED" && p._next_quote){
                const next={...p._next_quote,client_id:result.client.id,client_query:result.client.id};
                const quoteResult=await createQuote(env,token,user.id,next,"WEB");
                result={status:quoteResult.status,client:result.client,quote:quoteResult.quote||null,items:quoteResult.items||[],message:quoteResult.message};
              }
            }else if(pending.action==="CREATE_QUOTE"||pending.action==="UPDATE_QUOTE"){
              result=await createQuote(env,token,user.id,p,"WEB");
            }else if(pending.action==="ADJUST_INVENTORY"){
              result=await adjustInventory(env,token,user.id,p,"WEB");
            }else{
              result={status:"NO_ACTION"};
            }
            await saveConversationContext(env,token,user.id,conversationId,{...context,pending_action:null});
            const executed={action:pending.action,result};
            await incrementAiUsage(env,token,user.id,access);
            const webDisplayName=[user?.user_metadata?.preferred_name,user?.user_metadata?.full_name,user?.user_metadata?.name,user?.email?.split("@")[0]].find(x=>String(x||"").trim())||"";
            const text=await finalReply(env,message,{plan:pending,execution:executed,entitlement:access},webDisplayName);
            return json({text,action:executed.action,result:executed.result},200,headers);
          }
          if(no){
            await saveConversationContext(env,token,user.id,conversationId,{...context,pending_action:null});
            return json({text:"Listo, señor. Cancelé la operación y no modifiqué sus datos.",action:"CANCELLED",result:{status:"CANCELLED"}},200,headers);
          }
        }

        const pl=await plan(env,message,history,context,token,user.id);
        const executed=await executePlan(env,token,user,pl,"AI_AGENT");
        if(executed.action==="SCHEDULE_REMINDER"&&executed.result?.status==="REMINDER_READY"){
          const rr=executed.result;
          const rows=await sb(env,token,"marc_reminders",{method:"POST",body:{
            user_id:user.id,title:String(rr.title||"Recordatorio de M.A.R.C.").slice(0,120),
            body:String(rr.body||rr.title||"Recordatorio pendiente.").slice(0,1000),
            due_at:new Date(rr.when).toISOString(),status:"PENDING",channel:String(rr.channel||"BOTH").toUpperCase()
          }});
          executed.result={...rr,reminder:rows?.[0]||null,status:"SCHEDULED"};
        }
        await incrementAiUsage(env,token,user.id,access);
        if(["CREATE_CLIENT","CREATE_QUOTE","UPDATE_QUOTE","ADJUST_INVENTORY"].includes(String(executed.action||"")) && executed.result?.status==="CONFIRMATION_REQUIRED"){
          await saveConversationContext(env,token,user.id,conversationId,{...context,pending_action:{action:executed.action,params:executed.result.params||pl.params||{}}});
        }else if(conversationId){
          await saveConversationContext(env,token,user.id,conversationId,buildEntityContext(executed,context));
        }
        const webDisplayName=[user?.user_metadata?.preferred_name,user?.user_metadata?.full_name,user?.user_metadata?.name,user?.email?.split("@")[0]].find(x=>String(x||"").trim())||"";
        const text=await finalReply(env,message,{plan:pl,execution:executed,entitlement:access},webDisplayName);
        return json({text,action:executed.action,result:executed.result},200,headers);
      }catch(err){
        return json({error:safeClientError(err,"Error del agente")},err?.status||500,headers);
      }
    }
    if(url.pathname==="/api/telegram/webhook"){
      try{return await telegramWebhook(request,env,ctx)}catch(err){
        return json({error:safeClientError(err,"Error del webhook")},err?.status||500);
      }
    }
    if(url.pathname==="/api/client-portal/create"){
      try{return await createClientPortal(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo crear el portal.")},err?.status||500,corsHeaders(request,env))}
    }
    if(url.pathname==="/api/client-portal/revoke"){
      try{return await revokeClientPortal(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo revocar el portal.")},err?.status||500,corsHeaders(request,env))}
    }
    if(url.pathname==="/api/client-portal/view"){
      try{return await clientPortalView(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo cargar el portal.")},err?.status||500,corsHeaders(request,env))}
    }
    if(url.pathname==="/api/marketing-product-ai"){
      try{return await marketingProductAi(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo analizar el producto.")},err?.status||500,headers)}
    }
    if(url.pathname==="/api/inventory/analyze-photo"){
      try{return await analyzeInventoryProductPhoto(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo analizar la foto del producto.")},err?.status||500,headers)}
    }
    if(url.pathname==="/api/inventory/pdf-start"){
      try{return await inventoryPdfStart(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo iniciar el análisis")},err?.status||500,headers)}
    }
    if(url.pathname==="/api/inventory/pdf-page"){
      try{return await inventoryPdfPageAnalyze(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo analizar la página")},err?.status||500,headers)}
    }
    if(url.pathname==="/api/inventory/pdf-finalize"){
      try{return await inventoryPdfFinalize(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo finalizar el análisis")},err?.status||500,headers)}
    }
    if(url.pathname==="/api/inventory/pdf-preview"){
      try{return await inventoryPdfPreview(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo analizar el PDF")},err?.status||500,headers)}
    }
    if(url.pathname==="/api/inventory/pdf-import"){
      try{return await inventoryPdfImport(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo importar el inventario")},err?.status||500,headers)}
    }
    if(url.pathname==="/api/company/profile"){
      try{
        if(request.method==="GET")return await companyProfile(request,env);
        if(request.method==="POST")return await saveCompanyProfile(request,env);
        return json({error:"Método no permitido"},405,headers);
      }catch(err){return json({error:safeClientError(err,"No se pudo gestionar el perfil empresarial")},err?.status||500,headers)}
    }
    if(url.pathname==="/api/quote-ai"){
      try{return await quoteAiDraft(request,env)}catch(err){
        return json({error:safeClientError(err,"No se pudo generar la cotización con IA.")},err?.status||500,headers);
      }
    }
    if(url.pathname==="/api/marketing-ai"){try{return await marketingAi(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo generar la publicidad.")},err?.status||500,headers)}}
    if(url.pathname==="/api/marketing-video-start"){try{return await marketingVideoStart(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo iniciar el video.")},err?.status||500,headers)}}
    if(url.pathname==="/api/marketing-video-status"){try{return await marketingVideoStatus(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo consultar el video.")},err?.status||500,headers)}}
    if(url.pathname==="/api/marketing-image"){try{return await marketingImage(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo generar el banner con IA.")},err?.status||500,headers)}}
    if(url.pathname==="/api/social/meta/publish"){
      try{return await metaPublish(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo publicar en Meta.")},err?.status||500,headers)}
    }
    if(url.pathname==="/api/social/meta/connect"){
      if(request.method!=="GET")return json({error:"Método no permitido"},405,headers);
      try{return await metaConnect(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo iniciar la conexión con Meta.")},err?.status||500,headers)}
    }
    if(url.pathname==="/api/social/meta/callback"){
      try{return await metaCallback(request,env)}catch(err){return new Response("M.A.R.C. · "+String(err?.message||"No se pudo completar la conexión con Meta."),{status:err?.status||500,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}})}
    }
    if(url.pathname==="/api/telegram/diagnostics"){return telegramDiagnostics(request,env)}
    if(url.pathname==="/api/telegram/setup"){
      if(request.method!=="POST")return json({error:"Método no permitido"},405,headers);
      try{return await telegramSetup(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo configurar Telegram")},err?.status||500,headers)}
    }
    if(url.pathname==="/api/telegram/status"){
      if(request.method!=="GET")return json({error:"Método no permitido"},405,headers);
      try{return await telegramStatus(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo consultar Telegram")},err?.status||500,headers)}
    }
    if(url.pathname==="/api/telegram/link"){
      if(request.method!=="POST")return json({error:"Método no permitido"},405,headers);
      try{return await telegramLink(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo generar el enlace")},err?.status||500,headers)}
    }
    if(url.pathname==="/api/telegram/unlink"){
      if(request.method!=="POST")return json({error:"Método no permitido"},405,headers);
      try{return await telegramUnlink(request,env)}catch(err){return json({error:safeClientError(err,"No se pudo desconectar Telegram")},err?.status||500,headers)}
    }
    if(url.pathname.startsWith("/api/"))return json({error:"Ruta no encontrada"},404,headers);
    const assetResponse=await env.ASSETS.fetch(request);
    const assetHeaders=new Headers(assetResponse.headers);
    for(const [key,value] of Object.entries(headers))assetHeaders.set(key,value);
    if(["/","/index.html"].includes(url.pathname)||/\\.(?:js|css|html)$/.test(url.pathname)){
      assetHeaders.set("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
      assetHeaders.set("Pragma","no-cache");
      assetHeaders.set("Expires","0");
    }
    return new Response(assetResponse.body,{status:assetResponse.status,statusText:assetResponse.statusText,headers:assetHeaders});
  }
};
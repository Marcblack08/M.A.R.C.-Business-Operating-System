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

function corsHeaders(request){
  const origin=request.headers.get("Origin")||"*";
  return {"access-control-allow-origin":origin,"access-control-allow-headers":"authorization,content-type","access-control-allow-methods":"GET,POST,OPTIONS","vary":"Origin"};
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
  if(!admin)headers.Authorization="Bearer "+token;
  else if(env.SUPABASE_SERVICE_ROLE_KEY&&token===env.SUPABASE_SERVICE_ROLE_KEY)headers.Authorization="Bearer "+token;
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
    return {status:"AMBIGUOUS",query,options:rows.slice(0,5).map(x=>({id:x.id,name:x.name,brand:x.brand,model:x.model,price:x.price,stock:x.stock}))};
  }
  return {status:"FOUND",item:rows[0]};
}

async function createQuote(env,token,userId,p,source="AI_AGENT"){
  const items=Array.isArray(p?.items)?p.items:[];
  if(!items.length)return {status:"NEEDS_INPUT",message:"Necesito al menos una partida para crear la cotización."};
  const client=await resolveOneClient(env,token,userId,p.client_query||"");
  if(client.status==="AMBIGUOUS"||client.status==="NOT_FOUND")return {status:"NEEDS_INPUT",field:"client_query",detail:client};
  const resolved=[];
  for(const raw of items){
    const qty=Math.max(0.01,Number(raw.quantity||1));
    if(String(raw.type||"").toUpperCase()==="PRODUCTO"){
      const hit=await resolveInventory(env,token,userId,raw.inventory_query||raw.name||"");
      if(hit.status!=="FOUND")return {status:"NEEDS_INPUT",field:"inventory",item:raw,detail:hit};
      const it=hit.item;
      const price=raw.unit_price===null||raw.unit_price===undefined?Number(it.price||0):Number(raw.unit_price);
      resolved.push({inventory_id:it.id,item_type:"PRODUCTO",name:it.name,description:raw.description||null,quantity:qty,unit:it.unit||"UND",unit_price:Math.max(0,price),cost:Number(it.cost||0)});
    }else{
      const price=Number(raw.unit_price);
      if(!Number.isFinite(price)||price<=0)return {status:"NEEDS_INPUT",field:"work_price",item:raw,message:"Falta un precio válido para el trabajo: "+(raw.name||"Trabajo")};
      resolved.push({inventory_id:null,item_type:"TRABAJO",name:String(raw.name||"Trabajo"),description:raw.description||null,quantity:qty,unit:raw.unit||"UND",unit_price:price,cost:Number(raw.cost||0)});
    }
  }
  const payload={
    p_quote_id:null,
    p_client_id:client.status==="FOUND"?client.client.id:null,
    p_title:p.title||"Cotización",
    p_status:"BORRADOR",
    p_tax_enabled:Boolean(p.tax_enabled),
    p_tax_rate:Number(p.tax_rate||18),
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
async function plan(env,message,history,entityContext={}){
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
    if(reference.type==="client")return {action:"SEARCH_CLIENTS",execute:false,params:{query:item.id}};
  }
  const deterministic=deterministicIntent(message);
  if(deterministic)return deterministic;
  const context=history.map((x,i)=>"["+i+"] "+x.role+":"+x.content).join("\n").slice(-8000);
  const entityMemory=JSON.stringify(entityContext||{}).slice(0,6000);
  const prompt={messages:[
    {role:"system",content:'Eres el enrutador de M.A.R.C. Devuelve SOLO JSON válido, sin markdown ni explicación. Convierte lenguaje natural en una sola acción segura. Usa el historial reciente como contexto conversacional real: si el usuario dice "el primero", "el segundo", "ese", "esa", "ahí", "lo anterior", "el mismo", "también", "ahora", "cuánto es", etc., resuelve el referente usando el último resultado relevante del historial. No inventes referentes: si hay más de una interpretación posible, usa CHAT y pide una aclaración breve. Acciones: SEARCH_CLIENTS, SEARCH_INVENTORY, LIST_QUOTES, CASH_STATUS, CASH_LAST_CLOSE, CREATE_CLIENT, CREATE_QUOTE, ADJUST_INVENTORY, CHAT. Para cualquier consulta, pregunta o solicitud de revisar, usa una acción de consulta. Solo usa execute=true para una operación que el usuario pidió explícitamente ejecutar. Nunca inventes IDs, precios, stock, clientes o productos. Para CREATE_QUOTE: items es un arreglo. Producto {type:"PRODUCTO",inventory_query:"texto",quantity:number,unit_price:number|null}; Trabajo {type:"TRABAJO",name:"texto",quantity:number,unit_price:number|null}. Para ADJUST_INVENTORY type es ENTRADA, SALIDA o AJUSTE. Formato: {"action":"CHAT","execute":false,"params":{}}'},
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
  if(action==="CREATE_CLIENT")return {action,result:pl.execute?await createClient(env,token,user.id,p,source):{status:"PREVIEW",params:p}};
  if(action==="CREATE_QUOTE")return {action,result:pl.execute?await createQuote(env,token,user.id,p,source):{status:"PREVIEW",params:p}};
  if(action==="ADJUST_INVENTORY")return {action,result:{status:"CONFIRMATION_REQUIRED",params:p}};
  return {action:"CHAT",result:null};
}

function normalizeData(x){
  try{return JSON.stringify(x).slice(0,14000)}catch{return String(x).slice(0,14000)}
}

async function finalReply(env,message,planData){
  const execution=planData?.execution||{};
  const result=execution?.result;
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
    {role:"system",content:'Eres M.A.R.C., copiloto operativo. Responde en español claro, profesional y breve. Usa exclusivamente los datos de RESULTADO y la SOLICITUD. Si la solicitud es una continuación de la conversación ("el segundo", "ese", "ahora cuánto", "y el otro", etc.), responde directamente a esa continuación usando el resultado actual y no repitas explicaciones innecesarias. No inventes nada. Si status=NEEDS_INPUT, pregunta exactamente por el dato faltante. Si status=AMBIGUOUS, presenta las opciones y pide elegir. Si status=CREATED o UPDATED, confirma la operación con los datos entregados. Si es una consulta, muestra los resultados útiles. No hables del plan, rol, suscripción o estado de ejecución salvo que la solicitud trate sobre ello. No describas herramientas internas ni digas que eres un modelo.'},
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
    const used=(u||[]).filter(x=>new Date(x.period_start+"T00:00:00Z").getTime()>=new Date(start).setUTCHours(0,0,0,0)).reduce((n,x)=>n+Number(x.ai_actions||0),0);
    if(used>=30)return {kind:"trial_limited",remaining:0};
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
async function telegramIdentity(env,adminToken,externalUserId){
  const path="marc_channel_identities?select=id,user_id,external_user_id,chat_id,username,status&channel=eq.TELEGRAM&external_user_id=eq."+encodeURIComponent(externalUserId)+"&status=eq.LINKED&limit=1";
  const rows=await sb(env,adminToken,path);
  return rows?.[0]||null;
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

  // Comandos operativos rápidos de caja: no consumen IA y ejecutan acciones
  // deterministas sobre la caja del usuario vinculado.
  const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim();
  const simple=norm(incoming);
  const cashRows=async(status=null,limit=1)=>{
    let path="marc_cash_registers?select=*&user_id=eq."+encodeURIComponent(userId);
    if(status)path+="&status=eq."+encodeURIComponent(status);
    path+="&order=opened_at.desc&limit="+limit;
    return sb(env,adminToken,path);
  };
  const moneyText=n=>new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(Number(n||0));
  // Consultas sobre el último cierre: responden directamente desde los movimientos reales, sin pasar por Gemini.
  if(/\b(ultimo|ultima|reciente)\b.*\b(cierre|caja)\b/.test(simple) && /\b(movimiento|movimientos|ingreso|ingresos|egreso|egresos|gasto|gastos|venta|ventas)\b/.test(simple)){
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
  let m=simple.match(/^abrir caja\\s+(\\d+(?:[.,]\\d{1,2})?)(?:\\s+(.+))?$/);
  if(m){
    const amount=Number(m[1].replace(",",".")),notes=m[2]||null;
    try{
      const opened=await sb(env,adminToken,"rpc/marc_cash_open",{method:"POST",body:{p_opening_amount:amount,p_notes:notes}});
      await sendTelegram(env,chatId,"✅ Caja abierta. Efectivo inicial: "+moneyText(opened?.opening_amount||amount));
    }catch(e){await sendTelegram(env,chatId,"⚠️ No pude abrir la caja: "+String(e?.message||e).slice(0,500));}
    return json({ok:true},200);
  }
  m=simple.match(/^(ingreso|entrada)\\s+(\\d+(?:[.,]\\d{1,2})?)(?:\\s+(.+))?$/);
  if(m){
    const rows=await cashRows("OPEN",1),r=rows?.[0];
    if(!r){await sendTelegram(env,chatId,"Primero abre la caja: «abrir caja 100».");return json({ok:true},200);}
    const amount=Number(m[2].replace(",",".")),concept=m[3]||"Ingreso de efectivo";
    await sb(env,adminToken,"marc_cash_movements",{method:"POST",body:{user_id:userId,cash_register_id:r.id,type:"INCOME",amount,concept}});
    await sendTelegram(env,chatId,"✅ Ingreso registrado: "+moneyText(amount)+" · "+concept);
    return json({ok:true},200);
  }
  m=simple.match(/^(gasto|egreso|salida)\\s+(\\d+(?:[.,]\\d{1,2})?)(?:\\s+(.+))?$/);
  if(m){
    const rows=await cashRows("OPEN",1),r=rows?.[0];
    if(!r){await sendTelegram(env,chatId,"Primero abre la caja: «abrir caja 100».");return json({ok:true},200);}
    const amount=Number(m[2].replace(",",".")),concept=m[3]||"Egreso de efectivo";
    await sb(env,adminToken,"marc_cash_movements",{method:"POST",body:{user_id:userId,cash_register_id:r.id,type:"EXPENSE",amount,concept}});
    await sendTelegram(env,chatId,"✅ Egreso registrado: "+moneyText(amount)+" · "+concept);
    return json({ok:true},200);
  }
  m=simple.match(/^cerrar caja\\s+(\\d+(?:[.,]\\d{1,2})?)(?:\\s+(.+))?$/);
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

  if(/^(si|sí|confirmo|confirmar|dale|hazlo|ejecuta|ejecutar)$/i.test(incoming)){
    const conversationId=await ensureTelegramConversation(env,adminToken,userId);
    const ctxMem=await getConversationContext(env,adminToken,userId,conversationId);
    const pending=ctxMem?.pending_action;
    if(pending?.action==="ADJUST_INVENTORY" && pending?.params){
      try{
        const done=await adjustInventory(env,adminToken,userId,pending.params,"TELEGRAM");
        await saveConversationContext(env,adminToken,userId,conversationId,{...ctxMem,pending_action:null});
        const item=done?.item||{};
        await sendTelegram(env,chatId,"✅ Movimiento de inventario realizado.\n\n📦 "+String(item.name||pending.params.inventory_query||"Producto")+"\n🔄 "+pending.params.type+" · "+pending.params.quantity);
      }catch(e){await sendTelegram(env,chatId,"⚠️ No pude realizar el movimiento de inventario. Inténtalo nuevamente.");}
      return json({ok:true,fastPath:"confirm_inventory"},200);
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
    pl=await plan(env,incoming,history,entityContext);
    executed=await executePlan(env,adminToken,{id:userId},pl,"TELEGRAM");
    const nextContext=buildEntityContext(executed,entityContext);
    if(executed?.action==="ADJUST_INVENTORY" && executed?.result?.status==="CONFIRMATION_REQUIRED")nextContext.pending_action={action:"ADJUST_INVENTORY",params:executed.result.params,created_at:new Date().toISOString()};
    await saveConversationContext(env,adminToken,userId,conversationId,nextContext);
    await incrementAiUsage(env,adminToken,userId,access);
    answer=String(await finalReply(env,incoming,{plan:pl,execution:executed,entitlement:access})||"").trim();
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
  return json({profile:rows?.[0]||null},200,corsHeaders(request));
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
  return json({profile:rows?.[0]||profile,entitlement:access},200,corsHeaders(request));
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
  const models=[env.GEMINI_MODEL||GEMINI_MODEL_DEFAULT,env.GEMINI_MODEL_FALLBACK||"gemini-3.7-flash",env.GEMINI_MODEL_FALLBACK2||"gemini-3.6-flash"].filter((x,i,a)=>x&&a.indexOf(x)===i);
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
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request));
  if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de IA de la prueba."},429,corsHeaders(request));
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
  return json({pendingId:rows?.[0]?.id||null,filename},200,corsHeaders(request));
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
  const body={
    contents:[{parts:[
      {inlineData:{mimeType:"image/jpeg",data:clean}},
      {text:String(prompt)}
    ]}],
    generationConfig:{maxOutputTokens:options.maxTokens||3200}
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


async function analyzeInventoryProductPhoto(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env);
  const access=await entitlement(env,token,user.id);
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request));
  if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de IA de la prueba."},429,corsHeaders(request));
  const body=await request.json().catch(()=>({}));
  let image=String(body?.imageBase64||"").trim();
  const mime=String(body?.mimeType||"image/jpeg").trim().toLowerCase();
  if(!image)return json({error:"No se recibió la foto del producto."},400,corsHeaders(request));
  if(!["image/jpeg","image/png","image/webp"].includes(mime))return json({error:"Formato de imagen no permitido."},400,corsHeaders(request));
  image=image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/,"");
  if(image.length>7000000)return json({error:"La imagen es demasiado grande para analizarla. Usa una foto más pequeña."},413,corsHeaders(request));
  const prompt='Analiza esta foto de la caja o empaque de un producto para inventario. Extrae SOLO información que realmente puedas leer o identificar en la imagen. No inventes SKU, marca, modelo, categoría ni número de serie. No extraigas ni calcules precios de venta. Devuelve SOLO JSON con este formato exacto: {"name":"","sku":null,"brand":null,"model":null,"category":"","serial_number":null,"confidence":0}. name es el nombre comercial visible. sku es el código/SKU/part number del producto. serial_number es el número de serie único de ESTA unidad si aparece claramente en la caja o etiqueta; no confundas SKU o modelo con serial y usa null si no es visible. brand y model solo si aparecen. category solo si es evidente. confidence entre 0 y 1.';
  const out=await geminiGenerateImage(env,image,prompt,{maxTokens:500,json:true});
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
  return json({status:"ANALYZED",product},200,corsHeaders(request));
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
  if(!pendingId||(!image&&!pageText))return json({error:"Faltan los datos de la página."},400,corsHeaders(request));
  if(image.length>6*1024*1024)return json({error:"La imagen de la página es demasiado grande."},413,corsHeaders(request));

  const rows=await sb(env,adminToken,"marc_pending_imports?select=id,items,status,expires_at&user_id=eq."+encodeURIComponent(user.id)+"&id=eq."+encodeURIComponent(pendingId)+"&status=eq.PENDING&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&limit=1");
  if(!rows?.[0])return json({error:"La sesión de análisis expiró o no existe."},404,corsHeaders(request));

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

  return json({pageNumber,totalPages,found:items.length,totalFound:items.length,items,mode},200,corsHeaders(request));
}

async function inventoryPdfFinalize(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env);
  const adminToken=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  const form=await request.formData();
  const pendingId=String(form.get("pendingId")||"");
  const file=form.get("file");
  const submittedItems=String(form.get("items")||"");
  if(!pendingId||!file||typeof file.arrayBuffer!=="function")return json({error:"Faltan el PDF o la importación pendiente."},400,corsHeaders(request));
  const bytes=await file.arrayBuffer();
  if(bytes.byteLength>20*1024*1024)return json({error:"El PDF supera el límite de 20 MB."},413,corsHeaders(request));

  const rows=await sb(env,adminToken,"marc_pending_imports?select=id,user_id,items,status,expires_at&user_id=eq."+encodeURIComponent(user.id)+"&id=eq."+encodeURIComponent(pendingId)+"&status=eq.PENDING&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&limit=1");
  const pending=rows?.[0];
  if(!pending)return json({error:"La importación expiró o ya fue finalizada."},404,corsHeaders(request));
  let submitted=[];
  if(submittedItems){
    try{submitted=JSON.parse(submittedItems)}catch{}
  }
  const items=sanitizePdfItems(Array.isArray(submitted)&&submitted.length?submitted:pending.items);
  if(!items.length)return json({error:"No se detectaron productos para mostrar."},422,corsHeaders(request));

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
  return json({pendingId,documentId,count:items.length,items},200,corsHeaders(request));
}

async function inventoryPdfPreview(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env);
  const access=await entitlement(env,token,user.id);
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request));
  if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de IA de la prueba."},429,corsHeaders(request));
  const form=await request.formData();
  const file=form.get("file");
  if(!file||typeof file.arrayBuffer!=="function")return json({error:"Adjunta un archivo PDF."},400,corsHeaders(request));
  const mime=String(file.type||"application/pdf").toLowerCase(),name=String(file.name||"catalogo.pdf");
  if(mime!=="application/pdf"&&!name.toLowerCase().endsWith(".pdf"))return json({error:"Solo se aceptan archivos PDF."},400,corsHeaders(request));
  const bytes=await file.arrayBuffer();
  if(bytes.byteLength>20*1024*1024)return json({error:"El PDF supera el límite de 20 MB."},413,corsHeaders(request));
  const adminToken=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  const job=await createPendingImport(env,adminToken,user.id,"WEB",null,name,bytes);
  await incrementAiUsage(env,token,user.id,access);
  return json({pendingId:job.pending.id,documentId:job.document?.id||null,count:job.items.length,items:job.items.slice(0,50)},200,corsHeaders(request));
}

async function inventoryPdfImport(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env);
  const body=await request.json();
  const access=await entitlement(env,token,user.id);
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request));
  const result=await importPendingInventory(env,env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY,user.id,String(body?.pendingId||""),body?.updateExisting!==false,"WEB");
  return json(result,200,corsHeaders(request));
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
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request));
  if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de IA de la prueba."},429,corsHeaders(request));
  const body=await request.json();
  const improveLines=Boolean(body?.improveLines);
  const rawLines=Array.isArray(body?.items)?body.items:[];
  const description=String(body?.description||"").trim().slice(0,4000);
  const allCost=Boolean(body?.allCost);
  const improveOnly=Boolean(body?.improveOnly);
  const clientQuery=String(body?.clientQuery||"").trim().slice(0,200);
  if(body?.reviewQuote){
    const items=rawLines.map((x,i)=>({index:Number.isInteger(Number(x?.index))?Number(x.index):i,type:String(x?.type||"TRABAJO"),name:String(x?.name||"").trim(),description:String(x?.description||"").trim(),quantity:Number(x?.quantity||0),unit_price:Number(x?.unit_price||0),cost:Number(x?.cost||0),transport:Number(x?.transport||0),labor:Number(x?.labor||0),other:Number(x?.other||0),material_provider:String(x?.material_provider||"CLIENT")})).slice(0,40);
    if(!items.length)return json({error:"Agrega al menos una partida para revisar."},400,corsHeaders(request));
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
    return json({review:{issues:Array.isArray(review.issues)?review.issues.slice(0,8):[],positives:Array.isArray(review.positives)?review.positives.slice(0,8):[]},entitlement:access},200,corsHeaders(request));
  }
  if(improveLines){
    const items=rawLines.map((x,i)=>({index:Number.isInteger(Number(x?.index))?Number(x.index):i,type:String(x?.type||"TRABAJO").slice(0,20),name:String(x?.name||"").trim().slice(0,180),description:String(x?.description||"").trim().slice(0,2000)})).filter(x=>x.description).slice(0,40);
    if(!items.length)return json({error:"Escribe al menos una descripción para mejorar."},400,corsHeaders(request));
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
    return json({improvedLines,entitlement:access},200,corsHeaders(request));
  }
  if(!description)return json({error:"Escribe la descripción del trabajo."},400,corsHeaders(request));
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
  if(improveOnly){let improved;try{improved=JSON.parse(responseText.replace(/^```json\s*|^```\s*$/g,"").trim())}catch{improved={title:"",description:description}}await incrementAiUsage(env,token,user.id,access);return json({improved:{title:String(improved.title||"").trim(),description:String(improved.description||description).trim()},entitlement:access},200,corsHeaders(request))}
  const draft=recoverQuoteDraft(responseText,description,clientQuery,allCost);
  if(!draft?.items?.length)throw Object.assign(new Error("La IA no generó una partida."),{status:502});
  await incrementAiUsage(env,token,user.id,access);
  return json({draft,entitlement:access},200,corsHeaders(request));
}
async function marketingAi(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env),access=await entitlement(env,token,user.id);
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request));
  if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de IA de la prueba."},429,corsHeaders(request));
  const body=await request.json(),p=body?.product||{},platform=String(body?.platform||"WHATSAPP").toUpperCase();
  const prompt={messages:[
    {role:"system",content:'Eres el director creativo y copywriter de M.A.R.C. Crea publicidad comercial clara y profesional en español latino. Usa SOLO los datos entregados; no inventes características, certificaciones, garantías, descuentos, disponibilidad, medidas, marcas, precios ni beneficios técnicos. Devuelve SOLO JSON válido con title, headline, primary_text, short_text, whatsapp_text, banner_text, hashtags. headline breve para banner; primary_text completo para redes; short_text corto; whatsapp_text natural y termina con el CTA; banner_text máximo 3 líneas; hashtags arreglo de 3 a 8.'},
    {role:"user",content:"PLATAFORMA: "+platform+"\nOBJETIVO: "+String(body?.objective||"VENDER")+"\nTONO: "+String(body?.tone||"PROFESIONAL")+"\nPÚBLICO: "+String(body?.audience||"Clientes potenciales")+"\nOFERTA: "+String(body?.offer||"")+"\nCTA: "+String(body?.cta||"Escríbenos para cotizar")+"\nDETALLES: "+String(body?.details||"")+"\nPRODUCTO: "+JSON.stringify({name:String(p.name||"Producto"),brand:String(p.brand||""),model:String(p.model||""),category:String(p.category||""),price:p.price==null||p.price===""?null:Number(p.price),stock:p.stock==null||p.stock===""?null:Number(p.stock)})}
  ]};
  let out;try{out=await geminiGenerate(env,prompt,{json:true,maxTokens:1300})}catch(err){throw Object.assign(new Error("Gemini: "+String(err?.message||"Error de API").slice(0,800)),{status:err?.status||502,details:err?.details||null})}
  const responseText=out?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("")||"";if(!responseText)throw Object.assign(new Error("Gemini devolvió una respuesta vacía."),{status:502});
  let parsed;try{parsed=extractJson(responseText)}catch{throw Object.assign(new Error("La IA devolvió un formato publicitario no válido."),{status:502})}
  await incrementAiUsage(env,token,user.id,access);
  return json({campaign:{title:String(parsed?.title||p.name||"Publicidad").trim().slice(0,180),headline:String(parsed?.headline||p.name||"").trim().slice(0,180),primary_text:String(parsed?.primary_text||"").trim().slice(0,4000),short_text:String(parsed?.short_text||"").trim().slice(0,1200),whatsapp_text:String(parsed?.whatsapp_text||"").trim().slice(0,2000),banner_text:String(parsed?.banner_text||parsed?.headline||p.name||"").trim().slice(0,300),hashtags:Array.isArray(parsed?.hashtags)?parsed.hashtags.map(x=>String(x).trim()).filter(Boolean).slice(0,8):[]},entitlement:access},200,corsHeaders(request));
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
  return json({ok:true,webhookUrl,botUsername:telegramBotName(env),webhook:info?.result||null},200,corsHeaders(request));
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
  },200,corsHeaders(request));
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
  return json({deepLink:"https://t.me/"+bot+"?start="+encodeURIComponent(rawToken),expiresAt:expires},200,corsHeaders(request));
}
async function telegramUnlink(request,env){
  const {token,user}=await authUser(request,env);
  await sb(env,token,"marc_channel_identities?user_id=eq."+encodeURIComponent(user.id)+"&channel=eq.TELEGRAM&status=eq.LINKED",{method:"PATCH",body:{status:"REVOKED",updated_at:new Date().toISOString()}});
  return json({ok:true},200,corsHeaders(request));
}
export default{
  async fetch(request,env,ctx){
    const headers=corsHeaders(request);
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
    const url=new URL(request.url);
    if(url.pathname==="/api/chat"){
      if(request.method!=="POST")return json({error:"Método no permitido"},405,headers);
      try{
        const {token,user}=await authUser(request,env);
        const access=await entitlement(env,token,user.id);
        if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para seguir usando M.A.R.C."},402,headers);
        if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de 30 acciones de IA de la prueba."},429,headers);
        const body=await request.json();
        const message=String(body?.message||"").trim();
        if(!message)return json({error:"Mensaje vacío"},400,headers);
        const history=await recentMessages(env,token,user.id,body?.conversationId||"");
        const pl=await plan(env,message,history);
        const executed=await executePlan(env,token,user,pl,"AI_AGENT");
        await incrementAiUsage(env,token,user.id,access);
        const text=await finalReply(env,message,{plan:pl,execution:executed,entitlement:access});
        return json({text,action:executed.action,result:executed.result},200,headers);
      }catch(err){
        return json({error:err?.message||"Error del agente",detail:err?.details||null},err?.status||500,headers);
      }
    }
    if(url.pathname==="/api/telegram/webhook"){
      try{return await telegramWebhook(request,env,ctx)}catch(err){
        return json({error:err?.message||"Error del webhook",detail:err?.details||null},err?.status||500);
      }
    }
    if(url.pathname==="/api/inventory/analyze-photo"){
      try{return await analyzeInventoryProductPhoto(request,env)}catch(err){return json({error:err?.message||"No se pudo analizar la foto del producto.",detail:err?.details||null},err?.status||500,headers)}
    }
    if(url.pathname==="/api/inventory/pdf-start"){
      try{return await inventoryPdfStart(request,env)}catch(err){return json({error:err?.message||"No se pudo iniciar el análisis"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/inventory/pdf-page"){
      try{return await inventoryPdfPageAnalyze(request,env)}catch(err){return json({error:err?.message||"No se pudo analizar la página"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/inventory/pdf-finalize"){
      try{return await inventoryPdfFinalize(request,env)}catch(err){return json({error:err?.message||"No se pudo finalizar el análisis"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/inventory/pdf-preview"){
      try{return await inventoryPdfPreview(request,env)}catch(err){return json({error:err?.message||"No se pudo analizar el PDF"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/inventory/pdf-import"){
      try{return await inventoryPdfImport(request,env)}catch(err){return json({error:err?.message||"No se pudo importar el inventario"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/company/profile"){
      try{
        if(request.method==="GET")return await companyProfile(request,env);
        if(request.method==="POST")return await saveCompanyProfile(request,env);
        return json({error:"Método no permitido"},405,headers);
      }catch(err){return json({error:err?.message||"No se pudo gestionar el perfil empresarial"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/quote-ai"){
      try{return await quoteAiDraft(request,env)}catch(err){
        return json({error:err?.message||"No se pudo generar la cotización con IA.",detail:err?.details||null},err?.status||500,headers);
      }
    }
    if(url.pathname==="/api/marketing-ai"){try{return await marketingAi(request,env)}catch(err){return json({error:err?.message||"No se pudo generar la publicidad.",detail:err?.details||null},err?.status||500,headers)}}
    if(url.pathname==="/api/telegram/diagnostics"){return telegramDiagnostics(request,env)}
    if(url.pathname==="/api/telegram/setup"){
      if(request.method!=="POST")return json({error:"Método no permitido"},405,headers);
      try{return await telegramSetup(request,env)}catch(err){return json({error:err?.message||"No se pudo configurar Telegram"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/telegram/status"){
      if(request.method!=="GET")return json({error:"Método no permitido"},405,headers);
      try{return await telegramStatus(request,env)}catch(err){return json({error:err?.message||"No se pudo consultar Telegram"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/telegram/link"){
      if(request.method!=="POST")return json({error:"Método no permitido"},405,headers);
      try{return await telegramLink(request,env)}catch(err){return json({error:err?.message||"No se pudo generar el enlace"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/telegram/unlink"){
      if(request.method!=="POST")return json({error:"Método no permitido"},405,headers);
      try{return await telegramUnlink(request,env)}catch(err){return json({error:err?.message||"No se pudo desconectar Telegram"},err?.status||500,headers)}
    }
    if(url.pathname.startsWith("/api/"))return json({error:"Ruta no encontrada"},404,headers);
    const assetResponse=await env.ASSETS.fetch(request);
    const assetHeaders=new Headers(assetResponse.headers);
    if(["/","/index.html"].includes(url.pathname)||/\\.(?:js|css|html)$/.test(url.pathname)){
      assetHeaders.set("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
      assetHeaders.set("Pragma","no-cache");
      assetHeaders.set("Expires","0");
    }
    return new Response(assetResponse.body,{status:assetResponse.status,statusText:assetResponse.statusText,headers:assetHeaders});
  }
};
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
async function plan(env,message,history,entityContext={}){
  const deterministic=deterministicIntent(message);
  if(deterministic)return deterministic;
  const context=history.map((x,i)=>"["+i+"] "+x.role+":"+x.content).join("\n").slice(-8000);
  const entityMemory=JSON.stringify(entityContext||{}).slice(0,6000);
  const prompt={messages:[
    {role:"system",content:'Eres el enrutador de M.A.R.C. Devuelve SOLO JSON válido, sin markdown ni explicación. Convierte lenguaje natural en una sola acción segura. Usa el historial reciente como contexto conversacional real: si el usuario dice "el primero", "el segundo", "ese", "esa", "ahí", "lo anterior", "el mismo", "también", "ahora", "cuánto es", etc., resuelve el referente usando el último resultado relevante del historial. No inventes referentes: si hay más de una interpretación posible, usa CHAT y pide una aclaración breve. Acciones: SEARCH_CLIENTS, SEARCH_INVENTORY, LIST_QUOTES, CASH_STATUS, CASH_LAST_CLOSE, CREATE_CLIENT, CREATE_QUOTE, ADJUST_INVENTORY, CHAT. Para cualquier consulta, pregunta o solicitud de revisar, usa una acción de consulta. Solo usa execute=true para una operación que el usuario pidió explícitamente ejecutar. Nunca inventes IDs, precios, stock, clientes o productos. Para CREATE_QUOTE: items es un arreglo. Producto {type:"PRODUCTO",inventory_query:"texto",quantity:number,unit_price:number|null}; Trabajo {type:"TRABAJO",name:"texto",quantity:number,unit_price:number|null}. Para ADJUST_INVENTORY type es ENTRADA, SALIDA o AJUSTE. Formato: {"action":"CHAT","execute":false,"params":{}}'},
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
  if(action==="CREATE_CLIENT")return {action,result:pl.execute?await createClient(env,token,user.id,p,source):{status:"PREVIEW",params:p}};
  if(action==="CREATE_QUOTE")return {action,result:pl.execute?await createQuote(env,token,user.id,p,source):{status:"PREVIEW",params:p}};
  if(action==="ADJUST_INVENTORY")return {action,result:pl.execute?await adjustInventory(env,token,user.id,p,source):{status:"PREVIEW",params:p}};
  return {action:"CHAT",result:null};
}

function normalizeData(x){
  try{return JSON.stringify(x).slice(0,14000)}catch{return String(x).slice(0,14000)}
}

async function finalReply(env,message,planData){
  const execution=planData?.execution||{};
  const result=execution?.result;
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
    {role:"system",content:'Eres M.A.R.C., copiloto operativo. Responde en español claro, profesional y breve. Usa exclusivamente los datos de RESULTADO y la SOLICITUD. Si la solicitud es una continuación de la conversación ("el segundo", "ese", "ahora cuánto", "y el otro", etc.), responde directamente a esa continuación usando el resultado actual y no repitas explicaciones innecesarias. No inventes nada. Si status=NEEDS_INPUT, pregunta exactamente por el dato faltante. Si status=AMBIGUOUS, presenta las opciones y pide elegir. Si status=CREATED o UPDATED, confirma la operación con los datos entregados. Si es una consulta, muestra los resultados útiles. No hables del plan, rol, suscripción o estado de ejecución salvo que la solicitud trate sobre ello. No describas herramientas internas ni digas que eres un modelo.'},
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
    const used=(u||[]).filter(x=>new Date(x.period_start+"T00:00:00Z").getTime()>=new Date(start).setUTCHours(0,0,0,0)).reduce((n,x)=>n+Number(x.ai_actions||0),0);
    if(used>=30)return {kind:"trial_limited",remaining:0};
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
async function telegramIdentity(env,adminToken,externalUserId){
  const path="marc_channel_identities?select=id,user_id,external_user_id,chat_id,username,status&channel=eq.TELEGRAM&external_user_id=eq."+encodeURIComponent(externalUserId)+"&status=eq.LINKED&limit=1";
  const rows=await sb(env,adminToken,path);
  return rows?.[0]||null;
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

  // Comandos operativos rápidos de caja: no consumen IA y ejecutan acciones
  // deterministas sobre la caja del usuario vinculado.
  const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim();
  const simple=norm(incoming);
  const cashRows=async(status=null,limit=1)=>{
    let path="marc_cash_registers?select=*&user_id=eq."+encodeURIComponent(userId);
    if(status)path+="&status=eq."+encodeURIComponent(status);
    path+="&order=opened_at.desc&limit="+limit;
    return sb(env,adminToken,path);
  };
  const moneyText=n=>new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(Number(n||0));
  // Consultas sobre el último cierre: responden directamente desde los movimientos reales, sin pasar por Gemini.
  if(/\b(ultimo|ultima|reciente)\b.*\b(cierre|caja)\b/.test(simple) && /\b(movimiento|movimientos|ingreso|ingresos|egreso|egresos|gasto|gastos|venta|ventas)\b/.test(simple)){
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
  let m=simple.match(/^abrir caja\\s+(\\d+(?:[.,]\\d{1,2})?)(?:\\s+(.+))?$/);
  if(m){
    const amount=Number(m[1].replace(",",".")),notes=m[2]||null;
    try{
      const opened=await sb(env,adminToken,"rpc/marc_cash_open",{method:"POST",body:{p_opening_amount:amount,p_notes:notes}});
      await sendTelegram(env,chatId,"✅ Caja abierta. Efectivo inicial: "+moneyText(opened?.opening_amount||amount));
    }catch(e){await sendTelegram(env,chatId,"⚠️ No pude abrir la caja: "+String(e?.message||e).slice(0,500));}
    return json({ok:true},200);
  }
  m=simple.match(/^(ingreso|entrada)\\s+(\\d+(?:[.,]\\d{1,2})?)(?:\\s+(.+))?$/);
  if(m){
    const rows=await cashRows("OPEN",1),r=rows?.[0];
    if(!r){await sendTelegram(env,chatId,"Primero abre la caja: «abrir caja 100».");return json({ok:true},200);}
    const amount=Number(m[2].replace(",",".")),concept=m[3]||"Ingreso de efectivo";
    await sb(env,adminToken,"marc_cash_movements",{method:"POST",body:{user_id:userId,cash_register_id:r.id,type:"INCOME",amount,concept}});
    await sendTelegram(env,chatId,"✅ Ingreso registrado: "+moneyText(amount)+" · "+concept);
    return json({ok:true},200);
  }
  m=simple.match(/^(gasto|egreso|salida)\\s+(\\d+(?:[.,]\\d{1,2})?)(?:\\s+(.+))?$/);
  if(m){
    const rows=await cashRows("OPEN",1),r=rows?.[0];
    if(!r){await sendTelegram(env,chatId,"Primero abre la caja: «abrir caja 100».");return json({ok:true},200);}
    const amount=Number(m[2].replace(",",".")),concept=m[3]||"Egreso de efectivo";
    await sb(env,adminToken,"marc_cash_movements",{method:"POST",body:{user_id:userId,cash_register_id:r.id,type:"EXPENSE",amount,concept}});
    await sendTelegram(env,chatId,"✅ Egreso registrado: "+moneyText(amount)+" · "+concept);
    return json({ok:true},200);
  }
  m=simple.match(/^cerrar caja\\s+(\\d+(?:[.,]\\d{1,2})?)(?:\\s+(.+))?$/);
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

  const conversationId=await ensureTelegramConversation(env,adminToken,userId);
  await sb(env,adminToken,"marc_messages",{method:"POST",body:{
    conversation_id:conversationId,user_id:userId,role:"USER",content:incoming,action_type:"TELEGRAM",
    action_payload:{telegram_update_id:update.update_id,telegram_user_id:externalUserId}
  }});
  let pl=null,executed=null,answer="";
  try{
    const history=await recentMessages(env,adminToken,userId,conversationId);
    const entityContext=await getConversationContext(env,adminToken,userId,conversationId);
    pl=await plan(env,incoming,history,entityContext);
    executed=await executePlan(env,adminToken,{id:userId},pl,"TELEGRAM");
    await saveConversationContext(env,adminToken,userId,conversationId,buildEntityContext(executed,entityContext));
    await incrementAiUsage(env,adminToken,userId,access);
    answer=String(await finalReply(env,incoming,{plan:pl,execution:executed,entitlement:access})||"").trim();
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
  return json({profile:rows?.[0]||null},200,corsHeaders(request));
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
  return json({profile:rows?.[0]||profile,entitlement:access},200,corsHeaders(request));
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
  const models=[env.GEMINI_MODEL||GEMINI_MODEL_DEFAULT,env.GEMINI_MODEL_FALLBACK||"gemini-3.7-flash",env.GEMINI_MODEL_FALLBACK2||"gemini-3.6-flash"].filter((x,i,a)=>x&&a.indexOf(x)===i);
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
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request));
  if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de IA de la prueba."},429,corsHeaders(request));
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
  return json({pendingId:rows?.[0]?.id||null,filename},200,corsHeaders(request));
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
  const body={
    contents:[{parts:[
      {inlineData:{mimeType:"image/jpeg",data:clean}},
      {text:String(prompt)}
    ]}],
    generationConfig:{maxOutputTokens:options.maxTokens||3200}
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


async function analyzeInventoryProductPhoto(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env);
  const access=await entitlement(env,token,user.id);
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request));
  if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de IA de la prueba."},429,corsHeaders(request));
  const body=await request.json().catch(()=>({}));
  let image=String(body?.imageBase64||"").trim();
  const mime=String(body?.mimeType||"image/jpeg").trim().toLowerCase();
  if(!image)return json({error:"No se recibió la foto del producto."},400,corsHeaders(request));
  if(!["image/jpeg","image/png","image/webp"].includes(mime))return json({error:"Formato de imagen no permitido."},400,corsHeaders(request));
  image=image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/,"");
  if(image.length>7000000)return json({error:"La imagen es demasiado grande para analizarla. Usa una foto más pequeña."},413,corsHeaders(request));
  const prompt='Analiza esta foto de la caja o empaque de un producto para inventario. Extrae SOLO información que realmente puedas leer o identificar en la imagen. No inventes SKU, marca, modelo, categoría ni número de serie. No extraigas ni calcules precios de venta. Devuelve SOLO JSON con este formato exacto: {"name":"","sku":null,"brand":null,"model":null,"category":"","serial_number":null,"confidence":0}. name es el nombre comercial visible. sku es el código/SKU/part number del producto. serial_number es el número de serie único de ESTA unidad si aparece claramente en la caja o etiqueta; no confundas SKU o modelo con serial y usa null si no es visible. brand y model solo si aparecen. category solo si es evidente. confidence entre 0 y 1.';
  const out=await geminiGenerateImage(env,image,prompt,{maxTokens:500,json:true});
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
  return json({status:"ANALYZED",product},200,corsHeaders(request));
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
  if(!pendingId||(!image&&!pageText))return json({error:"Faltan los datos de la página."},400,corsHeaders(request));
  if(image.length>6*1024*1024)return json({error:"La imagen de la página es demasiado grande."},413,corsHeaders(request));

  const rows=await sb(env,adminToken,"marc_pending_imports?select=id,items,status,expires_at&user_id=eq."+encodeURIComponent(user.id)+"&id=eq."+encodeURIComponent(pendingId)+"&status=eq.PENDING&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&limit=1");
  if(!rows?.[0])return json({error:"La sesión de análisis expiró o no existe."},404,corsHeaders(request));

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

  return json({pageNumber,totalPages,found:items.length,totalFound:items.length,items,mode},200,corsHeaders(request));
}

async function inventoryPdfFinalize(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env);
  const adminToken=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  const form=await request.formData();
  const pendingId=String(form.get("pendingId")||"");
  const file=form.get("file");
  const submittedItems=String(form.get("items")||"");
  if(!pendingId||!file||typeof file.arrayBuffer!=="function")return json({error:"Faltan el PDF o la importación pendiente."},400,corsHeaders(request));
  const bytes=await file.arrayBuffer();
  if(bytes.byteLength>20*1024*1024)return json({error:"El PDF supera el límite de 20 MB."},413,corsHeaders(request));

  const rows=await sb(env,adminToken,"marc_pending_imports?select=id,user_id,items,status,expires_at&user_id=eq."+encodeURIComponent(user.id)+"&id=eq."+encodeURIComponent(pendingId)+"&status=eq.PENDING&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&limit=1");
  const pending=rows?.[0];
  if(!pending)return json({error:"La importación expiró o ya fue finalizada."},404,corsHeaders(request));
  let submitted=[];
  if(submittedItems){
    try{submitted=JSON.parse(submittedItems)}catch{}
  }
  const items=sanitizePdfItems(Array.isArray(submitted)&&submitted.length?submitted:pending.items);
  if(!items.length)return json({error:"No se detectaron productos para mostrar."},422,corsHeaders(request));

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
  return json({pendingId,documentId,count:items.length,items},200,corsHeaders(request));
}

async function inventoryPdfPreview(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env);
  const access=await entitlement(env,token,user.id);
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request));
  if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de IA de la prueba."},429,corsHeaders(request));
  const form=await request.formData();
  const file=form.get("file");
  if(!file||typeof file.arrayBuffer!=="function")return json({error:"Adjunta un archivo PDF."},400,corsHeaders(request));
  const mime=String(file.type||"application/pdf").toLowerCase(),name=String(file.name||"catalogo.pdf");
  if(mime!=="application/pdf"&&!name.toLowerCase().endsWith(".pdf"))return json({error:"Solo se aceptan archivos PDF."},400,corsHeaders(request));
  const bytes=await file.arrayBuffer();
  if(bytes.byteLength>20*1024*1024)return json({error:"El PDF supera el límite de 20 MB."},413,corsHeaders(request));
  const adminToken=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  const job=await createPendingImport(env,adminToken,user.id,"WEB",null,name,bytes);
  await incrementAiUsage(env,token,user.id,access);
  return json({pendingId:job.pending.id,documentId:job.document?.id||null,count:job.items.length,items:job.items.slice(0,50)},200,corsHeaders(request));
}

async function inventoryPdfImport(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env);
  const body=await request.json();
  const access=await entitlement(env,token,user.id);
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request));
  const result=await importPendingInventory(env,env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY,user.id,String(body?.pendingId||""),body?.updateExisting!==false,"WEB");
  return json(result,200,corsHeaders(request));
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
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request));
  if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de IA de la prueba."},429,corsHeaders(request));
  const body=await request.json();
  const improveLines=Boolean(body?.improveLines);
  const rawLines=Array.isArray(body?.items)?body.items:[];
  const description=String(body?.description||"").trim().slice(0,4000);
  const allCost=Boolean(body?.allCost);
  const improveOnly=Boolean(body?.improveOnly);
  const clientQuery=String(body?.clientQuery||"").trim().slice(0,200);
  if(body?.reviewQuote){
    const items=rawLines.map((x,i)=>({index:Number.isInteger(Number(x?.index))?Number(x.index):i,type:String(x?.type||"TRABAJO"),name:String(x?.name||"").trim(),description:String(x?.description||"").trim(),quantity:Number(x?.quantity||0),unit_price:Number(x?.unit_price||0),cost:Number(x?.cost||0),transport:Number(x?.transport||0),labor:Number(x?.labor||0),other:Number(x?.other||0),material_provider:String(x?.material_provider||"CLIENT")})).slice(0,40);
    if(!items.length)return json({error:"Agrega al menos una partida para revisar."},400,corsHeaders(request));
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
    return json({review:{issues:Array.isArray(review.issues)?review.issues.slice(0,8):[],positives:Array.isArray(review.positives)?review.positives.slice(0,8):[]},entitlement:access},200,corsHeaders(request));
  }
  if(improveLines){
    const items=rawLines.map((x,i)=>({index:Number.isInteger(Number(x?.index))?Number(x.index):i,type:String(x?.type||"TRABAJO").slice(0,20),name:String(x?.name||"").trim().slice(0,180),description:String(x?.description||"").trim().slice(0,2000)})).filter(x=>x.description).slice(0,40);
    if(!items.length)return json({error:"Escribe al menos una descripción para mejorar."},400,corsHeaders(request));
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
    return json({improvedLines,entitlement:access},200,corsHeaders(request));
  }
  if(!description)return json({error:"Escribe la descripción del trabajo."},400,corsHeaders(request));
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
  if(improveOnly){let improved;try{improved=JSON.parse(responseText.replace(/^```json\s*|^```\s*$/g,"").trim())}catch{improved={title:"",description:description}}await incrementAiUsage(env,token,user.id,access);return json({improved:{title:String(improved.title||"").trim(),description:String(improved.description||description).trim()},entitlement:access},200,corsHeaders(request))}
  const draft=recoverQuoteDraft(responseText,description,clientQuery,allCost);
  if(!draft?.items?.length)throw Object.assign(new Error("La IA no generó una partida."),{status:502});
  await incrementAiUsage(env,token,user.id,access);
  return json({draft,entitlement:access},200,corsHeaders(request));
}
async function marketingAi(request,env){
  if(request.method!=="POST")return json({error:"Método no permitido"},405);
  const {token,user}=await authUser(request,env),access=await entitlement(env,token,user.id);
  if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para continuar."},402,corsHeaders(request));
  if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de IA de la prueba."},429,corsHeaders(request));
  const body=await request.json(),p=body?.product||{},platform=String(body?.platform||"WHATSAPP").toUpperCase();
  const prompt={messages:[
    {role:"system",content:'Eres el director creativo y copywriter de M.A.R.C. Crea publicidad comercial clara y profesional en español latino. Usa SOLO los datos entregados; no inventes características, certificaciones, garantías, descuentos, disponibilidad, medidas, marcas, precios ni beneficios técnicos. Devuelve SOLO JSON válido con title, headline, primary_text, short_text, whatsapp_text, banner_text, hashtags. headline breve para banner; primary_text completo para redes; short_text corto; whatsapp_text natural y termina con el CTA; banner_text máximo 3 líneas; hashtags arreglo de 3 a 8.'},
    {role:"user",content:"PLATAFORMA: "+platform+"\nOBJETIVO: "+String(body?.objective||"VENDER")+"\nTONO: "+String(body?.tone||"PROFESIONAL")+"\nPÚBLICO: "+String(body?.audience||"Clientes potenciales")+"\nOFERTA: "+String(body?.offer||"")+"\nCTA: "+String(body?.cta||"Escríbenos para cotizar")+"\nDETALLES: "+String(body?.details||"")+"\nPRODUCTO: "+JSON.stringify({name:String(p.name||"Producto"),brand:String(p.brand||""),model:String(p.model||""),category:String(p.category||""),price:p.price==null||p.price===""?null:Number(p.price),stock:p.stock==null||p.stock===""?null:Number(p.stock)})}
  ]};
  let out;try{out=await geminiGenerate(env,prompt,{json:true,maxTokens:1300})}catch(err){throw Object.assign(new Error("Gemini: "+String(err?.message||"Error de API").slice(0,800)),{status:err?.status||502,details:err?.details||null})}
  const responseText=out?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("")||"";if(!responseText)throw Object.assign(new Error("Gemini devolvió una respuesta vacía."),{status:502});
  let parsed;try{parsed=extractJson(responseText)}catch{throw Object.assign(new Error("La IA devolvió un formato publicitario no válido."),{status:502})}
  await incrementAiUsage(env,token,user.id,access);
  return json({campaign:{title:String(parsed?.title||p.name||"Publicidad").trim().slice(0,180),headline:String(parsed?.headline||p.name||"").trim().slice(0,180),primary_text:String(parsed?.primary_text||"").trim().slice(0,4000),short_text:String(parsed?.short_text||"").trim().slice(0,1200),whatsapp_text:String(parsed?.whatsapp_text||"").trim().slice(0,2000),banner_text:String(parsed?.banner_text||parsed?.headline||p.name||"").trim().slice(0,300),hashtags:Array.isArray(parsed?.hashtags)?parsed.hashtags.map(x=>String(x).trim()).filter(Boolean).slice(0,8):[]},entitlement:access},200,corsHeaders(request));
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
  return json({ok:true,webhookUrl,botUsername:telegramBotName(env),webhook:info?.result||null},200,corsHeaders(request));
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
  },200,corsHeaders(request));
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
  return json({deepLink:"https://t.me/"+bot+"?start="+encodeURIComponent(rawToken),expiresAt:expires},200,corsHeaders(request));
}
async function telegramUnlink(request,env){
  const {token,user}=await authUser(request,env);
  await sb(env,token,"marc_channel_identities?user_id=eq."+encodeURIComponent(user.id)+"&channel=eq.TELEGRAM&status=eq.LINKED",{method:"PATCH",body:{status:"REVOKED",updated_at:new Date().toISOString()}});
  return json({ok:true},200,corsHeaders(request));
}
export default{
  async fetch(request,env,ctx){
    const headers=corsHeaders(request);
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
    const url=new URL(request.url);
    if(url.pathname==="/api/chat"){
      if(request.method!=="POST")return json({error:"Método no permitido"},405,headers);
      try{
        const {token,user}=await authUser(request,env);
        const access=await entitlement(env,token,user.id);
        if(access.kind==="expired")return json({error:"TRIAL_EXPIRED",message:"Tu prueba terminó. Activa un plan para seguir usando M.A.R.C."},402,headers);
        if(access.kind==="trial_limited")return json({error:"AI_LIMIT_REACHED",message:"Llegaste al límite de 30 acciones de IA de la prueba."},429,headers);
        const body=await request.json();
        const message=String(body?.message||"").trim();
        if(!message)return json({error:"Mensaje vacío"},400,headers);
        const history=await recentMessages(env,token,user.id,body?.conversationId||"");
        const pl=await plan(env,message,history);
        const executed=await executePlan(env,token,user,pl,"AI_AGENT");
        await incrementAiUsage(env,token,user.id,access);
        const text=await finalReply(env,message,{plan:pl,execution:executed,entitlement:access});
        return json({text,action:executed.action,result:executed.result},200,headers);
      }catch(err){
        return json({error:err?.message||"Error del agente",detail:err?.details||null},err?.status||500,headers);
      }
    }
    if(url.pathname==="/api/telegram/webhook"){
      try{return await telegramWebhook(request,env,ctx)}catch(err){
        return json({error:err?.message||"Error del webhook",detail:err?.details||null},err?.status||500);
      }
    }
    if(url.pathname==="/api/inventory/analyze-photo"){
      try{return await analyzeInventoryProductPhoto(request,env)}catch(err){return json({error:err?.message||"No se pudo analizar la foto del producto.",detail:err?.details||null},err?.status||500,headers)}
    }
    if(url.pathname==="/api/inventory/pdf-start"){
      try{return await inventoryPdfStart(request,env)}catch(err){return json({error:err?.message||"No se pudo iniciar el análisis"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/inventory/pdf-page"){
      try{return await inventoryPdfPageAnalyze(request,env)}catch(err){return json({error:err?.message||"No se pudo analizar la página"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/inventory/pdf-finalize"){
      try{return await inventoryPdfFinalize(request,env)}catch(err){return json({error:err?.message||"No se pudo finalizar el análisis"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/inventory/pdf-preview"){
      try{return await inventoryPdfPreview(request,env)}catch(err){return json({error:err?.message||"No se pudo analizar el PDF"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/inventory/pdf-import"){
      try{return await inventoryPdfImport(request,env)}catch(err){return json({error:err?.message||"No se pudo importar el inventario"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/company/profile"){
      try{
        if(request.method==="GET")return await companyProfile(request,env);
        if(request.method==="POST")return await saveCompanyProfile(request,env);
        return json({error:"Método no permitido"},405,headers);
      }catch(err){return json({error:err?.message||"No se pudo gestionar el perfil empresarial"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/quote-ai"){
      try{return await quoteAiDraft(request,env)}catch(err){
        return json({error:err?.message||"No se pudo generar la cotización con IA.",detail:err?.details||null},err?.status||500,headers);
      }
    }
    if(url.pathname==="/api/marketing-ai"){try{return await marketingAi(request,env)}catch(err){return json({error:err?.message||"No se pudo generar la publicidad.",detail:err?.details||null},err?.status||500,headers)}}
    if(url.pathname==="/api/telegram/diagnostics"){return telegramDiagnostics(request,env)}
    if(url.pathname==="/api/telegram/setup"){
      if(request.method!=="POST")return json({error:"Método no permitido"},405,headers);
      try{return await telegramSetup(request,env)}catch(err){return json({error:err?.message||"No se pudo configurar Telegram"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/telegram/status"){
      if(request.method!=="GET")return json({error:"Método no permitido"},405,headers);
      try{return await telegramStatus(request,env)}catch(err){return json({error:err?.message||"No se pudo consultar Telegram"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/telegram/link"){
      if(request.method!=="POST")return json({error:"Método no permitido"},405,headers);
      try{return await telegramLink(request,env)}catch(err){return json({error:err?.message||"No se pudo generar el enlace"},err?.status||500,headers)}
    }
    if(url.pathname==="/api/telegram/unlink"){
      if(request.method!=="POST")return json({error:"Método no permitido"},405,headers);
      try{return await telegramUnlink(request,env)}catch(err){return json({error:err?.message||"No se pudo desconectar Telegram"},err?.status||500,headers)}
    }
    if(url.pathname.startsWith("/api/"))return json({error:"Ruta no encontrada"},404,headers);
    const assetResponse=await env.ASSETS.fetch(request);
    const assetHeaders=new Headers(assetResponse.headers);
    if(["/","/index.html"].includes(url.pathname)||/\\.(?:js|css|html)$/.test(url.pathname)){
      assetHeaders.set("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
      assetHeaders.set("Pragma","no-cache");
      assetHeaders.set("Expires","0");
    }
    return new Response(assetResponse.body,{status:assetResponse.status,statusText:assetResponse.statusText,headers:assetHeaders});
  }
};
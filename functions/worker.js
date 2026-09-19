const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store",...headers}});
const SYSTEM_MODEL="@cf/meta/llama-3.1-8b-instruct-fast";

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

async function sb(env,token,path,options={}){
  const r=await fetch(env.SUPABASE_URL+"/rest/v1/"+path,{
    method:options.method||"GET",
    headers:{
      apikey:env.SUPABASE_PUBLISHABLE_KEY,
      Authorization:"Bearer "+token,
      "content-type":"application/json",
      Prefer:options.prefer||"return=representation"
    },
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
  if(query)url.searchParams.set("or",orIlike(["name","contact_name","email","phone","document_number"],query));
  url.searchParams.set("order","name.asc");
  url.searchParams.set("limit","8");
  return sb(env,token,url.pathname.slice("/rest/v1/".length)+url.search);
}

async function searchInventory(env,token,userId,query){
  const url=new URL(env.SUPABASE_URL+"/rest/v1/marc_inventory");
  url.searchParams.set("select","id,name,sku,brand,model,category,unit,cost,price,stock,min_stock");
  url.searchParams.set("user_id","eq."+userId);
  url.searchParams.set("active","eq.true");
  if(query)url.searchParams.set("or",orIlike(["name","sku","brand","model","category"],query));
  url.searchParams.set("order","name.asc");
  url.searchParams.set("limit","8");
  return sb(env,token,url.pathname.slice("/rest/v1/".length)+url.search);
}

async function listQuotes(env,token,userId){
  const url=new URL(env.SUPABASE_URL+"/rest/v1/marc_quotes");
  url.searchParams.set("select","id,number,title,status,total,client_id,created_at");
  url.searchParams.set("user_id","eq."+userId);
  url.searchParams.set("order","created_at.desc");
  url.searchParams.set("limit","10");
  return sb(env,token,url.pathname.slice("/rest/v1/".length)+url.search);
}

async function createClient(env,token,userId,p){
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
  if(client)await audit(env,token,userId,"CLIENT",client.id,"CREATE",{source:"AI_AGENT"});
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

async function createQuote(env,token,userId,p){
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
      resolved.push({inventory_id:it.id,item_type:"PRODUCTO",name:it.name,description:raw.description||null,quantity:qty,unit:it.unit||"UND",unit_price:Math.max(0,price),cost:Number(it.cost||0),line_total:qty*Math.max(0,price)});
    }else{
      const price=Number(raw.unit_price);
      if(!Number.isFinite(price)||price<=0)return {status:"NEEDS_INPUT",field:"work_price",item:raw,message:"Falta un precio válido para el trabajo: "+(raw.name||"Trabajo")};
      resolved.push({inventory_id:null,item_type:"TRABAJO",name:String(raw.name||"Trabajo"),description:raw.description||null,quantity:qty,unit:raw.unit||"UND",unit_price:price,cost:Number(raw.cost||0),line_total:qty*price});
    }
  }
  const subtotal=resolved.reduce((n,x)=>n+x.line_total,0);
  const taxRate=Number(p.tax_rate||18), taxEnabled=Boolean(p.tax_enabled);
  const tax=taxEnabled?subtotal*taxRate/100:0,total=subtotal+tax;
  const now=new Date(),ym=now.toISOString().slice(0,7);
  const latest=await sb(env,token,"marc_quotes?select=number&user_id=eq."+encodeURIComponent(userId)+"&order=created_at.desc&limit=1");
  const last=String(latest?.[0]?.number||"");
  const m=last.match(/(\d+)$/);const next=(m?Number(m[1]):0)+1;
  const number="COT-"+ym.replace("-","")+"-"+String(next).padStart(4,"0");
  const qRows=await sb(env,token,"marc_quotes",{method:"POST",body:{
    user_id:userId,number,client_id:client.status==="FOUND"?client.client.id:null,
    title:p.title||"Cotización",status:"BORRADOR",currency:p.currency||"PEN",
    tax_enabled:taxEnabled,tax_rate:taxRate,subtotal,tax,total,notes:p.notes||null
  }});
  const quote=qRows?.[0];
  if(!quote)throw new Error("No se pudo crear la cotización.");
  try{
    for(const item of resolved)await sb(env,token,"marc_quote_items",{method:"POST",body:{quote_id:quote.id,user_id:userId,...item}});
  }catch(e){
    await sb(env,token,"marc_quotes?id=eq."+encodeURIComponent(quote.id)+"&user_id=eq."+encodeURIComponent(userId),{method:"DELETE",prefer:"return=minimal"}).catch(()=>{});
    throw e;
  }
  await audit(env,token,userId,"QUOTE",quote.id,"CREATE",{source:"AI_AGENT",number,total,items:resolved.length});
  return {status:"CREATED",quote:{...quote,number,subtotal,tax,total},client:client.status==="FOUND"?client.client:null,items:resolved};
}

async function adjustInventory(env,token,userId,p){
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
  await audit(env,token,userId,"INVENTORY",hit.item.id,"ADJUST",{source:"AI_AGENT",type,quantity});
  return {status:"UPDATED",item};
}

async function audit(env,token,userId,entityType,entityId,action,metadata){
  await sb(env,token,"marc_audit_log",{method:"POST",body:{user_id:userId,entity_type:entityType,entity_id:entityId,action,source:"WEB",metadata:metadata||{}}}).catch(()=>{});
}

async function recentMessages(env,token,userId,conversationId){
  if(!conversationId)return [];
  const url=new URL(env.SUPABASE_URL+"/rest/v1/marc_messages");
  url.searchParams.set("select","role,content,created_at");
  url.searchParams.set("user_id","eq."+userId);
  url.searchParams.set("conversation_id","eq."+conversationId);
  url.searchParams.set("order","created_at.desc");
  url.searchParams.set("limit","12");
  const rows=await sb(env,token,url.pathname.slice("/rest/v1/".length)+url.search);
  return rows.reverse();
}

function extractJson(text){
  const fence=String.fromCharCode(96).repeat(3);
  const raw=String(text||"").replaceAll(fence+"json","").replaceAll(fence,"").trim();
  const a=raw.indexOf("{"),b=raw.lastIndexOf("}");
  if(a<0||b<=a)throw new Error("El plan del agente no llegó en JSON.");
  return JSON.parse(raw.slice(a,b+1));
}

async function plan(env,message,history){
  const context=history.map(x=>x.role+":"+x.content).join("\n").slice(-6000);
  const prompt={messages:[
    {role:"system",content:'Eres el enrutador de M.A.R.C. Devuelve SOLO JSON válido, sin markdown ni explicación. Tu trabajo es convertir lenguaje natural en una operación segura. Acciones permitidas: SEARCH_CLIENTS, SEARCH_INVENTORY, LIST_QUOTES, CREATE_CLIENT, CREATE_QUOTE, ADJUST_INVENTORY, CHAT. Nunca inventes IDs, precios, stock, clientes o productos. Una acción de escritura solo usa execute=true cuando el usuario pidió explícitamente crear, guardar, registrar, generar, sumar, restar, ingresar o ajustar algo. Si el usuario pregunta, consulta o pide revisar, usa execute=false. Para CREATE_QUOTE: items es un arreglo. Producto: {type:"PRODUCTO",inventory_query:"texto",quantity:number,unit_price:number|null}. Trabajo: {type:"TRABAJO",name:"texto",quantity:number,unit_price:number|null}. No inventes precio de trabajo; usa null si falta. client_query puede quedar vacío. Para ADJUST_INVENTORY usa type ENTRADA, SALIDA o AJUSTE; quantity siempre positiva. Si no hay suficiente información para ejecutar una escritura, mantén execute=true y deja params incompletos para que el ejecutor solicite el dato faltante. Formato: {"action":"CHAT|SEARCH_CLIENTS|SEARCH_INVENTORY|LIST_QUOTES|CREATE_CLIENT|CREATE_QUOTE|ADJUST_INVENTORY","execute":false,"params":{}}'},
    ...(context?[{role:"user",content:"Historial reciente:\n"+context}]:[]),
    {role:"user",content:message}
  ]};
  const out=await env.AI.run(env.MARC_AI_MODEL||SYSTEM_MODEL,prompt);
  try{return extractJson(out?.response)}catch{return {action:"CHAT",execute:false,params:{}}}
}

async function executePlan(env,token,user,pl){
  const action=String(pl?.action||"CHAT").toUpperCase(),p=pl?.params||{};
  if(action==="SEARCH_CLIENTS")return {action,result:await searchClients(env,token,user.id,p.query||"")};
  if(action==="SEARCH_INVENTORY")return {action,result:await searchInventory(env,token,user.id,p.query||"")};
  if(action==="LIST_QUOTES")return {action,result:await listQuotes(env,token,user.id)};
  if(action==="CREATE_CLIENT")return {action,result:pl.execute?await createClient(env,token,user.id,p):{status:"PREVIEW",params:p}};
  if(action==="CREATE_QUOTE")return {action,result:pl.execute?await createQuote(env,token,user.id,p):{status:"PREVIEW",params:p}};
  if(action==="ADJUST_INVENTORY")return {action,result:pl.execute?await adjustInventory(env,token,user.id,p):{status:"PREVIEW",params:p}};
  return {action:"CHAT",result:null};
}

function normalizeData(x){
  try{return JSON.stringify(x).slice(0,14000)}catch{return String(x).slice(0,14000)}
}

async function finalReply(env,message,planData){
  const prompt={messages:[
    {role:"system",content:'Eres M.A.R.C., copiloto operativo. Responde en español claro, profesional y breve. Usa exclusivamente los datos de RESULTADO. No inventes nada. Si status=NEEDS_INPUT, pregunta exactamente por el dato faltante. Si status=AMBIGUOUS, presenta las opciones y pide elegir. Si status=CREATED o UPDATED, confirma la operación con los datos entregados. Si es una consulta, muestra los resultados útiles. No describas herramientas internas ni digas que eres un modelo.'},
    {role:"user",content:"SOLICITUD:\n"+message+"\n\nRESULTADO:\n"+normalizeData(planData)}
  ]};
  const out=await env.AI.run(env.MARC_AI_MODEL||SYSTEM_MODEL,{...prompt,max_tokens:700,temperature:.15});
  return out?.response||"Listo.";
}

async function entitlement(env,token,userId){
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

async function incrementAiUsage(env,token,userId){
  const d=new Date(),period=d.toISOString().slice(0,10),end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).toISOString().slice(0,10);
  const rows=await sb(env,token,"marc_usage_counters?select=id,ai_actions&user_id=eq."+encodeURIComponent(userId)+"&period_start=eq."+period+"&limit=1");
  if(rows?.[0])await sb(env,token,"marc_usage_counters?id=eq."+rows[0].id+"&user_id=eq."+encodeURIComponent(userId),{method:"PATCH",body:{ai_actions:Number(rows[0].ai_actions||0)+1,updated_at:new Date().toISOString()}});
  else await sb(env,token,"marc_usage_counters",{method:"POST",body:{user_id:userId,period_start:period,period_end:end,ai_actions:1}});
}

export default{
  async fetch(request,env){
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
        const executed=await executePlan(env,token,user,pl);
        await incrementAiUsage(env,token,user.id);
        const text=await finalReply(env,message,{plan:pl,execution:executed,entitlement:access});
        return json({text,action:executed.action,result:executed.result},200,headers);
      }catch(err){
        return json({error:err?.message||"Error del agente",detail:err?.details||null},err?.status||500,headers);
      }
    }
    if(url.pathname.startsWith("/api/"))return json({error:"Ruta no encontrada"},404,headers);
    return env.ASSETS.fetch(request);
  }
};
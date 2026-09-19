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
  url.searchParams.set("order","created_at.desc");
  url.searchParams.set("limit","20");
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

function deterministicIntent(message){
  const s=String(message||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
  if(/\b(revisa|revisar|ver|muestra|muestreme|mostrar|consulta|consultar|que|cuanto|cuantos|cual|cuales)\b/.test(s) &&
     /\binventario\b|\bstock\b|\bproductos\b/.test(s) &&
     !/\b(agrega|agregar|ingresa|ingresar|suma|sumar|resta|restar|ajusta|ajustar|crea|crear|registra|registrar)\b/.test(s)){
    const cleaned=s.replace(/\binventario\b/g," ").replace(/\bmi\b/g," ").replace(/\bmis\b/g," ").replace(/\brevisa\b/g," ").replace(/\brevisar\b/g," ").replace(/\bque productos tengo\b/g," ").replace(/\bproductos\b/g," ").trim();
    return {action:"SEARCH_INVENTORY",execute:false,params:{query:""}};
  }
  if(/\b(que|cuales|muestra|mostrar|listar|lista|revisa|revisar)\b/.test(s) && /\bcotizaciones?\b|\bproformas?\b/.test(s)){
    return {action:"LIST_QUOTES",execute:false,params:{}};
  }
  if(/\b(busca|buscar|muestra|mostrar|consulta|consultar|revisa|revisar)\b/.test(s) && /\b(cliente|clientes)\b/.test(s)){
    const q=s.replace(/.*\b(cliente|clientes)\b\s*/,"").trim();
    return {action:"SEARCH_CLIENTS",execute:false,params:{query:q}};
  }
  return null;
}

async function plan(env,message,history){
  const deterministic=deterministicIntent(message);
  if(deterministic)return deterministic;
  const context=history.map(x=>x.role+":"+x.content).join("\n").slice(-6000);
  const prompt={messages:[
    {role:"system",content:'Eres el enrutador de M.A.R.C. Devuelve SOLO JSON válido, sin markdown ni explicación. Convierte lenguaje natural en una sola acción segura. Acciones: SEARCH_CLIENTS, SEARCH_INVENTORY, LIST_QUOTES, CREATE_CLIENT, CREATE_QUOTE, ADJUST_INVENTORY, CHAT. Para cualquier consulta, pregunta o solicitud de revisar, usa una acción de consulta. Solo usa execute=true para una operación que el usuario pidió explícitamente ejecutar. Nunca inventes IDs, precios, stock, clientes o productos. Para CREATE_QUOTE: items es un arreglo. Producto {type:"PRODUCTO",inventory_query:"texto",quantity:number,unit_price:number|null}; Trabajo {type:"TRABAJO",name:"texto",quantity:number,unit_price:number|null}. Para ADJUST_INVENTORY type es ENTRADA, SALIDA o AJUSTE. Formato: {"action":"CHAT","execute":false,"params":{}}'},
    ...(context?[{role:"user",content:"Historial reciente:\n"+context}]:[]),
    {role:"user",content:message}
  ]};
  const out=await env.AI.run(env.MARC_AI_MODEL||SYSTEM_MODEL,prompt);
  try{return extractJson(out?.response)}catch{return {action:"CHAT",execute:false,params:{}}}
}

async function executePlan(env,token,user,pl,source="AI_AGENT"){
  const action=String(pl?.action||"CHAT").toUpperCase(),p=pl?.params||{};
  if(action==="SEARCH_CLIENTS")return {action,result:await searchClients(env,token,user.id,p.query||"")};
  if(action==="SEARCH_INVENTORY")return {action,result:await searchInventory(env,token,user.id,p.query||"")};
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
  if(execution?.action==="SEARCH_INVENTORY" && Array.isArray(result)){
    if(!result.length)return "No tienes productos registrados en el inventario todavía.";
    const lines=result.slice(0,8).map(x=>{
      const stock=Number(x.stock||0),min=Number(x.min_stock||0);
      const estado=stock<=0?"AGOTADO":stock<=min?"STOCK BAJO":"DISPONIBLE";
      return "• "+String(x.name||"Producto")+" — stock: "+stock+" — "+estado;
    });
    return "Tu inventario actual es:\n\n"+lines.join("\n")+"\n\nTotal mostrados: "+Math.min(result.length,8)+".";
  }
  if(execution?.action==="LIST_QUOTES" && Array.isArray(result)){
    if(!result.length)return "No tienes cotizaciones registradas todavía.";
    return "Cotizaciones recientes:\n\n"+result.slice(0,8).map(x=>"• "+String(x.number||"Sin número")+" — "+String(x.title||"Cotización")+" — S/ "+Number(x.total||0).toFixed(2)+" — "+String(x.status||"BORRADOR")).join("\n");
  }
  const prompt={messages:[
    {role:"system",content:'Eres M.A.R.C., copiloto operativo. Responde en español claro, profesional y breve. Usa exclusivamente los datos de RESULTADO. No inventes nada. Si status=NEEDS_INPUT, pregunta exactamente por el dato faltante. Si status=AMBIGUOUS, presenta las opciones y pide elegir. Si status=CREATED o UPDATED, confirma la operación con los datos entregados. Si es una consulta, muestra los resultados útiles. No hables del plan, rol, suscripción o estado de ejecución salvo que la solicitud trate sobre ello. No describas herramientas internas ni digas que eres un modelo.'},
    {role:"user",content:"SOLICITUD:\n"+message+"\n\nRESULTADO:\n"+normalizeData(planData)}
  ]};
  const out=await env.AI.run(env.MARC_AI_MODEL||SYSTEM_MODEL,{...prompt,max_tokens:700,temperature:.15});
  return out?.response||"Listo.";
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
  const chatId=String(msg.chat.id),externalUserId=String(msg.from.id),incoming=String(msg.text||"").trim();
  if(incoming.startsWith("/start")){
    const param=incoming.split(/\s+/,2)[1]||"";
    const job=telegramLinkFromStart(env,adminToken,update,param).catch(async()=>{
      await sendTelegram(env,chatId,"⚠️ Recibí tu solicitud, pero no pude completar la vinculación todavía. Vuelve a M.A.R.C. y genera un nuevo enlace en Configuración > Telegram.");
    });
    if(ctx?.waitUntil)ctx.waitUntil(job);
    else await job;
    return json({ok:true},200);
  }
  const identity=await telegramIdentity(env,adminToken,externalUserId);
  if(!identity){
    const origin=new URL(request.url).origin;
    await sendTelegram(env,chatId,"🔗 Primero conecta este Telegram con tu cuenta M.A.R.C.\n\nAbre "+origin+" y entra en Configuración > Conectar Telegram.");
    return json({ok:true},200);
  }
  await sb(env,adminToken,"marc_channel_identities?id=eq."+encodeURIComponent(identity.id)+"&user_id=eq."+encodeURIComponent(identity.user_id),{method:"PATCH",body:{last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()}}).catch(()=>{});
  const userId=identity.user_id;
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
  if(!incoming){await sendTelegram(env,chatId,"Escríbeme una operación o una pregunta. Por ejemplo: «revisa mi inventario» o «crea una cotización»." );return json({ok:true},200);}
  const conversationId=await ensureTelegramConversation(env,adminToken,userId);
  await sb(env,adminToken,"marc_messages",{method:"POST",body:{conversation_id:conversationId,user_id:userId,role:"USER",content:incoming,action_type:"TELEGRAM",action_payload:{telegram_update_id:update.update_id,telegram_user_id:externalUserId}}});
  const history=await recentMessages(env,adminToken,userId,conversationId);
  const pl=await plan(env,incoming,history);
  const executed=await executePlan(env,adminToken,{id:userId},pl,"TELEGRAM");
  await incrementAiUsage(env,adminToken,userId,access);
  const answer=await finalReply(env,incoming,{plan:pl,execution:executed,entitlement:access});
  await sb(env,adminToken,"marc_messages",{method:"POST",body:{conversation_id:conversationId,user_id:userId,role:"ASSISTANT",content:answer,action_type:executed.action,action_payload:{channel:"TELEGRAM",result:executed.result||null}}});
  await sb(env,adminToken,"marc_conversations?id=eq."+encodeURIComponent(conversationId)+"&user_id=eq."+encodeURIComponent(userId),{method:"PATCH",body:{updated_at:new Date().toISOString()}}).catch(()=>{});
  await sendTelegram(env,chatId,answer);
  return json({ok:true},200);
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
    return env.ASSETS.fetch(request);
  }
};
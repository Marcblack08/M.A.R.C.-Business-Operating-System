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
        const entityContext=body?.entityContext||{};
        const pl=await plan(env,message,history,entityContext,token,user.id);
        const executed=await executePlan(env,token,user,pl,"AI_AGENT");
        await incrementAiUsage(env,token,user.id,access);
        const webDisplayName=[user?.user_metadata?.full_name,user?.user_metadata?.name,user?.email?.split("@")[0]].find(x=>String(x||"").trim())||"";
        const text=await finalReply(env,message,{plan:pl,execution:executed,entitlement:access},webDisplayName);
        return json({text,action:executed.action,result:executed.result},200,headers);
      }catch(err){
        return json({error:err?.message||"Error del agente",detail:err?.details||null},err?.status||500,headers);
      }
    }
    if(url.pathname==="/api/telegram/webhook"){
      try{return await telegramWebhook(request,env,ctx)}catch(err){
        return json({error:err?.message||"Error del webhook",detail:err?.details||null},err?.status||500);
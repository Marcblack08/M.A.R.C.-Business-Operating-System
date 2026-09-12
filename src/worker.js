function parseObject(value) {
  if (value && typeof value === "object") return value;
  const text = String(value || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) try { return JSON.parse(match[0]); } catch {}
  return {};
}

function parseLabeledText(value) {
  const text = String(value || "").replace(/\r/g, "").trim();
  if (!text) return {};
  const out = {};
  const aliases = {
    codigo: "codigo", "código": "codigo", sku: "codigo",
    nombre: "nombre", producto: "nombre", servicio: "nombre",
    marca: "marca", modelo: "modelo",
    categoria: "categoria", "categoría": "categoria", tipo: "tipo",
    descripcion: "descripcion", "descripción": "descripcion",
    precio_compra: "precio_compra", "precio compra": "precio_compra", "precio de compra": "precio_compra",
    precio_venta: "precio_venta", "precio venta": "precio_venta", "precio de venta": "precio_venta",
    precio: "precio", unidad: "unidad"
  };
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*[-*•]?\s*([^:]+)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const key = aliases[m[1].trim().toLowerCase()];
    if (key && m[2].trim()) out[key] = m[2].trim();
  }
  return out;
}

function normalizeData(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (value.result && typeof value.result === "object") return normalizeData(value.result);
    if (value.response && typeof value.response === "object") return normalizeData(value.response);
    if (value.answer && typeof value.answer === "object") return normalizeData(value.answer);
    if (typeof value.response === "string") return { ...parseObject(value.response), ...parseLabeledText(value.response) };
    if (typeof value.answer === "string") return { ...parseObject(value.answer), ...parseLabeledText(value.answer) };
    return value;
  }
  const parsed = parseObject(value);
  return { ...parsed, ...parseLabeledText(value) };
}

function usefulFields(data) {
  const keys = ["codigo", "nombre", "marca", "modelo", "categoria", "descripcion", "precio_compra", "precio_venta"];
  return keys.filter(k => data?.[k] !== null && data?.[k] !== undefined && String(data[k]).trim() !== "").length;
}

const PRODUCT_SCHEMA = {
  type: "object",
  properties: {
    codigo: { type: "string" }, nombre: { type: "string" }, marca: { type: "string" }, modelo: { type: "string" }, categoria: { type: "string" }, descripcion: { type: "string" }, precio_compra: { type: "string" }, precio_venta: { type: "string" }
  },
  required: ["codigo", "nombre", "marca", "modelo", "categoria", "descripcion", "precio_compra", "precio_venta"]
};

const OCR_PROMPT = `Analiza la imagen del producto como un especialista en OCR e inventario. Lee cuidadosamente toda etiqueta, caja, sticker o texto visible. Prioriza códigos, modelo, marca y texto técnico. No inventes datos. Si un campo no aparece devuelve cadena vacía. Conserva exactamente letras, números, guiones y puntos. Devuelve solamente: codigo, nombre, marca, modelo, categoria, descripcion, precio_compra, precio_venta.`;

const SERVICE_SCHEMA = {
  type: "object",
  properties: {
    tipo: { type: "string" }, nombre: { type: "string" }, descripcion: { type: "string" }, unidad: { type: "string" }, precio: { type: "number" }
  },
  required: ["tipo", "nombre", "descripcion", "unidad", "precio"]
};

const SERVICE_PROMPT = `Convierte la descripción hablada de un servicio empresarial en datos estructurados. Responde SOLO JSON. No inventes precios: si no se menciona, usa 0. El tipo debe ser exactamente uno de CCTV, COMPUTACION, REDES, MANTENIMIENTO, INSTALACION, SOPORTE u OTROS. La unidad debe ser SERVICIO, HORA, VISITA, INSTALACION o MANTENIMIENTO. Genera un nombre profesional y una descripción breve basada únicamente en lo dicho. Campos: tipo, nombre, descripcion, unidad, precio.`;

async function analyzeServiceWithAI(env, text) {
  const messages = [
    { role: "system", content: "Eres M.A.R.C., especialista en catalogación de servicios empresariales. Responde únicamente con los campos solicitados." },
    { role: "user", content: `${SERVICE_PROMPT}\n\nDescripción hablada:\n${text}` }
  ];
  let firstError = null;
  try {
    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages,
      max_tokens: 400,
      temperature: 0,
      response_format: { type: "json_schema", json_schema: SERVICE_SCHEMA }
    });
    const data = normalizeData(result?.response || result);
    if (data && (data.nombre || data.descripcion || data.tipo)) return data;
    firstError = new Error("La IA devolvió una respuesta vacía.");
  } catch (error) {
    firstError = error;
  }
  try {
    const fallback = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [
        { role: "system", content: "Eres M.A.R.C. Devuelve SOLO un JSON válido, sin markdown ni explicaciones." },
        { role: "user", content: `${SERVICE_PROMPT}\nUsa exactamente este formato: {"tipo":"CCTV","nombre":"","descripcion":"","unidad":"SERVICIO","precio":0}\nDescripción hablada: ${text}` }
      ],
      max_tokens: 300,
      temperature: 0
    });
    const data = normalizeData(fallback?.response || fallback);
    if (data && (data.nombre || data.descripcion || data.tipo)) return data;
    throw new Error("La IA no devolvió datos utilizables.");
  } catch (fallbackError) {
    throw new Error(`IA no disponible: ${String(firstError?.message || firstError || fallbackError?.message || fallbackError)}`);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/analyze-product" && request.method === "POST") {
      if (!env.AI) return Response.json({ error: "Workers AI no está conectado en Cloudflare." }, { status: 503 });
      try {
        const body = await request.json();
        const rawImage = typeof body?.image === "string" ? body.image.trim() : "";
        if (!rawImage) return Response.json({ error: "Falta la imagen del producto." }, { status: 400 });
        const base64 = rawImage.startsWith("data:") ? (rawImage.split(",", 2)[1] || "") : rawImage;
        const image = rawImage.startsWith("data:image/") ? rawImage : `data:image/jpeg;base64,${base64}`;
        if (!base64) return Response.json({ error: "La imagen no contiene datos válidos." }, { status: 400 });
        if (base64.length > 10_000_000) return Response.json({ error: "La imagen es demasiado grande. Usa una foto más pequeña." }, { status: 413 });
        let data = {}, used = "llama-vision", errors = [];
        try {
          try { await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", { prompt: "agree" }); } catch (agreementError) { const msg=String(agreementError?.message||agreementError); if(!/already|agreed|agreement|terms/i.test(msg)) throw agreementError; }
          const vision = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", { messages:[{role:"system",content:"Eres un extractor OCR profesional. Analiza exclusivamente la información visible. No adivines."},{role:"user",content:OCR_PROMPT}], image, max_tokens:700, temperature:0, stream:false, response_format:{type:"json_schema",json_schema:PRODUCT_SCHEMA} });
          data=normalizeData(vision?.response||vision?.result?.response||vision);
        } catch(e){errors.push(`Llama Vision: ${String(e?.message||e)}`);}
        if(usefulFields(data)<2){used="moondream";try{const fast=await env.AI.run("@cf/moondream/moondream3.1-9B-A2B",{task:"query",image,question:`${OCR_PROMPT} Responde: codigo: ; nombre: ; marca: ; modelo: ; categoria: ; descripcion: ; precio_compra: ; precio_venta:`,reasoning:false,temperature:0,max_tokens:700,stream:false});const candidate=normalizeData(fast?.answer||fast?.response||fast);if(usefulFields(candidate)>usefulFields(data))data=candidate;}catch(e){errors.push(`Moondream: ${String(e?.message||e)}`);}}
        const count=usefulFields(data);if(count===0)return Response.json({error:"La IA no pudo leer datos de esta foto.",detail:errors.join(" | ")||"Los modelos de visión no devolvieron campos legibles.",fields:0,model:used},{status:422});
        return Response.json({text:JSON.stringify(data),fields:count,model:used});
      } catch(error){return Response.json({error:"No se pudo analizar la imagen.",detail:String(error?.message||error)},{status:500});}
    }

    if (url.pathname === "/api/analyze-service" && request.method === "POST") {
      if (!env.AI) return Response.json({ error: "Workers AI no está conectado en Cloudflare." }, { status: 503 });
      try {
        const body = await request.json();
        const text = typeof body?.text === "string" ? body.text.trim() : "";
        if (!text) return Response.json({ error: "Falta la descripción del servicio." }, { status: 400 });
        const data = await analyzeServiceWithAI(env, text);
        const normalized = {
          tipo: ["CCTV","COMPUTACION","REDES","MANTENIMIENTO","INSTALACION","SOPORTE","OTROS"].includes(String(data.tipo||"")) ? String(data.tipo) : "OTROS",
          nombre: String(data.nombre||"").trim(),
          descripcion: String(data.descripcion||"").trim(),
          unidad: ["SERVICIO","HORA","VISITA","INSTALACION","MANTENIMIENTO"].includes(String(data.unidad||"")) ? String(data.unidad) : "SERVICIO",
          precio: Number(data.precio)||0
        };
        return Response.json({ data: normalized });
      } catch(error){return Response.json({error:"No se pudo analizar el servicio con IA.",detail:String(error?.message||error)},{status:500});}
    }

    if (url.pathname === "/api/ai" && request.method === "POST") {
      if (!env.AI) return Response.json({ error: "La IA de Cloudflare todavía no está conectada." }, { status: 503 });
      try {
        const body=await request.json(); const message=typeof body?.message==="string"?body.message.trim():"";
        if(!message)return Response.json({error:"Falta el mensaje."},{status:400});
        const result=await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast",{messages:[{role:"system",content:"Eres M.A.R.C., el asistente inteligente de un sistema operativo empresarial. Responde en español de forma clara, profesional y práctica."},{role:"user",content:message}],max_tokens:700});
        return Response.json({text:result?.response||"No pude generar una respuesta."});
      } catch(error){return Response.json({error:"No se pudo procesar la solicitud de IA.",detail:String(error?.message||error)},{status:500});}
    }
    return env.ASSETS.fetch(request);
  }
};
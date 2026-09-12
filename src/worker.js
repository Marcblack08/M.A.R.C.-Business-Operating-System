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
    if (value.response && typeof value.response === "string") return { ...parseObject(value.response), ...parseLabeledText(value.response) };
    if (value.answer && typeof value.answer === "string") return { ...parseObject(value.answer), ...parseLabeledText(value.answer) };
    if (value.choices?.[0]?.message?.content) return normalizeData(value.choices[0].message.content);
    return value;
  }
  return { ...parseObject(value), ...parseLabeledText(value) };
}

function usefulFields(data) {
  return ["codigo", "nombre", "marca", "modelo", "categoria", "descripcion", "precio_compra", "precio_venta"]
    .filter(k => data?.[k] !== null && data?.[k] !== undefined && String(data[k]).trim() !== "").length;
}

const PRODUCT_SCHEMA = {
  type: "object",
  properties: {
    codigo: { type: "string" }, nombre: { type: "string" }, marca: { type: "string" },
    modelo: { type: "string" }, categoria: { type: "string" }, descripcion: { type: "string" },
    precio_compra: { type: "string" }, precio_venta: { type: "string" }
  },
  required: ["codigo", "nombre", "marca", "modelo", "categoria", "descripcion", "precio_compra", "precio_venta"]
};

const SERVICE_SCHEMA = {
  type: "object",
  properties: { tipo: { type: "string" }, nombre: { type: "string" }, descripcion: { type: "string" }, unidad: { type: "string" }, precio: { type: "number" } },
  required: ["tipo", "nombre", "descripcion", "unidad", "precio"]
};

const CATALOG_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          codigo: { type: "string" }, nombre: { type: "string" }, marca: { type: "string" }, modelo: { type: "string" },
          categoria: { type: "string" }, descripcion: { type: "string" }, precio_compra: { type: "number" }, precio_venta: { type: "number" }, unidad: { type: "string" }
        },
        required: ["codigo", "nombre", "marca", "modelo", "categoria", "descripcion", "precio_compra", "precio_venta", "unidad"]
      }
    }
  },
  required: ["items"]
};

const SERVICE_PROMPT = `Convierte la descripción hablada de un servicio empresarial en datos estructurados. Responde SOLO JSON. No inventes precios: si no se menciona, usa 0. El tipo debe ser exactamente uno de CCTV, COMPUTACION, REDES, MANTENIMIENTO, INSTALACION, SOPORTE u OTROS. La unidad debe ser SERVICIO, HORA, VISITA, INSTALACION o MANTENIMIENTO. Genera un nombre profesional y una descripción breve basada únicamente en lo dicho. Campos: tipo, nombre, descripcion, unidad, precio.`;
const CATALOG_PROMPT = `Eres un extractor profesional de catálogos técnicos. Analiza el contenido visible de la página y encuentra TODOS los productos claramente identificables. No inventes información. Conserva exactamente códigos, SKU, referencias y modelos. Si falta un dato usa cadena vacía y precios ausentes deben ser 0. No conviertas números de especificaciones en precios. Ignora índices, títulos generales y texto repetido. Devuelve SOLO JSON con items. Campos: codigo,nombre,marca,modelo,categoria,descripcion,precio_compra,precio_venta,unidad.`;

async function analyzeServiceWithAI(env, text) {
  const messages = [
    { role: "system", content: "Eres M.A.R.C., especialista en catalogación de servicios empresariales. Responde únicamente con los campos solicitados." },
    { role: "user", content: `${SERVICE_PROMPT}\n\nDescripción hablada:\n${text}` }
  ];
  let firstError = null;
  try {
    const r = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", { messages, max_tokens: 400, temperature: 0, response_format: { type: "json_schema", json_schema: SERVICE_SCHEMA } });
    const d = normalizeData(r?.response || r);
    if (d && (d.nombre || d.descripcion || d.tipo)) return d;
    firstError = new Error("La IA devolvió una respuesta vacía.");
  } catch (e) { firstError = e; }
  try {
    const r = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [{ role: "system", content: "Eres M.A.R.C. Devuelve SOLO un JSON válido, sin markdown ni explicaciones." }, { role: "user", content: `${SERVICE_PROMPT}\nUsa exactamente este formato: {"tipo":"CCTV","nombre":"","descripcion":"","unidad":"SERVICIO","precio":0}\nDescripción hablada: ${text}` }],
      max_tokens: 300, temperature: 0
    });
    const d = normalizeData(r?.response || r);
    if (d && (d.nombre || d.descripcion || d.tipo)) return d;
    throw new Error("La IA no devolvió datos utilizables.");
  } catch (e2) { throw new Error(`IA no disponible: ${String(firstError?.message || firstError || e2?.message || e2)}`); }
}

async function analyzeCatalogWithAI(env, text) {
  let first = null;
  try {
    const r = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [{ role: "system", content: "Eres M.A.R.C., especialista en extracción de catálogos para inventario empresarial." }, { role: "user", content: `${CATALOG_PROMPT}\n\nContenido de página:\n${text}` }],
      max_tokens: 1800, temperature: 0, response_format: { type: "json_schema", json_schema: CATALOG_SCHEMA }
    });
    const d = normalizeData(r?.response || r);
    if (Array.isArray(d.items)) return d.items;
    first = new Error("La IA no devolvió items.");
  } catch (e) { first = e; }
  try {
    const r = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [{ role: "system", content: "Devuelve SOLO JSON válido." }, { role: "user", content: `${CATALOG_PROMPT}\nFormato: {"items":[]}\nContenido:\n${text}` }],
      max_tokens: 1800, temperature: 0
    });
    const d = normalizeData(r?.response || r);
    if (Array.isArray(d.items)) return d.items;
    throw first || new Error("Sin items");
  } catch (e2) { throw new Error(`No se pudo analizar el catálogo: ${String(e2?.message || e2)}`); }
}

function cleanItem(x) {
  return {
    codigo: String(x?.codigo || "").trim(), nombre: String(x?.nombre || "").trim(), marca: String(x?.marca || "").trim(),
    modelo: String(x?.modelo || "").trim(), categoria: String(x?.categoria || "").trim(), descripcion: String(x?.descripcion || "").trim(),
    precio_compra: Number(x?.precio_compra) || 0, precio_venta: Number(x?.precio_venta) || 0, unidad: String(x?.unidad || "UND").trim() || "UND"
  };
}

function imageFromBody(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (value.startsWith("data:image/")) return value;
  return `data:image/jpeg;base64,${value.startsWith("data:") ? (value.split(",", 2)[1] || "") : value}`;
}

async function analyzeCatalogVisionWithGemma(env, image) {
  const system = `Eres M.A.R.C., un extractor profesional de catálogos técnicos. Tu trabajo es LEER VISUALMENTE una página de catálogo, no describirla.
Encuentra TODOS los productos que aparezcan en la página. Una página puede contener muchos productos, filas de una tabla o varias tarjetas.
Para cada producto extrae: codigo/SKU/referencia, nombre, marca, modelo, categoria, descripcion, precio_compra, precio_venta y unidad.
REGLAS: conserva exactamente códigos y modelos; no inventes datos; si un campo no está visible usa cadena vacía y los precios ausentes usan 0; no conviertas números de especificaciones en precios; ignora índices, títulos, encabezados y texto que no corresponda a un producto.
Responde ÚNICAMENTE JSON válido con esta forma: {"items":[{"codigo":"","nombre":"","marca":"","modelo":"","categoria":"","descripcion":"","precio_compra":0,"precio_venta":0,"unidad":"UND"}]}.
Es preferible devolver muchos productos correctamente identificados antes que resumir la página.`;
  const userContent = [
    { type: "text", text: "Lee esta página completa. Detecta todos los productos visibles, incluyendo los de tablas y bloques pequeños. No te detengas en el primer producto." },
    { type: "image_url", image_url: { url: image } }
  ];
  const r = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
    messages: [{ role: "system", content: system }, { role: "user", content: userContent }],
    max_completion_tokens: 4500,
    temperature: 0,
    stream: false,
    chat_template_kwargs: { enable_thinking: false }
  });
  const d = normalizeData(r?.response || r);
  if (Array.isArray(d.items)) return d.items;
  throw new Error("Gemma no devolvió una lista de productos.");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/analyze-product" && request.method === "POST") {
      if (!env.AI) return Response.json({ error: "Workers AI no está conectado en Cloudflare." }, { status: 503 });
      try {
        const body = await request.json();
        const raw = typeof body?.image === "string" ? body.image.trim() : "";
        if (!raw) return Response.json({ error: "Falta la imagen del producto." }, { status: 400 });
        const base64 = raw.startsWith("data:") ? (raw.split(",", 2)[1] || "") : raw;
        const image = raw.startsWith("data:image/") ? raw : `data:image/jpeg;base64,${base64}`;
        if (!base64) return Response.json({ error: "La imagen no contiene datos válidos." }, { status: 400 });
        if (base64.length > 10_000_000) return Response.json({ error: "La imagen es demasiado grande." }, { status: 413 });
        let data = {}, used = "llama-vision", errors = [];
        try {
          try { await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", { prompt: "agree" }); } catch (a) { const m = String(a?.message || a); if (!/already|agreed|agreement|terms/i.test(m)) throw a; }
          const v = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", { messages: [{ role: "system", content: "Eres un extractor OCR profesional. Analiza exclusivamente la información visible. No adivines." }, { role: "user", content: "Lee toda la etiqueta y devuelve codigo, nombre, marca, modelo, categoria, descripcion, precio_compra y precio_venta." }], image, max_tokens: 700, temperature: 0, stream: false, response_format: { type: "json_schema", json_schema: PRODUCT_SCHEMA } });
          data = normalizeData(v?.response || v?.result?.response || v);
        } catch (e) { errors.push(String(e?.message || e)); }
        if (usefulFields(data) < 2) {
          used = "moondream";
          try {
            const m = await env.AI.run("@cf/moondream/moondream3.1-9B-A2B", { task: "query", image, question: "Lee el producto. Responde: codigo: ; nombre: ; marca: ; modelo: ; categoria: ; descripcion: ; precio_compra: ; precio_venta:", reasoning: false, temperature: 0, max_tokens: 700, stream: false });
            const d = normalizeData(m?.answer || m?.response || m);
            if (usefulFields(d) > usefulFields(data)) data = d;
          } catch (e) { errors.push(String(e?.message || e)); }
        }
        const count = usefulFields(data);
        if (!count) return Response.json({ error: "La IA no pudo leer datos de esta foto.", detail: errors.join(" | "), fields: 0, model: used }, { status: 422 });
        return Response.json({ text: JSON.stringify(data), fields: count, model: used });
      } catch (e) { return Response.json({ error: "No se pudo analizar la imagen.", detail: String(e?.message || e) }, { status: 500 }); }
    }

    if (url.pathname === "/api/analyze-service" && request.method === "POST") {
      if (!env.AI) return Response.json({ error: "Workers AI no está conectado en Cloudflare." }, { status: 503 });
      try {
        const body = await request.json();
        const text = typeof body?.text === "string" ? body.text.trim() : "";
        if (!text) return Response.json({ error: "Falta la descripción del servicio." }, { status: 400 });
        const d = await analyzeServiceWithAI(env, text);
        return Response.json({ data: { tipo: ["CCTV", "COMPUTACION", "REDES", "MANTENIMIENTO", "INSTALACION", "SOPORTE", "OTROS"].includes(String(d.tipo || "")) ? String(d.tipo) : "OTROS", nombre: String(d.nombre || "").trim(), descripcion: String(d.descripcion || "").trim(), unidad: ["SERVICIO", "HORA", "VISITA", "INSTALACION", "MANTENIMIENTO"].includes(String(d.unidad || "")) ? String(d.unidad) : "SERVICIO", precio: Number(d.precio) || 0 } });
      } catch (e) { return Response.json({ error: "No se pudo analizar el servicio con IA.", detail: String(e?.message || e) }, { status: 500 }); }
    }

    if (url.pathname === "/api/analyze-catalog" && request.method === "POST") {
      if (!env.AI) return Response.json({ error: "Workers AI no está conectado en Cloudflare." }, { status: 503 });
      try {
        const body = await request.json();
        const text = typeof body?.text === "string" ? body.text.trim() : "";
        if (!text) return Response.json({ error: "Falta el texto del catálogo." }, { status: 400 });
        if (text.length > 18000) return Response.json({ error: "Bloque demasiado grande." }, { status: 413 });
        const items = await analyzeCatalogWithAI(env, text);
        return Response.json({ items: items.map(cleanItem) });
      } catch (e) { return Response.json({ error: "No se pudo analizar el catálogo.", detail: String(e?.message || e) }, { status: 500 }); }
    }

    if (url.pathname === "/api/analyze-catalog-vision" && request.method === "POST") {
      if (!env.AI) return Response.json({ error: "Workers AI no está conectado en Cloudflare." }, { status: 503 });
      try {
        const body = await request.json();
        const raw = typeof body?.image === "string" ? body.image.trim() : "";
        if (!raw) return Response.json({ error: "Falta la imagen de la página." }, { status: 400 });
        const base64 = raw.startsWith("data:") ? (raw.split(",", 2)[1] || "") : raw;
        const image = raw.startsWith("data:image/") ? raw : `data:image/jpeg;base64,${base64}`;
        if (base64.length > 7_500_000) return Response.json({ error: "La imagen de la página es demasiado grande." }, { status: 413 });
        const items = await analyzeCatalogVisionWithGemma(env, image);
        return Response.json({ items: items.map(cleanItem), model: "gemma-4-26b-a4b-it" });
      } catch (e) { return Response.json({ error: "Gemma no pudo leer esta página.", detail: String(e?.message || e) }, { status: 422 }); }
    }

    if (url.pathname === "/api/analyze-catalog-page" && request.method === "POST") {
      if (!env.AI) return Response.json({ error: "Workers AI no está conectado en Cloudflare." }, { status: 503 });
      try {
        const body = await request.json();
        const raw = typeof body?.image === "string" ? body.image.trim() : "";
        if (!raw) return Response.json({ error: "Falta la imagen de la página." }, { status: 400 });
        const base64 = raw.startsWith("data:") ? (raw.split(",", 2)[1] || "") : raw;
        const image = raw.startsWith("data:image/") ? raw : `data:image/jpeg;base64,${base64}`;
        if (base64.length > 8_000_000) return Response.json({ error: "La imagen de la página es demasiado grande." }, { status: 413 });
        const items = await analyzeCatalogVisionWithGemma(env, image);
        return Response.json({ items: items.map(cleanItem), model: "gemma-4-26b-a4b-it" });
      } catch (e) { return Response.json({ error: "No se pudo analizar la página del catálogo.", detail: String(e?.message || e) }, { status: 422 }); }
    }

    if (url.pathname === "/api/ai" && request.method === "POST") {
      if (!env.AI) return Response.json({ error: "La IA de Cloudflare todavía no está conectada." }, { status: 503 });
      try {
        const body = await request.json();
        const message = typeof body?.message === "string" ? body.message.trim() : "";
        if (!message) return Response.json({ error: "Falta el mensaje." }, { status: 400 });
        const r = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", { messages: [{ role: "system", content: "Eres M.A.R.C., el asistente inteligente de un sistema operativo empresarial. Responde en español de forma clara, profesional y práctica." }, { role: "user", content: message }], max_tokens: 700 });
        return Response.json({ text: r?.response || "No pude generar una respuesta." });
      } catch (e) { return Response.json({ error: "No se pudo procesar la solicitud de IA.", detail: String(e?.message || e) }, { status: 500 }); }
    }

    return env.ASSETS.fetch(request);
  }
};

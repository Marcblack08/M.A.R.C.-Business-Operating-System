/* M.A.R.C. — Rescate de extracción de catálogos
   Si el extractor estructurado devuelve 0 productos, divide el bloque y usa la IA general como segundo extractor. */
(function(){
  const originalFetch=window.fetch.bind(window);
  const parseItems=value=>{
    const text=String(value||'').trim().replace(/^```(?:json)?/i,'').replace(/```$/i,'').trim();
    const candidates=[text,(text.match(/\{[\s\S]*\}/)||[])[0],(text.match(/\[[\s\S]*\]/)||[])[0]].filter(Boolean);
    for(const raw of candidates){
      try{const d=JSON.parse(raw);if(Array.isArray(d))return d;if(Array.isArray(d.items))return d.items;}catch{}
    }
    return [];
  };
  const clean=x=>({
    codigo:String(x?.codigo||x?.código||x?.sku||'').trim(),
    nombre:String(x?.nombre||x?.producto||'').trim(),
    marca:String(x?.marca||'').trim(),
    modelo:String(x?.modelo||'').trim(),
    categoria:String(x?.categoria||x?.categoría||'').trim(),
    descripcion:String(x?.descripcion||x?.descripción||'').trim(),
    precio_compra:Number(String(x?.precio_compra??x?.precioCompra??0).replace(',','.').replace(/[^0-9.-]/g,''))||0,
    precio_venta:Number(String(x?.precio_venta??x?.precioVenta??x?.precio??0).replace(',','.').replace(/[^0-9.-]/g,''))||0,
    unidad:String(x?.unidad||'UND').trim()||'UND'
  });
  async function fallback(text,tipo){
    const pieces=[];
    for(let p=0;p<text.length;p+=2800)pieces.push(text.slice(p,p+2800));
    const all=[];
    for(let i=0;i<pieces.length;i++){
      const prompt=`Eres M.A.R.C., extractor profesional de productos de catálogos. Analiza ESTE BLOQUE de texto y encuentra TODOS los productos claramente identificables. NO inventes productos. Conserva exactamente código/SKU, marca y modelo. Los números de especificaciones no son precios. Si un dato no aparece, usa cadena vacía y precio 0. Ignora títulos, índices y texto general. Devuelve SOLO JSON válido con esta forma: {"items":[{"codigo":"","nombre":"","marca":"","modelo":"","categoria":"","descripcion":"","precio_compra":0,"precio_venta":0,"unidad":"UND"}]}. No expliques nada. Catálogo: ${tipo||'PROVEEDOR'}\nBLOQUE ${i+1}/${pieces.length}:\n${pieces[i]}`;
      try{
        const r=await originalFetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:prompt})});
        const j=await r.json().catch(()=>({}));
        if(r.ok&&j.text)all.push(...parseItems(j.text).map(clean));
      }catch{}
    }
    return all;
  }
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:(input?.url||'');
    if(url.includes('/api/analyze-catalog')&&init?.method==='POST'){
      const response=await originalFetch(input,init);
      let data=null;
      try{data=await response.clone().json()}catch{}
      if(response.ok&&Array.isArray(data?.items)&&data.items.length)return response;
      let body={};
      try{body=JSON.parse(init.body||'{}')}catch{}
      const rescued=await fallback(String(body.text||''),body.tipo);
      if(rescued.length)return new Response(JSON.stringify({items:rescued}),{status:200,headers:{'Content-Type':'application/json'}});
      return response;
    }
    return originalFetch(input,init);
  };
})();

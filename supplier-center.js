    const normalized=detected.map((row,index)=>{
      const price=row.price??row.supplier_price??null;
      const cost=row.cost??row.supplier_cost??null;
      const name=cleanCatalogProductText(row.name||row.product||row.description||"");
      return {
        page_number:Number(row.page_number||row.source_metadata?.page||1),
        sku:row.sku?String(row.sku).trim():null,
        name:name.slice(0,180),
        description:String(row.description||row.name||"").slice(0,800)||null,
        brand:row.brand?String(row.brand).trim():null,
        model:row.model?String(row.model).trim():null,
        category:row.category?String(row.category).trim():null,
        unit:row.unit||"UND",
        supplier_cost:Number.isFinite(Number(cost))?Number(cost):null,
        supplier_price:Number.isFinite(Number(price))?Number(price):null,
        currency:row.currency||"PEN",
        stock_text:row.stock_text?String(row.stock_text):null,
        image_data_url:row.image_data_url||null,
        ai_confidence:Number(row.ai_confidence??0.9),
        source_metadata:Object.assign({},row.source_metadata||{},{
          page:Number(row.page_number||row.source_metadata?.page||1),
          reader:row.source_metadata?.reader||"INVENTARIO_COMPARTIDO",
          source_index:index
        })
      };
    }).filter(x=>x.name&&!isNoiseCatalogText(x.name));

    // El lector compartido de Inventario ya entrega las filas de productos consolidadas.
    // En Proveedores NO volvemos a agrupar por nombre: eso estaba convirtiendo
    // 136 productos leídos correctamente en solo 49 al fusionar variantes del
    // mismo nombre dentro de una misma página.
    // Cada fila detectada por el lector se conserva como un producto del catálogo.
    const result=normalized.slice(0,2000);
    if(!result.length){
      throw new Error("El PDF no contiene productos reconocibles.");
    }
    return result;
  }

  async function importCatalogItem(item,supplier=null){
    const S=sb(); const {data:{session}}=await S.auth.getSession(); let existing=null;
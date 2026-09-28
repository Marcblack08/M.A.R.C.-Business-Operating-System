(()=>{
  const Q = window.MARC?.supabase;
  const getState = ()=>window.st;
  const $ = (s,r=document)=>r.querySelector(s);
  const esc = v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const money = v=>new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(Number(v||0));

  if(!Q){
    console.error("[M.A.R.C. quotes] Supabase no disponible");
    return;
  }

  const quoteEditor = async (existing=null)=>{
    const st=getState();
    if(!st?.u)return;

    let clients=[], inventory=[], loadedItems=[];
    try{
      const [cr,ir]=await Promise.all([
        Q.from("marc_clients").select("id,name,document_number,phone").order("name"),
        Q.from("marc_inventory").select("id,name,sku,brand,model,unit,price,cost,stock,active").eq("active",true).order("name")
      ]);
      if(cr.error)throw cr.error;
      if(ir.error)throw ir.error;
      clients=cr.data||[];
      inventory=ir.data||[];
      if(existing?.id){
        const itemQuery=Q.from("marc_quote_items").select("id,inventory_id,item_type,name,description,quantity,unit,unit_price,cost,line_total,material_provider,transport_cost,labor_cost,other_cost").eq("quote_id",existing.id).order("created_at");
        const r=await itemQuery;
        if(r.error)throw r.error;
        loadedItems=r.data||[];
      }
    }catch(err){
      window.MARC?.toast?.(err.message||"No se pudieron cargar los datos de cotización.","err");
      return;
    }

    const root=$("#modal");
    if(!root)return;

    const items=loadedItems.map(x=>({
      id:x.id, type:x.item_type==="PRODUCTO"?"PRODUCTO":"TRABAJO",
      inventory_id:x.inventory_id||"", name:x.name||"", description:x.description||"",
      quantity:Number(x.quantity||1), unit:x.unit||"UND", unit_price:Number(x.unit_price||0),
      cost:Number(x.cost||0), material_provider:x.material_provider||"CLIENT",
      transport_cost:Number(x.transport_cost||0), labor_cost:Number(x.labor_cost||0), other_cost:Number(x.other_cost||0)
    }));

    if(!items.length)items.push({type:"PRODUCTO",inventory_id:"",name:"",description:"",quantity:1,unit:"UND",unit_price:0,cost:0,material_provider:"MARC",transport_cost:0,labor_cost:0,other_cost:0});

    const close=()=>{
      root.classList.remove("open");
      root.innerHTML="";
      document.body.classList.remove("modal-open");
    };

    root.innerHTML='<div class="modal marc-quote-editor-modal">'+
      '<div class="modal-head"><div><div class="eyebrow2">COTIZACIONES · '+(existing?"EDITAR":"NUEVA")+'</div><h2>'+(existing?"Editar cotización":"Nueva cotización")+'</h2><p>Prepara una propuesta completa con productos, trabajos, costos e IGV.</p></div><button class="close" id="quoteEditorClose" type="button">×</button></div>'+
      '<form id="marcQuoteEditorForm" class="marc-quote-editor">'+
        '<div class="quote-editor-main">'+
          '<section class="quote-editor-section"><div class="quote-editor-section-head"><div><b>Datos de la propuesta</b><small>Cliente, título y estado comercial.</small></div></div>'+
            '<div class="form-grid">'+
              '<label>Cliente<select id="qeClient" name="client_id"><option value="">Sin cliente</option>'+clients.map(c=>'<option value="'+c.id+'">'+esc(c.name)+(c.document_number?" · "+esc(c.document_number):"")+'</option>').join("")+'</select></label>'+
              '<label>Título<input id="qeTitle" name="title" required value="'+esc(existing?.title||"Cotización")+'" placeholder="Ej. Instalación de cámaras"></label>'+
              '<label>Estado<select id="qeStatus" name="status"><option>BORRADOR</option><option>ENVIADA</option><option>ACEPTADA</option><option>RECHAZADA</option><option>ANULADA</option><option>COBRADA</option></select></label>'+
              '<label class="quote-tax-toggle"><span>IGV</span><span><input id="qeTax" type="checkbox"> Aplicar IGV</span></label>'+
              '<label id="qeTaxRateWrap" class="hidden">Tasa IGV (%)<input id="qeTaxRate" type="number" min="0" max="100" step="0.01" value="'+Number(existing?.tax_rate||18)+'"></label>'+
            '</div>'+
          '</section>'+
          '<section class="quote-editor-section"><div class="quote-editor-section-head"><div><b>Partidas</b><small>Agrega productos del inventario o trabajos personalizados.</small></div><button type="button" class="secondary" id="qeAddItem">＋ Agregar partida</button></div>'+
            '<div id="qeItems"></div>'+
          '</section>'+
          '<section class="quote-editor-section"><div class="quote-editor-section-head"><div><b>Condiciones y notas</b><small>Información que quedará asociada a la cotización.</small></div></div><textarea id="qeNotes" rows="4" placeholder="Garantía, forma de pago, tiempo de entrega, observaciones…">'+esc(existing?.notes||"")+'</textarea></section>'+
        '</div>'+
        '<aside class="quote-editor-summary"><div class="quote-summary-sticky"><div class="eyebrow2">RESUMEN</div><div class="quote-summary-number">'+(existing?esc(existing.number):"Se asignará al guardar")+'</div><div class="quote-summary-lines"><div><span>Subtotal</span><b id="qeSubtotal">S/ 0.00</b></div><div><span>IGV</span><b id="qeTaxAmount">S/ 0.00</b></div><div class="total"><span>Total</span><strong id="qeTotal">S/ 0.00</strong></div></div><div class="quote-summary-actions"><button type="button" class="secondary" id="qeCancel">Cancelar</button><button type="submit" class="primary" id="qeSave">'+(existing?"Guardar cambios":"Crear cotización")+'</button></div><div id="qeMsg" class="msg"></div></div></aside>'+
      '</form>'+
    '</div>';

    root.classList.add("open");
    document.body.classList.add("modal-open");

    $("#qeClient").value=existing?.client_id||"";
    $("#qeStatus").value=existing?.status||"BORRADOR";
    $("#qeTax").checked=Boolean(existing?.tax_enabled);
    $("#qeTaxRateWrap").classList.toggle("hidden",!$("#qeTax").checked);

    const render=()=>{
      const box=$("#qeItems");
      box.innerHTML=items.map((x,i)=>{
        const selected=x.inventory_id||"";
        const isProduct=x.type==="PRODUCTO";
        return '<article class="qe-item" data-index="'+i+'">'+
          '<div class="qe-item-head"><div><b>Partida '+(i+1)+'</b><span>'+x.type+'</span></div><button type="button" class="danger qe-remove" data-index="'+i+'">Eliminar</button></div>'+
          '<div class="qe-item-grid">'+
            '<label>Tipo<select class="qe-field" data-field="type"><option value="PRODUCTO" '+(isProduct?"selected":"")+'>Producto</option><option value="TRABAJO" '+(!isProduct?"selected":"")+'>Trabajo / servicio</option></select></label>'+
            (isProduct?
              '<label>Producto<select class="qe-field" data-field="inventory_id"><option value="">Selecciona un producto…</option>'+inventory.map(p=>'<option value="'+p.id+'" '+(selected===p.id?"selected":"")+'>'+esc(p.name)+(p.sku?" · "+esc(p.sku):"")+' · '+money(p.price)+'</option>').join("")+'</select></label>':
              '<label>Trabajo / servicio<input class="qe-field" data-field="name" value="'+esc(x.name)+'" placeholder="Ej. Instalación y configuración"></label>')+
            '<label>Cantidad<input class="qe-field" data-field="quantity" type="number" min="0.01" step="0.01" value="'+Number(x.quantity||1)+'"></label>'+
            '<label>Unidad<select class="qe-field" data-field="unit"><option value="UND">UND</option><option value="SERV">SERV</option><option value="KIT">KIT</option><option value="M">M</option><option value="PAR">PAR</option></select></label>'+
            '<label>Precio unitario<input class="qe-field" data-field="unit_price" type="number" min="0" step="0.01" value="'+Number(x.unit_price||0)+'"></label>'+
            '<label>Material lo pone<select class="qe-field" data-field="material_provider"><option value="MARC" '+(x.material_provider==="MARC"?"selected":"")+'>M.A.R.C.</option><option value="CLIENT" '+(x.material_provider==="CLIENT"?"selected":"")+'>Cliente</option><option value="MIXTO" '+(x.material_provider==="MIXTO"?"selected":"")+'>Mixto</option></select></label>'+
            '<label>Costo material<input class="qe-field" data-field="cost" type="number" min="0" step="0.01" value="'+Number(x.cost||0)+'"></label>'+
            '<label>Transporte<input class="qe-field" data-field="transport_cost" type="number" min="0" step="0.01" value="'+Number(x.transport_cost||0)+'"></label>'+
            '<label>Mano de obra<input class="qe-field" data-field="labor_cost" type="number" min="0" step="0.01" value="'+Number(x.labor_cost||0)+'"></label>'+
            '<label>Otros costos<input class="qe-field" data-field="other_cost" type="number" min="0" step="0.01" value="'+Number(x.other_cost||0)+'"></label>'+
            '<label class="qe-description">Descripción<input class="qe-field" data-field="description" value="'+esc(x.description)+'" placeholder="Detalle de la partida"></label>'+
          '</div>'+
        '</article>';
      }).join("");
      box.querySelectorAll(".qe-field").forEach(el=>el.addEventListener("input",onField));
      box.querySelectorAll(".qe-field[data-field=inventory_id]").forEach(el=>el.addEventListener("change",onProduct));
      box.querySelectorAll(".qe-remove").forEach(el=>el.onclick=()=>{if(items.length===1)return window.MARC?.toast?.("La cotización necesita al menos una partida.","err");items.splice(Number(el.dataset.index),1);render();updateSummary()});
      box.querySelectorAll("[data-field=unit]").forEach((el,i)=>{el.value=items[i]?.unit||"UND"});
    };

    const updateSummary=()=>{
      const sub=items.reduce((s,x)=>s+Number(x.quantity||0)*Number(x.unit_price||0),0);
      const tax=$("#qeTax").checked?sub*(Number($("#qeTaxRate").value||0)/100):0;
      $("#qeSubtotal").textContent=money(sub);
      $("#qeTaxAmount").textContent=money(tax);
      $("#qeTotal").textContent=money(sub+tax);
    };

    const onField=e=>{
      const card=e.target.closest(".qe-item"),i=Number(card.dataset.index),field=e.target.dataset.field;
      let v=e.target.value;
      if(["quantity","unit_price","cost","transport_cost","labor_cost","other_cost"].includes(field))v=Number(v||0);
      items[i][field]=v;
      if(field==="type"){items[i].inventory_id="";items[i].name="";items[i].unit="UND";items[i].unit_price=0;render()}
      updateSummary();
    };

    const onProduct=e=>{
      const card=e.target.closest(".qe-item"),i=Number(card.dataset.index),p=inventory.find(x=>x.id===e.target.value);
      items[i].inventory_id=e.target.value;
      if(p){
        items[i].name=p.name;
        items[i].unit=p.unit||"UND";
        items[i].unit_price=Number(p.price||0);
        items[i].cost=Number(p.cost||0);
      }
      render();updateSummary();
    };

    $("#qeAddItem").onclick=()=>{items.push({type:"PRODUCTO",inventory_id:"",name:"",description:"",quantity:1,unit:"UND",unit_price:0,cost:0,material_provider:"MARC",transport_cost:0,labor_cost:0,other_cost:0});render();updateSummary()};
    $("#qeTax").onchange=()=>{$("#qeTaxRateWrap").classList.toggle("hidden",!$("#qeTax").checked);updateSummary()};
    $("#qeTaxRate").oninput=updateSummary;
    $("#quoteEditorClose").onclick=close;
    $("#qeCancel").onclick=close;

    $("#marcQuoteEditorForm").onsubmit=async e=>{
      e.preventDefault();
      const b=$("#qeSave"),msg=$("#qeMsg");
      b.disabled=true;msg.className="msg";msg.textContent="Guardando cotización…";
      try{
        const clean=items.map(x=>({
          item_type:x.type,
          inventory_id:x.type==="PRODUCTO"?(x.inventory_id||null):null,
          name:x.type==="TRABAJO"?String(x.name||"").trim():null,
          description:String(x.description||"").trim()||null,
          quantity:Number(x.quantity||0),
          unit:String(x.unit||"UND"),
          unit_price:Number(x.unit_price||0),
          cost:Number(x.cost||0),
          material_provider:String(x.material_provider||"CLIENT"),
          transport_cost:Number(x.transport_cost||0),
          labor_cost:Number(x.labor_cost||0),
          other_cost:Number(x.other_cost||0)
        }));
        if(clean.some(x=>x.quantity<=0))throw new Error("Todas las cantidades deben ser mayores que 0.");
        if(clean.some(x=>x.item_type==="PRODUCTO"&&!x.inventory_id))throw new Error("Selecciona un producto en cada partida de tipo Producto.");
        if(clean.some(x=>x.item_type==="TRABAJO"&&(!x.name||x.unit_price<=0)))throw new Error("Cada trabajo necesita nombre y precio mayor que 0.");
        const rpcName=existing?.id && (typeof window.isMasterAccount==="function" ? window.isMasterAccount() : String(st.u?.email||"").trim().toLowerCase()==="joachinbeltranmarcdonald50@gmail.com") ? "marc_master_update_quote" : "marc_save_quote";
        const {data,error}=await Q.rpc(rpcName,{
          p_quote_id:existing?.id||null,
          p_client_id:$("#qeClient").value||null,
          p_title:$("#qeTitle").value.trim()||"Cotización",
          p_status:$("#qeStatus").value,
          p_tax_enabled:$("#qeTax").checked,
          p_tax_rate:Number($("#qeTaxRate").value||18),
          p_notes:$("#qeNotes").value.trim()||null,
          p_items:clean,
          p_source:"WEB"
        });
        if(error)throw error;
        if(!data?.id)throw new Error("Supabase no confirmó el guardado de la cotización.");
        close();
        window.MARC?.toast?.(existing?"Cotización actualizada":"Cotización creada correctamente","ok");
        if(typeof window.view==="function")window.view("quotes"); else location.reload();
      }catch(err){
        const raw=String(err?.message||"");
        msg.className="msg error";
        msg.textContent=/TRIAL_QUOTE_LIMIT|TRIAL_EXPIRED/.test(raw)?"Has alcanzado el límite de cotizaciones de tu plan de prueba.":raw||"No se pudo guardar la cotización.";
        b.disabled=false;
      }
    };

    render();updateSummary();
  };

  const intercept=e=>{
    const b=e.target?.closest?.("#new,button[data-action='open-quote']");
    if(!b)return;
    const isQuoteNew=b.id==="new" && Boolean(b.closest(".quotes-app"));
    const isQuoteOpen=b.dataset.action==="open-quote";
    if(!isQuoteNew&&!isQuoteOpen)return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const id=isQuoteOpen?b.dataset.id:null;
    const run=async()=>{
      let existing=null;
      if(id){
        const st=getState();
        const quoteQuery=Q.from("marc_quotes").select("*,marc_clients(name)").eq("id",id);
        const r=await quoteQuery.maybeSingle();
        if(r.error)throw r.error;
        existing=r.data||null;
        if(!existing)throw new Error("Cotización no encontrada.");
      }
      await quoteEditor(existing);
    };
    run().catch(err=>window.MARC?.toast?.(err.message||"No se pudo abrir la cotización.","err"));
  };

  document.addEventListener("click",intercept,true);
  window.MARC_QUOTES={open:quoteEditor};
  console.info("[M.A.R.C. quotes] editor activo");
})();
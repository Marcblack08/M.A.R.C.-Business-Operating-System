/* M.A.R.C. — PDF estable para cotizaciones */
(function(){
'use strict';
const SOURCES=[
 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js',
 'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js'
];
let loading=null;
const money=v=>'S/ '+Number(v||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
function loadPdf(){
 if(window.jspdf?.jsPDF)return Promise.resolve(window.jspdf.jsPDF);
 if(loading)return loading;
 loading=(async()=>{
   for(const src of SOURCES){
     try{
       await new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.async=true;s.onload=ok;s.onerror=no;document.head.appendChild(s)});
       if(window.jspdf?.jsPDF)return window.jspdf.jsPDF;
     }catch{}
   }
   throw Error('No se pudo cargar el motor PDF. Comprueba la conexión a Internet.');
 })();
 return loading;
}
async function data(id){
 const sb=window.supabaseClient;if(!sb)throw Error('No hay conexión con Supabase');
 const u=(await sb.auth.getUser()).data?.user;if(!u)throw Error('Necesita iniciar sesión');
 const a=await sb.from('cotizaciones').select('*').eq('id',id).eq('user_id',u.id).single();if(a.error)throw Error(a.error.message);
 const b=await sb.from('cotizacion_items').select('*').eq('cotizacion_id',id).eq('user_id',u.id).order('orden');if(b.error)throw Error(b.error.message);
 return{q:a.data,items:b.data||[]};
}
function current(){
 const q=window.__MARC_AI_QUOTE,m=q?._modal||document.querySelector('#qv3modal');if(!q||!m)return null;
 const items=(q.partidas||[]).map((p,i)=>{const price=Number(m.querySelector(`[data-ai-price="${i}"]`)?.value??p.precio_unitario??0);const qty=p.alcance_precio==='global'?1:Number(m.querySelector(`[data-ai-qty="${i}"]`)?.value??p.cantidad??1);return{nombre:p.nombre,descripcion:p.descripcion||'',cantidad:qty,precio_venta:price,importe:price*qty,orden:i}});
 const total=items.reduce((s,x)=>s+x.importe,0);return{q:{numero:'BORRADOR',cliente_snapshot:{nombre_razon_social:q.cliente_texto||'Venta directa'},ubicacion:q.ubicacion||'',observaciones:window.__MARC_QUOTE_DESCRIPTION||q.descripcion_trabajo||'',subtotal:total,igv:0,total,empresa_nombre:null},items};
}
async function make(id){
 const d=id?await data(id):current();if(!d)throw Error('No hay una cotización para generar');
 const JsPDF=await loadPdf(),q=d.q,items=d.items||[],doc=new JsPDF({unit:'mm',format:'a4'}),M=14,W=210,C=W-M*2;let y=16;
 doc.setTextColor(25,52,79);doc.setFont('helvetica','bold');doc.setFontSize(19);doc.text(String(q.empresa_nombre||'Proforma comercial'),M,y);doc.setFontSize(9);doc.text('COTIZACIÓN',W-M,y,{align:'right'});doc.setTextColor(8,124,245);doc.setFontSize(15);doc.text(String(q.numero||''),W-M,y+6,{align:'right'});y+=17;
 doc.setDrawColor(8,124,245);doc.line(M,y,W-M,y);y+=9;doc.setTextColor(25,52,79);doc.setFontSize(9);doc.setFont('helvetica','bold');doc.text('CLIENTE',M,y);doc.setFont('helvetica','normal');doc.setFontSize(11);doc.text(String(q.cliente_snapshot?.nombre_razon_social||'Venta directa'),M,y+6);doc.setFontSize(9);doc.text('Ubicación: '+String(q.ubicacion||'—'),M,y+12);y+=21;
 if(q.observaciones){doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text('Descripción del trabajo',M,y);y+=5;doc.setFont('helvetica','normal');doc.setFontSize(9);const ls=doc.splitTextToSize(String(q.observaciones),C);doc.text(ls,M,y);y+=ls.length*4.3+5}
 doc.setFillColor(234,244,255);doc.rect(M,y,C,8,'F');doc.setTextColor(25,52,79);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('CONCEPTO',M+3,y+5);doc.text('CANT.',M+94,y+5);doc.text('P. UNIT.',M+122,y+5);doc.text('IMPORTE',W-M-3,y+5,{align:'right'});y+=8;doc.setFont('helvetica','normal');
 for(const it of items){const ls=doc.splitTextToSize(String(it.nombre||''),85),h=Math.max(8,ls.length*4+3);if(y+h>270){doc.addPage();y=18}doc.text(ls,M+3,y+5);doc.text(String(it.cantidad??0),M+94,y+5);doc.text(money(it.precio_venta),M+122,y+5);doc.text(money(it.importe),W-M-3,y+5,{align:'right'});doc.setDrawColor(225,232,239);doc.line(M,y+h,W-M,y+h);y+=h}
 y+=8;if(y>265){doc.addPage();y=18}doc.setFontSize(9);doc.text('Subtotal',W-M-65,y);doc.text(money(q.subtotal),W-M,y,{align:'right'});y+=6;doc.text('IGV',W-M-65,y);doc.text(money(q.igv),W-M,y,{align:'right'});y+=8;doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor(8,124,245);doc.text('TOTAL',W-M-65,y);doc.text(money(q.total),W-M,y,{align:'right'});
 const name=(q.numero||'cotizacion').replace(/[^a-z0-9_-]+/gi,'_')+'.pdf';doc.save(name);return name;
}
window.MARC_GENERATE_QUOTE_PDF=async id=>{const msg=document.getElementById('qv3voiceMsg');try{if(msg)msg.textContent='📄 Generando PDF…';const f=await make(id);if(msg)msg.textContent='✓ PDF descargado: '+f;return f}catch(e){if(msg)msg.textContent='⚠ PDF: '+e.message;alert('No se pudo generar el PDF: '+e.message);throw e}};
function wire(){
 document.querySelectorAll('[data-vpdf]').forEach(b=>{b.type='button';b.title='Descargar PDF';b.classList.add('marc-pdf-btn');});
 const m=document.querySelector('#qv3modal');if(m&&!m.dataset.pdfFix){m.dataset.pdfFix='1';const a=m.querySelector('.qv3actions');if(a&&!m.querySelector('#qv3downloadPdf')){const b=document.createElement('button');b.type='button';b.className='btn btn-secondary';b.id='qv3downloadPdf';b.textContent='⬇ Descargar PDF';b.onclick=()=>window.MARC_GENERATE_QUOTE_PDF(window.__MARC_AI_SAVED_ID||null).catch(()=>{});a.insertBefore(b,a.firstChild)}}
}
if(!document.body.dataset.marcPdfDelegated){document.body.dataset.marcPdfDelegated='1';document.addEventListener('click',e=>{const b=e.target.closest?.('[data-vpdf]');if(b){e.preventDefault();e.stopPropagation();window.MARC_GENERATE_QUOTE_PDF(b.dataset.vpdf).catch(()=>{})}},true)}
new MutationObserver(wire).observe(document.body,{childList:true,subtree:true});setInterval(wire,700);setTimeout(wire,400);
})();

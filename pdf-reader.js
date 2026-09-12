/* M.A.R.C. — Lector PDF con PDF.js
   Método 2: PDF.js + extracción de texto.
*/
(function () {
  'use strict';

  const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
  let pdfjsPromise = null;

  function loadPdfJs() {
    if (pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = import(PDFJS_URL).then(pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return pdfjs;
    });
    return pdfjsPromise;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function cleanText(text) {
    return text
      .replace(/[ \t]+/g, ' ')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function extractPdf(file, onProgress) {
    if (!file || file.type !== 'application/pdf') {
      throw new Error('Selecciona un archivo PDF válido.');
    }
    const pdfjs = await loadPdfJs();
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages = [];
    let fullText = '';

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = cleanText(content.items.map(item => item.str || '').join(' '));
      pages.push({ page: pageNumber, text });
      if (text) fullText += `\n--- Página ${pageNumber} ---\n${text}`;
      if (typeof onProgress === 'function') onProgress(pageNumber, pdf.numPages);
    }

    return {
      fileName: file.name,
      size: file.size,
      pages: pdf.numPages,
      pageText: pages,
      text: fullText.trim()
    };
  }

  function renderReader() {
    const content = document.querySelector('#content');
    if (!content) return;
    content.innerHTML = `
      <div class="page-head">
        <div><p class="eyebrow">M.A.R.C. / DOCUMENTOS</p><h1>Lector de PDF</h1><p>Extrae el texto de tus PDF directamente en el navegador.</p></div>
      </div>
      <section class="panel" style="margin-bottom:18px">
        <div id="pdfDrop" style="border:2px dashed rgba(8,124,245,.35);border-radius:16px;padding:32px;text-align:center;background:rgba(8,124,245,.035)">
          <div style="font-size:42px;margin-bottom:8px">📄</div>
          <h3 style="margin:0 0 8px">Selecciona un PDF</h3>
          <p style="margin:0 0 18px;color:#64748b">El texto se extrae página por página usando PDF.js.</p>
          <input id="pdfInput" type="file" accept="application/pdf,.pdf" hidden>
          <button class="btn btn-primary" id="pdfChoose" type="button">Seleccionar PDF</button>
          <p id="pdfStatus" style="margin:14px 0 0;color:#64748b"></p>
        </div>
      </section>
      <section class="panel" id="pdfResult" hidden>
        <div class="panel-head"><div><h3 id="pdfFileName">Documento</h3><span id="pdfMeta"></span></div><button class="btn btn-secondary" id="pdfCopy" type="button">Copiar texto</button></div>
        <textarea id="pdfText" readonly style="width:100%;min-height:360px;margin-top:16px;padding:16px;border:1px solid #e2e8f0;border-radius:12px;resize:vertical;font:14px/1.6 Inter,system-ui,sans-serif"></textarea>
      </section>`;

    const input = document.querySelector('#pdfInput');
    const choose = document.querySelector('#pdfChoose');
    const drop = document.querySelector('#pdfDrop');
    const status = document.querySelector('#pdfStatus');
    const result = document.querySelector('#pdfResult');
    const textBox = document.querySelector('#pdfText');
    const fileName = document.querySelector('#pdfFileName');
    const meta = document.querySelector('#pdfMeta');

    choose.onclick = () => input.click();
    drop.ondragover = e => { e.preventDefault(); drop.style.background = 'rgba(8,124,245,.08)'; };
    drop.ondragleave = () => { drop.style.background = 'rgba(8,124,245,.035)'; };
    drop.ondrop = e => { e.preventDefault(); drop.style.background = 'rgba(8,124,245,.035)'; const file = e.dataTransfer.files?.[0]; if (file) process(file); };
    input.onchange = () => { const file = input.files?.[0]; if (file) process(file); };

    document.querySelector('#pdfCopy').onclick = async () => {
      if (!textBox.value) return;
      try { await navigator.clipboard.writeText(textBox.value); status.textContent = 'Texto copiado al portapapeles.'; }
      catch { status.textContent = 'No se pudo copiar automáticamente.'; }
    };

    async function process(file) {
      result.hidden = true;
      status.textContent = 'Cargando PDF.js y leyendo el documento...';
      choose.disabled = true;
      try {
        const data = await extractPdf(file, (page, total) => {
          status.textContent = `Leyendo página ${page} de ${total}...`;
        });
        fileName.textContent = data.fileName;
        meta.textContent = `${data.pages} página${data.pages === 1 ? '' : 's'} · ${(data.size / 1024 / 1024).toFixed(2)} MB`;
        textBox.value = data.text || '[El PDF no contiene texto extraíble. Este documento puede ser un escaneo y requerirá OCR.]';
        result.hidden = false;
        status.textContent = data.text ? 'Lectura completada correctamente.' : 'PDF leído, pero no se encontró una capa de texto.';
        window.MARC_PDF_READER.lastResult = data;
      } catch (error) {
        console.error('M.A.R.C. PDF:', error);
        status.textContent = `Error: ${error.message || 'No se pudo leer el PDF.'}`;
      } finally {
        choose.disabled = false;
      }
    }
  }

  window.MARC_PDF_READER = { loadPdfJs, extractPdf, renderReader, lastResult: null };

  const originalRender = window.render;
  if (typeof originalRender === 'function') {
    window.render = function (section) {
      if (section === 'documents') return renderReader();
      return originalRender.apply(this, arguments);
    };
  }
})();

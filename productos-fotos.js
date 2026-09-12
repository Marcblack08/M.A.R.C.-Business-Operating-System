/* M.A.R.C. — Selector de fotos: cámara + galería */
(function(){
  function enhance(modal){
    if(!modal || modal.dataset.photoSourcesReady==='1') return;
    const originalInput=modal.querySelector('#productImage');
    const actions=modal.querySelector('.product-photo-actions');
    const label=modal.querySelector('label[for="productImage"]');
    if(!originalInput || !actions || !label) return;

    modal.dataset.photoSourcesReady='1';
    label.textContent='📷 Tomar foto';
    label.title='Abrir la cámara del dispositivo';

    const galleryInput=document.createElement('input');
    galleryInput.type='file';
    galleryInput.accept='image/*';
    galleryInput.hidden=true;
    galleryInput.id='productGalleryImage';

    const galleryLabel=document.createElement('label');
    galleryLabel.className='btn btn-secondary photo-label';
    galleryLabel.htmlFor='productGalleryImage';
    galleryLabel.textContent='🖼️ Galería';
    galleryLabel.title='Elegir una foto de la galería';

    actions.insertBefore(galleryLabel, modal.querySelector('#analyzeProductBtn'));
    actions.appendChild(galleryInput);

    galleryInput.addEventListener('change',()=>{
      const file=galleryInput.files?.[0];
      if(!file) return;
      try{
        const dt=new DataTransfer();
        dt.items.add(file);
        originalInput.files=dt.files;
        originalInput.dispatchEvent(new Event('change',{bubbles:true}));
      }catch(error){
        console.error('M.A.R.C.: no se pudo seleccionar la foto de galería',error);
      }
    });
  }

  const observer=new MutationObserver(()=>{
    const modal=document.querySelector('#productModal');
    if(modal) enhance(modal);
  });
  observer.observe(document.body,{childList:true,subtree:true});
  const current=document.querySelector('#productModal');
  if(current) enhance(current);
})();

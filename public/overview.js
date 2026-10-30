'use strict';
// Supporting text is available in a keyboard-accessible dialog on compact desktops.
(() => {
  const dialog=document.createElement('dialog');dialog.className='overview-details';
  let opener;
  dialog.addEventListener('close',()=>{if(opener?.isConnected)opener.focus();});
  document.body.append(dialog);
  document.querySelectorAll('#panel-overview .overview-status').forEach(panel=>{
    const button=document.createElement('button');button.type='button';button.className='secondary overview-more';button.textContent='Details';
    button.setAttribute('aria-label',panel.querySelector('h2').textContent+' details');
    button.onclick=()=>{
      opener=button;
      const close=document.createElement('button');close.type='button';close.className='secondary';close.textContent='Close details';close.onclick=()=>dialog.close();
      const heading=document.createElement('h2');heading.id='overview-details-title';heading.textContent=panel.querySelector('h2').textContent;
      dialog.setAttribute('aria-labelledby',heading.id);dialog.replaceChildren(close,heading);
      for(const row of panel.querySelectorAll('.setup-item,.health-row')){
        const copy=row.cloneNode(true);copy.querySelectorAll('button,svg').forEach(n=>n.remove());
        copy.querySelectorAll('small,.muted').forEach(n=>n.prepend(document.createTextNode(' · ')));
        const p=document.createElement('p');p.textContent=[...copy.children].map(n=>n.textContent.trim()).join(' · ');dialog.append(p);
      }
      for(const note of panel.querySelectorAll(':scope > p')){const p=document.createElement('p');p.textContent=note.textContent;dialog.append(p);}
      dialog.showModal();close.focus();
    };
    panel.append(button);
  });
})();

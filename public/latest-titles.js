'use strict';
function latestTitleIsNew(item,now=Date.now()){const age=now-Number(item.firstSeen);return !item.estimated&&Number.isFinite(age)&&age>=0&&age<7*86400000;}
(() => {
  const el=(tag,text,className)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n;};
  const button=(text,fn)=>{const n=el('button',text,'secondary');n.type='button';n.onclick=fn;return n;};
  const panel=el('section',null,'card latest-showcase');panel.id='latest-showcase';panel.setAttribute('aria-labelledby','latest-heading');
  const head=el('div',null,'latest-heading'),heading=el('div'),title=el('h2','Latest Movies & TV Shows');title.id='latest-heading';title.prepend(dashboardIcon('document'));
  heading.append(title,el('p','Recently indexed titles from your database.','muted'));
  const controls=el('div',null,'latest-controls'),view=el('select');view.setAttribute('aria-label','Latest titles view');
  for(const [value,label] of [['added','Recently Added'],['released','Newly Released']]){const o=el('option',label);o.value=value;view.append(o);}
  const filters=el('div',null,'latest-filters');filters.setAttribute('role','group');filters.setAttribute('aria-label','Media type');
  let type='all',offset=0,controller,timer,active=false,disposed=false,queued=false,previousSignature='',lastData;
  const filterButtons=[['all','All'],['movie','Movies'],['series','TV Shows']].map(([value,label])=>{const b=button(label,()=>{type=value;filterButtons.forEach(([v,n])=>n.setAttribute('aria-pressed',String(v===type)));reload();});b.setAttribute('aria-pressed',String(value===type));filters.append(b);return [value,b];});
  const history=el('dialog',null,'latest-dialog'),historyTitle=el('h2','Indexed movies and TV shows'),historyList=el('div',null,'latest-history-grid'),historyStatus=el('p',null,'muted');
  history.setAttribute('aria-label','Indexed movies and TV shows');
  const pageInfo=el('span'),back=button('Previous',()=>{offset=Math.max(0,offset-12);reload(false);}),next=button('Next',()=>{offset+=12;reload(false);});
  const pages=el('div',null,'latest-pages');pages.append(back,pageInfo,next);
  history.append(button('Close history',()=>history.close()),historyTitle,historyStatus,historyList,pages);
  const details=el('dialog',null,'latest-dialog');details.setAttribute('aria-label','Indexed title details');
  const all=button('View all',()=>{offset=0;history.showModal();reload(false);});controls.append(view,filters,all);head.append(heading,controls);
  const rail=el('div',null,'latest-rail'),track=el('div',null,'latest-track');track.setAttribute('aria-label','Indexed title cards');track.tabIndex=0;
  const left=button('\u2039',()=>scrollCards(-1)),right=button('\u203a',()=>scrollCards(1));
  left.setAttribute('aria-label','Previous titles');right.setAttribute('aria-label','Next titles');left.classList.add('latest-arrow');right.classList.add('latest-arrow');
  rail.append(left,track,right);const status=el('p','Loading indexed titles\u2026','latest-status');status.setAttribute('role','status');
  panel.append(head,rail,status);document.querySelector('#panel-overview').append(panel);document.body.append(history,details);
  function motion(){return matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';}
  function scrollCards(direction){const step=(track.firstElementChild?.getBoundingClientRect().width||track.clientWidth)+12;track.scrollBy({left:direction*Math.max(1,Math.floor((track.clientWidth+12)/step))*step,behavior:motion()});}
  function arrows(){left.disabled=track.scrollLeft<2;right.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;}
  track.addEventListener('scroll',arrows,{passive:true});window.addEventListener('resize',arrows);
  function openDetails(item){
    const m=item.metadata,close=button('Close details',()=>details.close());details.replaceChildren(close,el('h2',m?.title||item.imdb));
    const dateLabel=item.estimated?'Earliest retained observation (original addition date unavailable): ':'First indexed: ';
    details.append(el('p',(item.type==='movie'?'Movie':'TV Show')+' \u00b7 '+item.imdb),el('p',dateLabel+new Date(item.firstSeen).toLocaleString()),el('p','Indexed in Lantern. Playback availability has not been verified.','muted'));
    if(m){details.append(el('p',m.description||'No description supplied.'),el('p',(item.type==='series'?'First aired: ':'Released: ')+(m.releaseDate||'Unavailable')+' \u00b7 IMDb rating: '+(m.imdbRating??'Unavailable')));}
    details.append(el('p',m?'Metadata and artwork supplied by Cinemeta. Updated '+new Date(item.metadataAt).toLocaleString()+(item.metadataState==='stale'?' (stale).':'.'):'Metadata is unavailable; Lantern will retry automatically.','muted'));
    details.append(button('Open in Search',()=>{const [mediaType,id]=item.media.split('/');document.querySelector('#media-type').value=mediaType;document.querySelector('#media-id').value=id;document.querySelector('#media-id').dispatchEvent(new Event('input'));details.close();if(history.open)history.close();document.querySelector('#tab-search').click();document.querySelector('#panel-search').revealControl?.(document.querySelector('#search-form'));document.querySelector('#media-id').focus();}));
    details.showModal();close.focus();
  }
  function card(item){
    const m=item.metadata,b=button('',()=>openDetails(item));b.className='latest-media-card';b.dataset.key=item.key;b.setAttribute('aria-label',(m?.title||item.imdb)+' - view indexed title details');
    const art=el('div',null,'latest-art');art.append(el('span','Poster unavailable','poster-fallback'));
    if(m?.background||m?.poster){const image=el('img');image.src=m.background||m.poster;if(!m.background)image.className='portrait-art';image.alt='';image.loading='lazy';image.decoding='async';image.referrerPolicy='no-referrer';image.onload=()=>art.classList.add('poster-loaded');image.onerror=()=>image.remove();art.append(image);}
    art.append(el('span',item.type==='movie'?'Movie':'TV Show','latest-type'));
    if(latestTitleIsNew(item))art.append(el('span','Newly indexed','latest-badge'));
    else if(view.value==='released')art.append(el('span','Recent release','latest-badge'));
    const name=el('strong',m?.title||item.imdb);name.title=m?.title||item.imdb;
    const meta=el('div',null,'latest-card-meta');
    const year=el('span',m?.year||'—'),rating=el('span',m?.imdbRating?'\u2605 '+m.imdbRating+' IMDb':'—');
    year.title=m?.year||'Year unavailable';rating.title=m?.imdbRating?'IMDb rating':'Rating unavailable';
    year.setAttribute('aria-label',year.title);rating.setAttribute('aria-label',m?.imdbRating?rating.textContent:'Rating unavailable');meta.append(year,rating);
    b.append(art,name,meta);return b;
  }
  function render(data){
    lastData=data;const target=history.open?historyList:track;
    const signature=JSON.stringify([history.open,type,view.value,data.items]);
    if(signature!==previousSignature){const focused=target.contains(document.activeElement)?document.activeElement.dataset.key:null;const scroll=target.scrollLeft;target.replaceChildren(...data.items.map(card));target.scrollLeft=scroll;if(focused)[...target.children].find(n=>n.dataset.key===focused)?.focus({preventScroll:true});previousSignature=signature;}
    for(const item of data.items)if(!latestTitleIsNew(item)){const node=[...target.children].find(n=>n.dataset.key===item.key),badge=node?.querySelector('.latest-badge');if(badge?.textContent==='Newly indexed')badge.remove();}
    const context=view.value==='released'?'Released in the last 90 days; TV dates refer to the series premiere. Only titles with known release dates appear.':'Sorted by first recorded date; older records use their earliest retained observation.';
    const message=data.items.length?`${data.total} indexed ${data.total===1?'title':'titles'}. ${context}`:(view.value==='released'?'No indexed titles with a known release date in the last 90 days.':'No indexed titles in this filter. Search or import a title to get started.');
    (history.open?historyStatus:status).textContent=message;
    pageInfo.textContent=data.total?`${offset+1}\u2013${offset+data.items.length} of ${data.total}`:'0 entries';back.disabled=offset===0;next.disabled=offset+12>=data.total;
    requestAnimationFrame(arrows);
  }
  function visible(){return !disposed&&panel.isConnected&&!document.hidden&&!document.querySelector('#dashboard').hidden&&!document.querySelector('#panel-overview').hidden;}
  async function poll(){
    if(!visible()||controller)return;
    panel.setAttribute('aria-busy','true');
    const request=controller=new AbortController(),timeout=setTimeout(()=>request.abort(),10000);
    try{const response=await fetch('/api/latest-titles?'+new URLSearchParams({type,view:view.value,offset:history.open?offset:0,limit:12}),{headers:{Authorization:'Bearer '+token},signal:request.signal});if(!response.ok)throw Error();const data=await response.json();if(!request.signal.aborted&&visible())render(data);}
    catch{if(visible()&&!request.signal.aborted)(history.open?historyStatus:status).textContent=lastData?'Refresh unavailable. Previously loaded titles may be stale.':'Indexed titles are unavailable. Retrying automatically.';else if(visible()&&!queued)(history.open?historyStatus:status).textContent=lastData?'Request timed out. Previously loaded titles may be stale.':'Request timed out. Retrying automatically.';}
    finally{panel.setAttribute('aria-busy','false');clearTimeout(timeout);controller=null;if(visible()){timer=setTimeout(poll,queued?0:30000);queued=false;}}
  }
  function reload(reset=true){if(reset)offset=0;(history.open?historyStatus:status).textContent='Loading indexed titles\u2026';previousSignature='';clearTimeout(timer);if(controller){queued=true;controller.abort();}else poll();}
  view.onchange=()=>reload();history.addEventListener('close',()=>reload());
  function sync(){const next=visible();if(next===active)return;active=next;clearTimeout(timer);if(active)reload(false);else{controller?.abort();if(details.open)details.close();if(history.open)history.close();}}
  const observer=new MutationObserver(sync);const observe=()=>observer.observe(document.querySelector('#dashboard'),{attributes:true,attributeFilter:['hidden'],childList:true,subtree:true});observe();
  document.addEventListener('visibilitychange',sync);window.addEventListener('dashboard-layout',sync);
  window.addEventListener('pagehide',()=>{disposed=true;active=false;clearTimeout(timer);controller?.abort();observer.disconnect();});
  window.addEventListener('pageshow',()=>{disposed=false;observe();sync();});sync();
})();

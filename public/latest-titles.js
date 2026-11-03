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
  const left=button('',()=>scrollCards(-1)),right=button('',()=>scrollCards(1));
  for(const [b,path] of [[left,'m15 6-6 6 6 6'],[right,'m9 6 6 6-6 6']]){const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');const line=document.createElementNS(icon.namespaceURI,'path');line.setAttribute('d',path);icon.append(line);b.append(icon);}
  left.setAttribute('aria-label','Previous titles');right.setAttribute('aria-label','Next titles');left.classList.add('latest-arrow');right.classList.add('latest-arrow');
  rail.append(left,track,right);const status=el('p','Loading indexed titles\u2026','latest-status');status.setAttribute('role','status');
  panel.append(head,rail,status);document.querySelector('#panel-overview').append(panel);document.body.append(history,details);
  function motion(){return matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';}
  let perPage=1,pitch=0,resetTrack=false;
  const cards=()=>[...track.children];
  const lastStart=()=>Math.max(0,track.children.length-perPage);
  function showGroup(index,behavior='instant'){
    const start=Math.max(0,Math.min(index,lastStart()));
    track.scrollTo({left:start*pitch,behavior});arrows();
  }
  function alignCards(){
    const first=track.firstElementChild;if(!first||!rail.getBoundingClientRect().width)return;
    const railStyle=getComputedStyle(rail),style=getComputedStyle(track),gap=parseFloat(style.columnGap)||0;
    const padding=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight);
    // Reserve both arrow buttons/gaps and track padding before counting whole cards.
    const available=rail.clientWidth-parseFloat(railStyle.paddingLeft)-parseFloat(railStyle.paddingRight)-left.getBoundingClientRect().width-right.getBoundingClientRect().width-2*(parseFloat(railStyle.columnGap)||0);
    const focused=cards().indexOf(document.activeElement);
    const anchor=resetTrack?0:focused>=0?focused:Math.round(track.scrollLeft/(pitch||1));
    const width=first.getBoundingClientRect().width;pitch=width+gap;
    perPage=Math.max(1,Math.min(track.children.length,Math.floor((available-padding+gap)/pitch)));
    track.style.setProperty('--track-width',Math.min(available,perPage*pitch-gap+padding)+'px');
    showGroup(anchor>=lastStart()?lastStart():Math.floor(anchor/perPage)*perPage);
  }
  function scrollCards(direction){
    const starts=[];for(let i=0;i<lastStart();i+=perPage)starts.push(i);starts.push(lastStart());
    const current=pitch?Math.round(track.scrollLeft/pitch):0;
    const next=direction>0?starts.find(i=>i>current):starts.reverse().find(i=>i<current);
    showGroup(next??current,motion());
  }
  function arrows(){const art=track.querySelector('.latest-art');if(art){const r=art.getBoundingClientRect();rail.style.setProperty('--art-center',(r.top+r.height/2-rail.getBoundingClientRect().top)+'px');}left.disabled=track.scrollLeft<2;right.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;}
  track.addEventListener('focusin',event=>{
    const card=event.target.closest('.latest-media-card');if(!card)return;
    const index=cards().indexOf(card);
    const bounds=track.getBoundingClientRect(),r=card.getBoundingClientRect();
    if(r.left<bounds.left||r.right>bounds.right)showGroup(Math.floor(index/perPage)*perPage);
  });
  track.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const list=cards(),index=list.indexOf(document.activeElement);
    if(index>=0){const next=event.key==='Home'?0:event.key==='End'?list.length-1:Math.max(0,Math.min(list.length-1,index+(event.key==='ArrowRight'?1:-1)));list[next]?.focus({preventScroll:true});}
    else if(event.key==='Home'||event.key==='End')showGroup(event.key==='Home'?0:lastStart(),motion());
    else scrollCards(event.key==='ArrowRight'?1:-1);
  });
  track.addEventListener('scroll',arrows,{passive:true});
  const resizeObserver=new ResizeObserver(alignCards);resizeObserver.observe(rail);
  function openDetails(item,origin){
    origin?.setAttribute('aria-expanded','true');
    const m=item.metadata,close=button('Close details',()=>details.close());details.replaceChildren(close,el('h2',m?.title||'Title unavailable'));
    const dateLabel=item.estimated?'Earliest retained observation (original addition date unavailable): ':'First indexed: ';
    details.append(el('p',(item.type==='movie'?'Movie':'TV Show')+' \u00b7 '+item.imdb),el('p',dateLabel+new Date(item.firstSeen).toLocaleString()),el('p','Indexed in Lantern. Playback availability has not been verified.','muted'));
    if(m){details.append(el('p',m.description||'No description supplied.'),el('p',(item.type==='series'?'First aired: ':'Released: ')+(m.releaseDate||'Unavailable')+' \u00b7 IMDb rating: '+(m.imdbRating??'Unavailable')));}
    details.append(el('p',m?'Metadata and artwork supplied by Cinemeta. Updated '+new Date(item.metadataAt).toLocaleString()+(item.metadataState==='stale'?' (stale).':'.'):metadataMessage(item)+'. Lantern retries automatically.','muted'));
    if(item.metadataFetchState==='failed'||item.metadataState==='stale')details.append(el('p','Metadata refresh failed. Previous successful values, if available, are retained.','muted'));
    if(item.metadataRetryAt)details.append(el('p','Next metadata refresh eligible: '+new Date(item.metadataRetryAt).toLocaleString(),'muted'));
    details.append(button('Open in Search',()=>{const [mediaType,id]=item.media.split('/');document.querySelector('#media-type').value=mediaType;document.querySelector('#media-id').value=id;document.querySelector('#media-id').dispatchEvent(new Event('input'));details.close();if(history.open)history.close();document.querySelector('#tab-search').click();document.querySelector('#panel-search').revealControl?.(document.querySelector('#search-form'));document.querySelector('#media-id').focus();}));
    details.showModal();close.focus();
  }
  // Failed image URLs are retried on the existing poll, never on every render.
  const imageFailures=new Map();
  function metadataMessage(item){
    if(item.metadataState==='stale')return 'Previous metadata retained; the latest refresh is unavailable.';
    return ({pending:'Metadata loading\u2026',loading:'Metadata loading\u2026',failed:'Metadata request failed',unavailable:'Metadata unavailable',incomplete:'Artwork unavailable'})[item.metadataFetchState]||'Artwork unavailable';
  }
  function card(item){
    const m=item.metadata,b=button('',()=>openDetails(item,b));b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-expanded','false');b.className='latest-media-card';b.dataset.key=item.key;b.setAttribute('aria-label',(m?.title||'Title unavailable '+item.imdb)+' - view indexed title details');
    if(item.metadataState==='stale'){b.title='Previous metadata \u2014 latest refresh unavailable';b.setAttribute('aria-label',b.getAttribute('aria-label')+'; previous metadata, refresh unavailable');}
    const art=el('div',null,'latest-art'),fallback=el('span',m?'Artwork unavailable':metadataMessage(item),'poster-fallback');art.append(fallback);
    const urls=[...new Set([m?.background,m?.poster].filter(Boolean))];let loading=false,loaded=false;
    b.retryArtwork=()=>{
      if(loading||loaded||!visible()||!b.isConnected)return;
      const remaining=urls.filter(url=>(imageFailures.get(url)?.retryAt||0)<=Date.now());
      function attempt(){
        const url=remaining.shift();if(!url){loading=false;fallback.textContent=urls.length||m?'Artwork unavailable':metadataMessage(item);return;}
        loading=true;fallback.textContent='Loading artwork\u2026';
        const image=el('img');if(url===m.poster&&url!==m.background)image.className='portrait-art';image.alt='';image.decoding='async';image.referrerPolicy='no-referrer';
        image.onload=()=>{
          loading=false;loaded=true;imageFailures.delete(url);
          if(image.classList.contains('portrait-art')&&image.naturalHeight>image.naturalWidth){
            const backdrop=el('div',null,'latest-poster-backdrop'),blur=el('span');backdrop.setAttribute('aria-hidden','true');
            blur.style.backgroundImage='url('+JSON.stringify(image.currentSrc)+')';backdrop.append(blur);art.insertBefore(backdrop,image);
          }
          art.classList.add('poster-loaded');
        };
        image.onerror=()=>{image.remove();const attempts=Math.min(5,(imageFailures.get(url)?.attempts||0)+1);if(imageFailures.size>=256)imageFailures.delete(imageFailures.keys().next().value);imageFailures.set(url,{attempts,retryAt:Date.now()+Math.min(900000,60000*2**(attempts-1))});if(b.isConnected&&visible())attempt();else loading=false;};
        image.src=url;art.append(image);
      }
      attempt();
    };
    if(latestTitleIsNew(item))art.append(el('span','Newly indexed','latest-badge'));
    else if(view.value==='released')art.append(el('span','Recent release','latest-badge'));
    const name=el('strong',m?.title||'Title unavailable');name.title=m?.title||'Title unavailable \u00b7 '+item.imdb;
    if(!m?.title)name.append(el('small',item.imdb,'latest-unresolved-id'));
    const meta=el('div',null,'latest-card-meta');
    const year=el('span',m?.year||'\u2014'),rating=el('span',m?.imdbRating?'\u2605 '+m.imdbRating+' IMDb':'\u2014');
    year.title=m?.year||'Year unavailable';rating.title=m?.imdbRating?'IMDb rating':'Rating unavailable';
    year.setAttribute('aria-label',year.title);rating.setAttribute('aria-label',m?.imdbRating?rating.textContent:'Rating unavailable');meta.append(year,rating);
    b.append(art,name,meta);return b;
  }
  function render(data){
    lastData=data;const target=history.open?historyList:track;
    const signature=JSON.stringify([history.open,type,view.value,data.items]);
    if(signature!==previousSignature){const focused=target.contains(document.activeElement)?document.activeElement.dataset.key:null;const scroll=target===track&&resetTrack?0:target.scrollLeft;target.replaceChildren(...data.items.map(card));target.scrollLeft=scroll;if(focused)[...target.children].find(n=>n.dataset.key===focused)?.focus({preventScroll:true});previousSignature=signature;}
    for(const node of target.children)node.retryArtwork?.();
    for(const item of data.items)if(!latestTitleIsNew(item)){const node=[...target.children].find(n=>n.dataset.key===item.key),badge=node?.querySelector('.latest-badge');if(badge?.textContent==='Newly indexed')badge.remove();}
    const context=view.value==='released'?'Released in the last 90 days; TV dates refer to the series premiere. Only titles with known release dates appear.':'Sorted by first recorded date; older records use their earliest retained observation.';
    const message=data.items.length?`${data.total} indexed ${data.total===1?'title':'titles'}. ${context}`:(view.value==='released'?'No indexed titles with a known release date in the last 90 days.':'No indexed titles in this filter. Search or import a title to get started.');
    (history.open?historyStatus:status).textContent=message;
    pageInfo.textContent=data.total?`${offset+1}\u2013${offset+data.items.length} of ${data.total}`:'0 entries';back.disabled=offset===0;next.disabled=offset+12>=data.total;
    // Align in the same render, before native scroll-snap can retain an old filter position.
    if(target===track){alignCards();resetTrack=false;}
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
  function reload(reset=true){if(reset){offset=0;resetTrack=true;}(history.open?historyStatus:status).textContent='Loading indexed titles\u2026';previousSignature='';clearTimeout(timer);if(controller){queued=true;controller.abort();}else poll();}
  details.addEventListener('close',()=>document.querySelectorAll('.latest-media-card[aria-expanded=true]').forEach(n=>n.setAttribute('aria-expanded','false')));
  view.onchange=()=>reload();history.addEventListener('close',()=>reload());
  function sync(){const next=visible();if(next===active)return;active=next;clearTimeout(timer);if(active)reload(false);else{controller?.abort();if(details.open)details.close();if(history.open)history.close();}}
  const observer=new MutationObserver(sync);const observe=()=>observer.observe(document.querySelector('#dashboard'),{attributes:true,attributeFilter:['hidden'],childList:true,subtree:true});observe();
  document.addEventListener('visibilitychange',sync);window.addEventListener('dashboard-layout',sync);
  window.addEventListener('pagehide',()=>{disposed=true;active=false;clearTimeout(timer);controller?.abort();observer.disconnect();resizeObserver.disconnect();});
  window.addEventListener('pageshow',()=>{disposed=false;observe();resizeObserver.observe(rail);sync();});sync();
})();

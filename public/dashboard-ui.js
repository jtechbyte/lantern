'use strict';
// Presentation helpers deliberately leave form ownership and API handlers intact.
const iconPaths={
 overview:'m3 10 9-7 9 7v11h-6v-7H9v7H3z', appearance:'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h3a5 5 0 0 0 0-10z M7 8h.01M11 6h.01M16 7h.01M6 12h.01',
 playback:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M10 8l6 4-6 4z', discovery:'M4 6c0-4 16-4 16 0s-16 4-16 0v12c0 4 16 4 16 0V6M4 12c0 4 16 4 16 0',
 search:'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0m-2 5 6 6',library:'M3 5h6l2 3h10v13H3z',activity:'M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z',users:'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21v-3a7 7 0 0 1 14 0v3zM17 4a4 4 0 0 1 0 8m2 3a6 6 0 0 1 3 6',
 document:'M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h5',monitor:'M2 3h20v14H2zM12 17v5m-5 0h10', lock:'M5 10h14v12H5zM8 10V6a4 4 0 0 1 8 0v4M12 14v4', installation:'M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0'};
function dashboardIcon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('outline-icon');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',iconPaths[name]||iconPaths.discovery);svg.append(path);return svg;}
function saveState(state){const el=document.querySelector('#save-state');el.dataset.state=state;el.textContent={saved:'All changes saved',dirty:'Unsaved changes',saving:'Saving configuration…',failed:'Save failed · changes not saved'}[state];}
for(const tab of document.querySelectorAll('.dashboard-nav [role=tab]'))tab.prepend(dashboardIcon(tab.id.replace('tab-','')));
document.querySelector('#logout').prepend(dashboardIcon('lock'));
for(const [i,card] of [...document.querySelectorAll('.metrics .card')].entries()){const content=document.createElement('div');content.append(...card.childNodes);const icon=document.createElement('div');icon.className='metric-icon';icon.append(dashboardIcon(['document','search','monitor','discovery'][i]));card.append(icon,content);}
const descriptions={appearance:'Make Lantern your own.',playback:'Manage delivery and your provider account.',discovery:'Choose your sources and result preferences.',search:'Inspect matching results from your sources.',library:'Manage your index, imports, and monitored titles.',activity:'Recent searches and server maintenance.',users:'Private access for the people you invite.'};
for(const [id,text] of Object.entries(descriptions)){const heading=document.querySelector('#panel-'+id+' .panel-heading');heading.querySelector('.eyebrow')?.remove();const p=document.createElement('p');p.textContent=text;heading.append(p);}
// Related settings have explicit views; inactive controls retain values and form ownership.
function sectionViews(panel, groups){panel.viewGroups=groups;const nav=document.createElement('div');nav.className='section-views';nav.setAttribute('aria-label','Section views');const buttons=[];groups.forEach(([label,elements],index)=>{const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=label;button.onclick=()=>{const visible=new Set(groups[index][1]);for(const el of new Set(groups.flatMap(([,els])=>els)))el.hidden=!visible.has(el);buttons.forEach((item,i)=>item.setAttribute('aria-pressed',String(i===index)));window.dispatchEvent(new Event('dashboard-layout'));};buttons.push(button);nav.append(button);});panel.querySelector('.panel-heading').after(nav);buttons[0].click();panel.revealControl=el=>{const index=groups.findIndex(([,els])=>els.some(container=>container===el||container.contains(el)));if(index>=0)buttons[index].click();};}
const library=document.querySelector('#panel-library');
const imports=library.querySelector('.card:last-child'),manualCard=document.createElement('section'),reportCard=document.createElement('section');
manualCard.className=reportCard.className='card';
const manualTitle=document.createElement('h2');manualTitle.textContent='Manual imports';manualCard.append(manualTitle,document.querySelector('#manual-import'));
imports.querySelector('h2').textContent='DMM imports';
const reportTitle=document.createElement('h2');reportTitle.textContent='Import and cleanup reports';const reportIntro=document.createElement('p');reportIntro.textContent='Run an import status check or filename preview to inspect its report.';
const filenameDetails=document.querySelector('#filename-details');filenameDetails.setAttribute('name','library-report');const dmmDetails=document.createElement('details'),dmmSummary=document.createElement('summary');dmmDetails.id='dmm-report-details';dmmDetails.setAttribute('name','library-report');dmmSummary.textContent='DMM import status';dmmDetails.append(dmmSummary,document.querySelector('#dmm-report'));
reportCard.append(reportTitle,reportIntro,filenameDetails,dmmDetails);library.append(manualCard,reportCard);
sectionViews(library,[...library.querySelectorAll(':scope > .card')].map((card,i)=>[['Filename policy','Monitored titles','Installation','DMM imports','Manual imports','Reports'][i],[card]]));
const playback=document.querySelector('#panel-playback'),playbackCard=playback.querySelector('.card'),playbackHelp=document.createElement('section');playbackHelp.className='card playback-help';const helpTitle=document.createElement('h2');helpTitle.textContent='How playback works';playbackHelp.append(helpTitle,playbackCard.querySelector('p'));playbackCard.after(playbackHelp);sectionViews(playback,[['Account and delivery',[playbackCard]],['How playback works',[playbackHelp]]]);
const discovery=document.querySelector('#panel-discovery');
const preferences=discovery.querySelector('.card'),advanced=document.createElement('div');advanced.className='card settings-card';const advancedTitle=document.createElement('h3');advancedTitle.textContent='Quality and refresh';advanced.append(advancedTitle);for(const el of [...preferences.children].slice(3))advanced.append(el);preferences.after(advanced);
sectionViews(discovery,[['Result preferences',[preferences]],['Quality and refresh',[advanced]],['Discovery sources',[discovery.querySelector('.card:last-child')]]]);
// Search results get their own view so large result sets never crowd the search controls.
const searchPanel=document.querySelector('#panel-search'),searchCard=searchPanel.querySelector('.card'),resultCard=document.createElement('section');resultCard.className='card';resultCard.append(document.querySelector('#results'));searchCard.after(resultCard);sectionViews(searchPanel,[['New search',[searchCard]],['Results',[resultCard]]]);
document.querySelector('#search-form').addEventListener('submit',()=>searchPanel.revealControl(resultCard));
document.querySelector('#dashboard').addEventListener('invalid',event=>event.target.closest('.tab-panel')?.revealControl?.(event.target),true);
// Paginate actual rendered rows by available space, including wrapped names.
const pagers=[];
function paginateList(selector, maximum=5){const list=document.querySelector(selector);const controls=document.createElement('div');controls.className='list-pages';controls.setAttribute('aria-label',selector.slice(1)+' pages');const prev=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');for(const button of [prev,next]){button.type='button';button.className='secondary';}prev.textContent='Previous';next.textContent='Next';label.setAttribute('aria-live','polite');controls.append(prev,label,next);list.after(controls);let current=0;
 const render=()=>{if(!list.getClientRects().length)return;const rows=[...list.children].filter(el=>!el.classList.contains('health-head')&&el.tagName!=='H3');rows.forEach(el=>el.hidden=false);const desktop=innerWidth>=1100&&innerHeight>=700;const top=list.getBoundingClientRect().top;const bottom=selector==='#health'?Math.min(list.closest('.card').getBoundingClientRect().bottom,document.querySelector('.dashboard-actions').getBoundingClientRect().top-12)-65:innerHeight-(selector==='#sources'?250:200);const budget=desktop?Math.max(80,bottom-top):600;let pages=[[]],used=0;for(const row of rows){const height=row.getBoundingClientRect().height+8;if(pages.at(-1).length&&!(selector==='#health'&&rows.length<=4)&&(used+height>budget||pages.at(-1).length>=maximum)){pages.push([]);used=0;}pages.at(-1).push(row);used+=height;}current=Math.min(current,pages.length-1);rows.forEach(el=>el.hidden=!pages[current].includes(el));controls.hidden=pages.length<=1;label.textContent=`${current+1} / ${pages.length} · ${rows.length} items`;prev.disabled=current===0;next.disabled=current===pages.length-1;};
 prev.onclick=()=>{current--;render();};next.onclick=()=>{current++;render();};const observer=new MutationObserver(()=>{current=0;render();});observer.observe(list,{childList:true});pagers.push(render);render.dispose=()=>{observer.disconnect();pagers.splice(pagers.indexOf(render),1);controls.remove();};return render;}
for(const [selector,max] of [['#health',Infinity],['#watchlist',5],['#profile-list',4],['#results',3]])paginateList(selector,max);
let layoutFrame;function layoutLists(){cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(()=>pagers.forEach(render=>render()));}
window.addEventListener('resize',layoutLists);window.addEventListener('dashboard-layout',layoutLists);
document.querySelector('#dashboard').addEventListener('toggle',layoutLists,true);
// Reports retain every line, with explicit pages instead of a nested scrollbar.
for(const selector of ['#dmm-report','#filename-report']){
 const report=document.querySelector(selector),bar=document.createElement('div');bar.className='list-pages';bar.hidden=true;
 const previous=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');
 for(const button of [previous,next]){button.type='button';button.className='secondary';}previous.textContent='Previous lines';next.textContent='Next lines';bar.append(previous,label,next);report.after(bar);let lines=[],page=0;
 const observer=new MutationObserver(()=>{lines=report.textContent.split('\n');page=0;render();});
 function render(){observer.disconnect();report.replaceChildren();const size=6;lines.forEach((text,i)=>{const line=document.createElement('span');line.textContent=text+'\n';line.hidden=Math.floor(i/size)!==page;report.append(line);});const count=Math.ceil(lines.length/size);bar.hidden=count<=1;label.textContent=`${page+1} / ${count}`;previous.disabled=page===0;next.disabled=page>=count-1;observer.observe(report,{childList:true});}
 previous.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};observer.observe(report,{childList:true});
}
fetch('/healthz').then(res=>res.json()).then(data=>{document.querySelector('#server-version').textContent=data.version?'v'+data.version:'Version unavailable';}).catch(()=>{});





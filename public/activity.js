'use strict';

// Older activity records contain messages rather than structured result fields.
// Recognize the server's exact formats; never infer success from an unknown message.
function describeActivity(event) {
  const message=String(event.message||'');
  const kinds={dmm:['DMM import','discovery'],search:['Search','search'],playback:['Playback','playback'],'filename-policy':['Filename policy','document'],cleanup:['Cleanup','installation']};
  const [label,icon]=kinds[event.kind]||[String(event.kind||'Server event').replace(/[-_]/g,' ').replace(/^./,c=>c.toUpperCase()),'activity'];
  let summary=message,support='',status='Recorded',tone='neutral';
  const automatic=message.match(/^DMM automatic: (\d+) lists imported; (\d+) accepted; (\d+) filename exclusions; (\d+) failed; (\d+) unvisited lists\.$/);
  const manual=message.match(/^DMM import: (\d+) accepted observations; (\d+) filename exclusions; (\d+) failed lists\.$/);
  const search=message.match(/^(.*): (\d+) matching observations; (\d+) source failures$/);
  const count=n=>Number(n).toLocaleString();
  function result(failures){const n=Number(failures);status=n?`${count(n)} ${n===1?'failure':'failures'}`:'Completed';tone=n?'warning':'success';}
  if(event.kind==='dmm'&&automatic){const [,lists,accepted,excluded,failed,remaining]=automatic;summary=`${count(lists)} ${Number(lists)===1?'list':'lists'} imported · ${count(accepted)} accepted`;support=`${count(excluded)} filename exclusions · ${count(remaining)} lists remaining`;result(failed);}
  else if(event.kind==='dmm'&&manual){summary=`${count(manual[1])} accepted observations`;support=`${count(manual[2])} filename exclusions`;result(manual[3]);}
  else if(event.kind==='search'&&search){summary=`${count(search[2])} matching observations`;support=search[1];result(search[3]);}
  else if(event.kind==='search'&&message.includes('Background discovery failed; retry later.')){summary='Background discovery failed';support='Retry later. See details for the title.';status='Failed';tone='error';}
  else if(event.kind==='playback'){summary='Playback could not be completed';support='See details for the provider response.';status='Failed';tone='error';}
  else if(event.kind==='filename-policy'){const matched=message.match(/: (\d+) filename-rule matches excluded before indexing\.$/);if(matched){summary=`${count(matched[1])} filename matches excluded`;support=message.slice(0,message.indexOf(':'));status='Applied';tone='neutral';}}
  else if(event.kind==='cleanup'&&/^Filename policy removed \d+ release\/candidate records/.test(message)){summary=message.split(' (')[0];support='Includes matching manual imports.';status='Completed';tone='success';}
  // A concise preview is intentional; View details always retains the full record.
  const preview=text=>text.length>110?text.slice(0,107)+'…':text;
  return {label,icon,summary:preview(summary),support:preview(support),status,tone};
}

const activityView=(()=>{
  const root=document.querySelector('#events'),card=root.closest('.card');
  const table=document.createElement('table');table.className='activity-table';table.setAttribute('aria-label','Recent activity');
  const head=table.createTHead().insertRow();
  for(const title of ['Time','Event','Summary','Status','Details']){const th=document.createElement('th');th.scope='col';th.textContent=title;head.append(th);}
  const body=table.createTBody(),empty=document.createElement('p');empty.className='muted';empty.textContent='No recent activity. Searches and maintenance will appear here.';
  root.replaceChildren(table,empty);
  table.hidden=true;
  const pagination=document.createElement('div');pagination.className='activity-pages';
  const range=document.createElement('span'),historyButton=document.createElement('button');
  range.className='activity-range';range.setAttribute('aria-live','polite');
  historyButton.type='button';historyButton.className='secondary';historyButton.textContent='View full history';pagination.append(range,historyButton);root.after(pagination);
  const dialog=document.createElement('dialog');dialog.className='activity-dialog';dialog.setAttribute('aria-labelledby','activity-detail-heading');
  const heading=document.createElement('h2');heading.id='activity-detail-heading';
  const timestamp=document.createElement('p'),result=document.createElement('p'),message=document.createElement('pre'),close=document.createElement('button');close.type='button';close.className='secondary';close.textContent='Close details';close.autofocus=true;close.onclick=()=>dialog.close();dialog.append(heading,timestamp,result,message,close);document.body.append(dialog);
  const history=document.createElement('dialog');history.className='activity-history';history.setAttribute('aria-labelledby','activity-history-heading');
  const historyHead=document.createElement('div');historyHead.className='section-head';
  const historyTitle=document.createElement('h2');historyTitle.id='activity-history-heading';historyTitle.textContent='Activity history';
  const historyClose=document.createElement('button');historyClose.type='button';historyClose.className='secondary';historyClose.textContent='Close history';historyClose.autofocus=true;historyClose.onclick=()=>history.close();historyHead.append(historyTitle,historyClose);
  const historyNote=document.createElement('p');historyNote.className='muted';historyNote.setAttribute('role','status');
  const historyTable=table.cloneNode(true);historyTable.setAttribute('aria-label','Full activity history');const historyBody=historyTable.tBodies[0];
  history.append(historyHead,historyNote,historyTable);document.body.append(history);
  let entries=[],rows=[],opener=null,openerButton=null,frame,total=0,historyRequest=0;
  const key=event=>event.id!=null?String(event.id):JSON.stringify([event.time,event.kind,event.message]);
  dialog.addEventListener('close',()=>{if(openerButton?.isConnected&&openerButton.getClientRects().length){openerButton.focus();return;}const row=rows.find(row=>row.dataset.eventKey===opener);const button=row?.querySelector('button');if(button&&!row.hidden)button.focus();else historyButton.focus();});
  function details(event,button){const info=describeActivity(event);opener=key(event);openerButton=button;heading.textContent=info.label;timestamp.textContent=new Date(event.time).toLocaleString();result.textContent=info.status;result.className='status-label '+info.tone;message.textContent=String(event.message||'');dialog.showModal();}
  history.addEventListener('close',()=>{historyRequest++;historyButton.focus();});
  historyButton.onclick=async()=>{
    const request=++historyRequest;historyBody.replaceChildren();historyTable.hidden=true;historyNote.textContent='Loading history…';history.showModal();
    try{const data=await api('activity');if(request!==historyRequest||!history.open)return;historyBody.replaceChildren(...data.events.map(event=>activityRow(event,true)));historyTable.hidden=!data.events.length;historyNote.textContent=data.events.length?`${data.events.length.toLocaleString()} retained entries. Snapshot when opened; reopen to see new activity.`:'No activity recorded yet.';}
    catch(error){if(request===historyRequest&&history.open)historyNote.textContent='Could not load history: '+error.message+'. Close and reopen to retry.';}
  };
  function layout(){
    if(!root.getClientRects().length)return;
    rows.forEach(row=>row.hidden=false);
    const desktop=innerWidth>=1100&&innerHeight>=700;
    const tableTop=body.getBoundingClientRect().top;
    const padding=parseFloat(getComputedStyle(card).paddingBottom);
    const available=desktop?document.querySelector('.dashboard-actions').getBoundingClientRect().top-16-padding-pagination.getBoundingClientRect().height-tableTop:Math.max(220,innerHeight*.6);
    let used=0,visible=0;
    for(const row of rows){const height=row.getBoundingClientRect().height;if(used+height>available)break;used+=height;visible++;}
    rows.forEach((row,index)=>row.hidden=index>=visible);
    range.textContent=`Latest ${visible.toLocaleString()} of ${total.toLocaleString()} entries`;
  }
  function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(layout);}
  window.addEventListener('resize',schedule);window.addEventListener('dashboard-layout',schedule);
  function activityRow(event,fullHistory=false){const info=describeActivity(event),row=document.createElement('tr');row.className='activity-row';row.dataset.eventKey=key(event);
      const cells=Array.from({length:5},()=>row.insertCell());
      const time=document.createElement('time');time.dateTime=new Date(event.time).toISOString();time.textContent=new Date(event.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});time.title=new Date(event.time).toLocaleString();cells[0].append(time);
      if(fullHistory){const date=document.createElement('small');date.textContent=new Date(event.time).toLocaleDateString();cells[0].prepend(date);}
      const label=document.createElement('span');label.className='activity-event';label.append(dashboardIcon(info.icon),document.createTextNode(info.label));cells[1].append(label);
      const summary=document.createElement('div'),support=document.createElement('small');summary.textContent=info.summary;support.textContent=info.support;cells[2].append(summary,support);
      const state=document.createElement('span');state.className='status-label '+info.tone;state.textContent=info.status;cells[3].append(state);
      const button=document.createElement('button');button.type='button';button.className='activity-details';button.textContent='View details';button.setAttribute('aria-label',`View details: ${info.label}, ${time.title}`);button.onclick=()=>details(event,button);cells[4].append(button);return row;}
  return (events,eventCount)=>{
    total=eventCount??events.length;
    if(JSON.stringify(events)===JSON.stringify(entries)){schedule();return;}
    entries=events.map(event=>({...event}));
    rows=entries.map(event=>activityRow(event));
    body.replaceChildren(...rows);empty.hidden=rows.length>0;table.hidden=!rows.length;schedule();
  };
})();
function renderActivity(events,eventCount){activityView(events,eventCount);}

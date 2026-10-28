'use strict';
let token = '', configuration, definitions = [], noticeTimer, excludedPager, savedSettingsFingerprint, verificationGeneration=0;
const $ = selector => document.querySelector(selector);
const node = (tag, text, className) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; };
function notify(message) { $('#notice').textContent = message; $('#notice').hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('#notice').hidden = true, 7000); }
async function api(path, method = 'GET', body) {
  try {
  const response = await fetch(`/api/${path}`, { method, signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type':'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json();
  if (!response.ok) { const error=new Error(value.error + (value.fields ? ': ' + value.fields.map(f => `${f.path} ${f.message}`).join('; ') : '')); error.status=response.status; throw error; }
  return value;
  } catch (error) {
    if (error.name === 'TimeoutError') throw new Error('Request timed out. Refresh status before retrying; the server may have completed the operation.');
    if (error instanceof SyntaxError) throw new Error('Unexpected server response. Check the connection and reverse proxy.');
    throw error;
  }
}
const run = fn => async event => { event?.preventDefault(); try { await fn(event); } catch (error) { notify(error.message); } };
function setInstall(url) { $('#manifest-url').value = url; $('#install').href = url.replace(/^https?:\/\//,'stremio://'); }
async function loadSettings() {
  const data = await api('settings');verificationGeneration++; configuration = data.settings; definitions = data.sources;
  for (const [key,value] of Object.entries(configuration)) {
    const input = $('#settings-form').elements.namedItem(key);
    if (!input) continue;
    if (key === 'dmmHashlists') input.value = value.join('\n'); else if (input.type === 'checkbox') input.checked = value; else input.value = value;
  }
  $('#brand').textContent = configuration.name; document.title = `${configuration.name} · Control room`;
  $('#provider-token-state').replaceChildren(node('span',data.rdTokenSet?'Token saved':'No token saved','quiet-badge'));
  $('#rd-status').textContent = data.rdTokenSet ? 'Account verification pending. Test the saved token to verify access.' : 'Save a provider token before testing your account.';
  $('#rd-status').className='inline-feedback';
  $('#rd-status').dataset.state='pending';
  $('#rule-version').textContent = `Rule set: ${data.rdRulesVersion}`;
  setInstall(data.installUrl);
  const origin = new URL(data.installUrl);
  const local = ['localhost','127.0.0.1','[::1]'].includes(origin.hostname);
  const notes = [
    ['Database',data.database==='postgresql'?'Connected':'Test storage',data.database==='postgresql'?'PostgreSQL':'Legacy test storage',data.database==='postgresql'?'success':'neutral','discovery'],
    ['Installation','Configured',local?'Local address configured. Remote access untested.':origin.protocol==='https:'?'HTTPS configured · Remote access untested':'HTTP configured · HTTPS needed for remote clients',local||origin.protocol!=='https:'?'warning':'neutral','installation'],
    ['Discovery',`${configuration.sources.length} enabled`,configuration.sources.length?'Run a search to check availability.':'Only imported mappings will be returned.','warning','activity'],
    ['Playback',data.rdTokenSet?'Token saved':'Token needed',data.rdTokenSet?'Account verification pending.':'Save a Real-Debrid token in Playback.',data.rdTokenSet?'neutral':'warning','playback'],
  ];
  $('#setup-status').replaceChildren();
  for (const [label,state,detail,tone,icon] of notes) { const row=node('div',null,'setup-item'),info=node('div',null,'setup-detail');info.append(node('span',state,'status-label '+tone),node('small',detail));row.append(dashboardIcon(icon),node('strong',label),info);if(label==='Playback'){info.id='playback-verification';const test=node('button','Test account','secondary');test.type='button';test.disabled=!data.rdTokenSet;test.onclick=()=>$('#rd-test').click();row.append(test);}$('#setup-status').append(row); }
  $('#qualities').replaceChildren();
  for (const quality of ['2160p','1080p','720p','480p','unknown']) {
    const label = node('label',null,'check'), input = node('input'); input.type='checkbox'; input.value=quality; input.checked=configuration.excludeQualities.includes(quality);
    label.append(input,document.createTextNode(quality)); $('#qualities').append(label);
  }
  $('#sources').replaceChildren();
  for (const source of definitions) {
    const box=node('div',null,'source'), label=node('label',null,'check'), input=node('input'); input.type='checkbox'; input.value=source.id; input.checked=configuration.sources.includes(source.id);
    label.append(input,document.createTextNode(source.name)); box.append(label,node('small',`${source.interface} · ${source.note}`)); $('#sources').append(box);
  }
  savedSettingsFingerprint=settingsFingerprint();saveState('saved');
  updatePreferenceSummary();queueFormatPreview();
}
async function status() {
  const data = await api('status'); $('#count').textContent=data.releases.toLocaleString(); $('#active').textContent=data.activeSearches.toLocaleString(); $('#watched-count').textContent=data.watchlist.length.toLocaleString();
  latestWatchlist=data.watchlist;updateMonitoring();
  const cooling=Object.entries(data.health).filter(([id,h])=>configuration.sources.includes(id)&&h.retryAt>Date.now());
  $('#search-cooldown').textContent=cooling.length?`${cooling.length} source${cooling.length===1?' is':'s are'} in cooldown. Next retry ${new Date(Math.min(...cooling.map(([,h])=>h.retryAt))).toLocaleTimeString()}.`:'';
  const cleanupStatus=$('#cleanup-status');
  if(cleanupStatus)cleanupStatus.textContent=data.cleanup ? `Automatic cleanup: ${new Date(data.cleanup.at).toLocaleString()} - ${Object.values(data.cleanup.removed).reduce((a,b)=>a+b,0)} records removed in last pass. 7-day retention; ${data.cleanup.releaseLimit} discovery / ${data.cleanup.searchLimit} search targets. Manual imports preserved.` : 'Automatic cleanup runs every minute. 7-day retention; 50,000 discovery / 10,000 search targets. Manual imports preserved.';
  if(cleanupStatus && data.storage){const storage=data.storage;cleanupStatus.textContent+=` Database: ${(storage.bytes/1e9).toFixed(2)} / 4.00 GB budget. ${storage.state==='paused'?'Release storage paused at 3.5 GB; allocated space may require maintenance before resuming.':storage.state==='pressure'?'Storage pressure: reduced retention targets active.':'Storage normal.'}`;}
  const maintenanceSummary=$('#maintenance-summary');
  if(maintenanceSummary && data.storage)maintenanceSummary.textContent=`Storage ${(data.storage.bytes/1e9).toFixed(2)} / 4 GB - ${data.storage.state==='paused'?'release writes paused':data.storage.state==='pressure'?'cleanup pressure':'normal'} - details`;
  $('#health').replaceChildren();
  const healthHead=node('div',null,'health-head');healthHead.setAttribute('role','row');for(const title of ['Source','Status','Latency','Results']){const cell=node('div',title);cell.setAttribute('role','columnheader');healthHead.append(cell);}$('#health').setAttribute('role','table');$('#health').setAttribute('aria-label','Source health');$('#health').append(healthHead);
  for (const source of definitions) {
    const h=data.health[source.id], row=node('div',null,'health-row'), left=node('div');
    const checked=node('small',h ? `Last checked: ${new Date(h.checkedAt).toLocaleDateString()} ${new Date(h.checkedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}` : 'Not searched yet');
    if(h)checked.title=new Date(h.checkedAt).toLocaleString();left.append(node('div',source.name),checked);
    const healthLabel = !h ? 'untested' : Date.now()-h.checkedAt>86400000 ? 'stale' : h.status==='ok' ? 'responded' : h.status;
    const enabled=configuration.sources.includes(source.id),tone=!enabled||!h?'neutral':healthLabel==='responded'?'success':healthLabel==='stale'||['cooldown','skipped'].includes(healthLabel)?'warning':'error';
    const displayStatus=(enabled?healthLabel:'disabled').replace(/(^|[ _-])(\w)/g,(_,space,letter)=>(space?' ':'')+letter.toUpperCase());
    row.append(left,node('span',displayStatus,'status-label '+tone),node('span',h?.durationMs!=null?`${h.durationMs} ms`:'—'),node('span',h?.results!=null?String(h.results):'—'));row.setAttribute('role','row');for(const cell of row.children)cell.setAttribute('role','cell');
    if(h?.retryAt>Date.now())left.append(node('div',`Next attempt after ${new Date(h.retryAt).toLocaleTimeString()}`,'muted'));
    if(h?.code) left.append(node('div',h.code,'muted')); $('#health').append(row);
  }
  $('#watchlist').replaceChildren();
  if(!data.watchlist.length) $('#watchlist').append(node('p','No monitored titles yet.','muted'));
  for(const media of data.watchlist) {
    const row=node('div',null,'watch-row'), remove=node('button','Remove','secondary');
    remove.onclick=run(async()=>{const [type,id]=media.split('/');await api('watch','DELETE',{type,id});await status();});
    row.append(node('span',media),remove);$('#watchlist').append(row);
  }
  renderActivity(data.events,data.eventCount);
}
const loginStorageKey='lantern.admin.tab';
function forgetLogin(){try{sessionStorage.removeItem(loginStorageKey);}catch{}token='';}
async function unlockDashboard(){
  await loadSettings();await status();
  $('#admin-token').value='';$('#login').hidden=true;$('#dashboard').hidden=false;$('#logout').hidden=false;
  window.dispatchEvent(new Event('dashboard-layout'));
}
iconPaths.key='M15 3a6 6 0 1 1-4 10l-6 8H2v-4l7-7a6 6 0 0 1 6-7M16 7h.01';
iconPaths.eye='M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0';
iconPaths.eyeHidden=iconPaths.eye+'M3 3l18 18';
iconPaths.arrow='M4 12h16m-6-6 6 6-6 6';
$('#token-key').append(dashboardIcon('key'));$('#session-lock').append(dashboardIcon('lock'));
$('#toggle-token').append(dashboardIcon('eye'));$('#unlock-button').append(dashboardIcon('arrow'));
$('#toggle-token').onclick=()=>{const reveal=$('#admin-token').type==='password';$('#admin-token').type=reveal?'text':'password';$('#toggle-token').setAttribute('aria-label',reveal?'Hide admin token':'Show admin token');$('#toggle-token').setAttribute('aria-pressed',String(reveal));$('#toggle-token').replaceChildren(dashboardIcon(reveal?'eyeHidden':'eye'));};
function loginError(error,restoring=false){
  const invalid=error.status===401;
  $('#login-error').textContent=invalid?(restoring?'Saved login expired. Enter your admin token.':'Invalid admin token. Check your token and try again.'):error.status===403?'Access rejected. Check that you are using the configured server address.':'Could not connect to Lantern. Check your connection and try again.';
  $('#admin-token').setAttribute('aria-invalid',String(invalid));
}
$('#admin-token').addEventListener('input',()=>{$('#login-error').textContent='';$('#admin-token').removeAttribute('aria-invalid');});
let unlocking=false;
$('#login-form').onsubmit=async event=>{
  event.preventDefault();if(unlocking)return;unlocking=true;
  const button=$('#unlock-button');button.disabled=true;button.querySelector('span').textContent='Unlocking…';$('#login-form').setAttribute('aria-busy','true');$('#login-error').textContent='';$('#admin-token').readOnly=true;
  token=$('#admin-token').value;
  try{await unlockDashboard();try{sessionStorage.setItem(loginStorageKey,token);}catch{notify('Dashboard unlocked. Browser storage is unavailable; refreshing will require your token.');}}
  catch(error){forgetLogin();loginError(error);$('#admin-token').focus();}
  finally{unlocking=false;button.disabled=false;button.querySelector('span').textContent='Unlock dashboard';$('#login-form').removeAttribute('aria-busy');$('#admin-token').readOnly=false;}
};
$('#logout').onclick=()=>{forgetLogin();configuration=null;location.reload();};
$('#recommended').onclick=run(async()=>{
  if(!confirm('Restore and save recommended discovery settings? Saved branding, delivery mode, token, and mappings are kept. Unsaved form edits will be discarded.')) return;
  await api('settings/recommended','POST',{});await loadSettings();await status();notify('Recommended discovery settings restored.');
});
$('#settings-form').onsubmit=run(async()=>{
  const form=$('#settings-form'), next={...configuration};
  for(const key of Object.keys(configuration)) {const input=form.elements.namedItem(key);if(!input)continue;next[key]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;}
  next.dmmHashlists=form.elements.namedItem('dmmHashlists').value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  next.sources=[...document.querySelectorAll('#sources input:checked')].map(el=>el.value);
  next.excludeQualities=[...document.querySelectorAll('#qualities input:checked')].map(el=>el.value);
  saveState('saving');const button=$('button.save');button.disabled=true;
  const savingControls=[...document.querySelectorAll('input[form="settings-form"],select[form="settings-form"],textarea[form="settings-form"],#sources input,#qualities input')].map(el=>[el,el.disabled]);
  for(const [el] of savingControls)el.disabled=true;
  let persisted=false;
  try {await api('settings','PUT',next);persisted=true;savedSettingsFingerprint=settingsFingerprint();configuration={...next,rdToken:''};await loadSettings();notify('Configuration saved. Existing installation uses the new settings.');}
  catch(error){saveState(persisted?'saved':'failed');if(persisted)throw new Error('Configuration saved, but dashboard refresh failed: '+error.message);throw error;}finally{button.disabled=false;for(const [el,disabled] of savingControls)el.disabled=disabled;}
  await status();
});
const searchInput=()=>({type:$('#media-type').value,id:$('#media-id').value.trim()});
let searchRunning=false,latestWatchlist=[];
function updateMonitoring(){const input=searchInput();$('#monitor-status').textContent=!input.id?'Choose a title to see its monitoring status.':latestWatchlist.includes(`${input.type}/${input.id}`)?'This exact movie or episode is monitored.':'This exact movie or episode is not monitored.';}
$('#media-type').addEventListener('change',updateMonitoring);$('#media-id').addEventListener('input',updateMonitoring);
$('#search-form').onsubmit=run(async()=>{
  if(searchRunning)return;searchRunning=true;$('#search-status').textContent='Searching your index and enabled sources…';$('#search-status').dataset.state='searching';
  excludedPager?.dispose();excludedPager=null;
  const button=$('#search-button');button.disabled=true;button.textContent='Searching…';$('#results').replaceChildren(node('p','Checking your index and enabled sources…'));
  try {const data=await api('search','POST',{...searchInput(),force:true});$('#results').replaceChildren(node('h3',`${data.selected.length} selected · ${data.rejected.length} excluded`));
    for(const release of data.selected){const row=node('div',null,'result');row.append(node('span',`${release.quality} · ${release.source}`,'quality'),node('div',release.title),node('p',`${release.confidence} · ${release.filePath || 'File not inspected'} · ${release.seeders ?? 'Unknown'} seeders`));
      if(release.rdFilenameAssessment.decision==='warn')row.append(node('p','RD filename warning: '+release.rdFilenameAssessment.reasons.flatMap(r=>r.matches.map(m=>m.literal)).join(', '),'excluded'));
      if(release.source==='manual'){const remove=node('button','Remove mapping','secondary');remove.onclick=run(async()=>{await api(`import/${release.id}`,'DELETE');row.remove();data.selected=data.selected.filter(item=>item.id!==release.id);$('#results h3').textContent=`${data.selected.length} selected · ${data.rejected.length} excluded`;$('#search-status').textContent=`Completed: ${data.selected.length} selected · ${data.rejected.length} excluded.`;await status();});row.append(remove);}$('#results').append(row);}
    if(!data.selected.length)$('#results').append(node('p',data.rejected.length ? 'Matching observations were excluded. Expand the explanations below to see which settings or missing file information prevented selection.' : 'No matching indexed observations were found. Check source health below; unavailable sources or limited coverage can leave a search empty.','muted'));
    if(data.rejected.length){const details=node('details'),list=node('div');list.id='excluded-results';details.append(node('summary','Explain excluded results'),list);for(const row of data.rejected)list.append(node('p',`${row.title} (${row.source || 'unknown source'}): ${row.reason}`,'muted'));$('#results').append(details);excludedPager=paginateList('#excluded-results',3);}
    $('#search-status').textContent=`Completed: ${data.selected.length} selected · ${data.rejected.length} excluded.`;$('#search-status').dataset.state='completed';await status();
  } catch(error){$('#results').replaceChildren(node('p',`Search failed: ${error.message}`,'excluded'));$('#search-status').textContent='Search failed: '+error.message;$('#search-status').dataset.state='error';throw error;}
  finally{searchRunning=false;button.disabled=false;button.textContent='Search sources';}
});
$('#watch').onclick=run(async()=>{await api('watch','POST',searchInput());await status();notify('Added to monitored titles.');});
$('#refresh').onclick=run(async()=>{const button=$('#refresh');button.disabled=true;try{await status();}catch(error){$('#search-cooldown').textContent='Status refresh failed: '+error.message;throw error;}finally{button.disabled=false;}});
$('#copy').onclick=run(async()=>{await navigator.clipboard.writeText($('#manifest-url').value);notify('Private manifest URL copied.');});
$('#rotate').onclick=run(async()=>{if(!confirm('Revoke the current installation URL? You will need to reinstall the addon in Stremio.'))return;setInstall((await api('rotate-token','POST',{})).installUrl);notify('Old installation URL revoked.');});
$('#cleanup').onclick=run(async()=>{await api('cleanup','POST',{});await status();notify('Cleanup pass complete; manual mappings kept.');});
$('#rd-test').onclick=run(async()=>{const info=$('#playback-verification'),button=$('#rd-test');if(button.disabled)return;const generation=verificationGeneration;button.disabled=true;$('#rd-status').textContent='Testing saved account…';$('#rd-status').dataset.state='testing';info.replaceChildren(node('span','Testing account…','status-label neutral'));try{const result=await api('rd-test','POST',{});if(generation!==verificationGeneration)return;info.replaceChildren(node('span','Verified','status-label success'),node('small',`${result.type||'Account'} · checked ${new Date().toLocaleTimeString()}`));$('#rd-status').textContent='Verified: saved account connected successfully.';$('#rd-status').dataset.state='completed';notify(`Real-Debrid connected: ${result.type || 'account'}`);}catch(error){if(generation!==verificationGeneration)return;info.replaceChildren(node('span','Verification failed','status-label error'),node('small',error.message));$('#rd-status').textContent='Account verification failed: '+error.message;$('#rd-status').dataset.state='error';throw error;}finally{button.disabled=false;}});
$('#rd-clear').onclick=run(async()=>{const button=$('#rd-clear');if(button.disabled)return;button.disabled=true;$('#rd-status').textContent='Removing saved token…';try{await api('rd-token','DELETE');await loadSettings();notify('Provider token removed. Streaming is disabled until a token is saved.');}catch(error){$('#rd-status').textContent='Could not remove token: '+error.message;$('#rd-status').dataset.state='error';throw error;}finally{button.disabled=false;}});
$('#import-form').onsubmit=run(async()=>{const result=await api('import','POST',JSON.parse($('#import-json').value));notify(`${result.imported} mappings imported; ${result.excluded || 0} excluded by the indexing filename policy.`);$('#import-json').value='';await status();});

let formatRequest=0,formatTimer;
async function updateFormatPreview(){
  const request=++formatRequest;
  const form=$('#settings-form').elements;
  try{const result=await api('formatter-preview','POST',{name:form.namedItem('name').value,sourceFormat:form.namedItem('sourceFormat').value,formatIcons:form.namedItem('formatIcons').checked,formatSeeders:form.namedItem('formatSeeders').checked});
  if(request===formatRequest)$('#format-sample').replaceChildren(node('span',result.name,'preview-name'),node('span',result.title,'preview-description'));}
  catch(error){if(request===formatRequest)$('#format-sample').textContent='Preview unavailable: '+error.message;}
}
function queueFormatPreview(){clearTimeout(formatTimer);formatTimer=setTimeout(updateFormatPreview,180);}
$('#format-preview').onclick=run(updateFormatPreview);
for(const type of ['input','change'])$('#panel-appearance').addEventListener(type,event=>{if(['name','sourceFormat','formatIcons','formatSeeders'].includes(event.target.name))queueFormatPreview();});

$('#filename-preview').onclick=run(async()=>{
  const result=await api('filename-cleanup');
  $('#filename-report').textContent=JSON.stringify(result,null,2);$('#filename-details').hidden=false;$('#filename-summary').textContent=`${result.scanned} scanned · ${result.matched} matched · ${result.removed} removed · details`;
  $('#filename-remove').hidden=result.matched===0;
  $('#panel-library').revealControl($('#filename-details'));
  $('#filename-details').open=true;
});
$('#filename-remove').onclick=run(async()=>{
  if(!confirm('Delete all current filename-rule matches, including matching manual imports? Keep the indexing block enabled to prevent re-import.'))return;
  const result=await api('filename-cleanup','POST',{});
  $('#filename-report').textContent=JSON.stringify(result,null,2);$('#filename-details').hidden=false;$('#filename-summary').textContent=`${result.scanned} scanned · ${result.matched} matched · ${result.removed} removed · details`;$('#filename-remove').hidden=true;
  await status();notify(result.removed+' matching release records removed.');
});

async function loadProfiles() {
  $('#profiles-feedback').textContent='Refreshing profiles…';$('#profiles-refresh').disabled=true;
  let data;try{data=await api('profiles');}catch(error){$('#profiles-feedback').textContent='Could not load profiles: '+error.message;$('#profiles-feedback').dataset.state='error';$('#profile-list').replaceChildren(node('p','Could not load profiles: '+error.message,'excluded'));throw error;}finally{$('#profiles-refresh').disabled=false;}
  $('#profiles-feedback').textContent='';$('#profiles-feedback').dataset.state='';$('#profile-list').replaceChildren();
  $('#profile-count').textContent=String(data.profiles.length);
  $('#profile-capacity').textContent=data.policy?`${data.profiles.length} of ${data.policy.capacity} profiles`:`${data.profiles.length} profiles`;
  $('#invitation-policy').replaceChildren();if(data.policy){$('#invitation-policy').append(node('span',data.policy.inviteUses===1?'One use':`${data.policy.inviteUses} uses`,'quiet-badge'),node('span',`Expires in ${data.policy.inviteLifetimeMs/3600000} hours`,'quiet-badge'));}
  if(!data.profiles.length){const empty=node('div',null,'profiles-empty');empty.append(dashboardIcon('users'),node('h3','No invited profiles yet'),node('p','Create an invitation using the form to get started.','muted'));$('#profile-list').append(empty);}
  for(const profile of data.profiles) {
    const row=node('div',null,'profile-row'),info=node('div');
    const state=profile.disabled?'Revoked':profile.claimed?'Active':profile.invite_expires<Date.now()?'Invitation expired':'Invitation pending';
    info.append(node('strong',profile.label),node('p',state,'muted'));
    const actions=node('div',null,'actions');
    if(!profile.disabled) {
      const revoke=node('button','Revoke','secondary');revoke.type='button';
      revoke.onclick=run(async()=>{if(!confirm(`Revoke access for ${profile.label}? Their private links will stop working.`))return;await api(`profiles/${profile.id}/revoke`,'POST',{});await loadProfiles();notify('Profile access revoked.');});
      actions.append(revoke);
    }
    const remove=node('button','Remove','secondary');remove.type='button';
    remove.onclick=run(async()=>{if(!confirm(`Permanently remove ${profile.label} and their saved settings?`))return;await api(`profiles/${profile.id}`,'DELETE');await loadProfiles();notify('Profile removed.');});
    actions.append(remove);row.append(info,actions);$('#profile-list').append(row);
  }
}
$('#invite-form').onsubmit=run(async()=>{
  const button=$('#invite-form button');if(button.disabled)return;button.disabled=true;$('#invite-feedback').textContent='Creating invitation…';$('#invite-feedback').dataset.state='';
  let created=false;
  try {
    const data=await api('profiles','POST',{label:$('#invite-label').value.trim()});
    created=true;
    $('#invite-url').value=data.inviteUrl;$('#invite-expiry').textContent='Expires '+new Date(data.expires).toLocaleString()+'. This link is shown only now.';
    $('#invite-result').hidden=false;$('#invite-label').value='';$('#invite-feedback').textContent='Invitation created. Share the link privately.';await loadProfiles();
  } catch(error){$('#invite-feedback').textContent=(created?'Invitation created, but profiles could not refresh: ':'Could not create invitation: ')+error.message;$('#invite-feedback').dataset.state='error';throw error;} finally {button.disabled=false;}
});
$('#invite-copy').onclick=run(async()=>{await navigator.clipboard.writeText($('#invite-url').value);notify('Invitation copied. Share it privately.');});
$('#profiles-refresh').onclick=run(loadProfiles);
const dashboardTabs=[...document.querySelectorAll('[role=tab]')];
function showDashboardTab(tab) {
  for(const item of dashboardTabs){const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;document.getElementById(item.getAttribute('aria-controls')).hidden=!selected;}
  document.querySelector('.dashboard-content').scrollTop=0;
  window.dispatchEvent(new Event('dashboard-layout'));
  if(tab.id==='tab-users')loadProfiles().catch(error=>notify(error.message));
}
for(const [index,tab] of dashboardTabs.entries()){
  tab.addEventListener('click',()=>showDashboardTab(tab));
  tab.addEventListener('keydown',event=>{
    let next;if(['ArrowRight','ArrowDown'].includes(event.key))next=(index+1)%dashboardTabs.length;
    if(['ArrowLeft','ArrowUp'].includes(event.key))next=(index+dashboardTabs.length-1)%dashboardTabs.length;
    if(event.key==='Home')next=0;if(event.key==='End')next=dashboardTabs.length-1;
    if(next!==undefined){event.preventDefault();showDashboardTab(dashboardTabs[next]);dashboardTabs[next].focus();}
  });
}
function settingsFingerprint(){
  return JSON.stringify([...document.querySelectorAll('input[form="settings-form"],select[form="settings-form"],textarea[form="settings-form"],#sources input,#qualities input')].map(el=>[el.name||el.value,el.type==='checkbox'?el.checked:el.value]));
}
function markSettingsChanged(event){
  if(event.target.form?.id==='settings-form'||event.target.closest('#sources,#qualities'))saveState(settingsFingerprint()===savedSettingsFingerprint?'saved':'dirty');
}
$('#dashboard').addEventListener('input',markSettingsChanged);
$('#dashboard').addEventListener('change',markSettingsChanged);
// Native validation must reveal the section containing an invalid control.
$('#dashboard').addEventListener('invalid',event=>{
  const panel=event.target.closest('[role=tabpanel]');
  if(panel?.hidden)showDashboardTab(document.getElementById(panel.getAttribute('aria-labelledby')));
},true);

// Restore only after all dashboard controls are initialized.
(async()=>{
  try{token=sessionStorage.getItem(loginStorageKey)||'';}catch{return;}
  if(!token)return;
  try{await unlockDashboard();}
  catch(error){if(error.status===401||error.status===403)forgetLogin();loginError(error,true);}
})();

async function dmmStatus(){const data=await api('dmm');$('#dmm-report').textContent=JSON.stringify(data,null,2);$('#panel-library').revealControl($('#dmm-report'));$('#dmm-report-details').open=true;}
$('#dmm-run').onclick=run(async()=>{await api('dmm','POST',{});notify('Sync requested. Automatic batches run at most once per minute.');await dmmStatus();});
$('#dmm-status').onclick=run(dmmStatus);

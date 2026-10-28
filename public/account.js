'use strict';
const $=selector=>document.querySelector(selector);
const storageKey='lantern.profile.access';
let access='',settings;
let invite;
const notify=message=>{$('#account-notice').textContent=message;};
function remember() {try{sessionStorage.setItem(storageKey,access);}catch{notify('Browser storage is unavailable. Save your management link before refreshing.');}}
function lock() {
  access='';settings=null;try{sessionStorage.removeItem(storageKey);}catch{}
  $('#account-profile').hidden=true;$('#account-entry').hidden=false;$('#account-login').hidden=false;
  $('#claim-panel').hidden=true;$('#account-lock').hidden=true;
  $('#profile-form').reset();$('#profile-management-url').value='';$('#profile-install-url').value='';
  $('#profile-install').href='#';
}
async function api(path,method='GET',body) {
  const requestedAccess=access;
  try {
  const response=await fetch('/profile-api/'+path,{method,signal:AbortSignal.timeout(60000),headers:{Authorization:'Bearer '+access,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok){if(response.status===401 && access===requestedAccess)lock();throw Error(data.error||'Request failed');}
  return data;
  } catch(error) {
    if(error.name==='TimeoutError')throw Error('Request timed out. Refresh before retrying; the server may have completed the operation.');
    if(error instanceof SyntaxError)throw Error('Unexpected server response. Check the connection and reverse proxy.');
    throw error;
  }
}
const run=fn=>async event=>{
  event?.preventDefault();const control=event?.currentTarget;
  if(control?.dataset.busy==='true')return;
  if(control)control.dataset.busy='true';
  const buttons=control?.tagName==='FORM'?[...control.querySelectorAll('button')]:control?.tagName==='BUTTON'?[control]:[];
  const states=buttons.map(button=>[button,button.disabled]);for(const [button] of states)button.disabled=true;
  try{await fn();}catch(error){notify(error.message);}
  finally{for(const [button,disabled] of states)button.disabled=disabled;if(control)delete control.dataset.busy;}
};
function setInstall(url){$('#profile-install-url').value=url;$('#profile-install').href=url.replace(/^https?:\/\//,'stremio://');}
async function load() {
  const requestedAccess=access,data=await api('settings');
  if(!access || access!==requestedAccess)return;
  settings=data.settings;
  $('#profile-label').textContent=data.label;$('#account-brand').textContent=data.name;
  const form=$('#profile-form');
  for(const [key,value] of Object.entries(settings)) {
    const input=form.elements.namedItem(key);if(!input)continue;
    if(input.type==='checkbox')input.checked=value;else input.value=value;
  }
  $('#profile-rd-status').textContent=data.rdTokenSet?'Your token is saved. Leave the field blank to keep it.':'Add your own token to enable streaming.';
  $('#profile-qualities').replaceChildren();
  for(const quality of ['2160p','1080p','720p','480p','unknown']) {
    const label=document.createElement('label'),input=document.createElement('input');label.className='check';
    input.type='checkbox';input.value=quality;input.checked=settings.excludeQualities.includes(quality);
    label.append(input,document.createTextNode(quality));$('#profile-qualities').append(label);
  }
  $('#profile-management-url').value=location.origin+'/account#key='+access;
  setInstall(data.installUrl);$('#account-entry').hidden=true;$('#account-profile').hidden=false;$('#account-lock').hidden=false;
}
$('#claim-invite').onclick=run(async()=>{
  const button=$('#claim-invite');button.disabled=true;
  try {
    const data=await api('claim','POST',{invite});access=data.manageToken;remember();
    history.replaceState(null,'','/account');await load();notify('Profile created. Save your private management link, then add your own Real-Debrid token.');
  } finally {button.disabled=false;}
});
$('#account-login').onsubmit=run(async()=>{
  let value=$('#management-access').value.trim();
  if(value.includes('#')){const url=new URL(value);if(url.origin!==location.origin)throw Error('Use the management link for this server.');value=new URLSearchParams(url.hash.slice(1)).get('key')||'';}
  if(!/^[a-f0-9]{64}$/.test(value))throw Error('Enter your private management link or 64-character access key.');
  access=value;await load();remember();$('#management-access').value='';notify('Profile unlocked.');
});
$('#profile-form').onsubmit=run(async()=>{
  const next={...settings},form=$('#profile-form');
  for(const key of Object.keys(next)){const input=form.elements.namedItem(key);if(input)next[key]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;}
  next.excludeQualities=[...document.querySelectorAll('#profile-qualities input:checked')].map(el=>el.value);
  await api('settings','PUT',next);await load();notify('Your settings are saved.');
});
$('#account-lock').onclick=()=>{lock();notify('Profile locked. Use your management link to return.');};
$('#profile-rd-test').onclick=run(async()=>{const result=await api('rd-test','POST',{});notify('Real-Debrid connected: '+result.type);});
$('#profile-rd-clear').onclick=run(async()=>{await api('rd-token','DELETE');await load();notify('Your Real-Debrid token was removed.');});
$('#profile-rotate').onclick=run(async()=>{if(!confirm('Replace your private installation link? You will need to reinstall Lantern in Stremio.'))return;setInstall((await api('rotate-token','POST',{})).installUrl);notify('Installation link replaced.');});
$('#copy-management').onclick=run(async()=>{await navigator.clipboard.writeText($('#profile-management-url').value);notify('Management link copied. Keep it private.');});
$('#copy-profile-install').onclick=run(async()=>{await navigator.clipboard.writeText($('#profile-install-url').value);notify('Installation link copied.');});
async function openAccess() {
  const fragment=new URLSearchParams(location.hash.slice(1));
  invite=fragment.get('invite');
  if(invite){$('#account-profile').hidden=true;$('#account-entry').hidden=false;$('#claim-panel').hidden=false;$('#account-login').hidden=true;return;}
  access=fragment.get('key')||'';
  if(access){remember();history.replaceState(null,'','/account');}
  else try{access=sessionStorage.getItem(storageKey)||'';}catch{}
  if(access)try{await load();}catch(error){notify(error.message);}
}
window.addEventListener('hashchange',()=>{openAccess().catch(error=>notify(error.message));});
openAccess().catch(error=>notify(error.message));

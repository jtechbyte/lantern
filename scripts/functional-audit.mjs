// Real browser -> HTTP -> production handlers -> isolated PostgreSQL SQL.
// Only external metadata/source/provider transports are synthetic. No production access.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import lz from 'lz-string';
import { embeddedStore } from './lib/embedded-postgres.mjs';
import { Engine } from '../src/engine.mjs';
import { RealDebrid } from '../src/providers/real-debrid/client.mjs';
import { DmmImporter } from '../src/dmm.mjs';
import { createApp } from '../src/server.mjs';
import { settingsSchema } from '../src/config.mjs';

const store=await embeddedStore('b'.repeat(64));
await store.saveSettings({...await store.settings(),sources:[]});
let providerFails=false,providerCalls=0;
const rd=new RealDebrid(store,{transport:async url=>{
  providerCalls++;if(providerFails)throw Error('Synthetic provider unavailable');
  if(url.endsWith('/user'))return Buffer.from('{"type":"premium","expiration":"fixture"}');
  throw Error('Unexpected provider request');
}});
const dmm=new DmmImporter(store,async()=>'<iframe src="https://debridmediamanager.com/hashlist#'+lz.compressToEncodedURIComponent(JSON.stringify([{hash:'f'.repeat(40),filename:'Example.2020.1080p.mkv',bytes:1024}]))+'"></iframe>');
const engine=new Engine(store,{sources:{search:async()=>[]},metadataRequest:async()=>({meta:{name:'Example',releaseInfo:'2020'}})});
let handler,browser;
const server=createServer((req,res)=>handler(req,res));
const evidence=[];const pass=message=>{evidence.push(message);console.log('PASS '+message);};
const artifacts=resolve('artifacts');mkdirSync(artifacts,{recursive:true});
try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  handler=createApp({store,engine,rd,dmm,adminToken:'c'.repeat(64),signingKey:'b'.repeat(64),publicUrl:base});
  const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:existsSync(edge)?{executablePath:edge}:{})});
  const context=await browser.newContext({viewport:{width:1366,height:768}});
  // Isolated clipboard substitute verifies the exact handler output, not OS clipboard access.
  await context.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.auditClipboard=text;}}}));
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  async function reveal(selector,p=page){
    const locator=p.locator(selector).first();
    const panel=await locator.evaluate(el=>el.closest('[role=tabpanel]')?.id);
    if(panel){await p.locator(`[aria-controls="${panel}"]`).click();await locator.evaluate(el=>el.closest('.tab-panel').revealControl?.(el));}
    await locator.evaluate(el=>{for(let parent=el.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;});
    return locator;
  }
  const click=async(selector,p=page)=>(await reveal(selector,p)).click();
  const fill=async(selector,value,p=page)=>(await reveal(selector,p)).fill(value);
  const select=async(selector,value)=>(await reveal(selector)).selectOption(value);
  const check=async(selector,value)=>(await reveal(selector)).setChecked(value);
  const notice=pattern=>page.waitForFunction(pattern=>new RegExp(pattern).test(document.querySelector('#notice').textContent),pattern);
  const save=async()=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/settings')&&r.request().method()==='PUT');await click('button.save');assert.equal((await response).status(),200);await page.waitForFunction(()=>document.querySelector('#save-state').dataset.state==='saved');};
  await page.goto(base);await fill('#admin-token','c'.repeat(64));await click('#unlock-button');await page.waitForSelector('#dashboard:visible');
  const inventory=[];
  for(const tab of await page.locator('.dashboard-nav [role=tab]').all()){
    await tab.click();const panel=page.locator('#'+await tab.getAttribute('aria-controls'));
    const views=await panel.locator('.section-views button').all();
    for(const view of views.length?views:[null]){
      if(view)await view.click();
      inventory.push({section:await tab.textContent(),view:view?await view.textContent():null,
        controls:await panel.locator('button,input,select,textarea,summary,a').evaluateAll(elements=>elements.map(el=>({tag:el.tagName,id:el.id,name:el.name||'',type:el.type||'',text:el.tagName==='INPUT'||el.tagName==='TEXTAREA'?'':el.textContent.trim(),visible:!!el.getClientRects().length}))) });
    }
  }
  const endpoints=[...readFileSync('src/server.mjs','utf8').matchAll(/app\.(get|post|put|delete|use)\('([^']+)'/g)].map(([,method,path])=>({method,path}));
  writeFileSync(resolve(artifacts,'functional-inventory.json'),JSON.stringify({inventory,endpoints,settings:Object.keys(settingsSchema.shape)},null,2));
  pass('All eight sections and every subtab inventoried from rendered controls; API and settings inventory captured');

  const desired={name:'Audit Lantern',description:'Saved audit description',logo:'https://example.com/audit.png',sourceFormat:'detailed',formatIcons:false,formatSeeders:true,provider:'realdebrid',rdToken:'owner-fixture',sort:'size',rdFilenameMode:'off',maxResults:17,perQuality:3,maxSizeGB:12.5,minSeeders:2,preferLanguage:'spanish',excludeCam:false,refreshMinutes:120,blockIndexFilenames:false,dmmAuto:false,dmmHashlists:['https://debridmediamanager.github.io/hashlists/00011863-7c82-4d3c-846a-deeb5ac0d6be.html']};
  for(const [name,value] of Object.entries(desired)){
    const el=await reveal(`[name="${name}"]`);
    if(typeof value==='boolean')await el.setChecked(value);
    else if(await el.evaluate(el=>el.tagName==='SELECT'))await el.selectOption(value);
    else await el.fill(Array.isArray(value)?value.join('\n'):String(value));
  }
  await check('#sources input[value=dmm]',true);await check('#qualities input[value="480p"]',true);await save();
  const persisted=await store.settings();for(const [name,value] of Object.entries(desired))assert.deepEqual(persisted[name],value,name);
  assert.deepEqual(persisted.sources,['dmm']);assert.deepEqual(persisted.excludeQualities,['480p']);
  await page.reload();await page.waitForSelector('#dashboard:visible');
  for(const [name,value] of Object.entries(desired)){
    const el=page.locator(`[name="${name}"]`);
    if(typeof value==='boolean')assert.equal(await el.isChecked(),value,name);
    else assert.equal(await el.inputValue(),name==='rdToken'?'':Array.isArray(value)?value.join('\n'):String(value),name);
  }
  const manifest=await (await fetch(await page.inputValue('#manifest-url'))).json();
  assert.equal(manifest.name,desired.name);assert.equal(manifest.description,desired.description);assert.equal(manifest.logo,desired.logo);
  pass('Every owner setting saved to SQL and restored after browser refresh; token redacted; branding changes actual manifest');
  await fill('[name=description]','Committed despite readback outage');
  await page.route('**/api/settings',route=>route.request().method()==='GET'?route.fulfill({status:503,json:{error:'Readback unavailable'}}):route.continue());
  await click('button.save');await notice('Configuration saved, but dashboard refresh failed');
  assert.equal((await store.settings()).description,'Committed despite readback outage');
  await fill('[name=description]',desired.description);assert.equal(await page.getAttribute('#save-state','data-state'),'dirty');
  await fill('[name=description]','Committed despite readback outage');assert.equal(await page.getAttribute('#save-state','data-state'),'saved');
  await page.unroute('**/api/settings');await page.evaluate(()=>loadSettings());
  pass('Successful write with failed readback keeps the correct saved fingerprint; edits to the old value remain unsaved');
  for(const layout of ['clear','compact','detailed']){
    await select('[name=sourceFormat]',layout);
    const response=page.waitForResponse(r=>r.url().endsWith('/api/formatter-preview')&&r.request().postDataJSON()?.sourceFormat===layout);
    await click('#format-preview');const expected=await (await response).json();
    await page.waitForFunction(expected=>document.querySelector('#format-sample .preview-description')?.textContent===expected.title,expected);
  }
  await select('[name=sourceFormat]','detailed');
  await click('#rd-test');await page.waitForFunction(()=>document.querySelector('#rd-status').dataset.state==='completed');assert.equal(providerCalls,1);
  providerFails=true;await click('#rd-test');await page.waitForFunction(()=>document.querySelector('#rd-status').dataset.state==='error');providerFails=false;
  await click('#rd-clear');await notice('Provider token removed');assert.equal((await store.settings()).rdToken,'');
  pass('All formatter layouts and account test success/failure/token removal exercised through real endpoints with synthetic provider transport');

  await click('#dmm-run');await dmm.active;await click('#dmm-status');
  await page.waitForFunction(()=>document.querySelector('#dmm-report').textContent.includes('accepted'));
  assert.equal(Number((await store.db.query('SELECT count(*) AS n FROM dmm_candidates')).rows[0].n),1);
  const reportBefore=await page.locator('#dmm-report span:visible').allTextContents();
  await page.locator('#dmm-report + .list-pages button').last().click();
  assert.notDeepEqual(await page.locator('#dmm-report span:visible').allTextContents(),reportBefore);
  await page.locator('#dmm-report + .list-pages button').first().click();
  pass('DMM Run sync/Check status persisted candidate and report; report next/previous lines work (external hashlist transport fixture)');

  await fill('#import-json','not JSON');await click('#import-form button');await notice('Unexpected|JSON');
  const records=[{type:'movie',mediaId:'tt1234567',title:'Example 2020 1080p',infoHash:'a'.repeat(40),seeders:5,size:1024},{type:'movie',mediaId:'tt1234567',title:'Example 2020 WEBRip',infoHash:'d'.repeat(40),seeders:5,size:1024}];
  await fill('#import-json',JSON.stringify(records));await click('#import-form button');await notice('2 mappings imported');assert.equal((await store.releases('movie/tt1234567')).length,2);
  await click('#filename-preview');await page.waitForFunction(()=>document.querySelector('#filename-summary').textContent.includes('1 matched'));
  assert.equal((await store.releases('movie/tt1234567')).length,2,'preview must not delete');
  page.once('dialog',dialog=>dialog.dismiss());await click('#filename-remove');assert.equal((await store.releases('movie/tt1234567')).length,2);
  page.once('dialog',dialog=>dialog.accept());await click('#filename-remove');await notice('1 matching release records removed');assert.equal((await store.releases('movie/tt1234567')).length,1);
  await click('#cleanup');await notice('Cleanup pass complete');assert.equal((await store.releases('movie/tt1234567')).length,1);assert.ok(await store.get('maintenance:last'));
  pass('Invalid/manual JSON import, filename preview, cancel/confirm deletion and automatic cleanup verify SQL effects and manual retention');
  await fill('#media-id','invalid');await click('#search-button');await page.waitForFunction(()=>document.querySelector('#search-status').dataset.state==='error');
  await fill('#media-id','tt1234567');await click('#search-button');await page.waitForFunction(()=>document.querySelector('#search-status').dataset.state==='completed');
  assert.match(await page.textContent('#results h3'),/1 selected/);
  await click('#watch');await notice('Added to monitored');assert.deepEqual(await store.watchlist(),['movie/tt1234567']);
  await click('#watchlist button');await page.waitForFunction(()=>document.querySelector('#watched-count').textContent==='0');assert.deepEqual(await store.watchlist(),[]);
  for(let i=0;i<8;i++)await store.watch('movie/tt'+(2000000+i));
  await click('#refresh');await reveal('#watchlist');
  await page.waitForFunction(()=>document.querySelectorAll('#watchlist .watch-row:not([hidden])').length<8);
  const watchBefore=await page.locator('#watchlist .watch-row:visible').allTextContents();
  await page.locator('#watchlist + .list-pages button').last().click();
  assert.notDeepEqual(await page.locator('#watchlist .watch-row:visible').allTextContents(),watchBefore);
  await page.locator('#watchlist + .list-pages button').first().click();
  assert.deepEqual(await page.locator('#watchlist .watch-row:visible').allTextContents(),watchBefore);
  for(const key of await store.watchlist())await store.unwatch(key);
  await click('#results .result button');await page.waitForFunction(()=>document.querySelector('#count').textContent==='0');
  assert.match(await page.textContent('#results h3'),/0 selected/);assert.match(await page.textContent('#search-status'),/0 selected/);
  pass('Search invalid/success, monitor/unmonitor and mapping deletion update actual stored records and displayed counts');
  pass('Monitored-list next/previous pages expose all seeded records without losing them');
  await click('#tab-activity');
  await page.locator('#events .activity-row:visible button').first().click();await page.locator('.activity-dialog button').click();
  assert.equal(await page.locator('.activity-dialog').evaluate(el=>el.open),false);
  await page.locator('.activity-pages button').click();await page.waitForFunction(()=>document.querySelector('.activity-history tbody').children.length>0);
  await page.locator('.activity-history .section-head button').click();assert.equal(await page.locator('.activity-history').evaluate(el=>el.open),false);
  pass('Activity detail and full-history explicit Close buttons restore the main dashboard');

  await click('#copy');assert.equal(await page.evaluate(()=>window.auditClipboard),await page.inputValue('#manifest-url'));
  await page.evaluate(()=>{window.auditWrite=navigator.clipboard.writeText;navigator.clipboard.writeText=async()=>{throw Error('Clipboard permission denied');};});
  await click('#copy');await notice('Clipboard permission denied');await page.evaluate(()=>navigator.clipboard.writeText=window.auditWrite);
  assert.equal(await page.getAttribute('#install','href'),(await page.inputValue('#manifest-url')).replace(/^http:/,'stremio:'));
  const oldInstall=await page.inputValue('#manifest-url');page.once('dialog',dialog=>dialog.dismiss());await click('#rotate');assert.equal(await page.inputValue('#manifest-url'),oldInstall);
  assert.equal((await fetch(base+'/configure',{redirect:'manual'})).headers.get('location'),'/');
  assert.equal((await fetch(oldInstall.replace('manifest.json','configure'),{redirect:'manual'})).headers.get('location'),'/');
  page.once('dialog',dialog=>dialog.accept());await click('#rotate');await notice('Old installation URL revoked');
  assert.equal((await fetch(oldInstall)).status,404);assert.equal((await fetch(await page.inputValue('#manifest-url'))).status,200);
  pass('Owner copy/install target and cancelled/confirmed URL rotation checked; old manifest rejected, new manifest works (no Stremio client launch)');
  page.once('dialog',dialog=>dialog.accept());await click('#recommended');await notice('Recommended discovery settings restored');assert.equal((await store.settings()).name,desired.name);assert.deepEqual((await store.settings()).sources,['yts','eztv','apibay']);
  pass('Restore recommended actually persists defaults while preserving branding');
  for(let i=1;i<=6;i++)await store.putRelease('movie/tt1234567','manual',{infoHash:String(i).padStart(40,'0'),title:`Example 2020 1080p fixture ${i}`,quality:'1080p',seeders:i,size:1024,confidence:'manual-mapping'});
  await click('#search-button');await page.waitForFunction(()=>document.querySelector('#results h3')?.textContent==='5 selected · 1 excluded');
  await page.waitForFunction(()=>document.querySelectorAll('#results .result:not([hidden])').length<5);
  const resultBefore=await page.locator('#results .result:visible').allTextContents();await page.locator('#results + .list-pages button').last().click();
  assert.notDeepEqual(await page.locator('#results .result:visible').allTextContents(),resultBefore);await page.locator('#results + .list-pages button').first().click();
  assert.deepEqual(await page.locator('#results .result:visible').allTextContents(),resultBefore);
  pass('Search results next/previous pages retain the actual filtered result set');

  await fill('#invite-label','Audit guest');await click('#invite-form button');await page.waitForSelector('#invite-result:visible');
  await click('#invite-copy');assert.equal(await page.evaluate(()=>window.auditClipboard),await page.inputValue('#invite-url'));
  const invitation=await page.inputValue('#invite-url');const guest=await context.newPage();guest.on('pageerror',error=>errors.push(error.message));
  await guest.goto(invitation);await guest.click('#claim-invite');await guest.waitForSelector('#account-profile:visible');
  const management=await guest.inputValue('#profile-management-url');const install=await guest.inputValue('#profile-install-url');
  assert.equal((await fetch(install.replace('manifest.json','configure'),{redirect:'manual'})).headers.get('location'),'/account');
  await guest.click('#copy-management');assert.equal(await guest.evaluate(()=>window.auditClipboard),management);
  await guest.click('#copy-profile-install');assert.equal(await guest.evaluate(()=>window.auditClipboard),install);
  const guestDesired={rdToken:'guest-fixture',maxResults:9,perQuality:2,maxSizeGB:7.5,preferLanguage:'french',excludeCam:false,sort:'size',rdFilenameMode:'hide',sourceFormat:'compact',formatIcons:false,formatSeeders:true};
  for(const [name,value] of Object.entries(guestDesired)){
    const el=await reveal(`[name=${name}]`,guest);
    if(typeof value==='boolean')await el.setChecked(value);else if(await el.evaluate(el=>el.tagName==='SELECT'))await el.selectOption(value);else await el.fill(String(value));
  }
  await (await reveal('#profile-qualities input[value="480p"]',guest)).check();
  await guest.click('#profile-form button:not([type="button"])');
  await guest.waitForFunction(()=>document.querySelector('#account-notice').textContent==='Your settings are saved.');
  await guest.reload();await guest.waitForSelector('#account-profile:visible');assert.equal(await guest.inputValue('[name=maxResults]'),'9');assert.equal(await guest.inputValue('[name=rdToken]'),'');
  const access=new URLSearchParams(new URL(management).hash.slice(1)).get('key');
  const profileRow=(await store.db.query('SELECT secret FROM profiles WHERE claimed=true')).rows[0];assert.equal(store.decrypt(profileRow.secret).preferences.rdToken,'guest-fixture');
  for(const [name,value] of Object.entries(guestDesired))assert.deepEqual(store.decrypt(profileRow.secret).preferences[name],value,name);
  assert.deepEqual(store.decrypt(profileRow.secret).preferences.excludeQualities,['480p']);
  await guest.click('#profile-rd-test');await guest.waitForFunction(()=>document.querySelector('#account-notice').textContent.includes('Real-Debrid connected'));
  let requests=0;await guest.route('**/profile-api/rd-test',async route=>{requests++;await new Promise(resolve=>setTimeout(resolve,250));await route.continue();});
  await guest.click('#profile-rd-test');assert.equal(await guest.locator('#profile-rd-test').isDisabled(),true);
  await guest.locator('#profile-rd-test').dispatchEvent('click');
  await guest.waitForFunction(()=>!document.querySelector('#profile-rd-test').disabled);assert.equal(requests,1);
  await guest.unroute('**/profile-api/rd-test');
  providerFails=true;await guest.click('#profile-rd-test');await guest.waitForFunction(()=>document.querySelector('#account-notice').textContent.includes('Account check failed'));providerFails=false;
  await guest.click('#profile-rd-clear');await guest.waitForFunction(()=>document.querySelector('#account-notice').textContent.includes('token was removed'));
  assert.equal(store.decrypt((await store.db.query('SELECT secret FROM profiles WHERE claimed=true')).rows[0].secret).preferences.rdToken,'');
  guest.once('dialog',dialog=>dialog.accept());await click('#profile-rotate',guest);await guest.waitForFunction(()=>document.querySelector('#account-notice').textContent.includes('Installation link replaced'));
  assert.equal((await fetch(install)).status,404);
  pass('Invitation creation/copy/claim, guest save/refresh/copy links/provider tests/token removal/link replacement verify actual profile storage and access');
  pass('Busy guest account-test control rejects duplicate submissions');

  // Pause a genuine settings response and lock while it is in flight.
  let releaseResponse,requested;
  const pending=new Promise(resolve=>requested=resolve);
  await guest.route('**/profile-api/settings',async route=>{const response=await route.fetch();requested();await new Promise(resolve=>releaseResponse=resolve);await route.fulfill({response});});
  await guest.evaluate(()=>{window.auditLoad=load();});await pending;
  await guest.click('#account-lock');releaseResponse();await guest.evaluate(()=>window.auditLoad);
  assert.equal(await guest.isVisible('#account-profile'),false,'late load must not unlock a locked profile');
  await guest.unroute('**/profile-api/settings');await guest.fill('#management-access',management);await guest.click('#account-login button');await guest.waitForSelector('#account-profile:visible');
  pass('Guest Lock prevents late settings response from reopening profile; management-link login still works');
  await click('#profiles-refresh');await page.waitForFunction(()=>document.querySelector('#profile-count').textContent==='1');
  page.once('dialog',dialog=>dialog.accept());await click('#profile-list button:text-is("Revoke")');await notice('Profile access revoked');
  assert.equal((await fetch(base+'/profile-api/settings',{headers:{Authorization:'Bearer '+access}})).status,401);
  page.once('dialog',dialog=>dialog.accept());await click('#profile-list button:text-is("Remove")');await notice('Profile removed');
  assert.equal(Number((await store.db.query('SELECT count(*) AS n FROM profiles')).rows[0].n),0);
  pass('Admin refresh/revoke/remove updates profile count, erases access and deletes only isolated profile');
  await page.evaluate(async()=>{for(let i=0;i<6;i++)await api('profiles','POST',{label:'Pager fixture '+i});});
  await click('#profiles-refresh');await page.waitForFunction(()=>document.querySelectorAll('#profile-list .profile-row').length===6 && document.querySelectorAll('#profile-list .profile-row:not([hidden])').length<6);
  const profilesBefore=await page.locator('#profile-list .profile-row:visible').allTextContents();
  await page.locator('#profile-list + .list-pages button').last().click();assert.notDeepEqual(await page.locator('#profile-list .profile-row:visible').allTextContents(),profilesBefore);
  await page.locator('#profile-list + .list-pages button').first().click();assert.deepEqual(await page.locator('#profile-list .profile-row:visible').allTextContents(),profilesBefore);
  await page.evaluate(async()=>{for(const profile of (await api('profiles')).profiles)await api('profiles/'+profile.id,'DELETE');});await click('#profiles-refresh');
  pass('Guest advanced settings persist; all configure redirects, clipboard-denial feedback, and profile-list paging exercised');
  await page.screenshot({path:resolve(artifacts,'functional-users-1366x768.png')});
  assert.deepEqual(errors,[]);pass('No browser JavaScript errors');
  writeFileSync(resolve(artifacts,'functional-results.json'),JSON.stringify(evidence,null,2));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));await store.close();}

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { embeddedStore } from './lib/embedded-postgres.mjs';
import { Engine } from '../src/engine.mjs';
import { RealDebrid } from '../src/providers/real-debrid/client.mjs';
import { createApp } from '../src/server.mjs';
import { LatestTitles } from '../src/latest-titles.mjs';

// Isolated fixtures: no source discovery, provider requests, or real credentials.
const directory = mkdtempSync(join(tmpdir(), 'lantern-browser-'));
const store = await embeddedStore('b'.repeat(64));
await store.saveSettings({ ...(await store.settings()), sources: [] });
const engine = new Engine(store, { sources: { search: async () => [] }, metadataRequest: async () => ({ meta: { name: 'Example', releaseInfo: '2020' } }) });
const rd = new RealDebrid(store);
let handler, browser;
const server = createServer((req,res) => handler(req,res));
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const appOptions={store,engine,rd,latest:new LatestTitles(store,{request:async()=>{throw Error('Offline test');}}),publicUrl:base,adminToken:'c'.repeat(64),signingKey:'b'.repeat(64)};
  handler=createApp(appOptions);
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.BROWSER_PATH || (existsSync(edge) ? edge : undefined);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // Reveal a control's tab; Playwright scrolls when a narrow screen needs it.
  for (const method of ['click','fill','selectOption','check']) {
    const original=page[method].bind(page);
    page[method]=async(selector,...args)=>{
      const panel=await page.locator(selector).first().evaluate(el=>el.closest('.tab-panel')?.id).catch(()=>null);
      if(panel && await page.locator('#'+panel).isHidden())await page.locator('[aria-controls="'+panel+'"]').click();
      if(panel)await page.locator(selector).first().evaluate(el=>el.closest('.tab-panel')?.revealControl?.(el));
      return original(selector,...args);
    };
  }
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text()); });
  await page.goto(base);
  const loginArtifacts=resolve('artifacts');mkdirSync(loginArtifacts,{recursive:true});
  for (const [width,height] of [[1920,1080],[1366,768],[1280,720],[1024,600],[390,844],[375,667],[320,568]]) {
    await page.setViewportSize({width,height});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth && (innerHeight<720 || innerWidth<600 || document.documentElement.scrollHeight<=innerHeight)),true,`Login must fit ${width}x${height}`);
    const button=await page.locator('#unlock-button').boundingBox();
    if(width>=600&&height>=720)assert.ok(button.y>=0 && button.y+button.height<=height,'Login action stays visible');
    if(width===1366)await page.screenshot({path:join(loginArtifacts,'login-desktop.png')});
    if(width===390)await page.screenshot({path:join(loginArtifacts,'login-mobile.png')});
  }
  // A short viewport/onscreen keyboard must allow scrolling, never clip the form.
  await page.setViewportSize({width:320,height:400});
  await page.locator('#unlock-button').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#unlock-button').isVisible(),true);
  await page.setViewportSize({width:1440,height:1000});
  assert.equal(await page.getAttribute('#admin-token','type'),'password');
  let toggleSubmissions=0;
  const countToggleRequests=request=>{if(new URL(request.url()).pathname==='/api/settings')toggleSubmissions++;};
  page.on('request',countToggleRequests);
  await page.fill('#admin-token','incorrect-token');
  await page.locator('#admin-token').press('Tab');
  assert.equal(await page.locator('#toggle-token').evaluate(el=>el===document.activeElement),true);
  await page.locator('#toggle-token').press('Space');
  assert.equal(await page.getAttribute('#admin-token','type'),'text');
  assert.equal(await page.getAttribute('#toggle-token','aria-label'),'Hide admin token');
  assert.equal(await page.getAttribute('#toggle-token','type'),'button');
  assert.equal(await page.getAttribute('#toggle-token','aria-pressed'),'true');
  assert.equal(await page.locator('#toggle-token').evaluate(el=>el.matches(':focus-visible')&&getComputedStyle(el).outlineStyle!=='none'),true,'Keyboard toggle has a visible focus ring');
  await page.locator('#toggle-token').press('Space');
  assert.equal(await page.getAttribute('#admin-token','type'),'password');
  await page.locator('#toggle-token').press('Tab');
  assert.equal(await page.locator('#unlock-button').evaluate(el=>el===document.activeElement&&el.matches(':focus-visible')&&getComputedStyle(el).outlineStyle!=='none'),true,'Tab reaches the unlock action with visible focus');
  assert.equal(toggleSubmissions,0,'Show/hide does not submit credentials');page.off('request',countToggleRequests);
  const initialCard=await page.locator('#login').boundingBox();
  await page.locator('#admin-token').press('Enter');
  await page.waitForFunction(()=>document.querySelector('#login-error').textContent.includes('Invalid admin token'));
  assert.deepEqual(await page.locator('#login').boundingBox(),initialCard,'Inline errors must not move the card');
  assert.equal(await page.getAttribute('#admin-token','aria-invalid'),'true');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('lantern.admin.tab')),null);
  await page.route('**/api/settings',route=>route.fulfill({status:503,json:{error:'Fixture unavailable'}}));
  await page.fill('#admin-token','c'.repeat(64));await page.locator('#admin-token').press('Enter');
  await page.waitForFunction(()=>document.querySelector('#login-error').textContent.includes('Could not connect'));
  assert.deepEqual(await page.locator('#login').boundingBox(),initialCard);
  await page.screenshot({path:join(loginArtifacts,'login-error.png')});
  await page.unroute('**/api/settings');
  for(const [width,height] of [[1366,768],[1024,576],[853,480],[640,360],[390,400],[320,400]]){
    await page.setViewportSize({width,height});
    for(const status of [401,503]){
      await page.route('**/api/settings',route=>route.fulfill({status,json:{error:'Login verification fixture'}}));
      await page.fill('#admin-token','verification-fixture');
      const before=await page.locator('#login').evaluate(el=>({height:el.offsetHeight,button:document.querySelector('#unlock-button').offsetTop}));
      await page.locator('#admin-token').press('Enter');
      await page.waitForFunction(()=>document.querySelector('#login-error').textContent.length>0);
      assert.deepEqual(await page.locator('#login').evaluate(el=>({height:el.offsetHeight,button:document.querySelector('#unlock-button').offsetTop})),before,`Login errors keep layout stable at ${width}x${height}`);
      await page.locator('#unlock-button').scrollIntoViewIfNeeded();
      const geometry=await page.evaluate(()=>{const error=document.querySelector('#login-error').getBoundingClientRect(),button=document.querySelector('#unlock-button').getBoundingClientRect();return {bottom:error.bottom,top:button.top,buttonBottom:button.bottom,width:document.documentElement.scrollWidth};});
      assert.ok(geometry.bottom<=geometry.top&&geometry.top>=0&&geometry.buttonBottom<=height&&geometry.width<=width,'Error and unlock action remain accessible with keyboard-sized viewport');
      await page.unroute('**/api/settings');
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  let unlockRequests=0;
  await page.route('**/api/settings',async route=>{unlockRequests++;await new Promise(resolve=>setTimeout(resolve,400));await route.continue();});
  await page.fill('#admin-token', 'c'.repeat(64));
  await page.click('#unlock-button');
  assert.equal(await page.locator('#unlock-button').isDisabled(),true);
  assert.match(await page.textContent('#unlock-button'),/Unlocking/);
  await page.locator('#login-form').evaluate(form=>form.dispatchEvent(new Event('submit',{cancelable:true})));
  await page.waitForSelector('#dashboard:visible');
  assert.equal(unlockRequests,1,'Busy unlock rejects duplicate submissions');
  await page.unroute('**/api/settings');
  await page.reload();
  await page.waitForSelector('#dashboard:visible');
  assert.equal(await page.textContent('#brand'), 'Lantern');
  await page.click('#tab-library');
  assert.equal(await page.isChecked('[name=blockIndexFilenames]'),true);
  await page.click('#filename-preview');
  await page.waitForFunction(()=>document.querySelector('#filename-report').textContent.includes('matched'));
  assert.equal(await page.isVisible('#filename-remove'),false);
  await page.click('#tab-appearance');
  await page.selectOption('[name="sourceFormat"]','compact');
  await page.click('#format-preview');
  await page.waitForFunction(()=>document.querySelector('#format-sample').textContent.includes('5.24 GiB')&&!document.querySelector('#format-sample').textContent.includes('Example.Film'));
  assert.equal((await page.textContent('#format-sample')).includes('Example.Film'),false);
  await page.selectOption('[name="sourceFormat"]','clear');
  await page.click('#format-preview');
  await page.waitForFunction(()=>document.querySelector('#format-sample').textContent.includes('Example.Film'));
  assert.match(await page.textContent('#setup-status'), /Local address configured/);
  assert.equal(await page.locator('.brand-mark').evaluate(img=>img.complete && img.naturalWidth>0),true);
  await page.fill('input[name=name]', 'Lantern Test');
  await page.click('button.save');
  await page.waitForFunction(() => document.querySelector('#brand').textContent === 'Lantern Test');
  assert.equal((await store.settings()).name, 'Lantern Test');
  const installManifest=await page.inputValue('#manifest-url');
  assert.equal(await page.getAttribute('#install','href'),installManifest.replace(/^https?:\/\//,'stremio://'));
  const manifestResponse=await page.request.get(installManifest);assert.equal(manifestResponse.status(),200);
  assert.equal((await manifestResponse.json()).name,'Lantern Test','Installation manifest reflects saved backend configuration');
  page.once('dialog', dialog=>dialog.accept());
  await page.click('#tab-discovery');
  await page.click('#recommended');
  await page.waitForFunction(()=>document.querySelectorAll('#sources input:checked').length===3);
  assert.equal((await store.settings()).name,'Lantern Test');
  assert.deepEqual((await store.settings()).sources,['yts','eztv','apibay']);
  assert.match(await page.textContent('#health'),/Untested/);
  await page.click('#tab-appearance');
  await page.fill('input[name=name]', 'Lantern');
  await page.click('#tab-discovery');
  await page.check('#qualities input[value="720p"]');
  await page.click('button.save');
  await page.waitForFunction(() => document.querySelector('#brand').textContent === 'Lantern');
  await page.click('#tab-library');
  await page.click('#manual-import > summary');
  await page.click('#dmm-import > summary');
  assert.equal(await page.locator('#manual-import').getAttribute('open'),null);
  const sampleList='https://debridmediamanager.github.io/hashlists/00011863-7c82-4d3c-846a-deeb5ac0d6be.html';
  assert.equal(await page.isChecked('[name=dmmAuto]'),true);
  await page.click('#dmm-import details > summary');
  await page.fill('[name=dmmHashlists]',sampleList);
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/settings')&&r.request().method()==='PUT');
  await page.click('button.save');assert.equal((await saved).status(),200);
  await page.reload();await page.waitForSelector('#dashboard:visible');
  await page.click('#tab-library');await page.click('#dmm-import > summary');
  assert.equal(await page.inputValue('[name=dmmHashlists]'),sampleList);
  await page.click('#dmm-status');await page.waitForFunction(()=>document.querySelector('#dmm-report').textContent.includes('active'));
  await page.click('#manual-import > summary');
  await page.fill('#import-json', JSON.stringify([
    { type:'movie', mediaId:'tt1234567', title:'Example 2020 1080p', infoHash:'a'.repeat(40), seeders:5 },
    { type:'movie', mediaId:'tt1234567', title:'Example 2020 720p', infoHash:'d'.repeat(40), seeders:0 },
  ]));
  await page.click('#import-form button');
  await page.click('#manual-import > summary');
  await page.waitForFunction(() => document.querySelector('#count').textContent === '2');
  await page.click('#tab-search');
  await page.fill('#media-id', 'tt1234567');
  await page.click('#search-button');
  await page.waitForSelector('.result');
  assert.match(await page.textContent('#results'), /manual-mapping/);
  await page.click('#results summary');
  assert.match(await page.textContent('#results details'),/720p is excluded/);
  await page.click('#watch');
  await page.waitForFunction(() => document.querySelector('#watched-count').textContent === '1');
  const artifacts = resolve('artifacts'); mkdirSync(artifacts, { recursive:true });
  await page.click('#tab-overview');
  await page.waitForTimeout(100);
  await page.screenshot({path:join(artifacts,'dashboard-overview-review.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.querySelector('#latest-showcase').getBoundingClientRect().bottom<=document.querySelector('.dashboard-actions').getBoundingClientRect().top),'Overview content stays above actions');
  await page.screenshot({ path:join(artifacts,'dashboard-desktop.png'), fullPage:true });
  await page.setViewportSize({ width:390, height:844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile layout must not overflow');
  await page.screenshot({ path:join(artifacts,'dashboard-mobile.png'), fullPage:true });
  for(const viewport of [{width:1366,height:768},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    for(const tab of await page.locator('[role=tab]').all()) {
      await tab.click();await page.waitForTimeout(80);
      assert.equal(await page.locator('.section-pages').count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow');
      if(viewport.width===1366)await page.screenshot({path:join(artifacts,'compact-'+(await tab.getAttribute('id'))+'.png')});
      if(viewport.width===1366 && ['Overview','Appearance','Playback','Discovery','Library'].includes(await tab.textContent())) {
        assert.equal(await page.evaluate(()=>{const area=document.querySelector('.dashboard-content');return area.scrollHeight<=area.clientHeight+1;}),true,'Settings fit desktop: '+await tab.textContent());
      }


    }
  }
  // Invite-only workflow in a separate browser context with no admin session.
  // Verify all section views against the footer, not just their own auto-sized boxes.
  await page.click('#tab-appearance');
  assert.equal(await page.locator('[name=sourceFormat]').evaluate(el=>[...el.options].some(option=>option.textContent.includes('?'))),false);
  await page.waitForFunction(()=>document.querySelector('#format-sample').textContent.includes('5.24 GiB'));
  await page.click('#tab-discovery');
  const originalLimit=await page.inputValue('[name=maxResults]');
  await page.fill('[name=maxResults]','7');
  await page.waitForFunction(()=>document.querySelector('#preference-values dd').textContent==='7');
  assert.match(await page.textContent('#preferences-state'),/Unsaved/);
  assert.notEqual((await store.settings()).maxResults,7);
  await page.fill('[name=maxResults]',originalLimit);
  await page.waitForFunction(()=>document.querySelector('#preferences-state').textContent.includes('All changes saved'));
  await page.click('#tab-playback');
  await page.fill('[name=rdToken]','browser-fixture-account-token');await page.click('button.save');
  await page.waitForFunction(()=>document.querySelector('[name=rdToken]').value===''&&document.querySelector('#provider-token-state').textContent==='Token saved');
  assert.match(await page.textContent('#rd-status'),/pending/);
  assert.equal(await page.getAttribute('[name=rdToken]','type'),'password');
  const realUser=rd.user;let testedToken;
  rd.user=async token=>{testedToken=token;await new Promise(resolve=>setTimeout(resolve,250));return {type:'premium'};};
  await page.click('#tab-overview');await page.locator('#setup-status button').click();await page.waitForFunction(()=>document.querySelector('#rd-status').textContent.includes('Testing'));
  await page.waitForFunction(()=>document.querySelector('#rd-status').textContent.includes('Verified'));
  assert.equal(testedToken,'browser-fixture-account-token','Overview Test account uses the stored token through the backend');
  rd.user=realUser;await page.click('#tab-playback');
  await page.route('**/api/rd-test',route=>route.fulfill({status:503,json:{error:'Account test unavailable'}}));
  await page.click('#rd-test');await page.waitForFunction(()=>document.querySelector('#rd-status').textContent.includes('verification failed'));
  await page.unroute('**/api/rd-test');
  for(const [i,source] of ['dmm','yts','eztv','apibay'].entries())await store.health(source,{status:'ok',checkedAt:Date.now(),durationMs:25+i*103,results:2+i*19});
  await page.click('#refresh');
  for(const [width,height] of [[1672,941],[1920,1080],[1440,900],[1366,768],[1280,720]]){
    await page.setViewportSize({width,height});
    for(const tab of await page.locator('.dashboard-nav [role=tab]').all()){
      await tab.click();
      const panel=page.locator('#'+await tab.getAttribute('aria-controls'));
      const views=await panel.locator('.section-views button').all();
      for(const view of views.length?views:[null]){
        if(view)await view.click();await page.waitForTimeout(100);
        const geometry=await page.evaluate(()=>{const panel=document.querySelector('.tab-panel:not([hidden])'),footer=document.querySelector('.dashboard-actions');return {scroll:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,bottom:panel.getBoundingClientRect().bottom,footer:footer.getBoundingClientRect().top};});
        assert.ok(geometry.bottom<=geometry.footer,`${width}x${height} ${await tab.textContent()} ${view?await view.textContent():''}: workspace ${geometry.bottom} overlaps footer ${geometry.footer}`);
        assert.ok((await tab.getAttribute('id')==='tab-overview'||geometry.scroll<=height)&&geometry.width<=width,`${width}x${height} ${await tab.textContent()} ${view?await view.textContent():''} desktop overflow: ${JSON.stringify(geometry)}`);
        if(await tab.getAttribute('id')==='tab-discovery'&&view&&await view.textContent()==='Discovery sources'){
          assert.equal(await page.locator('#sources .source:visible').count(),4,'All Discovery sources remain visible');
          assert.equal(await panel.locator('.list-pages').count(),0,'Discovery sources have no pagination controls');
          const sources=await page.locator('#sources .source').evaluateAll(rows=>rows.map(row=>({x:row.getBoundingClientRect().x,y:row.getBoundingClientRect().y})));
          assert.equal(sources[0].x,sources[1].x,'Two sources in the first column');
          assert.equal(sources[2].x,sources[3].x,'Two sources in the second column');
          assert.ok(sources[2].x>sources[0].x,'Source columns use the workspace width');
        }
        if(await tab.getAttribute('id')==='tab-overview'){
          assert.equal(await page.locator('#setup-status .setup-item:visible').count(),4);
          assert.equal(await page.locator('#health .health-row:visible').count(),4);
          assert.equal(await panel.locator('.list-pages:visible').count(),0);
          assert.equal(await page.locator('#setup-status button').isVisible(),true);
          const edges=await panel.locator(':scope > .card').evaluateAll(cards=>cards.map(card=>({top:card.getBoundingClientRect().top,bottom:card.getBoundingClientRect().bottom})));
          assert.deepEqual(edges[0],edges[1],'Overview panel edges align');
          await page.screenshot({path:join(artifacts,`overview-complete-${width}x${height}.png`)});
        }
        if(width===1672&&!view)await page.screenshot({path:join(artifacts,'redesign-'+await tab.getAttribute('id')+'.png')});
        if([1672,1366].includes(width)&&['Appearance','Playback','Discovery','Search','Library','Users'].includes(await tab.textContent())){
          await page.locator('#notice').evaluate(el=>el.hidden=true);
          await page.screenshot({path:join(artifacts,`sections-${await tab.getAttribute('id')}-${views.indexOf(view)}-${width}x${height}.png`)});
        }
      }
    }
  }
  await page.setViewportSize({width:1366,height:768});
  await page.click('#tab-overview');
  await page.locator('#health').evaluate(list=>{for(let i=0;i<8;i++){const row=list.querySelector('.health-row').cloneNode(true);row.dataset.extra='true';list.append(row);}});
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#health + .list-pages').isVisible(),true,'Health pages only when a larger source list exceeds the available space');
  await page.locator('#health').evaluate(list=>list.querySelectorAll('[data-extra]').forEach(row=>row.remove()));
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#health + .list-pages').isVisible(),false);
  await page.click('#tab-appearance');
  await page.locator('[name=formatIcons]').evaluate(el=>{el.checked=!el.checked;el.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await page.getAttribute('#save-state','data-state'),'dirty');
  await page.locator('[name=formatIcons]').evaluate(el=>{el.checked=!el.checked;el.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await page.getAttribute('#save-state','data-state'),'saved');
  await page.click('#tab-users');
  await page.fill('#invite-label','Browser guest');
  await page.click('#invite-form button');
  await page.waitForSelector('#invite-result:visible');
  const invitation=await page.inputValue('#invite-url');
  await page.locator('.revocation-details summary').click();
  assert.ok(await page.evaluate(()=>document.querySelector('#panel-users').getBoundingClientRect().bottom<=document.querySelector('.dashboard-actions').getBoundingClientRect().top),'Generated invitation and expanded revocation explanation fit the desktop');
  await page.locator('.revocation-details summary').click();
  const guestContext=await browser.newContext({viewport:{width:1366,height:768}});
  const guest=await guestContext.newPage();
  guest.on('pageerror',error=>errors.push(error.message));
  await guest.goto(invitation);
  await guest.click('#claim-invite');
  await guest.waitForSelector('#account-profile:visible');
  assert.match(await guest.textContent('#profile-rd-status'),/Add your own token/);
  const management=await guest.inputValue('#profile-management-url');
  assert.equal(new URL(guest.url()).hash,'');
  await guest.fill('[name=rdToken]','browser-guest-fixture');
  await guest.fill('[name=maxResults]','9');
  await guest.click('#profile-form button[type=submit], #profile-form .actions button:first-child');
  await guest.waitForFunction(()=>document.querySelector('#account-notice').textContent.includes('settings are saved'));
  await guest.reload();await guest.waitForSelector('#account-profile:visible');
  assert.equal(await guest.inputValue('[name=maxResults]'),'9');
  assert.equal(await guest.inputValue('[name=rdToken]'),'');
  assert.match(await guest.textContent('#profile-rd-status'),/Your token is saved/);
  await guest.screenshot({path:join(artifacts,'profile-desktop.png'),fullPage:true});
  await guest.setViewportSize({width:390,height:844});
  assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await guest.screenshot({path:join(artifacts,'profile-mobile.png'),fullPage:true});
  await guest.click('#account-lock');await guest.waitForSelector('#account-entry:visible');
  await guest.goto(management);await guest.waitForSelector('#account-profile:visible');
  page.once('dialog',dialog=>dialog.accept());
  await page.click('#profile-list button:text-is("Revoke")');
  await page.waitForFunction(()=>document.querySelector('#profile-list').textContent.includes('Revoked'));
  await guest.reload();await guest.waitForSelector('#account-entry:visible');
  assert.equal(await guest.isVisible('#account-profile'),false);
  await guestContext.close();
  // Long stored messages and names, paginated data, and transient API states.
  for(let i=0;i<44;i++)await store.event(i%5?'dmm':'search',i%5?`DMM automatic: ${i%3+1} lists imported; ${121+i*17} accepted; ${i*11} filename exclusions; ${i%7===0?1:0} failed; ${12000-i*3} unvisited lists.`:`Long title ${i}: `+'An extended release name with language, resolution, and episode information. '.repeat(3));
  await page.click('#refresh');await page.click('#tab-activity');
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#panel-activity .list-pages').count(),0);
  assert.match(await page.textContent('.activity-range'),/^Latest \d+ of \d+ entries$/);
  await page.locator('#events .activity-row:visible button').first().click();
  assert.equal(await page.locator('.activity-dialog').evaluate(el=>el.open),true);
  const detailBefore=await page.locator('.activity-dialog pre').textContent();
  await store.event('dmm','DMM automatic: 1 lists imported; 41 accepted; 2 filename exclusions; 1 failed; 10000 unvisited lists.');
  await page.evaluate(()=>status());await page.waitForTimeout(100);
  assert.equal(await page.locator('.activity-dialog pre').textContent(),detailBefore,'Open details retain their original record');
  assert.equal(await page.locator('.activity-dialog').evaluate(el=>el.open),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.activity-dialog').evaluate(el=>el.open),false);
  await page.waitForFunction(()=>document.activeElement.classList.contains('activity-details'));
  assert.equal((await fetch(base+'/api/activity')).status,401,'Full history requires authentication');
  await page.locator('.activity-pages button').click();
  const allEvents=await store.activityHistory();
  await page.waitForFunction(count=>document.querySelectorAll('.activity-history tbody tr').length===count,allEvents.length);
  assert.ok(allEvents.length>30,'Full history includes records beyond the recent dashboard response');
  for(const [width,height] of [[1672,941],[1366,768],[390,844]]){
    await page.setViewportSize({width,height});
    assert.ok(await page.locator('.activity-history').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.scrollHeight>el.clientHeight),'History scrolls vertically without horizontal clipping');
    await page.screenshot({path:join(artifacts,`activity-history-${width}x${height}.png`)});
  }
  await page.setViewportSize({width:1366,height:768});
  await page.locator('.activity-history .activity-details').last().click();
  const oldDetail=await page.locator('.activity-dialog pre').textContent();
  assert.equal(oldDetail,allEvents.at(-1).message);
  await store.event('dmm','DMM automatic: 1 lists imported; 42 accepted; 0 filename exclusions; 0 failed; 9999 unvisited lists.');
  await page.evaluate(()=>status());
  assert.equal(await page.locator('.activity-dialog pre').textContent(),oldDetail);
  assert.equal(await page.locator('.activity-history tbody tr').count(),allEvents.length,'Open history stays stable as activity arrives');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.activeElement.closest('.activity-history')!==null);
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.activeElement.textContent==='View full history');
  await page.route('**/api/activity',route=>route.fulfill({status:503,json:{error:'History temporarily unavailable'}}));
  await page.locator('.activity-pages button').click();
  await page.waitForFunction(()=>document.querySelector('.activity-history p').textContent.includes('Could not load history'));
  await page.keyboard.press('Escape');await page.unroute('**/api/activity');
  await page.route('**/api/activity',route=>route.fulfill({json:{events:[]}}));
  await page.locator('.activity-pages button').click();
  await page.waitForFunction(()=>document.querySelector('.activity-history p').textContent==='No activity recorded yet.');
  assert.equal(await page.locator('.activity-history table').isVisible(),false);
  await page.keyboard.press('Escape');await page.unroute('**/api/activity');
  const rowCounts=[];
  for(const [width,height] of [[1672,941],[1366,768]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(100);
    rowCounts.push(await page.locator('.activity-row:visible').count());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth),'Activity with populated rows fits desktop');
    assert.ok(await page.evaluate(()=>document.querySelector('#panel-activity').getBoundingClientRect().bottom<=document.querySelector('.dashboard-actions').getBoundingClientRect().top),'Activity never overlaps the action bar');
    await page.locator('#notice').evaluate(el=>el.hidden=true);
    await page.locator('#tab-activity').focus();
    await page.screenshot({path:join(artifacts,`activity-refined-${width}x${height}.png`)});
  }
  assert.ok(rowCounts[0]>rowCounts[1],'Larger workspace displays additional rows');
  await page.fill('input[name=name]','Lantern with a long descriptive server name for our family');
  assert.match(await page.textContent('#save-state'),/Unsaved/);
  await page.route('**/api/settings',async route=>{if(route.request().method()==='PUT'){await new Promise(resolve=>setTimeout(resolve,350));await route.fulfill({status:500,json:{error:'Test save failure'}});}else await route.continue();});
  await page.click('button.save');await page.waitForFunction(()=>document.querySelector('#save-state').dataset.state==='saving');
  await page.waitForFunction(()=>document.querySelector('#save-state').dataset.state==='failed');
  assert.equal(await page.inputValue('input[name=name]'),'Lantern with a long descriptive server name for our family');
  await page.unroute('**/api/settings');await page.click('button.save');await page.waitForFunction(()=>document.querySelector('#save-state').dataset.state==='saved');
  await page.route('**/api/search',async route=>{await new Promise(resolve=>setTimeout(resolve,350));await route.fulfill({status:503,json:{error:'Test source unavailable'}});});
  await page.click('#search-button');await page.waitForFunction(()=>document.querySelector('#search-button').disabled);
  await page.waitForFunction(()=>document.querySelector('#results').textContent.includes('Search failed'));
  await page.unroute('**/api/search');
  await page.route('**/api/profiles',route=>route.fulfill({status:503,json:{error:'Test profile service unavailable'}}));
  await page.click('#tab-users');await page.waitForFunction(()=>document.querySelector('#profile-list').textContent.includes('Could not load profiles'));
  await page.unroute('**/api/profiles');
  // Browser zoom reduces the CSS viewport: 1280px at 125%, 150%, and 200%.
  for(const [width,height] of [[1024,576],[853,480],[640,360],[390,844]]){
    handler=createApp(appOptions); // Each viewport is an independent layout scenario.
    await page.setViewportSize({width,height});
    for(const tab of await page.locator('.dashboard-nav [role=tab]').all()){
      await tab.click();await page.waitForTimeout(60);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Zoom/mobile has no horizontal overflow');
      await page.locator('button.save').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('button.save').isVisible(),'Save remains reachable at zoom');
    }
  }
  await page.click('#logout');
  await page.waitForSelector('#login:visible');
  await page.reload();
  await page.waitForSelector('#login:visible');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('lantern.admin.tab')),null);
  assert.deepEqual(errors.filter(message=>!message.includes('503')&&!message.includes('500')&&!message.includes('401')), []);
  assert.equal(await page.getAttribute('#admin-token','type'),'password','Lock restores masked input');
  assert.equal(await page.inputValue('#admin-token'),'','Lock clears the token field');
  handler=createApp(appOptions); // Reset test request budget after viewport sweep.
  await page.evaluate(()=>sessionStorage.setItem('lantern.admin.tab','expired-verification-fixture'));
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#login-error').textContent.includes('Saved login expired'));
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('lantern.admin.tab')),null,'Rejected saved session is removed');
  await page.setViewportSize({width:1366,height:768});
  await page.fill('#admin-token','connection-verification-fixture');
  const offlineCard=await page.locator('#login').boundingBox();
  await page.route('**/api/settings',route=>route.abort('failed'));
  await page.locator('#admin-token').press('Enter');
  await page.waitForFunction(()=>document.querySelector('#login-error').textContent.includes('Could not connect'));
  assert.deepEqual(await page.locator('#login').boundingBox(),offlineCard,'Network failures do not shift the card');
  assert.equal(await page.locator('#unlock-button').isEnabled(),true,'Network failures allow retry');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('lantern.admin.tab')),null);
  await page.unroute('**/api/settings');
  assert.deepEqual(errors.filter(message=>!['503','500','401','net::ERR_FAILED'].some(expected=>message.includes(expected))),[]);
  console.log('Browser smoke passed: login, persistent branding, import, search, monitor, mobile layout, logout; no JavaScript/CSP errors.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await store.close();
  // Remove only the unique temporary directory created by this script.
  if (directory.startsWith(join(tmpdir(), 'lantern-browser-'))) rmSync(directory, { recursive:true, force:true });
}


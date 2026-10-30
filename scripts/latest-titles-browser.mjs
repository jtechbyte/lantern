import assert from 'node:assert/strict';
import { existsSync,mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { embeddedStore } from './lib/embedded-postgres.mjs';
import { createApp } from '../src/server.mjs';
import { Engine } from '../src/engine.mjs';
import { RealDebrid } from '../src/providers/real-debrid/client.mjs';
import { LatestTitles } from '../src/latest-titles.mjs';
import { readJson } from '../src/network.mjs';
const store=await embeddedStore('a'.repeat(64)),admin='b'.repeat(64);
await store.saveSettings({...await store.settings(),sources:['dmm','yts','eztv','apibay'],dmmAuto:false});
for(const [i,source] of ['dmm','yts','eztv','apibay'].entries())await store.health(source,{status:i===2?'error':'ok',checkedAt:Date.now(),durationMs:25+i*103,results:2+i*19,...(i===2?{code:'UPSTREAM_TIMEOUT_WITH_LONG_DIAGNOSTIC_DETAIL'}:{})});
const latest=new LatestTitles(store,{request:async()=>{throw Error('Offline fixture');}});
let server,browser;
try{
  const app=createApp({store,latest,engine:new Engine(store),rd:new RealDebrid(store),adminToken:admin,publicUrl:'http://localhost',signingKey:'a'.repeat(64)});
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';browser=await chromium.launch({headless:true,...(existsSync(edge)?{executablePath:edge}:{})});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#admin-token').fill(admin);await page.locator('#admin-token').press('Enter');
  await page.waitForFunction(()=>document.querySelector('.latest-status').textContent.includes('No indexed titles'));
  for(let i=0;i<16;i++){
    const id='tt'+String(1000000+i),type=i%2?'series':'movie';
    await store.db.query('INSERT INTO releases VALUES($1,$2,$3,$4,$5)',[String(i),type+'/'+id+(type==='series'?':1:1':''),'manual','{}',Date.now()+i]);
    await store.db.query('UPDATE indexed_titles SET metadata=$2,metadata_at=$3,next_metadata_at=$4 WHERE key=$1',[type+'/'+id,JSON.stringify({title:i===15?'Long title fixture demonstrating full accessible details with readable cards':'Isolated test title '+i,year:'2026',imdbRating:i===15?null:8.1,releaseDate:new Date().toISOString().slice(0,10),description:'Test data, not a real catalog title.'}),Date.now(),Date.now()+86400000]);
  }
  await store.db.query("UPDATE indexed_titles SET metadata=NULL WHERE key='movie/tt1000014'");
  await latest.pending;latest.cache.clear();await page.locator('#tab-appearance').click();await page.locator('#tab-overview').click();
  await page.waitForFunction(()=>document.querySelectorAll('.latest-track .latest-media-card').length===12);
  assert.ok(await page.locator('.latest-track [aria-label="Rating unavailable"]').count());
  assert.match(await page.locator('.latest-track').textContent(),/tt1000014/);
  assert.equal(await page.locator('.latest-track .poster-fallback').count(),12);
  assert.match(await page.locator('.latest-track .latest-media-card').first().getAttribute('aria-label'),/Long title fixture/);
  await page.evaluate(()=>status());
  const backend=await page.evaluate(()=>api('status'));
  const directCount=await store.db.query('SELECT count(*) AS total FROM releases');
  assert.equal(backend.releases,Number(directCount.rows[0].total));
  assert.equal(await page.locator('#count').textContent(),String(backend.releases));
  assert.equal(await page.locator('#watched-count').textContent(),String(backend.watchlist.length));
  assert.equal(await page.locator('#active').textContent(),String(backend.activeSearches));
  for(let i=0;i<4;i++){
    const source=['dmm','yts','eztv','apibay'][i],health=backend.health[source];
    const cells=await page.locator('#health .health-row').nth(i).locator(':scope > span').allTextContents();
    assert.deepEqual(cells,[health.status==='ok'?'Responded':'Error',health.durationMs+' ms',health.status==='ok'?String(health.results):'—']);
  }
  await page.clock.install();
  mkdirSync('artifacts/latest-titles',{recursive:true});
  for(const [width,height] of [[1536,864],[1964,801],[1920,1080],[1366,768],[1280,720],[960,540],[780,1024],[390,844]]){
    await page.setViewportSize({width,height});await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await page.clock.runFor(500);
    const measure=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,showcase:document.querySelector('#latest-showcase').getBoundingClientRect().toJSON(),footer:document.querySelector('.dashboard-actions').getBoundingClientRect().toJSON()}));
    assert.ok(measure.width<=width,JSON.stringify(measure));
    assert.ok(measure.showcase.bottom<=measure.footer.top,'Action bar must follow, never cover, showcase');
    await page.locator('.dashboard-actions').scrollIntoViewIfNeeded();assert.ok(await page.locator('.dashboard-actions').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight+1),'Action bar remains reachable');await page.evaluate(()=>window.scrollTo(0,0));console.log('LAYOUT',width,height,JSON.stringify(measure));
    if(width>=1100&&height>=700){
      assert.ok(measure.height<=height,JSON.stringify(measure));
      const overflow=await page.locator('.dashboard-content,#panel-overview,#panel-overview>.overview-status,#latest-showcase,.latest-rail,.dashboard-actions').evaluateAll(es=>es.filter(e=>e.scrollHeight>e.clientHeight+1).map(e=>({id:e.id,class:e.className,client:e.clientHeight,scroll:e.scrollHeight,overflow:getComputedStyle(e).overflowY})));
      assert.deepEqual(overflow,[],'No independently scrolling or concealed vertical overflow in Overview containers');
      for(const selector of ['.dashboard-actions .save','.dashboard-actions .button']){
        await page.locator(selector).focus();
        assert.ok(await page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e),o=parseFloat(s.outlineWidth)+parseFloat(s.outlineOffset);return r.top-o>=0&&r.bottom+o<=innerHeight;}),'Action focus outline fits viewport');
      }
      assert.ok(await page.locator('.playback-note').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight),'Footer explanation fits');
    }
    const cards=await page.locator('.latest-track').evaluate(track=>[...track.children].map(c=>({width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height})));
    assert.ok(cards.every(c=>Math.abs(c.width-(width>=1100&&height>=700?(height<=839?160:Math.max(190,Math.min(220,height*.14+69))):200))<1),'Stable responsive card width');assert.ok(Math.max(...cards.map(c=>c.height))-Math.min(...cards.map(c=>c.height))<=1,'Equal card heights');
    assert.ok(await page.locator('.latest-rail').evaluate(rail=>{const [left,track,right]=[...rail.children].map(e=>e.getBoundingClientRect());return left.right<=track.left&&right.left>=track.right;}),'Navigation arrows never overlay card content');
    for(let step=0;step<12&&await page.getByRole('button',{name:'Next titles',exact:true}).isEnabled();step++){
      await page.getByRole('button',{name:'Next titles',exact:true}).focus();await page.keyboard.press('Enter');await page.clock.runFor(600);
    }
    assert.ok(await page.locator('.latest-track').evaluate(t=>{const a=t.getBoundingClientRect(),b=t.lastElementChild.getBoundingClientRect();return b.left>=a.left&&b.right<=a.right+1;}),'Final card is completely reachable through keyboard-operated arrows');
    await page.locator('.latest-track .latest-media-card').first().focus();await page.clock.runFor(600);
    await page.locator('.latest-track .latest-media-card').last().focus();await page.clock.runFor(600);
    assert.ok(await page.locator('.latest-track').evaluate(t=>{const a=t.getBoundingClientRect(),b=t.lastElementChild.getBoundingClientRect();return b.left>=a.left&&b.right<=a.right+1;}),'Keyboard card focus reveals final card');
    assert.ok(await page.locator('.latest-track').evaluate(t=>{const a=t.getBoundingClientRect();return [...t.lastElementChild.querySelectorAll('strong,.latest-type,.latest-card-meta span')].every(e=>{const b=e.getBoundingClientRect();return b.left>=a.left&&b.right<=a.right+1;});}),'Final title, badge, year and rating are inside the visible rail');
    await page.locator('.latest-track .latest-media-card').first().focus();await page.clock.runFor(600);await page.evaluate(()=>document.activeElement.blur());
    await page.screenshot({path:`artifacts/latest-titles/${width}x${height}.png`,fullPage:true});
  }
  await page.setViewportSize({width:1366,height:768});await page.clock.runFor(300);
  await page.getByRole('button',{name:'Source health details',exact:true}).click();
  assert.match(await page.locator('.overview-details').textContent(),/Last checked/);
  assert.match(await page.locator('.overview-details').textContent(),/UPSTREAM_TIMEOUT_WITH_LONG_DIAGNOSTIC_DETAIL/);
  assert.match(await page.locator('.overview-details').textContent(),/Previous results: 40/);
  assert.equal(await page.locator('#health .health-row').nth(2).locator(':scope > span').last().textContent(),'—');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Source health details');
  await page.getByRole('button',{name:'Next titles',exact:true}).focus();await page.keyboard.press('Enter');await page.clock.runFor(1000);assert.ok(await page.locator('.latest-track').evaluate(el=>el.scrollLeft>0),'Carousel next arrow scrolls');
  await page.getByRole('button',{name:'Previous titles',exact:true}).click();await page.clock.runFor(1000);
  await page.getByRole('button',{name:'TV Shows',exact:true}).click();await page.clock.runFor(300);await page.waitForFunction(()=>document.querySelectorAll('.latest-track .latest-media-card').length===8);
  assert.ok((await page.locator('.latest-track .latest-type').allTextContents()).every(t=>t==='TV Show'));
  await page.getByRole('button',{name:'All',exact:true}).click();await page.clock.runFor(300);await page.waitForFunction(()=>document.querySelectorAll('.latest-track .latest-media-card').length===12);
  await page.getByLabel('Latest titles view').selectOption('released');await page.clock.runFor(300);await page.waitForFunction(()=>document.querySelector('.latest-status').textContent.includes('15 indexed'));await page.getByLabel('Latest titles view').selectOption('added');await page.clock.runFor(300);
  await page.getByRole('button',{name:'Movies',exact:true}).click();await page.clock.runFor(300);await page.waitForFunction(()=>document.querySelectorAll('.latest-track .latest-media-card').length===8);
  await page.locator('.latest-track .latest-media-card').first().click();assert.equal(await page.locator('dialog[open]').count(),1);
  await page.clock.fastForward(30001);assert.equal(await page.locator('dialog[open]').count(),1);await page.getByRole('button',{name:'Close details',exact:true}).click();
  await page.getByRole('button',{name:'All',exact:true}).click();await page.getByRole('button',{name:'View all',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.latest-history-grid').children.length===12);await page.locator('.latest-pages').getByRole('button',{name:'Next',exact:true}).click();await page.clock.runFor(300);await page.waitForFunction(()=>document.querySelector('.latest-history-grid').children.length===4);
  await page.getByRole('button',{name:'Close history',exact:true}).click();assert.deepEqual(errors,[]);
  let latestRequests=0;page.on('request',r=>{if(r.url().includes('/api/latest-titles'))latestRequests++;});
  await page.locator('#tab-appearance').click();const paused=latestRequests;await page.clock.fastForward(60001);assert.equal(latestRequests,paused);
  await page.locator('#tab-overview').click();await page.clock.runFor(300);await page.waitForFunction(()=>document.querySelector('.latest-track').children.length===12);
  await page.route('**/api/latest-titles?*',route=>route.fulfill({status:503,body:'Unavailable'}));
  await page.clock.fastForward(30001);await page.waitForFunction(()=>document.querySelector('.latest-status').textContent.includes('stale'));
  assert.equal(await page.locator('.latest-track .latest-media-card').count(),12);
  await page.unroute('**/api/latest-titles?*');await page.clock.fastForward(30001);await page.waitForFunction(()=>document.querySelector('.latest-status').textContent.includes('16 indexed'));
  await page.route('**/api/latest-titles?*',()=>{});
  await page.getByRole('button',{name:'Movies',exact:true}).click();
  assert.match(await page.locator('.latest-status').textContent(),/Loading/);
  await page.clock.runFor(11000);await page.waitForFunction(()=>document.querySelector('.latest-status').textContent.includes('timed out'));
  await page.unroute('**/api/latest-titles?*');await page.getByRole('button',{name:'All',exact:true}).click();await page.clock.runFor(300);await page.waitForFunction(()=>document.querySelector('.latest-status').textContent.includes('16 indexed'));
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  const hidden=latestRequests;await page.clock.fastForward(60001);assert.equal(latestRequests,hidden);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.runFor(200);
  await store.db.query("INSERT INTO releases VALUES('fresh','movie/tt1234567','manual','{}',$1)",[Date.now()+1000]);
  await store.db.query("UPDATE indexed_titles SET metadata=$1,metadata_at=$2,next_metadata_at=$3 WHERE key='movie/tt1234567'",[JSON.stringify({title:'New isolated title',year:'2026'}),Date.now(),Date.now()+86400000]);
  latest.cache.clear();await page.clock.fastForward(30001);await page.waitForFunction(()=>document.querySelector('.latest-track .latest-media-card')?.dataset.key==='movie/tt1234567');
  assert.equal(await page.locator('.latest-track .latest-media-card').first().getAttribute('data-key'),'movie/tt1234567');
  await page.clock.setSystemTime(new Date(Date.now()+8*86400000));await page.clock.fastForward(30001);await page.waitForFunction(()=>document.querySelectorAll('.latest-track .latest-badge').length===0);await page.clock.setSystemTime(new Date());
  console.log('PASS newest title automatically updates carousel');
  console.log('PASS hidden/tab polling pause and API failure/recovery with retained stale content');
  console.log('PASS empty state, database refresh, deduped catalog, filters, details preserved, history pagination, responsive widths, no JavaScript errors');
  if(process.argv.includes('--live')){
    // Only this disposable database receives sample identities. Names/artwork are fetched live.
    await latest.pending;await store.db.query('DELETE FROM releases');
    const identities=[['movie','tt0133093'],['series','tt0944947'],['movie','tt1375666'],['series','tt0903747'],['movie','tt0816692'],['series','tt4574334'],['movie','tt0111161'],['series','tt2861424']];
    for(const [i,[type,id]] of identities.entries())await store.db.query('INSERT INTO releases VALUES($1,$2,$3,$4,$5)',['live'+i,type+'/'+id+(type==='series'?':1:1':''),'manual','{}',Date.now()+i]);
    latest.request=readJson;latest.nextWarm=0;await latest.warm();latest.nextWarm=0;await latest.warm();latest.cache.clear();
    await page.clock.fastForward(30001);await page.waitForFunction(()=>document.querySelectorAll('.latest-track img').length===8);
    await page.waitForFunction(()=>[...document.querySelectorAll('.latest-track img')].every(i=>i.complete&&i.naturalWidth>0));
    const records=(await store.db.query('SELECT key,metadata FROM indexed_titles')).rows;
    for(const card of await page.locator('.latest-track .latest-media-card').all()){
      const key=await card.getAttribute('data-key'),record=records.find(r=>r.key===key);
      assert.ok(record);const metadata=record.metadata;
      assert.equal(await card.locator(':scope > strong').textContent(),metadata.title);
      assert.equal(await card.locator('.latest-card-meta span').first().textContent(),metadata.year);
      assert.equal(await card.locator('img').getAttribute('src'),metadata.background||metadata.poster);
      assert.equal(await card.locator('.latest-card-meta span').last().textContent(),metadata.imdbRating?'★ '+metadata.imdbRating+' IMDb':'—');
    }
    await page.evaluate(()=>status());
    // Use the supported reduced-motion preference for deterministic end/start captures;
    // the earlier fixture navigation exercises the default smooth-scroll behavior.
    await page.emulateMedia({reducedMotion:'reduce'});
    for(const [width,height] of [[1536,864],[1964,801],[1366,768],[1920,1080],[1280,720],[1964,1100]]){
      await page.setViewportSize({width,height});await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await page.evaluate(()=>window.scrollTo(0,0));await page.clock.runFor(500);
      await page.locator('.latest-track').evaluate(t=>t.scrollTo({left:0,behavior:'instant'}));await page.clock.runFor(100);await page.waitForTimeout(100);
      await page.evaluate(()=>Promise.all([...document.querySelectorAll('.latest-track img')].map(i=>i.decode())));await page.clock.runFor(100);
      await page.screenshot({path:`artifacts/latest-titles/viewport-${width}x${height}.png`});await page.screenshot({path:`artifacts/latest-titles/live-${width}x${height}.png`,fullPage:true});
      if([1280,1366,1536,1920].includes(width)){
        for(const keyboard of [false,true]){
          for(let step=0;step<12&&await page.locator('.latest-track').evaluate(t=>t.scrollLeft+t.clientWidth<t.scrollWidth-2);step++){
            const arrow=page.getByRole('button',{name:'Next titles',exact:true});
            if(keyboard){await arrow.focus();await page.keyboard.press('Enter');}else await arrow.click();
            await page.clock.runFor(600);
          }
          assert.ok(await page.locator('.latest-track').evaluate(t=>{const a=t.getBoundingClientRect();return [t.lastElementChild,...t.lastElementChild.querySelectorAll('strong,.latest-type,.latest-badge,.latest-card-meta span')].every(e=>{const b=e.getBoundingClientRect();return b.left>=a.left&&b.right<=a.right+1;});}),'Final live card and all metadata fully visible');
          await page.evaluate(()=>document.activeElement.blur());
          await page.screenshot({path:`artifacts/latest-titles/end-${keyboard?'keyboard':'arrows'}-${width}x${height}.png`});
          for(let step=0;step<12&&await page.locator('.latest-track').evaluate(t=>t.scrollLeft>1);step++){
            const arrow=page.getByRole('button',{name:'Previous titles',exact:true});
            if(keyboard){await arrow.focus();await page.keyboard.press('Enter');}else await arrow.click();
            await page.clock.runFor(600);
          }
          assert.ok(await page.locator('.latest-track').evaluate(t=>t.scrollLeft<=1),'Complete return to start');
        }
        await page.evaluate(()=>document.activeElement.blur());
        await page.screenshot({path:`artifacts/latest-titles/returned-${width}x${height}.png`});
      }
    }
    console.log('PASS live Cinemeta exact-ID metadata and eight browser-loaded posters in disposable PostgreSQL data');
  }
}finally{await browser?.close();await latest.pending;if(server)await new Promise(r=>server.close(r));await store.close();}

import assert from 'node:assert/strict';
import {existsSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {embeddedStore} from './lib/embedded-postgres.mjs';
import {createApp} from '../src/server.mjs';
import {Engine} from '../src/engine.mjs';
import {RealDebrid} from '../src/providers/real-debrid/client.mjs';
const store=await embeddedStore('a'.repeat(64)),admin='b'.repeat(64);
const app=createApp({store,engine:new Engine(store),rd:new RealDebrid(store),adminToken:admin,publicUrl:'http://localhost',signingKey:'a'.repeat(64)});
const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser=await chromium.launch({headless:true,...(existsSync(edge)?{executablePath:edge}:{})});
try{
 const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const png=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30"><rect width="20" height="30" fill="orange"/></svg>');
 let backgroundCalls=0,posterCalls=0,fail=true,releaseImage;
 await page.route('https://fixture.invalid/background',async route=>{backgroundCalls++;if(fail)await route.fulfill({status:503});else await route.fulfill({contentType:'image/svg+xml',body:png});});
 await page.route('https://fixture.invalid/poster',async route=>{posterCalls++;await new Promise(r=>releaseImage=r);await route.fulfill({contentType:'image/svg+xml',body:png});});
 const base={key:'movie/tt1234567',type:'movie',imdb:'tt1234567',media:'movie/tt1234567',firstSeen:Date.now(),metadataAt:Date.now(),metadataState:'fresh',metadataFetchState:'fresh',metadata:{title:'Same-title fallback fixture',year:'2026',imdbRating:8,background:'https://fixture.invalid/background',poster:'https://fixture.invalid/poster'}};
 let items=[base,{...base,key:'movie/tt1234568',imdb:'tt1234568',metadata:null,metadataState:'failed',metadataFetchState:'failed'}, {...base,key:'movie/tt1234569',imdb:'tt1234569',metadata:null,metadataState:'unavailable',metadataFetchState:'unavailable'}, {...base,key:'movie/tt1234570',imdb:'tt1234570',metadata:null,metadataState:'pending',metadataFetchState:'pending'}];
 await page.route('**/api/latest-titles?*',route=>route.fulfill({json:{items,total:items.length,offset:0,limit:12}}));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#admin-token').fill(admin);await page.locator('#admin-token').press('Enter');
 const first=page.locator('.latest-track .latest-media-card').first();
 await page.waitForFunction(()=>document.querySelector('.latest-track img')?.src.endsWith('/poster'));
 assert.equal(backgroundCalls,1);assert.equal(posterCalls,1);assert.match(await first.textContent(),/Loading artwork/);
 assert.match(await page.locator('.latest-track').textContent(),/Metadata request failed/);assert.match(await page.locator('.latest-track').textContent(),/Metadata unavailable/);assert.match(await page.locator('.latest-track').textContent(),/Metadata loading/);assert.match(await page.locator('.latest-track').textContent(),/Title unavailablett1234568/);
 assert.equal(await page.locator('.latest-type').count(),0);
 releaseImage();await page.waitForFunction(()=>document.querySelector('.latest-art').classList.contains('poster-loaded'));
 assert.equal(await first.locator('img').getAttribute('class'),'portrait-art');
 assert.equal(await first.locator('.latest-poster-backdrop').count(),1);
 assert.equal(await first.locator('.latest-poster-backdrop>span').evaluate(e=>e.style.backgroundImage),'url("https://fixture.invalid/poster")');
 assert.equal(await first.locator('img').evaluate(e=>getComputedStyle(e).objectFit),'contain');
 // Poll with identical data must not reload either artwork URL.
 await page.clock.install();await page.clock.fastForward(30001);await page.waitForTimeout(50);assert.equal(backgroundCalls,1);assert.equal(posterCalls,1);
 // Failed artwork retries only after its per-URL backoff; the next poll recovers it.
 items=[{...base,metadata:{...base.metadata,poster:null}}];await page.clock.fastForward(30001);
 await page.waitForFunction(()=>document.querySelectorAll('.latest-track .latest-media-card').length===1);
 await page.waitForTimeout(50);assert.ok(backgroundCalls<=2);fail=false;
 await page.clock.fastForward(120001);await page.waitForFunction(()=>document.querySelector('.latest-art').classList.contains('poster-loaded'));
 assert.ok(backgroundCalls<=3);
 // Metadata resolution updates the same card without a document reload.
 items=[{...items[0],metadata:null,metadataFetchState:'failed',metadataState:'failed'}];await page.clock.fastForward(30001);await page.waitForFunction(()=>document.querySelector('.latest-track strong').textContent.includes('Title unavailable'));
 items=[{...base,metadata:{...base.metadata,poster:null,title:'Recovered title'}}];await page.clock.fastForward(30001);await page.waitForFunction(()=>document.querySelector('.latest-track strong').textContent==='Recovered title');
 mkdirSync('artifacts/carousel-fix',{recursive:true});
 items=[{...base,metadata:null,metadataState:'unavailable',metadataFetchState:'unavailable'}, {...base,key:'movie/tt1234568',imdb:'tt1234568',metadata:null,metadataState:'failed',metadataFetchState:'failed'}];await page.clock.fastForward(30001);await page.waitForFunction(()=>document.querySelectorAll('.latest-track .latest-media-card').length===2);
 for(const [width,height] of [[1280,720],[1366,768],[1536,864],[1920,1080]]){
  await page.setViewportSize({width,height});await page.clock.runFor(300);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight));
  await page.screenshot({path:'artifacts/carousel-fix/fallback-'+width+'x'+height+'.png'});
 }
 const alignment=await page.locator('.latest-rail').evaluate(rail=>{const art=rail.querySelector('.latest-art').getBoundingClientRect(),buttons=[...rail.querySelectorAll('.latest-arrow')].map(e=>e.getBoundingClientRect());return buttons.map(b=>Math.abs(b.top+b.height/2-(art.top+art.height/2)));});assert.ok(alignment.every(d=>d<1),JSON.stringify(alignment));
 assert.deepEqual(errors,[]);
 console.log('PASS controlled browser: same-title image fallback, delayed load, failed/unavailable/pending states, bounded image retry/recovery, metadata resolution without reload, removed type overlays, centered arrows, no JavaScript exceptions. Expected HTTP503 image failures were injected.');
}finally{await browser.close();await new Promise(r=>server.close(r));await store.close();}

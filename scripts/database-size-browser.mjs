import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { embeddedStore } from './lib/embedded-postgres.mjs';
import { createApp } from '../src/server.mjs';
import { Engine } from '../src/engine.mjs';
import { RealDebrid } from '../src/providers/real-debrid/client.mjs';
const store=await embeddedStore('b'.repeat(64));
await store.saveSettings({...await store.settings(),sources:[],dmmAuto:false});
let queries=0;
const query=store.db.query.bind(store.db);
store.db.query=async(sql,...args)=>{
  if(sql.includes('AS database_size_bytes')){queries++;return {rows:[{database_size_bytes:'24800000'}]};}
  return query(sql,...args);
};
const engine=new Engine(store), rd=new RealDebrid(store), admin='c'.repeat(64);
let handler,browser;
const {createServer}=await import('node:http');
const server=createServer((req,res)=>handler(req,res));
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  handler=createApp({store,engine,rd,adminToken:admin,publicUrl:base,signingKey:'b'.repeat(64)});
  const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser=await chromium.launch({headless:true,...(existsSync(edge)?{executablePath:edge}:{})});
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  await page.clock.install();
  let requests=0,fail=false,hold=false,release;
  await page.route('**/api/database-size',async route=>{
    requests++;
    if(hold)await new Promise(resolve=>{release=resolve;});
    if(fail)return route.fulfill({status:503,body:'Unavailable'});
    await route.continue().catch(()=>{});
  });
  await page.goto(base);
  assert.equal(requests,0);
  await page.locator('#admin-token').fill(admin);await page.locator('#admin-token').press('Enter');
  await page.waitForFunction(()=>document.querySelector('#database-size').textContent==='24.8 MB');
  assert.equal(queries,1);
  for(const [width,height] of [[1858,846],[1366,768],[1280,720]]){
    await page.setViewportSize({width,height});
    const bounds=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,debug:[...document.querySelectorAll('.dashboard-content,#panel-overview,.metrics,.setup-card,.dashboard-actions')].map(el=>({class:el.className,id:el.id,rect:el.getBoundingClientRect().toJSON(),padding:getComputedStyle(el).padding,min:getComputedStyle(el).minHeight,gap:getComputedStyle(el).gap,rows:getComputedStyle(el).gridTemplateRows}))}));
    assert.ok(bounds.width<=width&&bounds.height<=height,JSON.stringify({viewport:[width,height],bounds}));
  }
  // A second authenticated browser shares the server cache.
  const second=await browser.newPage();await second.goto(base);
  await second.locator('#admin-token').fill(admin);await second.locator('#admin-token').press('Enter');
  await second.waitForFunction(()=>document.querySelector('#database-size').textContent==='24.8 MB');
  assert.equal(queries,1);await second.close();
  const empty=await browser.newPage();await empty.clock.install();
  await empty.route('**/api/database-size',route=>route.fulfill({status:503,body:'Unavailable'}));
  await empty.goto(base);assert.equal(await empty.locator('#database-size').textContent(),'Loading…');
  await empty.locator('#admin-token').fill(admin);await empty.locator('#admin-token').press('Enter');
  await empty.waitForFunction(()=>document.querySelector('.database-metric').dataset.state==='unavailable');
  assert.equal(await empty.locator('#database-size').textContent(),'—');
  assert.equal(await empty.locator('#database-size-updated').textContent(),'Measurement unavailable');
  assert.ok(await empty.locator('.database-metric').evaluate(el=>el.scrollWidth<=el.clientWidth),'Unavailable state must fit its card');
  await empty.close();
  await page.clock.fastForward(10001);await page.waitForTimeout(50);assert.equal(requests,2);
  const lastTitle=await page.locator('#database-size').getAttribute('title');
  fail=true;await page.clock.fastForward(10001);await page.waitForFunction(()=>document.querySelector('.database-metric').dataset.state==='stale');
  assert.equal(await page.locator('#database-size').getAttribute('title'),lastTitle);
  fail=false;await page.clock.fastForward(10001);await page.waitForFunction(()=>document.querySelector('.database-metric').dataset.state==='fresh');
  await page.locator('#tab-appearance').click();const paused=requests;
  await page.clock.fastForward(30000);assert.equal(requests,paused);
  await page.locator('#tab-overview').click();await page.waitForTimeout(50);assert.equal(requests,paused+1);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  const hidden=requests;await page.clock.fastForward(30000);assert.equal(requests,hidden);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(50);assert.equal(requests,hidden+1);
  hold=true;await page.clock.fastForward(10001);await page.waitForTimeout(50);const pending=requests;
  await page.evaluate(()=>{for(let i=0;i<10;i++)window.dispatchEvent(new Event('dashboard-layout'));});
  assert.equal(requests,pending);hold=false;release();await page.waitForTimeout(50);
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  const suspended=requests;await page.clock.fastForward(30000);assert.equal(requests,suspended);
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await page.waitForTimeout(50);
  assert.equal(requests,suspended+1);
  await page.evaluate(()=>{window.detachedMetric=document.querySelector('.database-metric');window.detachedMetric.remove();});
  const detached=requests;await page.clock.fastForward(30000);assert.equal(requests,detached);
  await page.evaluate(()=>document.querySelector('.metrics').append(window.detachedMetric));await page.waitForTimeout(50);
  assert.equal(requests,detached+1);
  await page.locator('#logout').click();await page.locator('#admin-token').waitFor({state:'visible'});
  const locked=requests;await page.clock.fastForward(30000);assert.equal(requests,locked);
  console.log('PASS browser polling: immediate, 10-second cadence, no overlapping/duplicate requests, hidden/tab/lock lifecycle, stale timestamp, recovery, two-session cache (mocked SQL size, real HTTP/browser)');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await store.close();}

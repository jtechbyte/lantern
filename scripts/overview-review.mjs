import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { embeddedStore } from './lib/embedded-postgres.mjs';
import { createApp } from '../src/server.mjs';
import { Engine } from '../src/engine.mjs';
import { RealDebrid } from '../src/providers/real-debrid/client.mjs';

const baseline=process.argv.includes('--baseline'), label=baseline?'before':'after';
const dir='artifacts/overview-review';mkdirSync(dir,{recursive:true});
const store=await embeddedStore('a'.repeat(64));
await store.saveSettings({...await store.settings(),sources:[],dmmAuto:false});
const app=createApp({store,engine:new Engine(store),rd:new RealDebrid(store),adminToken:'b'.repeat(64),signingKey:'a'.repeat(64),publicUrl:'http://localhost'});
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#admin-token').fill('b'.repeat(64));await page.locator('#admin-token').press('Enter');await page.locator('#panel-overview').waitFor({state:'visible'});
 const measurement=await page.evaluate(()=>api('database-size'));
 const direct=await store.db.query('SELECT pg_database_size(current_database()) AS database_size_bytes;');
 assert.equal(measurement.bytes,String(direct.rows[0].database_size_bytes),'Endpoint raw bytes match direct SQL in the isolated database');
 assert.equal(measurement.state,'fresh');
 console.log('SQL database size matched:',measurement.bytes,'bytes');
 const measurements={};
 for(const [width,height] of [[1280,720],[1366,768],[1536,864],[1920,1080]]) {
  await page.setViewportSize({width,height});await page.waitForTimeout(500);await page.evaluate(()=>scrollTo(0,0));
  const geometry=await page.evaluate(()=>{const panels=[...document.querySelectorAll('.overview-status')].map(e=>e.getBoundingClientRect());return {heights:panels.map(r=>r.height),gap:document.querySelector('#latest-showcase').getBoundingClientRect().top-Math.max(...panels.map(r=>r.bottom)),rows:document.querySelectorAll('#setup-status .setup-item:not([hidden]),#health .health-row:not([hidden])').length};});
  assert.ok(Math.abs(geometry.heights[0]-geometry.heights[1])<1);assert.ok(geometry.gap>=6&&geometry.gap<=16);assert.equal(geometry.rows,8);console.log(width,JSON.stringify(geometry));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),'No desktop page scrolling');
  await page.getByRole('button',{name:'Setup status details',exact:true}).click();
  assert.match(await page.locator('.overview-details').textContent(),/PostgreSQL/);await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Setup status details');
  await page.getByRole('button',{name:'Source health details',exact:true}).click();
  assert.match(await page.locator('.overview-details').textContent(),/Not searched yet/);await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Source health details');
  await page.evaluate(()=>document.activeElement.blur());
  await page.screenshot({path:`${dir}/${label}-viewport-${width}x${height}.png`});
  measurements[width]=await page.evaluate(()=>[...document.querySelectorAll('.dashboard-nav,.dashboard-nav [role=tab],.sidebar-brand')].map(el=>({class:el.className,id:el.id,rect:el.getBoundingClientRect().toJSON(),padding:getComputedStyle(el).padding,gap:getComputedStyle(el).gap})));
  await page.screenshot({path:`${dir}/${label}-${width}x${height}.png`,fullPage:true});
  await page.locator('.dashboard-nav').screenshot({path:`${dir}/${label}-sidebar-${width}.png`});
 }
 writeFileSync(`${dir}/${label}.json`,JSON.stringify(measurements,null,2));
 if(!baseline)assert.deepEqual(measurements,JSON.parse(readFileSync(`${dir}/before.json`)),'Sidebar geometry must be unchanged');
 assert.deepEqual(errors,[]);console.log(`${label}: four viewports captured; no JavaScript errors`);
} finally {await browser.close();await new Promise(r=>server.close(r));await store.close();}

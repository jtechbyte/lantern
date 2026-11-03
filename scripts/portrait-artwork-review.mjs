import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {embeddedStore} from './lib/embedded-postgres.mjs';
import {createApp} from '../src/server.mjs';
import {Engine} from '../src/engine.mjs';
import {RealDebrid} from '../src/providers/real-debrid/client.mjs';
import {LatestTitles} from '../src/latest-titles.mjs';
const store=await embeddedStore('a'.repeat(64)),admin='b'.repeat(64),latest=new LatestTitles(store);
const ids=['tt39773403','tt10377864'],evidence={checkedAt:new Date().toISOString(),titles:[],viewports:[]};
const dir='artifacts/portrait-review';mkdirSync(dir,{recursive:true});
let browser,server;
try{
 for(const [i,id] of ids.entries())await store.db.query('INSERT INTO releases VALUES($1,$2,$3,$4,$5)',[id,'movie/'+id,'manual','{}',Date.now()-i]);
 const app=createApp({store,latest,engine:new Engine(store),rd:new RealDebrid(store),adminToken:admin,publicUrl:'http://localhost',signingKey:'a'.repeat(64)});
 server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const base='http://127.0.0.1:'+server.address().port;
 const options={headers:{Authorization:'Bearer '+admin}};
 await fetch(base+'/api/latest-titles',options);await latest.pending;
 const data=await (await fetch(base+'/api/latest-titles',options)).json();assert.equal(data.total,2);
 for(const id of ids){
  const item=data.items.find(i=>i.imdb===id);assert.ok(item?.metadata?.title);assert.equal(item.metadataState,'fresh');
  const url='https://v3-cinemeta.strem.io/meta/movie/'+id+'.json',response=await fetch(url,{redirect:'manual'});const redirect=response.headers.get('location');await response.body?.cancel();
  const images=[];for(const [field,imageUrl] of [['background',item.metadata.background],['poster',item.metadata.poster]]){if(!imageUrl)continue;const r=await fetch(imageUrl);images.push({field,url:imageUrl,status:r.status,contentType:r.headers.get('content-type')});await r.arrayBuffer();}
  evidence.titles.push({id,metadataUrl:url,status:response.status,redirect,endpointItem:item,images});
 }
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';browser=await chromium.launch({headless:true,...(existsSync(edge)?{executablePath:edge}:{})});
 const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('#admin-token').fill(admin);await page.locator('#admin-token').press('Enter');
 await page.waitForFunction(()=>document.querySelectorAll('.latest-track .poster-loaded').length===2);
 for(const record of evidence.titles){
  const card=page.locator('.latest-track [data-key="movie/'+record.id+'"]');
  assert.equal(await card.locator('strong').textContent(),record.endpointItem.metadata.title);
  record.rendered=await card.evaluate(c=>{const i=c.querySelector('img'),b=c.querySelector('.latest-poster-backdrop>span');return {src:i.currentSrc,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,objectFit:getComputedStyle(i).objectFit,backdrop:b?.style.backgroundImage||null,rating:c.querySelector('.latest-card-meta span:last-child').textContent};});
  const background=record.images.find(i=>i.field==='background');
  if(background?.status===200){assert.equal(record.rendered.src,record.endpointItem.metadata.background);assert.equal(record.rendered.backdrop,null);}
  else{assert.equal(record.rendered.src,record.endpointItem.metadata.poster);assert.equal(record.rendered.objectFit,'contain');assert.equal(record.rendered.backdrop,'url("'+record.rendered.src+'")');}
  if(record.endpointItem.metadata.imdbRating===null)assert.equal(record.rendered.rating,'\u2014');
 }
 for(const [width,height] of [[1280,720],[1366,768],[1536,864],[1920,1080]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(300);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight));
  const geometry=await page.evaluate(()=>[...document.querySelectorAll('.dashboard-nav,.dashboard-nav [role=tab],.sidebar-brand')].map(el=>({class:el.className,id:el.id,rect:el.getBoundingClientRect().toJSON(),padding:getComputedStyle(el).padding,gap:getComputedStyle(el).gap})));
  assert.deepEqual(geometry,JSON.parse(readFileSync('artifacts/overview-review/before.json'))[width]);
  assert.equal(await page.locator('.latest-type').count(),0);
  const cards=await page.locator('.latest-track .latest-media-card').evaluateAll(es=>es.map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,artHeight:e.querySelector('.latest-art').getBoundingClientRect().height})));
  assert.equal(cards[0].height,cards[1].height);assert.equal(cards[0].artHeight,cards[1].artHeight);
  evidence.viewports.push({width,height,cards,sidebarMatchesBaseline:true,noVerticalScroll:true});
  await page.screenshot({path:dir+'/viewport-'+width+'x'+height+'.png'});
 }
 assert.deepEqual(errors,[]);writeFileSync(dir+'/evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));console.log('PASS explicit live metadata, image responses and rendered artwork for both affected IDs; four unchanged desktop layouts.');
}finally{await browser?.close();await latest.pending;if(server)await new Promise(r=>server.close(r));await store.close();}

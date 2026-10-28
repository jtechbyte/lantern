import test from 'node:test';
import assert from 'node:assert/strict';
import lz from 'lz-string';
import { hashlistUrl, decodeHashlist, fetchHashlist, validateRecords, DmmImporter, parseCatalog, DMM_CATALOG_URL } from '../src/dmm.mjs';
import { embeddedStore } from '../scripts/lib/embedded-postgres.mjs';
import { Store } from '../src/store.mjs';
import { Sources } from '../src/sources.mjs';
import { Engine } from '../src/engine.mjs';
import { parseMedia } from '../src/matching.mjs';
import { createApp } from '../src/server.mjs';
const url='https://debridmediamanager.github.io/hashlists/00011863-7c82-4d3c-846a-deeb5ac0d6be.html';
const record={hash:'a'.repeat(40),filename:'Big.Buck.Bunny.2008.1080p.mkv',bytes:1000};
const html=rows=>`<iframe src="https://debridmediamanager.com/hashlist#${lz.compressToEncodedURIComponent(JSON.stringify(rows))}"></iframe>`;

test('DMM follows only matching stored-list references',async()=>{
 const id='00011863-7c82-4d3c-846a-deeb5ac0d6be',requests=[];
 const result=await fetchHashlist(url,async address=>{
  requests.push(address);
  return requests.length===1?`<iframe src="https://debridmediamanager.com/hashlist#id=${id}"></iframe>`:lz.compressToEncodedURIComponent(JSON.stringify([record]));
 });
 assert.equal(result.rows[0].hash,record.hash);
 assert.equal(requests[1],`https://raw.githubusercontent.com/debridmediamanager/hashlists/main/lists/${id}.txt`);
 await assert.rejects(()=>fetchHashlist(url,async()=>'<iframe src="https://debridmediamanager.com/hashlist#id=other"></iframe>'),/mismatch/);
});
test('DMM accepts only known public paths and decodes bounded hashlist payloads',async()=>{
 assert.ok(hashlistUrl(url).startsWith('https://raw.githubusercontent.com/'));
 for(const value of ['http://localhost/a',url+'?x=1',url.replace('debridmediamanager.github.io','evil.invalid'),url.replace('.html','/../../secrets')])assert.throws(()=>hashlistUrl(value));
 assert.equal((await decodeHashlist(html([record]))).rows[0].hash,record.hash);
 assert.equal((await decodeHashlist(html({torrents:[record]}))).total,1);
 assert.throws(()=>decodeHashlist('<p>Not a hashlist</p>'));
 const parsed=validateRecords([record,record,{...record,hash:'z'.repeat(40)},{...record,filename:'Film 2020 WEBRip',hash:'b'.repeat(40)}],true);
 assert.equal(parsed.records.length,1);assert.equal(parsed.duplicates,1);assert.equal(parsed.invalid,1);assert.equal(parsed.excluded,1);
 const large=await decodeHashlist(html(Array(1002).fill(record)));assert.equal(large.rows.length,1000);assert.equal(large.total,1002);
});
test('DMM imports persist, deduplicate, match exact media, expire and honor filename cleanup',async t=>{
 const store=await embeddedStore('b'.repeat(64));t.after(()=>store.close());
 await store.saveSettings({...await store.settings(),sources:['dmm'],dmmAuto:false,dmmHashlists:[url]});
 let calls=0;
 const importer=new DmmImporter(store,async()=>{calls++;return html([record,{...record,hash:'c'.repeat(40),filename:'Big.Buck.Bunny.2009.1080p.mkv'},{...record,hash:'d'.repeat(40),filename:'Example.S01E02.1080p.mkv'}]);});
 const running=importer.run();assert.equal(importer.run(true),running);
 const result=await running;assert.equal(result.accepted,3);
 await importer.run();assert.equal(calls,1);
 await importer.run(true);assert.equal(calls,2);
 assert.equal(Number((await store.db.query('SELECT count(*) AS n FROM dmm_candidates')).rows[0].n),3);
 const sources=new Sources(store,{readUrl:async()=>{throw Error('Search must use local metadata');}});
 const engine=new Engine(store,{sources,metadataRequest:async()=>({meta:{name:'Big Buck Bunny',releaseInfo:'2008'}})});
 const media=parseMedia('movie','tt1254207');
 const found=await engine.results(media,{force:true});assert.equal(found.selected.length,1);assert.equal(found.selected[0].infoHash,record.hash);
 assert.equal(found.selected[0].source,'dmm');
 const seriesEngine=new Engine(store,{sources,metadataRequest:async()=>({meta:{name:'Example'}})});
 assert.equal((await seriesEngine.results(parseMedia('series','tt1234567:1:2'),{force:true})).selected.length,1);
 assert.equal((await seriesEngine.results(parseMedia('series','tt1234567:1:3'),{force:true})).selected.length,0);
 await store.db.query('UPDATE dmm_candidates SET updated=0');await store.prune();assert.deepEqual(await store.dmmCandidates('big buck bunny'),[]);
 await store.saveSettings({...await store.settings(),blockIndexFilenames:false});
 const bad=validateRecords([{...record,filename:'Example 2020 WEBRip'}],false).records;
 await store.putDmmCandidates(bad);assert.equal((await store.cleanFilenameMatches()).matched,1);
 await store.cleanFilenameMatches(true);assert.deepEqual(await store.dmmCandidates('example'),[]);
 const pressureStore=new Store({query:async(sql,args)=>sql==='SELECT pg_database_size(current_database()) AS bytes'?{rows:[{bytes:3100000000}]}:store.db.query(sql,args)},'b'.repeat(64),true);
 await assert.rejects(()=>pressureStore.putDmmCandidates(validateRecords([record],true).records),/pressure/);
});

test('DMM management requires admin authorization and saved configuration',async t=>{
 const store=await embeddedStore('b'.repeat(64));t.after(()=>store.close());
 let calls=0;const dmm={active:null,run:()=>{calls++;return Promise.resolve();}};
 const app=createApp({store,engine:{},rd:{},dmm,adminToken:'c'.repeat(64),signingKey:'b'.repeat(64),publicUrl:'http://localhost:7001'});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const address=`http://127.0.0.1:${server.address().port}/api/dmm`,headers={Authorization:'Bearer '+'c'.repeat(64)};
 assert.equal((await fetch(address)).status,401);
 assert.equal((await fetch(address,{method:'POST'})).status,401);
 assert.equal((await fetch(address,{method:'POST',headers})).status,409);
 await store.saveSettings({...await store.settings(),sources:['dmm'],dmmHashlists:[url]});
 assert.equal((await fetch(address,{method:'POST',headers})).status,202);assert.equal(calls,1);
 assert.deepEqual(await (await fetch(address,{headers})).json(),{active:false,last:null});
});

test('automatic DMM discovery resumes a bounded queue, backs off and detects new files',async t=>{
 const store=await embeddedStore('b'.repeat(64));t.after(()=>store.close());
 await store.saveSettings({...await store.settings(),sources:['dmm'],dmmHashlists:[]});
 const entry=n=>({type:'blob',path:`00000000-0000-0000-0000-${String(n).padStart(12,'0')}.html`,sha:'a'.repeat(40)});
 let entries=[entry(1),entry(2),entry(3)],catalogCalls=0,downloads=0;
 const request=async address=>{
  if(address===DMM_CATALOG_URL){catalogCalls++;return JSON.stringify({tree:entries,truncated:false});}
  downloads++;return html([record]);
 };
 let importer=new DmmImporter(store,request);
 let result=await importer.run();assert.equal(result.lists,2);assert.equal(result.queue.unvisited,1);assert.equal(catalogCalls,1);assert.equal(downloads,2);
 await importer.run(true);assert.equal(downloads,2,'manual sync cannot bypass automatic cooldown');
 await store.set('dmm:auto-last','null');importer=new DmmImporter(store,request);
 result=await importer.run();assert.equal(result.lists,1);assert.equal(result.queue.unvisited,0);assert.equal(catalogCalls,1,'persisted catalog reused after restart');
 entries.push(entry(4));await store.set('dmm:catalog','null');await store.set('dmm:auto-last','null');
 result=await importer.run();assert.equal(result.lists,1);assert.equal(result.queue.discovered,4);
 entries[0].sha='b'.repeat(40);entries=entries.filter(e=>e.path!==entry(2).path);
 await store.set('dmm:catalog','null');await store.set('dmm:auto-last','null');
 result=await importer.run();assert.equal(result.lists,1);assert.equal(result.queue.discovered,3);
 await store.set('dmm:catalog','null');await store.set('dmm:auto-last','null');
 const failed=new DmmImporter(store,async()=>{throw Object.assign(Error(),{code:'HTTP_429'});});
 result=await failed.run();assert.equal(result.catalogError,true);assert.equal((await store.dmmQueueStatus()).discovered,3);
 assert.ok(JSON.parse(await store.get('dmm:catalog')).retryAt>Date.now());
 await store.set('dmm:auto-last','null');let pressureRequests=0;
 const original=store.storageBudget.bind(store);store.storageBudget=async()=>({state:'pressure'});
 result=await new DmmImporter(store,async()=>{pressureRequests++;}).run();
 assert.equal(result.status,'paused');assert.equal(pressureRequests,0);store.storageBudget=original;
 assert.throws(()=>parseCatalog({tree:entries,truncated:true}),/Incomplete/);
 assert.throws(()=>parseCatalog({tree:[{...entry(1),path:'../../evil.html'}],truncated:false}),/size/);
});

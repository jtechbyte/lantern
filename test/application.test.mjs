import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/legacy-sqlite-store.mjs';
import { Engine } from '../src/engine.mjs';
import { defaults } from '../src/config.mjs';
import { createApp } from '../src/server.mjs';
import { RealDebrid } from '../src/providers/real-debrid/client.mjs';
import { parseMedia, matchRelease, rank, rankWithReasons, selectFile, episodeOf } from '../src/matching.mjs';
import { parseYts, parseEztv, parseApiBay, Sources } from '../src/sources.mjs';

const hash='a'.repeat(40), key='b'.repeat(64), admin='c'.repeat(64);
function harness(t) {
  const dir=mkdtempSync(join(tmpdir(),'lantern-test-')), store=new Store(dir,key);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});}); return {store,dir};
}
test('encrypted settings and installation tokens persist across restarts', t=>{
  const dir=mkdtempSync(join(tmpdir(),'lantern-persist-')); let store=new Store(dir,key);
  const token=store.get('installToken'); store.saveSettings({...defaults,rdToken:'provider-secret-marker'}); store.close();
  store=new Store(dir,key); assert.equal(store.settings().rdToken,'provider-secret-marker');assert.equal(store.get('installToken'),token);
  store.close(); assert.equal(readFileSync(join(dir,'lantern.sqlite')).includes(Buffer.from('provider-secret-marker')),false);
  rmSync(dir,{recursive:true,force:true});
});
test('episode selection rejects ambiguity, samples, and wrong episodes',()=>{
  const media=parseMedia('series','tt1234567:1:2');
  assert.equal(episodeOf('Example.S01E02E03.mkv'),null);
  assert.equal(selectFile([{path:'Example.S01E03.mkv'}],media),null);
  assert.equal(selectFile([{path:'sample.S01E02.mkv'},{path:'Example.S01E02.mkv'}],media).index,1);
  assert.equal(selectFile([{path:'A.S01E02.mkv'},{path:'B.S01E02.mkv'}],media),null);
  assert.equal(selectFile([{path:'Example.S01E03.mkv'}],media,0),null);
  assert.equal(selectFile([{path:'Example.S01E02/Example.S01E03.mkv'}],media),null);
  assert.equal(selectFile([{path:'Example.S01E03/Example.S01E02.mkv'}],media).index,0);
  assert.equal(selectFile([{path:'Example.S01E02E03.mkv'}],media,0),null);
});
test('matching rejects title/year conflicts and proves pack file identity',()=>{
  const movie=parseMedia('movie','tt1234567');
  assert.equal(matchRelease({infoHash:hash,title:'Different 2020 1080p'},movie,{name:'Example',year:2020}),null);
  assert.equal(matchRelease({infoHash:hash,title:'Example 2021 1080p'},movie,{name:'Example',year:2020}),null);
  const episode=parseMedia('series','tt1234567:1:2');
  const release=matchRelease({infoHash:hash,imdb:'tt1234567',title:'Example season pack',files:[{path:'Example.S01E01.mkv'},{path:'Example.S01E02.mkv',length:100}]},episode,{});
  assert.equal(release.fileIdx,1);assert.equal(release.confidence,'file-matched');
  assert.equal(matchRelease({infoHash:hash,imdb:'tt1234567',title:'Example.S01E02',files:[{path:'Example.S01E03.mkv'}]},episode,{}),null);
});
test('deduplication retains different files within a hash and applies filters',()=>{
  const rows=[0,0,1].map(fileIdx=>({infoHash:hash,fileIdx,quality:'1080p',size:100,seeders:4,languages:[]}));
  assert.equal(rank(rows,defaults).length,2);
  assert.equal(rank(rows,{...defaults,excludeQualities:['1080p']}).length,0);
  const noSeeders=rows.map(row=>({...row,seeders:0}));
  assert.equal(rank(noSeeders,{...defaults,provider:"p2p"}).length,0);
  assert.equal(rank(noSeeders,{...defaults,provider:'realdebrid'}).length,2);
  assert.equal(rank(noSeeders,{...defaults,minSeeders:0}).length,2);
});
test('JSON adapters normalize schema and no-results sentinels',()=>{
  assert.equal(parseApiBay([{id:'0',info_hash:'0'.repeat(40)}]).length,0);
  assert.equal(parseEztv({torrents_count:1,torrents:[{title:'Episode',hash,imdb_id:'123456'}]})[0].imdb,'tt0123456');
  assert.equal(parseYts({status:'ok',data:{movies:[{title:'Example',year:2020,imdb_code:'tt1234567',torrents:[{hash,quality:'1080p',size_bytes:100,seeds:2}]}]}})[0].infoHash,hash);
  assert.throws(()=>parseYts({html:'challenge'}),/SCHEMA_CHANGED/);
});

test('ranking explains all applicable filters without changing observations',()=>{
  const rows=[
    {id:'blocked',title:'Example',infoHash:hash,quality:'480p',cam:true,size:null,seeders:0},
    {id:'large',title:'Large',infoHash:'b'.repeat(40),quality:'1080p',size:3*1073741824,seeders:5},
  ];
  const before=structuredClone(rows);
  const settings={...defaults,provider:"p2p",maxSizeGB:2,excludeQualities:['480p']};
  const result=rankWithReasons(rows,settings);
  assert.equal(result.selected.length,0);
  assert.deepEqual(result.rejected[0].reasons.map(r=>r.code),['QUALITY_EXCLUDED','CAM_EXCLUDED','SIZE_UNKNOWN','SEEDER_MINIMUM']);
  assert.equal(result.rejected[1].code,'SIZE_LIMIT');
  assert.deepEqual(rows,before);
  assert.equal(rankWithReasons([rows[1]],{...settings,maxSizeGB:0}).selected.length,1);
});

test('ranking distinguishes duplicates, per-quality caps, and total caps',()=>{
  const row=(id,infoHash,quality,seeders)=>({id,title:id,infoHash,quality,seeders,size:100});
  const rows=[row('best',hash,'1080p',10),row('duplicate',hash,'1080p',9),row('quality-cap','b'.repeat(40),'1080p',8),row('total-cap','c'.repeat(40),'720p',7)];
  const result=rankWithReasons(rows,{...defaults,maxResults:1,perQuality:1});
  assert.deepEqual(result.selected.map(r=>r.id),['best']);
  assert.deepEqual(result.rejected.map(r=>r.code),['DUPLICATE_FILE','QUALITY_RESULT_LIMIT','TOTAL_RESULT_LIMIT']);
  assert.equal(result.rejected[0].retainedId,'best');
  assert.equal(result.selected.length+result.rejected.length,rows.length);
});
test('source failures create health backoff and do not issue repeated requests',async t=>{
  const {store}=harness(t);let calls=0;
  const sources=new Sources(store,{readJson:async()=>{calls++;const error=new Error('blocked');error.status=429;error.code='HTTP_429';throw error;}});
  await assert.rejects(()=>sources.search('yts',parseMedia('movie','tt1234567'),{},AbortSignal.timeout(1000)));
  assert.equal(store.sourceHealth().yts.status,'throttled');
  await sources.search('yts',parseMedia('movie','tt1234567'),{},AbortSignal.timeout(1000));assert.equal(calls,1);
});
test('same-media searches coalesce, failures preserve results, P2P withholds unknown episode files',async t=>{
  const {store}=harness(t);store.saveSettings({...defaults,provider:'p2p',sources:['eztv']});let calls=0;
  const engine=new Engine(store,{metadataRequest:async()=>({meta:{name:'Example',releaseInfo:'2020'}}),sources:{search:async()=>{calls++;await new Promise(r=>setTimeout(r,10));return [{title:'Example.S01E02.1080p',imdb:'tt1234567',infoHash:hash,seeders:5}];}}});
  const media=parseMedia('series','tt1234567:1:2');await Promise.all([engine.discover(media,true),engine.discover(media,true)]);assert.equal(calls,1);
  const result=await engine.results(media);assert.equal(result.selected.length,0);assert.match(result.rejected[0].reason,/file index/);
  store.saveSettings({...store.settings(),provider:'realdebrid'});engine.sources.search=async()=>{throw Error('offline');};
  assert.equal((await engine.results(media,{force:true})).selected.length,1);
});
test('RD submits a discovered hash, selects exact provider file, reuses torrent and redirects',async t=>{
  const {store}=harness(t);store.saveSettings({...defaults,rdToken:'fixture'});
  let status='waiting_files_selection',adds=0,selects=0,unlocks=0;
  const rd=new RealDebrid(store,{sleep:async()=>{},transport:async(url,options)=>{
    if(url.endsWith('/addMagnet')){adds++;assert.equal(new URLSearchParams(options.body).get('magnet'),'magnet:?xt=urn:btih:'+hash);return Buffer.from('{"id":"existing"}');}
    if(url.includes('/info/'))return Buffer.from(JSON.stringify({hash,status,files:[{id:7,path:'Example.S01E01.mkv',selected:0},{id:42,path:'Example.S01E02.mkv',selected:1}],links:['https://host.example/episode2']}));
    if(url.includes('/selectFiles/')){selects++;assert.equal(new URLSearchParams(options.body).get('files'),'42');status='downloaded';return Buffer.from('');}
    if(url.endsWith('/unrestrict/link')){unlocks++;assert.equal(new URLSearchParams(options.body).get('link'),'https://host.example/episode2');return Buffer.from('{"download":"https://cdn.example/episode2.mkv"}');}
    throw Error('Unexpected operation');
  }});
  const release={infoHash:hash,media:'series/tt1234567:1:2'};
  assert.equal(await rd.resolve(release),'https://cdn.example/episode2.mkv');
  await rd.resolve(release);assert.equal(unlocks,1);
  rd.links.clear();await rd.resolve(release);assert.equal(adds,1);assert.equal(selects,1);assert.equal(unlocks,2);
  rd.links.clear();status='downloading';
  await assert.rejects(()=>rd.resolve(release),/preparing this uncached torrent/);assert.equal(adds,1);
  status='waiting_files_selection';await assert.rejects(()=>rd.resolve({...release,fileIdx:0}),/No unambiguous video/);assert.equal(selects,1);
});
test('RD filename policy is checked again after link caching',async t=>{
  const {store}=harness(t);store.saveSettings({...defaults,rdToken:'fixture',rdFilenameMode:'warn'});let unlocks=0;
  const rd=new RealDebrid(store,{transport:async url=>{
    if(url.endsWith('/addMagnet'))return Buffer.from('{"id":"existing"}');
    if(url.includes('/info/'))return Buffer.from(JSON.stringify({hash,status:'downloaded',files:[{id:1,path:'Example.WEBRip.mkv',selected:1,bytes:100}],links:['https://host.example/file']}));
    if(url.endsWith('/unrestrict/link')){unlocks++;return Buffer.from('{"download":"https://cdn.example/movie.mkv"}');}
    throw Error('Unexpected operation');
  }});
  const release={infoHash:hash,media:'movie/tt1234567'};
  await rd.resolve(release);store.saveSettings({...store.settings(),rdFilenameMode:'hide'});
  await assert.rejects(()=>rd.resolve(release),/filename policy/);assert.equal(unlocks,1);
});
test('RD error 35 cooldown applies to additions, not metadata failures',async t=>{
  const {store}=harness(t);store.saveSettings({...defaults,rdToken:'fixture'});let calls=0;
  const rd=new RealDebrid(store,{transport:async()=>{calls++;const e=Error('rejected');e.rdBody={error_code:35};throw e;}});
  const release={infoHash:hash,media:'movie/tt1234567'};
  await assert.rejects(()=>rd.resolve(release),/Blocked by Real-Debrid.*Operation: torrents\/addMagnet/);
  await assert.rejects(()=>rd.resolve(release),/Blocked by Real-Debrid/);assert.equal(calls,1);
  assert.equal(await rd.blocked(hash,'another-account'),false);
  const restarted=new RealDebrid(store);assert.equal(await restarted.blocked(hash,'fixture'),true);
  await store.set(rd.rejectionKey('fixture',hash),String(Date.now()-1));
  assert.equal(await rd.blocked(hash,'fixture'),false);
  rd.cooldown.clear();rd.transport=async url=>{if(url.endsWith('/addMagnet'))return Buffer.from('{"id":"existing"}');const e=Error('metadata');e.rdBody={error_code:35};throw e;};
  await assert.rejects(()=>rd.resolve(release),/Real-Debrid error 35.*Operation: torrents\/info/);assert.equal(rd.cooldown.size,0);
});
test('HTTP workflow authenticates, persists, imports, emits streams and revokes tokens',async t=>{
  const {store}=harness(t);store.saveSettings({...defaults,sources:[]});
  const engine=new Engine(store,{metadataRequest:async()=>{throw Error('offline');}}),rd=new RealDebrid(store);
  const app=createApp({store,engine,rd,adminToken:admin,publicUrl:'http://localhost:7000',signingKey:key});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const req=(path,method='GET',body,auth=true)=>fetch(base+path,{method,headers:{...(auth?{Authorization:`Bearer ${admin}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await req('/api/settings','GET',undefined,false)).status,401);
  const settings=await (await req('/api/settings')).json();assert.equal(settings.settings.rdToken,'');
  assert.equal((await fetch(base+'/api/settings',{method:'PUT',headers:{Authorization:`Bearer ${admin}`,Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify(defaults)})).status,403);
  assert.equal((await req('/api/settings','PUT',{...defaults,sources:[],name:'My Lantern',rdToken:'secret-never-public'})).status,200);
  assert.equal((await req('/api/import','POST',[{type:'movie',mediaId:'tt1234567',title:'Example 2020 1080p',infoHash:hash,fileIdx:0,filePath:'Example.mkv',seeders:5}])).status,200);
  assert.equal((await req('/api/settings/recommended','POST',{},false)).status,401);
  assert.equal((await req('/api/settings/recommended','POST',{})).status,200);
  assert.equal(store.settings().name,'My Lantern');assert.equal(store.settings().rdToken,'secret-never-public');
  assert.deepEqual(store.settings().sources,defaults.sources);assert.equal(store.stats().releases,1);
  store.saveSettings({...store.settings(),provider:'p2p',sources:[]});
  const old=store.get('installToken');
  const manifest=await (await req(`/a/${old}/manifest.json`)).json();assert.equal(manifest.name,'My Lantern');assert.equal(JSON.stringify(manifest).includes('secret-never-public'),false);
  assert.equal(manifest.logo,'http://localhost:7000/brand/lantern-mark.png');
  const logo=await req('/brand/lantern-mark.png');assert.equal(logo.status,200);assert.match(logo.headers.get('content-type'),/image\/png/);
  assert.ok((await logo.arrayBuffer()).byteLength>0);
  const response=await req(`/a/${old}/stream/movie/tt1234567.json`);assert.equal(response.headers.get('access-control-allow-origin'),'*');
  const streams=await response.json();assert.deepEqual(streams.streams,[]); // Legacy P2P must not leak torrent streams.
  store.saveSettings({...store.settings(),provider:'realdebrid'});
  let resolved=0;rd.resolve=async release=>{assert.equal(release.infoHash,hash);resolved++;return 'https://cdn.example/fixture.mkv';};
  rd.call=async()=>{throw Error('Stream listing must not contact Real-Debrid');};
  const debridStreams=await (await req(`/a/${old}/stream/movie/tt1234567.json`)).json();
  // Core treats title and description as aliases, rejecting duplicate fields.
  for (const stream of [...streams.streams, ...debridStreams.streams]) {
    assert.equal(typeof stream.title, 'string');
    assert.ok(stream.title.length > 0);
    assert.equal(Object.hasOwn(stream, 'description'), false);
  }
  assert.equal(debridStreams.streams.length,1);
  await store.set(rd.rejectionKey('secret-never-public',hash),String(Date.now()+86400000));
  assert.deepEqual((await (await req(`/a/${old}/stream/movie/tt1234567.json`)).json()).streams,[]);
  assert.equal(store.releases('movie/tt1234567').length,1);
  await store.deleteKey(rd.rejectionKey('secret-never-public',hash));
  assert.doesNotMatch(debridStreams.streams[0].title,/RD cache unknown|Checked on playback/);
  const playback=new URL(debridStreams.streams[0].url);
  const redirect=await fetch(base+playback.pathname+playback.search,{redirect:'manual'});
  assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'https://cdn.example/fixture.mkv');assert.equal(resolved,1);
  const tampered=await fetch(base+playback.pathname+playback.search.replace(/sig=[^&]+/,'sig=invalid'),{redirect:'manual'});
  assert.equal(tampered.status,403);assert.equal(resolved,1);
  assert.equal((await req(`/a/${old}/play/fake?expires=${Date.now()+10000}&sig=bad`)).status,403);
  await req('/api/rotate-token','POST',{});assert.equal((await req(`/a/${old}/manifest.json`)).status,404);
  assert.equal((await req('/api/settings','PUT',{...defaults,maxResults:999})).status,400);
});

test('RD structured info 404 clears stale ID so retry resubmits without deleting releases',async t=>{
  const {store}=harness(t);store.saveSettings({...defaults,rdToken:'fixture'});
  let adds=0,missing=false;
  const release={infoHash:hash,media:'movie/tt1234567',title:'Example'};
  store.putRelease(release.media,'manual',release);
  const rd=new RealDebrid(store,{transport:async url=>{
    if(url.endsWith('/addMagnet')){adds++;return Buffer.from(JSON.stringify({id:'torrent'+adds}));}
    if(url.includes('/info/')){
      if(missing){const e=Error('missing');e.status=404;e.rdBody={error_code:7};throw e;}
      return Buffer.from(JSON.stringify({hash,status:'downloaded',files:[{id:1,path:'Example.mp4',selected:1,bytes:100}],links:['https://host.example/file']}));
    }
    if(url.endsWith('/unrestrict/link'))return Buffer.from('{"download":"https://cdn.example/movie.mp4"}');
    throw Error('Unexpected operation');
  }});
  await rd.resolve(release);rd.links.clear();missing=true;
  await assert.rejects(()=>rd.resolve(release),/Cleared its saved reference/);
  assert.equal(adds,1);assert.equal(store.releases(release.media).length,1);
  missing=false;await rd.resolve(release);assert.equal(adds,2);
  assert.equal(rd.cooldown.size,0);
});

test('partial source results survive a blocked detail while health keeps its backoff',async t=>{
  const {store}=harness(t);const sources=new Sources(store);
  sources.run=async()=>{const e=Error('blocked');e.status=403;e.code='HTTP_403';e.partialRows=[{infoHash:hash,title:'Example'}];throw e;};
  const rows=await sources.search('apibay',parseMedia('movie','tt1234567'),{},AbortSignal.timeout(1000));
  assert.equal(rows.length,1);assert.equal(store.sourceHealth()['apibay'].status,'blocked');assert.ok(store.sourceHealth()['apibay'].retryAt>Date.now());
});

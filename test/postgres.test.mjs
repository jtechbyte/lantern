import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { embeddedStore } from '../scripts/lib/embedded-postgres.mjs';
import { Store as LegacyStore } from '../src/legacy-sqlite-store.mjs';
import { Store } from '../src/store.mjs';
import { migrateSqlite } from '../src/migrate-sqlite.mjs';
import { Engine } from '../src/engine.mjs';
import { RealDebrid } from '../src/providers/real-debrid/client.mjs';
import { createApp } from '../src/server.mjs';
import { parseMedia } from '../src/matching.mjs';
const key='b'.repeat(64),hash='a'.repeat(40);

test('PostgreSQL data persists after closing and reopening the database engine',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'lantern-pg-persist-'));
  let store;
  try {
    const path=join(directory,'postgres');
    store=await embeddedStore(key,{directory:path});
    const token=await store.get('installToken');
    await store.saveSettings({...await store.settings(),name:'Persistent PG'});
    const row=await store.putRelease('movie/tt1234567','manual',{infoHash:hash,title:'Persistent release'});
    await store.close();store=null;
    store=await embeddedStore(key,{directory:path});
    assert.equal((await store.settings()).name,'Persistent PG');assert.equal(await store.get('installToken'),token);
    assert.equal((await store.release(row.id)).title,'Persistent release');
  } finally { await store?.close();rmSync(directory,{recursive:true,force:true}); }
});

test('PostgreSQL schema, encrypted settings, CRUD, transactions, pruning and restart',async t=>{
  const store=await embeddedStore(key);t.after(()=>store.close());
  await store.migrateSchema();
  assert.equal((await store.db.query('SELECT count(*) AS n FROM schema_migrations')).rows[0].n,5);
  const token=await store.get('installToken');
  await store.saveSettings({...await store.settings(),name:'PG Lantern',rdToken:'private-fixture'});
  assert.equal((await store.get('settings')).includes('private-fixture'),false);
  const reopened=new Store(store.db,key);await reopened.initialize();
  assert.equal((await reopened.settings()).name,'PG Lantern');assert.equal(await reopened.get('installToken'),token);
  const media='movie/tt1234567';
  const manual=await store.putRelease(media,'manual',{infoHash:hash,title:'Example 2020 1080p'});
  const auto=await store.putRelease(media,'yts',{infoHash:hash,title:'Example 2020 1080p'});
  assert.equal((await store.releases(media)).length,2);
  await store.deleteImport(auto.id);assert.ok(await store.release(auto.id));
  await assert.rejects(()=>store.transaction(async tx=>{await tx.set('rollback','bad');await tx.deleteImport(manual.id);throw Error('abort');}),/abort/);
  assert.equal(await store.get('rollback'),undefined);assert.ok(await store.release(manual.id));
  await store.searched(media);assert.ok(await store.lastSearch(media)>0);
  await store.health('yts',{status:'ok',checkedAt:Date.now()});
  await store.watch(media);await store.watch(media);assert.equal((await store.watchlist()).length,1);
  await store.event('search','Fixture observation');
  const stats=await store.stats();assert.equal(stats.releases,2);assert.equal(stats.health.yts.status,'ok');assert.equal(typeof stats.events[0].time,'number');
  await store.db.query('UPDATE releases SET updated=0');await store.prune();
  assert.equal(await store.release(auto.id),null);assert.ok(await store.release(manual.id));
  await store.unwatch(media);assert.deepEqual(await store.watchlist(),[]);
  await store.saveSettings(await store.settings());assert.equal(await store.lastSearch(media),0);
  await store.deleteImport(manual.id);assert.equal(await store.release(manual.id),null);
});

test('PostgreSQL backs async HTTP settings, imports, discovery, playback and health',async t=>{
  const store=await embeddedStore(key);t.after(()=>store.close());
  await store.saveSettings({...await store.settings(),sources:['yts']});
  let calls=0;
  const engine=new Engine(store,{metadataRequest:async()=>({meta:{name:'Example',releaseInfo:'2020'}}),sources:{search:async()=>{calls++;return [{infoHash:hash,imdb:'tt1234567',title:'Example 2020 1080p',seeders:5}];}}});
  const media=parseMedia('movie','tt1234567');await Promise.all([engine.discover(media,true),engine.discover(media,true)]);assert.equal(calls,1);
  const rd=new RealDebrid(store,{transport:async url=>{
    if(url.endsWith('/addMagnet'))return Buffer.from(JSON.stringify({id:'pg-torrent'}));
    if(url.includes('/info/'))return Buffer.from(JSON.stringify({hash,status:'downloaded',files:[{id:42,path:'Example.mkv',bytes:100,selected:1}],links:['https://host.example/file']}));
    return Buffer.from('{"download":"https://cdn.example/movie.mkv"}');
  }});
  const admin='c'.repeat(64),app=createApp({store,engine,rd,adminToken:admin,publicUrl:'http://localhost:7001',signingKey:key});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const req=(path,method='GET',body)=>fetch(base+path,{method,headers:{Authorization:`Bearer ${admin}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const config=await (await req('/api/settings')).json();assert.equal(config.settings.name,'Lantern');
  assert.equal((await req('/api/settings','PUT',{...config.settings,name:'Async PG',provider:'realdebrid',rdToken:'fixture'})).status,200);
  const token=await store.get('installToken');
  const manifest=await (await req(`/a/${token}/manifest.json`)).json();assert.equal(manifest.name,'Async PG');
  const streams=await (await req(`/a/${token}/stream/movie/tt1234567.json`)).json();assert.equal(streams.streams.length,1);
  const url=new URL(streams.streams[0].url);
  const play=await fetch(base+url.pathname+url.search,{redirect:'manual'});assert.equal(play.status,302);assert.equal(play.headers.get('location'),'https://cdn.example/movie.mkv');await play.text();
  assert.equal((await req('/api/import','POST',[{type:'movie',mediaId:'tt1234567',title:'Manual',infoHash:'d'.repeat(40)}])).status,200);
  assert.equal((await store.stats()).releases,2);
  assert.equal((await req('/healthz')).status,200);
  const ping=store.ping;store.ping=async()=>{throw Error('database down');};assert.equal((await req('/healthz')).status,503);store.ping=ping;
  await req('/api/rotate-token','POST',{});assert.equal((await req(`/a/${token}/manifest.json`)).status,404);
});

test('SQLite migration preserves secrets, token, IDs and records; refuses overwrite',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'lantern-migration-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const legacy=new LegacyStore(directory,key),token=legacy.get('installToken');
  legacy.saveSettings({...legacy.settings(),name:'Migrated',rdToken:'keep-secret'});
  const row=legacy.putRelease('movie/tt1234567','manual',{infoHash:hash,title:'Example'});
  legacy.watch('movie/tt1234567');legacy.searched('movie/tt1234567');legacy.health('yts',{status:'ok'});legacy.event('test','Old event');legacy.set('rd:fixture','torrent-id');legacy.close();
  const path=join(directory,'lantern.sqlite'),before=readFileSync(path);
  const store=await embeddedStore(key,{initialize:false});t.after(()=>store.close());
  await assert.rejects(()=>store.initialize(path),/Legacy SQLite/);
  assert.equal(await store.get('settings'),undefined);
  const counts=await migrateSqlite(store,path);assert.equal(counts.releases,1);
  assert.equal((await store.settings()).rdToken,'keep-secret');assert.equal(await store.get('installToken'),token);
  assert.equal((await store.release(row.id)).title,'Example');assert.equal(await store.get('rd:fixture'),'torrent-id');
  await store.event('test','New event');assert.equal((await store.stats()).events.length,2);
  await assert.rejects(()=>migrateSqlite(store,path),/not empty/);
  assert.deepEqual(readFileSync(path),before);
});

test('SQLite migration rolls back invalid data and rejects incorrect encryption keys',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'lantern-migration-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const legacy=new LegacyStore(directory,key);legacy.db.prepare('INSERT INTO health VALUES (?,?)').run('bad','not json');legacy.close();
  const store=await embeddedStore(key,{initialize:false});t.after(()=>store.close());
  const path=join(directory,'lantern.sqlite');
  await assert.rejects(()=>migrateSqlite(new Store(store.db,'c'.repeat(64)),path),/original ENCRYPTION_KEY/);
  await assert.rejects(()=>migrateSqlite(store,path));
  assert.equal(await store.get('settings'),undefined);assert.equal((await store.stats()).releases,0);
});

test('SQLite migration reads committed WAL contents without modifying original files',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'lantern-wal-import-'));
  const legacy=new LegacyStore(directory,key);
  t.after(()=>{legacy.close();rmSync(directory,{recursive:true,force:true});});
  legacy.db.exec('PRAGMA wal_autocheckpoint=0');
  legacy.saveSettings({...legacy.settings(),name:'Committed in WAL'});
  const row=legacy.putRelease('movie/tt1234567','manual',{infoHash:hash,title:'WAL release'});
  const path=join(directory,'lantern.sqlite');
  const mainBefore=readFileSync(path),walBefore=readFileSync(`${path}-wal`);
  assert.ok(walBefore.length>0);
  // Writer stays idle while the filesystem snapshot is copied.
  const store=await embeddedStore(key,{initialize:false});t.after(()=>store.close());
  await migrateSqlite(store,path);
  assert.equal((await store.settings()).name,'Committed in WAL');
  assert.equal((await store.release(row.id)).title,'WAL release');
  assert.deepEqual(readFileSync(path),mainBefore);
  assert.deepEqual(readFileSync(`${path}-wal`),walBefore);
});

test('index filename gate and cleanup share exact rules, including source titles',async t=>{
  const store=await embeddedStore(key);t.after(()=>store.close());
  const media='movie/tt1234567';
  assert.equal(await store.putRelease(media,'yts',{infoHash:hash,title:'Example.WEBRip.1080p'}),null);
  assert.equal(await store.putRelease(media,'manual',{infoHash:hash,title:'Example',filePath:'dir/Example.WEB-DL.mkv'}),null);
  const allowed=await store.putRelease(media,'yts',{infoHash:hash,title:'Example.web-dl.1080p'});assert.ok(allowed);
  await store.saveSettings({...await store.settings(),blockIndexFilenames:false});
  await store.putRelease(media,'manual',{infoHash:'d'.repeat(40),title:'Example.WEBRip'});
  await store.putRelease(media,'eztv',{infoHash:'e'.repeat(40),title:'Example',torrentName:'Example.BDRip'});
  await store.saveSettings({...await store.settings(),blockIndexFilenames:true});
  const preview=await store.cleanFilenameMatches();assert.equal(preview.matched,2);assert.equal(preview.removed,0);
  assert.equal((await store.stats()).releases,3);
  const result=await store.cleanFilenameMatches(true);assert.equal(result.removed,2);
  assert.equal((await store.stats()).releases,1);assert.ok(await store.release(allowed.id));
  assert.equal((await store.cleanFilenameMatches(true)).removed,0);
  const engine=new Engine(store);
  assert.equal(await engine.importRelease({type:'movie',mediaId:'tt1234567',infoHash:hash,title:'Example.WEBRip'}),null);
});

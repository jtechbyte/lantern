import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { embeddedStore } from '../scripts/lib/embedded-postgres.mjs';
import { LatestTitles,normalizeCatalogMetadata } from '../src/latest-titles.mjs';
import { createApp } from '../src/server.mjs';

test('catalog groups sources and episodes, preserves first indexed date, filters and removes absent titles',async t=>{
  const store=await embeddedStore('a'.repeat(64));t.after(()=>store.close());
  const insert=async(id,media,time)=>store.db.query('INSERT INTO releases VALUES($1,$2,$3,$4,$5)',[id,media,'manual','{}',time]);
  await insert('a','movie/tt0133093',1000);await insert('b','movie/tt0133093',2000);
  await insert('c','series/tt0944947:1:1',3000);await insert('d','series/tt0944947:2:1',4000);
  let now=Date.parse('2026-10-29');let calls=0;
  const latest=new LatestTitles(store,{now:()=>now,request:async url=>{calls++;const type=url.includes('/movie/')?'movie':'series';const id=/tt\d+/.exec(url)[0];return {meta:{id,type,name:type+' fixture',released:'2026-10-01',imdbRating:'8.2',poster:'https://images.metahub.space/poster/small/'+id+'/img'}};}});
  let data=await latest.list();assert.equal(data.total,2);assert.equal(data.items[0].key,'series/tt0944947');assert.equal(data.items[1].firstSeen,1000);
  await store.db.query('UPDATE releases SET updated=9000 WHERE id=$1',['a']);now+=6000;
  data=await latest.list();assert.equal(data.items[1].firstSeen,1000);assert.equal(data.items[1].lastSeen,9000);
  await Promise.all([latest.warm(),latest.warm()]);assert.equal(calls,2);
  data=await latest.list({view:'released'});assert.equal(data.total,2);assert.equal(data.items[0].metadata.imdbRating,8.2);
  await latest.warm();assert.equal(calls,2);
  assert.equal((await latest.list({type:'movie'})).total,1);
  assert.equal((await latest.list({offset:1,limit:1})).items.length,1);
  now+=8*86400000;latest.request=async()=>{calls++;throw Error('provider down');};await latest.warm();data=await latest.list();assert.equal(data.items[0].metadataState,'stale');assert.equal(data.items[0].metadata.title,'series fixture');
  await store.db.query("DELETE FROM releases WHERE media LIKE 'movie/%'");now+=6000;assert.equal((await latest.list()).total,1);
  await store.db.query('DELETE FROM releases');now+=6000;assert.equal((await latest.list()).total,0);
});

test('metadata validates identity, dates, rating provenance and safe artwork URLs',()=>{
  const base={id:'tt0133093',type:'movie',name:'The Matrix'};
  assert.throws(()=>normalizeCatalogMetadata({...base,id:'tt0000000'},'movie/tt0133093'));
  const m=normalizeCatalogMetadata({...base,poster:'javascript:alert(1)',imdbRating:'N/A',released:'bad'},'movie/tt0133093');
  assert.equal(normalizeCatalogMetadata({...base,background:'https://example.com/landscape.jpg'},'movie/tt0133093').background,'https://example.com/landscape.jpg');
  assert.equal(normalizeCatalogMetadata({...base,background:'https://user:secret@example.com/image'},'movie/tt0133093').background,null);
  assert.equal(m.poster,null);assert.equal(m.imdbRating,null);assert.equal(m.releaseDate,null);
});

test('migration backfills only retained timestamps and trigger writes roll back atomically',async t=>{
  const store=await embeddedStore('a'.repeat(64));t.after(()=>store.close());
  // Reconstruct the previous schema in an isolated database, then run migration 6.
  await store.db.query('DROP TRIGGER releases_track_title ON releases');await store.db.query('DROP FUNCTION track_indexed_title()');
  await store.db.query('DROP TABLE indexed_titles');await store.db.query('DROP INDEX releases_title_key');await store.db.query('DELETE FROM schema_migrations WHERE version=6');
  await store.db.query("INSERT INTO releases VALUES('old','movie/tt0133093','manual','{}',12345)");
  await store.migrateSchema();const row=(await store.db.query('SELECT * FROM indexed_titles')).rows[0];
  assert.equal(Number(row.first_seen),12345);assert.equal(row.estimated,true);
  await assert.rejects(()=>store.transaction(async tx=>{await tx.db.query("INSERT INTO releases VALUES('rollback','movie/tt1375666','manual','{}',23456)");throw Error('rollback');}));
  assert.equal((await store.db.query('SELECT count(*) AS n FROM indexed_titles')).rows[0].n,1);
});

test('latest endpoint requires administrator and validates filters without exposing upstream errors',async t=>{
  const store=await embeddedStore('a'.repeat(64));let now=Date.now();const latest=new LatestTitles(store,{now:()=>now,request:async()=>{throw Error('private upstream error');}});
  const app=createApp({store,latest,engine:{inflight:new Map()},rd:{active:new Map()},adminToken:'b'.repeat(64),publicUrl:'http://localhost',signingKey:'a'.repeat(64)});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});t.after(async()=>{await latest.pending;await new Promise(r=>server.close(r));await store.close();});
  const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(base+'/api/latest-titles')).status,401);
  const options={headers:{Authorization:'Bearer '+'b'.repeat(64)}};
  assert.equal((await fetch(base+'/api/latest-titles?type=invalid',options)).status,400);
  const data=await(await fetch(base+'/api/latest-titles',options)).json();assert.equal(data.total,0);assert.equal("featured" in data,false);
  await store.db.query("INSERT INTO releases VALUES('a','series/tt0944947:1:1','manual','{}',$1),('b','movie/tt0133093','manual','{}',$2)",[now,now-1000]);now+=6000;
  const filtered=await(await fetch(base+'/api/latest-titles?type=movie',options)).json();assert.equal(filtered.items[0].type,'movie');assert.equal(filtered.total,1);
});

test('newly indexed badge uses only precise first-indexed timestamps within seven days',()=>{
 const context=vm.createContext({});vm.runInContext(readFileSync(new URL('../public/latest-titles.js',import.meta.url),'utf8').split('(() => {')[0],context);
 const now=2000000000,check=(age,estimated=false)=>context.latestTitleIsNew({firstSeen:now-age,estimated},now);
 assert.equal(check(0),true);assert.equal(check(7*86400000-1),true);assert.equal(check(7*86400000),false);assert.equal(check(7*86400000+1),false);assert.equal(check(-1),false);assert.equal(check(1,true),false);
 assert.equal(context.latestTitleIsNew({firstSeen:'bad'},now),false);
});

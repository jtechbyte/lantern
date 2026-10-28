import test from 'node:test';
import assert from 'node:assert/strict';
import { embeddedStore } from '../scripts/lib/embedded-postgres.mjs';
import { Store } from '../src/store.mjs';

test('4 GB safeguard measures decimal GB and blocks both automatic and manual release writes', async () => {
  let bytes=2999999999;
  const store=new Store({query:async sql=>{
    assert.equal(sql,'SELECT pg_database_size(current_database()) AS bytes');
    return {rows:[{bytes:String(bytes)}]};
  }},'b'.repeat(64));
  assert.equal((await store.storageBudget(true)).state,'normal');
  bytes=3000000000;assert.equal((await store.storageBudget(true)).state,'pressure');
  bytes=3500000000;assert.equal((await store.storageBudget(true)).state,'paused');
  for(const source of ['yts','manual'])await assert.rejects(()=>store.putRelease('movie/tt1234567',source,{}),/writes paused/);
  bytes=4000000001;assert.equal((await store.storageBudget(true)).state,'paused');
  bytes=2000000000;assert.equal((await store.storageBudget(true)).state,'normal');
});

test('storage pressure reduces cleanup targets without removing manual data', async t => {
  const store=await embeddedStore('b'.repeat(64));t.after(()=>store.close());
  await store.putRelease('movie/tt1234567','manual',{title:'Example',infoHash:'a'.repeat(40)});
  const connect=store.db.connect.bind(store.db);
  store.db.connect=async()=>{
    const client=await connect(),query=client.query;
    client.query=(sql,...args)=>sql==='SELECT pg_database_size(current_database()) AS bytes'
      ? Promise.resolve({rows:[{bytes:'3100000000'}]}) : query(sql,...args);
    return client;
  };
  const result=await store.prune();
  assert.equal(result.releaseLimit,25000);assert.equal(result.searchLimit,5000);
  assert.equal((await store.releases('movie/tt1234567')).length,1);
});

test('automatic maintenance expires only disposable data and preserves account/library state', async t => {
  const store=await embeddedStore('b'.repeat(64));t.after(()=>store.close());
  const settings=await store.get('settings'),token=await store.get('installToken');
  const hash='a'.repeat(40),media='movie/tt1234567';
  await store.watch(media);
  const manual=await store.putRelease(media,'manual',{title:'Example',infoHash:hash});
  await store.putRelease(media,'yts',{title:'Example',infoHash:'c'.repeat(40)});
  await store.db.query('UPDATE releases SET updated=0');
  await store.searched(media);
  await store.db.query("INSERT INTO searches VALUES ('movie/tt7654321',0)");
  await store.set('rd:account:'+hash+':tt1234567:-','keep');
  await store.set('rd:account:'+('c'.repeat(40))+':tt7654321:-','remove');
  await store.set('rd-block:expired',String(Date.now()-1000));
  await store.set('rd-block:active',String(Date.now()+86400000));
  await store.set('rd-block:invalid','not a timestamp');
  await store.db.query("INSERT INTO events(time,kind,message) SELECT 0,'test','event' FROM generate_series(1,205)");
  const summary=await store.prune();
  assert.deepEqual(summary.removed,{dmmCandidates:0,releases:1,searches:1,rdReferences:1,rdBlocks:1,events:5});
  assert.ok(await store.release(manual.id));
  assert.equal(await store.get('settings'),settings);assert.equal(await store.get('installToken'),token);
  assert.deepEqual(await store.watchlist(),[media]);
  assert.equal(await store.get('rd:account:'+hash+':tt1234567:-'),'keep');
  assert.ok(await store.get('rd-block:active'));assert.equal(await store.get('rd-block:invalid'),'not a timestamp');
  assert.equal((await store.stats()).cleanup.at,summary.at);
  assert.deepEqual((await store.prune()).removed,{dmmCandidates:0,releases:0,searches:0,rdReferences:0,rdBlocks:0,events:0});
});

test('maintenance evicts oldest automatic rows at capacity and drains expiry in bounded passes', async t => {
  const store=await embeddedStore('b'.repeat(64));t.after(()=>store.close());
  const now=Date.now();
  await store.db.query(`INSERT INTO releases(id,media,source,data,updated)
    SELECT 'auto-'||n,'movie/tt1234567','yts','{}'::jsonb,$1::bigint+n FROM generate_series(1,50003) n`,[now]);
  await store.db.query(`INSERT INTO searches SELECT 'media-'||n,$1::bigint+n FROM generate_series(1,10003) n`,[now]);
  const result=await store.prune();
  assert.equal(result.removed.releases,3);assert.equal(result.removed.searches,3);
  assert.equal(await store.release('auto-1'),null);assert.ok(await store.release('auto-50003'));
  await store.db.query('UPDATE releases SET updated=0');
  assert.equal((await store.prune()).removed.releases,2000);
  assert.equal(Number((await store.db.query('SELECT count(*) AS n FROM releases')).rows[0].n),48000);
});

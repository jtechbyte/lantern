import test from 'node:test';
import assert from 'node:assert/strict';
import { embeddedStore } from '../scripts/lib/embedded-postgres.mjs';
import { createApp } from '../src/server.mjs';
import { Profiles } from '../src/profiles.mjs';

test('invalid settings/import bodies never mutate stored data; errors stay private',async t=>{
  const store=await embeddedStore('b'.repeat(64));t.after(()=>store.close());
  const admin='c'.repeat(64),app=createApp({store,engine:{},rd:{links:new Map()},adminToken:admin,publicUrl:'http://localhost:7001',signingKey:'b'.repeat(64)});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const headers={Authorization:'Bearer '+admin,'Content-Type':'application/json'};
  const before=await store.settings();
  assert.equal((await fetch(base+'/api/settings',{method:'PUT',headers})).status,400);
  const invalid={name:'',description:'x'.repeat(301),logo:'http://example.com/logo.png',sources:['invented'],maxResults:51,perQuality:0,maxSizeGB:-1,minSeeders:1.5,excludeQualities:['8k'],excludeCam:'yes',preferLanguage:'invented',sort:'invented',provider:'invented',rdToken:'x'.repeat(301),blockIndexFilenames:'true',rdFilenameMode:'invented',sourceFormat:'invented',formatIcons:'yes',formatSeeders:1,refreshMinutes:14,dmmAuto:'true',dmmHashlists:['http://127.0.0.1/private']};
  for(const [key,value] of Object.entries(invalid)){
    const response=await fetch(base+'/api/settings',{method:'PUT',headers,body:JSON.stringify({...before,[key]:value})});
    assert.equal(response.status,400,key);assert.equal((await response.json()).error,'Invalid input');
  }
  assert.deepEqual(await store.settings(),before);
  assert.equal((await fetch(base+'/api/settings',{method:'PUT',headers,body:'{'})).status,400);
  assert.equal((await fetch(base+'/api/settings',{method:'PUT',headers,body:JSON.stringify({name:'x'.repeat(600000)})})).status,413);
  assert.equal((await fetch(base+'/api/settings',{headers:{...headers,Origin:'https://other.invalid'}})).status,403);
  const response=await fetch(base+'/api/settings',{headers});
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-frame-options'),'DENY');assert.ok(response.headers.get('content-security-policy'));
  assert.equal((await fetch(base+'/api/no-such-route',{headers})).status,404);
  store.stats=async()=>{throw Error('private-database-password');};
  const failed=await fetch(base+'/api/status',{headers});assert.equal(failed.status,500);assert.doesNotMatch(await failed.text(),/private-database-password/);
});

test('profile/watchlist capacity, duplicate watches, removal and expiry preserve other records',async t=>{
  const store=await embeddedStore('b'.repeat(64));t.after(()=>store.close());
  const profiles=new Profiles(store);
  let first;
  for(let i=0;i<50;i++){const invitation=await profiles.invite('Fixture '+i);first ||= invitation;await store.watch('movie/tt'+String(1000000+i));}
  await assert.rejects(()=>profiles.invite('Over capacity'),error=>error.status===409);
  await assert.rejects(()=>store.watch('movie/tt2000000'),/limit is 50/);
  await store.watch('movie/tt1000000');assert.equal((await store.watchlist()).length,50);
  await profiles.remove(first.id);await profiles.invite('Replacement');assert.equal((await profiles.list()).length,50);
  await assert.rejects(()=>profiles.claim(first.invite),/invalid/);
  await store.unwatch('movie/tt1000000');await store.watch('movie/tt2000000');assert.equal((await store.watchlist()).length,50);
});

test('socket-IP request limiter returns retry guidance and health remains available',async t=>{
  const app=createApp({store:{ping:async()=>{}},engine:{},rd:{},adminToken:'c'.repeat(64),publicUrl:'http://localhost:7001',signingKey:'b'.repeat(64)});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  for(let i=0;i<180;i++){const response=await fetch(base+'/api/settings');assert.equal(response.status,401);await response.text();}
  const limited=await fetch(base+'/api/settings');assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'60');
  assert.equal((await fetch(base+'/healthz')).status,200);
});

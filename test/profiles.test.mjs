import test from 'node:test';
import assert from 'node:assert/strict';
import { embeddedStore } from '../scripts/lib/embedded-postgres.mjs';
import { Profiles } from '../src/profiles.mjs';
import { Engine } from '../src/engine.mjs';
import { RealDebrid } from '../src/providers/real-debrid/client.mjs';
import { createApp } from '../src/server.mjs';

const key='b'.repeat(64),admin='c'.repeat(64),hash='a'.repeat(40);

test('invitations are atomic, expire, revoke and encrypt profile secrets', async t=>{
  const store=await embeddedStore(key);t.after(()=>store.close());
  await store.saveSettings({...await store.settings(),rdToken:'owner-private'});
  const profiles=new Profiles(store),invitation=await profiles.invite('Alice');
  const claims=await Promise.allSettled([profiles.claim(invitation.invite),profiles.claim(invitation.invite)]);
  assert.equal(claims.filter(x=>x.status==='fulfilled').length,1);
  const access=claims.find(x=>x.status==='fulfilled').value.manageToken;
  let profile=await profiles.find('manage',access);
  assert.equal((await profiles.effective(profile)).rdToken,'');
  const secret=profiles.unpack(profile);
  await profiles.save(profile.id,{...secret.preferences,rdToken:'alice-private'});
  profile=await profiles.find('manage',access);
  const dump=JSON.stringify((await store.db.query('SELECT * FROM profiles')).rows);
  for(const value of [access,invitation.invite,secret.installToken,'alice-private','owner-private'])assert.equal(dump.includes(value),false);
  assert.equal((await profiles.effective(profile)).rdToken,'alice-private');
  assert.equal((await store.settings()).rdToken,'owner-private');
  const expired=await profiles.invite('Expired');
  await store.db.query('UPDATE profiles SET invite_expires=0 WHERE id=$1',[expired.id]);
  await assert.rejects(()=>profiles.claim(expired.invite),/expired/);
  const disabled=await profiles.invite('Disabled');await profiles.revoke(disabled.id);
  await assert.rejects(()=>profiles.claim(disabled.invite),/invalid/);
  await profiles.revoke(profile.id);
  assert.equal(await profiles.find('manage',access),null);
  assert.equal(await profiles.find('install',secret.installToken),null);
  assert.equal(store.decrypt((await store.db.query('SELECT secret FROM profiles WHERE id=$1',[profile.id])).rows[0].secret).preferences.rdToken,'');
});

test('owner and two invited users have isolated settings, provider calls, links and permissions', async t=>{
  const store=await embeddedStore(key);t.after(()=>store.close());
  await store.saveSettings({...await store.settings(),sources:['yts'],rdToken:'owner-private'});
  await store.putRelease('movie/tt1234567','manual',{infoHash:'d'.repeat(40),title:'Private manual',quality:'1080p',size:100});
  const engine=new Engine(store,{metadataRequest:async()=>({meta:{name:'Example',releaseInfo:'2020'}}),sources:{search:async()=>[
    {infoHash:hash,title:'Example 2020 1080p',imdb:'tt1234567',size:100,seeders:1},
  ]}});
  const calls=[];
  const rd=new RealDebrid(store,{transport:async(url,options)=>{
    calls.push(options.headers.Authorization);
    if(url.endsWith('/user'))return Buffer.from('{"type":"premium"}');
    if(url.endsWith('/addMagnet'))return Buffer.from('{"id":"fixture"}');
    if(url.includes('/info/'))return Buffer.from(JSON.stringify({hash,status:'downloaded',files:[{id:1,path:'Example.mp4',bytes:100,selected:1}],links:['https://host.example/file']}));
    if(url.endsWith('/unrestrict/link'))return Buffer.from('{"download":"https://cdn.example/movie.mp4"}');
    throw Error('Unexpected operation');
  }});
  const app=createApp({store,engine,rd,adminToken:admin,publicUrl:'http://localhost:7001',signingKey:key});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(path,credential,method='GET',body,origin)=>fetch(base+path,{method,redirect:'manual',headers:{...(credential?{Authorization:'Bearer '+credential}:{}),'Content-Type':'application/json',...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await request('/api/profiles')).status,401);
  assert.equal((await request('/profile-api/settings',admin)).status,401);
  assert.equal((await request('/profile-api/claim',null,'POST',{invite:'a'.repeat(64)},'https://other.example')).status,403);
  const create=async label=>{
    const invitation=await (await request('/api/profiles',admin,'POST',{label})).json();
    const invite=new URLSearchParams(new URL(invitation.inviteUrl).hash.slice(1)).get('invite');
    const claimed=await (await request('/profile-api/claim',null,'POST',{invite})).json();
    assert.equal((await request('/profile-api/claim',null,'POST',{invite})).status,404);
    const config=await (await request('/profile-api/settings',claimed.manageToken)).json();
    assert.equal(config.settings.rdToken,'');assert.equal(config.rdTokenSet,false);
    return {...claimed,config,id:invitation.id};
  };
  const alice=await create('Alice'),bob=await create('Bob');
  const path=config=>new URL(config.installUrl).pathname;
  const streamPath=config=>path(config).replace('manifest.json','stream/movie/tt1234567.json');
  assert.equal((await request('/api/settings',alice.manageToken)).status,401);
  assert.equal((await request('/api/profiles',alice.manageToken)).status,401);
  assert.equal((await request('/profile-api/settings',null,'PUT',alice.config.settings)).status,401);
  assert.equal((await request(streamPath(alice.config))).status,200);
  assert.deepEqual((await (await request(streamPath(alice.config))).json()).streams,[]);
  assert.equal(calls.length,0);
  assert.equal((await request('/profile-api/settings',alice.manageToken,'PUT',{...alice.config.settings,rdToken:'alice-private',maxResults:1})).status,200);
  assert.equal((await request('/profile-api/settings',bob.manageToken,'PUT',{...bob.config.settings,rdToken:'bob-private',maxResults:7})).status,200);
  assert.equal((await request('/profile-api/settings',alice.manageToken,'PUT',{...alice.config.settings,sources:['manual']})).status,400);
  const a=await (await request('/profile-api/settings',alice.manageToken)).json();
  const b=await (await request('/profile-api/settings',bob.manageToken)).json();
  assert.equal(a.settings.maxResults,1);assert.equal(b.settings.maxResults,7);
  assert.equal(a.settings.rdToken,'');assert.equal(a.rdTokenSet,true);
  assert.equal((await store.settings()).rdToken,'owner-private');
  const playPaths=[];
  for(const user of [alice,bob]) {
    const streams=await (await request(streamPath(user.config))).json();
    assert.equal(streams.streams.length,1);assert.doesNotMatch(JSON.stringify(streams),/Private manual/);
    const play=new URL(streams.streams[0].url);playPaths.push(play.pathname+play.search);
    const response=await request(play.pathname+play.search);assert.equal(response.status,302);
    assert.equal(response.headers.get('location'),'https://cdn.example/movie.mp4');
  }
  assert.ok(calls.includes('Bearer alice-private'));assert.ok(calls.includes('Bearer bob-private'));
  assert.equal(calls.includes('Bearer owner-private'),false);
  const aliceToken=path(alice.config).split('/')[2],bobToken=path(bob.config).split('/')[2];
  assert.equal((await request(playPaths[0].replace(aliceToken,bobToken))).status,403);
  assert.equal((await request('/profile-api/settings',aliceToken)).status,401);
  const listing=await (await request('/api/profiles',admin)).text();
  for(const secret of [alice.manageToken,bob.manageToken,aliceToken,'alice-private'])assert.equal(listing.includes(secret),false);
  await request('/profile-api/rd-token',bob.manageToken,'DELETE');
  assert.equal((await (await request(streamPath(bob.config))).json()).streams.length,0);
  assert.equal((await request(playPaths[1])).status,409);
  assert.equal((await (await request('/profile-api/settings',alice.manageToken)).json()).rdTokenSet,true);
  const rotated=await (await request('/profile-api/rotate-token',alice.manageToken,'POST',{})).json();
  assert.equal((await request(path(alice.config))).status,404);
  assert.equal((await request(new URL(rotated.installUrl).pathname)).status,200);
  await request(`/api/profiles/${alice.id}/revoke`,admin,'POST',{});
  assert.equal((await request('/profile-api/settings',alice.manageToken)).status,401);
  assert.equal((await request(new URL(rotated.installUrl).pathname)).status,404);
  assert.equal((await request(path(bob.config))).status,200);
  assert.equal((await request(`/a/${await store.get('installToken')}/manifest.json`)).status,200);
});

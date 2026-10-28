// Isolated release checks. No real secrets, sources, providers, or production data.
import assert from 'node:assert/strict';
import { fork, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embeddedStore } from './lib/embedded-postgres.mjs';
import { Engine } from '../src/engine.mjs';
import { RealDebrid } from '../src/providers/real-debrid/client.mjs';
import { createApp } from '../src/server.mjs';

const admin='c'.repeat(64),key='b'.repeat(64);
if(process.argv[2]==='--fixture') {
  const store=await embeddedStore(key,{directory:process.argv[3]});
  const engine=new Engine(store,{sources:{search:async()=>[]},metadataRequest:async()=>({meta:{name:'Fixture'}})});
  const rd=new RealDebrid(store,{transport:async()=>{throw Error('Provider disabled in release fixture');}});
  const app=createApp({store,engine,rd,adminToken:admin,signingKey:key,publicUrl:'http://localhost:7001'});
  const server=app.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
  process.on('message',async message=>{
    if(message==='stop')server.close(async()=>{await store.close();process.exit(0);});
    if(message==='memory')process.send({memory:process.memoryUsage()});
  });
} else {
  const directory=mkdtempSync(join(tmpdir(),'lantern-release-'));
  let child,base;
  async function start(){
    child=fork(fileURLToPath(import.meta.url),['--fixture',join(directory,'postgres')],{stdio:['ignore','inherit','inherit','ipc']});
    const ready=await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Fixture exited: '+code)));});
    base=`http://127.0.0.1:${ready.port}`;
  }
  async function stop(){const current=child;const exited=new Promise(resolve=>current.once('exit',resolve));current.send('stop');await exited;child=null;}
  const request=(path,method='GET',body,authenticated=true)=>fetch(base+path,{method,signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+admin}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  try {
    await start();
    execFileSync(process.execPath,['scripts/check-deployment.mjs',base],{stdio:'inherit'});
    for(const [method,path] of [['GET','settings'],['PUT','settings'],['GET','status'],['GET','activity'],['POST','search'],['POST','watch'],['DELETE','watch'],['POST','import'],['DELETE','import/fixture'],['GET','filename-cleanup'],['POST','filename-cleanup'],['POST','cleanup'],['GET','dmm'],['POST','dmm'],['GET','profiles'],['POST','profiles'],['POST','profiles/fixture/revoke'],['DELETE','profiles/fixture'],['POST','rd-test'],['DELETE','rd-token'],['POST','rotate-token'],['POST','settings/recommended'],['POST','formatter-preview']]) {
      assert.equal((await request('/api/'+path,method,undefined,false)).status,401,method+' '+path);
    }
    assert.equal((await request('/api/settings','PUT',{name:''})).status,400);
    assert.equal((await request('/api/search','POST',{type:'movie',id:'invalid'})).status,400);
    assert.equal((await request('/api/rd-test','POST',{})).status,409);
    const original=await (await request('/api/settings')).json();
    const saved={...original.settings,name:'Release persistence fixture',description:'Restart audit',logo:'https://example.com/logo.png',maxResults:37,perQuality:4,maxSizeGB:19.5,minSeeders:3,excludeQualities:['480p'],excludeCam:false,preferLanguage:'spanish',sort:'size',rdFilenameMode:'hide',sourceFormat:'detailed',formatIcons:false,formatSeeders:true,refreshMinutes:123,blockIndexFilenames:false,dmmAuto:false,dmmHashlists:['https://debridmediamanager.github.io/hashlists/00011863-7c82-4d3c-846a-deeb5ac0d6be.html'],sources:[],rdToken:'fixture-secret'};
    assert.equal((await request('/api/settings','PUT',saved)).status,200);
    assert.equal((await request('/api/watch','POST',{type:'movie',id:'tt1234567'})).status,200);
    assert.equal((await request('/api/import','POST',[{type:'movie',mediaId:'tt1234567',title:'Restart 1080p',infoHash:'a'.repeat(40)}])).status,200);
    const invitation=await (await request('/api/profiles','POST',{label:'Restart guest'})).json();
    const invite=new URLSearchParams(new URL(invitation.inviteUrl).hash.slice(1)).get('invite');
    const guest=await (await request('/profile-api/claim','POST',{invite})).json();
    const guestRequest=(method='GET',body)=>fetch(base+'/profile-api/settings',{method,headers:{Authorization:'Bearer '+guest.manageToken,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const guestBefore=await (await guestRequest()).json();
    const guestSaved={...guestBefore.settings,rdToken:'guest-restart-fixture',maxResults:7,sourceFormat:'compact'};
    assert.equal((await guestRequest('PUT',guestSaved)).status,200);
    await stop();await start();
    const restored=await (await request('/api/settings')).json();
    assert.equal(restored.settings.name,saved.name);assert.equal(restored.settings.maxResults,37);
    assert.deepEqual(restored.settings,{...saved,rdToken:''});
    assert.equal(restored.rdTokenSet,true);assert.equal(restored.settings.rdToken,'');
    assert.equal(restored.installUrl,original.installUrl);
    const status=await (await request('/api/status')).json();
    assert.equal(status.releases,1);
    const guestRestored=await (await guestRequest()).json();assert.deepEqual(guestRestored.settings,{...guestSaved,rdToken:''});assert.equal(guestRestored.rdTokenSet,true);assert.equal(guestRestored.installUrl,guestBefore.installUrl);
    assert.ok(JSON.stringify(status).includes('movie/tt1234567'));
    const begin=performance.now();
    for(let n=0;n<30;n++)assert.equal((await request('/api/status')).status,200);
    const elapsed=performance.now()-begin;
    const memory=new Promise(resolve=>child.once('message',resolve));child.send('memory');
    console.log(JSON.stringify({statusRequests:30,elapsedMs:Math.round(elapsed),fixtureMemory:(await memory).memory}));
    console.log('Release smoke passed: protected routes, invalid inputs, missing token, complete process restart, saved settings/watchlist/install URL, secret redaction.');
  } finally {if(child)await stop();rmSync(directory,{recursive:true,force:true});}
}

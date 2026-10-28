import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Execute the actual main-module orchestration, replacing only external process,
// clock, DB and network dependencies. No production timer or database is started.
const source=readFileSync(new URL('../src/main.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
async function fixture(){
  const calls=[],signals={};let tick,exit,close,cleared=false;
  const store={prune:async()=>calls.push('prune'),watchlist:async()=>['movie/tt1234567','series/tt1234567:1:2'],close:async()=>calls.push('store.close')};
  const engine={inflight:new Map(),discover:async media=>calls.push(media.key)};
  const dmm={active:null,run:async()=>calls.push('dmm')},rd={active:new Map()};
  const context={process:{env:{},on:(name,fn)=>signals[name]=fn,exit:code=>{exit=code;}},console:{log:()=>{},error:()=>calls.push('error')},
    openStore:async()=>store,Engine:function(){return engine;},RealDebrid:function(){return rd;},rdTransport:()=>{},DmmImporter:function(){return dmm;},
    validatePublicUrl:x=>x,parseMedia:(type,id)=>({key:type+'/'+id}),
    createApp:()=>({listen:()=>({close:fn=>{close=fn;calls.push('server.close');}})}),
    setInterval:(fn,ms)=>{assert.equal(ms,60000);tick=fn;return {unref(){}};},clearInterval:()=>{cleared=true;}};
  await vm.runInNewContext('(async()=>{'+source+'})()',context);
  return {store,engine,dmm,rd,calls,signals,tick:()=>tick(),finishClose:()=>close(),get exit(){return exit;},get cleared(){return cleared;}};
}
test('minute worker executes cleanup, DMM, exact watched media; retries after failure',async()=>{
  const f=await fixture();await f.tick();
  assert.deepEqual(f.calls,['prune','dmm','movie/tt1234567','series/tt1234567:1:2']);
  f.calls.length=0;f.store.prune=async()=>{throw Error('fixture outage');};await f.tick();assert.deepEqual(f.calls,['error']);
  f.store.prune=async()=>f.calls.push('prune');await f.tick();assert.deepEqual(f.calls.slice(1),['prune','dmm','movie/tt1234567','series/tt1234567:1:2']);
});
test('minute worker does not overlap; shutdown skips remaining media and drains work before closing store',async()=>{
  const f=await fixture();let release,started;
  const ready=new Promise(resolve=>started=resolve);
  f.dmm.run=()=>{started();return new Promise(resolve=>release=resolve);};
  const first=f.tick();await ready;await f.tick();assert.deepEqual(f.calls,['prune']);
  await f.signals.SIGTERM();assert.equal(f.cleared,true);
  const close=f.finishClose();assert.equal(f.exit,undefined);assert.equal(f.calls.includes('store.close'),false);
  release();await first;await close;
  assert.deepEqual(f.calls,['prune','server.close','store.close']);assert.equal(f.exit,0);
  await f.tick();assert.equal(f.calls.length,3);
});

test('source diagnostic uses episode media for EZTV and rejects retired IDs',async()=>{
  const text=readFileSync(new URL('../scripts/check-sources.mjs',import.meta.url),'utf8').replace(/^\uFEFF/,'').replace(/^import .*;\r?\n/gm,'');
  const calls=[];const sourceDefinitions=[{id:'eztv'},{id:'yts'}];
  const context={process:{argv:['node','check','eztv','yts'],exit:()=>{throw Error('exit');}},console:{log:()=>{},error:()=>{}},AbortSignal,
    sourceDefinitions,Sources:function(){return {search:async(id,media)=>{calls.push([id,media.type]);return [];}};}};
  await vm.runInNewContext('(async()=>{'+text+'})()',context);assert.deepEqual(calls,[['eztv','series'],['yts','movie']]);
  context.process.argv=['node','check','rutor'];await assert.rejects(vm.runInNewContext('(async()=>{'+text+'})()',context),/exit/);
});

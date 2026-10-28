import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.mjs';
import { defaults } from '../src/config.mjs';
const media = {type:'movie',imdb:'tt1254207',key:'movie/tt1254207'};
const row = {id:'one',source:'yts',title:'Big Buck Bunny 2008 1080p',infoHash:'a'.repeat(40),quality:'1080p',languages:[],size:100};
function fixture(initial = []) {
  const rows = [...initial], events = [];
  const store = {settings:async()=>({...defaults}),releases:async()=>rows,event:async(...args)=>events.push(args)};
  const engine = new Engine(store, {firstSearchWaitMs:40});
  let release, calls = 0;
  const gate = new Promise(resolve=>{release=resolve;});
  engine.search = async()=>{calls++; await gate;};
  store.lastSearch=async()=>0;
  return {engine,rows,events,release,get calls(){return calls;}};
}
test('cached results return while slow discovery is still pending and refreshes coalesce', async()=>{
  const f=fixture([row]);
  try {
    const result=await f.engine.results(media);
    assert.equal(result.selected.length,1);assert.equal(result.refreshing,true);
    await f.engine.results(media);assert.equal(f.calls,1);
  } finally {f.release();await Promise.allSettled([...f.engine.inflight.values()]);}
});
test('cold search returns at deadline without cancelling background indexing', async()=>{
  const f=fixture();
  try {
    const result=await f.engine.results(media);
    assert.equal(result.selected.length,0);assert.equal(result.refreshing,true);
    assert.equal(f.engine.inflight.size,1);
    f.rows.push(row);f.release();await Promise.allSettled([...f.engine.inflight.values()]);
    assert.equal((await f.engine.indexedResults(media)).selected.length,1);
  } finally {f.release();}
});
test('fast source results return before a slow source finishes', async()=>{
  const f=fixture();f.engine.firstSearchWaitMs=1000;
  const timer=setTimeout(()=>f.rows.push(row),10);
  try {const result=await f.engine.results(media);assert.equal(result.selected.length,1);assert.equal(result.refreshing,true);}
  finally {clearTimeout(timer);f.release();await Promise.allSettled([...f.engine.inflight.values()]);}
});
test('cached rows still respect profile settings and guest manual exclusions', async()=>{
  const f=fixture([{...row,source:'manual'}]);
  try {
    const result=await f.engine.results(media,{includeManual:false,profileSettings:{...defaults}});
    assert.equal(result.selected.length,0);
    f.rows.splice(0,1,row);
    assert.equal((await f.engine.indexedResults(media,{profileSettings:{...defaults,excludeQualities:['1080p']}})).selected.length,0);
  } finally {f.release();await Promise.allSettled([...f.engine.inflight.values()]);}
});
test('explicit force refresh waits; detached failures are handled', async()=>{
  const f=fixture([row]);let returned=false;
  const result=f.engine.results(media,{force:true}).then(r=>{returned=true;return r;});
  await new Promise(resolve=>setTimeout(resolve,15));assert.equal(returned,false);
  f.release();assert.equal((await result).selected.length,1);
  f.engine.search=async()=>{throw Error('secret upstream failure');};
  assert.equal((await f.engine.results(media)).selected.length,1);
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(f.events.length,1);assert.equal(JSON.stringify(f.events).includes('secret'),false);
});

test('collection window includes later fast results alongside cached and early rows',async()=>{
  for(const initial of [[],[row]]) {
    const f=fixture(initial);f.engine.firstSearchWaitMs=100;
    const later={...row,id:'two',infoHash:'b'.repeat(40),source:'apibay'};
    const timer=setTimeout(()=>{if(!f.rows.length)f.rows.push(row);f.rows.push(later);},15);
    try {
      const result=await f.engine.results(media);
      assert.equal(result.selected.length,2);
      assert.equal(result.refreshing,true,'slow discovery is not cancelled');
    } finally {clearTimeout(timer);f.release();await Promise.allSettled([...f.engine.inflight.values()]);}
  }
});

test('completed discovery and fresh cache do not wait for the collection deadline',async()=>{
  const f=fixture([row]);f.engine.firstSearchWaitMs=10000;
  // The one-second watchdog catches an accidental full ten-second wait.
  const watchdog=()=>new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Unnecessary collection delay')),1000);timer.unref();});
  f.release();
  const result=await Promise.race([f.engine.results(media),watchdog()]);
  assert.equal(result.refreshing,false);
  const calls=f.calls;f.engine.store.lastSearch=async()=>Date.now();
  assert.equal((await Promise.race([f.engine.results(media),watchdog()])).selected.length,1);
  assert.equal(f.calls,calls);
});

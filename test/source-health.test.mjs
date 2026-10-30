import test from 'node:test';
import assert from 'node:assert/strict';
import { Sources } from '../src/sources.mjs';
import { embeddedStore } from '../scripts/lib/embedded-postgres.mjs';

test('failed source operations preserve the last successful measurement separately',async t=>{
  const store=await embeddedStore('a'.repeat(64));t.after(()=>store.close());
  const sources=new Sources(store), media={type:'movie',imdb:'tt0133093'};
  sources.run=async()=>[{infoHash:'a'},{infoHash:'b'}];
  await sources.search('yts',media,{});
  const successful=(await store.sourceHealth()).yts;
  assert.equal(successful.results,2);
  sources.run=async()=>{throw Object.assign(Error('fixture timeout'),{code:'TIMEOUT'});};
  await assert.rejects(sources.search('yts',media,{}),/fixture timeout/);
  const failed=(await store.sourceHealth()).yts;
  assert.equal(failed.status,'error');assert.equal(failed.results,undefined);
  assert.ok(failed.durationMs>=0);assert.ok(failed.checkedAt>=successful.checkedAt);
  assert.deepEqual(failed.lastSuccessful,{checkedAt:successful.checkedAt,durationMs:successful.durationMs,results:2});
  await store.health('yts',{...failed,retryAt:0});
  await assert.rejects(sources.search('yts',media,{}));
  const repeated=(await store.sourceHealth()).yts;
  assert.deepEqual(repeated.lastSuccessful,failed.lastSuccessful);
  await store.health('yts',{...repeated,retryAt:0});sources.run=async()=>[];
  await sources.search('yts',media,{});
  const recovered=(await store.sourceHealth()).yts;
  assert.equal(recovered.status,'ok');assert.equal(recovered.results,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseSizeReader } from '../src/database-size.mjs';
import formatting from '../public/database-size.js';
const { formatDatabaseBytes: format } = formatting;

test('decimal size formatting preserves bytes and promotes rounded boundaries', () => {
  assert.equal(format(null), null); assert.equal(format('-1'), null);
  assert.equal(format('0'), '0 B'); assert.equal(format('999'), '999 B');
  for (const [power, unit] of [[1,'KB'],[2,'MB'],[3,'GB'],[4,'TB']]) {
    const boundary = 1000n ** BigInt(power);
    assert.equal(format(String(boundary)), `1.0 ${unit}`);
    assert.equal(format(String(boundary + 1n)), `1.0 ${unit}`);
    if (power > 1) {
      assert.equal(format(String(boundary - 1n)), `1.0 ${unit}`);
      assert.equal(format(String(boundary - boundary / 20000n - 1n)), `999.9 ${['B','KB','MB','GB'][power-1]}`);
    }
  }
  assert.equal(format('9007199254740993'), '9007.2 TB');
});

test('measurement coalesces clients, caches, preserves bigint and timestamps through failure/recovery', async () => {
  let clock=10000, calls=0, fail=false;
  const read=databaseSizeReader({query:async sql=>{
    assert.equal(sql,'SELECT pg_database_size(current_database()) AS database_size_bytes;');
    calls++; if(fail)throw Error('secret connection details');
    return {rows:[{database_size_bytes:'9007199254740993'}]};
  }},{now:()=>clock});
  const results=await Promise.all(Array.from({length:20},()=>read()));
  assert.equal(calls,1); assert.equal(results[0].bytes,'9007199254740993');
  await read();assert.equal(calls,1);
  clock+=5001;fail=true;const stale=await read();assert.equal(stale.state,'stale');assert.equal(stale.measuredAt,results[0].measuredAt);
  clock+=5001;fail=false;const recovered=await read();assert.equal(recovered.state,'fresh');assert.notEqual(recovered.measuredAt,stale.measuredAt);
});

test('missing or unsafe measurements are unavailable, never zero', async()=>{
  for(const raw of [undefined,null,-1,Number.MAX_SAFE_INTEGER+1,'NaN']){
    const read=databaseSizeReader({query:async()=>({rows:[{database_size_bytes:raw}]})});
    assert.deepEqual(await read(),{bytes:null,measuredAt:null,state:'unavailable'});
  }
});

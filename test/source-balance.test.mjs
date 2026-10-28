import test from 'node:test';
import assert from 'node:assert/strict';
import { rankWithReasons } from '../src/matching.mjs';
import { defaults } from '../src/config.mjs';

const row=(n,source,extra={})=>({id:String(n),infoHash:n.toString(16).padStart(40,'0'),title:'Tenet 2020',quality:'1080p',source,seeders:100-n,size:1000,languages:[],...extra});

test('DMM survives twenty higher-seeder competitors without exceeding caps',()=>{
  const rows=[...Array.from({length:30},(_,i)=>row(i+1,'apibay')),row(99,'dmm',{seeders:0})];
  for(const perQuality of [5,10,20]) {
    const result=rankWithReasons(rows,{...defaults,perQuality,maxResults:50});
    assert.equal(result.selected.length,perQuality);
    assert.equal(result.selected[1].source,'dmm');
    assert.ok(result.rejected.every(r=>r.code==='QUALITY_RESULT_LIMIT'));
  }
});

test('balancing preserves resolution priority, per-source preferences and total limits',()=>{
  const rows=[row(1,'apibay'),row(2,'apibay',{languages:['english']}),row(3,'dmm',{seeders:0}),row(4,'yts',{quality:'2160p',seeders:0})];
  const result=rankWithReasons(rows,{...defaults,preferLanguage:'english',maxResults:4});
  assert.deepEqual(result.selected.map(r=>r.id),['4','2','3','1']);
  const limited=rankWithReasons(rows,{...defaults,maxResults:1});
  assert.deepEqual(limited.selected.map(r=>r.id),['4']);
  assert.ok(limited.rejected.every(r=>r.code==='TOTAL_RESULT_LIMIT'));
});

test('duplicate files do not consume a source turn and filters still apply',()=>{
  const rows=[row(1,'apibay'),row(2,'apibay'),row(3,'apibay'),row(1,'dmm',{id:'duplicate',seeders:0}),row(9,'dmm',{seeders:0}),row(10,'dmm',{cam:true})];
  const result=rankWithReasons(rows,{...defaults,perQuality:2});
  assert.deepEqual(result.selected.map(r=>r.id),['1','9']);
  assert.equal(result.rejected.find(r=>r.id==='duplicate').code,'DUPLICATE_FILE');
  assert.equal(result.rejected.find(r=>r.id==='10').code,'CAM_EXCLUDED');
});

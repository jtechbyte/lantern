import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSource, previewSource } from '../src/formatter.mjs';
import { defaults, settingsSchema } from '../src/config.mjs';
import { rank, traits } from '../src/matching.mjs';

test('resolution always sorts first across sources, languages and saved sort preferences', () => {
  const qualities=['unknown','480p','720p','1080p','2160p','1440p','4320p'];
  const rows=qualities.map((quality,i)=>({id:String(i),infoHash:String(i).repeat(40),title:'Example',quality,
    source:i%2?'yts':'apibay',seeders:100-i,size:1000-i,languages:i===0?['english']:[]}));
  for(const sort of ['quality','seeders','size']) {
    assert.deepEqual(rank(rows,{...defaults,sort,preferLanguage:'english'}).map(r=>r.quality),
      ['4320p','2160p','1440p','1080p','720p','480p','unknown']);
  }
  assert.equal(traits('Example 1440p HEVC').quality,'1440p');
});

test('formatter detects DV and audio tags and supports a plain text layout', () => {
  const row={...previewSource,title:'Example 2160p DV HDR10+ DDP5.1 Atmos HEVC'};
  const result=formatSource(row,defaults);
  assert.match(result.name,/🏮/);
  assert.match(result.title,/Dolby Vision/);
  assert.match(result.title,/DD\+/);
  assert.match(result.title,/HDR10\+/);
  const plain=formatSource(row,{...defaults,formatIcons:false});
  assert.doesNotMatch(plain.name+plain.title,/🏮|🎞|🎛|📦|🌐/);
});
test('formatter uses Lantern identity and preserves warnings without repetitive cache labels',()=>{
  for(const sourceFormat of ['clear','compact','detailed']) {
    const value=formatSource(previewSource,{...defaults,sourceFormat});
    assert.match(value.name,/Lantern \u00b7 RD\n4K UHD/);
    assert.doesNotMatch(value.title,/cache unknown|Checked on playback/);assert.match(value.title,/RD filename warning/);
    assert.match(value.title,/ENG \/ SPA/);assert.match(value.title,/5.24 GiB/);
    assert.equal(Object.hasOwn(value,'description'),false);
    assert.equal(value.title.includes('Match:'),sourceFormat==='detailed');
    assert.equal(value.title.includes('Example.Film'),sourceFormat!=='compact');
  }
});
test('formatter handles missing data, controls, and optional seeders without inventing tags',()=>{
  const value=formatSource({title:'Unknown\n\u202e release'},{...defaults,formatIcons:false});
  assert.doesNotMatch(value.title,/Language unknown|🌐/);assert.match(value.title,/Size unknown/);
  assert.doesNotMatch(value.title,/HEVC|ENG|seeders|\u202e/);
  assert.ok(value.title.startsWith('Unknown release'));
  assert.match(formatSource({...previewSource,seeders:0},{...defaults,formatSeeders:true}).title,/0 seeders/);
});
test('legacy settings get formatter defaults and invalid layouts are rejected',()=>{
  const {sourceFormat,formatIcons,formatSeeders,...legacy}=defaults;
  assert.equal(settingsSchema.parse(legacy).sourceFormat,'clear');
  assert.throws(()=>settingsSchema.parse({...defaults,sourceFormat:'invalid'}));
});

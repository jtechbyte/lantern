import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, settingsSchema } from '../src/config.mjs';
import { Sources, sourceDefinitions } from '../src/sources.mjs';
import { Engine } from '../src/engine.mjs';

test('RuTor is removed from saved settings and discovery without touching other preferences',()=>{
  const settings=settingsSchema.parse({...defaults,name:'My Lantern',sources:['dmm','rutor','yts']});
  assert.deepEqual(settings.sources,['dmm','yts']);
  assert.equal(settings.name,'My Lantern');
  assert.equal(sourceDefinitions.some(s=>s.id==='rutor'),false);
});

test('retired RuTor never reads health or makes upstream requests',async()=>{
  const fail=async()=>{throw Error('Unexpected access');};
  const sources=new Sources({sourceHealth:fail},{readUrl:fail,readJson:fail});
  assert.deepEqual(await sources.search('rutor',{type:'movie',imdb:'tt1254207'},{}),[]);
  assert.deepEqual(await sources.run('rutor',{type:'movie',imdb:'tt1254207'},{}),[]);
});

test('previously indexed RuTor rows are excluded while active source rows remain',async()=>{
  const settings=settingsSchema.parse({...defaults,sources:['rutor','yts']});
  const row={id:'old',title:'Example 2020 1080p',infoHash:'a'.repeat(40),quality:'1080p',languages:[],size:100};
  const store={settings:async()=>settings,releases:async()=>[{...row,source:'rutor'},{...row,id:'current',source:'yts'}]};
  const result=await new Engine(store).indexedResults({key:'movie/tt1234567'});
  assert.deepEqual(result.selected.map(r=>r.source),['yts']);
});

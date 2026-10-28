import test from 'node:test';
import assert from 'node:assert/strict';
import {Sources,sourceDefinitions} from '../src/sources.mjs';
import {defaults,settingsSchema} from '../src/config.mjs';
test('removed 1337x is hidden, ignored in settings, and never requested',async()=>{
 assert.equal(sourceDefinitions.some(s=>s.id==='1337x'),false);
 assert.deepEqual(settingsSchema.parse({...defaults,sources:['1337x','yts']}).sources,['yts']);
 const fail=()=>{throw Error('Unexpected request')};
 assert.deepEqual(await new Sources({sourceHealth:fail},{readUrl:fail}).search('1337x',{type:'movie'},{}),[]);
});

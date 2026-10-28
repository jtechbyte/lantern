import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source=readFileSync(new URL('../public/activity.js',import.meta.url),'utf8');
const describe=runInNewContext(source.slice(0,source.indexOf('const activityView='))+'\ndescribeActivity;');
test('DMM summaries preserve partial successes and explicit failure counts',()=>{
  const result=describe({kind:'dmm',message:'DMM automatic: 2 lists imported; 497 accepted; 303 filename exclusions; 1 failed; 14947 unvisited lists.'});
  assert.equal(result.label,'DMM import');assert.equal(result.summary,'2 lists imported · 497 accepted');
  assert.equal(result.support,'303 filename exclusions · 14,947 lists remaining');
  assert.equal(result.status,'1 failure');assert.equal(result.tone,'warning');
});
test('Known successful results are completed, while unknown messages remain neutral',()=>{
  assert.equal(describe({kind:'dmm',message:'DMM import: 12 accepted observations; 3 filename exclusions; 0 failed lists.'}).status,'Completed');
  const unknown=describe({kind:'dmm',message:'DMM connection check in progress'});
  assert.equal(unknown.status,'Recorded');assert.equal(unknown.tone,'neutral');
});
test('Search source failures do not erase successful matching observations',()=>{
  const result=describe({kind:'search',message:'movie/tt1234567: 8 matching observations; 2 source failures'});
  assert.equal(result.summary,'8 matching observations');assert.equal(result.status,'2 failures');assert.equal(result.tone,'warning');
});
test('Unknown long records have bounded previews and never invent success',()=>{
  const event={kind:'future-event',message:'Long message '.repeat(60)},result=describe(event);
  assert.ok(result.summary.length<=110);assert.equal(result.status,'Recorded');assert.equal(event.message.length,780);
});

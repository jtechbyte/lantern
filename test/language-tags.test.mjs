import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguages } from '../src/language-tags.mjs';
import { traits } from '../src/matching.mjs';
import { formatSource } from '../src/formatter.mjs';

test('explicit release tags recognize common alternate codes and separators',()=>{
 assert.deepEqual(detectLanguages('Example.2020.1080p.ENG_FRA_DEU_RUS_HIN.mkv'),['english','french','german','russian','hindi']);
 assert.deepEqual(detectLanguages('Example S01E02 1080p KOR PT-BR'),['portuguese','korean']);
 assert.deepEqual(detectLanguages('Example 2020 MULTI DUAL'),[]);
 assert.deepEqual(detectLanguages('Example [ENG]'),['english']);
});
test('title words and explicit subtitle labels do not imply audio language',()=>{
 assert.deepEqual(detectLanguages('The French Connection 1971 1080p'),[]);
 assert.deepEqual(detectLanguages('Johnny English 2003 1080p'),[]);
 assert.deepEqual(detectLanguages('Example 2020 JPN ENG-SUBS'),['japanese']);
 assert.deepEqual(detectLanguages('Example 2020 subtitles: English'),[]);
});
test('formatter hides absent language and detects new tags on previously stored releases',()=>{
 const unknown=formatSource({title:'Tenet (2020) 1080p Bluray HEVC',source:'dmm',languages:[]});
 assert.doesNotMatch(unknown.title,/Language unknown|🌐|ENG/);
 const tagged=formatSource({title:'Example.2020.1080p.FRA.DEU',languages:[]});
 assert.match(tagged.title,/FRA \/ DEU/);
 assert.deepEqual(traits('Example.2020.1080p.RUS').languages,['russian']);
});

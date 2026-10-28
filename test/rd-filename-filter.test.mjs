import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRealDebridName as inspect, assessRealDebridCandidate as assess,
  applyRealDebridFilenamePolicy as applyPolicy, classifyRealDebridRejection as classify,
  createFilenameInspector } from '../src/providers/real-debrid/filename-filter.mjs';

// Synthetic names, no copyrighted media or provider traffic needed.
for (const tag of ['WEB-DL', 'WEB.x264', 'WEB.H264', 'WEBRIP', 'bDrIp', 'HDRip',
  'PreDVDRip', 'hdtv.X264', 'HDTV.xvid', 'BLURAY.x264', '1080p.BluRay.DTS-HD',
  'Xp.BluRay.DTS', 'WEB-DLRip', '[WEBRip 1080p]']) {
  test(`predicts observed pattern: ${tag}`, () => {
    assert.equal(inspect(`Example.${tag}.mkv`).status, 'predicted-rejection');
  });
}
for (const tag of ['web-dl', 'Web-Dl', 'WEB.h264', 'WEB.X264', 'WEB.DL', 'WEB-Rip',
  'BluRay-x264', 'HDTV.x265', 'HDTV.H264', 'REMUX.BluRay.DTS', '1080i.BluRay.DTS',
  '1080p-BluRay.DTS', 'BluRay.1080p.DTS', 'WEB.H.264', 'WEB.AV1']) {
  test(`does not overmatch: ${tag}`, () => {
    assert.equal(inspect(`Example.${tag}.mkv`).status, 'no-known-match');
  });
}
test('returns all matching rule explanations without normalizing input', () => {
  assert.deepEqual(inspect('WEB-DL.BDRip').matches.map(m => m.ruleId), ['web-dl', 'bdrip']);
  assert.equal(inspect('WEB%2DDL').status, 'no-known-match');
});
test('absent metadata is unknown rather than accepted', () => {
  for (const value of [undefined, null, '', ' ']) assert.equal(inspect(value).status, 'unknown');
  assert.throws(() => inspect({}), TypeError);
});
test('clean pack with blocked selected file is diagnosed only at unrestrict', () => {
  const result = assess({ provider: 'realdebrid', torrentName: 'Example.S01', selectedFilePath: '/Example/S01E02.WEBRip.mkv', mode: 'hide' });
  assert.equal(result.decision, 'hide');
  assert.deepEqual(result.reasons.map(r => r.stage), ['unrestrict']);
});
test('parent folders and sibling names must not contaminate selected file check', () => {
  const result = assess({ provider: 'realdebrid', needsAdd: false, selectedFilePath: 'Folder.WEB-DL\\Episode.HEVC.mkv' });
  assert.equal(result.decision, 'keep');
});
test('blocked root matters on add but not when reusing an existing torrent', () => {
  const candidate = { provider: 'realdebrid', torrentName: 'Pack.WEB-DL', selectedFilePath: '/Episode.mkv', mode: 'hide' };
  assert.equal(assess(candidate).decision, 'hide');
  assert.equal(assess({ ...candidate, needsAdd: false }).decision, 'keep');
});
test('display title is a hint and cannot hard-exclude a candidate', () => {
  const result = assess({ provider: 'realdebrid', releaseTitle: 'Example.WEB-DL', mode: 'hide' });
  assert.equal(result.decision, 'warn');
  assert.equal(result.reasons[0].evidence, 'display-title-only');
});
test('known metainfo name wins over an inaccurate source display title', () => {
  assert.equal(assess({ provider: 'realdebrid', releaseTitle: 'WEB-DL', torrentName: 'Original.HEVC' }).decision, 'keep');
});
test('other providers and off mode stay untouched; warn is default', () => {
  assert.equal(assess({ provider: 'torbox', torrentName: 'WEBRip', mode: 'hide' }).applies, false);
  assert.equal(assess({ provider: 'realdebrid', torrentName: 'WEBRip', mode: 'off' }).decision, 'keep');
  assert.equal(assess({ provider: 'realdebrid', torrentName: 'WEBRip' }).decision, 'warn');
  assert.throws(() => assess({ mode: 'typo' }), TypeError);
});
test('provider filtering preserves original records and explains exclusions', () => {
  const records = Object.freeze([
    Object.freeze({ provider: 'realdebrid', torrentName: 'Example.WEBRip' }),
    Object.freeze({ provider: 'torbox', torrentName: 'Example.WEBRip' }),
  ]);
  const { visible, excluded } = applyPolicy(records, { mode: 'hide' });
  assert.equal(visible.length, 1);
  assert.equal(visible[0].provider, 'torbox');
  assert.equal(excluded.length, 1);
  assert.equal(records[0].rdFilenameAssessment, undefined);
});
test('35 without a known name match is inconclusive, never permanent blacklisting', () => {
  const result = classify({ error: { error_code: 35 }, stage: 'add', torrentName: 'Example.HEVC' });
  assert.equal(result.kind, 'unexplained-provider-rejection');
  assert.equal(result.accountCooldownSuggested, true);
  assert.equal(result.invalidateGlobalIndex, false);
  assert.equal(result.retryImmediately, false);
});
test('35 classification uses only the name checked at the failing stage', () => {
  const result = classify({ error: { response: { data: { error: 'infringing_file' } } }, stage: 'add',
    torrentName: 'Clean.Pack', selectedFilePath: 'WEBRip.mkv' });
  assert.equal(result.kind, 'unexplained-provider-rejection');
  const fileFailure = classify({ error: { error_code: '35' }, stage: 'unrestrict',
    torrentName: 'Clean.Pack', selectedFilePath: 'WEBRip.mkv' });
  assert.equal(fileFailure.kind, 'rejection-consistent-with-name-rule');
  assert.equal(fileFailure.confirmedCause, false);
  assert.equal(fileFailure.accountCooldownSuggested, false);
});
test('unrelated provider errors are not filename failures', () => {
  for (const error of [{ status: 451 }, { error_code: 8 }, { error: 'bad_token' }, null]) {
    assert.equal(classify({ error, stage: 'add' }), null);
  }
});
test('rule updates are validated literal data, not executable regexes', () => {
  const rules = { version: 'test', patterns: [{ id: 'literal', literal: '(a+)+$', caseSensitive: true }] };
  const custom = createFilenameInspector(rules);
  rules.patterns[0].literal = 'changed';
  assert.equal(custom('aaaa').status, 'no-known-match');
  assert.equal(custom('(a+)+$').status, 'predicted-rejection');
  assert.throws(() => createFilenameInspector({ version: 'bad', patterns: [{ id: 'empty', literal: '', caseSensitive: true }] }), TypeError);
});

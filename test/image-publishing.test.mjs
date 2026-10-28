import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

function tags(version, eventName, release) {
  const cwd = mkdtempSync(join(tmpdir(), 'lantern-image-tags-'));
  const revision = 'a'.repeat(40);
  try {
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ version }));
    writeFileSync(join(cwd, 'event.json'), JSON.stringify({ release }));
    execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/image-tags.mjs', import.meta.url))], { cwd, stdio: 'pipe', env: { ...process.env, GITHUB_EVENT_PATH: join(cwd, 'event.json'), GITHUB_EVENT_NAME: eventName, GITHUB_SHA: revision, GITHUB_OUTPUT: join(cwd, 'output') } });
    const lines = Object.fromEntries(readFileSync(join(cwd, 'output'), 'utf8').trim().split('\n').map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
    return JSON.parse(lines.tags);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
test('only stable published releases produce version family and latest aliases', () => {
  assert.deepEqual(tags('0.1.1', 'release', { tag_name: 'v0.1.1', draft: false, prerelease: false }), ['0.1.1', `sha-${'a'.repeat(40)}`, '0.1', '0', 'latest']);
  for (const event of ['pull_request', 'push', 'workflow_dispatch']) assert.deepEqual(tags('0.1.1', event), []);
});
test('prereleases cannot update latest, major, minor, or plain stable version tags', () => {
  assert.deepEqual(tags('0.1.1', 'release', { tag_name: 'v0.1.1', prerelease: true }), ['0.1.1-prerelease', `sha-${'a'.repeat(40)}`]);
  assert.deepEqual(tags('0.1.2-rc.1', 'release', { tag_name: 'v0.1.2-rc.1', prerelease: false }), ['0.1.2-rc.1', `sha-${'a'.repeat(40)}`]);
  assert.throws(() => tags('0.1.1', 'release', { tag_name: 'v0.1.0' }));
  assert.throws(() => tags('0.1.1', 'release', { tag_name: 'v0.1.1', draft: true }));
});
test('pull-based Compose preserves services, database configuration and volume keys', () => {
  const source = YAML.parse(readFileSync(new URL('../compose.yaml', import.meta.url), 'utf8'));
  const image = YAML.parse(readFileSync(new URL('../compose.image.yaml', import.meta.url), 'utf8'));
  delete source.services.lantern.build;
  assert.equal(image.services.lantern.image, '${LANTERN_IMAGE:-jctechmin/lantern:0.1.1}');
  delete image.services.lantern.image;
  assert.deepEqual(image, source);
});
test('workflow has read-only permissions, native tests, and no PR publishing path', () => {
  const workflow = YAML.parse(readFileSync(new URL('../.github/workflows/docker.yml', import.meta.url), 'utf8'));
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.ok('pull_request' in workflow.on);
  assert.ok(!('pull_request_target' in workflow.on));
  assert.equal(workflow.jobs.publish.if, "github.event_name == 'release' && github.repository == 'jtechbyte/lantern'");
  for (const step of workflow.jobs['build-test'].steps.filter(s => s.uses?.startsWith('docker/login-action') || s.name === 'Push the exact tested native image')) assert.equal(step.if, workflow.jobs.publish.if);
  assert.deepEqual(workflow.jobs['build-test'].strategy.matrix.include.map(x => x.arch), ['amd64', 'arm64']);
  assert.deepEqual(workflow.jobs.publish.needs, ['metadata', 'build-test']);
  assert.ok(workflow.jobs['verify-public'].steps.every(step => !step.uses?.startsWith('docker/login-action')));
  for (const job of Object.values(workflow.jobs)) for (const step of job.steps) if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
});

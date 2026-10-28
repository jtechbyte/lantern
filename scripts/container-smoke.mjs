// Disposable Compose deployment only. Never points at an existing project/volume.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';

const image = process.argv[2];
if (!image || !/^[a-zA-Z0-9/:@._-]+$/.test(image)) throw new Error('Supply the image to test');
const directory = mkdtempSync(join(tmpdir(), 'lantern-container-test-'));
const project = `lantern-test-${randomBytes(6).toString('hex')}`;
const base = 'http://127.0.0.1:7001';
const admin = randomBytes(32).toString('hex');
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const composeArgs = ['compose', '--project-name', project, '--project-directory', directory, '-f', join(directory, 'compose.yaml')];
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
const compose = (...args) => docker(...composeArgs, ...args);
const api = async (path, method = 'GET', body) => {
  const response = await fetch(`${base}/api/${path}`, { method, signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${admin}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, 200, `${method} ${path}`);
  return response.json();
};
const healthy = async () => {
  for (let tries = 0; tries < 60; tries++) {
    try { const response = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(2000) }); if (response.ok) { assert.equal((await response.json()).version, version); return; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Health endpoint did not recover');
};
let browser;
try {
  copyFileSync('compose.image.yaml', join(directory, 'compose.yaml'));
  copyFileSync('Caddyfile', join(directory, 'Caddyfile'));
  writeFileSync(join(directory, '.env'), `LANTERN_IMAGE=${image}\nADMIN_TOKEN=${admin}\nENCRYPTION_KEY=${randomBytes(32).toString('hex')}\nPOSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\nPUBLIC_URL=${base}\nLANTERN_BIND_ADDRESS=127.0.0.1\n`, { mode: 0o600 });
  compose('config', '--quiet');
  const config = JSON.parse(docker('image', 'inspect', image))[0].Config;
  assert.equal(config.User, 'node');
  assert.equal(config.Labels['org.opencontainers.image.source'], 'https://github.com/jtechbyte/lantern');
  assert.equal(config.Labels['org.opencontainers.image.licenses'], 'MIT');
  assert.equal(config.Labels['org.opencontainers.image.version'], version);
  assert.match(config.Labels['org.opencontainers.image.revision'], /^[a-f0-9]{40}$/);
  assert.ok(config.Healthcheck);
  docker('run', '--rm', '--entrypoint', 'node', image, '-e', "const fs=require('fs'),assert=require('assert');assert.notEqual(process.getuid(),0);for(const f of ['.env','test','.git','artifacts','scripts/browser-smoke.mjs','node_modules/playwright'])assert.ok(!fs.existsSync('/app/'+f),f);for(const f of ['src/main.mjs','scripts/migrate-sqlite.mjs','scripts/doctor.mjs','scripts/check-deployment.mjs','LICENSE'])assert.ok(fs.existsSync('/app/'+f),f);require('pg');");
  compose('up', '-d', '--wait', '--wait-timeout', '120');
  await healthy();
  assert.equal((await fetch(`${base}/api/settings`)).status, 401);
  const initial = await api('settings');
  assert.equal(initial.database, 'postgresql');
  // Prevent background external requests; the provider token is synthetic and never tested.
  await api('settings', 'PUT', { ...initial.settings, sources: [], dmmAuto: false, rdToken: randomBytes(24).toString('hex') });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await page.goto(base);
  await page.locator('#admin-token').fill(admin);
  await page.locator('#admin-token').press('Enter');
  await page.locator('#logout').waitFor({ state: 'visible' });
  await page.locator('#tab-appearance').click();
  await page.locator('[name=name]').fill('Container persistence test');
  await page.locator('button.save').click();
  await page.waitForFunction(() => document.querySelector('#save-state').dataset.state === 'saved');
  await page.reload();
  await page.locator('#logout').waitFor({ state: 'visible' });
  const checkSaved = async () => {
    const saved = await api('settings');
    assert.equal(saved.settings.name, 'Container persistence test');
    assert.deepEqual(saved.settings.sources, []);
    assert.equal(saved.installUrl, initial.installUrl);
    assert.equal(saved.rdTokenSet, true);
    assert.equal(saved.settings.rdToken, '');
    assert.equal((await fetch(initial.installUrl)).status, 200);
  };
  await checkSaved();
  console.log('PASS native PostgreSQL initialization, non-root image, login, UI save/refresh, redaction and installation identity');
  compose('restart', 'lantern'); await healthy(); await checkSaved();
  compose('up', '-d', '--force-recreate', '--wait', '--wait-timeout', '120', 'lantern'); await healthy(); await checkSaved();
  compose('restart', 'postgres');
  compose('up', '-d', '--wait', '--wait-timeout', '120'); await healthy(); await checkSaved();
  console.log('PASS container restart, recreation and PostgreSQL restart preserve saved settings and credentials');
  assert.match(compose('exec', '-T', 'lantern', 'node', 'scripts/check-deployment.mjs', 'http://127.0.0.1:7001'), /All deployment checks passed/);
  assert.match(compose('logs', '--no-color', 'lantern'), /Lantern listening on port 7001/);
  compose('stop', 'postgres');
  let unavailable = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    try { unavailable = (await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(25000) })).status === 503; } catch {}
    if (unavailable) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(unavailable, 'database outage should make health unavailable');
  compose('up', '-d', '--wait', '--wait-timeout', '120'); await healthy(); await checkSaved();
  console.log('PASS health failure/recovery on database outage and useful startup log');
  const dump = execFileSync('docker', [...composeArgs, 'exec', '-T', 'postgres', 'pg_dump', '-U', 'lantern', '-d', 'lantern', '-Fc'], { timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  assert.ok(dump.length > 0);
  compose('exec', '-T', 'postgres', 'createdb', '-U', 'lantern', 'lantern_restore');
  execFileSync('docker', [...composeArgs, 'exec', '-T', 'postgres', 'pg_restore', '-U', 'lantern', '-d', 'lantern_restore', '--no-owner', '--exit-on-error'], { input: dump, timeout: 60000 });
  compose('stop', 'lantern');
  const composePath = join(directory, 'compose.yaml');
  writeFileSync(composePath, readFileSync(composePath, 'utf8').replace('PGDATABASE: lantern', 'PGDATABASE: lantern_restore'));
  compose('up', '-d', '--force-recreate', '--wait', '--wait-timeout', '120', 'lantern'); await healthy(); await checkSaved();
  console.log('PASS native pg_dump/pg_restore into a separate database preserves encrypted settings and installation identity');
  await page.reload(); await page.locator('#logout').waitFor({ state: 'visible' });
  await page.locator('#logout').click(); await page.locator('#admin-token').waitFor({ state: 'visible' });
  console.log(`PASS container smoke on ${process.arch}: ${image}`);
} catch (error) {
  // Only bounded application/database messages from this disposable project; never print env/config.
  try { console.error(compose('logs', '--no-color', '--tail=60', 'lantern', 'postgres')); } catch {}
  throw error;
} finally {
  await browser?.close();
  // Explicit random project plus private directory: never deletes production volumes.
  try { compose('down', '--volumes', '--remove-orphans'); } finally { rmSync(directory, { recursive: true, force: true }); }
}

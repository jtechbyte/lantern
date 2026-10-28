import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { defaults, settingsSchema } from '../src/config.mjs';
import { Sources, sourceDefinitions } from '../src/sources.mjs';

test('retired source settings remain readable without re-enabling any source', () => {
  const settings = settingsSchema.parse({ ...defaults, name: 'My Lantern', sources: ['yts', 'zilean', 'nyaa', 'tokyotosho', '1337x', 'anidex'] });
  assert.deepEqual(settings.sources, ['yts']);
  assert.equal(settings.name, 'My Lantern');
  assert.deepEqual(settingsSchema.parse({ ...defaults, sources: ['zilean'] }).sources, []);
  assert.deepEqual(sourceDefinitions.map(s => s.id), ['dmm', 'yts', 'eztv', 'apibay']);
});

test('removed Zilean discovery never makes a network request', async () => {
  const fail = async () => { throw Error('Unexpected access'); };
  const sources = new Sources({ sourceHealth: fail }, { readJson: fail });
  assert.deepEqual(await sources.search('zilean', { type: 'movie' }, {}), []);
});

test('Compose retains Lantern PostgreSQL without any Zilean services or mounts', () => {
  const config = parse(readFileSync(new URL('../compose.yaml', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(config.services), ['lantern', 'postgres', 'caddy']);
  assert.equal(config.services.flaresolverr, undefined);
  assert.deepEqual(config.services.postgres.volumes, ['postgres_data:/var/lib/postgresql/data']);
  assert.equal(JSON.stringify(config).includes('zilean'), false);
});

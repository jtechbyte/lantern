import pg from 'pg';
import { indexFilenameMatch } from './providers/real-debrid/filename-filter.mjs';
import { existsSync } from 'node:fs';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { defaults, settingsSchema } from './config.mjs';

// Incremental, transactional schema migrations. Do not edit applied versions.
const migrations = [[
  'CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  'CREATE TABLE releases (id TEXT PRIMARY KEY, media TEXT NOT NULL, source TEXT NOT NULL, data JSONB NOT NULL, updated BIGINT NOT NULL)',
  'CREATE INDEX releases_media ON releases(media, updated DESC)',
  'CREATE TABLE searches (media TEXT PRIMARY KEY, updated BIGINT NOT NULL)',
  'CREATE TABLE health (source TEXT PRIMARY KEY, data JSONB NOT NULL)',
  'CREATE TABLE watched (media TEXT PRIMARY KEY)',
  'CREATE TABLE events (id BIGSERIAL PRIMARY KEY, time BIGINT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL)',
], [
  "CREATE INDEX releases_cleanup ON releases(updated,id) WHERE source!='manual'",
  'CREATE INDEX searches_cleanup ON searches(updated,media)',
  "CREATE INDEX releases_hash ON releases ((data->>'infoHash'))",
], [
  `CREATE TABLE profiles (
    id TEXT PRIMARY KEY, label TEXT NOT NULL, created BIGINT NOT NULL,
    disabled BOOLEAN NOT NULL DEFAULT false, claimed BOOLEAN NOT NULL DEFAULT false,
    invite_hash TEXT UNIQUE, invite_expires BIGINT NOT NULL,
    manage_hash TEXT UNIQUE, install_hash TEXT UNIQUE, secret TEXT NOT NULL
  )`,
], [
  'CREATE TABLE dmm_candidates (hash TEXT PRIMARY KEY, title_key TEXT NOT NULL, data JSONB NOT NULL, updated BIGINT NOT NULL)',
  'CREATE INDEX dmm_candidates_title ON dmm_candidates(title_key)',
  'CREATE INDEX dmm_candidates_age ON dmm_candidates(updated)',
], [
  'CREATE TABLE dmm_lists (path TEXT PRIMARY KEY, sha TEXT NOT NULL, attempted BIGINT NOT NULL DEFAULT 0, next_attempt BIGINT NOT NULL DEFAULT 0)',
  'CREATE INDEX dmm_lists_queue ON dmm_lists(next_attempt,attempted)',
]];

export class Store {
  constructor(db, encryptionKey, inTransaction = false, storageCache = {}) {
    if (!/^[a-f0-9]{64}$/i.test(encryptionKey || '')) throw new Error('ENCRYPTION_KEY must contain 64 hex characters');
    this.db = db; this.key = Buffer.from(encryptionKey, 'hex'); this.inTransaction = inTransaction; this.backend = 'postgresql';
    this.storageCache = storageCache;
  }
  async transaction(work) {
    if (this.inTransaction) return work(this);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await work(new Store(client, this.key.toString('hex'), true, this.storageCache));
      await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async migrateSchema() {
    await this.transaction(async tx => {
      await tx.db.query('SELECT pg_advisory_xact_lock(78214001)');
      await tx.db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
      const applied = new Set((await tx.db.query('SELECT version FROM schema_migrations')).rows.map(r => r.version));
      if ([...applied].some(v => v > migrations.length)) throw new Error('Database schema is newer than this application');
      for (let i = 0; i < migrations.length; i++) if (!applied.has(i + 1)) {
        for (const sql of migrations[i]) await tx.db.query(sql);
        await tx.db.query('INSERT INTO schema_migrations(version) VALUES ($1)', [i + 1]);
      }
    });
  }
  async initialize(legacyPath) {
    await this.transaction(async tx => {
      await tx.db.query('SELECT pg_advisory_xact_lock(78214002)');
      if (!await tx.get('settings')) {
        if (legacyPath && existsSync(legacyPath)) throw new Error('Legacy SQLite database detected. Run npm run migrate:sqlite before starting Lantern.');
        await tx.set('settings', tx.encrypt(defaults));
      }
      if (!await tx.get('installToken')) await tx.rotateToken();
      await tx.settings();
    });
  }
  encrypt(value) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  }
  decrypt(value) {
    const data = Buffer.from(value, 'base64'), decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString());
  }
  async ping() { await this.db.query('SELECT 1'); }
  async storageBudget(force = false) {
    if (!force && this.storageCache.expires > Date.now()) return this.storageCache.value;
    const bytes = Number((await this.db.query('SELECT pg_database_size(current_database()) AS bytes')).rows[0].bytes);
    if (!Number.isFinite(bytes) || bytes < 0) throw new Error('Database storage measurement unavailable');
    const value = { bytes, budgetBytes: 4000000000, cleanupBytes: 3000000000, pauseBytes: 3500000000,
      state: bytes >= 3500000000 ? 'paused' : bytes >= 3000000000 ? 'pressure' : 'normal' };
    this.storageCache.value = value; this.storageCache.expires = Date.now() + 5000;
    return value;
  }
  async get(key) { return (await this.db.query('SELECT value FROM kv WHERE key=$1', [key])).rows[0]?.value; }
  async set(key, value) { await this.db.query('INSERT INTO kv VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key,value]); }
  async deleteKey(key) { await this.db.query('DELETE FROM kv WHERE key=$1', [key]); }
  async settings() { return settingsSchema.parse(this.decrypt(await this.get('settings'))); }
  async saveSettings(settings) {
    const encrypted = this.encrypt(settingsSchema.parse(settings));
    await this.transaction(async tx => { await tx.set('settings', encrypted); await tx.db.query('DELETE FROM searches'); });
  }
  async rotateToken() { const token = randomBytes(24).toString('hex'); await this.set('installToken', token); return token; }
  async putRelease(media, source, release) {
    if ((await this.storageBudget()).state === 'paused') throw new Error('Database storage safeguard: release writes paused at 3.5 GB of the 4 GB budget. Check Library storage status.');
    if ((await this.settings()).blockIndexFilenames && indexFilenameMatch(release)) return null;
    const id = createHash('sha256').update(`${media}|${source}|${release.infoHash}|${release.fileIdx ?? '-'}`).digest('hex').slice(0,32);
    const row = { ...release, id, source, media };
    await this.db.query('INSERT INTO releases VALUES ($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated', [id,media,source,JSON.stringify(row),Date.now()]);
    return row;
  }
  async releases(media) { return (await this.db.query("SELECT data FROM releases WHERE media=$1 AND (updated>$2 OR source='manual') ORDER BY updated DESC LIMIT 1000", [media,Date.now()-7*86400000])).rows.map(r=>r.data); }
  async putDmmCandidates(records) {
    return this.transaction(async tx => {
      await tx.db.query('SELECT pg_advisory_xact_lock(78214006)');
      if ((await tx.storageBudget(true)).state !== 'normal') throw Error('DMM imports paused for storage pressure');
      const settings = await tx.settings();
      if (!settings.sources.includes('dmm')) return 0;
      let accepted = 0;
      for (const {key,release} of records.slice(0,1000)) {
        if (settings.blockIndexFilenames && indexFilenameMatch(release)) continue;
        await tx.db.query('INSERT INTO dmm_candidates VALUES ($1,$2,$3,$4) ON CONFLICT(hash) DO UPDATE SET title_key=excluded.title_key,data=excluded.data,updated=excluded.updated',
          [release.infoHash,key,JSON.stringify(release),Date.now()]);
        accepted++;
      }
      await tx.db.query('DELETE FROM dmm_candidates WHERE hash IN (SELECT hash FROM dmm_candidates ORDER BY updated DESC,hash DESC OFFSET 10000)');
      // Newly imported observations must be available on the next discovery.
      await tx.db.query('DELETE FROM searches');
      return accepted;
    });
  }
  async dmmCandidates(key) {
    return (await this.db.query('SELECT data FROM dmm_candidates WHERE title_key=$1 AND updated>$2 ORDER BY updated DESC LIMIT 300',[key,Date.now()-7*86400000])).rows.map(r=>r.data);
  }
  async syncDmmLists(entries) {
    return this.transaction(async tx => {
      if ((await tx.storageBudget(true)).state !== 'normal') throw Error('DMM imports paused for storage pressure');
      const json=JSON.stringify(entries);
      await tx.db.query(`INSERT INTO dmm_lists(path,sha)
        SELECT path,sha FROM jsonb_to_recordset($1::jsonb) AS x(path text,sha text)
        ON CONFLICT(path) DO UPDATE SET sha=excluded.sha,
        next_attempt=CASE WHEN dmm_lists.sha<>excluded.sha THEN 0 ELSE dmm_lists.next_attempt END`,[json]);
      await tx.db.query('DELETE FROM dmm_lists WHERE NOT (path=ANY($1::text[]))',[entries.map(e=>e.path)]);
    });
  }
  async dueDmmLists() {
    return (await this.db.query('SELECT path FROM dmm_lists WHERE next_attempt<=$1 ORDER BY attempted,path LIMIT 2',[Date.now()])).rows;
  }
  async finishDmmList(path,success) {
    const now=Date.now();
    await this.db.query('UPDATE dmm_lists SET attempted=$2,next_attempt=$3 WHERE path=$1',[path,now,now+(success?6*86400000:6*3600000)]);
  }
  async dmmQueueStatus() {
    const {rows:[row]}=await this.db.query('SELECT count(*)::int AS discovered,count(*) FILTER (WHERE attempted=0)::int AS unvisited,count(*) FILTER (WHERE next_attempt<=$1)::int AS due FROM dmm_lists',[Date.now()]);
    return row;
  }
  async release(id) { return (await this.db.query('SELECT data FROM releases WHERE id=$1',[id])).rows[0]?.data || null; }
  async deleteImport(id) { await this.db.query("DELETE FROM releases WHERE id=$1 AND source='manual'",[id]); }
  async lastSearch(media) { return Number((await this.db.query('SELECT updated FROM searches WHERE media=$1',[media])).rows[0]?.updated || 0); }
  async searched(media) { await this.db.query('INSERT INTO searches VALUES ($1,$2) ON CONFLICT(media) DO UPDATE SET updated=excluded.updated',[media,Date.now()]); }
  async health(source,value) { await this.db.query('INSERT INTO health VALUES ($1,$2) ON CONFLICT(source) DO UPDATE SET data=excluded.data',[source,JSON.stringify(value)]); }
  async sourceHealth() { return Object.fromEntries((await this.db.query('SELECT * FROM health')).rows.map(r=>[r.source,r.data])); }
  async watch(media) {
    await this.transaction(async tx => {
      await tx.db.query('LOCK TABLE watched IN EXCLUSIVE MODE');
      const list = await tx.watchlist();
      if (list.length >= 50 && !list.includes(media)) throw new Error('Watchlist limit is 50');
      await tx.db.query('INSERT INTO watched VALUES ($1) ON CONFLICT DO NOTHING',[media]);
    });
  }
  async unwatch(media) { await this.db.query('DELETE FROM watched WHERE media=$1',[media]); }
  async watchlist() { return (await this.db.query('SELECT media FROM watched ORDER BY media')).rows.map(r=>r.media); }
  async event(kind,message) { await this.db.query('INSERT INTO events(time,kind,message) VALUES ($1,$2,$3)',[Date.now(),kind,message]); }
  async activityHistory() { return (await this.db.query('SELECT * FROM events ORDER BY id DESC')).rows.map(r=>({...r,id:Number(r.id),time:Number(r.time)})); }
  async stats() {
    const [count,watchlist,health,events] = await Promise.all([
      this.db.query('SELECT count(*) AS n FROM releases'), this.watchlist(), this.sourceHealth(), this.db.query('SELECT *, count(*) OVER() AS total FROM events ORDER BY id DESC LIMIT 30'),
    ]);
    const cleanup = JSON.parse(await this.get('maintenance:last') || 'null');
    return { releases:Number(count.rows[0].n),watchlist,health,cleanup,storage:await this.storageBudget(),eventCount:Number(events.rows[0]?.total||0),events:events.rows.map(({total,...r})=>({...r,id:Number(r.id),time:Number(r.time)})) };
  }
  async cleanFilenameMatches(remove = false) {
    return this.transaction(async tx => {
      if (remove) await tx.db.query('LOCK TABLE releases IN SHARE ROW EXCLUSIVE MODE');
      let cursor = '', scanned = 0, matched = 0;
      const samples = [];
      while (true) {
        const rows = (await tx.db.query('SELECT id,data FROM releases WHERE id>$1 ORDER BY id LIMIT 500',[cursor])).rows;
        if (!rows.length) break;
        const ids = [];
        for (const row of rows) {
          scanned++;
          const match = indexFilenameMatch(row.data);
          if (match) { matched++; ids.push(row.id); if (samples.length < 20) samples.push({ title: row.data.title, source:row.data.source, field:match.field, rules:match.matches.map(m=>m.ruleId) }); }
        }
        if (remove && ids.length) await tx.db.query('DELETE FROM releases WHERE id=ANY($1::text[])',[ids]);
        cursor = rows.at(-1).id;
      }
      let dmmCursor = '';
      while (true) {
        const rows = (await tx.db.query('SELECT hash,data FROM dmm_candidates WHERE hash>$1 ORDER BY hash LIMIT 500',[dmmCursor])).rows;
        if (!rows.length) break;
        const hashes = [];
        for (const row of rows) {
          scanned++;
          const match = indexFilenameMatch(row.data);
          if (match) { matched++;hashes.push(row.hash);if(samples.length<20)samples.push({title:row.data.title,source:'dmm-candidate',field:match.field,rules:match.matches.map(m=>m.ruleId)}); }
        }
        if(remove && hashes.length)await tx.db.query('DELETE FROM dmm_candidates WHERE hash=ANY($1::text[])',[hashes]);
        dmmCursor=rows.at(-1).hash;
      }
      if (remove) await tx.event('cleanup', 'Filename policy removed ' + matched + ' release/candidate records (including matching manual imports).');
      return { scanned, matched, removed: remove ? matched : 0, samples };
    });
  }
  async prune() {
    return this.transaction(async tx => {
      // Keep each pass bounded and avoid duplicate workers across app instances.
      const lock = await tx.db.query('SELECT pg_try_advisory_xact_lock(78214004) AS acquired');
      if (!lock.rows[0].acquired) return { skipped: true };
      const now = Date.now(), cutoff = now - 7 * 86400000;
      const storage = await tx.storageBudget(true);
      const releaseLimit = storage.state === 'normal' ? 50000 : 25000;
      const searchLimit = storage.state === 'normal' ? 10000 : 5000;
      const removed = {};
      const remove = async (name, sql, params = []) => {
        const result = await tx.db.query(sql + ' RETURNING 1', params);
        removed[name] = (removed[name] || 0) + result.rows.length;
      };
      await remove('dmmCandidates', 'DELETE FROM dmm_candidates WHERE hash IN (SELECT hash FROM dmm_candidates WHERE updated<$1 ORDER BY updated LIMIT 2000)', [cutoff]);
      if (storage.state !== 'normal') await remove('dmmCandidates', 'DELETE FROM dmm_candidates WHERE hash IN (SELECT hash FROM dmm_candidates ORDER BY updated DESC OFFSET 5000 LIMIT 2000)');
      await remove('releases', `DELETE FROM releases WHERE id IN (
        SELECT id FROM releases WHERE updated<$1 AND source!='manual'
        ORDER BY updated,id LIMIT 2000)`, [cutoff]);
      await remove('releases', `DELETE FROM releases WHERE id IN (
        SELECT id FROM releases WHERE source!='manual'
        ORDER BY updated DESC,id DESC OFFSET $1 LIMIT 2000)`, [releaseLimit]);
      await remove('searches', `DELETE FROM searches WHERE media IN (
        SELECT media FROM searches WHERE updated<$1 ORDER BY updated,media LIMIT 2000)`, [cutoff]);
      await remove('searches', `DELETE FROM searches WHERE media IN (
        SELECT media FROM searches ORDER BY updated DESC,media DESC OFFSET $1 LIMIT 2000)`, [searchLimit]);
      // RD reference keys contain account/hash/media/file; values are provider IDs,
      // not timestamps. Retain references for hashes still in the local library.
      await remove('rdReferences', `DELETE FROM kv WHERE key IN (
        SELECT key FROM kv WHERE key LIKE 'rd:%' AND NOT EXISTS (
          SELECT 1 FROM releases WHERE data->>'infoHash'=split_part(kv.key,':',3))
        ORDER BY key LIMIT 2000)`);
      // Only known numeric expiry values are cast, leaving unrelated KV data alone.
      await remove('rdBlocks', `DELETE FROM kv WHERE key IN (
        SELECT key FROM kv WHERE key LIKE 'rd-block:%'
        AND CASE WHEN value ~ '^[0-9]{1,16}$' THEN value::numeric <= $1 ELSE false END
        ORDER BY key LIMIT 2000)`, [now]);
      await remove('events', `DELETE FROM events WHERE id IN (
        SELECT id FROM events ORDER BY id DESC OFFSET 200 LIMIT 2000)`);
      const summary = { at: now, removed, releaseLimit, searchLimit, retentionDays: 7, storage };
      await tx.set('maintenance:last', JSON.stringify(summary));
      return summary;
    });
  }
  async close() { await this.db.end(); }
}

export async function openStore({ initialize = true, legacyPath = process.env.SQLITE_PATH || './data/lantern.sqlite' } = {}) {
  if (!process.env.DATABASE_URL && !process.env.PGHOST) throw new Error('PostgreSQL connection required. Use Docker Compose or configure PGHOST/PGUSER/PGPASSWORD/PGDATABASE.');
  const pool = new pg.Pool({ ...(process.env.DATABASE_URL ? { connectionString:process.env.DATABASE_URL } : { password:process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD }), max:10, connectionTimeoutMillis:5000, statement_timeout:15000, query_timeout:20000 });
  pool.on('error', () => console.error('PostgreSQL connection error; check database health.'));
  try {
    const store = new Store(pool, process.env.ENCRYPTION_KEY);
    await store.migrateSchema();
    if (initialize) await store.initialize(legacyPath);
    return store;
  } catch(error) { await pool.end(); throw error; }
}

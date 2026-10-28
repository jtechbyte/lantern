import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { defaults, settingsSchema } from './config.mjs';

export class Store {
  constructor(directory, encryptionKey) {
    if (!/^[a-f0-9]{64}$/i.test(encryptionKey || '')) throw new Error('ENCRYPTION_KEY must contain 64 hex characters');
    this.key = Buffer.from(encryptionKey, 'hex');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, 'lantern.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS releases (id TEXT PRIMARY KEY, media TEXT NOT NULL, source TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS releases_media ON releases(media);
      CREATE TABLE IF NOT EXISTS searches (media TEXT PRIMARY KEY, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS health (source TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS watched (media TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, time INTEGER NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL);`);
    if (!this.get('settings')) this.set('settings', this.encrypt(defaults));
    if (!this.get('installToken')) this.rotateToken();
    this.settings(); // Fail startup if the encryption key cannot read existing data.
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
  get(key) { return this.db.prepare('SELECT value FROM kv WHERE key=?').get(key)?.value; }
  set(key, value) { this.db.prepare('INSERT INTO kv VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value); }
  settings() { return settingsSchema.parse(this.decrypt(this.get('settings'))); }
  saveSettings(settings) { this.set('settings', this.encrypt(settingsSchema.parse(settings))); this.db.exec('DELETE FROM searches'); }
  rotateToken() { const token = randomBytes(24).toString('hex'); this.set('installToken', token); return token; }
  putRelease(media, source, release) {
    const id = createHash('sha256').update(`${media}|${source}|${release.infoHash}|${release.fileIdx ?? '-'}`).digest('hex').slice(0, 32);
    const row = { ...release, id, source, media };
    this.db.prepare('INSERT INTO releases VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated')
      .run(id, media, source, JSON.stringify(row), Date.now());
    return row;
  }
  releases(media) { return this.db.prepare("SELECT data FROM releases WHERE media=? AND (updated>? OR source='manual') ORDER BY updated DESC LIMIT 1000").all(media, Date.now() - 7 * 86400000).map(r => JSON.parse(r.data)); }
  release(id) { const row = this.db.prepare('SELECT data FROM releases WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; }
  lastSearch(media) { return this.db.prepare('SELECT updated FROM searches WHERE media=?').get(media)?.updated || 0; }
  searched(media) { this.db.prepare('INSERT INTO searches VALUES (?,?) ON CONFLICT(media) DO UPDATE SET updated=excluded.updated').run(media, Date.now()); }
  health(source, value) { this.db.prepare('INSERT INTO health VALUES (?,?) ON CONFLICT(source) DO UPDATE SET data=excluded.data').run(source, JSON.stringify(value)); }
  sourceHealth() { return Object.fromEntries(this.db.prepare('SELECT * FROM health').all().map(r => [r.source, JSON.parse(r.data)])); }
  watch(media) {
    if (this.watchlist().length >= 50 && !this.watchlist().includes(media)) throw new Error('Watchlist limit is 50');
    this.db.prepare('INSERT OR IGNORE INTO watched VALUES (?)').run(media);
  }
  unwatch(media) { this.db.prepare('DELETE FROM watched WHERE media=?').run(media); }
  watchlist() { return this.db.prepare('SELECT media FROM watched').all().map(r => r.media); }
  event(kind, message) { this.db.prepare('INSERT INTO events(time,kind,message) VALUES (?,?,?)').run(Date.now(), kind, message); }
  stats() { return { releases: this.db.prepare('SELECT count(*) AS n FROM releases').get().n, watchlist: this.watchlist(), health: this.sourceHealth(), events: this.db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 30').all() }; }
  prune() { this.db.prepare("DELETE FROM releases WHERE updated<? AND source!='manual'").run(Date.now() - 7 * 86400000); this.db.exec('DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 200)'); }
  close() { this.db.close(); }
  ping() { this.db.prepare('SELECT 1').get(); }
  deleteKey(key) { this.db.prepare('DELETE FROM kv WHERE key=?').run(key); }
  deleteImport(id) { this.db.prepare("DELETE FROM releases WHERE id=? AND source='manual'").run(id); }
  async transaction(work) {
    this.db.exec('BEGIN');
    try { const result = await work(this); this.db.exec('COMMIT'); return result; }
    catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
}

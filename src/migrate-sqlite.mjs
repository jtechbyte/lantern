import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { settingsSchema } from './config.mjs';

const tables = {
  kv:['key','value'], releases:['id','media','source','data','updated'], searches:['media','updated'],
  health:['source','data'], watched:['media'], events:['id','time','kind','message'],
};

// Stop the old app before importing. A WAL-mode DB may need writable sidecars
// even for read-only queries. Copy the DB and any committed WAL to private temp
// storage; never open or modify the original read-only volume through SQLite.
export async function migrateSqlite(store, path) {
  const temporary = mkdtempSync(join(tmpdir(), 'lantern-sqlite-import-'));
  let source;
  try {
    chmodSync(temporary, 0o700);
    const snapshot = join(temporary, 'lantern.sqlite');
    copyFileSync(path, snapshot);
    chmodSync(snapshot, 0o600);
    try { copyFileSync(`${path}-wal`, `${snapshot}-wal`); chmodSync(`${snapshot}-wal`, 0o600); }
    catch(error) { if (error.code !== 'ENOENT') throw error; }
    // Do not copy -shm: SQLite reconstructs that transient index from the WAL.
    source = new DatabaseSync(snapshot);
    source.exec('PRAGMA query_only=ON; BEGIN');
    const encrypted = source.prepare("SELECT value FROM kv WHERE key='settings'").get()?.value;
    if (!encrypted) throw new Error('SQLite settings are missing');
    try { settingsSchema.parse(store.decrypt(encrypted)); }
    catch { throw new Error('Cannot decrypt SQLite settings. Use the original ENCRYPTION_KEY.'); }
    if (!source.prepare("SELECT value FROM kv WHERE key='installToken'").get()?.value) throw new Error('SQLite installation token is missing');
    return await store.transaction(async tx => {
      await tx.db.query('SELECT pg_advisory_xact_lock(78214002)');
      await tx.db.query('LOCK TABLE kv, releases, searches, health, watched, events IN ACCESS EXCLUSIVE MODE');
      for (const table of Object.keys(tables)) {
        if (Number((await tx.db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n)) throw new Error('PostgreSQL destination is not empty. Import refused; existing data was not changed.');
      }
      const counts = {};
      for (const [table,columns] of Object.entries(tables)) {
        counts[table] = 0;
        const placeholders = columns.map((_,i)=>`$${i+1}`).join(',');
        for (const row of source.prepare(`SELECT ${columns.join(',')} FROM ${table}`).iterate()) {
          await tx.db.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`,columns.map(c=>row[c]));
          counts[table]++;
        }
        const actual = Number((await tx.db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
        if (actual !== counts[table]) throw new Error('Migration row count mismatch');
      }
      await tx.db.query("SELECT setval(pg_get_serial_sequence('events','id'), COALESCE(max(id),1), count(*)>0) FROM events");
      await tx.settings();
      await tx.set('migration:sqlite', JSON.stringify({ completedAt:new Date().toISOString(), counts }));
      return counts;
    });
  } finally {
    try { source?.close(); }
    finally { rmSync(temporary, { recursive:true, force:true }); }
  }
}

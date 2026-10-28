// Development-only real PostgreSQL engine compiled to WASM. Never used by main.
import { PGlite } from '@electric-sql/pglite';
import { Store } from '../../src/store.mjs';

export async function embeddedStore(key, { initialize = true, directory } = {}) {
  const db = new PGlite(directory);
  let tail = Promise.resolve();
  async function acquire() {
    const previous = tail;
    let release;
    tail = new Promise(resolve => { release = resolve; });
    await previous; return release;
  }
  const pool = {
    async connect() {
      const release = await acquire();
      return { query:(...args)=>db.query(...args), release };
    },
    async query(...args) {
      const release = await acquire();
      try { return await db.query(...args); } finally { release(); }
    },
    async end() { await tail; await db.close(); },
  };
  const store = new Store(pool, key);
  try { await store.migrateSchema(); if (initialize) await store.initialize(); return store; }
  catch(error) { await pool.end(); throw error; }
}

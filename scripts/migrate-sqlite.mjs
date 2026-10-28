import { openStore } from '../src/store.mjs';
import { migrateSqlite } from '../src/migrate-sqlite.mjs';

let store;
try {
  store = await openStore({ initialize:false });
  const counts = await migrateSqlite(store, process.argv[2] || process.env.SQLITE_PATH || './data/lantern.sqlite');
  console.log('SQLite migration committed. Original SQLite file was not modified.');
  console.log(JSON.stringify(counts));
} catch(error) {
  const known = /^(Cannot decrypt SQLite|SQLite settings|SQLite installation|PostgreSQL destination|Migration row count)/.test(error.message);
  console.error(known ? error.message : 'Migration failed. Check database connectivity, the SQLite path, and original encryption key. No partial import was committed.');
  if (!known && typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)) console.error(`Diagnostic code: ${error.code}`);
  process.exitCode = 1;
} finally { await store?.close(); }

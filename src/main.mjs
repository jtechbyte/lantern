import { openStore } from './store.mjs';
import { Engine } from './engine.mjs';
import { RealDebrid, rdTransport } from './providers/real-debrid/client.mjs';
import { createApp } from './server.mjs';
import { validatePublicUrl } from './config.mjs';
import { parseMedia } from './matching.mjs';
import { DmmImporter } from './dmm.mjs';

const publicUrl = validatePublicUrl(process.env.PUBLIC_URL || 'http://localhost:7001');
let store;
try { store = await openStore(); }
catch(error) {
  console.error(error.message.startsWith('Legacy SQLite') || error.message.startsWith('PostgreSQL connection required') ? error.message : 'Database startup failed. Check PostgreSQL health, connection settings, and the original encryption key.');
  process.exit(1);
}
const engine = new Engine(store), rd = new RealDebrid(store, { transport: rdTransport });
const dmm = new DmmImporter(store);
const app = createApp({ store, engine, rd, dmm, publicUrl, adminToken: process.env.ADMIN_TOKEN, signingKey: process.env.ENCRYPTION_KEY });
const server = app.listen(Number(process.env.PORT || 7001), process.env.HOST || '127.0.0.1', () => console.log(`Lantern listening on port ${process.env.PORT || 7001}`));
let stopping = false, working = false, workerTask = Promise.resolve();
const timer = setInterval(async () => {
  if (working || stopping) return;
  working = true;
  workerTask = (async () => { try {
    await store.prune();
    await dmm.run();
    for (const key of await store.watchlist()) {
      if (stopping) break;
      const [type,id] = key.split('/');
      await engine.discover(parseMedia(type,id));
    }
  } catch { console.error('Background refresh failed; will retry on next tick.'); }
  finally { working = false; }
  })();
  await workerTask;
}, 60000);
timer.unref();
for (const event of ['SIGINT','SIGTERM']) process.on(event, async () => {
  if (stopping) return;
  stopping = true; clearInterval(timer);
  server.close(async () => {
    await Promise.allSettled([workerTask, dmm.active, ...engine.inflight.values(), ...rd.active.values()]);
    await store.close(); process.exit(0);
  });
});

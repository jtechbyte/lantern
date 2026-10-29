// One process-wide measurement per cache window, shared by connected browsers.
export function databaseSizeReader(db, { now = Date.now, ttl = 5000 } = {}) {
  let cached, expires = 0, pending;
  return async () => {
    if (cached && now() < expires) return cached;
    if (pending) return pending;
    pending = (async () => {
      let result;
      try {
        const { rows } = await db.query('SELECT pg_database_size(current_database()) AS database_size_bytes;');
        const raw = rows[0]?.database_size_bytes;
        if ((typeof raw === 'number' && !Number.isSafeInteger(raw)) || !/^\d+$/.test(String(raw))) throw Error('Invalid measurement');
        result = { bytes: BigInt(raw).toString(), measuredAt: new Date(now()).toISOString(), state: 'fresh' };
      } catch {
        result = cached?.bytes != null ? { ...cached, state: 'stale' } : { bytes: null, measuredAt: null, state: 'unavailable' };
      }
      cached = result; expires = now() + ttl;
      return result;
    })();
    try { return await pending; } finally { pending = null; }
  };
}

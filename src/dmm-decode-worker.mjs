import { parentPort, workerData } from 'node:worker_threads';
import lz from 'lz-string';
try {
  const text = lz.decompressFromEncodedURIComponent(workerData);
  if (!text || Buffer.byteLength(text) > 4 * 1024 * 1024) throw Error();
  const data = JSON.parse(text), rows = Array.isArray(data) ? data : data?.torrents;
  if (!Array.isArray(rows)) throw Error();
  parentPort.postMessage({ rows: rows.slice(0, 1000), total: rows.length });
} catch { parentPort.postMessage({ error: true }); }

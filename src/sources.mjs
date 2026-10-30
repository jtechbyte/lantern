import { readUrl, readJson, UpstreamError } from './network.mjs';
import { normalizeTitle } from './matching.mjs';

export const sourceDefinitions = [
  { id: 'dmm', name: 'DMM hashlists', types: ['movie','series'], interface: 'Local metadata', note: 'Searches locally imported metadata. Automatically discovers public lists; controls in Library.' },
  { id: 'yts', name: 'YTS', types: ['movie'], interface: 'JSON API', url: 'https://movies-api.accel.li', note: 'IMDb movie search using the migrated JSON endpoint.' },
  { id: 'eztv', name: 'EZTV', types: ['series'], interface: 'JSON API', url: 'https://eztvx.to', note: 'IMDb lookup, first 200 results per search.' },
  { id: 'apibay', name: 'The Pirate Bay / API Bay', types: ['movie', 'series'], interface: 'JSON API', url: 'https://apibay.org', note: 'Strict title and year matching; no file list.' },
];
const array = value => value == null ? [] : Array.isArray(value) ? value : [value];
export function parseYts(data) {
  if (data.status !== 'ok' || !data.data) throw new UpstreamError('SCHEMA_CHANGED');
  return array(data.data.movies).flatMap(movie => array(movie.torrents).map(t => ({
    infoHash: t.hash, title: `${movie.title} ${movie.year} ${t.quality || ''} ${t.type || ''} ${t.video_codec || ''}`, imdb: movie.imdb_code,
    size: Number(t.size_bytes) || null, seeders: Number(t.seeds) || 0, trackers: [],
  })));
}
export function parseEztv(data) {
  if (!Number.isFinite(Number(data.torrents_count))) throw new UpstreamError('SCHEMA_CHANGED');
  return array(data.torrents).map(t => ({ title: t.title || t.filename, infoHash: t.hash,
    imdb: `tt${String(t.imdb_id).replace(/^tt/, '').padStart(7, '0')}`, seeders: Number(t.seeds) || 0, size: Number(t.size_bytes) || null, trackers: [],
  }));
}
export function parseApiBay(data) {
  if (!Array.isArray(data)) throw new UpstreamError('SCHEMA_CHANGED');
  return data.filter(t => t.id !== '0').map(t => ({ infoHash: t.info_hash, title: t.name,
    imdb: /^tt\d+$/.test(t.imdb || '') ? t.imdb : undefined,
    size: Number(t.size) || null, seeders: Number(t.seeders) || 0, trackers: [],
  }));
}
export class Sources {
  constructor(store, request = { readUrl, readJson }) { this.store = store; this.request = request; this.locks = new Map(); this.last = new Map(); }
  async search(id, media, metadata, signal) {
    const definition = sourceDefinitions.find(s => s.id === id);
    if (!definition?.types.includes(media.type)) return [];
    const previous = (await this.store.sourceHealth())[id];
    if ((previous?.retryAt || 0) > Date.now()) return [];
    // One active search per source, even when different Stremio requests arrive.
    if (this.locks.has(id)) throw new UpstreamError('SOURCE_BUSY');
    this.locks.set(id, true);
    const start = Date.now();
    try {
      const rows = await this.run(id, media, metadata, signal);
      await this.store.health(id, { status: 'ok', checkedAt: Date.now(), lastSuccess: Date.now(), durationMs: Date.now() - start, results: rows.length });
      return rows;
    } catch (error) {
      const status = error.status === 429 ? 'throttled' : error.status === 403 ? 'blocked' : 'error';
      await this.store.health(id, { status, code: error.code || 'PARSER_ERROR', checkedAt: Date.now(), lastSuccess: previous?.lastSuccess || null,
        lastSuccessful: previous?.status === 'ok' ? { checkedAt: previous.checkedAt, durationMs: previous.durationMs, results: previous.results } : previous?.lastSuccessful || null,
        durationMs: Date.now() - start, retryAt: Date.now() + (status === 'error' ? 60000 : 15 * 60000) });
      if (error.partialRows?.length) return error.partialRows;
      throw error;
    } finally { this.locks.delete(id); }
  }
  async run(id, media, metadata, signal) {
    if (id === 'dmm') {
      if (!metadata?.name) throw new UpstreamError('METADATA_REQUIRED');
      if (!this.store.dmmCandidates) return [];
      return this.store.dmmCandidates(normalizeTitle(metadata.name));
    }
    const get = async (url, json = false) => {
      const wait = Math.max(0, (this.last.get(id) || 0) + 3000 - Date.now());
      if (wait) await new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new UpstreamError('TIMEOUT'));
        const onAbort = () => { clearTimeout(timer); reject(new UpstreamError('TIMEOUT')); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, wait);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
      this.last.set(id, Date.now());
      return this.request[json ? 'readJson' : 'readUrl'](url, { signal });
    };
    const query = metadata?.name ? `${metadata.name}${media.type === 'series' ? ` S${String(media.season).padStart(2,'0')}E${String(media.episode).padStart(2,'0')}` : ` ${metadata.year || ''}`}` : media.imdb;
    if (id === 'yts') return parseYts(await get(`https://movies-api.accel.li/api/v2/list_movies.json?limit=50&query_term=${media.imdb}`, true));
    if (id === 'eztv') {
      let rows = [];
      for (let page = 1; page <= 2; page++) {
        const data = await get(`https://eztvx.to/api/get-torrents?limit=100&page=${page}&imdb_id=${media.imdb.slice(2)}`, true);
        rows.push(...parseEztv(data));
        if (Number(data.torrents_count) <= page * 100) break;
      }
      return rows;
    }
    if (id === 'apibay') return parseApiBay(await get(`https://apibay.org/q.php?q=${encodeURIComponent(query)}&cat=200`, true));
    return [];
  }
}

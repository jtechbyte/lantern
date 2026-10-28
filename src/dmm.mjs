import { Worker } from 'node:worker_threads';
import { load } from 'cheerio';
import { readUrl } from './network.mjs';
import { normalizeTitle } from './matching.mjs';
import { indexFilenameMatch } from './providers/real-debrid/filename-filter.mjs';

export function hashlistUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) throw Error('Use a public DMM hashlist HTML URL');
  const base = url.hostname === 'raw.githubusercontent.com' ? '/debridmediamanager/hashlists/main/'
    : url.hostname === 'debridmediamanager.github.io' ? '/hashlists/' : url.hostname === 'hashlists.debridmediamanager.com' ? '/' : null;
  const filename = base && url.pathname.startsWith(base) ? url.pathname.slice(base.length) : '';
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.html$/i.test(filename)) throw Error('Use a public DMM hashlist HTML URL');
  return `https://raw.githubusercontent.com/debridmediamanager/hashlists/main/${filename}`;
}
export function titleKey(title) {
  return normalizeTitle(title.replace(/^\[[^\]]+\]\s*/, '').split(/\b(?:19\d{2}|20\d{2})\b|\bS\d{1,3}E?\d*|\b\d{1,2}x\d{2}|\b(?:4320|2160|1440|1080|720|576|480|360|240)p\b/i)[0]);
}
export const DMM_CATALOG_URL='https://api.github.com/repos/debridmediamanager/hashlists/git/trees/main';
export function parseCatalog(data) {
  if (!Array.isArray(data.tree) || data.truncated !== false) throw Error('Incomplete DMM catalog');
  const entries=[];
  for (const entry of data.tree) {
    if (entry.type!=='blob' || !/^[a-f0-9]{40}$/i.test(entry.sha || '')) continue;
    try { hashlistUrl(`https://raw.githubusercontent.com/debridmediamanager/hashlists/main/${entry.path}`); }
    catch { continue; }
    entries.push({path:entry.path,sha:entry.sha});
  }
  if (!entries.length || entries.length>25000 || new Set(entries.map(e=>e.path)).size!==entries.length) throw Error('Unsupported DMM catalog size');
  return entries;
}
export function decodeHashlist(html) {
  const $ = load(html.toString());
  const src = $('iframe[src^="https://debridmediamanager.com/hashlist#"]').first().attr('src');
  if (!src) throw Error('Unsupported hashlist format');
  const encoded = new URL(src).hash.slice(1);
  if (!encoded || encoded.length > 1024 * 1024 || !/^[A-Za-z0-9+$-]+$/.test(encoded)) throw Error('Unsupported hashlist payload');
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./dmm-decode-worker.mjs', import.meta.url), { workerData: encoded, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 64 } });
    const timer = setTimeout(() => { worker.terminate(); reject(Error('Hashlist decode timeout')); }, 3000);
    worker.once('message', result => { clearTimeout(timer); worker.terminate(); result.error ? reject(Error('Invalid hashlist data')) : resolve(result); });
    worker.once('error', () => { clearTimeout(timer); reject(Error('Hashlist decode failed')); });
    worker.once('exit', code => { clearTimeout(timer); if (code !== 0) reject(Error('Hashlist decode stopped')); });
  });
}
export async function fetchHashlist(list, request = readUrl) {
  const canonical = hashlistUrl(list), options = {timeout:10000,maxBytes:2*1024*1024};
  const html = await request(canonical, options);
  const src = load(html.toString())('iframe[src^="https://debridmediamanager.com/hashlist#"]').first().attr('src');
  const fragment = src ? new URL(src).hash.slice(1) : '';
  if (!fragment.startsWith('id=')) return decodeHashlist(html);
  const id = canonical.split('/').at(-1).replace(/\.html$/, '');
  if (fragment !== `id=${id}`) throw Error('Hashlist reference mismatch');
  const stored = (await request(`https://raw.githubusercontent.com/debridmediamanager/hashlists/main/lists/${id}.txt`,options)).toString().trim();
  // A migrated file can contain the previous HTML wrapper or compressed text.
  if (stored.startsWith('<')) return decodeHashlist(stored);
  if (!/^[A-Za-z0-9+$-]+$/.test(stored)) throw Error('Invalid stored hashlist');
  return decodeHashlist(`<iframe src="https://debridmediamanager.com/hashlist#${stored}"></iframe>`);
}
export function validateRecords(rows, blockFilenames) {
  const records = [], seen = new Set(); let invalid = 0, excluded = 0, duplicates = 0;
  for (const row of rows) {
    if (!row || typeof row.filename !== 'string' || !row.filename.trim() || row.filename.length > 1000 || /[\x00-\x1f]/.test(row.filename) ||
        !/^(?!0{40}$)[a-f0-9]{40}$/i.test(row.hash || '') || !Number.isSafeInteger(row.bytes) || row.bytes <= 0) { invalid++; continue; }
    const release = { title: row.filename, infoHash: row.hash.toLowerCase(), size: row.bytes, seeders: 0, trackers: [] };
    const key = titleKey(release.title);
    if (!key || key.length > 500) { invalid++; continue; }
    if (blockFilenames && indexFilenameMatch(release)) { excluded++; continue; }
    if (seen.has(release.infoHash)) { duplicates++; continue; }
    seen.add(release.infoHash); records.push({ key, release });
  }
  return { records, invalid, excluded, duplicates };
}
export class DmmImporter {
  constructor(store, request = readUrl) { this.store = store; this.request = request; this.active = null; }
  run(force = false) {
    if (this.active) return this.active;
    this.active = this.importLists(force).catch(async () => {
      const state = { status: 'error', at: Date.now(), message: 'Hashlist import failed. Check URLs, connectivity and database storage.' };
      try { await this.store.set('dmm:last', JSON.stringify(state)); } catch { /* database unavailable */ }
      return state;
    }).finally(() => { this.active = null; });
    return this.active;
  }
  async importLists(force) {
    const settings = await this.store.settings();
    if (!settings.sources.includes('dmm')) return { status: 'disabled' };
    if (settings.dmmAuto) return this.importAutomatic(settings);
    if (!settings.dmmHashlists.length) return { status: 'disabled' };
    const previous = JSON.parse(await this.store.get('dmm:last') || 'null');
    if (!force && previous?.at > Date.now() - 3600000) return previous;
    const totals = { status:'ok', at:Date.now(), lists:0, failed:0, accepted:0, excluded:0, invalid:0, duplicates:0, truncated:0 };
    for (const list of settings.dmmHashlists) {
      try {
        const { rows, total } = await fetchHashlist(list, this.request);
        const validated = validateRecords(rows, settings.blockIndexFilenames);
        totals.accepted += await this.store.putDmmCandidates(validated.records);
        totals.lists++;totals.excluded+=validated.excluded;totals.invalid+=validated.invalid;totals.duplicates+=validated.duplicates;totals.truncated+=Math.max(0,total-rows.length);
      } catch { totals.failed++; }
    }
    if (totals.failed) totals.status = totals.lists ? 'partial' : 'error';
    await this.store.set('dmm:last', JSON.stringify(totals));
    await this.store.event('dmm', `DMM import: ${totals.accepted} accepted observations; ${totals.excluded} filename exclusions; ${totals.failed} failed lists.`);
    return totals;
  }
  async importAutomatic(settings) {
    const now=Date.now(), previous=JSON.parse(await this.store.get('dmm:auto-last') || 'null');
    // Manual buttons cannot bypass the automatic network budget.
    if (previous?.at>now-60000) return previous;
    const totals={status:'running',mode:'automatic',at:now,lists:0,failed:0,accepted:0,excluded:0,invalid:0,truncated:0};
    const save=async()=>{await this.store.set('dmm:auto-last',JSON.stringify(totals));await this.store.set('dmm:last',JSON.stringify(totals));};
    await save();
    if ((await this.store.storageBudget(true)).state!=='normal') {totals.status='paused';totals.message='Automatic imports paused at the 3 GB storage threshold.';await save();return totals;}
    const catalog=JSON.parse(await this.store.get('dmm:catalog') || 'null');
    if (!catalog || catalog.retryAt<=now) {
      try {
        const data=JSON.parse((await this.request(DMM_CATALOG_URL,{timeout:10000,maxBytes:12*1024*1024})).toString());
        const entries=parseCatalog(data);
        await this.store.syncDmmLists(entries);
        await this.store.set('dmm:catalog',JSON.stringify({at:now,retryAt:now+6*3600000,status:'ok',lists:entries.length}));
      } catch(error) {
        await this.store.set('dmm:catalog',JSON.stringify({at:now,retryAt:now+6*3600000,status:'error',code:error.code || 'INVALID_CATALOG'}));
        totals.catalogError=true;
      }
    } else if(catalog.status==='error') totals.catalogError=true;
    for(const {path} of await this.store.dueDmmLists()) {
      let success=false;
      try {
        const {rows,total}=await fetchHashlist(`https://raw.githubusercontent.com/debridmediamanager/hashlists/main/${path}`,this.request);
        const validated=validateRecords(rows,settings.blockIndexFilenames);
        totals.accepted+=await this.store.putDmmCandidates(validated.records);
        totals.excluded+=validated.excluded;totals.invalid+=validated.invalid;totals.truncated+=total-rows.length;
        totals.lists++;success=true;
      } catch { totals.failed++; }
      await this.store.finishDmmList(path,success);
    }
    totals.queue=await this.store.dmmQueueStatus();
    totals.status=totals.failed || totals.catalogError?'partial':'ok';
    await save();
    if(totals.lists || totals.failed || totals.catalogError)await this.store.event('dmm',`DMM automatic: ${totals.lists} lists imported; ${totals.accepted} accepted; ${totals.excluded} filename exclusions; ${totals.failed} failed; ${totals.queue.unvisited} unvisited lists.`);
    return totals;
  }
}

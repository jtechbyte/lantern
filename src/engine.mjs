import { readJson } from './network.mjs';
import { Sources } from './sources.mjs';
import { matchRelease, rankWithReasons, parseMedia, traits } from './matching.mjs';
import { assessRealDebridCandidate, indexFilenameMatch } from './providers/real-debrid/filename-filter.mjs';

export class Engine {
  constructor(store, { sources = new Sources(store), metadataRequest = readJson, firstSearchWaitMs = 3000 } = {}) {
    this.store = store; this.sources = sources; this.metadataRequest = metadataRequest;
    this.inflight = new Map(); this.metadata = new Map();
    this.firstSearchWaitMs = firstSearchWaitMs;
  }
  async meta(media, signal) {
    const key = `${media.type}/${media.imdb}`;
    const cached = this.metadata.get(key);
    if (cached?.expires > Date.now()) return cached.value;
    const data = await this.metadataRequest(`https://v3-cinemeta.strem.io/meta/${media.type}/${media.imdb}.json`, { signal, timeout: 5000 });
    if (!data.meta?.name) throw new Error('Metadata unavailable');
    const value = { name: data.meta.name, year: parseInt(data.meta.releaseInfo) || null };
    if (this.metadata.size >= 500) this.metadata.delete(this.metadata.keys().next().value);
    this.metadata.set(key, { value, expires: Date.now() + 86400000 });
    return value;
  }
  async discover(media, force = false) {
    if (this.inflight.has(media.key)) return this.inflight.get(media.key);
    if (this.inflight.size >= 4) return; // bound network fanout across clients
    const task = (async () => {
      const settings = await this.store.settings();
      if (!force && Date.now() - await this.store.lastSearch(media.key) < settings.refreshMinutes * 60000) return;
      await this.search(media, settings);
    })().finally(() => this.inflight.delete(media.key));
    this.inflight.set(media.key, task); return task;
  }
  async search(media, settings) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    let metadata = null;
    try {
      try { metadata = await this.meta(media, controller.signal); } catch { /* IMDb-aware sources can still search */ }
      const outcomes = await Promise.allSettled(settings.sources.map(async source => {
        const rows = await this.sources.search(source, media, metadata, controller.signal);
        let matched = 0, excluded = 0;
        for (const row of rows.slice(0, 300)) {
          const release = matchRelease(row, media, metadata);
          if (release) {
            if (settings.blockIndexFilenames && indexFilenameMatch(release)) { excluded++; continue; }
            const saved = await this.store.putRelease(media.key, source, release); if (saved) matched++;
          }
        }
        if (excluded) await this.store.event("filename-policy", source + ": " + excluded + " filename-rule matches excluded before indexing.");
        return matched;
      }));
      // A failed or blocked source must not turn the whole lookup into a long
      // negative cache. Source backoff independently prevents repeated pressure.
      const health = await this.store.sourceHealth();
      if (outcomes.every(o => o.status === 'fulfilled') && settings.sources.every(id => health[id]?.status === 'ok' || !health[id])) await this.store.searched(media.key);
      const count = outcomes.reduce((n, o) => n + (o.status === 'fulfilled' ? o.value : 0), 0);
      await this.store.event('search', `${media.key}: ${count} matching observations; ${outcomes.filter(o => o.status === 'rejected').length} source failures`);
    } finally { clearTimeout(timer); }
  }
  async results(media, { force = false, profileSettings, includeManual = true } = {}) {
    const options = { profileSettings, includeManual };
    // Explicit dashboard refreshes still await the full bounded discovery.
    if (force) {
      await this.discover(media, true);
      return { ...await this.indexedResults(media, options), refreshing: false };
    }
    const discovery = this.discover(media).catch(async () => {
      // Detached work must never reject unhandled or expose upstream secrets.
      try { await this.store.event('search', `${media.key}: Background discovery failed; retry later.`); } catch { /* Shutdown/database failure. */ }
    });
    // Collect a fuller first response instead of returning the first saved row.
    // Fresh cache/no-op discovery and completed searches finish immediately;
    // slow sources continue in the background after this bounded window.
    let timer;
    try {
      await Promise.race([discovery, new Promise(resolve => { timer = setTimeout(resolve, this.firstSearchWaitMs); })]);
    } finally { clearTimeout(timer); }
    const result = await this.indexedResults(media, options);
    return { ...result, refreshing: this.inflight.has(media.key) };
  }
  async indexedResults(media, { profileSettings, includeManual = true } = {}) {
    const settings = profileSettings || await this.store.settings(), rejected = [], eligible = [];
    for (const row of await this.store.releases(media.key)) {
      if (!includeManual && row.source === 'manual') continue;
      if (row.source !== 'manual' && !settings.sources.includes(row.source)) continue;
      if (settings.provider === 'p2p' && media.type === 'series' && row.fileIdx == null) {
        rejected.push({ id: row.id, title: row.title, source: row.source, code: 'EPISODE_FILE_UNKNOWN', reason: 'Exact episode file index unknown; available for debrid inspection only.' }); continue;
      }
      const assessment = assessRealDebridCandidate({ provider: settings.provider, torrentName: row.torrentName,
        releaseTitle: row.title, selectedFilePath: row.filePath, mode: settings.rdFilenameMode });
      if (assessment.decision === 'hide') { rejected.push({ id: row.id, title: row.title, source: row.source, code: 'RD_FILENAME_POLICY', reason: 'Real-Debrid filename policy predicts a rejection for a known original name.', assessment }); continue; }
      eligible.push({ ...row, rdFilenameAssessment: assessment });
    }
    const { selected, rejected: rankedOut } = rankWithReasons(eligible, settings);
    rejected.push(...rankedOut);
    return { selected, rejected, settings };
  }
  async importRelease(input, store = this.store) {
    const media = parseMedia(input.type, input.mediaId);
    const release = { infoHash: input.infoHash.toLowerCase(), title: input.title, torrentName: input.torrentName || undefined,
      fileIdx: input.fileIdx, filePath: input.filePath, size: input.size ?? null, seeders: input.seeders ?? 0,
      trackers: [], ...traits(input.title), confidence: 'manual-mapping' };
    if ((await store.settings()).blockIndexFilenames && indexFilenameMatch(release)) return null;
    return store.putRelease(media.key, 'manual', release);
  }
}

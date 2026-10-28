import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { selectFile, parseMedia } from '../../matching.mjs';
import { UpstreamError } from '../../network.mjs';
import { assessRealDebridCandidate, classifyRealDebridRejection } from './filename-filter.mjs';

export class PlaybackError extends Error {
  constructor(code, status = 502) { super(code); this.code = code; this.status = status; }
}
export class RealDebrid {
  constructor(store, { transport = rdTransport, sleep = delay } = {}) {
    this.store = store; this.transport = transport; this.sleep = sleep;
    this.cooldown = new Map(); this.active = new Map(); this.links = new Map();
  }
  async call(token, path, params, signal) {
    try {
      const body = await this.transport(`https://api.real-debrid.com/rest/1.0/${path}`, {
        method: params ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        body: params ? new URLSearchParams(params).toString() : undefined, signal, timeout: 8000,
      });
      return body.length ? JSON.parse(body.toString()) : {};
    } catch (error) {
      // Transport below preserves structured RD errors without logging body/token.
      if (error.rdBody) throw error;
      throw new PlaybackError(error.status === 401 ? 'RD_AUTH_FAILED' : error.status === 429 ? 'RD_RATE_LIMITED' : 'RD_REQUEST_FAILED');
    }
  }
  async user(token) { return this.call(token, 'user'); }
  rejectionKey(token, hash) {
    return 'rd-block:' + createHash('sha256').update(token).digest('hex') + ':' + hash.toLowerCase();
  }
  async blocked(hash, token) {
    if (!token) return false;
    const key = this.rejectionKey(token, hash);
    const expires = Number(await this.store.get(key));
    if (expires > Date.now()) return true;
    if (expires) await this.store.deleteKey(key);
    return false;
  }
  async resolve(release, profileSettings) {
    const settings = profileSettings || await this.store.settings();
    if (!settings.rdToken) throw new PlaybackError('Configure a Real-Debrid token in the dashboard.', 409);
    if (await this.blocked(release.infoHash, settings.rdToken)) throw new PlaybackError('Blocked by Real-Debrid (error 35). This hash is hidden for 24 hours after rejection.', 409);
    const account = createHash('sha256').update(settings.rdToken).digest('hex');
    const key = JSON.stringify([account, release.infoHash, release.media, release.fileIdx,
      release.filePath, release.torrentName, settings.rdFilenameMode]);
    if (this.links.get(key)?.expires > Date.now()) return this.links.get(key).url;
    if (this.active.has(key)) return this.active.get(key);
    if (this.active.size >= 2) throw new PlaybackError('Playback resolver busy; retry shortly.', 503);
    const task = this.perform(release, settings, account).then(url => {
      if (this.links.size >= 100) this.links.delete(this.links.keys().next().value);
      this.links.set(key, { url, expires: Date.now() + 5 * 60000 }); return url;
    }).finally(() => this.active.delete(key));
    this.active.set(key, task); return task;
  }
  async perform(release, settings, account) {
    const media = parseMedia(...release.media.split('/'));
    const signal = AbortSignal.timeout(30000), token = settings.rdToken;
    const savedKey = `rd:${account}:${release.infoHash}:${media.id}:${release.fileIdx ?? '-'}`;
    let torrentId = await this.store.get(savedKey), stage = 'inspect';
    let originalName = release.torrentName, filePath = release.filePath;
    try {
      if (!torrentId) {
        if ((this.cooldown.get(account) || 0) > Date.now()) throw new PlaybackError('Lantern cooldown after Real-Debrid error 35; retry in ' + Math.ceil((this.cooldown.get(account) - Date.now()) / 1000) + ' seconds. See the preceding rejection for the failed operation.', 503);
        const policy = assessRealDebridCandidate({ provider: 'realdebrid', torrentName: originalName, releaseTitle: release.title, selectedFilePath: filePath, mode: settings.rdFilenameMode });
        if (policy.decision === 'hide') throw new PlaybackError('Real-Debrid filename policy excluded this release.', 409);
        stage = 'add';
        const added = await this.call(token, 'torrents/addMagnet', { magnet: 'magnet:?xt=urn:btih:' + release.infoHash }, signal);
        if (!added.id) throw new PlaybackError('RD_INVALID_TORRENT_RESPONSE');
        torrentId = String(added.id); await this.store.set(savedKey, torrentId);
      }
      let info, selected;
      for (let attempt = 0; attempt < 6; attempt++) {
        stage = 'inspect';
        info = await this.call(token, 'torrents/info/' + encodeURIComponent(torrentId), undefined, signal);
        if (info.hash?.toLowerCase() !== release.infoHash) throw new PlaybackError('RD_TORRENT_HASH_MISMATCH');
        originalName = info.original_filename || info.filename || originalName;
        selected = selectFile(info.files || [], media, release.fileIdx);
        if (info.status === 'downloaded') break;
        if (info.status === 'waiting_files_selection') {
          if (!selected) throw new PlaybackError('No unambiguous video file matches the requested episode.', 409);
          filePath = selected.path;
          const policy = assessRealDebridCandidate({ provider: 'realdebrid', needsAdd: false, selectedFilePath: filePath, mode: settings.rdFilenameMode });
          if (policy.decision === 'hide') throw new PlaybackError('Selected file is excluded by the Real-Debrid filename policy.', 409);
          stage = 'select';
          await this.call(token, 'torrents/selectFiles/' + encodeURIComponent(torrentId), { files: String(selected.id) }, signal);
        } else if (['error','magnet_error','virus','dead'].includes(info.status)) {
          await this.store.deleteKey(savedKey);
          throw new PlaybackError('Real-Debrid could not prepare this torrent.', 409);
        }
        if (attempt < 5) await this.sleep(1500, undefined, { signal });
      }
      if (info?.status !== 'downloaded') throw new PlaybackError('Real-Debrid is preparing this uncached torrent. Retry later; no video is stored on your Lantern server.', 503);
      if (!selected) throw new PlaybackError('No unambiguous video file matches the requested episode.', 409);
      filePath = selected.path;
      const policy = assessRealDebridCandidate({ provider: 'realdebrid', needsAdd: false, selectedFilePath: filePath, mode: settings.rdFilenameMode });
      if (policy.decision === 'hide') throw new PlaybackError('Selected file is excluded by the Real-Debrid filename policy.', 409);
      const index = (info.files || []).filter(f => f.selected === 1).findIndex(f => f.id === selected.id);
      if (index < 0 || !info.links?.[index]) throw new PlaybackError('Selected file is not available in this Real-Debrid torrent.', 409);
      stage = 'unrestrict';
      const unlocked = await this.call(token, 'unrestrict/link', { link: info.links[index] }, signal);
      const url = new URL(unlocked.download);
      if (url.protocol !== 'https:' || url.username || url.password) throw new PlaybackError('RD_INVALID_DOWNLOAD_URL');
      return url.href;
    } catch (error) {
      // A missing torrent invalidates only its saved provider ID, not the indexed release.
      // Do this before converting structured provider errors into PlaybackError.
      if (error.status === 404 && ['inspect', 'select'].includes(stage)) {
        await this.store.deleteKey(savedKey);
        throw new PlaybackError('Real-Debrid torrent is no longer available (HTTP 404). Cleared its saved reference; retry this stream to submit its hash again. Operation: ' + (stage === 'inspect' ? 'torrents/info' : 'torrents/selectFiles') + '.', 409);
      }
      const classification = ['add','unrestrict'].includes(stage) ? classifyRealDebridRejection({ error: error.rdBody || error, stage, torrentName: originalName, selectedFilePath: filePath }) : null;
      if (classification?.accountCooldownSuggested) this.cooldown.set(account, Date.now() + 180000);
      const operation = { add: 'torrents/addMagnet', inspect: 'torrents/info', select: 'torrents/selectFiles', unrestrict: 'unrestrict/link' }[stage];
      // Only fixed operation names and numeric status codes; never log raw provider bodies or URLs.
      const diagnostic = ' Operation: ' + operation + (Number.isInteger(error.status) ? '; HTTP ' + error.status : '') + '.';
      if (classification) {
        await this.store.set(this.rejectionKey(token, release.infoHash), String(Date.now() + 86400000));
        throw new PlaybackError('Blocked by Real-Debrid: infringing file (error 35). Hash hidden for this account for 24 hours.' + diagnostic, 409);
      }
      if (Number.isInteger(error.rdBody?.error_code)) throw new PlaybackError('Real-Debrid error ' + error.rdBody.error_code + '.' + diagnostic, 502);
      if (error instanceof PlaybackError) throw error;
      throw new PlaybackError('Real-Debrid playback resolution failed. Check credentials and provider status.');
    }
  }
}

// Provider-specific transport: bounded JSON error bodies are needed to distinguish
// error 35 from authentication, throttling and other failures.
export async function rdTransport(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.any([
    AbortSignal.timeout(options.timeout || 8000), ...(options.signal ? [options.signal] : []),
  ]) });
  const chunks = []; let length = 0;
  for await (const chunk of response.body || []) {
    length += chunk.length;
    if (length > 2097152) { throw new UpstreamError('RESPONSE_TOO_LARGE'); }
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (!response.ok) {
    const error = new UpstreamError(`HTTP_${response.status}`, response.status);
    try { error.rdBody = JSON.parse(bytes.toString()); } catch { error.rdBody = {}; }
    throw error;
  }
  return bytes;
}

import { detectLanguages } from './language-tags.mjs';

export function parseMedia(type, id) {
  if (type === 'movie' && /^tt\d{7,10}$/.test(id)) return { type, id, imdb: id, key: `${type}/${id}` };
  const match = /^(tt\d{7,10}):(\d{1,3}):(\d{1,4})$/.exec(id);
  if (type === 'series' && match && Number(match[3]) > 0) return { type, id, imdb: match[1], season: Number(match[2]), episode: Number(match[3]), key: `${type}/${id}` };
  throw new Error('Use movie/tt1234567 or series/tt1234567:1:2');
}
export const normalizeTitle = name => String(name).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function episodeOf(name) {
  const m = /(?:^|[^a-z0-9])s(\d{1,3})[ ._-]*e(\d{1,4})(?!\d)/i.exec(name) || /\b(\d{1,2})x(\d{2,3})\b/i.exec(name);
  if (!m) return null;
  const tail = name.slice(m.index + m[0].length);
  if (/^(?:[ ._-]*e\d|[ ._-]*-\d)/i.test(tail)) return null; // multi-episode release: ambiguous
  return { season: +m[1], episode: +m[2] };
}
export const isVideo = name => /\.(mkv|mp4|avi|m4v|webm|ts)$/i.test(name) && !/(?:^|[\W_])(sample|trailer)(?:[\W_]|$)/i.test(name);
export function selectFile(files, media, explicitIndex) {
  const videos = files.map((file, index) => ({ ...file, index })).filter(f => isVideo(f.path || f.name || ''));
  const matchesEpisode = file => {
    const basename = (file.path || file.name || '').split(/[\\/]/).at(-1);
    const episode = episodeOf(basename);
    return episode?.season === media.season && episode.episode === media.episode;
  };
  if (explicitIndex != null) {
    const file = videos.find(f => f.index === explicitIndex);
    return file && (media.type !== 'series' || matchesEpisode(file)) ? file : null;
  }
  if (media.type === 'series') {
    const matches = videos.filter(matchesEpisode);
    return matches.length === 1 ? matches[0] : null;
  }
  return videos.sort((a,b) => (b.length || b.bytes || 0) - (a.length || a.bytes || 0))[0] || null;
}
export function traits(title) {
  const quality = /\b(4320|2160|1440|1080|720|576|480|360|240)p\b/i.exec(title)?.[0].toLowerCase() || (/\b(4k|uhd)\b/i.test(title) ? '2160p' : 'unknown');
  return { quality, languages: detectLanguages(title), cam: /\b(hd)?cam\b|\b(telesync|telecine|hdts)\b/i.test(title) };
}
export function matchRelease(release, media, metadata) {
  if (!/^[a-f0-9]{40}$/i.test(release.infoHash || '') || /^0+$/.test(release.infoHash)) return null;
  const title = release.title || '';
  const trustedId = release.imdb === media.imdb;
  if (release.imdb && !trustedId) return null;
  if (!trustedId) {
    const prefix = title.replace(/^\[[^\]]+\]\s*/, '').split(/\b(?:19\d{2}|20\d{2})\b|\bS\d{1,3}E?\d*|\b\d{1,2}x\d{2}|\b(?:4320|2160|1440|1080|720|576|480|360|240)p\b/i)[0];
    if (!metadata?.name || normalizeTitle(prefix) !== normalizeTitle(metadata.name)) return null;
    const year = /\b(19\d{2}|20\d{2})\b/.exec(title)?.[0];
    if (media.type === 'movie' && (!year || (metadata.year && +year !== +metadata.year))) return null;
  }
  let file;
  if (release.files?.length) file = selectFile(release.files, media);
  if (release.files?.length && !file) return null;
  if (media.type === 'series' && !file) {
    const episode = episodeOf(title);
    if (!episode || episode.season !== media.season || episode.episode !== media.episode) return null;
  }
  // Packs require inspectable matching files. Explicit single-episode names can
  // resolve via debrid later; P2P filtering applies a stricter file requirement.
  return { ...release, infoHash: release.infoHash.toLowerCase(),
    ...(file ? { fileIdx: file.index, filePath: file.path || file.name, size: file.length || release.size } : {}),
    confidence: file ? 'file-matched' : 'release-matched', ...traits(title) };
}
export function rank(releases, settings) {
  return rankWithReasons(releases, settings).selected;
}
export function rankWithReasons(releases, settings) {
  const sorted = [], rejected = [], selected = [];
  const reject = (row, reasons, retainedId) => rejected.push({
    id: row.id, title: row.title, source: row.source, code: reasons[0].code,
    reason: reasons.map(r => r.message).join(' '), reasons,
    ...(retainedId ? { retainedId } : {}),
  });
  for (const row of releases) {
    const reasons = [];
    if (settings.excludeQualities.includes(row.quality)) reasons.push({ code:'QUALITY_EXCLUDED', message:`${row.quality} is excluded in your quality preferences.` });
    if (settings.excludeCam && row.cam) reasons.push({ code:'CAM_EXCLUDED', message:'The title matches a CAM/telesync pattern and CAM exclusion is enabled.' });
    if (settings.maxSizeGB) {
      if (row.size == null) reasons.push({ code:'SIZE_UNKNOWN', message:`Size is unknown, so the ${settings.maxSizeGB} GiB limit cannot be checked.` });
      else if (row.size > settings.maxSizeGB * 1073741824) reasons.push({ code:'SIZE_LIMIT', message:`Size ${(row.size / 1073741824).toFixed(2)} GiB exceeds your ${settings.maxSizeGB} GiB limit.` });
    }
    if (settings.provider === 'p2p' && settings.minSeeders && !(row.seeders >= settings.minSeeders)) reasons.push({ code:'SEEDER_MINIMUM', message:`Reported seeders (${row.seeders ?? 'unknown'}) are below your P2P minimum of ${settings.minSeeders}.` });
    if (reasons.length) reject(row, reasons); else sorted.push(row);
  }
  const quality = r => parseInt(r.quality) || 0;
  sorted.sort((a,b) =>
    quality(b) - quality(a) ||
    Number(b.languages?.includes(settings.preferLanguage)) - Number(a.languages?.includes(settings.preferLanguage)) ||
    (settings.sort === 'size' ? (b.size || 0) - (a.size || 0) : (b.seeders || 0) - (a.seeders || 0)) || a.infoHash.localeCompare(b.infoHash));
  // Give each source a turn within a resolution. Seeder counts are unavailable
  // for imported metadata, so a global seeder sort would starve those sources.
  // Keep the existing preference order inside each source's queue.
  const balanced = [], resolutions = new Map();
  for (const row of sorted) {
    if (!resolutions.has(row.quality)) resolutions.set(row.quality, new Map());
    const sources = resolutions.get(row.quality), source = row.source || 'unknown';
    if (!sources.has(source)) sources.set(source, []);
    sources.get(source).push(row);
  }
  const fileKey = row => `${row.infoHash}:${row.fileIdx ?? row.filePath ?? '-'}`;
  for (const sources of resolutions.values()) {
    const emitted = new Set();
    while ([...sources.values()].some(queue => queue.length)) {
      for (const queue of sources.values()) {
        while (queue.length) {
          const row = queue.shift(), key = fileKey(row);
          balanced.push(row);
          // A duplicate must not consume the source's chance to offer a unique file.
          if (!emitted.has(key)) { emitted.add(key); break; }
        }
      }
    }
  }
  const seen = new Map(), counts = new Map();
  for (const r of balanced) {
    const key = `${r.infoHash}:${r.fileIdx ?? r.filePath ?? '-'}`;
    if (seen.has(key)) reject(r, [{ code:'DUPLICATE_FILE', message:'The same torrent and file is already included from another observation.' }], seen.get(key));
    else if ((counts.get(r.quality) || 0) >= settings.perQuality) reject(r, [{ code:'QUALITY_RESULT_LIMIT', message:`Your limit of ${settings.perQuality} results for ${r.quality} has been reached.` }]);
    else if (selected.length >= settings.maxResults) reject(r, [{ code:'TOTAL_RESULT_LIMIT', message:`Your total limit of ${settings.maxResults} results has been reached.` }]);
    else { seen.set(key, r.id); counts.set(r.quality, (counts.get(r.quality) || 0) + 1); selected.push(r); }
  }
  return { selected, rejected };
}

import { traits } from './matching.mjs';
import { languageLabels } from './language-tags.mjs';

const clean = (value, limit = 180) => Array.from(String(value ?? '').replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, limit).join('');
export function formatSource(row, settings = {}) {
  const style = settings.sourceFormat || 'clear', icons = settings.formatIcons !== false;
  const text = clean(row.title, 500), label = clean(settings.name || 'Lantern', 60);
  const parsed = traits(text);
  const quality = clean(row.quality || parsed.quality);
  const resolution = quality === '4320p' ? '8K UHD' : quality === '2160p' ? '4K UHD' : quality === 'unknown' ? 'Quality unknown' : quality;
  const tags = [];
  for (const [pattern, tag] of [
    [/\bWEB[ ._-]?DL\b/i,'WEB-DL'],[/\bWEBRip\b/i,'WEBRip'],[/\bBlu[ ._-]?Ray\b/i,'BluRay'],
    [/\b(?:x265|h[ .]?265|hevc)\b/i,'HEVC'],[/\b(?:x264|h[ .]?264|avc)\b/i,'H.264'],[/\bAV1\b/i,'AV1'],
    [/\b(?:Dolby[ ._-]?Vision|DoVi|DV)\b/i,'Dolby Vision'],[/\bHDR10\+/i,'HDR10+'],[/\bHDR(?:10)?\b/i,'HDR'],
    [/\b(?:DDP(?:5|7)?|EAC3)\b/i,'DD+'],[/\bTrueHD\b/i,'TrueHD'],[/\bDTS(?:[ ._-]?HD)?\b/i,'DTS'],[/\bAtmos\b/i,'Atmos'],[/\bAAC\b/i,'AAC'],[/\b(?:5\.1|7\.1)\b/i,null]
  ]) { const match = pattern.exec(text); if (match) tags.push(tag || match[0]); }
  if (tags.includes('HDR10+')) tags.splice(tags.indexOf('HDR'), tags.includes('HDR') ? 1 : 0);
  const lang = [...new Set([...(row.languages || []), ...parsed.languages].map(l => languageLabels[l]).filter(Boolean))].join(' / ');
  const size = Number.isFinite(row.size) && row.size > 0 ? (row.size / 1073741824).toFixed(2) + ' GiB' : 'Size unknown';
  const source = ({yts:'YTS',eztv:'EZTV',apibay:'API Bay',rutor:'RuTor',dmm:'DMM',nyaa:'Nyaa',manual:'Library'})[row.source] || clean(row.source || 'Unknown source', 40);
  const line = (icon, value) => icons ? `${icon} ${value}` : value;
  const details = tags.join(' · ');
  const lines = [];
  if (style !== 'compact') lines.push(line('🎞', clean(row.title || 'Untitled release')));
  if (details) lines.push(line('🎛', details));
  lines.push(line('📦', `${size} · ${source}${settings.formatSeeders && Number.isFinite(row.seeders) ? ' · ' + row.seeders + ' seeders' : ''}`));
  if (lang) lines.push(line('🌐', lang));
  if (style === 'detailed') lines.push('Match: ' + ({'file-matched':'Exact file','release-matched':'Release metadata','manual-mapping':'Manual mapping'}[row.confidence] || 'Unknown'));
  if (row.rdFilenameAssessment?.decision === 'warn') lines.push(line('⚠', 'RD filename warning'));
  return { name: `${icons ? '🏮 ' : ''}${label} · RD\n${resolution}`, title: lines.join('\n') };
}
export const previewSource = { title: 'Example.Film.2026.2160p.WEB-DL.HEVC.HDR10.AAC.5.1.ENG-SPA.mkv', quality:'2160p', languages:['english','spanish'], size:5.24*1073741824, seeders:84, source:'yts', confidence:'release-matched', rdFilenameAssessment:{decision:'warn'} };

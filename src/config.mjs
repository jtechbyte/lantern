import { z } from 'zod';
import { hashlistUrl } from './dmm.mjs';

export const SOURCE_IDS = ['yts', 'eztv', 'apibay', 'dmm'];
const retiredSources = new Set(['nyaa', 'tokyotosho', '1337x', 'anidex', 'zilean', 'rutor']);
const webUrl = z.string().max(1000).refine(value => {
  if (!value) return true;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}, 'Use an HTTPS URL');
export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().max(300),
  logo: webUrl,
  // Accept older saved settings, dropping only explicitly retired source IDs.
  sources: z.preprocess(v => Array.isArray(v) ? v.filter(id => !retiredSources.has(id)) : v,
    z.array(z.enum(SOURCE_IDS)).max(SOURCE_IDS.length).transform(v => [...new Set(v)])),
  maxResults: z.number().int().min(1).max(50),
  perQuality: z.number().int().min(1).max(20),
  maxSizeGB: z.number().min(0).max(200),
  minSeeders: z.number().int().min(0).max(10000),
  excludeQualities: z.array(z.enum(['2160p', '1080p', '720p', '480p', 'unknown'])).max(5),
  excludeCam: z.boolean(),
  preferLanguage: z.enum(['any', 'english', 'spanish', 'french', 'german', 'italian', 'portuguese', 'japanese']),
  sort: z.enum(['quality', 'seeders', 'size']),
  provider: z.enum(['p2p', 'realdebrid']),
  rdToken: z.string().max(300),
  blockIndexFilenames: z.boolean().default(true),
  rdFilenameMode: z.enum(['warn', 'hide', 'off']),
  sourceFormat: z.enum(['clear', 'compact', 'detailed']).default('clear'),
  formatIcons: z.boolean().default(true),
  formatSeeders: z.boolean().default(false),
  refreshMinutes: z.number().int().min(15).max(1440),
  dmmAuto: z.boolean().default(true),
  dmmHashlists: z.array(z.string().max(500).refine(value => { try { hashlistUrl(value); return true; } catch { return false; } }, 'Use a public DMM hashlist HTML URL')).max(5).default([]),
}).strict();
export const defaults = {
  // Applied only when creating an instance; saved preferences survive upgrades.
  // No paid account or language/device assumptions are required to start.
  name: 'Lantern', description: 'Direct-source discovery with explainable file matching.', logo: '',
  sources: ['yts', 'eztv', 'apibay'], maxResults: 20, perQuality: 5, maxSizeGB: 0,
  minSeeders: 1, excludeQualities: [], excludeCam: true, preferLanguage: 'any', sort: 'quality',
  sourceFormat: 'clear', formatIcons: true, formatSeeders: false,
  blockIndexFilenames: true,
  provider: 'realdebrid', rdToken: '', rdFilenameMode: 'warn', refreshMinutes: 60,
  dmmHashlists: [],
  dmmAuto: true,
};
export function validatePublicUrl(value) {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || u.pathname !== '/') {
    throw new Error('PUBLIC_URL must be an HTTP(S) origin without path, credentials or query');
  }
  return u.origin;
}

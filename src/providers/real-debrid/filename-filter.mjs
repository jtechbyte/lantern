import ruleData from './filename-rules.json' with { type: 'json' };

// Independent implementation of observed behavior. No DMM implementation copied.
export function createFilenameInspector(rules) {
  if (!rules || typeof rules.version !== 'string' || !rules.version ||
      !Array.isArray(rules.patterns) || rules.patterns.length > 100) {
    throw new TypeError('Invalid filename rule set');
  }
  const ids = new Set();
  const patterns = rules.patterns.map(rule => {
    if (!rule || typeof rule.id !== 'string' || !rule.id || ids.has(rule.id) ||
        typeof rule.literal !== 'string' || !rule.literal || rule.literal.length > 256 ||
        typeof rule.caseSensitive !== 'boolean') throw new TypeError('Invalid filename rule');
    ids.add(rule.id);
    return Object.freeze({ ...rule });
  });
  const version = rules.version;
  return function inspect(name) {
    if (name !== undefined && name !== null && typeof name !== 'string') {
      throw new TypeError('Name must be a string or absent');
    }
    if (name == null || !name.trim()) return { status: 'unknown', rulesVersion: version, matches: [] };
    // Keep original case, separators and encoding. Do not parse prettified titles,
    // decode URI text, or rewrite names before checking provider compatibility.
    const matches = patterns.flatMap(rule => {
      const haystack = rule.caseSensitive ? name : name.toLowerCase();
      const needle = rule.caseSensitive ? rule.literal : rule.literal.toLowerCase();
      const index = haystack.indexOf(needle);
      return index < 0 ? [] : [{ ruleId: rule.id, literal: rule.literal,
        matchedText: name.slice(index, index + rule.literal.length), index }];
    });
    return { status: matches.length ? 'predicted-rejection' : 'no-known-match', rulesVersion: version, matches };
  };
}

export const RD_FILENAME_RULES_VERSION = ruleData.version;
export const inspectRealDebridName = createFilenameInspector(ruleData);

function fileBasename(path) {
  if (path == null) return path;
  if (typeof path !== 'string') throw new TypeError('Selected file path must be a string');
  // Parent folder tags do not describe the selected file's own name.
  return path.split(/[\\/]/).at(-1);
}

/**
 * torrentName must be the original metainfo/provider root name, not a magnet dn
 * or a source display title. Pass a source title separately as releaseTitle.
 * Only pass the selected episode's file path, never all sibling episode names.
 */
export function assessRealDebridCandidate({
  provider, torrentName, releaseTitle, selectedFilePath, needsAdd = true,
  mode = 'warn',
}, inspect = inspectRealDebridName) {
  if (!['off', 'warn', 'hide'].includes(mode)) throw new TypeError('Unknown filename filter mode');
  if (typeof needsAdd !== 'boolean') throw new TypeError('needsAdd must be boolean');
  if (provider !== 'realdebrid' || mode === 'off') {
    return { applies: false, decision: 'keep', reasons: [], checks: {} };
  }
  const checks = {
    // Existing RD torrents need not pass the add gate again. Their selected file
    // must still be assessed for link resolution, even if the torrent is cached.
    torrent: needsAdd ? inspect(torrentName) : { status: 'not-applicable', matches: [] },
    file: inspect(fileBasename(selectedFilePath)),
  };
  if (needsAdd && checks.torrent.status === 'unknown') checks.titleHint = inspect(releaseTitle);
  const reasons = [];
  for (const [field, stage] of [['torrent', 'add'], ['file', 'unrestrict'], ['titleHint', 'add']]) {
    if (checks[field]?.status === 'predicted-rejection') {
      reasons.push({ stage, evidence: field === 'titleHint' ? 'display-title-only' : 'original-name',
        rulesVersion: checks[field].rulesVersion, matches: checks[field].matches });
    }
  }
  const hasOriginalMatch = reasons.some(reason => reason.evidence === 'original-name');
  return {
    applies: true,
    decision: mode === 'hide' && hasOriginalMatch ? 'hide' : reasons.length ? 'warn' : 'keep',
    reasons, checks,
    // A no-known-match result is deliberately not a claim that RD will accept it.
    availability: 'not-assessed',
  };
}

/** Preserve the source index and other providers: decorate copies for this request. */
export function applyRealDebridFilenamePolicy(candidates, options = {}) {
  const visible = [], excluded = [];
  for (const candidate of candidates) {
    const assessment = assessRealDebridCandidate({ ...candidate, ...options });
    const decorated = { ...candidate, rdFilenameAssessment: assessment };
    (assessment.decision === 'hide' ? excluded : visible).push(decorated);
  }
  return { visible, excluded };
}

/** Classify only RD's structured response; do not mistake every HTTP 451 for 35. */
export function classifyRealDebridRejection({ error, stage, torrentName, selectedFilePath }, inspect = inspectRealDebridName) {
  if (!['add', 'unrestrict'].includes(stage)) throw new TypeError('Unknown Real-Debrid stage');
  const body = error?.response?.data ?? error?.data ?? error;
  if (!(body?.error === 'infringing_file' || body?.error_code === 35 || body?.error_code === '35')) return null;
  const nameCheck = inspect(stage === 'add' ? torrentName : fileBasename(selectedFilePath));
  return {
    kind: nameCheck.status === 'predicted-rejection' ? 'rejection-consistent-with-name-rule' : 'unexplained-provider-rejection',
    stage, nameCheck,
    // Error 35 alone does not identify the cause or justify shared-index deletion.
    confirmedCause: false,
    invalidateGlobalIndex: false,
    retryImmediately: false,
    accountCooldownSuggested: stage === 'add' && nameCheck.status !== 'predicted-rejection',
  };
}

// Strict index policy: display titles count too, unlike playback's conservative hide mode.
export function indexFilenameMatch(release) {
  const checks = [['torrentName', release.torrentName], ['filePath', fileBasename(release.filePath)], ['title', release.title]];
  for (const [field, name] of checks) {
    const assessment = inspectRealDebridName(name);
    if (assessment.status === 'predicted-rejection') return { field, ...assessment };
  }
  return null;
}

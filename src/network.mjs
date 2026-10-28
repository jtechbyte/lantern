export class UpstreamError extends Error {
  constructor(code, status = 0) { super(code); this.code = code; this.status = status; }
}
export async function readUrl(url, { signal, method = 'GET', headers = {}, body, maxBytes = 2097152, timeout = 10000 } = {}) {
  const controller = new AbortController();
  const combined = AbortSignal.any([controller.signal, AbortSignal.timeout(timeout), ...(signal ? [signal] : [])]);
  try {
    const response = await fetch(url, { method, headers: { 'User-Agent': 'LanternAddon/0.1 (self-hosted)', ...headers }, body,
      redirect: 'error', signal: combined });
    if (!response.ok) { await response.body?.cancel(); throw new UpstreamError(`HTTP_${response.status}`, response.status); }
    if (+response.headers.get('content-length') > maxBytes) { await response.body?.cancel(); throw new UpstreamError('RESPONSE_TOO_LARGE'); }
    let size = 0; const chunks = [];
    for await (const chunk of response.body || []) {
      size += chunk.length;
      if (size > maxBytes) { controller.abort(); throw new UpstreamError('RESPONSE_TOO_LARGE'); }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError(combined.aborted ? 'TIMEOUT' : 'NETWORK_ERROR');
  }
}
export async function readJson(url, options) {
  try { return JSON.parse((await readUrl(url, options)).toString()); }
  catch (error) { if (error instanceof UpstreamError) throw error; throw new UpstreamError('INVALID_JSON'); }
}

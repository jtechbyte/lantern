// Read-only checks; no provider credentials or private installation URL needed.
const input = process.argv[2] || 'http://localhost:7001';
let origin;
try {
  const url = new URL(input);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error();
  origin = url.origin;
} catch {
  console.error('Use an HTTP(S) origin without credentials, path, or query.');
  process.exit(1);
}
let failed = 0;
const require = (condition, message) => { if (!condition) throw Error(message); };
async function check(label, path, verify) {
  try {
    const response = await fetch(origin + path, { redirect:'manual', signal:AbortSignal.timeout(10000) });
    require(response.status < 300 || response.status >= 400, 'Unexpected redirect; check the origin and proxy login requirements.');
    await verify(response);
    console.log(`PASS ${label}`);
  } catch(error) {
    failed++;
    // Never print remote bodies, cookies, or redirect destinations.
    console.log(`FAIL ${label}: ${error instanceof SyntaxError ? 'Expected Lantern JSON; a proxy may be serving a login/error page.' : error.message}`);
  }
}
await check('Health endpoint', '/healthz', async r => {
  require(r.ok && (r.headers.get('content-type') || '').includes('application/json'), 'Expected JSON health response.');
  const body=await r.json();require(body.status === 'ok' && body.version === '0.1.0', 'Unexpected health response.');
});
await check('Dashboard', '/', async r => {
  require(r.ok, `Dashboard returned HTTP ${r.status}.`);
  const body=await r.text();require(body.includes('id="login-form"') && body.includes('id="dashboard"'), 'Expected Lantern dashboard, not a proxy login page.');
});
await check('Bundled logo', '/brand/lantern-mark.png', async r => {
  require(r.ok && (r.headers.get('content-type') || '').includes('image/png'), 'Logo is missing or blocked.');
  const bytes=new Uint8Array(await r.arrayBuffer());require(bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71, 'Expected PNG image bytes.');
});
await check('Admin API authentication', '/api/settings', async r => {
  require(r.status === 401, 'Unauthenticated API request should return HTTP 401.');
  const body=await r.json();require(body.error === 'Admin token required', 'Expected Lantern authentication response.');
});
await check('Addon route and CORS', '/a/deployment-probe/manifest.json', async r => {
  require(r.status === 404 && r.headers.get('access-control-allow-origin') === '*', 'Addon route was rewritten, challenged, or did not return CORS headers.');
  const body=await r.json();require(body.error === 'Unknown installation', 'Expected invalid-installation response.');
});
console.log(`${failed ? 'Some checks failed.' : 'All deployment checks passed.'} This does not verify a real installation URL, source coverage, or media playback.`);
process.exitCode = failed ? 1 : 0;

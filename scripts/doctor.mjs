import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { validatePublicUrl } from '../src/config.mjs';

let failures = 0;
function check(label, valid, remedy) {
  console.log(`${valid ? 'OK' : 'FAIL'} ${label}${valid ? '' : ': ' + remedy}`);
  if (!valid) failures++;
}
check('Node runtime', Number(process.versions.node.split('.')[0]) >= 24, 'Use Node 24 or newer.');
check('Admin token configured', (process.env.ADMIN_TOKEN || '').length >= 32, 'Run npm run setup or set ADMIN_TOKEN (at least 32 characters).');
check('Encryption key format', /^[a-f0-9]{64}$/i.test(process.env.ENCRYPTION_KEY || ''), 'Use the generated 64-character hex key. Preserve the existing key when restoring data.');
let origin;
try { origin = validatePublicUrl(process.env.PUBLIC_URL || 'http://localhost:7001'); } catch {}
check('Public origin format', Boolean(origin), 'Set PUBLIC_URL to an HTTP(S) origin without a path or credentials.');
if (origin) {
  const url = new URL(origin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (local) console.log('NOTE Local-only installation URL. Remote clients need your server HTTPS origin.');
  else check('Remote HTTPS configured', url.protocol === 'https:', 'Set PUBLIC_URL to your HTTPS origin.');
  if (process.env.DOMAIN) check('Caddy domain matches public origin', process.env.DOMAIN === url.host, 'Use the same hostname in DOMAIN and PUBLIC_URL.');
}
const port = Number(process.env.PORT || 7001);
check('Listen port', Number.isInteger(port) && port >= 1 && port <= 65535, 'PORT must be between 1 and 65535.');
const configured = Boolean(process.env.DATABASE_URL || process.env.PGHOST);
check('PostgreSQL connection configured', configured, 'Run inside the Compose container, or set DATABASE_URL / PGHOST, PGUSER, PGDATABASE and PGPASSWORD for local Node.');
if (configured) {
  const pool = new pg.Pool({ ...(process.env.DATABASE_URL ? { connectionString:process.env.DATABASE_URL } : { password:process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD }), connectionTimeoutMillis:5000, query_timeout:5000 });
  try { await pool.query('SELECT 1'); check('PostgreSQL reachable',true); }
  catch { check('PostgreSQL reachable',false,'Check database health and credentials.'); }
  finally { await pool.end(); }
}
const docker = spawnSync('docker', ['compose', 'version'], { encoding:'utf8', windowsHide:true });
if (docker.status === 0) {
  const config = spawnSync('docker', ['compose', 'config', '--quiet'], { encoding:'utf8', windowsHide:true });
  check('Compose configuration', config.status === 0, 'Run docker compose config --quiet to inspect configuration errors.');
  const daemon = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding:'utf8', windowsHide:true, timeout:10000 });
  check('Docker daemon reachable', daemon.status === 0, 'Start Docker and grant this user access to its daemon.');
} else console.log('NOTE Docker Compose unavailable here; container configuration/runtime not checked.');
console.log('This check does not test DNS, certificates, Stremio playback, or a debrid account.');
process.exitCode = failures ? 1 : 0;

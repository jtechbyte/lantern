// Actual application screenshots with a fresh isolated database; no external requests.
import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { embeddedStore } from './lib/embedded-postgres.mjs';
import { Engine } from '../src/engine.mjs';
import { RealDebrid } from '../src/providers/real-debrid/client.mjs';
import { createApp } from '../src/server.mjs';

const store = await embeddedStore('b'.repeat(64));
const engine = new Engine(store, { sources: { search: async () => [] }, metadataRequest: async () => ({ meta: { name: 'Example', releaseInfo: '2020' } }) });
let handler, browser;
const server = createServer((req, res) => handler(req, res));
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  handler = createApp({ store, engine, rd: new RealDebrid(store), publicUrl: base, adminToken: 'c'.repeat(64), signingKey: 'b'.repeat(64) });
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.BROWSER_PATH || (existsSync(edge) ? edge : undefined);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  mkdirSync('docs/images', { recursive: true });
  await page.goto(base);
  await page.screenshot({ path: 'docs/images/dashboard-unlock.png' });
  await page.locator('#admin-token').fill('c'.repeat(64));
  await page.locator('#login-form').evaluate(form => form.requestSubmit());
  await page.locator('#logout').waitFor({ state: 'visible' });
  await page.locator('#tab-overview').click();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'docs/images/dashboard-overview.png' });
  console.log('Captured fresh-instance Overview and empty unlock form; no external requests.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await store.close();
}

# Contributing to Lantern

Keep changes focused, preserve existing saved configuration and data, and describe the problem before proposing a broad redesign. Discuss substantial behavior changes in an issue first. Contributions are under the [MIT license](LICENSE); do not copy incompatible third-party implementations or remove their required notices.

## Development setup

Requires Node 24+ and npm. The tests use isolated temporary data, including PGlite (PostgreSQL compiled to WebAssembly), and do not require a production database or real provider credentials.

```sh
git clone https://github.com/jtechbyte/lantern.git
cd lantern
npm ci
npm test
npx playwright install chromium
npm run check:browser
node scripts/functional-audit.mjs
node scripts/release-smoke.mjs
```

Linux Chromium may need system libraries; Playwright's `npx playwright install --with-deps chromium` installs them on supported systems. Alternatively set `BROWSER_PATH` to an installed Chromium/Edge executable. Windows Edge is detected automatically by the browser scripts. Screenshots/logs belong in ignored `artifacts/`, never in a bug report without review.

For an interactive server, follow [Installation](docs/INSTALLATION.md): `npm run setup`, configure a reachable PostgreSQL connection in `.env`, then `npm run doctor` and `npm start`. Compose does not expose its database to the host. Never aim tests at production or reuse real tokens in fixtures.

## Source map

- `src/main.mjs`: startup, background worker, shutdown.
- `src/server.mjs`: HTTP routes, admin and addon access boundaries.
- `src/store.mjs`: PostgreSQL storage and migrations; legacy SQLite exists for migration/reference tests.
- `src/engine.mjs`, `src/matching.mjs`, `src/sources.mjs`: discovery, matching, ranking, adapters.
- `src/dmm.mjs`: bounded hashlist ingestion.
- `src/providers/real-debrid/`: account-aware playback resolution and filename rules.
- `src/profiles.mjs`: invitations, isolated preferences, revocation.
- `public/`: plain HTML/CSS/JavaScript. Dashboard scripts share scope and load in a deliberate order.
- `scripts/`, `test/`: maintenance tools and automated checks.

## Validation and pull requests

Explain the trigger, expected/actual behavior, changes, and checks actually performed. Add targeted regression tests for functional bugs; avoid tests that merely restate implementation. Check loading, empty, invalid, and failure states. For UI changes verify 1366 × 768, a larger desktop, and small/zoomed layouts, including keyboard focus and long content.

Provider/source fixtures are not live integration verification. Clearly label mocked transports, PGlite, native PostgreSQL, actual browser checks, and live external tests. Do not contact real users or perform destructive checks outside isolated fixtures.

Preserve migration compatibility, token redaction, per-profile isolation, and honest statuses. Include documentation for changed options. Run `npm ci` after lockfile changes. Do not commit `.env`, archives, logs, databases, private URLs, copied research captures, or dependency folders.

Report security problems privately using [SECURITY.md](SECURITY.md).

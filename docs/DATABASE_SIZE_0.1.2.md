# Database size - 0.1.2 verification

Implementation uses SELECT pg_database_size(current_database()) AS database_size_bytes against Lantern's connected database. Bytes travel as decimal strings without JavaScript Number conversion. The authenticated /api/database-size endpoint coalesces concurrent requests and caches for five seconds. Previous measurements keep their original timestamp after failure.

Local checks: 122 automated tests passed, including decimal-unit boundaries, rounding promotion, large integer precision, concurrent cache requests, failures and recovery. Real browser/HTTP polling checks passed with mocked measurement SQL: immediate refresh, ten-second cadence, hidden/tab/lock lifecycle, stale timestamps, recovery, and two browser sessions sharing a cache.

## Native verification

[Native pre-release run](https://github.com/jtechbyte/lantern/actions/runs/40792301093) passed on both linux/amd64 and linux/arm64. On each architecture:

- Direct SQL before: **8,091,315 bytes**; authenticated endpoint: **8,091,315 bytes**; direct SQL after: **8,091,315 bytes**.
- The direct SQL ran as a separate non-superuser role with CONNECT permission. The application used the standard Compose database role. No superuser privilege is required by the measurement SQL.
- Inserting 20,000 isolated test rows with external text storage and a primary-key index grew the database to **65,197,747 bytes**. The browser displayed **65.2 MB** without reload.
- Database outage retained stale bytes and the original measurement timestamp; recovery produced a fresh measurement.
- Unauthorized size requests returned 401. Login, settings persistence, container/database restart, recreation, and native dump/restore checks passed.
- Four-card layouts passed at 1858 x 846 and 1366 x 768 without page overflow, and reflow checks passed at 780 x 1024 and 390 x 844. The two desktop screenshots were visually inspected. README uses the sanitized native-test screenshot.

Tests used disposable databases and synthetic credentials, with external source requests disabled. Dropping the test table was cleanup, not a test of immediate disk reclamation. Initial test runs caught a prohibited attempt to demote PostgreSQL's bootstrap role and desktop spacing issues; corrected runs passed as linked above.

## API and display

Authenticated `GET /api/database-size` returns `bytes` (decimal integer string or null), `measuredAt` (ISO timestamp or null), and `state` (`fresh`, `stale`, or `unavailable`). It does not expose database connection strings or errors. No value is fabricated on failure. Decimal B/KB/MB/GB/TB formatting uses integer arithmetic and promotes rounded unit boundaries; exact bytes and scope are accessible on the focusable value.

The measurement includes the connected database's tables and indexes, excluding cluster-wide WAL, backups and other databases. Polling runs only on the unlocked, visible Overview, aborts on suspension/removal, and resumes when visible. A five-second server cache coalesces concurrent browsers. The older storage-budget safeguard is unchanged.

## Cleanup and limits

The change reuses existing metric styling/icons and dashboard lifecycle events. A redundant observer and an unused test variable were removed; no dependencies, existing features, or unrelated assets were removed. Relevant checks were rerun after cleanup. The broader browser smoke suite passed login, persistence, imports, search, monitoring, section layouts, mobile layout and logout without JavaScript/CSP errors. The final native run also passed compact 1280 x 720 layout and polling page-suspension/removal/restoration checks. Linux font wrapping and test-clock resize scheduling were corrected before release.

Physical mobile keyboards, screen readers, non-Chromium engines, external HTTPS/proxy routing and live Real-Debrid/Stremio playback are not verified by these checks. No production installation or data is changed.

## Published release

- [Source commit b92e2bb](https://github.com/jtechbyte/lantern/commit/b92e2bb677e37e435342af52222426b10746d1a7), [release v0.1.2](https://github.com/jtechbyte/lantern/releases/tag/v0.1.2).
- [Final pre-release native checks](https://github.com/jtechbyte/lantern/actions/runs/40793951550): passed on both architectures.
- [Release publication and anonymous deployment verification](https://github.com/jtechbyte/lantern/actions/runs/40794491295): all jobs passed, including stable-alias promotion **after** both published-image checks.
- [Docker Hub](https://hub.docker.com/r/jctechmin/lantern): public `jctechmin/lantern`, natively built and tested for `linux/amd64` and `linux/arm64`.

Published tags: `0.1.2`, `0.1`, `0`, `latest`, `sha-b92e2bb677e37e435342af52222426b10746d1a7`, and native tags `sha-b92e2bb677e37e435342af52222426b10746d1a7-amd64` / `sha-b92e2bb677e37e435342af52222426b10746d1a7-arm64`.

Multi-architecture digest:

```text
sha256:2686b564fe5736a105d3ad6318ceb17c0258384f491c50151819a4a88fab47e5
```

Anonymous registry inspection confirmed the version, commit and stable-alias tags resolve to this digest. Fresh credential-free runners pulled it and started isolated Compose deployments on both architectures. The published-image SQL measurements again matched exactly at 8,091,315 bytes and grew to 65,197,747 bytes; live display, stale-state recovery, login, settings persistence, restart/recreation and backup/restore checks passed. The recommended Compose image is pinned to `0.1.2`. No previous versioned image or release tag was overwritten.

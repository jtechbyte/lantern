# Carousel metadata correction - November 2, 2026

Scope: focused carousel repair. No sidebar, Overview layout, card dimensions, database schema, playback, indexing, or configuration changes. No release or registry image publication is authorized for this review.

## Confirmed causes and live evidence

Both movie requests below returned HTTP 307 to the corresponding exact path on `https://cinemeta-live.strem.io`. Lantern's shared network helper rejected redirects, producing `NETWORK_ERROR`. Ordinary browser/fetch requests that follow redirects obscured this distinction during the first probe.

- [tt39773403 primary response](https://v3-cinemeta.strem.io/meta/movie/tt39773403.json): live endpoint resolves **The Canvas**, 2026. Its background returned HTTP 404; its same-record poster returned HTTP 200 and loaded in the browser. No rating supplied: show the unavailable dash.
- [tt10377864 primary response](https://v3-cinemeta.strem.io/meta/movie/tt10377864.json): live endpoint resolves **Beware Boiúna**, 2026, IMDb 6.1. Background and poster returned HTTP 200; landscape artwork loaded in the browser.

These reproduce application-level lookup failures for both IDs. Production cache contents were not inspected or modified. Provider availability and metadata can change.

## Changes

- Allow one exact, caller-specified Cinemeta live URL redirect, retaining the original five-second total timeout and 2 MiB limit. Arbitrary redirects and subsequent redirects remain rejected. Exact IMDb/type identity validation remains required.
- Persist lookup state and retry deadlines within existing cached JSON. Failed refreshes preserve the previous metadata and original success timestamp; API responses strip internal retry bookkeeping. Transient retries start at 30 seconds and cap at 15 minutes; empty/404 replies retry after one day; artwork-less metadata retries from 15 minutes up to six hours. Batches remain limited to four titles, concurrency two, once per 30 seconds, with currently displayed titles prioritized.
- Automatically try a same-record poster when the background fails. Image failures back off from one to 15 minutes through existing polling, including across card re-renders. Distinguish pending, failed, unavailable, and stale metadata. Resolve titles without reloading the page.
- Use Title unavailable with the IMDb ID beneath it, an artwork placeholder, and unavailable year/rating labels. Preserve newly-indexed badges and fixed two-line title areas.
- Remove only the Movie/TV Show artwork overlays and their unused CSS. Keep type filters and data intact. Center SVG chevrons within artwork-centered arrow buttons outside the cards.

## Completed verification

- `node --test`: **131 passed, zero failed** on Windows. PostgreSQL logic uses isolated PGlite, not the running server.
- `node scripts/carousel-metadata-browser.mjs`: controlled HTTP/image browser tests passed: failed background -> same-title poster, delayed image loading, pending/failed/unavailable labels, bounded retries, recovery, metadata replacement without reload, type-overlay removal, arrow alignment, zero JavaScript exceptions. Injected HTTP 503 image failures are expected console network errors.
- `node scripts/latest-titles-browser.mjs --live`: passed. Eight isolated indexed identities fetched live Cinemeta metadata and browser artwork, including both affected IDs. Filters, sorting, View all, details, polling lifecycle, API timeout/failure recovery, long titles, absent rating, empty states, keyboard focus and arrow reachability passed. Navigation checks use reduced motion to avoid fake-clock/smooth-scroll timing nondeterminism; production smooth-scroll behavior is unchanged.
- All four requested 100% desktop viewport checks passed with no vertical page scrolling, concealed vertical overflow, or action-bar overlap. Final-card captures include the last title, badge, year and rating. Narrow viewport accessibility fallback also checked.
- `node scripts/overview-review.mjs`: before/after sidebar geometry matches exactly; all four sidebar cropped PNGs are byte-identical. Eight status rows remain visible. Database size matched direct isolated SQL (8,052,859 bytes).
- Native AMD64 and ARM64 production Docker builds and container smoke tests **passed** in [non-publishing workflow 41563003402](https://github.com/jtechbyte/lantern/actions/runs/41563003402), for source commit [`c7609e8ac5fb13001e4e98f1c1391a524af29368`](https://github.com/jtechbyte/lantern/commit/c7609e8ac5fb13001e4e98f1c1391a524af29368). Each runner passed all 131 tests, PostgreSQL initialization, non-root startup, login, UI save/refresh, restart/recreation persistence, database outage recovery, and backup/restore into a separate database. Actual browser zoom at 125%, 150%, and 200% passed on both architectures. Native SQL and endpoint bytes matched at 8,165,043; isolated growth to 65,279,667 bytes updated Overview without reload. There is no separate frontend compilation command.
- Production commands: `npm ci`, `npm test`, `docker build --tag lantern:verification --build-arg VERSION=0.1.3 --build-arg REVISION=$GITHUB_SHA --build-arg CREATED=<UTC build timestamp> .`, then `VERIFY_BROWSER_ZOOM=1 xvfb-run -a -s "-screen 0 1600x1200x24" node scripts/container-smoke.mjs lantern:verification`. Workflow logs contain the expanded commands. Docker is unavailable on the local Windows host; these checks ran on native Linux CI runners.

## Viewport evidence

Live captures use real metadata for isolated indexed identities; source-health rows deliberately include controlled success/error fixtures. They are not screenshots of production data.

| Viewport | Live artwork | Final card, keyboard navigation | Controlled fallback states |
| --- | --- | --- | --- |
| 1280 x 720 | [Viewport](images/carousel-fix/viewport-1280x720.png) | [End](images/carousel-fix/end-1280x720.png) | [Fallback](images/carousel-fix/fallback-1280x720.png) |
| 1366 x 768 | [Viewport](images/carousel-fix/viewport-1366x768.png) | [End](images/carousel-fix/end-1366x768.png) | [Fallback](images/carousel-fix/fallback-1366x768.png) |
| 1536 x 864 | [Viewport](images/carousel-fix/viewport-1536x864.png) | [End](images/carousel-fix/end-1536x864.png) | [Fallback](images/carousel-fix/fallback-1536x864.png) |
| 1920 x 1080 | [Viewport](images/carousel-fix/viewport-1920x1080.png) | [End](images/carousel-fix/end-1920x1080.png) | [Fallback](images/carousel-fix/fallback-1920x1080.png) |

Visual comparison: the reference's fallback labels and arrow alignment are implemented while retaining the approved responsive layout. Real data differs from the mockup. The Canvas uses a contained portrait with side space because its landscape image is unavailable; it is not stretched or replaced with another title's artwork. Partial edge cards remain intentional and fully reachable. The existing larger-screen spacing and sidebar are unchanged.

## Limitations and publication status

No merge, tag, release, registry push, or production update. The `fix/carousel-metadata` review branch was pushed solely for review and the existing non-publishing production-validation workflow. Main and published image tags are unchanged. Native Stremio installation, real provider-account verification, movie playback, and episode playback remain **Not tested - unverified** for this change. Remote artwork cannot be guaranteed; expected 404 responses trigger fallback. Existing legacy failed caches may retain their previous retry deadline until eligible.

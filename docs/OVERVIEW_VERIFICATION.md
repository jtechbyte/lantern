# Final Overview verification

## Production verification completed; report updated 2026-11-02

Tested source: [`005ec2e58c1cb4dee9f87cadfc49fe42b4bacf15`](https://github.com/jtechbyte/lantern/commit/005ec2e58c1cb4dee9f87cadfc49fe42b4bacf15), on `verification/overview-final`. [Non-publishing GitHub Actions run](https://github.com/jtechbyte/lantern/actions/runs/41108595678) completed successfully on 2026-10-30 on both native `ubuntu-24.04` (AMD64) and `ubuntu-24.04-arm` (ARM64) runners. This supersedes the Docker and actual-zoom blockers recorded in the earlier checks below.

The approved application and sidebar were not changed during this verification pass. Added a read-only-permission validation workflow and native browser-zoom test, and connected that test to the existing isolated container smoke suite. No image was pushed, no release was created, main was not updated, and no production installation or data was touched.

### Automated checks actually performed

| Check | Result on both architectures |
| --- | --- |
| Production Dockerfile, runtime files, non-root user, health check | Build and image assertions passed |
| `npm test` | 128 passed, zero failures per runner |
| Real PostgreSQL 17 initialization and authentication | Passed; protected API rejects unauthenticated access; browser login succeeds |
| Settings save and refresh | Saved values returned from backend; secrets redacted; private installation identity preserved |
| Application restart, recreation, PostgreSQL restart | Settings and credentials retained |
| Database size accuracy | Direct SQL before = endpoint = direct SQL after: 8,165,043 bytes, using a non-superuser connection |
| Isolated database growth | 8,165,043 to 65,279,667 bytes; Overview updated without reload |
| Database failure and recovery | Unhealthy response during outage; stale bytes retain original timestamp; fresh measurement after recovery |
| Backup/restore | Native `pg_dump`/`pg_restore` into a separate database preserves encrypted settings and installation identity |
| Logs | Expected startup message and deployment checks passed |
| Actual browser zoom | 125%, 150%, 200% passed in headed Chromium under Xvfb using OS keyboard shortcuts |

Commands used by the workflow (the Dockerfile is the same production build used by the documented source Compose installation):

```sh
npm ci
npm test
npx playwright install --with-deps chromium
sudo apt-get update && sudo apt-get install -y xvfb xdotool scrot
docker build --tag lantern:verification \
  --build-arg VERSION="$(node -p 'require("./package.json").version')" \
  --build-arg REVISION="$GITHUB_SHA" \
  --build-arg CREATED="$(date -u +%Y-%m-%dT%H:%M:%SZ)" .
VERIFY_BROWSER_ZOOM=1 xvfb-run -a -s "-screen 0 1600x1200x24" \
  node scripts/container-smoke.mjs lantern:verification
```

The smoke script creates a random Compose project, temporary configuration and isolated volumes, then removes only those resources. The image is local to the disposable runner. It uses real PostgreSQL and HTTP endpoints; external discovery/provider calls are disabled and credentials are synthetic.

### Native zoom and visual evidence

Baseline browser window: 1366 × 900 physical pixels, CSS width 1366, device pixel ratio 1. Browser shortcuts produced measured ratios 1.25, 1.5 and 2—not CSS transforms or emulated viewport resizing. The test visited all eight main sections and scrolled 66 visible controls into view at each zoom level. It asserted each control's full bounding box was within the viewport and detected no page JavaScript exceptions or horizontal page overflow.

| Zoom | CSS viewport | Measured DPR | Overview window | Bottom actions |
| --- | --- | --- | --- | --- |
| 125% | 1093 × 650 | 1.25 | [Capture](images/zoom-overview-125.png) | [Capture](images/zoom-actions-125.png) |
| 150% | 911 × 542 | 1.5 | [Capture](images/zoom-overview-150.png) | [Capture](images/zoom-actions-150.png) |
| 200% | 683 × 406 | 2 | [Capture](images/zoom-overview-200.png) | [Capture](images/zoom-actions-200.png) |

The actual browser-window captures were visually inspected. Navigation remains available through the existing responsive arrangement; vertical scrolling exposes the carousel controls and bottom actions. The first capture method (Playwright/CDP) cropped screenshots at native zoom; it was replaced with OS window captures and the complete workflow rerun successfully. This was a verification-tool defect, not an application layout defect.

Scope: the native-zoom container starts with an empty catalog. This pass does not claim to exercise every populated dialog/subtab at each zoom level. Populated carousel, dialog, edge-case and keyboard checks are covered by the separate browser suites below, not by this native-zoom run.

Local checks also rerun successfully: `node --test test/latest-titles.test.mjs test/source-health.test.mjs` (six passed), `node scripts/browser-smoke.mjs` (login, saving, imports, search, monitoring, mobile and logout; no unexpected JS/CSP errors), and `node scripts/overview-review.mjs` (all four target desktop viewports, eight status rows, no page scrolling, no JavaScript errors). No application changes followed these checks.

## Remaining manual checks — unverified

User-reported status, recorded 2026-11-02: the user explicitly confirmed that these manual tests have **not been performed**. This is a report of test status, not a successful manual verification.

| Manual check | User-reported result | Platform / error |
| --- | --- | --- |
| Native Stremio handoff and installation | Not tested — unverified | Not supplied |
| Live Real-Debrid account verification | Not tested — unverified | Not supplied |
| Movie playback | Not tested — unverified | Not supplied |
| TV episode playback | Not tested — unverified | Not supplied |

Native Stremio handoff is **unverified**: no installed Stremio application/protocol handler was identified on the Windows verification machine. The generated private Stremio URI and HTTP manifest were verified automatically; this does not prove OS handoff.

1. On a machine with Stremio installed, open Lantern and unlock the dashboard.
2. Click **Install in Stremio** and accept the browser's external-application prompt.
3. Confirm Stremio displays the configured addon name and completes installation.
4. Confirm the addon appears in Stremio's installed addons. A successful installation does not guarantee a particular stream will play.

Live provider-account verification, playback, and real source uptime are **unverified** in this isolated production run. With an authorized test account, run **Test account**, then use Stremio to select a known playable movie and episode and confirm playback actually starts. Record the source, provider response, and any failure without including tokens or private URLs. Do not treat a successful account test as proof of playback.

Manual human interaction with zoom was not performed; zoom shortcuts and reachability assertions were automated, followed by visual screenshot inspection. Every populated dialog/subtab at all three native zoom levels remains outside the completed coverage.

## Documentation and release review — 2026-11-02

The report has one top-level title. All 22 distinct screenshot links below were fetched anonymously from GitHub at evidence commit `b4780f089aa3f9111e790f750e1302a82314eb7b`: every response succeeded, had a PNG signature, and exactly matched the local file. These are repository evidence files, not expiring Actions artifact links.

Reviewed the branch change list, application integration diff, validation workflow, and documentation changes. The current documentation finalization changes no application, layout, sidebar, dependency, deployment, or credential files. Added-line scanning found no private-key, GitHub-token, AWS-key, or JWT signatures. The credential-bearing URL match was an intentional `example.com` rejection-test fixture. This targeted review is not a guarantee that an exhaustive secret audit has been performed.

The [draft release summary](RELEASE_SUMMARY_DRAFT.md) is ready for review. Native Stremio handoff, live provider-account verification, and playback remain unverified. No merge, tag, image publication, release creation, or production update is authorized by this report.

See the [unpublished 0.1.3 release plan](RELEASE_PLAN_0.1.3.md) for version availability, workflow gates, image tags, update commands, and schema-aware rollback. Those operational steps have not been executed.

## Earlier application and frozen-layout checks (2026-10-30)

This pass changed verification scripts and refreshed screenshots, not the application layout. No publication, deployment, production data changes, or credential changes occurred.

| Check | Performed | Result |
| --- | --- | --- |
| Automated regression | `npm test` | 128 passed, 0 failed |
| Carousel | Actual Edge browser, isolated populated database | Arrows and keyboard focus reveal the final card completely; title, badges, year and rating fit the rail; arrows never overlay cards |
| Filters/sorting/history | All, Movies, TV Shows, date sorting, View all pagination | Passed |
| Details | Setup explanations, source timestamps/errors/previous results, Escape and focus return | Passed |
| Account testing | Overview button through real authenticated backend; controlled provider response | Stored provider token reaches the provider adapter; testing and verified states pass. Failure UI also tested |
| Saving/authentication | Save, persisted settings after refresh, dirty/saving/failed states, lock/unlock | Passed broad browser smoke; no unexpected JavaScript/CSP errors |
| Installation | Generated Stremio URI and HTTP manifest | URI matches private manifest; endpoint returns saved name. Native Stremio application handoff was not tested |
| Statistics | UI vs authenticated status endpoint and direct database count | Indexed observations, monitored count and active count matched |
| Source health | UI cells vs backend health records; operation-history regression | Current status/duration/count matched. Failed current results are unavailable; historical values remain separately labeled in Details |
| Database size | Endpoint vs direct SQL in isolated PGlite PostgreSQL engine | Exact match: 8,052,859 bytes. This is not a measurement of production or native PostgreSQL storage |
| Database-size lifecycle | Real HTTP/browser, mocked size values | Loading, unavailable, stale timestamp, recovery, no overlapping polling, hidden/locked tabs and multiple sessions passed |
| Metadata | Live Cinemeta enrichment into isolated database; DOM checked against persisted records | Titles, years, IMDb ratings and artwork URLs matched; eight images loaded |
| Edge cases | Long titles, missing metadata/artwork/rating, empty/loading, timeout and API failure/recovery | Passed |
| Layout | Actual viewport screenshots at all four target sizes | No vertical page scrolling or action overlap; sidebar geometry and cropped PNGs identical to restored baseline |
| Zoom fallback | Reduced CSS viewports, including mobile sizes | Passed. The initial actual-zoom attempt failed; native zoom was subsequently verified in CI as documented above |
| Production build | Local Docker availability checked | Initially blocked locally; subsequent native AMD64/ARM64 production builds passed in CI as documented above. There is no separate frontend compilation script |
| Cleanup | Reviewed feature CSS and references | No additional production code was demonstrably unused; nothing speculative removed. Temporary zoom probe removed |

Source status fixtures and provider responses are controlled test data. Live Cinemeta access is the only external-service verification in these browser checks. No claim is made about a real provider account or production source uptime.

Visually inspected viewport captures:

- [1280 × 720](images/overview-media-viewport-1280.png)
- [1366 × 768](images/overview-media-viewport-1366.png)
- [1536 × 864](images/overview-media-viewport-1536.png)
- [1920 × 1080](images/overview-media-viewport-1920.png)

Additional commands run: `node scripts/latest-titles-browser.mjs --live`, `node scripts/browser-smoke.mjs`, `node scripts/overview-review.mjs`, `node scripts/database-size-browser.mjs`, and `git diff --check`.

The initial Docker and actual-zoom gaps were resolved by the production verification above. Native Stremio installation, live account verification, and playback still require the manual checks listed above.

## Frozen-layout follow-up

No application or styling files were changed in this follow-up. The browser suite now asserts that Overview containers have no concealed vertical overflow (scroll height does not exceed client height), in addition to checking document height and action-bar overlap. All four target sizes pass, and sidebar PNG comparisons remain identical.

The six focused source-health/catalog regressions, broad browser smoke, direct database-size comparison and polling regressions were rerun successfully. The full 128-test suite passed in the preceding verification; no application changes followed it. `docker build --tag lantern:verification .` was attempted and failed to start because the Docker command is unavailable.

The live-artwork capture explicitly traverses to the end and back using mouse arrows and keyboard activation. End screenshots use the supported reduced-motion setting to avoid test-clock/compositor timing races; normal smooth scrolling is exercised earlier in the fixture suite. The first capture attempt timed out on an arrow that became disabled during scrolling, so the capture sequence now resets its start position before each viewport.

The completed round-trip run passed after the test loop was corrected to check actual scroll position instead of a briefly stale button-disabled state. No application defect or layout change was needed. All four final-card captures were visually inspected; The Matrix and its 8.7 IMDb rating are completely visible, with the next arrow outside the card. Return-to-start was asserted after both input methods.

| Viewport | Mouse end | Keyboard end | Returned to start |
| --- | --- | --- | --- |
| 1280×720 | [Capture](images/overview-end-arrows-1280.png) | [Capture](images/overview-end-keyboard-1280.png) | [Capture](images/overview-returned-1280.png) |
| 1366×768 | [Capture](images/overview-end-arrows-1366.png) | [Capture](images/overview-end-keyboard-1366.png) | [Capture](images/overview-returned-1366.png) |
| 1536×864 | [Capture](images/overview-end-arrows-1536.png) | [Capture](images/overview-end-keyboard-1536.png) | [Capture](images/overview-returned-1536.png) |
| 1920×1080 | [Capture](images/overview-end-arrows-1920.png) | [Capture](images/overview-end-keyboard-1920.png) | [Capture](images/overview-returned-1920.png) |

# Latest Movies & TV Shows

This Overview-only panel lists unique IMDb movie and series identities already
present in Lantern's PostgreSQL release observations. It is not a trending feed,
an automatic discovery scheduler, or proof of playback availability. Unmatched
DMM candidates without a movie/episode identity are not shown. Episodes are grouped
under their series; duplicate sources do not create duplicate cards.

## Dates and metadata

Migration 6 adds a catalog and a transactional release-write trigger. New identities
retain their first indexing timestamp across later observations. Existing rows are
backfilled from their earliest retained observation and explicitly marked estimated.
No existing release, credential, or configuration record is removed.

“Newly indexed” means a precise first-indexed timestamp within the preceding seven
days. Estimated dates and future timestamps never receive that badge. Recently
Added orders by first-recorded date, with a stable identity tie-breaker. Newly
Released includes known release dates within the last 90 days; for TV this means
the series premiere, not a new episode. Title details explain the date provenance.

Cinemeta supplies metadata and artwork by exact type and IMDb identity. The existing
search cache holds only name/year, so the panel has a separate persistent cache
for artwork, descriptions and explicitly labeled IMDb ratings. Metadata is retained
for seven days; failed lookups retry after 15 minutes. Each enrichment batch has at
most four titles, two concurrent requests, five-second timeouts and a 2 MiB response
limit. Batches run at most once per 30 seconds while the endpoint is requested.
Missing artwork, years and ratings are labeled rather than invented.

The administrator-only `/api/latest-titles` endpoint accepts `type` (all/movie/series),
`view` (added/released), `offset`, and `limit` (1–48). Lists have a bounded five-second
cache. Overview refreshes every 30 seconds while visible and unlocked, with no
overlapping requests. Details remain open during refreshes. View all opens an
accessible, paginated dialog. Failed refreshes retain existing results with a stale
warning. No additional account or API key is required.

## Compact desktop review — October 30, 2026

The Overview layout reserves the existing 80px header and 88px action bar. Desktop rows are intrinsic, with no viewport-height panel minimum or growing health rows. Overview-specific styles are consolidated in `public/overview.css`; navigation and sidebar rules are unchanged.

The previous layout combined tall two-line status rows, responsive padding, and an action bar placed after the expanded content. It could not fit within the laptop height budget. Compact desktop rows now show every source and setup status together. The Details buttons open native keyboard-accessible dialogs containing supporting explanations, source timestamps, and configuration notes. Smaller/zoomed viewports retain expanded supporting text and accessible document scrolling.

Measured panel heights after height-responsive refinement: 179px at 1280×720 and 1366×768, approximately 239px at 1536×864, and 325px at 1920×1080. Both panels match in height. Section gaps are 6px on shorter desktops and 12px otherwise. Bounded CSS variables increase padding and row spacing with viewport height, without growing flex rows. Cards are 160px wide on short desktops, approximately 190px at 864px height and 220px at 1080px height. Their 2:1 artwork, two title lines and aligned metadata remain unchanged. No font sizes were reduced. Missing year/rating values use a dash with accessible labels and tooltips; details retain the full unavailable-state explanation. Landscape artwork is preferred; portrait fallbacks are contained rather than cropped.

Actual 100% viewport screenshots, using isolated indexed identities and live Cinemeta artwork:

- [1280×720](images/overview-media-viewport-1280.png)
- [1366×768](images/overview-media-viewport-1366.png)
- [1536×864](images/overview-media-viewport-1536.png)
- [1920×1080](images/overview-media-viewport-1920.png)

All four captures were visually inspected: all required sections and actions are visible, without vertical scrolling or action-bar overlap. Sidebar geometry and cropped PNGs are identical to the restored baseline at each size. Partial edge cards indicate more content in the horizontally navigable carousel. Larger viewports retain free space below the compact content rather than stretching rows.

Checks performed after this adjustment:

- Six catalog/metadata/authentication/source-health tests passed. Source checks use isolated PostgreSQL data and controlled upstream success/failure, including repeated failure and recovery.
- Dedicated browser checks passed for responsive layout, long titles, missing artwork/metadata, loading/empty/error/timeout/recovery, keyboard arrows, filtering/sorting, View all pagination, detail persistence, and polling lifecycle. At every tested viewport, keyboard-operated arrows and direct keyboard focus reveal the final card completely. Desktop action focus outlines and footer text fit within the viewport.
- Live Cinemeta metadata and eight artwork images loaded on retry; the first remote-artwork run timed out. Remote availability is not guaranteed.
- Overview geometry, eight visible status rows, Details dialogs, and no page scrolling passed at all four target sizes. Populated health fixtures include success, latency/results, and an error with a long diagnostic; the error and last-checked information remain accessible in Details. Reduced CSS viewport checks cover the scrolling fallback used at zoom; browser toolbar zoom was not separately exercised.
- Broad browser workflow regression passed with no unexpected JavaScript/CSP errors. Repeated viewport scenarios now reset the isolated test request budget; the initial run exhausted its rate limit.
- Database-size browser regression passed (mocked size query, real HTTP/browser).
- Docker production build could not run: Docker is unavailable here. This project has no separate frontend compilation script.

Relevant review commands: `node scripts/overview-review.mjs`, `node scripts/latest-titles-browser.mjs --live`, `node scripts/browser-smoke.mjs`, `node scripts/database-size-browser.mjs`, and `node --test test/latest-titles.test.mjs`.

This adjustment changes Overview CSS, its supporting Details component, compact missing-metadata labels, browser checks, and screenshots/documentation. PostgreSQL, search, playback, indexing and configuration behavior were not changed by this adjustment. No publication or production update was performed.

### Final health and interaction checks

The final pass preserves the layout and sidebar. Failed source operations now retain their last successful measurement separately. The Results column shows only counts from a successful current operation; unavailable current results display a dash. Details labels historical counts as Previous results with their successful timestamp and previous latency. The failed operation's measured duration remains its current latency. Legacy error records containing a count are treated as historical, with an explicit unavailable timestamp where necessary. No historical values are represented as a current success.

Both native Details dialogs expose setup explanations and source timestamps/error diagnostics, close with Escape, and explicitly restore focus to their opening button. Browser assertions verify that arrows never overlap the carousel rail, and the final card's title, badge, year and rating become fully visible through arrow and keyboard navigation. The four refreshed screenshots contain isolated database records enriched with live Cinemeta artwork; source-health values are controlled test fixtures, not production observations.

Production image compilation remains blocked by unavailable Docker. Reduced CSS viewport scrolling fallback was exercised; browser-toolbar zoom remains a separate unverified check. No deployment or publication occurred.

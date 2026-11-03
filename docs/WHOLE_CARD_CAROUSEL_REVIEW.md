# Whole-card carousel review

Original pre-release review; publication was subsequently authorized and completed as [0.1.5](RELEASE_0.1.5.md). No production deployment was performed. Checkpoint: checkpoint/before-whole-card-groups. Application revision: 9f3f604268ec57046599a1129c867a402e0c96ff.

## Cause and correction

The flex track previously consumed every remaining pixel, even when its width represented a fractional number of fixed-width cards. Arrow code estimated a page size without sizing the visible track to match. It also used a hardcoded gap.

The track now measures the existing responsive card width, actual CSS gap, internal padding, rail width and both arrow gutters. It fits an integer number of unchanged cards and centers the resulting track. Arrows traverse explicit group starts; the final group overlaps the previous group when necessary to reveal the last card completely. Previous retraces the same groups. Tab, arrow keys and Home/End expose the focused card. ResizeObserver and synchronous rendering realign after resizing, filtering, sorting and new data.

An expanded CI check exposed a filter/scroll-snap race: retaining the old scroll position until a later animation frame could open a shorter filtered list at its end. Filter resets now take effect in the same render, before native scroll snapping; arrow calculations read the actual scroll position. The earlier failed run is [41637770066](https://github.com/jtechbyte/lantern/actions/runs/41637770066). A second transition check exposed stale scroll-position bookkeeping. The final implementation removes that separate position counter and derives navigation/resize anchors from the actual track. Empty filtered lists also update arrow disabled states immediately. Temporary tracing was removed.

The prior focus outline projected outside the card, and hover translated/brightened the whole card. Hover/selected states now use a restrained amber border without a shadow, transform or brightness filter. Keyboard focus uses a 2px inner rounded ring above the artwork; visual inspection caught and corrected the artwork obscuring an initial inward outline. No blur was removed from the legitimate portrait-artwork backdrop. Track padding/scroll-padding rules were consolidated into latest-titles.css instead of layered Overview overrides.

## Actual checks

- Local node --test: 131 passed.
- node scripts/latest-titles-browser.mjs --live: passed with isolated PostgreSQL fixtures (16 titles; 12 in the main carousel and 8 in TV Shows), plus eight actual provider metadata/artwork responses. Every loaded card fully reachable through arrows and keyboard; start/middle/end and reverse-group assertions passed. Additional records remain accessible in View all.
- First/middle/last hover, selected (details open) and keyboard-focus states checked at all four sizes. Focus ring stays inside its card; no shadow or transform. Long titles, missing artwork/ratings, filters, sorting, history, details persistence, arriving records, polling pause, timeout and failure recovery passed. No unexpected console errors or JavaScript exceptions; expected injected API503 and provider artwork404 are identified in the test.
- node scripts/carousel-metadata-browser.mjs: controlled delayed images, fallback, retry/recovery, metadata states, removed badges and arrow centering passed.
- node scripts/overview-review.mjs before/after: sidebar geometry and cropped PNGs byte-identical at all four sizes. No desktop vertical scroll, concealed vertical overflow, footer overlap or card-size changes. Smaller viewport scrolling fallback remains available.
- Native production build and container checks: [non-publishing workflow 41639411573](https://github.com/jtechbyte/lantern/actions/runs/41639411573) passed on both AMD64 and ARM64. Each runner passed all 131 tests, the whole-card browser suite, production Dockerfile build, final frontend hash checks, isolated PostgreSQL startup/login/save/restart/recreation and metadata persistence, backup/restore, local-CA Caddy HTTPS, and actual 125%/150%/200% browser zoom. Docker is unavailable on this Windows host, so production verification used those isolated native runners. Exact commands are in the workflow; full logs are retained there and locally in artifacts/whole-card-production.log.

## Viewport captures

These are actual 100% viewport captures, not resized full-page images. Start/middle/end, TV and focus captures use controlled records without artwork to exercise fallback and long-title behavior. Live-artwork captures use an isolated eight-title catalog with real Cinemeta responses; source health remains a controlled fixture. No sample data was added to production. At 1920 there are two groups for 12 cards, so middle and end refer to the same second group.

| Viewport | Whole cards | All groups | TV Shows | Focus / live artwork |
| --- | --- | --- | --- | --- |
| 1280 x 720 | 5 | [Start](images/whole-card-groups/all-1280x720-group-0.png) / [Middle](images/whole-card-groups/all-1280x720-group-1.png) / [End](images/whole-card-groups/all-1280x720-group-2.png) | [TV end](images/whole-card-groups/tv-1280x720-group-1.png) | [Focus](images/whole-card-groups/all-1280x720-card-11-focus.png) / [Live artwork](images/whole-card-groups/live-end-1280x720.png) |
| 1366 x 768 | 5 | [Start](images/whole-card-groups/all-1366x768-group-0.png) / [Middle](images/whole-card-groups/all-1366x768-group-1.png) / [End](images/whole-card-groups/all-1366x768-group-2.png) | [TV end](images/whole-card-groups/tv-1366x768-group-1.png) | [Focus](images/whole-card-groups/all-1366x768-card-11-focus.png) / [Live artwork](images/whole-card-groups/live-end-1366x768.png) |
| 1536 x 864 | 5 | [Start](images/whole-card-groups/all-1536x864-group-0.png) / [Middle](images/whole-card-groups/all-1536x864-group-1.png) / [End](images/whole-card-groups/all-1536x864-group-2.png) | [TV end](images/whole-card-groups/tv-1536x864-group-1.png) | [Focus](images/whole-card-groups/all-1536x864-card-11-focus.png) / [Live artwork](images/whole-card-groups/live-end-1536x864.png) |
| 1920 x 1080 | 6 | [Start](images/whole-card-groups/all-1920x1080-group-0.png) / [Middle](images/whole-card-groups/all-1920x1080-group-1.png) / [End](images/whole-card-groups/all-1920x1080-group-1.png) | [TV end](images/whole-card-groups/tv-1920x1080-group-1.png) | [Focus](images/whole-card-groups/all-1920x1080-card-11-focus.png) / [Live artwork](images/whole-card-groups/live-end-1920x1080.png) |

Full normal/hover/selected/focus captures for first, middle and last cards are in artifacts/whole-card-groups/ and the CI artifacts.

## Scope and limitations

Changed application files: public/latest-titles.js, public/latest-titles.css and one removed duplicate track rule in public/overview.css. Tests: scripts/latest-titles-browser.mjs and scripts/whole-card-groups-browser.mjs; non-publishing CI runs the new browser checks. No backend/API, indexing, data, authentication, playback, dependency, card artwork or sidebar changes. Existing published 0.1.4 is untouched. Native Stremio handoff, real provider-account verification and movie/episode playback remain unverified and outside this focused change.

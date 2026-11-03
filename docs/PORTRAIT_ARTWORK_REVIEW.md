# Portrait artwork review

Local refinement of the carousel metadata fix, November 2, 2026 (response evidence timestamp is UTC November 3). Not pushed, merged, tagged, released, or deployed.

## Change

A working same-record landscape background remains first choice. When it fails and a portrait poster loads, the foreground keeps `object-fit: contain` at the existing artwork dimensions. An aria-hidden decorative layer uses that exact loaded poster URL, with blur, darkening and reduced opacity. Only the decorative layer is cropped to fill; the foreground poster is fully visible. No generated artwork, unrelated-title substitution, new image service, dependency, or stored bitmap was added.

Application changes are limited to `public/latest-titles.js` and `public/latest-titles.css`. Sidebar, arrow positioning, card dimensions, filters, removed Movie/TV Show overlays and unavailable-rating behavior are unchanged. Recoverable local checkpoint: `checkpoint/before-portrait-backdrop`.

## Fresh live checks of the affected IDs

A new disposable PGlite database contained exactly these two identities. Checks called Lantern's authenticated endpoint, waited for its real metadata enrichment, compared the returned data, requested each actual image URL, and verified each rendered card. This is not inferred from an eight-title screenshot.

| IMDb ID | Actual metadata | Actual image responses | Browser rendering |
| --- | --- | --- | --- |
| tt39773403 | The Canvas, 2026; no rating | Background 404, poster 200 JPEG | Full 300 x 431 poster, contain; blurred layer uses identical poster URL; rating is an unavailable dash |
| tt10377864 | Beware Boiuna, 2026; IMDb 6.1 | Background 200, poster 200 JPEG | Preferred 1280 x 720 landscape background; no portrait blur layer |

Both primary metadata URLs returned HTTP 307 to their exact `cinemeta-live.strem.io` paths. Lantern followed its previously implemented exact allowlist and returned fresh normalized metadata for both identities. Full URLs, timestamps, responses, metadata and rendered-source measurements are in [evidence.json](images/portrait-review/evidence.json). Provider data and availability can change; no production cache was inspected or modified.

## Cache storage (unchanged)

- Persistent metadata lives in PostgreSQL's `indexed_titles` table, keyed by `movie/<IMDb ID>` or `series/<IMDb ID>`. The `metadata` JSONB stores title, artwork URLs, year/date, description, rating/provenance, and internal `_lookup` state/attempts/check time. `metadata_at` records successful measurement time; `next_metadata_at` records eligibility for another request. This survives restarts. Internal `_lookup` is omitted from returned metadata.
- Successful metadata refreshes after seven days. Transient failures retry from 30 seconds to a 15-minute cap. Empty/404 metadata replies retry after one day. Metadata without either artwork URL retries from 15 minutes up to six hours. Successful previous values remain available and become stale after a failed refresh.
- Each server process holds up to 30 list-query cache entries for five seconds; these are not persisted. Enrichment remains four titles per batch, two concurrent requests, no more than one batch per 30 seconds per process. The browser polls while visible and unlocked.
- Image bytes are fetched directly by the browser from provider URLs and may use normal HTTP/browser caching. Lantern does not download them into PostgreSQL, a Docker volume, or an application disk cache. The blurred background is a CSS rendering of the same poster URL, not a new file.
- The browser's in-memory failed-image map tracks up to 256 URLs with one-minute exponential backoff capped at 15 minutes. It survives card re-renders in that page, but not a full page reload. No image retry state is added to localStorage or sessionStorage.

## Verification performed

- `node --test test/latest-titles.test.mjs test/metadata-redirect.test.mjs`: 8 passed, zero failed.
- `node scripts/carousel-metadata-browser.mjs`: controlled background failure, delayed poster load, same-URL blur, foreground containment, retry/recovery, metadata states, removed type overlays and artwork-centered arrows passed. No JavaScript exceptions. Controlled HTTP503 errors are expected.
- `node scripts/portrait-artwork-review.mjs`: real provider responses and rendered images for both IDs passed. All four target desktops have equal card/artwork heights, no vertical scrolling, unchanged sidebar geometry and no content-type overlays. All captures visually inspected; no stretching or foreground crop. The source poster for The Canvas is dark, so its derived background is deliberately subtle.
- No new production build was run for this frontend-only refinement. Prior production verification is documented in [the preceding report](CAROUSEL_METADATA_FIX.md); it does not certify this uncommitted refinement. No deployment or publication occurred.

## Actual viewport captures

These show only the two explicitly retested titles in isolated test data; other dashboard values are not production values.

- [1280 x 720](images/portrait-review/viewport-1280x720.png)
- [1366 x 768](images/portrait-review/viewport-1366x768.png)
- [1536 x 864](images/portrait-review/viewport-1536x864.png)
- [1920 x 1080](images/portrait-review/viewport-1920x1080.png)

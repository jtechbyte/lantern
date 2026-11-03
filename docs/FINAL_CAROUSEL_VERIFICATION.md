# Final carousel verification - November 3, 2026

This report supersedes the production-build limitation in [Portrait artwork review](PORTRAIT_ARTWORK_REVIEW.md). The approved Overview and sidebar remain unchanged. No release, image publication, merge, or production deployment is authorized.

## Focused cleanup and confirmed defect

- Consolidated duplicate `.latest-badge` rule declarations without changing computed styles.
- Removed the duplicate metadata font-size declaration, retaining the inherited identical value.
- Simplified a repeated artwork fallback conditional.
- Removed the obsolete type-overlay selector from the card-visibility test; retained the useful assertion that overlays are absent.
- Preserved tests, provider evidence, portrait fallback documentation and intentional responsive/dialog styles. No dependencies, APIs, authentication, indexing, playback, settings or schema changes.
- Stronger testing discovered a partially visible middle card could receive keyboard focus without revealing its full width. A carousel-local focus handler now reveals only clipped focused cards and synchronizes arrow disabled states immediately. Card dimensions, arrow positioning and sidebar styles are unchanged.
- Corrected the browser fixture's PUBLIC_URL to its actual loopback origin. The prior mismatched fixture produced a legitimate origin-protection 403 on Appearance preview. No application authentication rules were changed.

## Local verification after cleanup

- Full `node --test`: 131 passed, zero failed.
- `node scripts/carousel-metadata-browser.mjs`: controlled image fallback, delayed loading, same-poster blur, unavailable states, retry/recovery and arrow alignment passed.
- `node scripts/latest-titles-browser.mjs --live`: overflowing fixture catalog (16 records, 12 on the main carousel) and eight live-provider identities. Every card checked for complete visibility, including intermediate cards. Mouse arrows and keyboard-operated arrows traverse the live collection to its end and back. Filters, sorting, View all, dialog persistence, error/timeout recovery and polling lifecycle passed.
- `node scripts/overview-review.mjs`: four desktop layouts, setup/source detail dialogs and unchanged sidebar geometry passed.
- Console inspection distinguishes expected injected `/api/latest-titles` HTTP503 and the provider's known Canvas background HTTP404 from unexpected errors. The latter successfully falls back to the matching poster. No JavaScript exceptions or unexpected console errors remained after correcting the fixture origin.

## Production verification

Pending the non-publishing native AMD64/ARM64 workflow for the final source revision. The workflow runs `npm ci`, `npm test`, the production Dockerfile build, and `VERIFY_BROWSER_ZOOM=1 xvfb-run -a -s "-screen 0 1600x1200x24" node scripts/container-smoke.mjs lantern:verification`.

The expanded smoke test compares SHA-256 hashes of shipped `public/latest-titles.js` and `public/latest-titles.css` to the checked-out revision. Disposable PostgreSQL fixtures represent fresh metadata, failed lookups and stale retained metadata. Exact stored JSON, original success timestamps, attempt counts and retry deadlines are compared before/after application restart, forced container recreation and database restart; authenticated endpoint state is checked too. No production records are used.

## Storage and caching

Metadata and retry deadlines persist in PostgreSQL `indexed_titles.metadata`, `metadata_at`, and `next_metadata_at`. List-query caching is process memory (five seconds, at most 30 entries). Image bytes are browser-managed HTTP cache data, not PostgreSQL blobs or Lantern disk files. CSS derives the blurred layer from the same loaded poster URL. Image-failure backoff is page memory only and resets on a full page reload. See [cache details](PORTRAIT_ARTWORK_REVIEW.md#cache-storage-unchanged).

## Final viewport evidence

All four 100% desktop viewports are captured with an overflowing live-metadata collection. Partial edge cards are intentional; final-position captures demonstrate full access. No vertical scrolling, hidden vertical overflow, text reduction, sidebar change or footer overlap is used to fit the layout.

| Viewport | Start | Final card via keyboard |
| --- | --- | --- |
| 1280 x 720 | [Viewport](images/carousel-final/viewport-1280x720.png) | [End](images/carousel-final/end-1280x720.png) |
| 1366 x 768 | [Viewport](images/carousel-final/viewport-1366x768.png) | [End](images/carousel-final/end-1366x768.png) |
| 1536 x 864 | [Viewport](images/carousel-final/viewport-1536x864.png) | [End](images/carousel-final/end-1536x864.png) |
| 1920 x 1080 | [Viewport](images/carousel-final/viewport-1920x1080.png) | [End](images/carousel-final/end-1920x1080.png) |

## Remaining limitations

Native Stremio installation/handoff, real provider-account verification, movie playback and episode playback remain **Not tested - unverified**. Provider artwork/metadata availability can change; Canvas currently has no working landscape image or rating. Tests use isolated data and controlled source-health states, not the user's running installation. No claim of complete application verification is made. Publication remains withheld.

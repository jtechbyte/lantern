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
- `node scripts/latest-titles-browser.mjs --live`: overflowing fixture catalog (16 records, 12 on the main carousel) and eight live-provider identities. Actual Tab navigation checked every card for complete visibility, including intermediate cards. Mouse arrows and keyboard-operated arrows traverse the live collection to its end and back. Filters, sorting, View all, dialog persistence, error/timeout recovery and polling lifecycle passed.
- `node scripts/overview-review.mjs`: four desktop layouts, setup/source detail dialogs and unchanged sidebar geometry passed. Cropped sidebar PNGs were byte-identical to the restored baseline at all four sizes.
- Console inspection distinguishes expected injected `/api/latest-titles` HTTP503 and the provider's known Canvas background HTTP404 from unexpected errors. The latter successfully falls back to the matching poster. No JavaScript exceptions or unexpected console errors remained after correcting the fixture origin.

## Production verification

Final tested source: [`ea370b90a2971b87d31e3dd9bd66af222f76a678`](https://github.com/jtechbyte/lantern/commit/ea370b90a2971b87d31e3dd9bd66af222f76a678). [Non-publishing workflow 41615355048](https://github.com/jtechbyte/lantern/actions/runs/41615355048) completed successfully on native AMD64 and ARM64. Each runner passed all 131 tests, built the production image, confirmed final frontend file hashes, and passed isolated PostgreSQL container verification. The workflow runs `npm ci`, `npm test`, the production Dockerfile build, and `VERIFY_BROWSER_ZOOM=1 xvfb-run -a -s "-screen 0 1600x1200x24" node scripts/container-smoke.mjs lantern:verification`.

The expanded smoke test compares SHA-256 hashes of shipped `public/latest-titles.js` and `public/latest-titles.css` to the checked-out revision. Disposable PostgreSQL fixtures represent fresh metadata, failed lookups and stale retained metadata. Exact stored JSON, original success timestamps, attempt counts and retry deadlines were identical before/after application restart, forced container recreation and database restart; authenticated endpoint fresh/failed/stale state also passed. Startup, login, settings persistence, database failure/recovery, backup/restore, and actual 125%/150%/200% browser zoom passed on both architectures. No production records were used.

The [first run](https://github.com/jtechbyte/lantern/actions/runs/41614685082) built both images but failed the new persistence fixture baseline: a prior browser poll had cached the empty list for five seconds. The test now waits 5.5 seconds after inserting its isolated records before checking the baseline. The final rerun passed without changing application cache behavior.

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

Native Stremio installation/handoff, real provider-account verification, movie playback and episode playback remain **Not tested - unverified**. Provider artwork/metadata availability can change; Canvas currently has no working landscape image or rating. On November 3, the provider changed `tt10377864` from the previously observed Beware Boiuna (2026, 6.1) to Titanoboa (2022, no rating). Final screenshots match that current response, not hardcoded earlier values; [recorded provider response](images/carousel-final/provider-response.json). Tests use isolated data and controlled source-health states, not the user's running installation. No claim of complete application verification is made. Publication remains withheld.

## Readiness

The focused feature is ready for release review with the manual limitations above explicitly retained. Application/frontend code is frozen at the tested revision. Later documentation-only updates do not alter the tested files. Main, release tags, registry images and the running server remain unchanged. Only the review branch was pushed to run non-publishing CI.

## Production Compose standardization - November 3, 2026

The recoverable local checkpoint is `checkpoint/before-compose-standardization`. Production deployment is now `docker-compose.yml`; the source-build deployment is `docker-compose.build.yml`. Both complete files preserve the original parsed configuration exactly: only filenames, comments and blank-line formatting changed. The old default `compose.yaml` was renamed so plain Compose commands cannot silently select a local build instead of the production image.

The service names, volume keys, legacy read-only mount, environment settings, loopback binding, optional HTTPS profile, security/resource limits and restart policies are unchanged. No top-level project name, explicit volume name or container name was introduced. Lantern retains its image-provided database-aware HEALTHCHECK. No application, frontend, sidebar, Dockerfile, dependency or schema changes were made for this task.

README, environment reference, setup output, installation/source-build instructions, backup/restore/rollback commands, release-plan references and CI smoke tests use the new filenames. The migration guide explains retaining the actual project name through `COMPOSE_PROJECT_NAME` or `-p`, preserving private overrides, and handling older release archives that still contain the previous filenames. It does not advise deleting data or replacing credentials.

Local checks: all 131 tests passed; both Compose files parsed identically to the checkpoint; 45 relative links in changed documentation resolved; `git diff --check` passed; application/frontend diff against the checkpoint was empty. The changed files were reviewed for unintended changes; no real credentials were added.

Native validation source: [`ed059643df3ec7265f81166ced3d79eeba76b149`](https://github.com/jtechbyte/lantern/commit/ed059643df3ec7265f81166ced3d79eeba76b149). [Non-publishing workflow](https://github.com/jtechbyte/lantern/actions/runs/41619195825). Both native AMD64 and ARM64 jobs completed successfully. Each passed all 131 tests, built the production Dockerfile and passed the expanded isolated smoke test.

| Check | Actual result on both architectures |
| --- | --- |
| Default and HTTPS Compose configuration | Passed; PostgreSQL has no host port, Lantern remains loopback-bound, project-prefixed volume names preserved. |
| Image health check and startup | Passed; non-root image initialized PostgreSQL, became healthy and provided working login. |
| Save and refresh | Passed; saved settings, redacted credentials and installation identity retained. |
| Restart and recreation | Passed for Lantern restart/forced recreation and PostgreSQL restart; metadata and retry deadlines also retained. |
| Compose filename change | Passed with the same explicit project name; persisted settings and metadata reused. |
| Backup and restore | Native pg_dump/pg_restore into a separate disposable database passed. |
| Optional Caddy HTTPS | Profile startup, Caddy config validation, dependency on healthy Lantern, and HTTPS /healthz with explicit local-CA trust passed. |
| Database accuracy/recovery | Endpoint and direct SQL both returned 8,165,043 bytes at baseline on each architecture; growth, stale-state outage and recovery checks passed. |
| Frontend and accessibility regression | Final shipped JS/CSS hashes matched source; browser login/save/logout, responsive metrics and actual 125%/150%/200% zoom checks passed. |

Commands: `npm ci`, `npm test`, `docker build --tag lantern:verification --build-arg VERSION=0.1.3 --build-arg REVISION=$GITHUB_SHA --build-arg CREATED=<UTC timestamp> .`, then `VERIFY_BROWSER_ZOOM=1 xvfb-run -a -s "-screen 0 1600x1200x24" node scripts/container-smoke.mjs lantern:verification`. The exact runnable build command is in the linked workflow. Full logs are retained by that run; the local copy is `artifacts/compose-production-validation.log` (untracked). Subsequent documentation-only edits do not change the tested configuration or scripts.

The smoke command uses temporary random credentials, an explicit random project and disposable volumes. It runs `docker compose -f docker-compose.yml config --quiet` (with that temporary project/directory), validates the HTTPS profile configuration, and selects the newly built image using `LANTERN_IMAGE=lantern:verification`. This is a production-image build test, not a new anonymous pull test of the previously published 0.1.3 tag. Caddy uses localhost and a test-local CA; the probe trusts that CA explicitly rather than disabling TLS verification. Public DNS, ACME issuance, real-domain routing and the user's firewall remain unverified.

Only the review branch is pushed for non-publishing CI. No merge, tag, GitHub release, registry publication or update of the running installation occurs. The manual Stremio/provider/movie/episode limitations above remain unchanged.

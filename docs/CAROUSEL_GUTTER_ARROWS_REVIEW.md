# Carousel gutter arrows review

Historical pre-release review. Publication was subsequently authorized and completed in [0.1.6](RELEASE_0.1.6.md). No production deployment was performed. Checkpoint: checkpoint/before-gutter-arrows. Tested application revision: 3b9b79e0a84cedb6cb9d34bf6a75a74723e30999.

## Focused correction

The arrows previously occupied the flex rail's outer ends and used an artwork-only vertical offset. They now use measured track padding and rail/track bounds to find each empty gutter's midpoint. Horizontal positions are relative percentages, so a narrower viewport cannot retain an out-of-bounds pixel coordinate before ResizeObserver realigns the track. CSS centers the buttons vertically within the rail, whose height is the full card plus symmetric track padding. The old artwork offset was removed. Whole-card sizing, group navigation and card dimensions are unchanged.

The existing dashboardIcon helper now includes a filmstrip path; only the Latest heading uses it. Existing icon size, stroke and amber styling are retained. Arrow hover uses the card's amber border and dark background; a contained inset focus outline does not shift the button. Disabled buttons retain native disabled behavior and muted styling, with pointer events disabled. No glow or brightness filter is applied.

## Verification

- node --test: 131 passed.
- node scripts/latest-titles-browser.mjs --live: passed with isolated PostgreSQL, 16 fixture records (12 main / 8 TV) and eight actual provider metadata/artwork responses. Arrows and keyboard reach every loaded card in both directions. Start/middle/end, filtering, sorting, resize, new data, long titles, missing metadata, error recovery and dialogs passed.
- Geometry assertions verify both arrow centers within 1px of measured gutter and full-card centers, centered chevrons, and no card overlap. Hover and keyboard-focus checks verify contained styling without movement.
- node scripts/carousel-metadata-browser.mjs: passed delayed/failing images, matching alternate artwork, recovery and full-card arrow centering.
- node scripts/overview-review.mjs --baseline and after: passed; all four sidebar geometry sets and cropped PNGs are identical. No vertical desktop overflow or footer overlap; small-screen scrolling remains accessible.
- Console: no unexpected JavaScript or console errors. Expected injected API503 and the existing provider404 for The Canvas landscape image were observed; its matching portrait fallback works.
- Production checks: [non-publishing native workflow](https://github.com/jtechbyte/lantern/actions/runs/41649419847); passed on native AMD64 and ARM64: 131 tests per runner, whole-card browser suite, production Dockerfile build, final frontend checks, isolated PostgreSQL startup/login/save/restart/recreation, backup/restore, local-CA Caddy HTTPS and actual 125%/150%/200% browser zoom. Docker is not available locally.

## Actual viewport screenshots

Visually inspected at 100% viewport size. Live captures use isolated database records with real provider artwork; source health is controlled test data. Fixture captures exercise complete groups, TV filtering and focus states. No sample data was added to production. The reference's full-card-centered gutter composition is preserved; existing card sizes, visible-card counts and dashboard proportions intentionally remain unchanged.

| Viewport | Live artwork | Overflowing groups | TV and focus |
| --- | --- | --- | --- |
| 1280x720 | [Start](images/gutter-arrows/live-start-1280x720.png) / [End](images/gutter-arrows/live-end-1280x720.png) | [Start](images/gutter-arrows/all-1280x720-group-0.png) / [Middle](images/gutter-arrows/all-1280x720-group-1.png) / [End](images/gutter-arrows/all-1280x720-group-2.png) | [TV end](images/gutter-arrows/tv-end-1280x720.png) / [Focus](images/gutter-arrows/focus-1280x720.png) |
| 1366x768 | [Start](images/gutter-arrows/live-start-1366x768.png) / [End](images/gutter-arrows/live-end-1366x768.png) | [Start](images/gutter-arrows/all-1366x768-group-0.png) / [Middle](images/gutter-arrows/all-1366x768-group-1.png) / [End](images/gutter-arrows/all-1366x768-group-2.png) | [TV end](images/gutter-arrows/tv-end-1366x768.png) / [Focus](images/gutter-arrows/focus-1366x768.png) |
| 1536x864 | [Start](images/gutter-arrows/live-start-1536x864.png) / [End](images/gutter-arrows/live-end-1536x864.png) | [Start](images/gutter-arrows/all-1536x864-group-0.png) / [Middle](images/gutter-arrows/all-1536x864-group-1.png) / [End](images/gutter-arrows/all-1536x864-group-2.png) | [TV end](images/gutter-arrows/tv-end-1536x864.png) / [Focus](images/gutter-arrows/focus-1536x864.png) |
| 1920x1080 | [Start](images/gutter-arrows/live-start-1920x1080.png) / [End](images/gutter-arrows/live-end-1920x1080.png) | [Start](images/gutter-arrows/all-1920x1080-group-0.png) / [Middle](images/gutter-arrows/all-1920x1080-group-1.png) / [End](images/gutter-arrows/all-1920x1080-group-1.png) | [TV end](images/gutter-arrows/tv-end-1920x1080.png) / [Focus](images/gutter-arrows/focus-1920x1080.png) |

At 1920 the 12-card main catalog has two groups; middle and end are the same group. Full hover/selected evidence remains in artifacts/whole-card-groups and CI artifacts.

Native Stremio handoff, real provider-account verification and movie/episode playback remain Not tested - unverified. APIs, authentication, indexing, metadata retrieval, saved settings and production data were not changed.

## Frozen-design cleanup review

Final application revision: 461111812a0a9d677769c1cb7168e4c274a61574. Removed only the obsolete flex:none declaration on absolutely positioned carousel arrows; it no longer participates in flex layout. No visual or navigation behavior changed. The artwork-only offset and temporary debugging were already absent. Retained track padding, rail gap and hover filter suppression because they are still used by sizing and inherited-style handling. No unrelated cleanup.

Updated LATEST_TITLES.md with actual keyboard/filter/history behavior and the distinction between this pending review branch and published 0.1.5. Reviewed README, setup output, installation, operations, .env.example, Dockerfile and production Compose: docker-compose.yml is the pull-based deployment, docker-compose.build.yml is the source build, and published image references remain 0.1.5. Existing service/project/volume identity, read-only legacy volume, internal PostgreSQL, localhost binding and optional HTTPS are unchanged. Historical Compose filenames remain explicitly historical. All 69 relative links in the reviewed documentation resolve.

Post-cleanup node scripts/latest-titles-browser.mjs passed (all four desktop viewports plus responsive fallback, group navigation, filter/resize alignment, focus, dialogs and error recovery; no unexpected console errors). [Production verification 41651052296](https://github.com/jtechbyte/lantern/actions/runs/41651052296) passed on native AMD64 and ARM64 at the final application revision: 131 tests per architecture, browser suite, production build, default/HTTPS Compose validation, isolated PostgreSQL login/settings persistence/recreation, backup/restore, local-CA HTTPS and actual 125%/150%/200% browser zoom. Previously inspected screenshots remain representative: the removed flex declaration had no computed-layout effect.

Native Stremio installation/handoff, live provider-account verification, movie playback and episode playback remain **Not tested - unverified**. Public DNS/ACME and the user's firewall are also unverified. Review branch only: no merge, tag, image publication, release or running-installation changes.

Publication follow-up: the review-only statements above describe the earlier frozen-design checkpoint. Authorized release 0.1.6 and final checks are recorded in RELEASE_0.1.6.md; the manual limitations remain unchanged.

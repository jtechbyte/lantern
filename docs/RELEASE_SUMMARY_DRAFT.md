# Draft release summary — not published

Lantern adds a Latest Movies & TV Shows carousel to the right-hand Overview workspace, preserving the approved sidebar. It shows unique indexed titles with cached Cinemeta artwork and metadata, type filters, date sorting, keyboard navigation, and accessible details and View all dialogs. It is not a trending feed or a playback-availability guarantee.

Compact status panels retain all setup and source rows, with supporting information in Details dialogs. Failed source operations distinguish current unavailable results from previous successful measurements. Smaller and zoomed viewports retain an accessible scrolling fallback.

The additive database migration creates indexed-title metadata and transactional indexing timestamps. Historical dates are explicitly estimated. Before deployment, back up PostgreSQL and preserve the existing environment configuration; rollback compatibility of this new migration with an older application image has not been verified.

Validation at source commit `005ec2e58c1cb4dee9f87cadfc49fe42b4bacf15`: native AMD64 and ARM64 production builds, 128 tests per architecture, PostgreSQL initialization, authentication, settings persistence, restart/recreation, outage recovery, and backup/restore passed. Automated native Chromium zoom at 125%, 150%, and 200% passed the documented visible-control reachability checks. See the [verification report and screenshots](OVERVIEW_VERIFICATION.md) and [successful non-publishing workflow](https://github.com/jtechbyte/lantern/actions/runs/41108595678).

Remaining manual checks: native Stremio handoff, live provider-account verification, and actual movie/episode playback are **unverified**. Populated dialogs at every native zoom level were not exhaustively tested. External metadata, source, and provider availability are not guaranteed.

Ready for review, not a claim of complete end-to-end release verification. No version has been selected, and no merge, tag, image publication, or release creation is included in this documentation task.

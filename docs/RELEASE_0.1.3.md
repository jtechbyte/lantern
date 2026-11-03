# Lantern 0.1.3 release verification

Release preparation authorized 2026-11-02. Publication and final candidate verification are pending; this file will be updated with confirmed results, source commit, workflow links, and manifest digests.

The approved layout and sidebar are unchanged. This release includes the right-pane indexed-title carousel, status Details dialogs, and separation of current and previous source results. See [Overview verification](OVERVIEW_VERIFICATION.md) for earlier implementation checks and screenshots.

**Not tested — unverified:** native Stremio installation, live provider-account verification, movie playback, and episode playback. The user explicitly confirmed these tests were not performed. Automated HTTP/manifest checks do not prove native handoff or playback. Every populated dialog at each native zoom level and rollback to an older application image remain unverified.

Migration 6 adds indexed-title metadata and timestamps. Back up PostgreSQL and preserve the encryption key before updating. Older images reject the migrated schema; restore the pre-update dump into a separate database for rollback. See [Operations](OPERATIONS.md) and the [prepared release plan](RELEASE_PLAN_0.1.3.md). No running production installation is updated by publication.

Planned multi-architecture tags: `0.1.3`, `sha-<release-commit>` in `jctechmin/lantern` and `ghcr.io/jtechbyte/lantern`. Stable `0.1`, `0`, and `latest` aliases are promoted only after anonymous pulls and isolated deployments pass on both AMD64 and ARM64 for both registries. A published immutable tag alone is not a successful verification result.

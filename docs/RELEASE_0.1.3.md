# Lantern 0.1.3 release verification

Released and verified 2026-11-02 (America/New_York). [GitHub release](https://github.com/jtechbyte/lantern/releases/tag/v0.1.3). Source/tag commit: [`792d87f8e384f3e0067f789830c11cda44010235`](https://github.com/jtechbyte/lantern/commit/792d87f8e384f3e0067f789830c11cda44010235). The reviewed branch was fast-forward merged through [PR #1](https://github.com/jtechbyte/lantern/pull/1), retaining the exact tested commit. Later documentation-only commits record these results and do not change the tagged images.

The approved layout and sidebar are unchanged. This release includes the right-pane indexed-title carousel, status Details dialogs, and separation of current and previous source results. See [Overview verification](OVERVIEW_VERIFICATION.md) for earlier implementation checks and screenshots.

**Not tested — unverified:** native Stremio installation, live provider-account verification, movie playback, and episode playback. The user explicitly confirmed these tests were not performed. Automated HTTP/manifest checks do not prove native handoff or playback. Every populated dialog at each native zoom level and rollback to an older application image remain unverified.

Migration 6 adds indexed-title metadata and timestamps. Back up PostgreSQL and preserve the encryption key before updating. Older images reject the migrated schema; restore the pre-update dump into a separate database for rollback. See [Operations](OPERATIONS.md) and the [prepared release plan](RELEASE_PLAN_0.1.3.md). No running production installation is updated by publication.

## Published images

Repositories: [Docker Hub](https://hub.docker.com/r/jctechmin/lantern) and [GHCR](https://github.com/users/jtechbyte/packages/container/package/lantern).

Both `jctechmin/lantern` and `ghcr.io/jtechbyte/lantern` have verified multi-architecture tags `0.1.3`, `0.1`, `0`, `latest`, and `sha-792d87f8e384f3e0067f789830c11cda44010235`. All ten manifest tags were fetched anonymously and matched the digest below after promotion. Docker Hub additionally retains native tags `sha-792d87f8e384f3e0067f789830c11cda44010235-amd64` and `sha-792d87f8e384f3e0067f789830c11cda44010235-arm64` used to assemble the manifest.

| Manifest | Digest (identical in both registries) |
| --- | --- |
| Multi-architecture index | `sha256:14b40840d0cd79ef0e48ad2aafa9326040e72a81c8f4722a972fb5379b1a444c` |
| linux/amd64 | `sha256:66a545893f153b6d80bb22334db8f554d0616c04303deb8b755c82b6e6f73e30` |
| linux/arm64 | `sha256:c1c3e1ce0a7038f1de8dbaabe316fa8227f3059da96488e6d820fe36a8a3087a` |

Stable aliases were promoted only after all four public-deployment jobs passed. GHCR was anonymously accessible when tested; no visibility change was needed from this agent.

## Actual automated results

| Check | Evidence and result |
| --- | --- |
| Final source production build and zoom | [Run 41554778197](https://github.com/jtechbyte/lantern/actions/runs/41554778197): native AMD64/ARM64 builds, 128 tests per architecture, PostgreSQL smoke, actual 125%/150%/200% Chromium zoom passed |
| Docker candidate validation | [Run 41554785480](https://github.com/jtechbyte/lantern/actions/runs/41554785480): native builds, regression and database-size browser checks, container smoke passed |
| Main commit validation | [Run 41555412205](https://github.com/jtechbyte/lantern/actions/runs/41555412205): passed at the same source commit |
| Release publication | [Run 41555478791](https://github.com/jtechbyte/lantern/actions/runs/41555478791): both native build/test jobs, publish, all four anonymous deployment jobs, and stable promotion passed |
| Exact documented installation | [Run 41556223822](https://github.com/jtechbyte/lantern/actions/runs/41556223822): setup.sh, Compose config/pull/start, health/status/logs, credential permissions and preservation, and persistence passed on AMD64 and ARM64 using published `jctechmin/lantern:0.1.3` |

For each registry and architecture, the release workflow used an empty `DOCKER_CONFIG`, ran `docker pull` by manifest digest, then `node scripts/container-smoke.mjs IMAGE`. This verified real PostgreSQL initialization, protected endpoints, browser login, saved settings after refresh, application restart and recreation, PostgreSQL restart, health failure/recovery, database-size growth/staleness, and native dump/restore into a separate database. These were disposable test projects, never production data. The documented-install workflow additionally ran `node scripts/container-smoke.mjs jctechmin/lantern:0.1.3 --documented-setup`.

Native zoom used headed Chromium and OS shortcuts under Xvfb, measured DPR 1.25, 1.5 and 2, and 66 visible controls per zoom level. This does not expand the populated-dialog limitations above. Historical viewport and carousel evidence remains in the [Overview report](OVERVIEW_VERIFICATION.md).

Two pre-release candidates failed validation: an old literal Compose version assertion and old health/manifest version strings. They were corrected before tagging; all required final-candidate and published-image jobs passed. No design or sidebar changes were made for those corrections.

## Deployment

The [production Compose file](../docker-compose.yml) pins `jctechmin/lantern:0.1.3`. To use GHCR, set `LANTERN_IMAGE=ghcr.io/jtechbyte/lantern:0.1.3` in the existing private `.env`. An immutable pin can use either repository plus `@sha256:14b40840d0cd79ef0e48ad2aafa9326040e72a81c8f4722a972fb5379b1a444c`.

Follow [README installation](../README.md#quick-start--docker-hub) and [Operations](OPERATIONS.md), preserving existing project identity, volumes, credentials, and overrides. The [release plan](RELEASE_PLAN_0.1.3.md) remains historical planning evidence. Publication did not update the user's running server. Native Stremio installation, real account verification, movie playback and episode playback remain **Not tested — unverified**.

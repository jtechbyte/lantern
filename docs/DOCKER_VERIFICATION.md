# Docker release verification: 0.1.1

Published on 2026-10-28 to the public [jctechmin/lantern repository](https://hub.docker.com/r/jctechmin/lantern).

- Source commit: `cd66c1bd7bb5e1576f2e41e831c0db06fb0cb6ce` (tag `v0.1.1`).
- [Release workflow and logs](https://github.com/jtechbyte/lantern/actions/runs/40717198291): all jobs succeeded.
- Architectures: `linux/amd64` and `linux/arm64`, both built and runtime-tested on native GitHub-hosted runners.
- Workflow uses repository secrets named exactly `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`. Their values are not included in source or this report.

## Published tags and digest

These multi-architecture tags resolved to the same index at verification time:

```text
0.1.1
0.1
0
latest
sha-cd66c1bd7bb5e1576f2e41e831c0db06fb0cb6ce
```

Immutable pull reference:

```text
jctechmin/lantern@sha256:ea2070335675b01975029344ef3f671cf3f3ba0a1f1281780780f863a35d0bf0
```

Native tags and manifests:

| Tag | Manifest digest |
| --- | --- |
| `sha-cd66c1bd7bb5e1576f2e41e831c0db06fb0cb6ce-amd64` | `sha256:fc389889b09b08cbe834ba2c08e7c308da33a31ca8fb058d7ccf28a820122ff4` |
| `sha-cd66c1bd7bb5e1576f2e41e831c0db06fb0cb6ce-arm64` | `sha256:78afe534ce4bd0275050eedb1517c661e35089d3acea991c08e1689ee7953cc6` |

## Checks performed

| Check | Result |
| --- | --- |
| Automated suite before publishing | 119 tests passed on each architecture. |
| Docker Hub public visibility | Anonymous repository API returned HTTP 200 and `is_private: false`. |
| Anonymous registry manifest lookup | HTTP 200; digest and both architecture manifests matched the published tags. |
| Anonymous image download | Passed on fresh AMD64 and ARM64 jobs with an empty Docker credential directory and no login step. |
| Image contents and execution | Non-root user, expected OCI labels and health check, required runtime/maintenance files, and absence of selected development/private files verified. |
| Fresh deployment | Actual PostgreSQL initialization, health, protected settings endpoint, browser login, UI save and refresh passed on both architectures. |
| Persistence | Saved settings, encrypted synthetic provider token, and installation identity survived application restart/recreation and PostgreSQL restart. |
| Failure and recovery | Database outage made health fail; service recovery restored health and saved state. Startup logging and the deployment checker passed. |
| Backup and restore | Native custom-format pg_dump/pg_restore into a separate database preserved encrypted settings and installation identity. |

Tests used isolated random Compose projects and disposable data, not production services. No real provider credentials were used. The pre-publication checker initially expected version 0.1.0; it was fixed to read package.json, then both native checks were rerun successfully before releasing 0.1.1.

## Limits

### Documentation clean-install follow-up

On 2026-10-28, the [clean Compose installation workflow](https://github.com/jtechbyte/lantern/actions/runs/40720267291) passed on fresh native Ubuntu AMD64 and ARM64 runners. It cloned the documentation-review branch, ran the actual `sh scripts/setup.sh`, verified private generated credentials and preservation on rerun, and used the unmodified production Compose file with its default published `0.1.1` image. Test-only Node/Playwright dependencies were installed on the runner; they are not required on deployment hosts.

The documented config validation, anonymous Compose pull, startup/wait, health, status, and log operations succeeded. Actual browser login and saving, refresh persistence, application and database restart, container recreation, database outage/recovery, and native dump/restore all passed. Random project names and temporary directories isolated test volumes from existing installations. Four local publishing/Compose compatibility checks and relative Markdown target checks also passed.

The first test attempt used the loopback IP in the browser while setup generated a localhost public origin; saving was correctly rejected by origin protection. The corrected test uses the documented localhost address. The README and Docker guide now explain this requirement. No authentication or application behavior was changed.

The checks above do not exercise the complete host image archive/load rollback procedure or deployment-specific proxy configuration.

### Remaining acceptance checks

External DNS/TLS and proxy routing, real Real-Debrid account connectivity, Stremio video playback, legacy SQLite migration, and rollback to an older application image were not exercised by this publishing run. These tests do not verify every dashboard feature or every ARM CPU variant. The 0.1.1 packaging release adds no schema migration; future schema changes can still require restoring a matching backup for rollback.

See [Docker deployment](DOCKER.md) for setup, updates, version selection, and backup/restore instructions. The recommended Compose file pins `0.1.1`; stable aliases can move on later releases.

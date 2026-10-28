# Lantern release notes

## 0.1.1 — published Docker image

The public image [jctechmin/lantern:0.1.1](https://hub.docker.com/r/jctechmin/lantern) supports `linux/amd64` and `linux/arm64`. Both architectures passed native build tests and anonymous pull/deployment verification. Use the [published-image Compose installation](DOCKER.md); local source builds remain optional.

The release includes production dependencies, non-root execution, image health checks, PostgreSQL persistence, migration tools, and source/version/license metadata. It makes no database schema or dashboard layout changes. Preserve the original `.env`, encryption key, and Compose project identity on existing installations.

See [exact tags, digest, and verification evidence](DOCKER_VERIFICATION.md). Public TLS/proxy routing, live Real-Debrid/Stremio playback, and rollback to older application images remain unverified by these checks.

## 0.1.0 — historical initial release candidate

The following records the checks and limitations at the original source-only release. Native container, PostgreSQL outage, and dump/restore verification was subsequently completed for 0.1.1 as described above; other listed gaps remain separate acceptance checks.

Lantern provides a private dashboard and self-hosted Stremio discovery using a local PostgreSQL index, direct source adapters, optional DMM imports, and Real-Debrid playback resolution. It includes editable presentation/filters, explicit title monitoring, manual imports, activity details, and isolated invited profiles.

Install using [Installation](INSTALLATION.md). Existing deployments must preserve `.env`, the encryption key, and Compose volume identity; SQLite users must run the documented migration. Read [Operations](OPERATIONS.md) before upgrades. This release builds locally from the supplied Dockerfile; no prebuilt container registry image is promised.

## Verification baseline

The pre-release functional audit ran 115 automated tests with no failures/skips, browser layout/workflow checks, an isolated end-to-end functional script, and a disk-backed process-restart smoke test. Storage tests use PGlite and production SQL/handlers; external provider transports are simulated. Clean production dependency installation and server/store imports passed. Read-only source/metadata probes responded at review time; that is not a continuing availability guarantee.

The documentation preparation adds clean-checkout setup/dependency checks, publication-file scanning, dependency notice collection, and relative-link/image checks. The maintainer's final preparation report records their actual outcomes rather than treating documented shell commands as executed deployment tests.

## Remaining verification gaps

- Native Ubuntu Docker builds, volume permissions, PostgreSQL wire connections, and real dump/restore/rollback.
- Public DNS, Caddy certificate issuance, reverse-proxy routing, and actual client installation.
- Authenticated Real-Debrid playback, multiple real provider accounts, and uncached/error responses in real Stremio clients.
- Physical mobile keyboard, native clipboard prompts, true browser zoom across engines, and screen-reader testing.
- Sustained load, full-disk conditions, real database network outages, and multi-instance coordination.

This is not a claim of full production verification. Discovery does not establish cached/playable availability. Direct P2P is disabled; monitoring has no notification service; external coverage and matching are bounded. Use isolated data to complete deployment checks before relying on an instance.

# Docker Hub deployment

Lantern's project-maintained image is **[jctechmin/lantern](https://hub.docker.com/r/jctechmin/lantern)**. It is published by this project's GitHub Actions workflow; it is not part of Docker's separately curated Official Images library.

The recommended image is `jctechmin/lantern:0.1.2`, adding a live PostgreSQL size card. Check the [0.1.2 verification report](DATABASE_SIZE_0.1.2.md) for publication and native architecture test results. The original 0.1.1 release evidence remains in [Docker verification](DOCKER_VERIFICATION.md).

## Fresh installation

Requires Docker Engine and the Compose plugin, Git (or a source archive), and OpenSSL. Node and PostgreSQL are supplied in containers. [Docker installation instructions](https://docs.docker.com/engine/install/ubuntu/).

```sh
git clone https://github.com/jtechbyte/lantern.git
cd lantern
sh scripts/setup.sh
# Edit .env: preserve generated secrets and set your real PUBLIC_URL for remote use.
docker compose -f compose.image.yaml config --quiet
docker compose -f compose.image.yaml pull
docker compose -f compose.image.yaml up -d --wait --wait-timeout 120
curl -fsS http://127.0.0.1:7001/healthz
docker compose -f compose.image.yaml exec -T lantern node scripts/check-deployment.mjs http://127.0.0.1:7001
```

Use the same `-f compose.image.yaml` on future commands. This file is a complete deployment, not an override: it supplies Lantern, PostgreSQL 17, optional Caddy, persistent volumes, health dependencies, loopback binding, and non-root/read-only application isolation. It never builds locally. No Docker Hub sign-in is needed for a public image pull.

Read `.env` privately for the generated admin token, open `http://localhost:7001`, and unlock. Save your provider token in Playback, test the saved account, then install in Stremio. Configure your public HTTPS origin before using remote devices; localhost on a phone or TV is that device, not this server. See [Installation](INSTALLATION.md) for the complete walkthrough and source configuration.

Use the exact `PUBLIC_URL` origin in your browser. With setup's default, open `http://localhost:7001`, not `http://127.0.0.1:7001`; requests that change settings are rejected when the browser origin differs. The command-line health probe can use the loopback IP.

`ADMIN_TOKEN`, `ENCRYPTION_KEY`, and `POSTGRES_PASSWORD` are required. Setup generates them; [.env.example](../.env.example) explains every supported deployment variable without usable credentials. Never replace an existing encryption key as part of an update. Active data is in `postgres_data`; `lantern_data` is retained read-only for legacy SQLite migration.

For bundled HTTPS, set `PUBLIC_URL=https://your-real-hostname` and `DOMAIN=your-real-hostname`, configure DNS/ports, then:

```sh
docker compose -f compose.image.yaml --profile https up -d --wait --wait-timeout 120
```

With an existing proxy, leave the profile off and follow [proxy networking guidance](INSTALLATION.md#existing-reverse-proxy-or-pangolin). PostgreSQL is not published on a host port.

## Versions, aliases, and digests

The Compose example defaults to the exact stable tag `0.1.2`. Override it in `.env` with `LANTERN_IMAGE`, for example `LANTERN_IMAGE=jctechmin/lantern:0.1.2`. For immutable deployment, use the manifest digest reported by the successful publishing workflow: `LANTERN_IMAGE=jctechmin/lantern@sha256:YOUR_VERIFIED_DIGEST`. The placeholder is not a usable digest.

| Tag | Behavior |
| --- | --- |
| `0.1.2` | Stable version tag for this release. |
| `0.1` | Moves with stable patch releases in this minor line. |
| `0` | Moves with stable releases in the major-zero line; use a specific version for control. |
| `latest` | Moves only when publishing a stable GitHub release, never a branch or prerelease. Pulling/recreating is still required; it does not auto-update running containers. |
| `sha-FULL_COMMIT` | Multi-architecture manifest traced to the source commit. |
| `sha-FULL_COMMIT-amd64`, `sha-FULL_COMMIT-arm64` | Exact native images that passed pre-publication runtime tests. |
| `X.Y.Z-rc.N` | Separate prerelease version; no major/minor/latest aliases. A GitHub prerelease without a version suffix uses `X.Y.Z-prerelease`. |

OCI labels include repository, revision, version, build time, and MIT license. Both architectures use the same source commit. A manual workflow run or push to `main` only checks builds; publication requires a published GitHub release whose tag matches `package.json`. Version tags are operational identifiers, not enforced registry immutability; pin a digest when reproducibility is required.

## Existing installation: switch without replacing data

Back up first using [Operations](OPERATIONS.md). Stay in your existing project directory. Preserve `.env`, `COMPOSE_PROJECT_NAME`, database credentials, and volumes. The pull-based file retains the same service and volume keys as `compose.yaml`, so the same project identity reuses them. A directory rename or changed project identity can select different volumes.

Inspect local Compose customizations (container names, ports, proxy networks, database names) and carry required differences into a private override; do not overwrite them blindly. Then select `LANTERN_IMAGE` in `.env` and use:

```sh
docker compose -f compose.image.yaml config --quiet
docker compose -f compose.image.yaml pull lantern
docker compose -f compose.image.yaml up -d --no-build --wait --wait-timeout 120 lantern
docker compose -f compose.image.yaml ps
```

The 0.1.2 image-packaging release does not introduce a database schema change. Startup still applies existing numbered migrations. SQLite-to-PostgreSQL migration remains explicit and requires the old volume and original encryption key. Use `docker compose -f compose.image.yaml run --rm lantern npm run migrate:sqlite` only after following the legacy migration prerequisites in Installation.

## Backup, restore, rollback, and updates

Use [Operations](OPERATIONS.md) for complete copy-and-paste backup, restore, and rollback commands. They use `compose.image.yaml` directly. Keep the same project identity and include any private override files on every command.

Before an update, dump PostgreSQL, save `.env` and source/deployment configuration, and record the current image digest. Pull your chosen version and recreate only Lantern as above. Verify health, login, saved preferences, and installation identity after each update.

For an image-only rollback with compatible schema, set `LANTERN_IMAGE` to the previous verified version/digest and recreate Lantern. If a new release migrated the schema, an older binary may refuse it: restore the matching pre-update dump into a separate database and use the original encryption key and compatible image, as described in Operations. Never delete the original database or use `down -v` as a production rollback technique. Changes made after a restored snapshot are not included in that snapshot.

## Maintainer: enable publishing

1. Create **public** repository `jctechmin/lantern` in Docker Hub.
2. Create a Docker Hub access token with repository **Read & Write**, without Delete or Cloud Sandboxes permissions. Use a dedicated token and expiry suitable for maintaining the workflow; renew it in GitHub Secrets before it expires. Personal tokens can cover multiple repositories the account owns; do not assume this PAT is repository-specific.
3. Add repository Actions secrets at [Settings → Secrets and variables → Actions](https://github.com/jtechbyte/lantern/settings/secrets/actions): `DOCKERHUB_USERNAME` = `jctechmin`, `DOCKERHUB_TOKEN` = the token. Never paste tokens into issues, workflow YAML, build arguments, or logs. [Docker token instructions](https://docs.docker.com/security/access-tokens/personal-access-tokens/).
4. Merge reviewed source/version changes. Wait for both native build-test jobs. Publish a release tagged `v` plus the package version. Mark prereleases as prereleases. The workflow pushes tested native images, assembles aliases, and then verifies anonymous pulling and deployment by digest on both architectures.
5. Review **verify-public**, not just **publish**, before announcing availability. Record the digest and run URL. If verification fails, report that the image was pushed but not successfully verified; do not call that a completed release.

Workflow permissions are `contents: read`. Registry credentials are used only by trusted release jobs. `pull_request_target` is not used. Third-party Actions are pinned to full commits. Authentication is not forwarded as a build argument or copied into image layers. Runtime application credentials are supplied only when starting a deployment.

## What the container check proves

`node scripts/container-smoke.mjs IMAGE` runs against Docker with an isolated random Compose project and disposable database volumes, using Playwright on the host. It checks non-root execution, runtime contents/labels, fresh native PostgreSQL initialization, health, protected endpoints, actual browser login and saving, refresh/restart/recreation persistence, database outage/recovery, and custom-format dump/restore into another database. It never uses real provider credentials or contacts source services.

This test removes **only its own randomly named test project volumes** at the end. Run it on a disposable test host with port 7001 available, after `npm ci` and Chromium installation. Production volumes must never be supplied to it. For published validation, the workflow starts with an empty Docker credential directory and pulls the exact manifest digest before testing.

Passing these tests does not verify external DNS/TLS, physical mobile devices, every CPU variant, or actual Real-Debrid/Stremio video playback. Those remain separate acceptance checks.

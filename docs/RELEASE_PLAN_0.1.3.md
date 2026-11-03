# Lantern 0.1.3 release plan — not published

Historical plan: publication was subsequently authorized and completed. See [actual release results](RELEASE_0.1.3.md); the planning statements and pre-release digest below describe the state before publication, not the current registry state.

Prepared 2026-11-02. This is a plan, not authorization to merge, tag, publish images, create a release, or update a running installation. The approved application layout and sidebar remain unchanged. Production Compose continues to default to the published `0.1.2` image until release preparation is authorized.

## Version and evidence

The next unused patch version is **0.1.3**, with GitHub tag **v0.1.3**. Checked `gh release list`, `git ls-remote --tags origin`, and all pages of the public [Docker Hub tags API](https://hub.docker.com/v2/repositories/jctechmin/lantern/tags?page_size=100). GitHub has v0.1.0 (prerelease), v0.1.1, and v0.1.2; Docker Hub has no 0.1.3 tag. Recheck immediately before reserving the version; this check does not reserve it.

Current published 0.1.2 manifest, also used by `latest`, `0.1`, and `0` at inspection:

```text
jctechmin/lantern@sha256:2686b564fe5736a105d3ad6318ceb17c0258384f491c50151819a4a88fab47e5
```

That manifest includes linux/amd64 and linux/arm64. The future 0.1.3 digest is **not yet known**.

Tested implementation commit: `005ec2e58c1cb4dee9f87cadfc49fe42b4bacf15`. [Native build and smoke workflow](https://github.com/jtechbyte/lantern/actions/runs/41108595678) passed on both architectures. See the [verification report](OVERVIEW_VERIFICATION.md) for exact commands and scope. Documentation commits after that source revision do not change the application. A future version-bump/release commit must be tested again; it must not be represented as already tested.

User explicitly reported **Not tested** for native Stremio installation, live Real-Debrid account verification, movie playback, and episode playback. These remain **unverified**. Populated dialogs at every native zoom level, older-image rollback of this new migration, and a published 0.1.3 deployment also remain unverified. No claim of full end-to-end release readiness is made.

## Proposed release sequence

1. Review the [draft summary](RELEASE_SUMMARY_DRAFT.md), final source diff, and manual limitations. Complete manual checks or explicitly accept their documented limitations before authorizing publication.
2. Recheck GitHub and Docker Hub for v0.1.3 / 0.1.3. Never overwrite an existing versioned tag.
3. In a reviewed release-preparation commit, update package.json and package-lock.json consistently to 0.1.3, the explicit UI version text, recommended Compose default, version-specific deployment examples, and changelog. Keep historical release evidence intact. Do not overwrite anyone's deployed `.env` or Compose overrides.
4. Run `npm ci`, `npm test`, both native production builds and isolated PostgreSQL smoke checks on the final candidate. Rerun the non-publishing zoom validation on that candidate. Record its full commit SHA and successful run URLs.
5. Only after authorization, merge the reviewed candidate, confirm the resulting commit's CI, and create v0.1.3 at that exact commit. Prepare release notes from the draft summary, retaining the migration and manual-test limitations.
6. Publishing the GitHub release triggers `.github/workflows/docker.yml`. A manual workflow dispatch only validates; it does **not** publish images. Do not publish the GitHub release until image publication is authorized too.
7. The workflow builds/tests each native image, pushes commit/architecture tags, assembles version and commit manifests, anonymously pulls the exact digest on both architectures, and smoke-tests fresh Compose deployments. Only then does it promote stable aliases. Inspect `verify-public` and `promote-stable`, not just `publish`.
8. Record the final manifest digest, architectures, source SHA and workflow URL in release notes. Verify the recommended Compose pin resolves to that digest. If public verification fails, do not announce success or promote aliases manually; retain accurate failure notes and prepare a new unused patch version if a correction requires a new image.

Existing secrets: `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`. The release workflow uses them only in trusted release jobs, has `contents: read`, and does not pass credentials into the image build. No credential values are needed in this plan.

## Planned Docker Hub tags

All tags are under `jctechmin/lantern`; `<release-sha>` is the full final release commit, not the earlier verification SHA.

| Stage | Tags |
| --- | --- |
| Tested native images | `sha-<release-sha>-amd64`, `sha-<release-sha>-arm64` |
| Multi-architecture manifests | `0.1.3`, `sha-<release-sha>` |
| After anonymous deployment verification succeeds on both architectures | `0.1`, `0`, `latest` |

Prefer `0.1.3` or the recorded digest in deployments. Stable aliases are mutable. No 0.1.3 tags have been published by this task. A prerelease would need a distinct version such as `0.1.3-rc.1` and the GitHub prerelease flag; it must not promote stable aliases.

## Future Ubuntu Compose update — do not run before publication

These Bash commands assume the existing installation at `~/docker/lantern`, project name `lantern`, service/database role `postgres` / `lantern`, and `compose.image.yaml`. Confirm the project identity with `docker compose ls` first. If yours is `lantern-addon`, retain that instead. Include all existing private override files in the `dc` array on **every** command. Do not switch project names, volumes, database passwords, or encryption keys.

After the published image passes verification, use a private backup and a short maintenance window. Stopping only Lantern prevents background writes after the rollback snapshot; PostgreSQL and unrelated services keep running.

```bash
set -euo pipefail
cd ~/docker/lantern
dc=(docker compose -p lantern -f compose.image.yaml)
"${dc[@]}" config --quiet
backup="$HOME/lantern-backups/pre-0.1.3-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 -p "$backup"
container=$("${dc[@]}" ps -q lantern)
test -n "$container"
image=$(docker inspect --format '{{.Image}}' "$container")
rollback_tag="lantern:rollback-$(date +%Y%m%d-%H%M%S)"
docker image tag "$image" "$rollback_tag"
(
  umask 077
  printf '%s\n' "$rollback_tag" > "$backup/image-name.txt"
  docker image save "$rollback_tag" | gzip > "$backup/application-image.tar.gz"
  tar --exclude='./node_modules' --exclude='./.git' --exclude='./artifacts' \
      --exclude='./data' --exclude='./backups' --exclude='*.zip' \
      -czf "$backup/config-and-source.tar.gz" .
)
"${dc[@]}" stop lantern
(
  umask 077
  "${dc[@]}" exec -T postgres pg_dump -U lantern -d lantern -Fc > "$backup/database.dump"
  test -s "$backup/database.dump"
  "${dc[@]}" exec -T postgres pg_restore --list < "$backup/database.dump" > "$backup/database-contents.txt"
)
printf 'Backup saved privately: %s\n' "$backup"
```

Backups contain secrets; retain a protected off-host copy. Confirm the dump and original encryption key are recoverable. If backup fails, stop the update and restart the unchanged Lantern service after diagnosing the failure. No new image has been started at this point.

Edit `.env` so its one `LANTERN_IMAGE` entry is `jctechmin/lantern:0.1.3`; retain all other settings. Clear any shell override, then update only Lantern:

```bash
unset LANTERN_IMAGE
"${dc[@]}" config --quiet
"${dc[@]}" pull lantern
"${dc[@]}" up -d --no-deps --no-build --wait --wait-timeout 120 lantern
"${dc[@]}" ps
curl -fsS http://127.0.0.1:7001/healthz
"${dc[@]}" exec -T lantern node scripts/check-deployment.mjs http://127.0.0.1:7001
"${dc[@]}" logs --tail=60 lantern
```

Use the actual configured health address if different. Hard-refresh, unlock, verify saved settings and installation identity, and perform the manual Stremio/provider/playback checks. `healthy` alone does not prove playback. Do not run `down -v`, recreate PostgreSQL unnecessarily, or regenerate `.env`.

## Rollback after this migration

This release introduces migration 6: `indexed_titles`, associated indexes, and a transactional release-write trigger. `Store.migrate()` rejects a database with a schema version newer than the application's migration list. Therefore **0.1.2 must not be pointed at the upgraded database**. Do not delete migration rows or drop new schema objects as a shortcut.

Restore the pre-update dump into a new database and run the exact saved image with the original encryption key. Preserve the upgraded database for diagnosis. Writes after the backup will not exist in the restored snapshot. This specific old-image rollback has not yet been exercised; native dump/restore with the current image has passed.

In the same project, set `backup` to the actual private backup directory, then:

```bash
set -euo pipefail
cd ~/docker/lantern
dc=(docker compose -p lantern -f compose.image.yaml)
backup="$HOME/lantern-backups/REPLACE_WITH_PRE_UPDATE_BACKUP"
test -s "$backup/database.dump"
test -s "$backup/application-image.tar.gz"
"${dc[@]}" stop lantern
restore_db="lantern_restore_$(date +%Y%m%d%H%M%S)"
"${dc[@]}" exec -T postgres createdb -U lantern "$restore_db"
"${dc[@]}" exec -T postgres pg_restore -U lantern -d "$restore_db" \
  --no-owner --exit-on-error < "$backup/database.dump"
gunzip -c "$backup/application-image.tar.gz" | docker image load
rollback_tag=$(cat "$backup/image-name.txt")
override="compose.rollback.$restore_db.yaml"
(umask 077; cat > "$override" <<EOF
services:
  lantern:
    image: "$rollback_tag"
    environment:
      PGDATABASE: "$restore_db"
EOF
)
"${dc[@]}" -f "$override" up -d --no-deps --no-build --pull never --wait --wait-timeout 120 lantern
curl -fsS http://127.0.0.1:7001/healthz
```

If configuration changed, review the protected config archive and restore the matching encryption key and compatible settings before starting. Do not blindly extract it over the installation. Keep the PostgreSQL role password matching the running database. Retain the rollback override on every subsequent command until recovery is deliberately made permanent. Check decryption, settings, profiles, counts, installation identity, and actual playback; retain both databases until recovery is accepted.

These future update/rollback commands were reviewed against the actual Compose and migration code, not executed against production. A release-specific upgrade and old-image rollback rehearsal in an isolated environment remains recommended before publication.

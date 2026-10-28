# Installing Lantern

## Requirements

The supplied deployment uses Node 24, PostgreSQL 17, and optionally Caddy 2 in containers. The host needs Docker Engine and a Compose plugin supporting `up --wait`, OpenSSL for `scripts/setup.sh`, and Git or an archive extractor. Follow [Docker's Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/), then verify `docker version` and `docker compose version`. Node is not required on a Docker host.

No measured minimum CPU/RAM specification is available. Compose caps Lantern at 1 GiB RAM and 128 processes; PostgreSQL needs additional memory. Allow disk space for indexes, WAL, images, imports, and backups. The application's 4 GB storage budget is a cleanup target, not a disk quota. Architecture and sustained-load testing remain outstanding.

Outbound access is needed for images/npm packages, enabled sources, Cinemeta, and Real-Debrid. Remote clients need a reachable HTTPS origin. PostgreSQL is private to the Compose network.

## Download and configure

```sh
git clone https://github.com/jtechbyte/lantern.git
cd lantern
sh scripts/setup.sh
```

Alternatively download the repository source ZIP, extract it with readable source permissions (`umask 022` on Unix), and enter its directory. Archive directories may include the version. Keep the same project directory and Compose identity on subsequent updates.

Setup creates random `ADMIN_TOKEN`, `ENCRYPTION_KEY`, and `POSTGRES_PASSWORD` in a private `.env`. It preserves existing credentials and adds only a missing PostgreSQL password. Read the admin token privately in an editor. Do not copy a development `.env` over a deployed instance.

[.env.example](../.env.example) documents the settings with deliberately blank secrets. It is not ready to run; do not copy it over setup's generated file.

| Variable | Purpose |
| --- | --- |
| `ADMIN_TOKEN` | Required, at least 32 characters. Owner dashboard/API credential. |
| `ENCRYPTION_KEY` | Required, exactly 64 hex characters. Decrypts settings and signs playback links. Preserve with backups. |
| `POSTGRES_PASSWORD` | Required by Compose. Initial database role password; editing it does not change an existing role password. |
| `PUBLIC_URL` | Defaults to `http://localhost:7001`; use your exact external origin for remote access, without path, credentials, query, or fragment. |
| `LANTERN_BIND_ADDRESS` | Compose host binding, default `127.0.0.1`. Use a reachable host LAN address if needed by an external proxy. |
| `DOMAIN` | Hostname only; required when using bundled Caddy's `https` profile. |
| `COMPOSE_PROJECT_NAME` | Optional Compose identity. Keep an existing value to retain the same named volumes. |
| `HOST`, `PORT` | Direct Node defaults: `127.0.0.1`, `7001`. Compose explicitly sets `0.0.0.0:7001` internally. |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | Direct Node database connection. Compose supplies these. Password falls back to `POSTGRES_PASSWORD`. |
| `DATABASE_URL` | Alternative direct Node connection string. Compose overrides it to empty and uses its private PostgreSQL service. |
| `SQLITE_PATH` | Legacy import/detection path; default `./data/lantern.sqlite`, or `/app/data/lantern.sqlite` in Compose. |

Setup still writes `DATA_DIR` for compatibility; it does not select active PostgreSQL storage. Use `SQLITE_PATH` for a custom legacy location. Preferences and provider tokens belong in the dashboard.

## Start and check

```sh
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 120
docker compose ps
curl -fsS http://127.0.0.1:7001/healthz
docker compose exec -T lantern node scripts/check-deployment.mjs http://127.0.0.1:7001
```

The database must be healthy before Lantern starts. `/healthz` checks the database and returns status/version; database unavailability returns 503. Change host-side curl to the chosen binding if necessary. The deployment checker checks HTTP routes and authentication boundaries, not playback.

Open `http://localhost:7001` when the browser is on the server. For temporary access from another computer, `ssh -L 7001:127.0.0.1:7001 user@server` provides a browser tunnel; substitute your SSH account/host. This is not a public Stremio endpoint.

Active data lives in the `postgres_data` named volume. Fresh databases receive numbered transactional migrations and defaults automatically. `lantern_data` is read-only legacy SQLite storage. Never use `docker compose down -v` for routine maintenance.

## Remote HTTPS

### Bundled Caddy

Point DNS at the server, make TCP 80/443 reachable, and ensure no other service occupies them. Keep generated secrets and edit `.env` using your real domain:

```dotenv
PUBLIC_URL=https://lantern.example.com
DOMAIN=lantern.example.com
```

```sh
docker compose --profile https config --quiet
docker compose --profile https up -d --build --wait --wait-timeout 120
docker compose logs --tail=100 lantern caddy
```

Caddy proxies to `lantern:7001`; `caddy_data` and `caddy_config` preserve its state. DNS, certificate issuance, and your firewall need live verification.

### Existing reverse proxy or Pangolin

Leave Caddy's profile off. A proxy on the host can target `http://127.0.0.1:7001`. Another container cannot reach Lantern through its own loopback: use a suitable shared Docker network or a published host address reachable by the proxy. For Newt/tunnel connectors choose the target based on the connector's location; DNS points at the tunnel ingress, not necessarily Lantern's machine.

Set `PUBLIC_URL` to the exact external HTTPS origin. Preserve paths and queries. `/a/*` and `/brand/*` must reach Stremio without interactive login challenges. Invited users also need `/account` and `/profile-api/*`. Lantern supplies its own dashboard/API authentication. Protect or redact proxy logs because private URLs may appear in paths.

## First-use walkthrough

1. Unlock with the generated admin token. Refresh retains access in that tab; **Lock dashboard** clears it.
2. In **Playback → Account and delivery**, enter your Real-Debrid token and save. **Test account** uses the saved token, not an unsaved replacement.
3. Review **Discovery** preferences and sources, then save. Enabled means configured, not proven reachable.
4. In **Search → New search**, choose Movie and enter an IMDb ID, for example `tt1254207` (Big Buck Bunny). Select **Search sources**. Zero results is possible; inspect health and exclusions instead of expecting a fixed count.
5. Optionally **Monitor this title**, then check **Library → Monitored titles**. Searching does not automatically add it.
6. Select **Install in Stremio**, or copy the private manifest URL from **Library → Installation** into Stremio's addon installer. Keep it private.
7. Open the title in Stremio and try an authorized release. An account test or search does not guarantee playback.
8. Refresh, then `docker compose restart lantern`. After health recovers, confirm saved settings and monitored titles remain. This checks your deployment's persistence.

## Legacy SQLite migration

Stop the old app and back up its source, image, `.env`, and complete SQLite directory including WAL sidecars. Keep its original encryption key and Compose identity. The original `lantern_data` volume must contain `/app/data/lantern.sqlite`.

With new files present and the old app stopped:

```sh
sh scripts/setup.sh
docker compose build lantern
docker compose up -d --wait postgres
docker compose run --rm lantern npm run migrate:sqlite
docker compose up -d --wait --wait-timeout 120 lantern
```

The importer uses a temporary writable copy, validates encryption, and imports into an empty PostgreSQL target transactionally. It refuses a populated target; do not rerun after success. Normal startup detects legacy data beside an empty target and refuses to silently replace it. Verify counts, installation identity, and saved preferences before retiring the old deployment. Do not import unrelated test data.

## Direct Node deployment

Requires Node 24+ and a separately provisioned PostgreSQL database. Run `npm ci`, `npm run setup`, configure PG variables or `DATABASE_URL` in `.env`, then `npm run doctor` and `npm start`. Compose does not publish PostgreSQL to localhost; direct Node needs its own reachable connection. The repository does not supply a systemd unit.

Read [Operations](OPERATIONS.md) before updating. Native Docker/PostgreSQL networking and public proxy setup were not verified in the Windows review environment.

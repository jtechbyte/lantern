# Troubleshooting

Begin with `docker compose ps -a`, `docker compose logs --tail=200 lantern`, and `docker compose logs --tail=50 postgres`. Do not share `.env`, tokens, invitation/management/install URLs, signed playback URLs, database dumps, or unredacted proxy logs.

| Symptom | Check and next step |
| --- | --- |
| Port 7001 refuses connections | Check whether Lantern is restarting, not merely created. Inspect logs and database health. Check the configured host binding. |
| `/app/package.json: permission denied` | The current Dockerfile copies files with `--chown=node:node`. Ensure you have it, extract source with `umask 022`, and rebuild. Do not run the app as root to conceal the problem. |
| PostgreSQL connection required | Direct Node requires PG settings or `DATABASE_URL`. Compose supplies its own private connection. |
| Database startup failed | Check PostgreSQL logs, credentials, volume identity, and original encryption key. A new `.env` cannot decrypt old data. Do not reset the database as a diagnostic step. |
| Password changed in `.env`, login still fails | PostgreSQL initialization variables do not update an existing role. Restore the correct configuration; any intentional password change needs coordinated database administration. |
| Settings appear reset after directory rename | Compose project identity determines volume names. Restore the original `COMPOSE_PROJECT_NAME`/deployment identity before creating data in a new volume. |
| Legacy SQLite startup refusal | Follow the migration section in [Installation](INSTALLATION.md). Back up first and import into an empty target. |
| Invalid admin token | Use `ADMIN_TOKEN`, not the encryption key, provider token, or private manifest token. Check whitespace and whether you are reaching the correct instance. |
| Refresh locks the dashboard | Session storage is tab-scoped. A new tab, browser policy, or cleared storage can require unlocking. Lock dashboard intentionally clears this tab. |
| Save fails with Origin error | `PUBLIC_URL` must match the browser's exact scheme/host/port. Preserve headers and routes through the proxy. |
| Save request times out | The write may have committed before the response was lost. Refresh/read back before repeating a destructive operation. |
| Reverse proxy 502 | Confirm the target is reachable from the proxy/container. A container's localhost is not the host's localhost. |
| Deployment checker gets HTML or redirects | An interactive proxy challenge or wrong route is intercepting addon/API traffic. Stremio cannot complete that login flow. |
| No results | Check enabled/saved sources, ID format, source health, cooldowns, and excluded results. A fresh local index is empty. Source outages and conservative matching can legitimately produce zero results. |
| Source says Responded but no results | Responded means a request succeeded, not that it matched this title or has playable files. |
| Source blocked/throttled | Wait for its retry window. Repeated forced searches do not bypass the cooldown. |
| DMM has no imported results yet | Enable DMM and save; enable automatic discovery or save supported manual URLs. Inspect import status for queued work, errors, filename exclusions, and storage-pressure pauses. Catalog processing is intentionally slow and bounded. |
| Searched title is not monitored | Click **Monitor this title** explicitly. Search does not create a watch entry. |
| No monitoring notifications | There is no notification service. Monitoring refreshes discovery; inspect the dashboard or reopen the title in Stremio. |
| Account test fails | Save the replacement token first. Check the token/account and server outbound access. A saved token is not a verified account. |
| Search works but Stremio has no streams | Save a usable RD token and choose Real-Debrid delivery. Check filters, private installation URL, and provider failures. Legacy P2P is disabled. |
| Playback fails despite account test | Cache state is unknown until resolution; provider acceptance, downloading, exact-file selection, or filename rejection may prevent playback. Try another authorized result; inspect the recorded error. |
| Provider error 35 | Lantern records account-specific rejections and temporary cooldowns. Do not repeatedly retry the same rejected release. Filename rules are empirical, not guaranteed fixes. |
| Stremio install button does nothing | Use **Library → Installation → Copy URL** and install through the client. Check OS protocol handling and use the public HTTPS origin for remote devices. |
| Old installation stopped working | URL rotation invalidates old access; reinstall. Guest revocation also invalidates that guest's links. |
| Invitation fails | It may be used, expired (48 hours), revoked, or removed. Create a new invitation privately; do not share the owner token. |
| Lost guest management link | Revoke/remove and invite again. The owner UI cannot recover it. The user must re-enter their own provider token. |
| HTTP 429 behind proxy | The app limits requests by socket IP, so proxied users share the bucket. Wait before retrying; avoid aggressive external polling. |

For a bug report include version, deployment mode, client/browser version, redacted error, reproduction steps, and expected behavior. Describe whether the failure is local, proxy-only, source-specific, or provider-specific. Security reports use [SECURITY.md](../SECURITY.md), not public issues.

# Public release preparation — 2026-10-28

## Scope

Prepared for `jtechbyte/lantern`, with MIT licensing approved by the maintainer. The working application and approved UI were preserved. A source checkpoint was created before documentation changes. Publication uses a separate curated checkout rather than importing the development workspace wholesale.

Included: working source/UI, scripts/tests, Docker deployment files, lockfile, sanitized `.env.example`, new public guides, issue/PR templates, security policy, changelog, license, dependency notices, and two actual-application screenshots. Internal deployment conversations, old ZIP instructions, research captures, logs, databases, runtime data, credentials, artifacts, and dependency folders are excluded.

## Checks performed

| Check | Result and scope |
| --- | --- |
| Clean `npm ci` | Passed in the curated release directory; 108 packages added, 0 reported vulnerabilities. Transitive `whatwg-encoding` deprecation remains. |
| Clean `npm ci --omit=dev` | Passed in a separate temporary production tree; 104 packages added, 0 reported vulnerabilities; production server/storage modules imported successfully. |
| `npm test` | 115 passed, 0 failed/skipped. Uses isolated fixtures, including PGlite; not a native PostgreSQL certification. |
| `npm run check:browser` | Passed real headless browser workflows/layout assertions with synthetic data and no JavaScript/CSP errors. |
| `node scripts/functional-audit.mjs` | Passed UI-to-handler/storage workflows with isolated data and simulated external transports. |
| `node scripts/release-smoke.mjs` | Passed process restart/persistence, protected routes, redaction, and local deployment-check endpoints using disk-backed test storage. |
| Both setup scripts | Fresh temporary directories: generated secrets, rerun preserved credentials, missing database password added without replacing admin/encryption keys. Shell script exercised with Git Bash, not Ubuntu. |
| Compose document | Parsed successfully as YAML and inspected against Dockerfile/environment usage. Docker Engine unavailable; native Compose commands not executed. |
| Documentation | 139 relative Markdown/image targets resolved; 13 shell command blocks passed Bash syntax checking. Source and handlers reviewed for settings, limits, routes, and behavior. Syntax checking is not execution of Docker/recovery commands. |
| Screenshots | Fresh isolated instance captured at 1366 × 768. Empty unlock field and Overview inspected; no secrets, private links, personal data, or mockup images included. |
| Publication contents | Staged text checked against local `.env` secrets/private values, private workstation references, and common GitHub token/private-key markers; no matches. This is a targeted scan, not proof against every possible secret format. |
| Git history | Original project had no `.git` history. Initial release history is created only from the curated, reviewed files; no history rewrite or credential rotation performed. |
| Dependencies | 108 locked package license declarations reviewed; installed LICENSE/NOTICE files preserved. Two licenses extracted from package READMEs and boolbase's missing package notice supplemented from upstream. |

## Remaining checks

Native Linux/Docker build and volume permissions; PostgreSQL networking and actual dump/restore/rollback; Caddy DNS/TLS and tunnel deployment; real Stremio installation and authenticated Real-Debrid playback; physical mobile keyboards, native clipboard prompts, screen readers, cross-browser zoom; sustained load and database/disk failures.

These gaps are documented in the release candidate rather than described as passed. The [installation walkthrough](INSTALLATION.md) and [operations guide](OPERATIONS.md) provide deployment acceptance and recovery steps. No production server or data was changed by this preparation.

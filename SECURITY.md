# Security policy

## Reporting a vulnerability

Use this repository's **Security → Report a vulnerability** action to send a private report through GitHub. Do not post exploit details, live credentials, database contents, or private installation URLs in public issues or pull requests.

Include affected version/commit, reproduction steps using isolated data, expected access boundary, observed impact, and redacted evidence. Do not test other people's instances or contact invited users. No response-time or bounty commitment is currently offered.

If the private-report button is unavailable, open an issue containing only **“Please enable private vulnerability reporting”**, without technical details, or wait for a private channel. Do not send secrets through a public issue. Maintainers must enable [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository) before public launch.

## Supported versions and boundaries

This is the initial 0.1.0 release line; there is no separate long-term maintenance branch. Fixes target the current release. Pre-release verification is described in [release notes](docs/RELEASE_NOTES.md); automated tests are not a security guarantee.

The owner admin token, encryption key, provider tokens, invitations, management links, manifest URLs, and signed playback URLs are credentials. Keep `.env` and database backups private. Preserve the original encryption key for recovery. Encryption protects stored data but not against the server operator, who controls the key and running process.

Use HTTPS for remote access. Avoid publishing PostgreSQL or credential-bearing proxy logs. Dashboard locking clears the current tab; it is not global credential revocation. Guest revocation stops new Lantern access but cannot invalidate provider URLs already issued outside Lantern's control. See [Operations](docs/OPERATIONS.md) and [User guide](docs/USER_GUIDE.md).

# Database size - 0.1.2 verification

Implementation uses SELECT pg_database_size(current_database()) AS database_size_bytes against Lantern's connected database. Bytes travel as decimal strings without JavaScript Number conversion. The authenticated /api/database-size endpoint coalesces concurrent requests and caches for five seconds. Previous measurements keep their original timestamp after failure.

Local checks: 122 automated tests passed, including decimal-unit boundaries, rounding promotion, large integer precision, concurrent cache requests, failures and recovery. Real browser/HTTP polling checks passed with mocked measurement SQL: immediate refresh, ten-second cadence, hidden/tab/lock lifecycle, stale timestamps, recovery, and two browser sessions sharing a cache.

Native architecture, direct SQL accuracy, measurable database growth, layout screenshots and publication verification are pending. This report will be updated with actual workflow evidence before release completion. No production installation is changed.

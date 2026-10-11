# Quarantine worker lifecycle integration tests

Run from the workspace root:

```sh
pnpm run typecheck:libs
pnpm --filter @workspace/api-server run test:scan-worker
```

Requires the configured **development** PostgreSQL database with the current
schema and permission to create/drop a schema. Do not run against production.
No ClamAV installation, network signature update, or object-storage access is
needed. Existing real-ClamAV clean/EICAR tests remain separate.

The runner bundles the actual worker, scanner orchestration and download route
into fresh child processes. Only storage is replaced with a controllable stream,
and scanner executables are deterministic local scripts. PostgreSQL compare-and-set
updates, definition freshness checks, retry delays and digest verification remain
real. A process-local clock skips waiting for ten-minute leases.

Each run creates a UUID-named schema containing empty copies of the three needed
tables. Worker connections use only that schema (no public fallback); the running
application cannot claim test fixtures, and the test workers cannot claim real
evidence. Test-only identity injection is confined to ephemeral loopback servers.
Processes, temporary files and the isolated schema are removed in `finally`,
including on assertion failures. Force-killing the entire test runner can leave a
`scan_test_*` schema or temporary directory; these contain only test fixtures.

Coverage: two-process contention forced at the SQL update lock, SIGKILL/restart
before and at lease expiry, fencing of late worker results, missing objects,
interrupted streams, stale definitions, retry backoff, recovery to a clean digest,
and terminal malware rejection. All observed non-clean states are checked through
the real download endpoint for HTTP 423; successful recovery verifies exact bytes.

# Packaging concurrency regression checks

Run from the workspace root:

```sh
pnpm test:packaging-concurrency
```

Requires installed workspace dependencies and a **development/test PostgreSQL database** configured through `DATABASE_URL`, with the current packaging schema applied. Never point this command at production.

The API checks start the real Express packaging router on an ephemeral loopback port and exercise real PostgreSQL transactions. No development workflows, login, object storage, or AI requests are needed. Each case creates UUID-prefixed test records and deletes its own history and records in `finally`; it does not truncate tables or alter existing records. An interrupted process may leave `CAS-TEST-` records behind.

Coverage:

- Two concurrent HTTP PUTs sharing a token produce exactly one success and one `EDIT_CONFLICT`; persisted allocations and history belong only to the winner.
- Missing, blank, and malformed preconditions reject without changing data or the version.
- A stale empty allocation list cannot clear newer entries. Omitted allocations retain entries; an explicitly reviewed clear succeeds.
- A genuine microsecond PostgreSQL timestamp accepts the millisecond token exposed to clients. A future fixture deterministically checks that successful writes advance the token even when the wall clock cannot provide a newer value.
- Component tests render the actual editor, conflict review, and allocation fields in jsdom. Only mutation/list API boundaries and unrelated detail panels are mocked. They cover draft preservation, save blocking, explicit reconciliation, refreshing the reviewed token, a second conflict, successful save, and failed/deleted-record reloads.

“Reload” here means **Reload latest · keep my draft**, not browser refresh; this suite does not promise persistent drafts across page navigation.

Run layers separately:

```sh
pnpm --filter @workspace/scripts exec tsx --test ../artifacts/api-server/src/routes/packaging-concurrency.test.ts
pnpm --filter @workspace/ghazi-plast exec vitest run --config vitest.config.ts
```

The targeted Vitest configuration intentionally selects `*.regression.test.tsx`; older standalone assertion scripts remain separate.

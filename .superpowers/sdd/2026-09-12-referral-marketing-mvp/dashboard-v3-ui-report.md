# Referral Marketing Dashboard V3 UI report

## Result

The Super Admin `ReferralMarketingDashboard` now consumes the exact
`ReferralMarketingOverview` V3 projection contract from `functions/src/referrals.ts`
at server baseline `6a5705b`.

No Functions, Firestore rules/index/config, deployment script, `ReferralCard`, or
client referral-library file was changed.

## UI contract and safety

- The parser now requires `contractVersion: 3`, `summaryEpoch: 'referral-v3'`,
  the ready/migration state, telemetry state, every funnel counter including
  `cancelled`, currency-separated credit totals, and all bounded page envelopes.
- It rejects malformed or unsafe numeric/currency/date/identity data, duplicate
  page identities, inconsistent funnel aliases/status totals, invalid cursors,
  pageable truncation without a continuation, and a continuation on the fixed
  top-referrer ranking.
- `migrationRequired` is accepted only as the canonical empty/unavailable server
  envelope. The dashboard renders an explicit migration panel and never renders
  its placeholder zeros as live metrics or enables program/reward actions.
- The migration panel offers only the authenticated
  `initializeReferralMarketingV3` callable. It requires a destructive-context
  confirmation, sends the empty payload, strictly validates the idempotent result,
  reports progress/failure, and explains that existing history requires a reviewed
  Admin SDK reconciliation rather than runtime seeding.
- Unavailable telemetry is displayed as unavailable, not as a measured zero;
  verified capped telemetry is labelled explicitly.

## Pagination and interactions

- Programs, pending rewards, flagged rewards, and audit history use their V3
  continuation fields and expose `Charger la suite` controls.
- Each mutable collection states how many rows are loaded and whether the response
  remains partial; even a terminal page tells the operator to refresh for recent
  mutations. Top referrers are honestly labelled as a fixed top 10, with explicit
  truncation copy and no fabricated cursor.
- Cursor responses append only their target collection. Duplicate/overlapping pages
  fail closed, and a migration response received during pagination immediately
  replaces the dashboard and invalidates other in-flight work.
- The request coordinator allows independent collection pages while invalidating
  stale same-collection work, all cursor work on refresh/initialization, and every
  request on unmount. Page-specific loading and recoverable errors preserve already
  loaded partial rows.
- Existing program create/update/status controls, audit filters, reward
  approve/reject, fraud flag/clear, reason validation, currency-safe formatting,
  and per-reward locks remain intact.

## Tests

The component test now covers:

- exact ready and migration-required V3 envelopes;
- incompatible versions/epochs/states, telemetry mismatches, status-total and alias
  inconsistencies, malformed pages/cursors/currencies/numbers/audit data/fraud flags,
  duplicates, and independently paged pending/flagged queues;
- fixed top-10 semantics, cursor request construction, append/overlap behavior, and
  migration promotion during pagination;
- strict initializer results and coordinator races across refresh, initialization,
  independent pages, same-page replacement, and cancellation;
- the existing funnel, formatting, reason-validation, and per-reward-lock behavior.

Fresh verification:

```text
node --test src/app/components/superadmin/ReferralMarketingDashboard.test.mjs
18 tests passed, 0 failed

npm run build
vite production build completed successfully (2,836 modules transformed)

git diff --check -- src/app/components/superadmin/ReferralMarketingDashboard.tsx \
  src/app/components/superadmin/ReferralMarketingDashboard.test.mjs
completed with no whitespace errors
```

An independent scoped code review reported no Critical or Important findings and
confirmed alignment with the V3 server contract, initializer boundary, pagination,
preserved actions/filters, and per-reward locking requirements.

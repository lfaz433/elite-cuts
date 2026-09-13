# Referral Marketing V3 overview projection report

## Result

`getReferralMarketingOverview` now reads a server-maintained V3 projection. It does not scan `referralPrograms`, `referralCodes`, `referralAttributions`, `referralRewards`, or `creditLedgers`.

The projection epoch is `referral-v3` with summary schema version `1` and canonical-row summary version `1`.

## Projection documents

- `referralMarketingSummaries/overview` owns platform counts and approved credit totals by ISO currency.
- `referralProgramSummaries/{programId}` owns projected program display fields, program counts, program telemetry, and approved credit totals by currency.
- `referralReferrerSummaries/{ownerType}__{ownerId}` owns typed ranking counts and inviter-leg approved credit totals by currency.
- `referralOwnerSummaries/{ownerType}__{ownerId}` remains the typed workspace projection and now receives the same authoritative transitions.
- `referralOwnerProgramCodes/{collisionSafeTypedOwnerProgramKey}` provides exact code reuse without an owner-code scan.
- Canonical programs, program state, codes, attributions, booking evidence, rewards, referral audit rows, telemetry rows, and owner-history rows carry the active epoch/version marker.

Program create/update, code creation, attribution, pending reward issuance, approval/rejection/cancellation, flag/clear, and recorded telemetry update their affected projections in the same Firestore transaction as the canonical write. Counter and currency transitions reject underflow, unsafe integers, wrong identity, unsupported currencies, and wrong-epoch summaries. Transaction decisions use the old canonical state, so retries do not duplicate increments.

## V3 callable contract

The response always includes:

```ts
{
  contractVersion: 3,
  state: 'ready' | 'migrationRequired',
  summaryEpoch: 'referral-v3',
  telemetry: { state: 'verified' | 'unavailable', validatedVisits: number, capped: boolean },
  programs: { items, nextPageToken?, truncated },
  funnel,
  approvedCreditTotals,
  topReferrers: { items, nextPageToken?, truncated },
  pendingRewards: { items, nextPageToken?, truncated },
  flaggedRewards: { items, nextPageToken?, truncated },
  auditTrail: { items, nextPageToken?, truncated },
}
```

Program, pending, and flagged pages default to 10 and accept limits from 1 through 20. Audit defaults to 20 and accepts 1 through 50; legacy request field `limit` remains an audit-limit alias. Top referrers are fixed at 10. Every collection query requests `limit + 1`, orders by its metric/time and document ID, and returns a continuation only when the extra row exists. Continuation document IDs are treated as opaque tokens and source/filter validated before use.

Pending and flagged page items are validated against exact booking, booking-evidence, attribution, code, and program documents. Approved aggregate and ranking amounts come only from the approval transaction that also creates both deterministic canonical ledger legs; the reader never derives money from raw ledger rows.

If `referralMarketingSummaries/overview` is missing, malformed, or from another epoch, the callable returns `state: 'migrationRequired'`, zero counts, and empty non-truncated pages without querying historical referral collections. Wrong-epoch audit, telemetry, owner-history, or canonical source rows are not merged into V3.

The existing SuperAdmin UI parser still accepts only contract version 2, so it rejects the V3 payload instead of rendering inferred fields. No UI file was changed.

## Staging prerequisites

Before enabling V3 writes, staging must create a validated empty `referralMarketingSummaries/overview` for epoch `referral-v3`. Runtime code deliberately does not infer that a missing summary means an empty historical dataset.

The deployed Firestore index configuration must cover the bounded query shapes for program summaries, referrer summaries, pending/flagged rewards, filtered/unfiltered referral audit, owner history, and earliest eligible bookings. Firestore rules/index/deploy files were intentionally not changed in this task.

## Verification output

Command:

```text
./node_modules/.bin/jest --runInBand functions/src/referrals.test.ts functions/src/bookings.test.ts
```

Output:

```text
Test Suites: 2 passed, 2 total
Tests:       93 passed, 93 total
Snapshots:   0 total
Time:        5.494 s, estimated 6 s
Ran all test suites matching functions/src/referrals.test.ts|functions/src/bookings.test.ts.
```

Command:

```text
cd functions && npm run build
```

Output:

```text
> build
> tsc
```

Command:

```text
node --test src/app/components/superadmin/ReferralMarketingDashboard.test.mjs
```

Output summary:

```text
1..15
# tests 15
# suites 0
# pass 15
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1007.48225
```

The referral tests explicitly exercise no-scan query spying, callback retry idempotency, typed client/brand ID separation, EUR/USD partitioning, program pause/reactivation, telemetry caps, approval/rejection/flag transitions, stable continuation pages, legacy migration safety, and protected client authorization paths.

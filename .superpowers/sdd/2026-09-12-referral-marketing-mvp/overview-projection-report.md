# Referral Marketing V3 overview projection report

## Result

`getReferralMarketingOverview` now reads a server-maintained V3 projection. It does not scan `referralPrograms`, `referralCodes`, `referralAttributions`, `referralRewards`, or `creditLedgers`.

The projection epoch is `referral-v3` with summary schema version `1` and canonical-row summary version `1`.

## Projection documents

- `referralMarketingSummaries/overview` owns platform counts and approved credit totals by ISO currency.
- `referralMarketingState/v3` is the server-owned initialization/reconciliation gate. A summary is never trusted without this exact gate.
- `referralProgramSummaries/{programId}` owns projected program display fields, program counts, program telemetry, and approved credit totals by currency.
- `referralReferrerSummaries/{ownerType}__{ownerId}` owns typed ranking counts and inviter-leg approved credit totals by currency.
- `referralOwnerSummaries/{ownerType}__{ownerId}` remains the typed workspace projection and now receives the same authoritative transitions.
- `referralOwnerProgramCodes/{collisionSafeTypedOwnerProgramKey}` provides exact code reuse without an owner-code scan.
- Canonical programs, program state, codes, attributions, booking evidence, rewards, referral audit rows, telemetry rows, and owner-history rows carry the active epoch/version marker.

Program create/update, code creation, attribution, pending reward issuance, approval/rejection/cancellation, flag/clear, and recorded telemetry update their affected projections in the same Firestore transaction as the canonical write. Counter and currency transitions reject underflow, unsafe integers, wrong identity, unsupported currencies, and wrong-epoch summaries. Transaction decisions use the old canonical state, so retries do not duplicate increments. Reward IDs are bounded `rr_v1_` plus a SHA-256 digest of the canonical JSON `[programId, invitedUserId]`; ledger, evidence, audit, and history references use that same 70-character identity.

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

Program, pending, and flagged pages default to 10 and accept limits from 1 through 20. Audit defaults to 20 and accepts 1 through 50; legacy request field `limit` remains an audit-limit alias. Top referrers are a fixed top 10: `truncated` truthfully reports whether more ranking rows exist and `nextPageToken` is never returned because that result is not request-pageable. Other collection queries request `limit + 1`, order by their metric/time and document ID, and return a continuation only when the extra row exists. Continuation document IDs are treated as opaque tokens and source/filter validated before use.

Pending and flagged page items are validated against exact booking, booking-evidence, attribution, code, and program documents. Approved aggregate and ranking amounts come only from the approval transaction that also creates both deterministic canonical ledger legs; the reader never derives money from raw ledger rows.

If `referralMarketingState/v3` or `referralMarketingSummaries/overview` is missing, malformed, or from another epoch, the callable returns `state: 'migrationRequired'`, zero counts, and empty non-truncated pages without querying historical referral collections. A manually written shallow zero summary therefore cannot fabricate an empty dashboard over legacy rows. Wrong-epoch audit, telemetry, owner-history, or canonical source rows are not merged into V3.

`getMyReferralWorkspace` applies the same exact gate and global-summary validation before reading an owner summary, attribution, or owner history. Its V3 response exposes `state: 'ready' | 'migrationRequired'`; a missing/invalid gate returns an unavailable zero summary and empty, non-truncated history without running the owner-history query.

Referral eligibility now requires `booking.isTest === false`, exactly matching both bounded earlier-booking queries. The authoritative `bookings` writer persists `isTest: false` for every new normal/staff booking, and Firestore rules keep the field immutable. Missing legacy values fail closed and cannot earn or suppress a later canonical positive-paid booking.

The SuperAdmin UI parser accepts only contract version 3 with the exact `referral-v3` epoch and rejects incompatible payloads instead of rendering inferred fields.

## Initialization and migration gate

`initializeReferralMarketingV3` is an authenticated Super Admin callable with no seed payload. In one idempotent transaction it checks the gate and overview, then uses only `limit(1)` existence queries over all referral canonical/projection collections and referral-kind ledger queries. It creates the `initialized-empty` gate and zero overview only when no referral history exists. Any legacy row or prewritten overview produces `failed-precondition`; a repeat over a valid gate/summary returns `alreadyInitialized: true`.

Empty staging should deploy indexes/functions, wait for indexes to become ready, and invoke this callable once. A project with history must use a separately reviewed Admin SDK reconciliation tool to validate/backfill canonical V3 rows and projections and atomically create a `status: reconciled` gate with the evidence-backed summary. The runtime initializer has no manual override or arbitrary seed path.

`firestore.indexes.json` is wired through `firebase.json` and covers scoped memberships, earlier-eligible-booking existence checks, the equal-timestamp/lower-document-ID tie-break query, program summaries, typed referrer rankings, pending/flagged detail, all five audit variants, and owner history. Reward creation and approval prove there is neither a strictly earlier positive-paid completion nor an equal-time completion with a lower document ID using two bounded `limit(1)` multi-range queries; they do not use the invalid pattern of ordering first by a field other than the inequality field. The documented `npm --prefix functions run deploy:staging` and explicitly confirmed production script both deploy `firestore:rules,firestore:indexes,functions` only after verifying their `.firebaserc` aliases.

## Verification output

Command:

```text
./node_modules/.bin/jest --runInBand functions/src/referrals.test.ts functions/src/bookings.test.ts rules-tests/booking-create.test.cjs rules-tests/booking-payment.test.cjs rules-tests/environment-config.test.cjs
```

Output:

```text
Test Suites: 5 passed, 5 total
Tests:       161 passed, 161 total
Snapshots:   0 total
Time:        7.121 s
Ran all test suites matching functions/src/referrals.test.ts|functions/src/bookings.test.ts|rules-tests/booking-create.test.cjs|rules-tests/booking-payment.test.cjs|rules-tests/environment-config.test.cjs.
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
# duration_ms 669.788959
```

The Firestore emulator also loaded `firestore.indexes.json` and executed the
exact multi-range eligibility shape against seeded data, returning
`eligible-query-docs=1,tie-query-docs=1` with exit code `0`.

The rollout follow-up also ran `booking-create-concurrency` and
`booking-transition-enforcement` through the Firestore emulator: 2 suites and
10 tests passed in 6.279 seconds. This verifies that a normal authoritative
booking persists `isTest: false`, and browser updates cannot add or change the
server-owned field.

The referral tests explicitly exercise no-scan query spying, callback retry idempotency, typed client/brand ID separation, EUR/USD partitioning, program pause/reactivation, telemetry caps, approval/rejection/flag transitions, stable continuation pages, legacy migration safety, empty-first/repeat initialization, shallow global/owner-summary rejection, exact index/deploy-script coverage, missing-`isTest` fail-closed behavior, free/paid ordering, fixed top-ten semantics, maximum-length hashed reward creation/review/history pagination, and protected client authorization paths.

## V3 static contract review — round 1

The server export now narrows `ReferralMarketingOverview.summaryEpoch` from
`string` to the literal `'referral-v3'`. Both the server and dashboard exports
use a dedicated fixed-page type for `topReferrers` whose
`nextPageToken?: never` member makes a ranking cursor a compile-time error.
The dashboard page parser has literal-boolean overloads: pageable collections
retain `nextPageToken?: string`, while the fixed top-ten branch returns the
non-pageable type without a cast. Runtime parsing and response behavior are
unchanged.

TDD red evidence:

- `npm --prefix functions run build` exited `2` with two `TS2578` errors,
  proving the server's arbitrary epoch and top-referrer token were still
  accepted by the old export.
- `node --test src/app/components/superadmin/ReferralMarketingDashboard.test.mjs`
  reported 21 tests, 20 passed and 1 failed. The new real TypeScript consumer
  fixture produced `TS2578` for the unused forbidden-token expectation,
  proving the client export was still pageable. Its invalid-epoch expectation
  was already consumed because the client epoch was already literal.

Green verification:

```text
npm --prefix functions run build
> build
> tsc
exit 0

node --test src/app/components/superadmin/ReferralMarketingDashboard.test.mjs
1..21
# tests 21
# pass 21
# fail 0
# duration_ms 2668.777375

npm run build
✓ 2836 modules transformed.
✓ built in 6.02s
exit 0
```

The compile-time probes remain in `functions/src/referrals.contract.test.ts`
and `ReferralMarketingDashboard.contract.test.ts`; removing either literal
epoch or fixed-page guarantee makes the corresponding build/test fail. The
implementation and this report are included under commit subject
`fix: align referral V3 static contracts`. No Firebase deployment was run.

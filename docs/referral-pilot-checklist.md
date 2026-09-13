# Referral pilot checklist

Use four separate staging accounts: a Super Admin, an inviter, an invited
client, and a booking provider. Record the account IDs and evidence for every
completed step. Pilot only against `elite-cuts-staging`; do not use production.

## Local acceptance evidence

- [ ] Create an active France/EUR referral program as Super Admin and reserve
  an active code for the inviter. Confirm the code is globally unique and its
  owner appears in the inviter's referral workspace.
- [ ] Open `/r/<CODE>` in a clean browser profile. Confirm the welcome screen
  displays the code, stores it only in local browser storage, treats the
  capture as expired after 30 days and clears it on the next read, and does not
  create an account or directly write Firestore data.
- [ ] Call the public `recordReferralVisit` endpoint with the valid code.
  Confirm the Super Admin overview increments validated visits without creating
  an attribution, reward, or credit. Repeat with a missing, paused, expired,
  or archived code and confirm it returns unavailable and records no visit.
  Before this test, configure the staging web Firebase App Check provider and
  its site keys, then verify callable enforcement with a fresh limited-use
  token. A missing, invalid, or already-consumed token must not write a count.
  Telemetry is best-effort: this failure must not block referral-code
  validation or browsing. Treat the metric as capped, non-unique validated
  calls rather than unique visitors: a fresh-token replay can increase a
  code's count only to 10,000 and the staging platform total only to
  1,000,000; neither counter has financial effect.
- [ ] Attribution once — **deferred for browser pilot**. The landing route
  captures the code, but current client registration has no role-onboarding
  path that reads the capture and calls `attributeReferral` after Firebase Auth
  account creation. Do not mark this step passed until that integration exists;
  when it does, confirm a second code cannot replace the first attribution.
- [ ] Create a cancelled, declined, refunded, missing/unpaid, free/zero-value,
  or test booking for the attributed invited client. Confirm no referral reward
  is created and that it does not consume the eligible-first-booking slot.
- [ ] Transition the invited client's first positive-paid, non-test booking from
  `confirmed` (or legacy `approved`) to `completed`. Confirm exactly one
  pending reward pair is created after any earlier ineligible booking, and the
  completion remains successful if no valid referral is present. Add a second
  positive-paid completion and confirm it cannot create a second reward or
  invalidate approval of the earlier timestamped eligible reward. Confirm a
  positive-paid legacy booking lacking `completedAt` fails referral eligibility
  safely rather than guessing its order. Confirm a tenant manager cannot
  directly backdate or otherwise change `completedAt` or `isTest`; normal
  server completion/payment workflows must remain able to record them.
- [ ] Retry the same completed-booking event. Confirm the deterministic reward
  is returned or retained and no duplicate reward or credit ledger entry is
  created.
- [ ] As Super Admin, approve the pending reward. Confirm both approved
  non-cash credit-ledger entries and an audit event are created; reject tests
  must include a reason and create no credit.
- [ ] As Super Admin, flag a pending reward with a non-empty reason. Confirm it
  appears in the manual-review queue, adds a referral audit event, and changes
  neither reward status nor ledger balances. Clear the flag with a reason and
  confirm only a Super Admin can perform either action. Confirm approval is
  refused while flagged and that only explicit flag clearance followed by an
  explicit Super Admin approval can issue credits.
- [ ] Confirm the Super Admin overview shows validated visits, attributed
  sign-ups, eligible first bookings, pending/approved rewards, issued credits
  by currency, typed top referrers, and a bounded referral audit search. Use a
  client and brand with the same identifier string to verify their top-referrer
  rows remain separate. Verify audit lookup by normalized code and a separate
  program, reward, or action filter returns the relevant referral rows with
  privileged actor/reason details, not generic application audit events.
- [ ] Pause the referral program. Confirm new code use and reward eligibility
  are blocked while existing booking behavior remains unaffected.
- [ ] Attempt authenticated browser writes to `referralPrograms`,
  `referralCodes`, `referralAttributions`, `referralRewards`, and
  `creditLedgers`, `referralTelemetry`, and referral audit records. Confirm every
  direct write is denied.
- [ ] Confirm the pilot contains no cash payout, withdrawal, transfer, bank
  action, Stripe charge, Stripe checkout, or automatic price reduction.

## Required local verification

Run the targeted build and client/dashboard tests:

```bash
npm run build && npm --prefix functions run build && node --test src/app/lib/marketplace/referrals.test.mjs src/app/components/superadmin/ReferralMarketingDashboard.test.mjs
```

Then run the referral rules suite together with the existing auth, booking,
privacy, and membership suites through the Firestore emulator:

```bash
firebase emulators:exec --only firestore "PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node ./node_modules/jest/bin/jest.js --config='{\"testEnvironment\":\"node\",\"rootDir\":\".\",\"transform\":{}}' --runInBand --runTestsByPath rules-tests/referral.rules.test.cjs rules-tests/authz.rules.test.cjs rules-tests/booking-create.test.cjs rules-tests/booking-create-concurrency.test.cjs rules-tests/booking-payment.test.cjs rules-tests/booking-privacy.rules.test.cjs rules-tests/booking-status.test.cjs rules-tests/booking-transition-enforcement.test.cjs rules-tests/booking-transition-state.test.cjs rules-tests/membership-permissions.test.cjs rules-tests/membership.rules.test.cjs"
```

`PERMISSION_DENIED` messages for the direct-write cases are expected when the
Jest command passes: they are the assertions under test.

## Staging release gate

- [ ] Initialize the V3 projection through the authenticated Super Admin
  `initializeReferralMarketingV3` callable. On an empty staging project it
  atomically creates the server-owned initialization gate and zero overview;
  repeating the call must return `alreadyInitialized: true`. Never seed
  `referralMarketingSummaries/overview` manually. If any legacy referral
  program, code, attribution, reward, referral ledger, telemetry, audit,
  evidence, or projection row exists, the callable must fail with
  `failed-precondition` and the dashboard must remain `migrationRequired`.
- [ ] For a staging project with referral history, run the separately reviewed
  Admin SDK reconciliation workflow: backfill and validate every V3 canonical
  row and projection, then atomically write the exact `referral-v3`
  `status: reconciled` gate with its reconciled overview. The runtime callable
  intentionally cannot turn arbitrary legacy rows into a trusted projection.
  Record reconciliation counts and currency totals before continuing.
- [ ] Keep referral telemetry disabled in the browser until Firebase Web App
  Check has been initialized with the staging provider and site key. Enable
  telemetry only after a fresh limited-use token reaches `recordReferralVisit`;
  verify missing, invalid, and consumed tokens are rejected with no aggregate
  write. Referral landing and public-code validation must continue if reporting
  fails. App Check and the two-instance callable cap reduce abusive work but do
  not make public browser invocation cost mathematically DDoS-free.

Before a Functions deployment, confirm that the staging Firebase project has
Blaze billing and that deployment credentials are authorized. Then deploy only
staging:

```bash
firebase deploy --only firestore:rules,firestore:indexes,functions --project staging
```

Verify Firebase resolves `staging` to `elite-cuts-staging`. Never substitute
the production alias or project ID. Wait until every composite index reports
ready before invoking V3 overview/workspace queries. Then run the empty-first
initializer or the reviewed reconciliation workflow above, run the four-user
pilot, and make the release decision from its recorded evidence.
The deferred browser registration-attribution step must be recorded as a
release limitation; it is not a prerequisite to deploy to staging.

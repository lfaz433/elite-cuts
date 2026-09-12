# Task 5 report — Referral pilot verification

## Delivered

- Added `docs/referral-pilot-checklist.md`, a repeatable four-user staging
  acceptance checklist covering code creation, link capture, one-time
  attribution, ineligible and eligible bookings, retry idempotency, manual
  review, pause behavior, Firestore direct-write denials, and the non-cash
  boundary.
- Added the repository `README.md` with a link to the checklist and the
  staging-only deployment guard.
- Kept cash payouts, transfers, withdrawals, Stripe charges/checkouts, and
  automatic price reductions out of scope.

## Local verification

Executed successfully:

```bash
npm run build && npm --prefix functions run build && node --test src/app/lib/marketplace/referrals.test.mjs src/app/components/superadmin/ReferralMarketingDashboard.test.mjs
```

Results:

- Vite production build: passed (`✓ built in 4.11s`).
- Functions TypeScript build: passed (`tsc`, exit code 0).
- Referral client and Super Admin dashboard tests: 8 passed, 0 failed.

Executed successfully:

```bash
firebase emulators:exec --only firestore "PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node ./node_modules/jest/bin/jest.js --config='{\"testEnvironment\":\"node\",\"rootDir\":\".\",\"transform\":{}}' --runInBand --runTestsByPath rules-tests/referral.rules.test.cjs rules-tests/authz.rules.test.cjs rules-tests/booking-create.test.cjs rules-tests/booking-create-concurrency.test.cjs rules-tests/booking-payment.test.cjs rules-tests/booking-privacy.rules.test.cjs rules-tests/booking-status.test.cjs rules-tests/booking-transition-enforcement.test.cjs rules-tests/booking-transition-state.test.cjs rules-tests/membership-permissions.test.cjs rules-tests/membership.rules.test.cjs"
```

Result: 11 suites passed, 95 tests passed, 0 snapshots, exit code 0. Expected
Firestore `PERMISSION_DENIED` outcomes are asserted by the referral
direct-write-denial suite.

## Staging release prerequisites — not performed

The staging deploy command was deliberately not run:

```bash
firebase deploy --only firestore:rules,functions --project staging
```

It remains blocked until all of the following are true:

1. `elite-cuts-staging` has Blaze billing and authorized deployment
   credentials, because Cloud Functions deployment requires Blaze.
2. Browser client registration implements role onboarding, reads the unexpired
   local referral capture, and calls `attributeReferral` exactly once after
   Firebase Auth account creation. This registration attribution is
   intentionally deferred in the current MVP.
3. A four-user staging pilot completes every checklist item with evidence.

No Firebase Console state, Firestore rule deployment, Functions deployment,
or production target was changed during this task.

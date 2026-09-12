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
  Treat the metric as raw validated calls rather than unique visitors: public
  calls can be repeated until staging rate limiting/App Check is available.
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
  positive-paid completion and confirm it cannot create a second reward.
- [ ] Retry the same completed-booking event. Confirm the deterministic reward
  is returned or retained and no duplicate reward or credit ledger entry is
  created.
- [ ] As Super Admin, approve the pending reward. Confirm both approved
  non-cash credit-ledger entries and an audit event are created; reject tests
  must include a reason and create no credit.
- [ ] As Super Admin, flag a pending reward with a non-empty reason. Confirm it
  appears in the manual-review queue, adds a referral audit event, and changes
  neither reward status nor ledger balances. Clear the flag with a reason and
  confirm only a Super Admin can perform either action; an explicit Super Admin
  approval is still required before credits issue.
- [ ] Confirm the Super Admin overview shows validated visits, attributed
  sign-ups, eligible first bookings, pending/approved rewards, issued credits
  by currency, typed top referrers, and a bounded referral audit search. Use a
  client and brand with the same identifier string to verify their top-referrer
  rows remain separate.
- [ ] Pause the referral program. Confirm new code use and reward eligibility
  are blocked while existing booking behavior remains unaffected.
- [ ] Attempt authenticated browser writes to `referralPrograms`,
  `referralCodes`, `referralAttributions`, `referralRewards`, and
  `creditLedgers`, `referralVisits`, and referral audit records. Confirm every
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

Before a Functions deployment, confirm that the staging Firebase project has
Blaze billing and that deployment credentials are authorized. Then deploy only
staging:

```bash
firebase deploy --only firestore:rules,functions --project staging
```

Verify Firebase resolves `staging` to `elite-cuts-staging`. Never substitute
the production alias or project ID. After the staging deployment, run the
four-user pilot above and make the release decision from its recorded evidence.
The deferred browser registration-attribution step must be recorded as a
release limitation; it is not a prerequisite to deploy to staging.

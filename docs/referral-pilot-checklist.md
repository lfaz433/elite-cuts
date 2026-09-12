# Referral pilot checklist

Use four separate staging accounts: a Super Admin, an inviter, an invited
client, and a booking provider. Record the account IDs and evidence for every
completed step. Pilot only against `elite-cuts-staging`; do not use production.

## Local acceptance evidence

- [ ] Create an active France/EUR referral program as Super Admin and reserve
  an active code for the inviter. Confirm the code is globally unique and its
  owner appears in the inviter's referral workspace.
- [ ] Open `/r/<CODE>` in a clean browser profile. Confirm the welcome screen
  displays the code, stores it only in local browser storage, expires it after
  30 days, and does not create an account or write Firestore data.
- [ ] Attribution once — **deferred for browser pilot**. The landing route
  captures the code, but current client registration has no role-onboarding
  path that reads the capture and calls `attributeReferral` after Firebase Auth
  account creation. Do not mark this step passed until that integration exists;
  when it does, confirm a second code cannot replace the first attribution.
- [ ] Create a cancelled, declined, refunded, free, or test booking for the
  attributed invited client. Confirm no referral reward is created.
- [ ] Transition the invited client's first paid, non-test booking from
  `confirmed` (or legacy `approved`) to `completed`. Confirm exactly one
  pending reward pair is created and the completion remains successful if no
  valid referral is present.
- [ ] Retry the same completed-booking event. Confirm the deterministic reward
  is returned or retained and no duplicate reward or credit ledger entry is
  created.
- [ ] As Super Admin, approve the pending reward. Confirm both approved
  non-cash credit-ledger entries and an audit event are created; reject tests
  must include a reason and create no credit.
- [ ] Pause the referral program. Confirm new code use and reward eligibility
  are blocked while existing booking behavior remains unaffected.
- [ ] Attempt authenticated browser writes to `referralPrograms`,
  `referralCodes`, `referralAttributions`, `referralRewards`, and
  `creditLedgers`. Confirm every direct write is denied.
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

Do not run a Functions deployment until the staging Firebase project has Blaze
billing, credentials are authorized, and the browser attribution integration
above is delivered. Once all local checks and the four-user pilot are complete,
deploy only staging:

```bash
firebase deploy --only firestore:rules,functions --project staging
```

Verify Firebase resolves `staging` to `elite-cuts-staging`. Never substitute
the production alias or project ID.

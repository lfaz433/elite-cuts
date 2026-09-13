# Task 1 report — Referral domain and server validation

## Delivered

- Added `functions/src/referrals.ts`, the server-owned referral domain.
- Added Firebase Functions v1 callable exports in `functions/src/index.ts` for:
  - `createReferralProgram`
  - `reserveReferralCode`
  - `attributeReferral`
  - `reviewReferralReward`
  - `getMyReferralWorkspace` (the required authenticated, read-only safe projection for Task 3)
- Kept `processReferralBookingCompletion` server-only for Task 2 to call after its trusted completed-booking transition. It is deliberately not a client callable.

## Server validation and state

- Referral codes are normalized to uppercase, constrained to 3–32 `A-Z`, `0-9`, and hyphen characters, and reserved transactionally as globally unique document IDs.
- Referral programs validate status, ISO country/currency data, bounded non-negative minor-unit credits, and current date availability. Active-program creation prevents two active programs.
- Attribution derives inviter ownership from the reserved code, rejects self-attribution, requires an active and country-available program, rejects existing bookings and existing attributions, and records a 30-day expiry transactionally.
- Completed-booking processing creates a single `programId__invitedUserId` pending reward only when the supplied booking is the client’s earliest positive-paid completed booking with `isTest === false` and all attribution, code, program, country, and expiry checks hold. Missing or non-boolean `isTest` values fail closed and neither earn a reward nor suppress a later canonical booking. Replays return `{ created: false }`.
- Super Admin reward review supports the pending-to-approved, rejected, and cancelled transitions only. Approval creates two deterministic, append-only non-cash ledger entries; rejection requires a reason. Program changes and reward reviews create `auditEvents`.
- Privileged callable wrappers require authenticated `superadmin` or `platformAdmin` custom claims. Workspace reads require authentication and expose only the caller’s code data, their attribution without inviter identity, and their own reward leg without booking or counterparty data.

## Tests and TDD evidence

The Functions package has no independent Jest setup. The specified command resolved the repository root Jest 30.4.1 installation and was used unchanged.

1. Red: `npm --prefix functions exec jest -- src/referrals.test.ts --runInBand`
   - Failed as expected because `functions/src/referrals.ts` did not exist (7 failing tests).
2. Green: the same focused command passed after the domain implementation.
3. Additional red: a malformed pending reward with `inviterCreditMinor: -1` was accepted for approval. The focused test failed with a resolved `approved` response.
4. Green: review validation was tightened to reject negative reward values. The focused suite passed.
5. Final verification:

   ```bash
   npm --prefix functions exec jest -- src/referrals.test.ts --runInBand
   npm --prefix functions run build
   ```

   Result: 1 test suite passed, 10 tests passed; TypeScript build exited successfully.

`git diff --cached --check` also passed before the commit. A worktree-wide `git diff --check` reports pre-existing trailing whitespace in the unrelated modified `firestore-debug.log`; that file was not changed.

## Self-review

- Confirmed no Stripe, payouts, cash conversion, transfer, withdrawal, or deployment behavior was added.
- Confirmed reward document IDs and ledger document IDs provide retry-safe duplicate prevention under Firestore transactions.
- Confirmed the callable boundary, not caller-supplied payload fields, establishes Super Admin authority and code ownership.
- Confirmed no direct Firestore rules changes were made; Task 2 remains responsible for browser direct-write denials and invoking the server-only booking processor only after a trusted completion transition.

## Commit

- `986af85 feat: add secure referral domain`

## Concerns / follow-up

- This worktree already contains unrelated modifications and untracked dependency directories; they were preserved and excluded from the commit.
- The first focused Jest invocation emitted haste-map warnings caused by the existing untracked `node_modules.incomplete-install` directory. Later focused runs used the cache and completed cleanly; the actual command and passing result are recorded above.
- Task 2 must retain its planned policy and booking-transition work before referral records are safe from browser direct writes or connected to live booking completion.

## Fix round 1 — transaction correctness

### Review findings addressed

1. **Concurrent active-program activation**
   - The prior active-program query could allow two transactions that both read an empty result to activate separate programs.
   - `createReferralProgram` now reads and writes the deterministic `referralProgramState/active` document in its transaction. Activating a program records its ID there; pausing or archiving the current program clears it. Because every activation/deactivation writes the same document, Firestore retries concurrent transactions and the retried contender observes the winning active program and fails with `failed-precondition`.
   - The existing active-program query remains as a migration/integrity check for any old state created before the singleton lock existed.

2. **Booking-reward retry result**
   - The prior `created` variable lived outside the transaction callback. A first attempt could set it to `true`, then a retried callback could observe an existing reward and return without resetting it.
   - `processReferralBookingCompletion` now returns the Boolean result of the transaction callback directly. Every skip/duplicate path returns `false`; only the path that enqueues `transaction.create(rewardRef, ...)` returns `true`.

### Regression tests and verification

- The in-memory Firestore test adapter now buffers transaction writes and detects changes to documents read by a transaction, allowing the focused suite to simulate Firestore retry behavior.
- New concurrent activation test initially failed with two fulfilled activations. It now confirms exactly one fulfilled activation, one `failed-precondition` rejection, one active program, and the matching singleton state document.
- New retry test initially failed because processing returned `{ created: true }` after a retry observed the existing reward. It now returns `{ created: false }`.
- Final verification commands:

  ```bash
  npm --prefix functions exec jest -- src/referrals.test.ts --runInBand
  npm --prefix functions run build
  ```

  Result: 1 test suite passed, 12 tests passed; Functions TypeScript build exited successfully.

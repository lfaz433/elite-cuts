# Final referral server remediation

## Scope

This remediation changes only referral server code, its focused tests, the Functions export registry, and this report. It does not deploy Firebase, modify Firestore rules, add Stripe, or introduce cash rewards, payouts, transfers, or withdrawals.

## Corrected release blockers

### Positive paid-booking eligibility

Reward creation and approval now require the same authoritative payment data written by `functions/src/bookingPayment.ts` and the completed walk-in path:

- `status === 'completed'`
- `isTest !== true`
- `paymentStatus === 'paid'`
- `pricePaidMinor` is a safe integer greater than zero

`paymentStatus` and `pricePaidMinor` are server-written together by the existing atomic payment commands. `pricePaid` is only the derived major-unit display field and is not used for eligibility. A completed zero-value/free booking cannot create a referral reward, and a pre-existing pending reward for one cannot be approved or issue ledger credits.

### Brand workspace scope

`getMyReferralWorkspace` now discovers brand scopes from server-issued active memberships for the caller. Only `principal_admin` and `salon_admin` memberships with a valid `brandId`, plus an existing `brands/{brandId}` document, create a brand workspace. Each workspace is queried only by that authorised `brandId` and returns:

- the brand's referral codes;
- inviter-side brand rewards; and
- currency-separated approved and pending minor-unit credit totals.

Personal caller data remains separate. The response exposes no invitee identity, booking address, email, or cross-brand data. A caller cannot select a brand ID in the request.

### Public code verification

Added unauthenticated `getPublicReferralCode`. It accepts only a normalized code and optional country code, then requires an active code with a recognised owner type/ID and an active, country-available, currently dated referral program. All unavailable states use `not-found` and the success response is intentionally limited to `{ code, status: 'active' }`; it contains no owner identity or profile data.

The stored referral-code status is the authoritative owner availability switch: existing brand and freelancer records have no separate active-state contract, while codes are server-owned and may be paused/archived when their owner is no longer eligible.

### End-to-end generated code creation

Added authenticated `createMyReferralCode` and exported it from `functions/src/index.ts`. It:

- accepts an empty object only, so browser callers cannot provide a program, code, owner type, or owner ID;
- reads the singleton active-program state and validates the active France program;
- selects one permitted persona: authorised brand admin/principal first, otherwise freelancer when a freelancer profile exists, otherwise client;
- rejects Super Admin, legacy admin/barber, and active staff-only accounts;
- checks existing active codes for that exact owner/persona/program and returns one unchanged;
- creates a cryptographically random valid code in a transaction and retries a collision up to eight times.

The old public `reserveReferralCode` callable has been removed from the Functions exports. The internal domain helper remains server-only.

### Client-only attribution

Attribution now requires an existing user profile whose explicit role is either absent or `client`, no freelancer profile, and no active membership. Callable wrappers additionally reject Super Admin/platform-admin custom claims. This blocks freelancers, workers, salon admins, brand principals, legacy admins, Super Admins, and other explicit non-client roles before an attribution is written.

## Tests

Focused tests now cover zero/free reward creation and approval, public unavailable states (missing, paused, archived, future, expired), public-safe success shape, client generation/reuse/collision/payload rejection, brand creation, staff rejection, principal and salon-admin workspace scoping, cross-brand isolation, and all required attribution identity denials.

TDD evidence:

1. The initial focused run failed for the expected missing gates and endpoints: zero-value booking creation/approval succeeded, brand data was absent, public/code-generation functions were missing, and restricted identities could attribute.
2. After the first implementation pass, focused tests passed and the Functions build exposed the paid predicate's TypeScript narrowing issue; the predicate was made a type guard without changing its runtime condition.
3. A follow-up explicit-role test failed for an unknown attribution role and legacy admin code generation. The identity checks were tightened to accept only client/freelancer generation personas and client-only attribution.
4. Final verification:

   ```bash
   npm --prefix functions exec jest -- src/referrals.test.ts --runInBand
   npm --prefix functions run build
   ```

   Result: 1 suite passed, 37 tests passed; the Functions TypeScript build exited successfully.

## Follow-up boundary

Firestore rules remain outside this server-only remediation. The planned referral policy work must continue to deny browser direct writes for every referral collection, including `referralProgramState`, and Task 3 can consume the newly exported `getPublicReferralCode` and `createMyReferralCode` callables.

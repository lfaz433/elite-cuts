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

The old public `reserveReferralCode` callable has been removed from the Functions source exports. The deployed staging endpoint is not removed until a later successful staging Functions deployment; no deployment is part of this remediation. The internal domain helper remains server-only.

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

## Follow-up server remediation: namespace isolation and legacy brand admins

### Legacy admin membership

`createMyReferralCode` now evaluates active `principal_admin` and `salon_admin` memberships before rejecting ordinary legacy profile roles. A legacy `users.role === 'admin'` account can therefore create a brand code only after its active, existing-brand membership authorizes that brand. The same legacy role without an eligible membership remains denied. Super Admin/platform-admin identities remain denied even if they have a membership.

### Durable namespaces

New rewards persist both reward-leg namespaces in the creating transaction:

- `inviterOwnerId` / `inviterOwnerType` come directly from the validated referral code;
- `invitedOwnerId` / `invitedOwnerType` identify the invited client.

Approval validates any already-present namespace against that same code, backfills an older pending reward only inside the approval transaction when the code unambiguously verifies it, and writes each ledger's `ownerId` plus `ownerType` atomically. Workspace reads use both components in Firestore queries for codes, rewards, and brand ledgers. Brand approved totals now derive from typed approved ledger entries; pending totals derive from typed pending rewards.

Historical reward or ledger records without the new namespace are deliberately excluded from workspace projections. This avoids treating a client UID and a brand ID with the same string as the same owner. Existing pending rewards can still be reviewed if their stored code verifies the intended inviter; approval backfills their namespace before issuing credits.

Focused regression coverage includes a legacy admin with and without brand authority, typed reward/ledger writes and approval backfill, and a deliberate `userId === brandId === 'X'` collision proving that neither workspace reads the other namespace's codes, rewards, or ledger totals.

Verification for this follow-up:

```bash
npm --prefix functions exec jest -- src/referrals.test.ts --runInBand
npm --prefix functions run build
```

Result: 1 suite passed, 39 tests passed; the Functions TypeScript build exited successfully.

`npm --prefix functions run lint` was also attempted but cannot run in this repository because ESLint 8 finds no configuration file under `functions/` (it reports the search beginning at `functions/lib`). This remediation does not add or change lint configuration.

## Follow-up server remediation: typed attribution and referral identity

`attributeReferral` now persists `inviterOwnerType` atomically from the validated referral code. `getReferralMarketingOverview` keys its attribution and reward aggregates by the complete `{ inviterId, inviterOwnerType }` identity and returns that type with each top-referrer row. Older attributions or rewards with no recognized owner type are excluded from that grouped output rather than being merged by raw ID; their raw records still remain in the aggregate funnel counts.

Self-referral checks now compare typed principal identities. The invited account is always the `client` principal with its UID, so a code owned by `brand:X` is valid for `client:X`; `client:X` referring itself remains denied. Reward processing checks the live referral-code namespace and backfills a legacy attribution's missing type only in the transaction when that code verifies it. Reward approval applies the same typed comparison and rejects a stored attribution type that conflicts with the code.

Focused regression coverage includes a dashboard collision with client `X`, brand `X`, and legacy untyped records, plus the full client-`X` / brand-`X` attribution, paid-booking reward, and Super Admin approval lifecycle.

Verification for this follow-up:

```bash
npm --prefix functions exec jest -- src/referrals.test.ts --runInBand
npm --prefix functions run build
```

Result: 1 suite passed, 41 tests passed; the Functions TypeScript build exited successfully.

## Final server contract refinement: explicit referral scopes

`createMyReferralCode` no longer infers a persona from an empty request. Its only accepted browser payload is a `scope` object: `{ type: 'client' }`, `{ type: 'freelancer' }`, or `{ type: 'brand', brandId }`. Program ID, code, and owner ID remain server-derived. Client scope requires an explicit client user record and no freelancer/staff identity. Freelancer scope requires an authoritative freelancer profile plus a compatible base user role, and retains the existing exclusion for active salon staff. Brand scope authorizes the exact requested brand against an active principal/salon-admin membership and an existing brand record; it never picks an arbitrary membership. A legacy admin remains eligible only through such a verified brand scope. Super Admin restrictions are unchanged.

`getMyReferralWorkspace` is now a deliberate breaking staging response contract:

- `client` contains only client codes, client inviter rewards, and client invitee attribution/rewards;
- `freelancer` contains only freelancer codes and inviter rewards;
- `brandWorkspaces` contains independently authorized brand sections.

Every reward row carries its `ownerType`, and every section states its identity type. This removes the prior flattened response that forced the UI to guess whether a reward belonged to client, freelancer, or brand scope.

Focused tests cover required scope input, client/freelancer cross-scope denial, freelancer-staff denial, exact multi-brand creation/reuse, malformed/forged selection denial, and non-conflated client invitee/client inviter/freelancer inviter/brand data alongside the prior identifier-collision protections.

Verification for this refinement:

```bash
npm --prefix functions exec jest -- src/referrals.test.ts --runInBand
npm --prefix functions run build
```

Result: 1 suite passed, 44 tests passed; the Functions TypeScript build exited successfully.

## Follow-up server remediation: canonical roleless identity compatibility

Normal signup writes `users/{uid}` as an identity document (`uid`, email/display fields, and timestamps) and deliberately does not set a browser-controlled role. Referral personal-scope authority now follows that real schema instead of requiring `users.role`:

- client code creation and attribution require an existing canonical user document with `users/{uid}.uid === authenticated uid`, no freelancer profile, and no active membership;
- freelancer code creation requires that canonical user document plus the authoritative `freelancerProfiles/{uid}` record written by `saveFreelancerProfile`, whose stored `uid` must also match the authenticated UID;
- any active membership prevents client attribution and both personal code scopes, so staff, salon admins, and brand principals cannot impersonate a client;
- Super Admin/platform-admin identities remain denied; legacy role values are only compatibility hints. An absent role is valid for a canonical client, compatible `client`/`freelancer` values remain valid for their applicable personal scope, and explicit non-personal roles remain denied for personal scopes. A valid exact brand membership is still required for brand scope.

Missing or mismatched `uid` identity data fails closed. Attribution still treats the mere presence of a freelancer profile as a professional signal and denies client attribution, even if that record is malformed.

Focused regression coverage now constructs ordinary identity records without `role`, verifies a roleless canonical client can create/reuse a client code and attribute an unrelated code, verifies a roleless user with the real freelancer profile can use freelancer scope but not client scope, and verifies mismatched identity, freelancer, staff, salon-admin, principal, legacy-admin, Super Admin, and other non-client cases cannot attribute as a client.

Verification for this compatibility remediation:

```bash
npm --prefix functions exec jest -- src/referrals.test.ts --runInBand
npm --prefix functions run build
```

Result: 1 suite passed, 46 tests passed; the Functions TypeScript build exited successfully.

## Follow-up server remediation: paid-first eligibility and observability

The completed-booking and approval transactions now use the identical authoritative `isPositivePaidBooking` predicate when counting a client's prior eligible bookings. A completed free/zero-value, missing/unpaid, cancelled, declined, refunded, or test booking does not consume the first eligible slot. The first positive paid non-test completion can therefore create a reward after an earlier free completion, while a second positive paid completion still prevents reward creation/approval. Both checks remain inside their respective Firestore transactions.

Added private server-written `referralVisits` telemetry and the unauthenticated `recordReferralVisit` callable. It validates the normalized code plus active/current program before writing only `{ code, programId, countryCode, recordedAt }`; unavailable codes write nothing. It returns no owner or visitor information and is entirely isolated from attribution, rewards, and credit ledgers. Visits count validated public calls, not unique people; public call repetition is possible until a platform-level anti-abuse control such as App Check/rate limiting is deployed.

Super Admin-only observability now includes:

- validated visits, attributed sign-ups, eligible first bookings, pending/approved rewards, and approved issued-credit totals separated by currency;
- typed top referrers keyed by `{ inviterId, inviterOwnerType }`;
- a pending flagged-reward queue; and
- a bounded (maximum 50 recent entries) referral audit trail, searchable only by a validated 1–64-character identifier/action fragment and with a caller-requested limit of 1–50.

`setReferralRewardFlag` supports Super Admin flag/clear actions for pending rewards only. Both require a non-empty reason, write a referral audit event, and leave reward status and ledgers unchanged. This MVP has no automatic approval; flagged items remain in the manual-review queue and approval remains an explicit audited Super Admin operation.

Verification for this remediation:

```bash
npm --prefix functions exec jest -- src/referrals.test.ts --runInBand
npm --prefix functions run build
```

Result: 1 suite passed, 50 tests passed; the Functions TypeScript build exited successfully.

## Follow-up server remediation: bounded observability and deterministic paid-first rewards

Referral eligibility now selects the earliest positive-paid, non-test completed booking by the authoritative server-written `completedAt` timestamp, using booking ID only as a deterministic equal-timestamp tie-breaker. Pending rewards persist `eligibleCompletedAtMs`; approval revalidates that exact earliest booking and marker. Consequently, an earlier free booking is ignored, a later paid booking cannot invalidate an already-pending earliest reward, and a second paid booking cannot create another reward. Any positive-paid booking missing a trustworthy `completedAt` fails closed; a legacy pending reward without the marker remains rejectable but cannot be approved into credits.

Public visit telemetry is no longer an unbounded per-request event collection. `recordReferralVisit` transactionally validates the live code/program and increments only two private aggregate documents: an overview counter and a `{programId}__{code}` counter. Counts cap at 1,000,000 platform-wide and 10,000 per code; a capped valid call returns `recorded: false`. They contain no visitor identity, are non-unique/replayable telemetry only, and do not alter attribution, rewards, or ledgers. The Super Admin overview reads its single overview counter rather than scanning public-call records.

Referral history now writes dedicated private `referralAudit` rows for referral program changes, code creation, attribution, pending reward creation, manual flag/clear, and review outcomes. The Super Admin overview reads this collection directly, with one validated `code`, `programId`, `rewardId`, or `action` filter plus a bounded 1–50 limit. Unfiltered history is newest-first; filtered history does not scan generic audit events and returns privileged actor/reason fields only to Super Admins.

Flagged pending rewards now fail explicit approval with no ledger write. A Super Admin must clear the flag with a non-empty reason before a normal explicit approval can proceed. Successful flags, clears, rejects, and approvals all add referral-specific audit rows; legacy invalid rewards remain rejectable without eligibility validation or credits.

Verification for this remediation:

```bash
npm --prefix functions exec jest -- src/referrals.test.ts --runInBand
npm --prefix functions run build
```

Result: 1 suite passed, 52 tests passed; the Functions TypeScript build exited successfully.

## Follow-up server remediation: App Check telemetry, trusted booking evidence, and overview contract v2

`recordReferralVisit` remains a fixed-size, private aggregate only: it validates the live code and program inside a transaction, then increments at most the platform `overview` and one `{programId}__{code}` document. There are no anonymous event documents and no telemetry event scans. The public callable now enforces Firebase App Check and requests limited-use-token consumption. A missing or invalid App Check attestation is rejected before the handler; an already-consumed attestation is rejected before any telemetry write. The endpoint remains financially inert, with 10,000 per-code and 1,000,000 global caps. UI code must treat visit reporting as best effort: referral-code validation and browsing are independent of telemetry success.

Before staging telemetry is enabled, configure the Firebase web App Check provider and its site keys, and verify callable enforcement with fresh limited-use tokens. The metrics remain non-unique validated calls rather than audience analytics; the caps bound storage and writes, not the number of requests a caller can attempt.

The paid-first selection and approval checks retain the full millisecond timestamp from server-written `completedAt`; no seconds truncation occurs. Browser Firestore rules now prohibit tenant-manager changes to `completedAt` and `isTest`, while the Admin-SDK booking completion/payment workflows retain authority to write those fields. This prevents a browser manager from backdating an eligibility candidate or changing its test classification. The first positive-paid, non-test completion stays approvable after later paid bookings; any positive-paid legacy booking without trustworthy server completion evidence fails closed.

`ReferralMarketingOverview` is now an exported server DTO with `contractVersion: 2`. Its documented fields are `programs`, full funnel totals (including App-Check-gated `validatedVisits`), currency-separated approved credits, `{ inviterId, inviterOwnerType }` top referrers, pending/flagged queues (including flag reasons), and the bounded referral-only audit trail with privileged actor/reason data. The v2 contract makes the typed identity and audit/filter guarantees explicit for the frontend consumer.

Verification for this remediation:

```bash
npm --prefix functions exec jest -- src/referrals.test.ts --runInBand
npm --prefix functions run build
firebase emulators:exec --only firestore "PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node ./node_modules/jest/bin/jest.js --config='{\"testEnvironment\":\"node\",\"rootDir\":\".\",\"transform\":{}}' --runInBand --runTestsByPath rules-tests/referral.rules.test.cjs rules-tests/booking-transition-enforcement.test.cjs"
```

Result: 1 focused Functions suite passed (54 tests), the Functions TypeScript build passed, and 2 Firestore emulator suites passed (10 tests).

## Follow-up server remediation: invocation boundary and trusted eligibility evidence

`recordReferralVisit` now declares Functions v1 `enforceAppCheck: true`, `consumeAppCheckToken: true`, and `maxInstances: 2`. The SDK wrapper automatically rejects invalid App Check tokens; defence-in-depth handler checks also reject a missing App Check context or a consumed limited-use token before the telemetry implementation can obtain Firestore. The transaction validates the code/program before any aggregate write. Once the global aggregate has reached 1,000,000, it returns `recorded: false` without reading the per-code aggregate. The 10,000 per-code cap, no-event-document storage, and financial isolation remain unchanged.

This bounds server work and storage but does not make public browser traffic cost-free or provide mathematical DDoS immunity: a request can still invoke the public callable before App Check/rate controls reject it. Browser telemetry therefore remains disabled until staging initializes Firebase Web App Check with the required provider/site key, and any telemetry failure is explicitly non-blocking for referral landing and code validation.

Referral pending rewards now require `ReferralCompletionEvidence` from the Firestore completion trigger: evidence version 1, the trusted event ID, and the after-document update timestamp in milliseconds. The reward transaction records a matching private `referralBookingEvidence/{bookingId}` document and duplicates the marker into the pending reward. Activation of a newly created or previously inactive referral program writes its own version-1 `eligibilityEvidenceNotBeforeAt` rollout marker. Both the server-written `completedAt` and event update time must be on or after that threshold, and the event time must not precede completion. Approval re-reads the booking, program, and private evidence record and requires all reward/evidence fields to match. Thus prior or forged legacy pending rewards cannot issue credits; they remain explicitly rejectable. Existing active programs without the rollout marker fail closed until they are reactivated through the Super Admin program flow.

The Super Admin response contract remains `contractVersion: 2` and is now specified field-by-field in the referral design document, including public telemetry result semantics, every funnel field, typed referrers, issued-credit currency totals, flagged queue fields, privileged audit fields, and the one-filter bounded audit-query shape.

Verification for this remediation:

```bash
npm --prefix functions exec jest -- src/referrals.test.ts --runInBand
npm --prefix functions exec jest -- src/bookings.test.ts --runInBand
npm --prefix functions run build
firebase emulators:exec --only firestore "PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node ./node_modules/jest/bin/jest.js --config='{\"testEnvironment\":\"node\",\"rootDir\":\".\",\"transform\":{}}' --runInBand --runTestsByPath rules-tests/referral.rules.test.cjs rules-tests/booking-transition-enforcement.test.cjs"
```

Result: referral domain tests passed (58), booking lifecycle tests passed (22), Functions TypeScript build passed, and the two Firestore emulator rule suites passed (10).

## Follow-up server remediation: currency-safe reporting contract

`getReferralMarketingOverview` no longer exposes a currency-less `approvedCreditsMinor` on a top-referrer row. Each row remains keyed by `{ inviterId, inviterOwnerType }` and now returns `approvedCreditTotals: [{ currency, amountMinor }]`. Reward counts and referral counts remain currency-neutral counts; every monetary minor-unit total is separated by currency. This prevents EUR and USD inviter credits from being added and labelled with an arbitrary first currency.

The exported v2 DTO is now concrete rather than opaque: `ReferralProgramOverview`, `ReferralCreditTotal`, `ReferralFraudFlag`, `ReferralPendingRewardOverview`, `ReferralAuditEntry`, `ReferralTopReferrer`, `ReferralAuditFilter`, `PublicReferralVisitResult`, and `ReferralMarketingOverview` define the exact callable contract. Safe overview projection normalizes program, pending-reward, and audit timestamps to ISO-8601 UTC strings, matching the documentation; no Firestore `Timestamp` is returned to the UI. The specification now shows the exact public telemetry result, funnel fields, bounded mutually-exclusive audit-filter shape, flag requirement, and privileged actor/reason fields.

Documentation also now distinguishes the telemetry transaction's initial reads from mutations: it reads the normalized code and global counter, validates code/program availability, and only then updates aggregate counters. Invalid/unavailable code never mutates telemetry; a globally capped valid code avoids the per-code aggregate read.

Verification for this remediation:

```bash
npm --prefix functions exec jest -- src/referrals.test.ts --runInBand
npm --prefix functions exec jest -- src/bookings.test.ts --runInBand
npm --prefix functions run build
firebase emulators:exec --only firestore "PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node ./node_modules/jest/bin/jest.js --config='{\"testEnvironment\":\"node\",\"rootDir\":\".\",\"transform\":{}}' --runInBand --runTestsByPath rules-tests/referral.rules.test.cjs rules-tests/booking-transition-enforcement.test.cjs"
```

Result: referral domain tests passed (59), booking lifecycle tests passed (22), Functions TypeScript build passed, and the two Firestore emulator rule suites passed (10).

## Follow-up server remediation: mutually-exclusive audit-filter type

The exported `ReferralAuditFilter` now uses the same `never`-property union as the documented v2 contract. A TypeScript caller can provide no filter or exactly one of `code`, `programId`, `rewardId`, or `action`, plus an optional limit; combining filters fails at compile time as well as at runtime. No callable input parser or runtime response changed.

Added `functions/src/referrals.contract.test.ts` as a compile-time contract check. Its `@ts-expect-error` combined-filter case failed against the prior permissive union and is now consumed by the strict type, while the individual variants compile.

Verification for this remediation:

```bash
npm --prefix functions run build
npm --prefix functions exec jest -- src/referrals.test.ts --runInBand
```

Result: Functions TypeScript build passed (including the compile-only contract test); referral domain tests passed (59).

## Final-release integrity remediation: trusted approval source and canonical issued-credit reporting

Pending reward approval is now fail-closed. The approval transaction requires the exact deterministic reward document ID `{programId}__{invitedUserId}`, then re-reads `referralBookingEvidence/{bookingId}` and validates its deterministic reward link, booking, program, normalized code, inviter ID and typed owner namespace, invited client identity, currency, both minor-unit terms, completed timestamp, trigger event/version/timestamp, and program rollout marker. It verifies those values exactly against the pending reward and the currently trusted booking, attribution, code, and program records. Ledger values are derived from the trusted evidence record, never from the mutable reward document. A cloned, altered, or incomplete pending reward cannot change status or write credits on approval, but it remains safely rejectable through the existing manual review action.

Completion processing now evaluates program date availability against the trusted Firestore trigger event timestamp rather than handler wall-clock time. This preserves a positive-paid completion that occurred just before a program’s end date when trigger delivery runs later. Approval uses that same persisted evidence timestamp for program-date availability, while still requiring the current program/code state and exact terms to remain valid.

The Super Admin overview now derives both platform issued totals and typed top-referrer issued-credit totals from the same canonical approved `creditLedgers` legs. A ledger must have its deterministic `{rewardId}__inviter` or `{rewardId}__invited` ID, valid leg kind/typed owner/currency/amount, and match a deterministic approved reward's matching owner namespace, currency, and exact leg amount. Corrupt, cloned, mismatched-owner, or orphan records are excluded from money totals. `topReferrers[].rewards` remains an explicit reward-document count, so it can be nonzero while its ledger-derived `approvedCreditTotals` is empty for malformed historical data.

Verification for this remediation:

```bash
npm --prefix functions exec jest -- src/referrals.test.ts --runInBand
npm --prefix functions exec jest -- src/bookings.test.ts --runInBand
npm --prefix functions run build
firebase emulators:exec --only firestore "PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node ./node_modules/jest/bin/jest.js --config='{\"testEnvironment\":\"node\",\"rootDir\":\".\",\"transform\":{}}' --runInBand --runTestsByPath rules-tests/referral.rules.test.cjs rules-tests/booking-transition-enforcement.test.cjs"
```

Result: referral domain tests passed (62), booking lifecycle tests passed (22), Functions TypeScript build passed, and the focused Firestore rule suites passed (10).

## Final approval integrity follow-up: canonical overview rewards and delayed attribution expiry

The Super Admin overview now applies one strict canonical-reward predicate before every referral reward-derived projection. A row must carry its deterministic `{programId}__{invitedUserId}` ID in both document key and `rewardId`, complete valid qualification/evidence fields, matching `inviterId`/`inviterOwnerId` plus owner type, and matching invited client user/owner ID/type. Pending, approved, rejected, and cancelled reward rows failing that predicate are excluded from funnel counts, pending and flagged queues, top-referrer reward counts, and the reward lookup used to validate canonical credit-ledger legs. Platform issued totals remain ledger-derived, but a ledger paired with a corrupt reward is now excluded too; this prevents one corrupt reward from producing separate count and credit rows for different principals.

Completion processing now compares `referralAttributions.expiresAt` to the trusted Firestore trigger event update timestamp, rather than handler wall-clock time. This matches program availability: delayed delivery cannot discard a completion made while an attribution was still live, while an attribution that expired before the trusted completion event still fails safely.

Verification for this follow-up:

```bash
npm --prefix functions exec jest -- src/referrals.test.ts --runInBand
npm --prefix functions exec jest -- src/bookings.test.ts --runInBand
npm --prefix functions run build
```

Result: referral domain tests passed (64), booking lifecycle tests passed (22), and Functions TypeScript build passed.

## Final consistency follow-up: approval expiry and canonical workspace projection

`reviewReferralReward` now compares `referralAttributions.expiresAt` against the reward’s persisted trusted trigger timestamp during approval revalidation. A reward whose attribution has been tampered to expire before the recorded completion event fails closed, remains pending, and creates no ledgers.

`getMyReferralWorkspace` now uses bounded (100 per owner namespace, with at most 20 authorized brands) source-validated reward sets rather than projecting any document that merely claims an owner alias. Each candidate must pass deterministic reward/evidence validation; then the workspace verifies the private booking evidence, positive-paid booking completion, attribution (including event-time expiry), referral code identity, and program source. Approved records also require an exact deterministic matching ledger leg before display or totals. The same validation is applied to client inviter/invitee, freelancer, and each independently authorized brand workspace. The workspace’s attribution display now also requires matching code/program sources. Historical canonical rewards retain their stored qualification terms after later program edits, while malformed aliases, orphan ledgers, and invalid source links are excluded.

Verification for this follow-up:

```bash
npm --prefix functions exec jest -- src/referrals.test.ts --runInBand
npm --prefix functions exec jest -- src/bookings.test.ts --runInBand
npm --prefix functions run build
```

Result: referral domain tests passed (66), booking lifecycle tests passed (22), and Functions TypeScript build passed.

## Scalability contract follow-up: scoped referral workspace V3

`getMyReferralWorkspace` is now the explicit **contractVersion: 3** surface. Each request selects exactly one authorized scope (`client`, `freelancer`, or an exact `brandId`), one role page, and a 1–20 item limit. Brand authorization uses direct active principal/salon-admin membership queries for the selected brand, so any number of inactive or worker memberships cannot hide a valid administrator. The callable no longer enumerates brands or fetches raw code/reward/ledger windows for unrelated scopes.

The response exact-reads `referralOwnerSummaries/{ownerType}__{ownerId}` and pages only `referralOwnerHistory` records for that same typed owner and role. Pages use `limit + 1`, return explicit `truncated` plus an opaque `nextPageToken`, and source-validate at most 20 canonical reward/evidence chains. Approved rows also exact-read their deterministic ledger leg. Legacy/unversioned data has no raw-scan fallback: only a matching server-written `{ schemaVersion: 1, summaryEpoch: 'referral-v3' }` projection is `state: 'verified'`; otherwise the response is explicitly `state: 'unavailable'` with no inferred balances.

Trusted create-code, attribution, completion, approval, review, and flag transactions now maintain typed owner summaries and history projections in the same transaction as the source mutation. Counters and monetary maps remain partitioned by role and currency; a client ID equal to a brand ID addresses distinct documents and cannot cross-project data. The V3 DTO is exported from `functions/src/referrals.ts` and documented in the referral design spec for the UI follow-up.

Verification for this follow-up:

```bash
npm --prefix functions exec jest -- src/referrals.test.ts --runInBand
npm --prefix functions run build
git diff --check -- functions/src/referrals.ts functions/src/referrals.test.ts docs/superpowers/specs/2026-09-12-referral-marketing-design.md
```

Result: referral domain tests passed (67), Functions TypeScript build passed, and the scoped changed-file diff check passed.

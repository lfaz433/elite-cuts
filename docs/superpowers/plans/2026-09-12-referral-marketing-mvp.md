# Referral Marketing MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure referral program in which a first completed booking creates reviewable non-cash credits, plus a Super Admin marketing dashboard.

**Architecture:** Firebase Cloud Functions own referral codes, attribution, rewards, and credit ledger entries; Firestore browser rules deny direct writes. The React app only reads safe workspace views and calls explicit functions. The Super Admin dashboard uses a small referral component instead of extending the existing large `SuperAdmin.tsx` with all referral state.

**Tech Stack:** React 18, TypeScript, Firebase Auth, Firestore, Firebase Functions v1, Jest, Firestore Emulator, Sonner.

**Spec:** `docs/superpowers/specs/2026-09-12-referral-marketing-design.md`

## Global Constraints

- Rewards are non-cash credits; do not add Stripe, payment collection, withdrawals, or transfers.
- One active referral program; attribution is immutable and lasts 30 days.
- Only the trusted server writes programs, codes, attribution, rewards, credit ledgers, and audit events.
- A reward is created only after a new client’s first completed eligible booking.
- Use minor currency units and ISO currency codes; France is enabled first.
- Never deploy production; staging tests use `elite-cuts-staging` only.

---

### Task 1: Referral domain and server validation

**Files:**
- Create: `functions/src/referrals.ts`
- Create: `functions/src/referrals.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Produces `createReferralProgram`, `reserveReferralCode`, `attributeReferral`, `processReferralBookingCompletion`, `reviewReferralReward`.
- Consumes authenticated caller UID and existing `bookings` records with `clientId`, `status`, and `isTest` fields.

- [ ] **Step 1: Write failing unit tests**

```ts
expect(normalizeReferralCode(' Salon-Paris ')).toBe('SALON-PARIS');
await expect(attributeReferral('new-client', { code: 'OWN' }, db)).rejects.toMatchObject({ code: 'permission-denied' });
expect(await processReferralBookingCompletion('booking-1', db)).toEqual({ created: true });
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm --prefix functions exec jest -- src/referrals.test.ts --runInBand`  
Expected: FAIL because the module/functions do not exist.

- [ ] **Step 3: Implement minimal server-only logic**

```ts
type RewardStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
// use Firestore runTransaction to reserve code documents and reward id
// `${programId}__${invitedUserId}`; reject self-attribution and inactive programs.
```

Validate code length/characters, program country/status/date, caller identity, the earliest positive-paid completed booking with `isTest === false`, duplicate reward key, and all state transitions. Missing or non-boolean `isTest` values must fail closed and neither earn a reward nor suppress a later canonical booking. Create `auditEvents` for program changes and reward review. Export callable wrappers from `functions/src/index.ts`.

- [ ] **Step 4: Run focused tests and Functions build**

Run: `npm --prefix functions exec jest -- src/referrals.test.ts --runInBand && npm --prefix functions run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/referrals.ts functions/src/referrals.test.ts functions/src/index.ts
git commit -m "feat: add secure referral domain"
```

### Task 2: Booking integration and Firestore policy

**Files:**
- Modify: `functions/src/bookings.ts`
- Modify: `functions/src/bookingStatus.ts`
- Modify: `firestore.rules`
- Create: `rules-tests/referral.rules.test.cjs`
- Modify: `functions/src/referrals.test.ts`

**Interfaces:**
- Consumes `processReferralBookingCompletion(bookingId, firestore)` from Task 1.
- Produces an idempotent completed-booking referral trigger and direct-write denials.

- [ ] **Step 1: Write failing integration/rules tests**

```js
await assertFails(authedDb.doc('referralPrograms/program-a').set({ status: 'active' }));
await assertFails(authedDb.doc('referralRewards/reward-a').set({ status: 'approved' }));
```

- [ ] **Step 2: Run tests and verify failure**

Run: `firebase emulators:exec --only firestore "PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/node ./node_modules/jest/bin/jest.js --config='{\"testEnvironment\":\"node\",\"rootDir\":\".\",\"transform\":{}}' --runInBand --runTestsByPath rules-tests/referral.rules.test.cjs"`  
Expected: FAIL before rules are added.

- [ ] **Step 3: Integrate the single allowed state transition**

Call referral processing only after a server-validated transition to `completed`. It must not block a completed booking if no attribution/program exists, and retries must return the existing reward rather than creating another. Add deny-by-default rules for `referralPrograms`, `referralCodes`, `referralAttributions`, `referralRewards`, and `creditLedgers`.

- [ ] **Step 4: Run tests**

Run: command in Step 2 plus `npm --prefix functions exec jest -- src/referrals.test.ts --runInBand`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/bookings.ts functions/src/bookingStatus.ts functions/src/referrals.test.ts firestore.rules rules-tests/referral.rules.test.cjs
git commit -m "feat: protect referral rewards and booking eligibility"
```

### Task 3: Referral client workspace

**Files:**
- Create: `src/app/lib/marketplace/referrals.ts`
- Create: `src/app/lib/marketplace/referrals.test.mjs`
- Create: `src/app/components/referrals/ReferralCard.tsx`
- Modify: `src/app/components/pages/ClientDashboard.tsx`
- Modify: `src/app/components/pages/FreelancerDashboard.tsx`
- Modify: `src/app/components/pages/BrandDashboard.tsx`

**Interfaces:**
- Consumes `getMyReferralWorkspace` callable added in Task 1.
- Produces `ReferralCard` with share link, code, status, and safe credit summary.

- [ ] **Step 1: Write failing client helper tests**

```js
assert.equal(referralLink('https://staging.elitecuts.example', 'PARIS-5'), 'https://staging.elitecuts.example/r/PARIS-5');
assert.equal(creditLabel({ amountMinor: 500, currency: 'EUR' }), '5,00 €');
```

- [ ] **Step 2: Run test and verify failure**

Run: `node --test src/app/lib/marketplace/referrals.test.mjs`  
Expected: FAIL before helper exists.

- [ ] **Step 3: Implement**

Add a small callable client, a reusable card with copy/share and clear “credit after first completed booking” copy, and role-specific placement in existing dashboards. Do not display other users’ email, address, or private profile. Add a public route that records a code locally for 30 days and never creates an account automatically.

- [ ] **Step 4: Run tests and build**

Run: `node --test src/app/lib/marketplace/referrals.test.mjs && npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/lib/marketplace/referrals.ts src/app/lib/marketplace/referrals.test.mjs src/app/components/referrals/ReferralCard.tsx src/app/components/pages/ClientDashboard.tsx src/app/components/pages/FreelancerDashboard.tsx src/app/components/pages/BrandDashboard.tsx src/app/App.tsx
git commit -m "feat: add referral sharing workspaces"
```

### Task 4: Super Admin marketing dashboard

**Files:**
- Create: `src/app/components/superadmin/ReferralMarketingDashboard.tsx`
- Create: `src/app/components/superadmin/ReferralMarketingDashboard.test.mjs`
- Modify: `src/app/components/pages/SuperAdmin.tsx`
- Modify: `functions/src/referrals.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes Super Admin callable `getReferralMarketingOverview` and Task 1 review/program functions.
- Produces a `marketing` tab in Super Admin with empty/live states and review controls.

- [ ] **Step 1: Write failing dashboard tests**

```js
assert.equal(funnelRate(5, 20), 25);
assert.equal(rewardBadge('pending'), 'À examiner');
```

- [ ] **Step 2: Run test and verify failure**

Run: `node --test src/app/components/superadmin/ReferralMarketingDashboard.test.mjs`  
Expected: FAIL.

- [ ] **Step 3: Implement trusted overview and UI**

Add an admin-only aggregate callable, program form (EUR, France, fixed credits, pause/activate), funnel metrics, top referrers, pending review queue, and reject reason. Add only the `Marketing & parrainage` tab wiring to `SuperAdmin.tsx`; keep rendering/state in the new component. Render explicit empty states; never fabricate revenue or rewards.

- [ ] **Step 4: Run test and build**

Run: `node --test src/app/components/superadmin/ReferralMarketingDashboard.test.mjs && npm run build && npm --prefix functions run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/superadmin/ReferralMarketingDashboard.tsx src/app/components/superadmin/ReferralMarketingDashboard.test.mjs src/app/components/pages/SuperAdmin.tsx functions/src/referrals.ts functions/src/index.ts
git commit -m "feat: add referral marketing controls"
```

### Task 5: End-to-end verification and staging checklist

**Files:**
- Create: `docs/referral-pilot-checklist.md`
- Modify: `README.md`

**Interfaces:**
- Consumes all previous referral functions/routes.
- Produces a repeatable four-pilot-user staging acceptance checklist.

- [ ] **Step 1: Add acceptance checklist**

Document tested flows: code creation; invite opens link; attribution once; ineligible cancellation; eligible completed booking; duplicate retry; admin approval; pause; rules direct-write denial; no cash/Stripe action.

- [ ] **Step 2: Run full targeted verification**

Run: `npm run build && npm --prefix functions run build && node --test src/app/lib/marketplace/referrals.test.mjs src/app/components/superadmin/ReferralMarketingDashboard.test.mjs`  
Run: Firestore emulator command from Task 2 with `rules-tests/referral.rules.test.cjs` plus existing auth/booking/privacy/membership suites.  
Expected: PASS.

- [ ] **Step 3: Perform staging release only after Functions deployment is available**

Run: `npm --prefix functions run deploy:staging`
Expected: the guard verifies that `staging` resolves to `elite-cuts-staging`, then deploys Firestore rules, the exact index manifest, and Functions together. Do not run this command while the project lacks Blaze billing.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/referral-pilot-checklist.md README.md
git commit -m "docs: add referral pilot checklist"
```

# Elite Cuts Foundation, Security, and Staging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing product safe to extend through isolated environments, server-owned authority, and truthful registration and booking states.

**Architecture:** Keep legacy tenant features working while new authorization is based on memberships, verified server actions, and deny-by-default Firestore rules. Build settings choose Firebase project via environment variables and explicit aliases.

**Tech Stack:** React 18, TypeScript, Vite, Firebase Auth, Firestore, Firebase Functions v1, Firebase Admin SDK, Jest rules tests.

**Spec:** `docs/superpowers/specs/2026-09-04-elite-cuts-scalable-mvp-design.md`

## Global Constraints

- Production is `elite-cuts-app`; staging is `elite-cuts-staging`.
- Never copy real production data into staging.
- Client-written profile fields do not grant a role, tenant, membership, or permission.
- Sensitive actions are verified by server code; new money is integer minor units and new dates use server timestamps.

---

### Task 1: Isolate Firebase environments

**Files:**
- Modify: `.firebaserc`, `.gitignore`, `src/app/lib/firebase.ts`
- Create: `.env.example`, `.env.staging.example`, `functions/.env.example`, `functions/.env.staging.example`, `scripts/verify-environment.mjs`

**Interfaces:** Produces aliases `production` and `staging`; produces `node scripts/verify-environment.mjs staging|production`.

- [ ] **Step 1: Write the failing verifier.**

```js
const expected = { staging: 'elite-cuts-staging', production: 'elite-cuts-app' };
if (process.env.VITE_FIREBASE_PROJECT_ID !== expected[process.argv[2]]) process.exit(1);
```

- [ ] **Step 2: Run `VITE_FIREBASE_PROJECT_ID=wrong node scripts/verify-environment.mjs staging`; expect exit 1.**
- [ ] **Step 3: Add aliases and template variables.** Set `.firebaserc` to aliases `production`, `staging`, and `default`; replace hard-coded Firebase config in `src/app/lib/firebase.ts` with required `VITE_FIREBASE_*` variables. Ignore `.superpowers/`, `.env`, `.env.*`, and `functions/.env*`, retaining only the example files.
- [ ] **Step 4: Run verifier with each expected project ID; expect exit 0.**
- [ ] **Step 5: Commit environment configuration with message `chore: configure staging and production environments`.**

### Task 2: Remove client-controlled authorization

**Files:**
- Create: `functions/src/authz.ts`, `src/app/lib/session.ts`, `rules-tests/authz.rules.test.cjs`
- Modify: `functions/src/index.ts`, `src/app/components/context/AuthContext.tsx`, `firestore.rules`

**Interfaces:** Produces `requireMembership(uid: string, locationId: string, permission: string): Promise<Membership>` and `SessionUser { uid: string; email: string; displayName: string; memberships: MembershipSummary[] }`.

- [ ] **Step 1: Write failing escalation tests.**

```js
await assertFails(setDoc(doc(db, 'users', 'client-a'), { role: 'superadmin', tenantId: 'other' }));
await assertFails(updateDoc(doc(db, 'memberships', 'member-b'), { permissions: { manageStaff: true }));
```

- [ ] **Step 2: Run `npx jest -c rules-tests/jest.config.cjs --runInBand` with Firestore Emulator; expect these cases to fail under the current rules.**
- [ ] **Step 3: Implement membership checks.**

```ts
export async function requireMembership(uid: string, locationId: string, permission: string) {
  const snap = await db.collection('memberships').where('userId', '==', uid).where('locationId', '==', locationId).where('status', '==', 'active').limit(1).get();
  if (snap.empty || snap.docs[0].data().permissions?.[permission] !== true) throw new functions.https.HttpsError('permission-denied', 'Permission denied');
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}
```

Restrict `users/{uid}` to safe own-profile fields and update `AuthContext` to load active memberships rather than trusting `role`/`tenantId` from the user document.

- [ ] **Step 4: Run rules tests and `cd functions && npm run build`; expect both pass.**
- [ ] **Step 5: Commit with message `feat: add membership-based authorization`.**

### Task 3: Secure endpoints and correct booking and registration feedback

**Files:**
- Create: `functions/src/httpAuth.ts`, `functions/src/bookingStatus.ts`, `rules-tests/booking-status.test.cjs`
- Modify: `functions/src/index.ts`, `api/send-push.ts`, `api/utils/firebaseAdmin.ts`, `src/app/components/modals/BookingModal.tsx`, `src/app/components/pages/Register.tsx`, `src/app/App.tsx`

**Interfaces:** Produces `verifyFirebaseIdToken(req): Promise<DecodedIdToken | null>` and `BookingStatus = 'draft' | 'pending_approval' | 'confirmed' | 'declined' | 'cancelled' | 'completed' | 'payment_failed'`.

- [ ] **Step 1: Write failing tests.**

```js
expect(() => assertTransition('pending_approval', 'completed')).toThrow('Invalid booking transition');
expect(await verifyFirebaseIdToken({ headers: {} })).toBeNull();
```

- [ ] **Step 2: Run the tests; expect failure.**
- [ ] **Step 3: Add verified Firebase tokens to push/checkout, tenant ownership validation, mandatory Stripe webhook verification, and state-transition validation.** In `BookingModal`, replace the current catch branch with an error message and retry action; never set success after timeout. In `Register`, persist the subdomain provisioning result and obtain the redirect base domain from one environment setting.
- [ ] **Step 4: Run `npm run build`, `cd functions && npm run build`, and rules tests; force a failed staging booking and expect no confirmation screen.**
- [ ] **Step 5: Commit with message `fix: secure actions and booking feedback`.**

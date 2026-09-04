# Elite Cuts Multi-Salon Memberships Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a brand dashboard with multiple locations, Principal Admin control, Salon Admin permission switches, and worker invitation acceptance.

**Architecture:** New records use `brands`, `salonLocations`, and `memberships`, avoiding the legacy mutable tenant role. Principal Admin actions are callable Functions and every dashboard query is scoped by the selected permitted location.

**Tech Stack:** React 18, TypeScript, React Router, Firebase Functions, Firestore, Sonner, Jest rules tests.

**Spec:** `docs/superpowers/specs/2026-09-04-elite-cuts-scalable-mvp-design.md`

## Global Constraints

- Principal Admin creates locations and grants every elevated permission.
- Salon Admin access applies only to assigned locations.
- Workers accept their own invitation and create or connect their own login.

---

### Task 1: Define brand, location, and membership records

**Files:**
- Create: `src/app/lib/marketplace/types.ts`, `src/app/lib/marketplace/permissions.ts`, `functions/src/memberships.ts`, `rules-tests/membership.rules.test.cjs`
- Modify: `firestore.rules`, `functions/src/index.ts`

**Interfaces:** Produces `PermissionKey = 'manageBookings' | 'manageStaff' | 'inviteWorkers' | 'removeWorkers' | 'manageServices' | 'manageInventory' | 'manageJobs'` and `Membership { userId; brandId; locationId?: string; role: 'principal_admin' | 'salon_admin' | 'worker'; status: 'pending' | 'active' | 'declined' | 'revoked'; permissions: Record<PermissionKey, boolean> }`.

- [ ] **Step 1: Write failing cross-location access tests.**

```js
await assertFails(getDoc(doc(asParisAdmin, 'salonLocations', 'grenoble')));
await assertFails(updateDoc(doc(asSalonAdmin, 'memberships', ownMembership), { role: 'principal_admin' }));
```

- [ ] **Step 2: Run rules tests; expect rejection.**
- [ ] **Step 3: Add record types, permission constants, callable location creation, and Firestore rules.**

```ts
export const DEFAULT_SALON_ADMIN_PERMISSIONS = {
  manageBookings: true, manageStaff: true, inviteWorkers: false, removeWorkers: false,
  manageServices: true, manageInventory: false, manageJobs: true,
} as const;
```

- [ ] **Step 4: Run function build and rules tests; expect a Principal Admin to create a location membership and a Salon Admin to fail privilege escalation.**
- [ ] **Step 5: Commit with message `feat: add multi-salon memberships`.**

### Task 2: Build the Principal Admin and Salon Admin dashboards

**Files:**
- Create: `src/app/components/pages/BrandDashboard.tsx`, `src/app/components/brand/LocationList.tsx`, `src/app/components/brand/LocationForm.tsx`, `src/app/components/brand/PermissionEditor.tsx`, `src/app/components/context/WorkspaceContext.tsx`, `src/app/components/brand/PermissionEditor.test.tsx`
- Modify: `src/app/App.tsx`, `src/app/components/context/AuthContext.tsx`

**Interfaces:** Produces `useWorkspace(): { brandId: string | null; locationId: string | null; selectLocation(id: string): void }` and `PermissionEditor({ value, onChange, disabledKeys })`.

- [ ] **Step 1: Write a failing test that toggles `inviteWorkers` and rejects `principal_admin` as a Salon Admin-selectable role.**
- [ ] **Step 2: Run the component test; expect failure.**
- [ ] **Step 3: Implement `/brand/*`, location selection, location form, permission editor, and location-scoped navigation.**
- [ ] **Step 4: Run component tests and `npm run build`; check Paris, Grenoble, and Mulhouse switching with a staging Principal Admin.**
- [ ] **Step 5: Commit with message `feat: add brand administration dashboard`.**

### Task 3: Implement worker invitations

**Files:**
- Create: `functions/src/invitations.ts`, `src/app/components/brand/WorkerInviteDialog.tsx`, `src/app/components/pages/AcceptInvitation.tsx`, `rules-tests/invitation.rules.test.cjs`
- Modify: `functions/src/index.ts`, `src/app/App.tsx`, `firestore.rules`

**Interfaces:** Produces `createWorkerInvitation({ locationId, email, displayName, role }): Promise<{ invitationId: string }>` and `respondToInvitation({ invitationId, accept }): Promise<{ membershipId: string; status: 'active' | 'declined' }>`.

- [ ] **Step 1: Write failing tests for invitation without `inviteWorkers` and acceptance by a different account.**
- [ ] **Step 2: Run tests; expect failure.**
- [ ] **Step 3: Implement pending invitation record, email/account match, and acceptance state transition.**

```ts
if (!membership.permissions.inviteWorkers) throw new HttpsError('permission-denied', 'Worker invitations are disabled for this administrator');
if (invitation.email !== decoded.email) throw new HttpsError('permission-denied', 'Invitation belongs to a different account');
```

- [ ] **Step 4: Run function/rules tests and complete a staging worker invitation.**
- [ ] **Step 5: Commit with message `feat: add worker invitation acceptance`.**

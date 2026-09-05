# Task 3 report — worker invitations

## Implemented scope

- Added `createWorkerInvitation` and `respondToInvitation` callable Functions.
  Invitation creation resolves the location's server-owned membership in a
  transaction and requires its exact `inviteWorkers` permission. Inputs cannot
  supply authority fields or the `principal_admin` role.
- Invitation records are pending and server-owned. Creation does not create a
  membership. The invited account's normalized Firebase Auth email must match
  the stored invitation before the server can atomically accept or decline it.
- Acceptance creates the invited user's deterministic active location
  membership with server-owned role permissions and marks the invitation
  accepted in the same transaction. Declining creates no membership.
- Added Firestore rules that let the matching authenticated email, an active
  brand Principal Admin, or an active location member with `inviteWorkers` read
  an invitation. All browser writes to invitations and memberships remain
  denied.
- Added the location-scoped invite dialog to `/brand`, gated by the selected
  membership's `inviteWorkers` value. It produces a shareable invitation link
  and explicitly tells administrators that the invitee uses their own account
  and password.
- Added the authenticated `/invitations/:invitationId` acceptance page. It
  reads only the matching account's invitation and invokes the callable for
  accept/decline; it never handles or controls a worker password.
- Existing tenant, subscription, payment, and Stripe behavior was not changed.

## TDD evidence

### RED

- `node --import tsx --test functions/src/invitations.test.ts` was run before
  `functions/src/invitations.ts` existed and exited 1 with
  `Cannot find module './invitations'`, proving the security surface was absent.
  The executable authorization test was later moved out of the deployable
  Functions source tree to `rules-tests/invitation.authorization.test.ts`.
- `node --import tsx --test
  src/app/components/brand/WorkerInviteDialog.test.tsx` was run before either UI
  component existed and exited 1 with `ERR_MODULE_NOT_FOUND` for
  `WorkerInviteDialog`.
- The emulator-backed suite was authored before implementation. Its RED run
  could not reach assertions because Firebase's Firestore emulator requires
  Java and this environment has no Java runtime.

### GREEN

- Focused TypeScript unit/component and prior marketplace regression tests:
  12/12 passed.
- Existing role-journey and tenant-resolution tests: 7/7 passed.
- `npm --prefix functions run build`: passed.
- `npm run build`: passed with no Vite warnings after the final refactor.
- `node --check rules-tests/invitation.rules.test.cjs`: passed.
- `node rules-tests/static-analysis.cjs`: 11/11 passed.
- `git diff --check`: passed.

## Verification gaps

- `npx firebase emulators:exec --only firestore "node
  --experimental-vm-modules node_modules/.bin/jest
  rules-tests/invitation.rules.test.cjs --runInBand"` exits before tests because
  `java -version` reports that no Java runtime is installed. The committed suite
  covers denied invitation creation, different-account rejection, pending to
  active/declined transitions, invitee reads, and browser-write denial; it must
  still run in CI or a Java-equipped environment.
- A staging invitation was not created or accepted. No staging credentials were
  available, and this task explicitly did not authorize deployment or creating
  external accounts. Run the scenario after deploying the callable/rules with
  a Principal/Salon Admin and a separate invitee account.
- `npm --prefix functions run lint` still cannot run because the repository has
  no ESLint configuration; ESLint exits before source analysis.

## Commit

- `feat: add worker invitation acceptance`

Untracked dependency directories were left untouched.

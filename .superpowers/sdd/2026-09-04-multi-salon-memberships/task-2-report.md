# Task 2 report — Principal Admin and Salon Admin dashboards

## Implemented scope

- Added the `/brand/*` administration surface with a premium, responsive
  location list, location-scoped overview/permission navigation, real Firestore
  reads, and a secured `createSalonLocation` callable-backed form.
- Added `WorkspaceProvider` and the required `useWorkspace()` contract. It
  derives the active brand and allowed location IDs from server-created active
  memberships. Salon Admin selections are restricted to assigned locations;
  brand-level Principal Admins may select locations in their brand.
- Extended the authenticated session with `brandId`, `marketplaceRole`, and an
  explicit `refreshSession()` operation. `/brand/*` rejects users without an
  active Principal Admin or Salon Admin membership, while platform superadmins
  retain their existing home route.
- Added `PermissionEditor`. It toggles all required permission keys, honors
  disabled keys, and limits assignable roles to `salon_admin | worker` by type
  and rendered options. It cannot emit `principal_admin`.
- Connected the landing-page brand journey to `/register?mode=brand`. Brand
  registration creates identity-only profile data, calls the separate secured
  `bootstrapBrandOwner` callable, verifies both returned server-created
  Principal Admin memberships, refreshes the session, and navigates to
  `/brand`. Legacy `/register` behavior, legacy tenant bootstrap, plans, and
  domain provisioning are unchanged. No payment or Stripe code was touched.

## TDD evidence

### Permission editor RED

The component test was created before the component and run with:

```sh
node --import tsx --test src/app/components/brand/PermissionEditor.test.tsx
```

It exited 1 with `ERR_MODULE_NOT_FOUND` for the not-yet-created
`PermissionEditor`, confirming the required production surface was absent.

### Permission editor GREEN

After the minimal implementation, the same command passed 1/1 tests. The test
invokes the rendered `inviteWorkers` input's real change handler, observes the
new permission map, checks the literal assignable roles
`['salon_admin', 'worker']`, and rejects `principal_admin`.

### Brand journey RED/GREEN

The existing role-journey test was first changed to require
`/register?mode=brand`. `node --test src/app/lib/roleJourney.test.mjs` then
failed with actual `/register` versus expected `/register?mode=brand`. After the
production change, it passed 4/4.

## Verification

- `node --import tsx --test src/app/components/brand/PermissionEditor.test.tsx`
  — passed 1/1.
- `node --test src/app/lib/roleJourney.test.mjs src/app/components/context/tenantResolution.test.mjs`
  — passed 7/7.
- `node --import tsx --test src/app/lib/sessionAccess.test.ts` — passed 4/4.
- `npm run build` (with the repository's parent dependency bin directory on
  `PATH`, because this worktree intentionally leaves the pre-existing untracked
  dependency folders untouched) — passed.
- `git diff --check` — passed.
- In-app browser smoke check against the configured staging Firebase project:
  `/register?mode=brand` rendered the dedicated four-step brand flow, and the
  browser console had zero errors before submission.

The requested authenticated Paris/Grenoble/Mulhouse switching check was not
completed: no staging Principal Admin session or credentials were available.
Creating a new external staging account could not be performed without the
user's action-time confirmation. This is a release verification gap, not a
substitute for that check.

## Decisions

- New brand registration never falls back to client-writable roles. Browser
  writes remain identity-only; all authority is created by
  `bootstrapBrandOwner`.
- The dashboard does not pretend to persist permission changes without a
  server endpoint. Current membership permissions are shown read-only.
  `PermissionEditor` remains editable for the invitation/grant consumer in the
  next task, with Principal Admin excluded by construction.
- Salon Admin location loading uses individual authorized document reads based
  on membership IDs, avoiding a broad brand query that Firestore rules must
  reject. Principal Admins use the brand-scoped query allowed by their
  brand-level membership.
- Route URLs carry the selected location (`/brand/locations/:locationId`), so
  switching is explicit and deep-linkable while context provides the active
  location to downstream components.

## Commit

- `feat: add brand administration dashboard` — the implementation commit that
  contains this report. Its SHA is recorded in the task handoff.

## Concerns

- Re-run the Paris/Grenoble/Mulhouse switch scenario with an authenticated
  staging Principal Admin before release, and separately verify a Salon Admin
  cannot access an unassigned location URL.
- Task 1's existing Java/emulator and Functions lint gaps remain unchanged.

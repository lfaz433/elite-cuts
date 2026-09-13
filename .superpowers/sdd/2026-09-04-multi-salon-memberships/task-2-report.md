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

## Review fix round 1/5

### Findings and root cause

- The legacy tenant bootstrap intentionally stores `brandId = tenantId`,
  `locationId = tenantId`, and `role = principal_admin`. Task 2 originally
  treated role vocabulary alone as proof of a marketplace brand, so a legacy
  admin could receive `marketplaceRole`/`brandId`, route to `/brand`, and pass
  `BrandRequired` even though no `brands/{brandId}` record existed.
- Workspace and dashboard location filters originally accepted every location
  membership for the active brand. A worker-only membership could therefore
  enter the Salon Admin location list and satisfy a direct
  `/brand/locations/:id` URL.

### RED evidence

`src/app/lib/marketplace/access.test.ts` was added first with two behavioral
regressions. The initial run:

```sh
node --import tsx --test src/app/lib/marketplace/access.test.ts
```

exited 1 because the missing shared access policy could not be imported. The
test requires a legacy principal whose marketplace record lookup fails to keep
`/admin` and fail the brand guard; it also supplies mixed Paris Salon Admin,
Grenoble worker-only, and Mulhouse delegated-manager memberships and requires
only Paris/Mulhouse access.

A second narrow RED cycle added explicit deep-link behavior. The test exited 1
because `managerLocationForRoute` did not exist. Its expectation requires a
Grenoble worker-only URL to resolve to the first accessible manager location,
Paris.

### Fix

- Added one shared marketplace access policy. Manager eligibility requires an
  active Principal Admin/Salon Admin location membership or one of the
  server-owned staff-management permissions (`manageStaff`, `inviteWorkers`,
  `removeWorkers`). Operational worker permissions alone do not qualify.
- Auth hydration now verifies each eligible candidate against the marketplace
  document namespace before assigning `marketplaceRole`/`brandId`: brand-level
  principals require an existing readable `brands/{brandId}` document;
  location managers require an existing readable
  `salonLocations/{locationId}` whose `brandId` matches. Legacy tenant
  memberships therefore remain legacy-only.
- `HomeRouter`, `BrandRequired`, `WorkspaceProvider`, dashboard reads, current
  permission display, and route fallback now consume the same policy. Salon
  Admin document reads and explicit deep links are limited to manager-eligible
  location IDs. Principal Admin brand-wide reads remain intact.

### GREEN and verification evidence

- `node --import tsx --test src/app/lib/marketplace/access.test.ts` — passed
  2/2, including the explicit worker-location deep-link rejection.
- The full Task 2 component/access tests, existing role/tenant/session tests,
  production build, and `git diff --check` were rerun before the fix commit; see
  the handoff for the final aggregate counts and SHA.

Authenticated Paris/Grenoble/Mulhouse staging switching still requires a
user-supplied Principal Admin credential. No external account was created and
nothing was deployed during this review fix.

## Review fix round 2/5

### Finding and root cause

Auth round 1 correctly resolved a marketplace-verified manager but retained
only its role and brand ID. `WorkspaceContext` and `BrandDashboard` then
recomputed Principal authority from the entire raw membership array. A valid
Salon Admin plus a stale/legacy raw `principal_admin` record sharing the active
brand could therefore unlock brand-wide location queries, unrestricted
selection, and the add-location action.

### RED evidence

Added a behavioral regression with a verified Salon Admin membership and a
separate stale Principal membership for the same brand, then ran:

```sh
node --import tsx --test src/app/lib/marketplace/access.test.ts
```

The run exited 1 because `isVerifiedMarketplacePrincipal` was not exported.
The test specifically requires the user to retain brand-dashboard access via
the verified Salon Admin while Principal authority remains false despite the
raw stale record.

### Fix and GREEN evidence

- Auth now carries the exact `marketplaceMembershipId` returned by successful
  marketplace document verification.
- Brand access and Principal authority both require that exact resolved
  membership ID, its verified brand, active manager eligibility, and—for
  Principal authority—a brand-level `principal_admin` record with no location.
- `WorkspaceContext` and `BrandDashboard` consume the shared verified-Principal
  predicate instead of scanning raw memberships.

The focused test then passed 3/3. All relevant Task 2 access/component tests,
existing role/tenant/session tests, the production build, and whitespace checks
were rerun before committing; final counts and SHA are in the handoff.

No external account was created, no deployment occurred, and authenticated
staging city switching still requires a user-supplied Principal Admin
credential.

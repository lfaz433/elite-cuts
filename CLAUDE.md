# Barbeboard (repo: elite-cuts)

Multi-tenant SaaS + marketplace for barbershops. Owner: Aimene Mazouz.
Domain: barbeboard.pro (salons on `*.barbeboard.pro`). UI copy is in French.

This file describes the code as it is on `main`. If it disagrees with older
docs (README, PROJECT_DOCUMENTATION.md, `implementation_plan.md`), trust the code
and update this file.

## Stack

- Frontend: React 18 + TypeScript + Vite + Tailwind, in `src/`. Dark glass UI,
  gold accent `#D4AF37`.
- Backend: Firebase (Firestore eur3, Auth email/password, Cloud Functions Node 20)
  in `functions/src/`. Security rules in `firestore.rules`.
- Vercel serverless routes in `api/` (`send-push`, `provision-subdomain`,
  `remove-subdomain`).
- Payments: Stripe (test mode). Push: OneSignal.

## Environments and deploys

| | Frontend | Rules + Functions |
|---|---|---|
| How it deploys | Vercel auto-deploys `main` (project `barbershop`) | Manual `firebase deploy` |
| Staging | Vercel preview of a branch/PR | `elite-cuts-staging` (default in `.firebaserc`) |
| Production | barbeboard.pro | `elite-cuts-app`, needs `CONFIRM_PRODUCTION_PROJECT=elite-cuts-app` |

- `cd functions && npm run deploy:staging` deploys rules, indexes and functions
  to staging. `deploy:production` is guarded by `scripts/guard-production-deploy.mjs`.
- Frontend and rules/functions must be deployed **together**. The UI calls
  server functions that only exist once functions are deployed.
- Never push straight to `main`: work on a `claude/<topic>` branch and open a PR.
  The owner tests the Vercel preview and merges.

## Commands

```bash
npm ci && npm run build                 # frontend build (vite, no type-check)
cd functions && npm ci && npx tsc --noEmit # functions type-check
node rules-tests/static-analysis.cjs    # rules static checks, no emulator needed
npx tsx --test src/app/lib/*.test.ts    # frontend unit tests (node:test)
# Rules tests need Java + the Firestore emulator on 127.0.0.1:8080:
npx jest -c rules-tests/jest.config.cjs rules-tests/<file>.test.cjs
```

There is no root `tsconfig.json`, so frontend type errors are not caught by the build.

## Authority model (most important)

- **`users/{uid}` holds identity only** (name, email, phone…). Its `role` and
  `tenantId` fields grant nothing. Clients cannot write them.
- **Access comes from `memberships/*` docs** (written only by Cloud Functions):
  - Single salon: `memberships/{tenantId}__{uid}`
  - Brand location: `memberships/{brandId}__{locationId}__{uid}`
  - Brand principal: `memberships/{brandId}__principal__{uid}`
  - Fields: `userId`, `locationId`, `brandId`, `role`
    (`principal_admin` | `salon_admin` | `admin` | `worker` | `barber`),
    `status: 'active'`, `permissions` map, and `barberId` for workers.
- Permissions: `manageTenant`, `manageBookings`, `manageStaff`, `inviteWorkers`,
  `removeWorkers`, `manageServices`, `manageInventory`, `manageBilling`.
- The tenant owner (`tenants/{id}.ownerUid`) has every permission in the rules.
- **SuperAdmin = custom claim `superadmin: true`** (or `platformAdmin`). There is
  no Firestore fallback.
- Frontend mapping (`AuthContext`): admin roles → `user.role = 'admin'`,
  worker/barber → `'barber'` with `user.barberId`, everyone else → `'client'`.
- Rules helpers to reuse: `isSuperAdmin()`, `isTenantOwner(t)`,
  `hasTenantPermission(t, perm)`, `isAssignedBarber(t, barberId)`.
- Barber listeners must be scoped by `barberId` (see
  `assignedBarberRecordListenerScope` in `src/app/lib/bookingAccess.ts`).
  A tenant-wide query from a barber is denied as a whole.

## Bookings

- Browsers never write bookings. Everything goes through server code:
  `createBookingRequest`, `transitionBookingStatus`,
  `recordBookingPaymentRequest`, `completeBookingPaymentRequest` (HTTP, Firebase
  ID token in `Authorization`), plus marketplace callables in `functions/src/bookings.ts`.
- Status machine in `functions/src/bookingStatus.ts`; slot locks in `booking_slot_locks`.
- Clients must be logged in to book (`/book`); the draft survives login.
- Money is stored in minor-unit-safe server fields: `pricePaid`, `tip` (singular).

## Money (as coded today)

- Caisse = completed `pricePaid + tip` + product sales + deposits − expenses
  (non-salary) − payroll payments. Tips are currently **in** the caisse
  (open decision, audit H3).
- Barber wallet = completed `pricePaid × commissionRate%` + 100% tips −
  `payroll_payments`. Computed client-side in `BusinessContext.getBarberWalletBalance`.
- Payroll: barber creates `payroll_requests` (pending) → admin approves in the
  Paie tab → `payroll_payments` + an `expenses` "Salaire" doc (`isPayroll: true`).
- `expenses` and `deposits` are owner-only in the rules today.

## Routes (`src/app/App.tsx`)

Public: `/`, `/register`, `/docs`, `/discover`, `/discover/:profileId`,
`/r/:code`, `/book`, `/boutique`. Logged in: `/admin`, `/barber`, `/client`,
`/brand`, `/freelancer`, `/superadmin`, `/billing`, `/onboarding`,
`/invitations/:invitationId`. `HomeRouter` shows the SaaS HomePage on
`VITE_MAIN_DOMAIN` and a salon LandingPage on salon subdomains.

## Collections (main ones)

Legacy salon: `tenants` (public read), `subdomains`, `barbers`, `services`,
`bookings`, `products`, `sales`, `expenses`, `deposits`, `payroll_requests`,
`payroll_payments`, `notifications`, `client_notes`, `campaigns`, `gallery`,
`attendance`, `settlements`, `manual_payments` (superadmin).
Marketplace: `brands`, `salonLocations`, `memberships`, `invitations`,
`freelancerProfiles`, `portfolioItems`, `publicProfiles`, `cityLaunches`,
`availability`, `bookingRequests`, `bookingRequestPrivate`, `jobPosts`,
`jobApplications`, referral collections (`referralPrograms`, `referralCodes`,
`referralAttributions`, `referralRewards`, `creditLedgers`). Most marketplace
collections are server-write-only.

Notifications: admins read `recipientId == 'admin'`, barbers read their
`barberId`, clients their uid. `sendPush()` only accepts a server-issued
notification id; legacy calls with title/message are silently ignored.

## Env vars

Vercel: `VITE_FIREBASE_*`, `VITE_MAIN_DOMAIN`, `VITE_ONESIGNAL_APP_ID`,
`ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`, `VERCEL_TOKEN`,
`VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`.
Functions: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_PRO`,
`STRIPE_WEBHOOK_SECRET`. Never commit real values (`.env.example` holds names only).

## Working rules

- One fix per branch/PR. Keep changes minimal; don't refactor unrelated code.
- Any change to `firestore.rules` gets a test in `rules-tests/`.
- Before opening a PR: frontend build, functions `tsc`, static rules analysis,
  and the relevant rules tests.
- In the PR, say whether rules/functions need a `firebase deploy` and to which project.

## Known open issues

See the Project audit (24 Sep 2026). Highest priority: leaked Vercel token in
git history (C1), migration of existing barbers to memberships + superadmin
claim before deploying rules (C2), Clients tab empty for admins (H1), wallet
reset maths (H2), tips model (H3), `Africa/Algiers` default timezone (H5),
Enterprise plan not purchasable (H6).

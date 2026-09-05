# Marketplace final corrective wave report

Date: 2026-09-05
Baseline: `108276e`
Corrective range: `108276e..HEAD`

## Outcome

This single local-only wave closes the six Important final-review findings:

1. Job-application selection now requires both `manageJobs` and exact-location `inviteWorkers`; an active Brand Principal remains allowed. Rejection still requires only `manageJobs`. The transaction revalidates the application, job, Principal/location membership, city, brand, location, and relationship before creating an invitation.
2. Freelancer profile saves read the availability document in the same transaction, preserve explicitly reserved or transactionally consumed slots, and cannot re-add them from a stale draft. Availability reservation/release tracks `configuredSlots`, `availableSlots`, and `reservedSlots`; a second request for a consumed slot fails.
3. Authenticated Principals and exact-location members with `manageBookings` can write salon availability and load/respond to manual salon booking requests through server-authorized callables. The Brand dashboard exposes the availability writer and accept/decline workspace; automatic bookings continue to confirm while atomically reserving the slot.
4. Authenticated Principals and exact-location members with `manageJobs` can load a server-projected hiring workspace. Jobs and applications are queried by location, revalidated against brand/city/location/job scope, and rendered in salon create/list/review UI. Browser rules for the source collections remain closed.
5. The client dashboard now listens to both marketplace `bookingRequests` and legacy `bookings`, with a mandatory `clientId == authenticated uid` constraint on each. Records are defensively parsed, legacy statuses are normalized, partial-listener errors stay visible without hiding successfully loaded results, and historical records cannot call the marketplace cancellation endpoint.
6. Freelancer service prices are owner-configurable and strictly keyed to configured services. Home visits require a browser-supplied approximate coordinate; the server checks it against the freelancer radius, does not persist it, and snapshots service price, fixed travel fee, total, radius, estimated distance, cancellation window, and cancellation deadline. Client cancellation is rejected at or after that deadline. Client and freelancer views show the snapshotted price/travel/cancellation facts.

No Stripe/payment configuration, provider integration, deployment, migration, staging write, production access, or external-account action was performed.

## Test-first evidence

- Application authority: the new invite case initially accepted a `manageJobs`-only reviewer; it is green only after the `inviteWorkers`/Principal authorization gate.
- Freelancer pricing: the server profile-save test initially failed with `Server-owned freelancer fields cannot be supplied by client`; the client parser then failed by dropping `servicePricesMinor`. Both contracts are now green.
- Salon operations: three booking tests initially failed because `saveSalonAvailability` and `listSalonBookingWorkspace` did not exist and salon response still depended on a non-injected broad membership lookup. Exact deterministic authority and scoped callables made them green.
- Hiring workspace: the client test initially failed because no scoped workspace parser/export existed. It now rejects cross-location application data.
- Legacy history: the new pure record/scope suite initially failed because `bookingRecords` did not exist. It now covers marketplace ownership, legacy normalization, and exact client query constraints.
- Salon UI: the view test initially failed because the availability/booking and job/application managers did not exist. It now covers availability editing, manual accept/decline, job creation, rejection, and permission-aware invitation controls.
- Home-visit policy tests cover outside-radius rejection, server-owned price/travel/cancellation snapshots, late-cancellation denial, and non-persistence of approximate coordinates.
- Availability tests cover stale freelancer drafts and a second booking attempt after the first transaction consumes the slot.

## Verification

- `cd functions && npx jest src/jobs.test.ts src/bookings.test.ts --runInBand` — **33/33 passed**.
- `/Users/mac/Documents/ChatGPT/barberboard/elite-cuts/node_modules/.bin/tsx --test $(rg --files src/app | rg '\.(test|spec)\.(ts|tsx)$' | sort)` — **50/50 passed**.
- `npx jest --config rules-tests/jest.config.cjs --runInBand` with the 14 non-emulator contract suites (`booking-create`, `booking-payment`, `booking-status`, transition state/UI, business info, environment, HTTP endpoints, legacy authority, membership permissions, public scrub/projection, push target, worker credential static) — **126/126 passed**.
- `node rules-tests/static-analysis.cjs` — **15/15 passed**.
- Focused Firestore-emulator run of `rules-tests/booking-privacy.rules.test.cjs` using the locally installed JDK 21 — **3/3 passed**, including exact client-scoped marketplace and legacy booking queries, denied cross-client query, and denied unscoped legacy query.
- `cd functions && npm run build` — passed.
- `npm run build` — Vite production build passed.
- `node --check rules-tests/booking-privacy.rules.test.cjs` — passed.
- `git diff --check` — passed.

The first `firebase emulators:exec` wrapper attempt started Firestore successfully but its nested `npx jest` resolved an incomplete worktree-local Jest runner and exited before tests. Starting the same local emulator explicitly and running the same Jest command directly produced the green 3/3 result above. This was a harness-resolution issue, not a rules/test failure.

## Release gates

- The new dual-history rules assertions have run locally, but the complete repository emulator matrix was not rerun in this wave; Java-equipped CI should run it before release.
- No staging journey was run because this task forbids deploys and external-account/data access. Before rollout, exercise automatic salon, manual salon approval/decline, stale-slot contention, freelancer in/out-of-radius booking, cancellation before/after the window, and both employee/chair-rental application selection in staging.
- Existing freelancer source profiles must be saved with one integer minor-unit price per configured service before accepting new home-visit requests; the server fails closed on incomplete pricing/travel policy.

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
6. Freelancer service prices remain owner-configurable and strictly keyed to configured services. Home visits now fail closed: caller coordinates are rejected, city display centroids are never treated as professional origins, and freelancer projections do not advertise home booking until trusted address geocoding and a verified origin exist. France appointment/deadline conversion uses `Europe/Paris`, handles winter/summer offsets, rejects DST gaps/ambiguities, and corrects stored UTC-derived deadlines from the snapshotted cancellation-window policy before enforcement.

## Residual re-review corrections

The final residual pass added three bounded corrections on top of the original wave:

1. **Trusted home-visit location and French time:** `approximateLocation` is no longer an accepted client booking field. A legacy profile still advertising home visits cannot reserve a slot because the server rejects the request before any write when it cannot verify both ends of the journey. New freelancer saves publish `homeVisit: false`. Existing cancellation records with a valid date, time, and snapshotted window are evaluated against a DST-safe Paris deadline; malformed historical wall times do not trap clients.
2. **Availability intent:** `configuredSlots` is now distinct from `availableSlots` in the salon callable, response parser, and editor. Reserved slots remain visible in configuration during a no-op save. An explicit empty configuration remains empty after decline/cancellation; only legacy documents with no `configuredSlots` field retain the compatibility behavior of restoring released slots.
3. **Client promotions:** the Promotions tab and coupon display are restored. Clients do not attach a tenant-wide campaign listener. An authenticated callable derives salon association from server-owned client booking records, computes conservative per-salon segments from completed history, and returns only active exact-tenant matches or campaigns explicitly targeted to the caller UID. The existing admin listener is attached only when `manageServices` is provable. Campaign loading/errors are independent from booking/history listeners, so one failure does not erase valid data from another source.

## Final public-discovery fail-closed correction

Public discovery now forces `homeVisit: false` at both projection creation and response sanitization. This closes the stale-document path without requiring a source update, trigger run, or migration: an already-stored approved public profile with `homeVisit: true` is returned as false by both list and detail APIs, so the client home-visit filter and badges receive no positive availability signal. The legacy source field remains tolerated only for backward compatibility and is deliberately ignored until trusted address geocoding is available.

No Stripe/payment configuration, provider integration, deployment, migration, staging write, production access, or external-account action was performed.

## Test-first evidence

- Application authority: the new invite case initially accepted a `manageJobs`-only reviewer; it is green only after the `inviteWorkers`/Principal authorization gate.
- Freelancer pricing: the server profile-save test initially failed with `Server-owned freelancer fields cannot be supplied by client`; the client parser then failed by dropping `servicePricesMinor`. Both contracts are now green.
- Salon operations: three booking tests initially failed because `saveSalonAvailability` and `listSalonBookingWorkspace` did not exist and salon response still depended on a non-injected broad membership lookup. Exact deterministic authority and scoped callables made them green.
- Hiring workspace: the client test initially failed because no scoped workspace parser/export existed. It now rejects cross-location application data.
- Legacy history: the new pure record/scope suite initially failed because `bookingRecords` did not exist. It now covers marketplace ownership, legacy normalization, and exact client query constraints.
- Salon UI: the view test initially failed because the availability/booking and job/application managers did not exist. It now covers availability editing, manual accept/decline, job creation, rejection, and permission-aware invitation controls.
- Home-visit correction tests cover rejection of caller coordinates, fail-closed behavior before a slot write, Paris winter/summer offsets, DST gaps/ambiguities, correction of a stale UTC-derived deadline, and late-cancellation denial.
- Availability tests cover stale freelancer drafts, a second booking attempt after the first transaction consumes the slot, explicit-empty release/cancellation behavior, legacy compatibility, and independent configured/available salon workspace fields.
- Campaign tests cover authentication, rejection of caller-selected scope, exact client booking queries, explicit UID targeting, cross-tenant exclusion, server-derived VIP/inactive/new segments, client response parsing, permission-gated admin listeners, UI loading/empty/error states, and coupon rendering.
- The public-profile regression first failed in four paths—new projection, stored-document sanitizer, list response, and detail response—when supplied stale `homeVisit: true` data. All four are green only after the shared projector/sanitizer forces false.

## Verification

- `cd functions && npx jest src/jobs.test.ts src/bookings.test.ts src/campaigns.test.ts --runInBand` — **43/43 passed**.
- `/Users/mac/Documents/ChatGPT/barberboard/elite-cuts/node_modules/.bin/tsx --test $(rg --files src/app | rg '\.(test|spec)\.(ts|tsx)$' | sort)` — **54/54 passed**.
- `npx jest --config rules-tests/jest.config.cjs --runInBand rules-tests/public-profile-projection.test.cjs` — **8/8 passed**.
- `npx jest --config rules-tests/jest.config.cjs --runInBand` with the 14 non-emulator contract suites (`booking-create`, `booking-payment`, `booking-status`, transition state/UI, business info, environment, HTTP endpoints, legacy authority, membership permissions, public scrub/projection, push target, worker credential static) — **127/127 passed**.
- `node rules-tests/static-analysis.cjs` — **15/15 passed**.
- Focused Firestore-emulator run of `rules-tests/booking-privacy.rules.test.cjs` using the locally installed JDK 21 — **3/3 passed**, including exact client-scoped marketplace and legacy booking queries, denied cross-client query, and denied unscoped legacy query.
- `cd functions && npm run build` — passed.
- `npm run build` — Vite production build passed.
- `node --check rules-tests/booking-privacy.rules.test.cjs` — passed.
- `git diff --check` — passed.

The first `firebase emulators:exec` wrapper attempt started Firestore successfully but its nested `npx jest` resolved an incomplete worktree-local Jest runner and exited before tests. Starting the same local emulator explicitly and running the same Jest command directly produced the green 3/3 result above. This was a harness-resolution issue, not a rules/test failure.

## Release gates

- The dual-history rules assertions ran in the preceding commit. No Firestore rule changed in this residual correction, so the emulator matrix was not rerun; Java-equipped CI should still run the complete matrix before release.
- No staging journey was run because this task forbids deploys and external-account/data access. Before rollout, exercise automatic salon, manual salon approval/decline, configured-slot removal while reserved, cancellation/release, campaign targeting for all supported segments, and both employee/chair-rental application selection in staging.
- Home visits are intentionally unavailable until a separately reviewed server-trusted geocoder, a verified freelancer origin, and operational failure/privacy behavior are configured. Browser coordinates and city centroids must not be reintroduced as authority.

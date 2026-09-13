# Final fix wave report

Date: 2026-09-05
Baseline: `bc7d756`
Initial final-fix range: `bc7d756..1070ffc`

## Outcome

This wave closes the final-review Critical/Important blockers without deploying or accessing an external account:

1. Worker passwords are no longer collected, created, stored, read, or displayed. Public worker writes are recursively scrubbed, exact-field/type checked, marked safe, and staff access uses worker-owned email invitations.
2. Only an active Brand Principal can change an active Salon Admin's exact permission set. The change and immutable audit event commit in one transaction; the Brand UI requires explicit member selection and exposes the `inviteWorkers` toggle.
3. A delegated Salon Admin with `inviteWorkers` may invite workers but cannot invite another Salon Admin; only a Principal may do that.
4. Invitation and authenticated-booking return paths are allowlisted, persisted in session storage, restored after login, and reject external or elevated routes.
5. New accounts receive email verification; unverified accounts have resend, reload, and forced-token-refresh recovery before invitation acceptance.
6. An idempotent, deterministic legacy-authority migration inventories Auth claims, creates compatible owner memberships, retires all legacy tenant/role authority claims, revokes refresh tokens, preserves unrelated claims, and fails before its first write if any conflict exists. It defaults to dry-run and was not executed.
7. Walk-in creation is awaited end to end and reports success only after the server transaction commits; failures remain visible and keep the dialog open.
8. Manual scheduled bookings are approved but unpaid. Completion plus cash attestation/payment is atomic, exact-amount checked, audited, and legacy bookings derive/backfill their expected amount from their location-scoped service.
9. Booking creation requires a verified Firebase bearer token at the endpoint. Anonymous form state uses a strict, tenant-bound session draft and resumes only after authentication.
10. Firebase CLI defaults to staging, named staging/production aliases are validated, production needs explicit confirmation, server Admin config cannot fall back to a client Vite variable, and seed/reset/diagnostic utilities are staging-only and default to no write.

Additional final-review hardening included marketplace worker-to-location tenant authorization, server-owned `brandId` on bookings, location booking-policy UI and enforcement, exact business-info schema validation with no browser writes, legacy invitation compatibility, safe public-profile projection, truthful booking transition UI, and rejection of nested maps in public worker timestamp fields.

## Verification evidence

- `node rules-tests/static-analysis.cjs` — **13/13 passed**.
- `npx jest --config rules-tests/jest.config.cjs --runInBand` with the 13 non-emulator suites (`booking-create`, `booking-payment`, `booking-status`, transition state/UI, business info, environment, HTTP endpoints, legacy migration, permissions, public scrub, push target, worker credential static) — **119/119 passed**.
- `npx --yes tsx --test` across the 16 TypeScript/component/invitation suites — **45/45 passed**.
- `npm run build` in `functions/` — TypeScript build passed.
- `npm run build` at the repository root — Vite production build passed.
- `git diff --check` — passed.

The full Firestore-emulator command was attempted for `authz.rules`, booking concurrency/transition, bootstrap, base rules, invitation rules, and membership rules. At that checkpoint the default `java` executable was unavailable, so the emulator assertions remained a release gate. This limitation was later superseded by the explicit Homebrew JDK 21 run documented in the final correction below.

## Rollout gates and external follow-up

- No Firebase deploy, migration apply, staging write, production read, or external-account action occurred.
- Before release, rotate/revoke the historical demo/super-admin credential that existed in repository history. Current scripts contain no committed password and do not print environment-supplied credentials, but repository cleanup cannot revoke an already exposed external credential.
- Repeat the Java 21 emulator suite in CI, then exercise the Principal/Admin/Worker invitation and Paris/Grenoble/Mulhouse location journeys in staging.
- Run both migration CLIs in staging dry-run mode first, resolve every conflict/deferred record, apply with the exact staging confirmation, verify membership/claim parity and forced token refresh, and only then use the explicit production target/confirmation in a separately approved rollout.

## Corrective re-review: granular operational access

Re-review rejected phase acceptance at `1070ffc`: the operational rules used active membership presence as full tenant authority, so the newly bridged zero-permission worker membership inherited unrelated bookings and all tenant writes. The corrective commit range is `1070ffc..HEAD`.

The correction removes the broad membership-authority helper from the rules and maps operations explicitly:

- bookings and client notes require `manageBookings`; a worker may read only a booking whose `barberId` equals the server-owned `barberId` on their active membership and may change only its `unreadBarber` flag;
- barber creation/update requires `manageStaff`, deletion requires `removeWorkers`, and a worker may update only safe presentation/schedule fields on their own linked barber document;
- services, gallery, and campaigns require `manageServices`; products and sales require `manageInventory`;
- payroll, team attendance, settlements, and staff audit creation require `manageStaff`; workers retain only linked self-attendance and own-settlement reads;
- expenses and deposits remain Principal/tenant-owner only; notifications require `manageBookings` or an exact recipient/linked-barber match.

The client booking listener now emits a server-provable `clientId` or assigned `barberId` query. Anonymous and unassigned-worker sessions attach no booking listener; administrators retain their tenant query. Legacy tenant owners retain operational access through the immutable `tenants/{id}.ownerUid` record.

Corrective verification:

- RED: static analysis failed SA-6/SA-14/SA-15 against membership-presence rules; the new booking-listener test failed before its access policy existed.
- GREEN: `node rules-tests/static-analysis.cjs` — **15/15 passed**.
- Non-emulator Jest suite — **119/119 passed**.
- TypeScript/component/invitation suite including booking scope — **47/47 passed**.
- Functions TypeScript build and Vite production build — passed.
- `node --check` for both changed rule-test files and `git diff --check` — passed.

The emulator behavioral tests now assert zero-permission denial, assigned-booking/profile minimal access, permission separation, and cross-location denial. They remain pending Java-equipped CI/staging; no deployment or external access occurred.

## Corrective re-review: worker attendance and settlement listener scope

Re-review rejected phase acceptance at `d0b6978`: Firestore correctly limited a zero-permission worker to attendance and settlement records whose `barberId` matches the server-owned membership link, but `BusinessContext` subscribed to each full tenant collection. Firestore therefore rejected both listeners instead of returning the worker's own records.

The correction introduces one shared listener-scope policy and applies it to both collections:

- a worker with a server-hydrated `barberId` subscribes with both `tenantId == activeTenant` and `barberId == assignedBarber`;
- a client, anonymous session, or worker without a membership barber link attaches no attendance or settlement listener;
- administrators retain the existing tenant-wide query;
- both arrays are cleared before a scope/tenant transition so a narrower worker session cannot temporarily retain data from a previous wider subscription.

Runnable client tests cover worker, administrator, superadministrator, client, anonymous, and unassigned-worker scope. Emulator assertions cover exact own-record results plus rejection of tenant-wide and other-barber attendance/settlement queries.

Corrective verification:

- RED: `npx --yes tsx --test src/app/lib/bookingAccess.test.ts` failed because the new record-scope policy did not exist.
- GREEN: the focused scope suite passed **4/4**.
- `node rules-tests/static-analysis.cjs` — **15/15 passed**.
- Thirteen non-emulator Jest suites — **119/119 passed**.
- The complete local TypeScript/component/invitation command — **42/42 passed**.
- Functions TypeScript build and Vite production build — passed.
- `node --check rules-tests/authz.rules.test.cjs` — passed.

`npx firebase emulators:exec --only firestore "npx jest --config rules-tests/jest.config.cjs --runInBand rules-tests/authz.rules.test.cjs"` was attempted and stopped before test execution because the default `java` executable was unavailable. The later explicit JDK 21 verification below supersedes that local limitation. No deployment or external account access occurred.

## Final emulator correction: safe optional platform claims

The complete emulator suite exposed one remaining rules failure: `isSuperAdmin()` read optional custom-token properties with direct member access. Tokens issued to ordinary users do not contain `superadmin` or `platformAdmin`, so Firestore produced an undefined-property CEL error while evaluating otherwise normal authorization branches. The helper now reads both claims with `request.auth.token.get(..., false)`, preserving exact super-admin behavior while making absent claims safely false.

The credential-scrub test fixture now grants its purported normal manager the required granular `manageStaff` permission; the earlier `manageStaff: false` fixture conflated credential validation with authorization. A separate regression exercises a token with neither platform claim and verifies that denial does not contain an undefined-token evaluation error.

Final verification:

- RED: focused `authz.rules` reproduced **13/14 passed** with `Property superadmin is undefined`; the added missing-claim regression then failed as intended.
- GREEN: focused `authz.rules` — **15/15 passed**.
- Direct emulator process: `env JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH firebase emulators:start --only firestore --project demo-elite-cuts-rules` — Firestore started on `127.0.0.1:8080` with OpenJDK **21.0.12.1**.
- Complete direct suite: `env FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 /Users/mac/Documents/ChatGPT/barberboard/elite-cuts/node_modules/.bin/jest --config rules-tests/jest.config.cjs --runInBand` — **24/24 suites and 210/210 tests passed**.
- `node rules-tests/static-analysis.cjs` — **15/15 passed**.
- `node --check rules-tests/authz.rules.test.cjs` — passed.
- Functions TypeScript build and Vite production build — passed.
- No deploy, migration, staging write, production access, or external-account action occurred.

# Final fix wave report

Date: 2026-09-05
Baseline: `bc7d756`
Commit range: `bc7d756..HEAD` (the task-only final-fix commit)

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

The full Firestore-emulator command was attempted for `authz.rules`, booking concurrency/transition, bootstrap, base rules, invitation rules, and membership rules. It stopped before executing tests because `java -version` exits 1: **no Java runtime is installed on this host**. The new emulator assertions remain checked in and must run in Java-equipped CI/staging before release. An earlier direct Jest invocation that accidentally included two emulator-backed suites likewise timed out against the absent emulator; rerunning the correctly separated local suites produced the green results above.

## Rollout gates and external follow-up

- No Firebase deploy, migration apply, staging write, production read, or external-account action occurred.
- Before release, rotate/revoke the historical demo/super-admin credential that existed in repository history. Current scripts contain no committed password and do not print environment-supplied credentials, but repository cleanup cannot revoke an already exposed external credential.
- Install/use Java in CI, run all seven emulator suites, then exercise the Principal/Admin/Worker invitation and Paris/Grenoble/Mulhouse location journeys in staging.
- Run both migration CLIs in staging dry-run mode first, resolve every conflict/deferred record, apply with the exact staging confirmation, verify membership/claim parity and forced token refresh, and only then use the explicit production target/confirmation in a separately approved rollout.

# SDD ledger — plan: docs/superpowers/plans/2026-09-04-marketplace-booking-and-hiring.md

## Preflight review

| Tasks/interfaces | Producer → consumer | Finding / ruling |
|---|---|---|
| Task 1 → Task 2 | `PublicProfile`, profile route and discovery selection → authenticated booking request | Compatible. Task 1 exposes only approved projections; Task 2 passes the selected owner/location through a server-validated booking request. |
| Task 1 → Task 3 | Freelancer public-profile and portfolio projection → freelancer-owned profile and portfolio controls | Compatible. Task 3 must preserve server-owned visibility/moderation fields rather than allowing direct projection writes. |
| Task 2 → Task 3 | Controlled booking state and client status cards → freelancer accept/decline flow | Compatible. Freelancer home visits use the same state machine but always begin `pending_approval`. |
| Task 1 / Task 3 | `src/app/App.tsx`, `firestore.rules`, public profile data | Sequential modification required. Task 3 extends Task 1 routes and rules after its review gate. |
| Task 2 / current foundation | Plan names `functions/src/bookings.ts` as new, but it already exists from multi-salon hardening | Ruling: extend the existing server-controlled booking module rather than duplicating it — preserving the reviewed token validation, transactional status, and correct error semantics. Cost if wrong: integration rework, not authority regression. |
| Task 3 / payments | Plan and original spec mention Stripe test deposits; user explicitly directed that Stripe/payment configuration is the last feature and is not authorized now | Ruling: implement only payment-safe states/settings and fail-closed confirmed-deposit capability checks; no checkout, provider credentials, test transaction, or payment deployment. Cost if wrong: deposits remain unavailable until a separately approved payments phase. |
| Task ordering | Specification lists freelancer profile before public discovery while this approved plan lists discovery first | Ruling: build approved public projection/query contract first, showing no freelancer data until a freelancer elects public visibility in Task 3. Cost if wrong: discovery initially has fewer results, never unapproved data. |

Preflight: no unresolved conflicts. Global city IDs remain exactly `fr-paris`, `fr-grenoble`, and `fr-mulhouse`; discovery includes enabled cities only. No production data, payment configuration, deployment, or external account action is in scope.

Task 1: fix round 1/5 (3 addressed, 1 open — coarse server-selected city coordinates, approval-aware projection test, list-shape privacy policy; Firestore cannot prove complex shape predicates for anonymous list queries; commits `99f4276..052f53e`)
Task 1: fix round 2/5 (1 addressed, 0 open — moved anonymous city/profile list and detail delivery to a server-sanitized callable, with direct browser reads/writes denied; commits `052f53e..b378d87`)
Task 1: minor (deferred): Java-backed Firestore emulator rules suite and anonymous Paris-only staging scenario must run before release.
Task 1: complete (commits `7cb5b56..b378d87`, review clean)
Task 2: fix round 1/5 (4 addressed, 0 open — Firestore transaction read ordering, truthful listener errors, home-visit capability validation, and confirmed-address recovery; commits `acbd870..9646376`)
Task 2: minor (deferred): Java-backed Firestore rules/emulator scenarios, staging journey, and repository ESLint configuration remain release verification work.
Task 2: complete (commits `b378d87..9646376`, review clean)
Task 3: complete (freelancer profile/portfolio/availability, manual home-visit workspace, city/location-scoped jobs, employee vs chair-rental invitations, and fail-closed deposit capability; no payment provider or deployment)
Task 3: fix round 1/5 (5 addressed, 0 open — complete owner query scopes, confirmed-only exact-address recovery, portfolio projection refresh and 12-item cap, owned portfolio success fixture, same-city job reload)
Task 3: minor (deferred): Java-backed freelancer rules suite and staging acceptance journeys must run before release; payment staging remains deferred to a separately approved provider phase.

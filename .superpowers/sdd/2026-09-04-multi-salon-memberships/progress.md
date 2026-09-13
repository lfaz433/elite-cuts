# SDD ledger — plan: docs/superpowers/plans/2026-09-04-multi-salon-memberships.md

## Preflight review

| Tasks/interfaces | Producer → consumer | Finding / ruling |
|---|---|---|
| Task 1 → Task 2 | `memberships`, `salonLocations`, `PermissionKey`, and membership roles → workspace and brand dashboard | Compatible. Task 2 will consume the stable record vocabulary created in Task 1. |
| Task 1 → Task 3 | Callable membership authority and Firestore rules → invitation creation/acceptance authorization | Compatible. Task 3 must retain the same membership statuses and permission names. |
| Task 2 → Task 3 | `/brand/*` dashboard and `App.tsx` routing → invitation dialog and invitation-acceptance route | Compatible. Both modify `App.tsx` sequentially; Task 3 extends Task 2's routes. |
| Task 1 | Rules tests reject cross-location access and privilege escalation; implementation creates server-owned roles and permissions | Compatible with the approved spec's server-managed authority requirement. |
| Task 2 | Permission editor exposes only Principal Admin-controlled switches and excludes Principal Admin as a Salon Admin role | Compatible with the approved spec's location-scoped authority model. |
| Task 3 | Pending email-bound invitation becomes active only after acceptance by its recipient | Compatible with one-login-per-person and worker-owned credentials. |

Preflight: no conflicts found. Payment configuration remains out of scope.

Ruling: add a server-owned brand bootstrap path alongside the task's location-creation callable — a Principal Admin otherwise cannot exist to create the first location. Task 1 creates the primitive; Task 2 connects new brand registration to it and routes that user to `/brand`. Existing legacy tenant records remain untouched, so the cost of this ruling is limited to new MVP sign-ups until a deliberate migration is designed.

Task 1: fix round 1/5 (3 addressed, 0 open — Rules CEL syntax, emulator-gap disclosure, dynamic Salon Admin fixture; commits 3a45bb9..7b9220f)
Task 1: minor (deferred): Firestore emulator assertions require Java and must run in staging or a Java-equipped CI environment before release.
Task 1: minor (deferred): Functions lint has no checked-in ESLint configuration.
Task 1: complete (commits f4780d7..7b9220f, review clean)
Task 2: fix round 1/5 (2 addressed, 0 open — legacy admin routing and manager-only location access; commits b35a772..f1c901d)
Task 2: fix round 2/5 (1 addressed, 0 open — verified principal authority only; commits f1c901d..adf8466)
Task 2: minor (deferred): authenticated Paris/Grenoble/Mulhouse switching requires a staging Principal Admin session before release.
Task 2: complete (commits 7b9220f..adf8466, review clean)
Task 3: fix round 1/5 (3 addressed, 0 open — verified email, login return, duplicate invitation acceptance; commits 62a5b2f..bc7d756)
Task 3: minor (deferred): Firestore emulator and staging invitation flow still require Java and staging credentials/deployment before release.
Task 3: complete (commits adf8466..bc7d756, review clean)
Final re-review: rejected at `1070ffc` and phase acceptance reopened — Critical: bare active location membership granted unrestricted operational collection access, including zero-permission workers.
Final corrective task: implementation complete, phase acceptance pending re-review — removed bare-membership operational authority, added granular permission gates and server-linked barber-only workflow scope, and preserved tenant-owner legacy workflows. Commit is recorded in the handoff.
Final listener re-review: rejected at `d0b6978` and phase acceptance reopened — Important: the client still issued tenant-wide attendance and settlement queries for zero-permission workers, while the rules allow those workers to read only records linked to their membership-owned `barberId`.
Final listener corrective task: implementation complete, phase acceptance pending re-review — attendance and settlement listeners now use exact tenant-plus-assigned-barber scope for workers, skip client/unassigned-worker sessions, clear stale wider-scope data before resubscribing, and retain tenant-wide manager behavior. Commit is recorded in the handoff.

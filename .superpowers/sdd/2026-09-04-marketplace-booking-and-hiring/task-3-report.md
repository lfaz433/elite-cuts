# Task 3 report — freelancer workspace and hiring

## Delivered

- Added an authenticated Freelancer workspace at `/freelancer` with profile visibility (off by default for a new profile), city, bio, languages, services, a simple travel radius, fixed travel fee, cancellation window, availability slots, owned portfolio management, home-visit decisions, and city-relevant jobs.
- Profile, availability, and portfolio mutations use authenticated callables. The server derives `uid`, ownership, country/city scope, timestamps, public projection fields, and moderation state; callers cannot supply server-owned approval or ownership fields. Existing public-profile approval is preserved and still controls Task 1 projection publication.
- Portfolio items remain freelancer-owned and enter `pending` moderation. Job applications accept only portfolio IDs whose stored `ownerId` and `ownerType` match the authenticated freelancer.
- Added server-owned job publishing, listing, application, and review flows. Job publication requires the location's `manageJobs` authority (or brand Principal Admin), derives its city and brand from the location, and stores immutable brand/location/city/relationship scope on the application. Applying requires the freelancer profile city to match the job city; review revalidates every copied scope field against the current job.
- Job selection creates a pending invitation with an explicit relationship. `employee` becomes a `worker` membership and worker profile; `chair_rental` becomes a `chair_renter` membership with no worker profile, preserving independent status. Acceptance rejects contradictory roles or an existing conflicting relationship.
- Reused Task 2's server-controlled home-visit state machine in the freelancer dashboard. Pending requests expose only their approximate area; each freelancer visit requires accept/decline, and exact address access remains callable-only after confirmation.
- Added a fail-closed `createConfirmedDeposit` callable. It checks authentication, booking ownership, `confirmed` status, country, and country capability, then still fails because provider collection is not configured. It never creates a deposit, calls a provider, returns a checkout URL, or exposes a payment action.
- Firestore rules allow a freelancer to read only their own profile, portfolio, and availability. Browser writes are denied for those collections, and direct reads/writes are denied for jobs, applications, payment capability, and marketplace deposits.

## TDD record

- `functions/src/jobs.test.ts` was created before its production modules. The first run failed with `ENOENT` for `jobs.ts`, `freelancers.ts`, and `deposits.ts`.
- The red suite covered a foreign portfolio ID, cross-city application, employee/chair-rental invitation roles, profile approval preservation, pending booking deposits, and disabled country deposits. A later red case proved legacy salon city names were not yet converted to stable city IDs.
- The freelancer route test failed while the CTA still returned `coming-soon`; the authenticated return-route test failed until `/freelancer` was explicitly allowlisted.
- Invitation relationship tests failed until chair-rental membership mapping existed, and the invitation UI test failed while chair rental was still labelled as a generic collaborator.
- The emulator rules suite was written before the rules change. Its red run could not connect to the Java-backed Firestore emulator at `127.0.0.1:8080`, matching the existing Task 1/2 environment limitation.

## Security and compatibility review

| Requirement | Evidence |
| --- | --- |
| Freelancer owns profile and portfolio | Callable identity supplies `uid`/`ownerId`; rules expose only matching owner records; foreign portfolio application is rejected. |
| Server-authorized sensitive operations | Profile/portfolio/availability writes, job publishing/application/review, invitation conversion, and deposits are callable-only. |
| City/location scoping | Job scope is derived from `salonLocations`; list/apply use the freelancer's stable city ID; review verifies application scope against the job before acting. |
| Employee vs independent chair rental | Invitations carry `relationshipType`; employee acceptance creates `worker` plus worker profile, while chair rental creates `chair_renter` with no worker profile. |
| Home address privacy | No Task 2 private-address rules or storage changed; the dashboard displays approximate area before acceptance and uses the existing confirmed-only response/address path. |
| No payment rollout | No credentials, provider SDK calls, checkout URL, transaction, deployment, or actionable deposit UI was added. Deposit preferences are labelled future/non-actionable and the callable always fails closed. |
| Existing permissions preserved | New job authority uses server-issued Principal/location memberships and `manageJobs`; no legacy tenant or Task 1/2 rule was relaxed. |

## Verification

- `cd functions && npx jest src/jobs.test.ts src/bookings.test.ts --runInBand` — passed, 19/19.
- `cd functions && npm run build` — passed.
- Focused TS/TSX tests for auth return, role journey, freelancer/job parsers, invitation authorization, and chair-rental UI — passed, 25/25.
- `npm run build` — passed (Vite production build).
- Existing non-emulator rules/contract suite — passed, 126/126.
- `git diff --check` and a scoped scan confirming no new Stripe, checkout URL, payment-intent, or provider-credential references — passed.

## Deferred release verification

- `rules-tests/freelancer.rules.test.cjs` requires the Java-backed Firestore emulator, which is unavailable on this host.
- Staging profile, home-visit, employee, chair-rental, and payment scenarios were not run because this task explicitly forbids deploys, external data/account actions, and test payment execution.
- Before release, run the emulator rules suite and staging acceptance scenarios. Payment staging must remain excluded until a separately approved provider/configuration phase.

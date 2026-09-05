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

## Review fix round 1/5

- Freelancer portfolio and booking listeners now issue the complete rule-provable scope: authenticated `ownerId` plus `ownerType == freelancer`. The emulator suite includes both the valid full query and the denied incomplete query for each collection.
- Exact home addresses are requested only for confirmed freelancer bookings through the existing authorized `getBookingAddress` callable. Acceptance fetches and renders the address immediately; a confirmed snapshot after refresh recovers it. Pending requests never enter the address-fetch set.
- A portfolio write trigger now rebuilds the source profile's approved URL projection on create, update/moderation, and delete. The existing freelancer-profile trigger then safely republishes or removes the Task 1 public projection.
- Approved portfolio collection and public-profile validation share a tested limit of 12. A 13-item valid source is deterministically capped instead of causing the public profile to disappear.
- The owned-portfolio fixture now proves the valid parser/application path before the foreign-item rejection. Successful profile saves increment the job-board revision, so the first save reloads jobs even if the city did not change.

## TDD record

- `functions/src/jobs.test.ts` was created before its production modules. The first run failed with `ENOENT` for `jobs.ts`, `freelancers.ts`, and `deposits.ts`.
- The red suite covered a foreign portfolio ID, cross-city application, employee/chair-rental invitation roles, profile approval preservation, pending booking deposits, and disabled country deposits. A later red case proved legacy salon city names were not yet converted to stable city IDs.
- The freelancer route test failed while the CTA still returned `coming-soon`; the authenticated return-route test failed until `/freelancer` was explicitly allowlisted.
- Invitation relationship tests failed until chair-rental membership mapping existed, and the invitation UI test failed while chair rental was still labelled as a generic collaborator.
- The emulator rules suite was written before the rules change. Its red run could not connect to the Java-backed Firestore emulator at `127.0.0.1:8080`, matching the existing Task 1/2 environment limitation.
- Review-round tests were added before the fixes. Server tests initially failed because `refreshFreelancerPortfolioProjection` did not exist; the workspace helper suite initially failed because its module did not exist. The new emulator query cases again stopped at the unavailable Firestore emulator before assertions could execute.

## Security and compatibility review

| Requirement | Evidence |
| --- | --- |
| Freelancer owns profile and portfolio | Callable identity supplies `uid`/`ownerId`; rules expose only matching owner records; foreign portfolio application is rejected. |
| Server-authorized sensitive operations | Profile/portfolio/availability writes, job publishing/application/review, invitation conversion, and deposits are callable-only. |
| City/location scoping | Job scope is derived from `salonLocations`; list/apply use the freelancer's stable city ID; review verifies application scope against the job before acting. |
| Employee vs independent chair rental | Invitations carry `relationshipType`; employee acceptance creates `worker` plus worker profile, while chair rental creates `chair_renter` with no worker profile. |
| Home address privacy | No Task 2 private-address rules or storage changed; the dashboard displays approximate area before acceptance and calls `getBookingAddress` only for a confirmed response or confirmed refresh snapshot. |
| Portfolio projection consistency | Every freelancer portfolio write rebuilds approved URLs, capped to the same 12-item limit enforced by public projection validation. |
| No payment rollout | No credentials, provider SDK calls, checkout URL, transaction, deployment, or actionable deposit UI was added. Deposit preferences are labelled future/non-actionable and the callable always fails closed. |
| Existing permissions preserved | New job authority uses server-issued Principal/location memberships and `manageJobs`; no legacy tenant or Task 1/2 rule was relaxed. |

## Verification

- `cd functions && npx jest src/jobs.test.ts src/bookings.test.ts --runInBand` — passed, 21/21.
- `cd functions && npm run build` — passed.
- Focused TS/TSX tests for auth return, role journey, freelancer/job/workspace parsers, address selection, query scope, invitation authorization, and chair-rental UI — passed, 28/28.
- `npm run build` — passed (Vite production build).
- Ten existing non-emulator rules/contract suites — passed, 94/94.
- Firestore static authorization analysis — passed, 15/15.
- `git diff --check` and a scoped scan confirming no new Stripe, checkout URL, payment-intent, or provider-credential references — passed.

## Deferred release verification

- `rules-tests/freelancer.rules.test.cjs`, including the new complete-query cases, requires the Java-backed Firestore emulator. The fresh attempt failed at setup with `ECONNREFUSED 127.0.0.1:8080` before any rule assertion ran.
- Staging profile, home-visit, employee, chair-rental, and payment scenarios were not run because this task explicitly forbids deploys, external data/account actions, and test payment execution.
- Before release, run the emulator rules suite and staging acceptance scenarios. Payment staging must remain excluded until a separately approved provider/configuration phase.

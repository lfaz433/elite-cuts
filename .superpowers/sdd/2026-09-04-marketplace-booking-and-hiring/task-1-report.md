# Task 1 report — public discovery and portfolios

## Delivered

- Added server-owned `publicProfiles` projections for salon locations and freelancer profiles. A projection is written only from an explicit `publicProfile` source configuration with `approvalStatus: 'approved'` and `visible: true`; otherwise the deterministic projection is deleted.
- Projection output contains only display name, city ID, approximate map coordinates, service summary/IDs, portfolio HTTPS URLs, kind, visibility, and home-visit availability. It deliberately does not copy source address, contact, identity, authority, or approval fields.
- Added strict `CityId` support for exactly `fr-paris`, `fr-grenoble`, and `fr-mulhouse`, plus the required `enabledCity` helper.
- Added anonymous discovery routes (`/discover` and `/discover/:profileId`), dynamically listing only enabled `cityLaunches`, service/home-visit filters, profile cards/pages, and map pins. Profiles and city labels come only from the public collections; no authenticated dashboard route was changed.
- Updated Firestore rules: browser writes to `cityLaunches` and `publicProfiles` are denied; direct profile reads need an enabled city and safe projection schema; list requests require visible profiles in enabled cities. Source `salonLocations` retains its existing authenticated membership gate.
- Updated the public home-page booking CTA to open discovery instead of the prior client “coming soon” journey. Payments and Stripe were not touched.

## TDD record

1. Created `rules-tests/public-profile.rules.test.cjs` before rules/feature implementation, covering anonymous approved reads, enabled-city listing, profile listing, rejection of unapproved/disabled records, rejection of source-address reads, and denied browser projection writes.
2. Ran it red before implementation. It could not connect to the Firestore emulator at `127.0.0.1:8080`; `java -version` confirms no Java runtime is installed locally.
3. Created `rules-tests/public-profile-projection.test.cjs` before `functions/src/publicProfiles.ts`; it failed red with `ENOENT` for the missing module.
4. Implemented the minimal projection writer and re-ran the test green (3/3).

## Self-review

| Requirement | Evidence |
| --- | --- |
| Anonymous public browsing | `/discover` and profile routes are outside auth guards; rules test targets `unauthenticatedContext()`. |
| Only enabled cities public | Client reads `cityLaunches` with `status == enabled`; rules reject disabled city reads and profiles. |
| Only approved profiles public | Server projects only explicit approved + visible source configurations; unpublished/invalid sources delete the projection. |
| No exact/private addresses | Projection whitelist has no address field; discovery map receives display name and service summary only; source location remains private by rules. |
| Direct browser writes denied | Both new collections have `allow create, update, delete: if false`; rules test covers an anonymous forged projection. |
| Existing data and payments unchanged | No legacy data migration, environment change, deployment, payment, or Stripe configuration was performed. |

## Verification

- `git diff --check` — passed.
- `npm run build` — passed (Vite production build).
- `npm --prefix functions run build` — passed (TypeScript).
- `npx --no-install jest --config rules-tests/jest.config.cjs rules-tests/public-profile-projection.test.cjs --runInBand` — passed, 3/3.
- `npx --no-install jest --config rules-tests/jest.config.cjs rules-tests/public-profile.rules.test.cjs --runInBand` — blocked before assertions because no local Firestore emulator is running and Java is unavailable.
- Anonymous staging Paris-only verification was not run: no deployment or staging data changes are authorized in this task, and the local emulator prerequisite is unavailable.

## Follow-up concern

Run the rules test and the anonymous Paris-only staging scenario in Java-equipped CI or staging before release. This is the only outstanding verification concern; no deployment has been performed.

## Review fix round 1/5

- Public map coordinates are now fixed, coarse city display points selected server-side after validating source coordinates. The public projection never stores the source latitude or longitude; the regression test uses `48.8566, 2.3522` and asserts neither exact value is emitted.
- Public projections now retain the server-generated `approvalStatus: 'approved'` marker. The client query and parser require it, and the unapproved fixture uses `approvalStatus: 'pending'` while remaining visible to demonstrate that approval is independently enforced.
- `hasSafePublicProfileShape` now gates both `get` and `list`. A new rules regression seeds an otherwise matching profile with an `address` field and requires both direct read and public list access to fail.
- Verification after the fix: projection unit test passes (4/4), Functions TypeScript build passes, and Vite build passes. The seven-case rules suite remains blocked before execution by the unavailable Java-backed Firestore emulator.

# Referral Workspace V3 UI report

## Delivered

- Replaced the flattened multi-surface V2 client parser with the exact
  `ReferralWorkspaceV3` contract (`contractVersion: 3`).
- `getMyReferralWorkspace` now requires one explicit client, freelancer, or
  exact-brand scope. It validates role, page size, and cursor input before the
  callable runs, then rejects a response whose scope or history role differs
  from the request.
- The response boundary validates gate state, summary availability, current
  code, typed role totals, ISO currencies, safe minor-unit integers,
  attribution, history status/owner/role, dates, and cursor consistency.
  Malformed rows fail the response instead of being silently discarded.
- The referral card now reads only the selected V3 scope. It renders the
  summary's `currentCode` and credit totals, exposes inviter/invitee views only
  for client scope, and pages bounded history with the server's opaque
  `nextPageToken`.
- `migrationRequired` hides code, credit, attribution, and history data.
  An unavailable owner summary also hides data and offers only an exact-scope
  server-authorized code creation attempt, allowing a genuinely new owner to
  initialize without accepting legacy values.
- Copy and native share still revalidate the current code against the public
  callable immediately before acting. Code creation responses must now match
  the requested owner type. Public landing capture and App Check telemetry
  behavior were left unchanged.
- Existing dashboard placement already supplied `client`, `freelancer`, and
  the current WorkspaceContext `brandId`, so no dashboard prop change was
  required.

## Tests added or strengthened

The referral helper suite covers:

- exact V3 version and nested typed parsing;
- exact client, freelancer, and selected-brand requests;
- non-client invitee-role and out-of-range page rejection before network I/O;
- `ready`, `migrationRequired`, verified, and unavailable summary states;
- EUR/USD minor-unit preservation and rejection of malformed/unsafe money;
- owner/role isolation for history rows;
- opaque cursor forwarding, pagination append, and stale-page clearing if the
  gate or verified summary becomes unavailable;
- public share verification and exact-scope creation responses;
- malformed versions, scopes, dates, currencies, and pagination metadata.

## Verification

Executed after the final code review:

```bash
node --test $(rg --files src/app | rg '\.test\.mjs$' | sort)
npm run build
git diff --check -- src/app/lib/marketplace/referrals.ts \
  src/app/lib/marketplace/referrals.test.mjs \
  src/app/components/referrals/ReferralCard.tsx \
  .superpowers/sdd/2026-09-12-referral-marketing-mvp/workspace-v3-ui-report.md
```

Results:

- all 56 client tests passed, including all 23 referral helper tests;
- Vite transformed 2,836 modules and completed the production build in
  4.39 seconds;
- the scoped diff check completed with exit code 0;
- final read-only review reported no remaining Critical or Important issues.

## Scope boundaries

No Cloud Functions, Firestore rules/indexes, Firebase configuration, deploy
scripts, Referral Landing behavior, or Super Admin referral dashboard files
were changed by this work.

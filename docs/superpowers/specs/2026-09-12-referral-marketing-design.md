# Referral marketing MVP design

## Purpose

Give Elite Cuts a simple, trustworthy acquisition loop without introducing cash payouts or Stripe. Clients, freelancers, and salon brands can share a personal referral link. A referral earns a platform credit only after the invited client completes their first eligible booking.

The first launch is controlled by the Super Admin and runs in staging before any production release.

## User journey

1. A client, freelancer, or salon shares their unique referral link or short code.
2. A new client opens the link. The app stores the referral attribution locally for 30 days and shows a clear welcome message.
3. The new client creates an account and the system attaches the attribution once. A referral code cannot be replaced after account creation.
4. The client completes their first eligible booking.
5. Server-side logic validates the booking, creates pending rewards, and applies the configured fraud checks.
6. The Super Admin can approve the reward, reject it with a reason, or automatically approve it when the referral is low risk.
7. On approval, the inviter receives a platform credit and the invited client receives a one-use discount credit. Neither balance is convertible to cash in this MVP.

## Roles

- **Super Admin:** creates, pauses, and configures referral programs; reviews rewards and suspicious referrals; sees platform-wide reporting.
- **Client:** shares a personal link, sees referral status and earned credit, and can use an approved discount on an eligible future booking.
- **Freelancer:** shares a personal link and sees earned platform credit in their professional workspace.
- **Brand owner:** shares a brand link and sees brand-level referral results. A salon worker cannot change the brand program.
- **Invited client:** receives a welcome discount only after their first completed booking; cannot refer themselves.

## Data model

All financial-like state is server-written. Browser clients have no direct write access to the following collections.

### `referralPrograms/{programId}`

One platform program is active at a time. It includes `status` (`draft`, `active`, `paused`, `archived`), country availability, start/end dates, inviter credit in minor currency units, invited-client discount in minor units, first-booking eligibility requirements, and audit timestamps.

### `referralCodes/{code}`

Maps a normalized, case-insensitive code to its owner: `ownerType` (`client`, `freelancer`, `brand`), `ownerId`, `programId`, status, and creation time. Codes are globally unique and reserved transactionally. Workspace reads scope a code by the `ownerId` and `ownerType` pair, never by an identifier alone.

### `referralAttributions/{invitedUserId}`

Stores the immutable selected code, inviter identity and `inviterOwnerType` from that code, program, recorded time, source, and expiration. One invited user can have only one attribution. The inviter's namespace makes a client UID distinct from a brand ID with the same string.

### `referralRewards/{rewardId}`

Stores the referral, booking, invited user, inviter, two reward legs, status (`pending`, `approved`, `rejected`, `cancelled`), rejection reason, approval actor, and timestamps. Each leg has its durable namespace: `inviterOwnerId`/`inviterOwnerType` comes from the reserved referral code, while `invitedOwnerId`/`invitedOwnerType` identifies the invited client. A composite unique key prevents duplicate rewards for one program and invited user.

### `creditLedgers/{ledgerId}`

Append-only record of approved credits and redeemed discounts. Each record includes `ownerId` and `ownerType`, copied from the validated reward leg, so balances are derived in the correct client/freelancer/brand namespace. Clients never edit a balance document.

### `referralTelemetry/{telemetryId}`

Private, server-written aggregate telemetry for successfully validated public referral links. `overview` holds the platform-wide count and `{programId}__{code}` holds a code/program count; no per-visit documents are written. Each aggregate contains only the normalized code where applicable, program ID, country code, count, and server timestamp—never an account, device, IP, address, or profile. A public caller records a visit only through `recordReferralVisit`. Its transaction reads the normalized code and global aggregate, validates the code and active/current program, and only then mutates aggregate counters. The callable uses Functions v1 `enforceAppCheck: true`, `consumeAppCheckToken: true`, and `maxInstances: 2`; its handler also rejects missing or already-consumed App Check context before Firestore work. When the global cap is reached after validation, it does not read the per-code aggregate. Counts are financially inert and capped at 10,000 per code and 1,000,000 platform-wide. They represent non-unique validated calls, not authoritative acquisition analytics. Staging must configure and initialize the web App Check provider/site key before enabling telemetry; referral-link validation and browsing remain available if best-effort telemetry reporting fails. App Check and the two-instance cap mitigate abusive invocation and Firestore work, but do not make public browser traffic or function-invocation cost mathematically DDoS-free.

The public telemetry result is exactly `{ code: string, status: 'active', recorded: boolean }`. `recorded` is `true` only when an aggregate increment committed; it is `false` for a valid code when either cap is already reached. Missing, invalid, or consumed App Check is rejected before this result, and unavailable code/program returns `not-found` with no aggregate write.

### `referralAudit/{auditId}`

Private, server-written referral-only audit rows record referral program changes, code creation, attribution, pending reward creation, manual flag/clear actions, and review outcomes. Rows include a referral action, relevant program/reward/code identifiers, actor UID and reason when applicable, and a server timestamp. This separates referral history from generic application audit events so a privileged query can filter at the database level without starving matching entries behind unrelated recent activity.

## Referral callable scope contracts

`createMyReferralCode` accepts only a selected, server-authorized scope; it never accepts a program ID, code, or owner ID from the browser:

```ts
{ scope: { type: 'client' } }
{ scope: { type: 'freelancer' } }
{ scope: { type: 'brand', brandId: '...' } }
```

Client scope requires a canonical `users/{uid}` identity record whose stored `uid` equals the authenticated UID, no `freelancerProfiles/{uid}` document, and no active salon membership. This matches the normal signup schema, which intentionally has no browser-supplied role. Freelancer scope requires that same canonical user identity plus the authoritative `freelancerProfiles/{uid}` document whose stored `uid` equals the authenticated UID, and no active salon membership. Brand scope requires that canonical identity and an active `principal_admin` or `salon_admin` membership for the exact requested, existing brand. Legacy roles are compatibility hints only: an absent role or the compatible legacy personal role is permitted, while a known non-personal role is denied for personal scope; a legacy admin may use only a verified brand membership. Missing or mismatched identity records fail closed. Super Admin/platform-admin identities cannot create a referral code in any scope.

`getMyReferralWorkspace` is contract version **3**. Every request selects exactly one authenticated and server-authorized scope; it never enumerates all of a user's brands or returns combined personal/brand surfaces.

```ts
type ReferralWorkspaceScope =
  | { type: 'client' }
  | { type: 'freelancer' }
  | { type: 'brand'; brandId: string };

type ReferralWorkspaceRequest = {
  scope: ReferralWorkspaceScope;
  role?: 'inviter' | 'invitee'; // `invitee` is valid only for `client`
  limit?: number;               // integer 1..20; defaults to 10
  pageToken?: string;           // opaque continuation from the same scope + role
};

type ReferralWorkspaceV3 = {
  contractVersion: 3;
  state: 'ready' | 'migrationRequired';
  scope: ReferralWorkspaceScope;
  summary: {
    ownerType: 'client' | 'freelancer' | 'brand';
    state: 'verified' | 'unavailable';
    codeCount: number;
    attributionCount: number;
    currentCode?: { code: string; programId: string; status: string };
    inviter: ReferralWorkspaceRoleSummary;
    invitee: ReferralWorkspaceRoleSummary;
  };
  attribution?: { code: string; programId: string; inviterOwnerType: 'client' | 'freelancer' | 'brand'; expiresAt: string };
  history: { role: 'inviter' | 'invitee'; items: ReferralWorkspaceHistoryItem[]; nextPageToken?: string; truncated: boolean };
};

type ReferralWorkspaceRoleSummary = {
  pendingCount: number; approvedCount: number; rejectedCount: number; cancelledCount: number; flaggedPendingCount: number;
  creditTotals: Array<{ currency: string; pendingMinor: number; approvedMinor: number }>;
};
type ReferralWorkspaceHistoryItem = {
  id: string; ownerType: 'client' | 'freelancer' | 'brand'; role: 'inviter' | 'invitee';
  amountMinor: number; currency: string; status: 'pending' | 'approved' | 'rejected' | 'cancelled'; createdAt?: string;
};
```

Client invitee attribution/credits are represented only in that client's `invitee` summary or `role: 'invitee'` page; freelancer and brand scopes only expose inviter data. Brand scope authorization is an exact active `principal_admin` or `salon_admin` membership query for the requested existing `brandId`; inactive and worker memberships cannot crowd it out. Personal scopes require the same authoritative profile, freelancer, and active-membership checks as code creation.

The summary is the server-written `referralOwnerSummaries/{ownerType}__{ownerId}` projection (`schemaVersion: 1`, `summaryEpoch: 'referral-v3'`) and is updated in the transaction that creates a code/attribution/reward or reviews/flags a canonical reward. Its typed path and duplicated owner fields must agree. Its `currentCode` is a pointer, not browser authority. Missing, malformed, or wrong-epoch projections return `state: 'unavailable'` and no raw-record fallback; this quarantines unsupported pre-v3/legacy data rather than silently claiming zero balances.

History is queried only from the bounded server-written `referralOwnerHistory` projection for the exact typed owner and role, ordered newest-first and fetched as `limit + 1`. `truncated` and `nextPageToken` therefore describe the real page boundary. The callable source-validates at most 20 returned reward rows against their deterministic evidence, booking, attribution, code, program, and—when approved—deterministic ledger leg. Orphaned ledgers, malformed aliases, and invalid source links are omitted. No user request scans raw reward/ledger collections, fans out across brands, or fetches a silently arbitrary 100-row window. This is a deliberate breaking staging contract; pre-V3 workspace consumers must not infer or synthesize V3 data.

## Super Admin marketing dashboard

The dashboard contains:

- program status and country availability;
- controls for reward values, activation, pause, and end date;
- totals for visits, attributed sign-ups, eligible first bookings, pending rewards, approved rewards, and credit issued;
- conversion funnel and top referrers, identified by the `{ inviterId, inviterOwnerType }` pair;
- a review queue with fraud flags and approve/reject actions;
- a searchable referral/reward audit trail.

The initial dashboard uses the current premium dark-and-gold Elite Cuts design. It must show explicit empty states and never show invented financial totals as live data.

`getReferralMarketingOverview` is Super Admin-only. Its machine contract is version 3 and the dashboard parser rejects any other version, epoch, field shape, unsafe count, duplicate typed/currency key, or inconsistent alias total rather than inferring missing data.

```ts
type ReferralOwnerType = 'client' | 'freelancer' | 'brand';

type ReferralCreditTotal = {
  currency: string;    // unique ISO-4217 key within its containing array
  amountMinor: number; // non-negative safe integer
};

type ReferralOverviewPage<T> = {
  items: T[];
  nextPageToken?: string;
  truncated: boolean;
};

type ReferralProgramOverview = {
  id: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  countryCodes: string[];
  currency: string;
  inviterCreditMinor: number;
  invitedDiscountMinor: number;
  startsAt: string;
  endsAt: string;
};

type ReferralPendingRewardOverview = {
  id: string;
  programId: string;
  bookingId: string;
  inviterId: string;
  invitedUserId: string;
  inviterCreditMinor: number;
  invitedDiscountMinor: number;
  currency: string;
  status: 'pending';
  createdAt?: string;
  fraudFlag?: { status: 'flagged' | 'cleared'; reason: string };
};

type ReferralAuditEntry = {
  id: string;
  action: string;
  programId?: string;
  rewardId?: string;
  code?: string;
  actorUid?: string;
  reason?: string;
  createdAt?: string;
};

type ReferralTopReferrer = {
  inviterId: string;
  inviterOwnerType: ReferralOwnerType;
  referrals: number;
  rewards: number;
  approvedCreditTotals: ReferralCreditTotal[];
};

type ReferralAuditFilter =
  | { limit?: number; code?: never; programId?: never; rewardId?: never; action?: never }
  | { code: string; limit?: number; programId?: never; rewardId?: never; action?: never }
  | { programId: string; limit?: number; code?: never; rewardId?: never; action?: never }
  | { rewardId: string; limit?: number; code?: never; programId?: never; action?: never }
  | { action: string; limit?: number; code?: never; programId?: never; rewardId?: never };

type ReferralMarketingOverviewRequest = ReferralAuditFilter & {
  programLimit?: number;
  programPageToken?: string;
  pendingLimit?: number;
  pendingPageToken?: string;
  flaggedLimit?: number;
  flaggedPageToken?: string;
  auditLimit?: number;
  auditPageToken?: string;
};

type ReferralMarketingInitializerResult = {
  initialized: true;
  alreadyInitialized: boolean;
};

interface ReferralMarketingOverview {
  contractVersion: 3;
  state: 'ready' | 'migrationRequired';
  summaryEpoch: 'referral-v3';
  telemetry: {
    state: 'verified' | 'unavailable';
    validatedVisits: number;
    capped: boolean;
  };
  programs: ReferralOverviewPage<ReferralProgramOverview>;
  funnel: {
    codes: number;
    validatedVisits: number;
    attributions: number;
    attributedSignups: number;
    rewards: number;
    eligibleFirstBookings: number;
    pending: number;
    pendingRewards: number;
    approved: number;
    approvedRewards: number;
    rejected: number;
    cancelled: number;
  };
  approvedCreditTotals: ReferralCreditTotal[];
  topReferrers: {
    items: ReferralTopReferrer[]; // at most the fixed top 10
    nextPageToken?: never;        // deliberately not pageable
    truncated: boolean;
  };
  pendingRewards: ReferralOverviewPage<ReferralPendingRewardOverview>;
  flaggedRewards: ReferralOverviewPage<
    ReferralPendingRewardOverview & { fraudFlag: { status: 'flagged'; reason: string } }
  >;
  auditTrail: ReferralOverviewPage<ReferralAuditEntry>;
}
```

Every response contains the complete envelope above. `summaryEpoch` is exactly `referral-v3`; the underlying marketing summary, program summaries, referrer summaries, canonical rows, and gate use schema/summary version `1`. `state: 'ready'` is returned only when both `referralMarketingState/v3` and `referralMarketingSummaries/overview` exist and validate. The gate must contain `{ schemaVersion: 1, summaryEpoch: 'referral-v3', status: 'initialized-empty' | 'reconciled' }`; a shallow overview document without that trusted gate is never sufficient.

If the gate or overview is missing, malformed, or from another epoch, the result is the safe `migrationRequired` envelope: every funnel count is zero, `approvedCreditTotals` is empty, all five page objects contain empty `items`, no continuation token, and `truncated: false`, while telemetry is exactly `{ state: 'unavailable', validatedVisits: 0, capped: false }`. The reader performs no raw historic fallback and does not merge any pre-V3 program, code, attribution, reward, ledger, telemetry, audit, or owner projection. The dashboard parser also rejects any non-empty or non-zero `migrationRequired` result.

For a ready envelope, platform counts and currency totals come from the server-maintained `referralMarketingSummaries/overview` projection. Program creation/configuration/status changes, code creation, attribution, eligible pending-reward issuance, approval/rejection/cancellation, and flag/clear actions update every affected platform, program, typed-referrer, and typed-owner summary in the same transaction as the canonical write; retries therefore do not double-count. The funnel aliases are intentionally equal: `attributedSignups === attributions`, `eligibleFirstBookings === rewards`, `pendingRewards === pending`, and `approvedRewards === approved`. It must also hold that `rewards === pending + approved + rejected + cancelled`. `cancelled` is a terminal non-credit reward count: cancellation moves one canonical reward from pending to cancelled and creates no ledger or approved currency amount. The current dashboard exposes no cancellation control or cancelled-detail page, but it must preserve this counter in the V3 funnel invariant. Pending and flagged pages contain only `status: 'pending'` rows.

`approvedCreditTotals` contains the sum of both approved reward legs, grouped into unique ISO-currency rows and ordered by currency. A typed top-referrer row is keyed by the complete `{ inviterOwnerType, inviterId }` namespace; its `referrals` and `rewards` come from that typed referrer summary and its currency rows contain only that referrer's approved inviter leg. Client, freelancer, and brand identifiers that share the same string never merge. Counts and currency deltas are accepted into projections only through evidence-validated, atomic server transitions; the V3 reader does not scan or trust arbitrary reward or ledger rows to reconstruct totals.

Telemetry remains isolated from financial state. `telemetry.validatedVisits` and `funnel.validatedVisits` are always equal. A missing `referralTelemetry/overview` document is a verified zero; a valid version-1 `referral-v3` document yields its non-negative `validatedVisitCount`; a malformed or wrong-epoch telemetry document yields `{ state: 'unavailable', validatedVisits: 0, capped: false }` while the overall envelope may remain `ready`. `capped` is exactly whether the verified count has reached the 1,000,000 platform cap. Visits are non-unique App-Check-validated calls and never change attribution, reward, or credit values.

Programs, pending rewards, flagged rewards, and audit history are cursor-pageable. Program, pending, and flagged limits default to 10 and accept safe integers from 1 through 20. Audit defaults to 20 and accepts 1 through 50; `limit` is retained only as an audit-limit alias, and if both `limit` and `auditLimit` are supplied they must be equal. Programs order by `updatedAt` descending then document ID descending; pending, flagged, and audit rows order by `createdAt` descending then document ID descending. Each query fetches `limit + 1` and returns `nextPageToken` if and only if `truncated` is true. The token is the last returned source document ID, must be treated by callers as opaque, and is validated against the corresponding collection, epoch/state, and—where applicable—the active audit filter before `startAfter`. Pending and flagged items are source-validated against their deterministic reward/evidence chain before display; invalid rows are omitted rather than trusted.

The request rejects unknown fields. Its audit selector accepts no filter or exactly one of normalized 3–32-character `code`, `programId`, `rewardId`, or `action`; document IDs/tokens must match `[A-Za-z0-9_-]{1,256}` and actions must match `REFERRAL_[A-Z_]{3,64}`. The filter is an exact indexed equality predicate and remains present on every continuation request. Unfiltered and filtered audit pages are newest-first and may expose privileged `actorUid` and `reason` only to the authenticated Super Admin. `programPageToken`, `pendingPageToken`, `flaggedPageToken`, and `auditPageToken` independently continue their named page; every response still returns all envelope fields. Top referrers are different: the server always requests 11 ranked rows, returns at most the first 10 ordered by attribution count, reward count, and typed summary ID, sets `truncated` when an eleventh exists, and never returns a continuation token. There is no top-referrer limit/token request field, and the dashboard parser rejects a top-referrer token.

All returned date/timestamp fields are ISO-8601 UTC strings; no Firestore `Timestamp` objects are returned. `flaggedRewards` is the subset of pending review rows whose `fraudFlag` is exactly `{ status: 'flagged', reason }`. Audit, pending, flagged, program, and ranking items use only the fields shown in the DTO above.

`initializeReferralMarketingV3` is a Super Admin-only, empty-payload callable; there is no seed object or manual zero-summary path. In one idempotent transaction it verifies the gate and overview, then uses bounded `limit(1)` existence queries over every referral canonical/projection collection plus referral ledger kinds and referral-prefixed generic audit rows. Only an environment with no gate, no overview, and no referral history may receive a zero summary plus the `status: 'initialized-empty'` gate. The exact result is `{ initialized: true, alreadyInitialized: false }`; repeating against the same valid gate and overview returns `{ initialized: true, alreadyInitialized: true }`. An invalid partial gate/summary, any prewritten overview, or any historic referral row fails with `failed-precondition` and leaves the reader in `migrationRequired`.

An environment with history must instead use a separately reviewed, server-authorized Admin SDK reconciliation workflow. That workflow validates and backfills every canonical V3 marker and evidence-backed projection, verifies typed counts and currency partitions, and atomically writes the reconciled overview with the exact version-1 `referral-v3` gate whose status is `reconciled`. The runtime initializer cannot reconcile, override, or bless legacy data. Empty staging initializes only after the exact indexes and Functions are deployed and indexes are ready; no production or staging operator writes the overview by hand.

`setReferralRewardFlag` is Super Admin-only. It requires a non-empty reason and can flag or clear only a pending reward, records a referral audit row, and does not create, approve, reject, or alter a credit. A flagged reward cannot be approved or issue a ledger until a Super Admin explicitly clears the flag with a reason. Flagged rewards remain in the manual review queue; this MVP has no automatic approval path.

## Eligibility and abuse prevention

- Only a new client may be invited in this MVP.
- The inviter cannot be the invited user.
- A referral must be attributed before the invited user creates their account.
- A reward is eligible after the invited user’s earliest positive-paid booking with canonical `isTest: false` reaches `completed`. New authoritative `bookings` creation always writes that immutable boolean; missing or non-boolean legacy values fail closed and are excluded from both the candidate predicate and earlier-booking queries, so they can neither earn nor suppress a later canonical booking. The authoritative server-written `completedAt` timestamp chooses the earliest record (booking ID is a deterministic tie-breaker), and its millisecond value is persisted with the pending reward for approval revalidation. The Firestore completion trigger supplies its immutable event ID and document update timestamp; that event timestamp determines both program and attribution date availability, so a completion before either expiry remains eligible if delayed trigger handling runs later. The reward transaction writes a separate private `referralBookingEvidence/{bookingId}` record with the deterministic reward ID, program/code/inviter typed identity, booking/invited identity, exact currency/credit terms, and evidence version/event/update/rollout markers. Approval re-reads the booking, code, program, attribution, and private evidence in one transaction, requires every persisted invariant to match exactly (including attribution expiry against the stored trigger timestamp), and derives ledgers only from that trusted evidence. Browser Firestore rules make both `completedAt` and `isTest` immutable to tenant managers; a browser cannot relabel a legacy booking as canonical. An active program receives `eligibilityEvidenceVersion: 1` and `eligibilityEvidenceNotBeforeAt` only on creation or transition to active. Both the server-written completion timestamp and trigger update timestamp must be on or after that threshold; programs/rewards/evidence that predate this marker, omit it, or do not meet it fail approval safely (but malformed legacy pending rewards remain rejectable). A positive-paid legacy booking without trustworthy completion evidence also fails eligibility safely.
- Cancelled, declined, refunded, missing/unpaid, free/zero-value, and test bookings are ineligible and do not consume the eligible first-booking slot.
- Each invited client can earn one reward per program.
- Server validation uses authenticated identity, booking ownership, booking status, program state, and atomic Firestore transactions.
- The system records warning flags for duplicate identity, repeated device/browser signals when available, unusual referral volume, and rapid self-referral patterns. Flags require Super Admin review; they do not silently delete records.

## Credits and payment boundary

Rewards are non-cash platform credits in the MVP. They cannot be withdrawn, transferred, or redeemed for cash. The product will not promise an automatic price reduction until Stripe/payment support is implemented. Until then, client discounts may be marked as approved credit and applied during a later booking workflow by a trusted server action.

## Privacy and localization

- Public links expose only the referral code, never the inviter email, private profile, or exact address.
- Program values use minor units and ISO currency code.
- Country availability is explicit, starting with France and expandable later.
- Referral attribution notices explain the benefit without exposing the inviter’s private data.

## Error handling

- Invalid, expired, paused, or unavailable codes show a friendly message and allow normal browsing.
- A code reservation collision retries with a new generated code server-side.
- A completed booking never creates duplicate rewards if an event is retried.
- Super Admin actions record an audit event and return a clear success or failure state.
- A missing or disabled program means referral processing is skipped safely; bookings remain unaffected.

## Out of scope

- Cash payouts, wallet withdrawal, or bank transfers.
- Stripe payment integration.
- Multi-level referral programs.
- Referral rewards for salon workers.
- Automatic marketing email/SMS delivery.

## Acceptance criteria

1. A new client can be attributed once through a valid referral link.
2. The first eligible completed booking creates exactly one pending reward pair.
3. A Super Admin can approve, reject, pause, and audit referral activity.
4. No browser client can forge rewards, credits, programs, or attribution.
5. The visual dashboard clearly distinguishes demo/empty data from live staging data.
6. Unit tests cover code normalization, self-referral rejection, duplicate prevention, program status, and reward eligibility; emulator tests cover direct-write denials.

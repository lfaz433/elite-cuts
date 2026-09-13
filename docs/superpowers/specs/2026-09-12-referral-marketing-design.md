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

`getMyReferralWorkspace` returns distinct server-owned sections rather than a flattened personal list:

```ts
{
  client: { ownerType: 'client', codes, attribution?, inviterRewards, inviteeRewards },
  freelancer: { ownerType: 'freelancer', codes, inviterRewards },
  brandWorkspaces?: [{ ownerType: 'brand', brandId, codes, rewards, creditTotals }],
}
```

Each reward row retains its `ownerType`. Client invitee attribution and reward credit appear only in the `client` section; freelancer inviter credit and every authorized brand workspace remain separate. This is a deliberate breaking staging contract so clients do not infer ownership from a flattened list.

## Super Admin marketing dashboard

The dashboard contains:

- program status and country availability;
- controls for reward values, activation, pause, and end date;
- totals for visits, attributed sign-ups, eligible first bookings, pending rewards, approved rewards, and credit issued;
- conversion funnel and top referrers, identified by the `{ inviterId, inviterOwnerType }` pair;
- a review queue with fraud flags and approve/reject actions;
- a searchable referral/reward audit trail.

The initial dashboard uses the current premium dark-and-gold Elite Cuts design. It must show explicit empty states and never show invented financial totals as live data.

`getReferralMarketingOverview` is Super Admin-only. Its machine contract is the exported TypeScript `ReferralMarketingOverview` below; a UI must reject an unsupported `contractVersion` rather than infer missing fields.

```ts
type ReferralOwnerType = 'client' | 'freelancer' | 'brand';

interface PublicReferralVisitResult {
  code: string;
  status: 'active';
  recorded: boolean;
}

interface ReferralMarketingOverview {
  contractVersion: 2;
  programs: Array<{
    id: string; status: 'draft' | 'active' | 'paused' | 'archived';
    countryCodes: string[]; currency: string; inviterCreditMinor: number;
    invitedDiscountMinor: number; startsAt: string; endsAt: string;
  }>;
  funnel: {
    codes: number; validatedVisits: number; attributions: number;
    attributedSignups: number; rewards: number; eligibleFirstBookings: number;
    pending: number; pendingRewards: number; approved: number;
    approvedRewards: number; rejected: number;
  };
  approvedCreditTotals: Array<{ currency: string; amountMinor: number }>;
  topReferrers: Array<{
    inviterId: string; inviterOwnerType: ReferralOwnerType; referrals: number;
    rewards: number; approvedCreditTotals: Array<{ currency: string; amountMinor: number }>;
  }>;
  pendingRewards: ReferralPendingReward[];
  flaggedRewards: Array<ReferralPendingReward & { fraudFlag: { status: 'flagged'; reason: string } }>;
  auditTrail: ReferralAuditEntry[];
}

interface ReferralPendingReward {
  id: string; programId: string; bookingId: string; inviterId: string;
  invitedUserId: string; inviterCreditMinor: number; invitedDiscountMinor: number;
  currency: string; status: 'pending'; createdAt?: string;
  fraudFlag?: { status: 'flagged' | 'cleared'; reason: string };
}

interface ReferralAuditEntry {
  id: string; action: string; programId?: string; rewardId?: string; code?: string;
  actorUid?: string; reason?: string; createdAt?: string;
}

type ReferralAuditFilter =
  | { limit?: number; code?: never; programId?: never; rewardId?: never; action?: never }
  | { code: string; limit?: number; programId?: never; rewardId?: never; action?: never }
  | { programId: string; limit?: number; code?: never; rewardId?: never; action?: never }
  | { rewardId: string; limit?: number; code?: never; programId?: never; action?: never }
  | { action: string; limit?: number; code?: never; programId?: never; rewardId?: never };
```

All returned date/timestamp fields are ISO-8601 UTC strings; no Firestore `Timestamp` objects are returned. `funnel.validatedVisits` is the private App-Check-gated aggregate count; it is non-unique and never affects reward or credit totals. The overview-level `approvedCreditTotals` includes only canonical approved credit-ledger legs (both inviter and invited-client legs), grouped solely by currency. The overview excludes any reward that does not have the deterministic reward ID and complete duplicated typed identity/evidence fields generated by the server, so its funnel counts, pending/flagged queues, and top-referrer reward counts cannot be mixed with a corrupt ledger owner. Each typed `topReferrers` row independently derives only its own inviter-credit totals from the same canonical ledger source, also grouped by currency; it has no currency-less amount. `flaggedRewards` is the manual-review queue and contains only rows with `fraudFlag.status === 'flagged'` and a required reason. `auditTrail` is privileged: actor UID and reason are returned only to Super Admin callers. The filter accepts at most one of `code` (normalized code), `programId` (document ID), `rewardId` (document ID), or `action` (referral action), with integer `limit` 1–50; an unfiltered trail is newest-first, and a filtered query runs directly against referral-only audit storage. The contract never merges client, freelancer, or brand namespaces sharing the same string ID.

`setReferralRewardFlag` is Super Admin-only. It requires a non-empty reason and can flag or clear only a pending reward, records a referral audit row, and does not create, approve, reject, or alter a credit. A flagged reward cannot be approved or issue a ledger until a Super Admin explicitly clears the flag with a reason. Flagged rewards remain in the manual review queue; this MVP has no automatic approval path.

## Eligibility and abuse prevention

- Only a new client may be invited in this MVP.
- The inviter cannot be the invited user.
- A referral must be attributed before the invited user creates their account.
- A reward is eligible after the invited user’s earliest positive-paid, non-test booking reaches `completed`. The authoritative server-written `completedAt` timestamp chooses the earliest record (booking ID is a deterministic tie-breaker), and its millisecond value is persisted with the pending reward for approval revalidation. The Firestore completion trigger supplies its immutable event ID and document update timestamp; that event timestamp determines both program and attribution date availability, so a completion before either expiry remains eligible if delayed trigger handling runs later. The reward transaction writes a separate private `referralBookingEvidence/{bookingId}` record with the deterministic reward ID, program/code/inviter typed identity, booking/invited identity, exact currency/credit terms, and evidence version/event/update/rollout markers. Approval re-reads the booking, code, program, attribution, and private evidence in one transaction, requires every persisted invariant to match exactly, and derives ledgers only from that trusted evidence. Browser Firestore rules make both `completedAt` and `isTest` immutable to tenant managers; the trusted booking completion/payment server workflows write the evidence. An active program receives `eligibilityEvidenceVersion: 1` and `eligibilityEvidenceNotBeforeAt` only on creation or transition to active. Both the server-written completion timestamp and trigger update timestamp must be on or after that threshold; programs/rewards/evidence that predate this marker, omit it, or do not meet it fail approval safely (but malformed legacy pending rewards remain rejectable). A positive-paid legacy booking without trustworthy completion evidence also fails eligibility safely.
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

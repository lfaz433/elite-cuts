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

## Referral callable scope contracts

`createMyReferralCode` accepts only a selected, server-authorized scope; it never accepts a program ID, code, or owner ID from the browser:

```ts
{ scope: { type: 'client' } }
{ scope: { type: 'freelancer' } }
{ scope: { type: 'brand', brandId: '...' } }
```

Client scope requires an existing `users/{uid}` record with `role: 'client'`, no freelancer profile, and no active salon membership. Freelancer scope requires an existing freelancer profile, a base user role of `client` or `freelancer`, and no active salon membership. Brand scope requires an active `principal_admin` or `salon_admin` membership for the exact requested, existing brand. Legacy account roles are not accepted as personal client/freelancer scope; a legacy admin may use only a verified brand membership. Super Admin/platform-admin identities cannot create a referral code in any scope.

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

## Eligibility and abuse prevention

- Only a new client may be invited in this MVP.
- The inviter cannot be the invited user.
- A referral must be attributed before the invited user creates their account.
- A reward is eligible after the invited user’s first booking reaches `completed`.
- Cancelled, declined, refunded, free, and test bookings are ineligible.
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

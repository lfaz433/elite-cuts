# Elite Cuts Scalable Marketplace MVP — Design Specification

**Status:** Approved for implementation planning
**Date:** 2026-09-04
**Scope:** Build a marketplace layer alongside the existing Elite Cuts salon product, after stabilizing its existing security and reliability foundations.

## Product outcome

Elite Cuts will connect clients, independent freelance barbers, salon teams, and multi-location salon brands in one platform. The first release must feel reliable and simple in France while keeping the data model and release process ready for later expansion.

Initial cities are Paris (primary launch), Grenoble, and Mulhouse. France launches first, followed by Canada, the United States, Algeria, and Morocco. Qatar and Dubai are future expansion markets.

## Principles

- One person has one Elite Cuts account and owns their login credentials.
- A person may have more than one workspace, such as Client, Freelancer, and Salon Staff, without creating duplicate accounts.
- A salon never creates or owns another person’s password. It may create a pending staff profile and invite the person to activate it.
- Freelancers remain independent: their portfolio, private clients, pricing, travel rules, and public visibility remain under their control.
- Important actions are explicit and clear. A booking cannot display success if it failed or is still pending approval.
- Staging is the only environment for feature testing. Production is changed only after staging verification.

## User roles and workspaces

### Client

Clients may browse the discovery map and public salon/freelancer profiles without signing in. An account is required to book, save favourites, manage bookings, or submit a review.

The client dashboard contains:

- upcoming bookings with a clear status and cancellation action;
- booking history and receipts;
- saved salons and freelancers;
- profile and notification preferences.

### Freelancer

A user activates a Freelancer workspace from their existing account. They may create a profile with bio, services, pricing, city, languages, portfolio images, availability, and travel settings.

For home visits, the freelancer chooses:

- whether their profile is visible to clients (off by default);
- a simple service radius;
- a fixed travel fee;
- availability;
- cancellation window;
- deposit option: no deposit, fixed amount, or percentage.

Every home-visit request requires the freelancer to accept or decline. Before acceptance, they see the service, requested time, price, travel rules, and approximate client area. The exact client address is released only after the freelancer accepts.

### Principal Admin / Brand Owner

The Principal Admin owns a salon brand and has access to brand-wide settings, all locations, reports, revenue, hiring, and permissions. They create salon locations and decide who has access to each location.

### Salon Admin

A Salon Admin is assigned to one or more named locations. They can manage only locations assigned to them. Their permissions are individual settings chosen by the Principal Admin, for example:

- manage bookings and calendars;
- manage existing staff;
- add/invite workers;
- remove workers;
- manage local services, portfolio, inventory, and job posts.

Salon Admins cannot create new locations, promote themselves to Principal Admin, see unassigned locations, or change brand-wide billing and sensitive settings.

### Worker / Salon Staff

Workers see their own schedule, assigned appointments, and permitted client information. They do not receive access to another location’s operations by default.

When the "add/invite workers" permission is enabled, a Salon Admin enters the prospective worker’s details and role. The system creates a pending membership and sends an invitation. The worker must accept using their own account before the staff workspace becomes active.

## Multi-salon brand model

One Brand contains many Salon Locations:

```text
Brand / Principal Admin
├── Salon 1 — Salon Admin + Workers
├── Salon 2 — Salon Admin + Workers
└── Salon 3 — Salon Admin + Workers
```

The brand-level dashboard aggregates permitted data from all locations. Each location keeps its own operating hours, services, local team, bookings, portfolio, inventory, and booking policy.

## Client discovery and booking journey

1. Client selects an enabled city and opens the map.
2. The map lists nearby locations and public freelancer profiles.
3. Client filters by service, home visit, price, distance, availability, rating, and profile/portfolio images.
4. Client opens a profile, selects a service and a time, then signs in or creates an account if necessary.
5. The booking moves through a visible status flow:
   - **Salon automatic:** available slot is confirmed immediately.
   - **Salon manual:** request is pending until the salon accepts or declines.
   - **Freelancer home visit:** request is pending until the freelancer accepts or declines.
6. The client dashboard shows the final status, reminders, location/approved address, price, cancellation policy, and receipt.

Failed requests must show a helpful error, preserve entered information where practical, and offer an alternative time or professional. The application must never convert an error or timeout into a successful booking state.

## Salon booking policy

Each salon location chooses one booking mode:

- **Automatic booking:** the client’s available appointment is confirmed immediately.
- **Manual approval:** the client submits a request and the location accepts or declines it.

This choice belongs to the location, not to individual workers, for the MVP. A freelancer’s home visits always use manual approval.

## Jobs and hiring journey

Salon locations may publish two kinds of positions:

- **Employee role:** staff relationship after the applicant accepts the invitation.
- **Independent chair rental:** independent professional relationship; the freelancer retains independent status.

The job flow is:

1. Salon creates a job post with location, role type, services, schedule, requirements, and pay or rental terms.
2. Freelancer discovers city-relevant jobs and applies with their existing profile and selected portfolio items.
3. Salon reviews the application and accepts, declines, or contacts the candidate.
4. If selected, the salon sends an invitation.
5. The freelancer accepts or declines the invitation.
6. Only accepted invitations create an active salon membership.

## Marketplace data architecture

The marketplace must be introduced as a clean new layer next to the existing salon product. Existing live data remains stable while the new feature set is migrated or adopted deliberately.

Core records:

- `users/{uid}`: account identity and private base profile; never the source of authority for elevated access.
- `brands/{brandId}`: brand metadata and Principal Admin ownership.
- `salonLocations/{locationId}`: physical location, `brandId`, city/country activation, public data, booking policy, and location settings.
- `memberships/{membershipId}`: user-to-brand or user-to-location relationship, role, granular permissions, invitation state, and audit metadata.
- `freelancerProfiles/{uid}`: independent profile, public visibility, services, travel configuration, and verification state.
- `portfolioItems/{itemId}`: owned profile/location portfolio media, moderation state, and public visibility state.
- `services/{serviceId}` and `availability/{ownerId}`: bookable services and availability owned by a location or freelancer.
- `bookingRequests/{bookingId}`: one controlled booking state machine for salon and home-visit bookings.
- `jobPosts/{jobId}` and `jobApplications/{applicationId}`: hiring and chair-rental workflow.
- `cityLaunches/{cityId}`: country/city availability and controlled activation settings.
- `auditEvents/{eventId}`: immutable history for invitation, permission, booking, cancellation, approval, and payment events.

Documents are scoped by stable IDs (`brandId`, `locationId`, `ownerId`, `countryCode`, `cityId`) and indexed for map discovery, city filters, calendars, staff views, and dashboards. Use consistent server timestamps and integer minor currency units for money.

## Security and reliability requirements

The existing application’s critical security and data consistency risks must be corrected before marketplace release:

- Do not authorize users from a client-writable `users/{uid}.role` or `tenantId` field.
- Resolve authority from server-managed memberships and custom claims where appropriate.
- Validate all sensitive actions on the server: booking transitions, financial calculations, payments, admin permission changes, invitation acceptance, and push notifications.
- Firestore rules must restrict direct client writes to a person’s own safe records and reject privilege escalation.
- Require brand/location membership plus relevant granular permission for operational data.
- Use server transactions for related changes such as sales and inventory.
- Use a reliable booking state machine: `draft`, `pending_approval`, `confirmed`, `declined`, `cancelled`, `completed`, and `payment_failed` where applicable.
- Do not expose an exact home address in public profile or discovery data.
- Keep client listeners scoped to the active workspace; do not attach broad listeners for every product collection.
- Use authenticated, authorized server endpoints for Stripe checkout and push notifications; validate webhook signatures without fallback bypasses.

## Payments

Each location or freelancer configures deposit behaviour. A deposit is charged only after a booking reaches `confirmed`. Staging uses payment-provider test mode and test credentials. Production uses separate live credentials only after payment flows are verified.

Payment rollout must be country-aware. The MVP should not promise online connected-account payouts in countries where the chosen provider is unavailable or restricted. Cash/on-site booking can remain available while local payment capability is assessed.

## Environments and release process

There are two Firebase projects:

- **Production:** `elite-cuts-app` — real users and real data.
- **Staging:** `elite-cuts-staging` — private test environment, empty at creation.

Staging and production use separate Firebase Authentication users, Firestore databases, Storage buckets, Hosting targets, Cloud Functions configuration, API keys, secrets, payment credentials, notification configuration, and analytics settings.

Release process:

1. Develop and run automated checks locally using fake data.
2. Deploy reviewed changes to `elite-cuts-staging` using an explicit staging target.
3. Create test users and run the MVP acceptance checklist.
4. Resolve failures, repeat staging tests, and review security rules.
5. Deploy the same reviewed release to `elite-cuts-app` using an explicit production target.

No real client, booking, address, payment, or portfolio data is copied to staging. Production configuration and deploy commands must be explicit; staging is never a shortcut to changing live data.

## MVP acceptance scenarios

The staging release is not ready for production until all of these pass:

1. Client browses public map, salon, and freelancer profiles without signing in.
2. Client signs up, books an automatic salon slot, and receives a confirmed status.
3. Client requests a manual salon slot and sees `pending_approval` until staff acts.
4. Client requests a home visit; exact address remains hidden until freelancer acceptance.
5. Freelancer accepts/declines a request and both parties receive the correct status.
6. Principal Admin creates a second salon location and assigns a restricted Salon Admin.
7. Principal Admin enables worker-invite permission for one Salon Admin and disables it for another.
8. Salon Admin creates a pending worker invitation; worker accepts with their own account.
9. Freelancer applies to employee and chair-rental job posts; accepted invitation respects the relationship type.
10. Firestore rules reject direct privilege escalation, cross-location access, and unapproved booking/payment changes.
11. Failed booking, network, and payment cases show an error—not a false confirmation.
12. Mobile viewport smoke tests pass for all primary journeys.

## Out of scope for initial MVP

- Worldwide launch and automatic multi-country payments.
- Complex distance-based travel calculation; MVP uses a simple radius and fixed travel fee.
- Staff-level booking policy overrides within the same salon location.
- Moving real production data into staging.
- Rebuilding all existing salon features at once.

## Implementation sequence

1. Establish project aliases and environment-specific configuration for staging and production.
2. Correct existing authentication, authorization, booking error handling, tenant scoping, and sensitive endpoint issues.
3. Build the shared identity and membership model.
4. Build multi-brand, multi-location, Principal Admin, Salon Admin, and worker invitation flows.
5. Build freelancer profile, portfolio, availability, travel configuration, and approval workflow.
6. Build public discovery map, client dashboard, and booking state machine.
7. Build jobs, applications, and invitation conversion.
8. Add payments behind country-aware capability checks.
9. Run the acceptance scenarios in staging and complete a security review before production release.

# Elite Cuts Marketplace Booking and Hiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver city discovery, client booking, freelancer home-visit approval, portfolios, job applications, and country-aware deposits on the secured foundation.

**Architecture:** Public discovery reads small approved projections. Functions create and transition booking, application, and deposit records; dashboards read only their user-scoped records. New marketplace records remain beside legacy tenant collections until deliberate adoption.

**Tech Stack:** React 18, TypeScript, React Leaflet, Firebase Auth, Firestore, Firebase Functions, Stripe test mode, Jest rules tests.

**Spec:** `docs/superpowers/specs/2026-09-04-elite-cuts-scalable-mvp-design.md`

## Global Constraints

- Initial city IDs are `fr-paris`, `fr-grenoble`, and `fr-mulhouse`; only enabled cities appear publicly.
- Public browsing is anonymous; booking, saving, and reviewing require authentication.
- Freelancer home visits always require approval; exact addresses are released only after confirmation.
- Deposits start only after confirmation and staging uses payment test credentials.

---

### Task 1: Public discovery and portfolios

**Files:**
- Create: `src/app/lib/marketplace/discovery.ts`, `src/app/components/pages/DiscoverPage.tsx`, `src/app/components/discovery/DiscoveryMap.tsx`, `src/app/components/discovery/ProfileCard.tsx`, `src/app/components/discovery/ProfilePage.tsx`, `functions/src/publicProfiles.ts`, `rules-tests/public-profile.rules.test.cjs`
- Modify: `src/app/App.tsx`, `firestore.rules`, `src/app/components/ui/MapComponent.tsx`

**Interfaces:** Produces `PublicProfile { id; kind: 'salon' | 'freelancer'; cityId; latitude; longitude; serviceSummary; portfolioUrls; visible: boolean }` and `listPublicProfiles({ cityId, serviceId?, homeVisit? }): Promise<PublicProfile[]>`.

- [ ] **Step 1: Write failing rules tests allowing approved public profile reads but rejecting private address and unapproved profile reads.**
- [ ] **Step 2: Run the tests; expect failure.**
- [ ] **Step 3: Implement server-generated `publicProfiles` projections, city gating, map pins, filters, and public profile pages.**

```ts
export type CityId = 'fr-paris' | 'fr-grenoble' | 'fr-mulhouse';
export const enabledCity = (cityId: CityId, launch: CityLaunch) => launch.status === 'enabled';
```

- [ ] **Step 4: Run rules tests and `npm run build`; verify anonymous staging discovery returns only enabled Paris records.**
- [ ] **Step 5: Commit with message `feat: add public marketplace discovery`.**

### Task 2: Client dashboard and controlled booking states

**Files:**
- Create: `functions/src/bookings.ts`, `src/app/lib/marketplace/bookings.ts`, `src/app/components/booking/BookingRequestForm.tsx`, `src/app/components/booking/BookingStatusCard.tsx`, `src/app/components/client/UpcomingBookings.tsx`, `src/app/components/client/BookingHistory.tsx`, `src/app/components/client/Favourites.tsx`, `functions/src/bookings.test.ts`, `rules-tests/booking-privacy.rules.test.cjs`
- Modify: `src/app/components/pages/ClientDashboard.tsx`, `src/app/App.tsx`, `firestore.rules`

**Interfaces:** Produces `requestBooking(input): Promise<{ bookingId: string; status: 'confirmed' | 'pending_approval' }>` and `respondToBooking({ bookingId, decision: 'accept' | 'decline' }): Promise<Booking>`.

- [ ] **Step 1: Write failing transition and address-redaction tests.**

```ts
expect(transition('pending_approval', 'confirmed')).toBe('confirmed');
expect(() => transition('pending_approval', 'completed')).toThrow('Invalid booking transition');
expect(redactAddress('pending_approval', address)).toBeUndefined();
```

- [ ] **Step 2: Run `cd functions && npx jest src/bookings.test.ts --runInBand`; expect failure.**
- [ ] **Step 3: Implement transactional availability checks, automatic/manual salon status, freelancer accept/decline, client cancellation, and dashboard status cards.**

```ts
const initialStatus = owner.type === 'freelancer' || owner.bookingPolicy === 'manual' ? 'pending_approval' : 'confirmed';
```

- [ ] **Step 4: Run function/rules tests and staging scenarios for automatic salon, manual salon, freelancer accept/decline, cancellation, and a failed booking.**
- [ ] **Step 5: Commit with message `feat: add client marketplace booking flow`.**

### Task 3: Freelancer workspace, jobs, and deposits

**Files:**
- Create: `src/app/components/pages/FreelancerDashboard.tsx`, `src/app/components/freelancer/ProfileSettings.tsx`, `src/app/components/freelancer/PortfolioManager.tsx`, `src/app/components/freelancer/TravelSettings.tsx`, `src/app/components/jobs/JobBoard.tsx`, `src/app/components/jobs/ApplicationForm.tsx`, `functions/src/jobs.ts`, `functions/src/deposits.ts`, `functions/src/jobs.test.ts`, `rules-tests/freelancer.rules.test.cjs`
- Modify: `src/app/App.tsx`, `functions/src/index.ts`, `firestore.rules`

**Interfaces:** Produces `FreelancerProfile { visible; radiusKm; travelFeeMinor; deposit: { mode: 'none' | 'fixed' | 'percentage'; value: number }; availability }`, `applyToJob({ jobId, portfolioItemIds, message }): Promise<{ applicationId: string }>`, and `createConfirmedDeposit({ bookingId }): Promise<{ checkoutUrl: string }>`.

- [ ] **Step 1: Write failing tests for another person’s portfolio ID and for deposit on a pending booking.**
- [ ] **Step 2: Run tests; expect failure.**
- [ ] **Step 3: Implement profile visibility, radius/travel fee/deposit settings, owned portfolio selection, employee/chair-rental applications, and confirmed-only deposit guard.**

```ts
if (booking.status !== 'confirmed') throw new HttpsError('failed-precondition', 'A deposit is available only after booking confirmation');
if (!countryCapability.onlineDeposits) throw new HttpsError('failed-precondition', 'Online deposits are not available in this country');
```

- [ ] **Step 4: Run function/rules tests, `npm run build`, and staging tests for profile visibility, home visit, both job types, and a test deposit.**
- [ ] **Step 5: Commit with message `feat: add freelancer hiring and deposits`.**

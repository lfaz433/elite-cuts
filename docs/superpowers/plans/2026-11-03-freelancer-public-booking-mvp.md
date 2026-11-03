# Freelancer Public Booking MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build a professional freelancer workspace plus a public bio page where a visitor can book a home or chair appointment without a visible account creation step.

**Architecture:** Firebase project elitecuts-2fb0a remains the only backend. Validated Cloud Functions own profile writes, availability, public projections, bookings and reviews; React reads public data only through strict callable parsers. The freelancer workspace is split into focused routes, while the public route resolves a unique slug and creates bookings through an App-Check-protected callable.

**Tech Stack:** React 18, React Router 7, TypeScript, Vite, Firebase Auth, Firestore, Firebase Functions v1 in europe-west1, Tailwind classes, lucide-react, qrcode.react, Jest, Node test runner, Firebase Emulator Suite.

**Spec:** docs/superpowers/specs/2026-11-03-freelancer-workspace-design.md

## Global Constraints

- Target only Firebase alias launch, which is elitecuts-2fb0a. Do not create or configure another Firebase project.
- All new and changed deployed Function builders use europeFunctions from functions/src/runtime.ts.
- Do not add Stripe, a Checkout action, card collection or a sum labelled as collected revenue.
- Missing fields in existing freelancer documents mean home-only, home availability equal to availability, 30-minute services and guestBooking false.
- A home booking is manual approval; its exact address stays only in bookingRequestPrivate and is released only after freelancer acceptance.
- A chair booking snapshots the commercial workplace and never accepts a client home address.
- Public callable data never includes a freelancer home address, client address, telephone, email, raw profile record or non-approved portfolio content.
- The direct bio link requires visible true. Discovery remains limited to approved profiles, so a direct link does not automatically list a barber in Discover.
- A broad public guest booking release waits for Firebase App Check plus reCAPTCHA. Preview comes before any production deployment.

## File Structure

| Path | Responsibility |
| --- | --- |
| src/app/lib/marketplace/freelancerRecords.ts | Profile contract, backward-compatible parser and defaults. |
| src/app/lib/marketplace/bookingRecords.ts | Booking contract including mode, workplace snapshot and guest marker. |
| src/app/lib/marketplace/freelancerAnalytics.ts | Pure forecast and booking analytics. |
| src/app/lib/marketplace/publicFreelancer.ts | Callable clients for public page, guest booking and reviews. |
| src/app/lib/marketplace/guestBookingSession.ts | Anonymous-session helper without account UI. |
| src/app/components/freelancer/workspace/* | Sidebar, mobile navigation and seven freelancer views. |
| src/app/components/public/* | Public bio page and guest booking form. |
| functions/src/freelancers.ts | Validated profile, services, availability and slug reservation. |
| functions/src/publicProfiles.ts | Safe public projection and lookup by slug. |
| functions/src/bookings.ts | Mode-aware idempotent public booking transaction. |
| functions/src/reviews.ts | Server-only verified review creation and freelancer inbox. |
| firestore.rules | Browser isolation for reviews, slug indexes and bookings. |
| rules-tests/freelancer-public-security.test.cjs | Emulator authorization coverage. |

---

### Task 1: Add backward-compatible freelancer and booking contracts

**Files:**
- Modify: src/app/lib/marketplace/freelancerRecords.ts
- Modify: src/app/lib/marketplace/bookingRecords.ts
- Modify: src/app/lib/marketplace/freelancer.test.mjs
- Modify: src/app/lib/marketplace/bookingRecords.test.ts
- Create: src/app/lib/marketplace/freelancerAnalytics.ts
- Create: src/app/lib/marketplace/freelancerAnalytics.test.ts

**Interfaces:**
- Consumes: current FreelancerProfile and MarketplaceBooking parsers.
- Produces: AppointmentMode, FreelancerWorkModes, FreelancerWorkplace, profile service durations, mode-specific availability, and calculateFreelancerAnalytics.

- [ ] **Step 1: Write the failing parser and analytics tests**

~~~ts
test('reads legacy freelancer data as home-only', () => {
  const profile = parseFreelancerProfile('freelancer-a', legacyProfile);
  assert.deepEqual(profile?.workModes, { home: true, chair: false });
  assert.deepEqual(profile?.availabilityByMode, {
    home: ['2099-09-07T10:00'],
    chair: [],
  });
  assert.equal(profile?.serviceDurationMinutes.cut, 30);
});

test('reads a legacy freelancer booking as a non-guest home appointment', () => {
  const booking = parseMarketplaceBooking('booking-a', null, legacyBooking);
  assert.equal(booking?.appointmentMode, 'home');
  assert.equal(booking?.guestBooking, false);
});

test('forecasts confirmed and completed appointments only', () => {
  expect(calculateFreelancerAnalytics(bookings, '30d', now)).toMatchObject({
    forecastMinor: 7500,
    confirmedCount: 2,
    uniqueClientCount: 2,
  });
});
~~~

- [ ] **Step 2: Run the tests to verify the failure**

Run:

~~~bash
node --experimental-strip-types --test src/app/lib/marketplace/bookingRecords.test.ts src/app/lib/marketplace/freelancerAnalytics.test.ts
node src/app/lib/marketplace/freelancer.test.mjs
~~~

Expected: the new mode, duration and analytics assertions fail.

- [ ] **Step 3: Implement normalized profile and booking fields**

In freelancerRecords.ts export:

~~~ts
export type AppointmentMode = 'home' | 'chair';
export type FreelancerWorkModes = { home: boolean; chair: boolean };
export type FreelancerWorkplace = {
  name: string;
  line1: string;
  postalCode: string;
  city: string;
};
~~~

Add these fields to FreelancerProfile and FreelancerProfileInput:

~~~ts
serviceDurationMinutes: Record<string, number>;
workModes: FreelancerWorkModes;
availabilityByMode: Record<AppointmentMode, string[]>;
workplace?: FreelancerWorkplace;
~~~

The parser defaults absent fields for existing profiles, rejects duplicate home/chair slots, rejects a chair mode without a complete workplace and validates durations from 15 to 360 minutes. Keep availability as the legacy home list.

In bookingRecords.ts normalize appointmentMode to home and guestBooking to false when absent. Reject a persisted chair booking without workplaceSnapshot and a home booking that contains one.

- [ ] **Step 4: Implement pure analytics**

Create freelancerAnalytics.ts:

~~~ts
export type FreelancerAnalyticsPeriod = '7d' | '30d';

export function calculateFreelancerAnalytics(
  bookings: MarketplaceBooking[],
  period: FreelancerAnalyticsPeriod,
  now: Date,
): {
  forecastMinor: number;
  confirmedCount: number;
  uniqueClientCount: number;
  cancelledCount: number;
  byService: Array<{ serviceId: string; forecastMinor: number; count: number }>;
  byMode: Array<{ mode: AppointmentMode; forecastMinor: number; count: number }>;
};
~~~

Include confirmed and completed totalPriceMinor in forecastMinor, count unique clientId values, and label this value only as Prévision de CA.

- [ ] **Step 5: Run tests to verify the passing contract**

Run:

~~~bash
node --experimental-strip-types --test src/app/lib/marketplace/bookingRecords.test.ts src/app/lib/marketplace/freelancerAnalytics.test.ts
node src/app/lib/marketplace/freelancer.test.mjs
~~~

Expected: legacy parsing, invalid mixed-mode data and forecast calculations pass.

- [ ] **Step 6: Commit**

~~~bash
git add src/app/lib/marketplace/freelancerRecords.ts src/app/lib/marketplace/bookingRecords.ts src/app/lib/marketplace/freelancer.test.mjs src/app/lib/marketplace/bookingRecords.test.ts src/app/lib/marketplace/freelancerAnalytics.ts src/app/lib/marketplace/freelancerAnalytics.test.ts
git commit -m "feat: add freelancer booking contracts"
~~~

### Task 2: Persist work modes, safe availability and a unique public slug

**Files:**
- Modify: functions/src/freelancers.ts
- Create: functions/src/freelancers.test.ts
- Modify: functions/src/publicProfiles.ts
- Create: functions/src/publicProfiles.test.ts
- Modify: functions/src/index.ts
- Modify: rules-tests/function-region.test.cjs

**Interfaces:**
- Consumes: Task 1 profile fields.
- Produces: modeBySlot availability metadata and publicProfileSlugs/{slug} server-owned reservations.

- [ ] **Step 1: Write the failing server tests**

~~~ts
test('saves disjoint home and chair slots with mode ownership', async () => {
  await saveFreelancerProfile('freelancer-a', mixedModeInput, firestore);
  expect(state.availability['freelancer-a']).toMatchObject({
    configuredSlots: ['2099-09-05T10:00', '2099-09-05T11:00'],
    modeBySlot: {
      '2099-09-05T10:00': 'home',
      '2099-09-05T11:00': 'chair',
    },
  });
});

test('rejects a slot that appears in both modes', () => {
  expect(() => parseFreelancerProfileInput(overlappingSlotsInput))
    .toThrow('availabilityByMode contains duplicate slots');
});

test('rejects a public slug owned by another freelancer', async () => {
  await saveFreelancerProfile('freelancer-a', profileWithSlug('amine-fade'), firestore);
  await expect(saveFreelancerProfile('freelancer-b', profileWithSlug('amine-fade'), firestore))
    .rejects.toThrow('publicSlug is already used');
});
~~~

- [ ] **Step 2: Run the failing server tests**

Run:

~~~bash
npx jest functions/src/freelancers.test.ts functions/src/publicProfiles.test.ts --runInBand
~~~

Expected: the data validation, slot ownership and slug index behavior are not implemented.

- [ ] **Step 3: Validate and store the enhanced profile input**

In functions/src/freelancers.ts extend FreelancerProfileInput and PROFILE_KEYS with serviceDurationMinutes, workModes, availabilityByMode and workplace. Validate:

1. one duration per service ID;
2. at least one active mode;
3. chair requires full workplace name, line1, postal code and city;
4. home/chair slot arrays contain valid, disjoint slot strings.
5. an empty publicSlug is allowed only while visible is false; visible true requires a normalized 3-to-64-character slug.
6. visible true requires at least one service, at least one enabled mode and at least one configured slot in every enabled mode.

Write availability/{uid} as:

~~~ts
{
  ownerId: callerUid,
  ownerType: 'freelancer',
  configuredSlots,
  availableSlots: configuredSlots.filter(slot => !reserved.has(slot)),
  reservedSlots,
  modeBySlot,
  updatedAt: now,
}
~~~

Preserve the old mode for a reserved slot until its booking reaches a terminal status. A profile edit may remove a future free slot, but it cannot reclassify a reserved appointment.

- [ ] **Step 4: Reserve the slug transactionally**

When input.identity.publicSlug is nonempty, use publicProfileSlugs/{slug}. The mapping contains profileId, freelancerId and updatedAt. If the slug record belongs to another profile, throw already-exists. When a user changes their slug, delete the old mapping only if it points to their profile. Reserve a nonempty slug even if the profile is hidden so a previous URL cannot become another barber's profile. When a hidden draft has an empty slug, do not create an index record.

- [ ] **Step 5: Enrich the safe public projection**

Extend the freelancer projection with only:

~~~ts
publicSlug: string;
bio: string;
profileImageUrl?: string;
socialLinks: Record<string, string>;
services: Array<{ id: string; label: string; priceMinor: number; durationMinutes: number }>;
workModes: { home: boolean; chair: boolean };
workplace?: { name: string; line1: string; postalCode: string; city: string };
cancellationWindowHours: number;
reviewSummary: { average: null; count: 0; reviews: [] };
~~~

For freelancer projections only, write this safe projection when visible is true even when approvalStatus is pending. Change PublicProfileProjection so approvalStatus can be approved or pending. Keep sanitizePublicProfile and listApprovedPublicProfiles restricted to approved. The direct-link resolver added in Task 3 accepts either status after it has verified visibility and every field itself. This keeps a shared link usable for the barber while Discover stays platform-moderated.

Service labels are generated from the saved service ID; do not pass a raw user object through. Keep exact home origin, client data and private visit addresses out of the projection.

Move publicProfiles and freelancer portfolio Firestore triggers from functions.firestore.document to europeFunctions.firestore.document. Move processCompletedBookingReferralFunction in functions/src/bookings.ts to europeFunctions.firestore.document as well. Update function-region.test.cjs so it rejects a direct functions.firestore builder in every deployed module.

- [ ] **Step 6: Run server verification**

Run:

~~~bash
npx jest functions/src/freelancers.test.ts functions/src/publicProfiles.test.ts --runInBand
npm --prefix functions run build
npx jest rules-tests/function-region.test.cjs --runInBand
~~~

Expected: profile persistence, slug ownership, projection sanitation and regional Functions compile.

- [ ] **Step 7: Commit**

~~~bash
git add functions/src/freelancers.ts functions/src/freelancers.test.ts functions/src/publicProfiles.ts functions/src/publicProfiles.test.ts functions/src/index.ts rules-tests/function-region.test.cjs
git commit -m "feat: persist freelancer modes and public slugs"
~~~

### Task 3: Resolve a safe public page from a shared slug

**Files:**
- Modify: functions/src/publicProfiles.ts
- Modify: functions/src/publicProfiles.test.ts
- Modify: functions/src/index.ts
- Create: src/app/lib/marketplace/publicFreelancer.ts
- Create: src/app/lib/marketplace/publicFreelancer.test.ts

**Interfaces:**
- Consumes: Task 2 slug index, public projection and availability metadata.
- Produces: getPublicFreelancerPageBySlug and the PublicFreelancerPage browser type.

- [ ] **Step 1: Write the failing lookup tests**

~~~ts
test('returns a visible direct-link profile with mode-tagged free slots', async () => {
  const page = await getPublicFreelancerPageBySlug('amine-fade', firestore, now);
  expect(page).toMatchObject({
    publicSlug: 'amine-fade',
    services: [{ id: 'cut', label: 'Cut', priceMinor: 2500, durationMinutes: 30 }],
    slots: [{ value: '2099-09-05T10:00', appointmentMode: 'chair' }],
  });
  expect(JSON.stringify(page)).not.toContain('12 rue');
  expect(JSON.stringify(page)).not.toContain('clientEmail');
});

test('does not resolve an unknown or hidden direct-link profile', async () => {
  await expect(getPublicFreelancerPageBySlug('missing', firestore, now))
    .rejects.toThrow('not found');
});
~~~

- [ ] **Step 2: Run the failing lookup tests**

Run:

~~~bash
npx jest functions/src/publicProfiles.test.ts --runInBand
node --experimental-strip-types --test src/app/lib/marketplace/publicFreelancer.test.ts
~~~

Expected: no server slug lookup or typed parser exists.

- [ ] **Step 3: Implement the server callable**

Add this return contract in publicProfiles.ts:

~~~ts
export type PublicFreelancerPage = {
  id: string;
  publicSlug: string;
  displayName: string;
  cityId: CityId;
  bio: string;
  serviceSummary: string;
  profileImageUrl?: string;
  portfolioUrls: string[];
  services: Array<{ id: string; label: string; priceMinor: number; durationMinutes: number }>;
  workModes: { home: boolean; chair: boolean };
  workplace?: { name: string; line1: string; postalCode: string; city: string };
  socialLinks: Record<string, string>;
  cancellationWindowHours: number;
  reviewSummary: { average: number | null; count: number; reviews: PublicFreelancerReview[] };
  slots: Array<{ value: string; appointmentMode: AppointmentMode }>;
};

export type PublicFreelancerReview = {
  rating: number;
  text?: string;
  authorName: string;
  createdAtMs: number;
};
~~~

getPublicFreelancerPageBySlug normalizes the slug, reads its index, reads the referenced projection and availability doc, requires kind freelancer plus visible true, then returns only future free slots where modeBySlot has home or chair. It returns not-found for stale, hidden or malformed records. It does not require platform approval because a direct link is shared intentionally; listPublicProfiles keeps the existing approval rule.

- [ ] **Step 4: Implement the client callable parser**

publicFreelancer.ts must call getPublicFreelancerPageBySlug through httpsCallable and reject unexpected response keys, invalid slots, non-HTTPS portfolio images and every private field. Use a closed parser rather than casting result.data.

- [ ] **Step 5: Run verification**

Run:

~~~bash
npx jest functions/src/publicProfiles.test.ts --runInBand
node --experimental-strip-types --test src/app/lib/marketplace/publicFreelancer.test.ts
~~~

Expected: only whitelisted direct-link data reaches the browser.

- [ ] **Step 6: Commit**

~~~bash
git add functions/src/publicProfiles.ts functions/src/publicProfiles.test.ts functions/src/index.ts src/app/lib/marketplace/publicFreelancer.ts src/app/lib/marketplace/publicFreelancer.test.ts
git commit -m "feat: resolve public freelancer profiles by slug"
~~~

### Task 4: Create App-Check-protected, idempotent guest bookings

**Files:**
- Modify: functions/src/bookings.ts
- Modify: functions/src/bookings.test.ts
- Modify: functions/src/index.ts
- Modify: src/app/lib/marketplace/bookings.ts
- Create: src/app/lib/marketplace/guestBookingSession.ts
- Create: src/app/lib/marketplace/guestBookingSession.test.ts

**Interfaces:**
- Consumes: Task 2 availability modeBySlot and Task 3 public slug resolver.
- Produces: requestPublicFreelancerBooking and ensureGuestBookingSession.

- [ ] **Step 1: Write failing booking tests**

~~~ts
test('creates one pending chair booking without a private address', async () => {
  const result = await createPublicFreelancerBooking('anon-client', chairRequest, firestore);
  expect(state.bookingRequests[result.bookingId]).toMatchObject({
    appointmentMode: 'chair',
    guestBooking: true,
    workplaceSnapshot: { name: 'Studio République', city: 'Paris' },
  });
  expect(state.bookingRequestPrivate[result.bookingId]).toBeUndefined();
});

test('stores a home address privately and exposes no address before approval', async () => {
  const result = await createPublicFreelancerBooking('anon-client', homeRequest, firestore);
  expect(state.bookingRequests[result.bookingId].appointmentMode).toBe('home');
  expect(state.bookingRequestPrivate[result.bookingId].address.line1).toBe('12 rue des Fleurs');
});

test('returns the first result for an identical client request id', async () => {
  const first = await createPublicFreelancerBooking('anon-client', homeRequest, firestore);
  const second = await createPublicFreelancerBooking('anon-client', homeRequest, firestore);
  expect(second).toEqual(first);
  expect(Object.keys(state.bookingRequests)).toHaveLength(1);
});
~~~

- [ ] **Step 2: Run the failing booking tests**

Run:

~~~bash
npx jest functions/src/bookings.test.ts --runInBand
~~~

Expected: public freelancer booking is unavailable.

- [ ] **Step 3: Define and validate a separate public input**

Use a dedicated type, not a relaxed version of MarketplaceBookingInput:

~~~ts
type PublicFreelancerBookingInput = {
  publicSlug: string;
  serviceId: string;
  appointmentMode: 'home' | 'chair';
  date: string;
  time: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  approximateArea?: string;
  homeAddress?: HomeAddress;
  clientRequestId: string;
};
~~~

Validate exact input keys, date/time, UUID-shaped clientRequestId, bounded contact text and required homeAddress only for home. Reject a home address for chair.

- [ ] **Step 4: Implement one transaction for reservation and idempotency**

createPublicFreelancerBooking requires a Firebase UID, resolves publicSlug, requires a visible freelancer projection and requested service, then reads the profile, availability and deterministic bookingRequests document named callerUid + '_' + clientRequestId.

If the document exists, require the same immutable fields and return its saved bookingId/status. Otherwise require availableSlots to include date + T + time and modeBySlot to match appointmentMode. Snapshot price, duration and cancellation window. Add travelFeeMinor only for home. For chair snapshot the professional workplace. Write status pending_approval, reserve the slot and write bookingRequestPrivate only for a home address.

Do not calculate a customer distance or declare a radius match. The barber receives the approximate area and manually accepts or declines a home request.

Update cancel and decline restoration to restore a slot only when it is still configured for the booking appointmentMode. Existing salon flows must remain unchanged.

- [ ] **Step 5: Add the protected callable and client session helper**

Use:

~~~ts
export const publicFreelancerBookingCallableOptions = {
  enforceAppCheck: true,
  consumeAppCheckToken: true,
  maxInstances: 2,
};
~~~

The callable rejects missing context.auth, missing context.app and an already consumed token before calling createPublicFreelancerBooking. Export it through functions/src/index.ts.

guestBookingSession.ts contains:

~~~ts
export async function ensureGuestBookingSession(): Promise<string> {
  if (auth.currentUser?.uid) return auth.currentUser.uid;
  const credential = await signInAnonymously(auth);
  return credential.user.uid;
}
~~~

It is called only when the visitor submits the public booking form. Test existing session reuse, successful anonymous sign-in and sign-in failure propagation.

- [ ] **Step 6: Run verification**

Run:

~~~bash
npx jest functions/src/bookings.test.ts --runInBand
node --experimental-strip-types --test src/app/lib/marketplace/guestBookingSession.test.ts
npm --prefix functions run build
~~~

Expected: both appointment modes, duplicate protection, private home address handling and callable compilation pass.

- [ ] **Step 7: Commit**

~~~bash
git add functions/src/bookings.ts functions/src/bookings.test.ts functions/src/index.ts src/app/lib/marketplace/bookings.ts src/app/lib/marketplace/guestBookingSession.ts src/app/lib/marketplace/guestBookingSession.test.ts
git commit -m "feat: add protected public freelancer booking"
~~~

### Task 5: Add verified, immutable reviews

**Files:**
- Create: functions/src/reviews.ts
- Create: functions/src/reviews.test.ts
- Modify: functions/src/publicProfiles.ts
- Modify: functions/src/publicProfiles.test.ts
- Modify: functions/src/index.ts
- Modify: firestore.rules
- Create: src/app/components/client/BookingReviewForm.tsx
- Modify: src/app/components/client/BookingHistory.tsx
- Modify: src/app/components/pages/ClientDashboard.tsx
- Modify: src/app/lib/marketplace/publicFreelancer.ts

**Interfaces:**
- Consumes: completed freelancer bookings.
- Produces: submitFreelancerReview, listMyFreelancerReviews and safe public review summaries.

- [ ] **Step 1: Write the failing review tests**

~~~ts
test('allows exactly one verified review by the client of a completed booking', async () => {
  await expect(submitFreelancerReview('client-a', {
    bookingId: 'booking-a',
    rating: 5,
    text: 'Très bon dégradé',
  }, firestore)).resolves.toEqual({ reviewId: 'booking-a', status: 'approved' });
});

test('rejects pending, cross-client and duplicate reviews', async () => {
  await expect(submitFreelancerReview('client-a', { bookingId: 'pending', rating: 5 }, firestore))
    .rejects.toThrow('completed');
  await expect(submitFreelancerReview('client-b', { bookingId: 'booking-a', rating: 5 }, firestore))
    .rejects.toThrow('client');
});
~~~

- [ ] **Step 2: Run failing review tests**

Run:

~~~bash
npx jest functions/src/reviews.test.ts functions/src/publicProfiles.test.ts --runInBand
~~~

Expected: no review Function exists.

- [ ] **Step 3: Implement server-only review lifecycle**

Use bookingId as freelancerReviews document ID. In a transaction require ownerType freelancer, clientId equal to callerUid and booking status completed. Write freelancerId, bookingId, rating 1..5, optional text maximum 500, minimized client name such as Ada C., createdAt and status approved. The approved status means the booking relationship is verified. A later platform-only process can hide abusive content, but the freelancer never receives write authority.

Provide listMyFreelancerReviews for the profile owner. It returns every own review and moderation status but no client contact or address. Add a european Firestore trigger that refreshes the associated public profile summary after review writes.

- [ ] **Step 4: Project public reviews safely**

The public projection includes:

~~~ts
reviewSummary: {
  average: number | null;
  count: number;
  reviews: Array<{ rating: number; text?: string; authorName: string; createdAtMs: number }>;
}
~~~

Compute the average from approved records only and return at most five newest approved reviews. A zero count becomes Nouveau sur Barberboard in the UI, never a fabricated rating.

- [ ] **Step 5: Lock browser access and add client UI**

Add this rules scope:

~~~text
match /freelancerReviews/{reviewId} {
  allow read: if request.auth != null && resource.data.freelancerId == request.auth.uid;
  allow create, update, delete: if false;
}
~~~

BookingReviewForm renders only for a completed marketplace booking owned by a freelancer. It uses radio inputs for 1..5 stars and an optional text field, calls submitFreelancerReview, then replaces itself with confirmation. No salon or legacy booking renders the control.

- [ ] **Step 6: Run verification**

Run:

~~~bash
npx jest functions/src/reviews.test.ts functions/src/publicProfiles.test.ts --runInBand
npm --prefix functions run build
~~~

Expected: only eligible clients can create one review and the public summary excludes hidden data.

- [ ] **Step 7: Commit**

~~~bash
git add functions/src/reviews.ts functions/src/reviews.test.ts functions/src/publicProfiles.ts functions/src/publicProfiles.test.ts functions/src/index.ts firestore.rules src/app/components/client/BookingReviewForm.tsx src/app/components/client/BookingHistory.tsx src/app/components/pages/ClientDashboard.tsx src/app/lib/marketplace/publicFreelancer.ts
git commit -m "feat: add verified freelancer reviews"
~~~

### Task 6: Build the seven-view freelancer workspace

**Files:**
- Modify: src/app/components/pages/FreelancerDashboard.tsx
- Modify: src/app/components/freelancer/ProfileSettings.tsx
- Modify: src/app/components/freelancer/ServiceCatalog.tsx
- Modify: src/app/components/freelancer/TravelSettings.tsx
- Create: src/app/components/freelancer/workspace/FreelancerShell.tsx
- Create: src/app/components/freelancer/workspace/FreelancerOverviewView.tsx
- Create: src/app/components/freelancer/workspace/FreelancerCalendarView.tsx
- Create: src/app/components/freelancer/workspace/FreelancerBookingsView.tsx
- Create: src/app/components/freelancer/workspace/FreelancerMarketingView.tsx
- Create: src/app/components/freelancer/workspace/FreelancerAnalyticsView.tsx
- Create: src/app/components/freelancer/workspace/FreelancerSettingsView.tsx
- Create: src/app/components/freelancer/workspace/freelancerWorkspaceRoutes.ts
- Create: src/app/components/pages/FreelancerDashboard.test.mjs

**Interfaces:**
- Consumes: Task 1 analytics, Task 2 profile and availability, Task 5 review inbox.
- Produces: desktop sidebar, mobile navigation, overview, calendar, bookings, services, marketing, analytics and settings views.

- [ ] **Step 1: Write failing dashboard route tests**

~~~ts
test('accepts the approved workspace routes only', () => {
  assert.equal(resolveFreelancerWorkspaceView('/freelancer/calendar'), 'calendar');
  assert.equal(resolveFreelancerWorkspaceView('/freelancer/not-a-view'), 'overview');
});

test('labels the amount as forecast, never collected revenue', () => {
  assert.match(renderForecastCopy(4200), /Prévision de CA/);
  assert.doesNotMatch(renderForecastCopy(4200), /encaissé/i);
});
~~~

- [ ] **Step 2: Run the failing dashboard tests**

Run:

~~~bash
node src/app/components/pages/FreelancerDashboard.test.mjs
~~~

Expected: route resolver and forecast copy helper are missing.

- [ ] **Step 3: Create shell and route resolver**

freelancerWorkspaceRoutes.ts exports seven view names: overview, calendar, bookings, services, marketing, analytics and settings. FreelancerDashboard uses Navigate with replace for /freelancer and every unknown child path so the browser URL becomes /freelancer/overview. FreelancerShell has a fixed desktop sidebar and a mobile bottom bar with Accueil, Calendrier, Réservations and Plus. Plus provides services, marketing, analytics and settings.

- [ ] **Step 4: Split the current single page into focused views**

Keep one data loader in FreelancerDashboard and render exactly one view:

1. Overview: next appointment, pending count, forecast, confirmed count and unique clients.
2. Calendar: chronological slots/bookings and All, Home, Chair filters.
3. Bookings: status and mode filters; home displays approximate area before acceptance, chair displays workplace.
4. Services: existing price catalogue plus duration choices 15, 30, 45, 60, 75, 90 and 120.
5. Marketing: portfolio, social links, reviews, copyable link, open link and QR code.
6. Analytics: 7-day/30-day selector, forecast, counts and service/mode distribution.
7. Settings: work modes, mode-specific slots, travel conditions, cancellation policy and commercial workplace.

ProfileSettings adds publicSlug, HTTPS profile image and Instagram, TikTok, Facebook, Website and WhatsApp inputs using the existing social-link validation. An empty slug is valid for a hidden draft; a publish attempt shows the exact field error until it has a valid unique slug.

Use the approved primary actions: add availability from Overview and Calendar; open the next pending request from Bookings; add a service from Services; copy the link from Marketing; change period from Analytics; and save form edits from Settings. The public URL is window.location.origin + '/b/' + profile.identity.publicSlug. Show it only when the slug exists and visible is true. The freelancer sees review status but no edit or delete action.

- [ ] **Step 5: Run UI verification**

Run:

~~~bash
node src/app/components/pages/FreelancerDashboard.test.mjs
npm run build
~~~

Expected: seven routes resolve, forecast copy is correct and Vite produces a bundle.

- [ ] **Step 6: Commit**

~~~bash
git add src/app/components/pages/FreelancerDashboard.tsx src/app/components/freelancer/ProfileSettings.tsx src/app/components/freelancer/ServiceCatalog.tsx src/app/components/freelancer/TravelSettings.tsx src/app/components/freelancer/workspace src/app/components/pages/FreelancerDashboard.test.mjs
git commit -m "feat: organize freelancer workspace"
~~~

### Task 7: Implement the public bio page and account-free booking flow

**Files:**
- Modify: src/app/App.tsx
- Create: src/app/components/public/FreelancerPublicPage.tsx
- Create: src/app/components/public/GuestFreelancerBookingForm.tsx
- Create: src/app/components/public/FreelancerPublicPage.test.mjs
- Modify: src/app/lib/marketplace/publicFreelancer.ts
- Modify: src/app/lib/firebase.ts
- Modify: src/app/lib/firebaseEnvironment.test.mjs

**Interfaces:**
- Consumes: Task 3 public page data, Task 4 guest booking API and Task 5 review summary.
- Produces: public /b/:publicSlug route and mode-sensitive booking form.

- [ ] **Step 1: Write failing public view tests**

~~~ts
test('renders published profile information and excludes private data', async () => {
  const html = await renderPublicFreelancerPage(publicPageFixture);
  assert.match(html, /Coupe classique/);
  assert.doesNotMatch(html, /12 rue des Fleurs/);
  assert.doesNotMatch(html, /client@example.com/);
});

test('asks for home address only in home mode', () => {
  assert.equal(bookingFieldsFor('chair').includes('homeAddress'), false);
  assert.equal(bookingFieldsFor('home').includes('homeAddress'), true);
});
~~~

- [ ] **Step 2: Run failing public tests**

Run:

~~~bash
node src/app/components/public/FreelancerPublicPage.test.mjs
~~~

Expected: public page and field-selection helper do not exist.

- [ ] **Step 3: Add a non-protected route and public landing layout**

In App.tsx lazy-load FreelancerPublicPage and add /b/:publicSlug inside PublicLayout. Do not wrap it in AuthRequired.

The page loads getPublicFreelancerPageBySlug and renders name, city, summary, approved portfolio, services with prices/durations, enabled modes, social links, cancellation terms and reviews. Use Nouveau sur Barberboard when reviewSummary.count is zero. One primary call to action scrolls to the form. There is no sign-up, favourite, client dashboard or payment UI.

- [ ] **Step 4: Implement the form**

The form selects service, mode and a free mode-matching slot, then collects name, e-mail and phone. It conditionally displays approximate area and exact address only for home. On submit it calls ensureGuestBookingSession, creates crypto.randomUUID(), then calls requestPublicFreelancerBooking. Disable the submit button while pending and show French messages for App Check, unavailable slot, unavailable profile and generic retry errors.

- [ ] **Step 5: Generalize App Check initialization**

Rename referral-specific app-check exports in firebase.ts to generic appCheck and appCheckEnabled, keeping aliases where referral code still imports them. Keep initialization gated by readFirebaseEnvironment. The test must prove a false flag never initializes App Check and a valid launch-project site key plus true flag does.

- [ ] **Step 6: Run public verification**

Run:

~~~bash
node src/app/components/public/FreelancerPublicPage.test.mjs
node --experimental-strip-types --test src/app/lib/firebaseEnvironment.test.mjs
npm run build
~~~

Expected: the public page is safe, address fields are mode-specific and the frontend builds.

- [ ] **Step 7: Commit**

~~~bash
git add src/app/App.tsx src/app/components/public src/app/lib/marketplace/publicFreelancer.ts src/app/lib/firebase.ts src/app/lib/firebaseEnvironment.test.mjs
git commit -m "feat: add public freelancer booking page"
~~~

### Task 8: Enforce Firestore isolation and document the preview release gate

**Files:**
- Modify: firestore.rules
- Create: rules-tests/freelancer-public-security.test.cjs
- Modify: rules-tests/jest.config.cjs
- Modify: docs/launch/mvp-preview-acceptance.md
- Modify: .env.example
- Modify: README.md

**Interfaces:**
- Consumes: new review, slug and booking collections.
- Produces: Emulator authorization evidence and a manual preview checklist.

- [ ] **Step 1: Write failing Emulator tests**

~~~js
test('only the freelancer reads their review inbox', async () => {
  await assertSucceeds(getDoc(authedDb('freelancer-a'), 'freelancerReviews/review-a'));
  await assertFails(getDoc(authedDb('freelancer-b'), 'freelancerReviews/review-a'));
});

test('browsers cannot write server-owned data', async () => {
  await assertFails(setDoc(authedDb('anon-a'), 'freelancerReviews/review-a', review));
  await assertFails(setDoc(authedDb('anon-a'), 'publicProfiles/freelancer__a', profile));
  await assertFails(setDoc(authedDb('anon-a'), 'publicProfileSlugs/amine-fade', slug));
  await assertFails(setDoc(authedDb('anon-a'), 'bookingRequestPrivate/booking-a', address));
});
~~~

- [ ] **Step 2: Run the failing rule tests**

Run:

~~~bash
npm run test:rules
~~~

Expected: review and slug access rules have not yet met the assertions.

- [ ] **Step 3: Add deny-by-default rules**

Add:

~~~text
match /publicProfileSlugs/{slug} {
  allow read, write: if false;
}

match /freelancerReviews/{reviewId} {
  allow read: if request.auth != null && resource.data.freelancerId == request.auth.uid;
  allow create, update, delete: if false;
}
~~~

Do not make publicProfiles browser-readable and do not grant browser booking writes.

- [ ] **Step 4: Add release documentation**

The acceptance document must require: Anonymous Authentication enabled; App Check reCAPTCHA v3 configured for exact Preview hostname; VITE_FIREBASE_APPCHECK_ENABLED true and VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY set only in Preview; App Check token rejection verified; a manual test for direct link, both modes, duplicate submit, address privacy, reviews, QR code, desktop sidebar and mobile bottom navigation.

.env.example receives:

~~~text
VITE_FIREBASE_APPCHECK_ENABLED=false
VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY=
~~~

README.md states that the reCAPTCHA site key is public configuration but service keys and secrets never belong in Vite variables.

- [ ] **Step 5: Run security and build verification**

Run:

~~~bash
npm run test:rules
node --experimental-strip-types --test src/app/lib/firebaseEnvironment.test.mjs
npx jest rules-tests/function-region.test.cjs --runInBand
npm --prefix functions run build
npm run build
~~~

Expected: rules deny all browser writes, Functions are regional and both builds compile.

- [ ] **Step 6: Commit**

~~~bash
git add firestore.rules rules-tests/freelancer-public-security.test.cjs rules-tests/jest.config.cjs docs/launch/mvp-preview-acceptance.md .env.example README.md
git commit -m "docs: add public booking launch gates"
~~~

### Task 9: Deploy to Preview and perform human acceptance

**Files:**
- Modify: docs/launch/mvp-preview-acceptance.md

**Interfaces:**
- Consumes: Tasks 1 through 8.
- Produces: Preview evidence only; production remains unchanged.

- [ ] **Step 1: Build and deploy the Preview candidate**

Run:

~~~bash
npm run test:launch
firebase deploy --only firestore:rules,firestore:indexes,functions --project launch --non-interactive
vercel --yes
~~~

Expected: Firebase identifies launch as elitecuts-2fb0a, functions report europe-west1 and Vercel returns a Preview URL. Stop if a command names a different project or region.

- [ ] **Step 2: Configure release prerequisites in Firebase and Vercel**

Enable Anonymous in Firebase Authentication. Register reCAPTCHA v3 App Check for the exact Preview hostname. In Vercel Preview, set VITE_FIREBASE_APPCHECK_ENABLED true and VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY to that public site key, then redeploy Preview. Never put a reCAPTCHA secret into source control or Vercel client environment.

- [ ] **Step 3: Test the MVP as freelancer, visitor and client**

Freelancer: configure services, duration, home/chair modes, workplace, slots, link, QR, sidebar, analytics and portfolio.

Visitor in a private window: open /b/:slug, select a service and each mode, confirm no account creation page appears, create one chair request and one home request.

Client: after a freelancer accepts and completes a booking, submit exactly one review.

Verify chair has workplace without client address; home reveals exact address only after acceptance; a repeat submit creates one booking; review is visible as verified but not editable by freelancer; zero reviews show Nouveau sur Barberboard; forecast never claims collected money.

- [ ] **Step 4: Record evidence and ask for a separate production approval**

Record Preview URL, Vercel SHA, tester, date, App Check status and each scenario result in docs/launch/mvp-preview-acceptance.md.

~~~bash
git add docs/launch/mvp-preview-acceptance.md
git commit -m "docs: record freelancer MVP preview acceptance"
~~~

Production deploy requires a new explicit founder approval after this checklist is complete.

# Task 2 report — client marketplace booking flow

## Delivered

- Added a separate, server-controlled `bookingRequests` lifecycle so the reviewed legacy `bookings` collection and its tenant-scoped authorization remain unchanged.
- Added callable booking request, professional response, and client cancellation commands. Requests validate a visible approved profile, selected service, owner record, and available slot inside a Firestore transaction; the selected slot is consumed atomically.
- Automatic salons produce `confirmed`; manual salons and freelancers produce `pending_approval`. Salon staff authorization is revalidated inside the response transaction, and freelancers may accept or decline their own pending request.
- Exact home addresses are stored only in `bookingRequestPrivate`, which denies all browser reads and writes. An accepting freelancer receives the address in the callable response; it never appears in the public booking document.
- Added scoped client listeners, status/history cards, cancellation control, favourites, and an authenticated booking form that retains its entered values and shows errors if submission fails.

## Tests and verification

- TDD red: `cd functions && npx jest src/bookings.test.ts --runInBand` failed before the marketplace module existed.
- Green: `cd functions && npx jest src/bookings.test.ts --runInBand` — 7 passing tests covering transitions, redaction, automatic availability reservation, and acceptance-only address release.
- `cd functions && npm run build` — passed.
- `npm run build` — passed.
- Existing non-emulator booking checks: `npx jest rules-tests/booking-create.test.cjs rules-tests/booking-status.test.cjs rules-tests/booking-transition-state.test.cjs --runInBand` — 44 passing tests.
- `git diff --check` — passed.

## Verification limitations

- Firestore rules tests could not start because the local Firestore emulator requires Java and this host has no Java Runtime (`java -version` exits 1). No staging or production write, deployment, payment configuration, or external account action was attempted.
- `cd functions && npm run lint` cannot run because this repository has no ESLint configuration file.

## Review fix round 1

- Moved every decline/cancellation availability read ahead of the first transaction write; regression tests enforce Firestore's no-read-after-write transaction contract for both transitions.
- Dashboard listeners now render loading and error states rather than treating listener failure as an empty booking/favourite list.
- Freelancer requests are rejected unless the approved public profile explicitly declares `homeVisit: true`; the form neither renders nor collects address fields for a freelancer without that capability.
- Added the authenticated `getBookingAddress` callable and client type helper. It returns an exact address only for the booking client or assigned freelancer once the booking is confirmed; it rejects pending, declined/cancelled, and unauthorized access. Browser rules continue to deny all direct address reads.

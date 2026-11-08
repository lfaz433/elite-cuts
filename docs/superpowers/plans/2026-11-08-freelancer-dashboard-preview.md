# Freelancer Dashboard Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current configuration-oriented freelancer preview with a responsive, database-free interactive dashboard that demonstrates the independent barber workflow.

**Architecture:** Keep the preview isolated from Firebase by placing all seeded records and mutations in a pure local model. A dedicated preview shell owns selected view and local state, while focused view components render today, planning, bookings, business growth and account experiences through props. The production `/freelancer/*` workspace and its network-backed behavior remain unchanged.

**Tech Stack:** React 18, TypeScript, React Router 7, Tailwind utility classes, lucide-react, qrcode.react, sonner, Node `node:test`, Vite.

**Spec:** `docs/superpowers/specs/2026-11-08-freelancer-dashboard-preview-design.md`

## Global Constraints

- `/freelancer-preview` must load with no Firebase, Auth, Tenant, Firestore or Cloud Functions import in its dependency path.
- Preview state is in memory only; reload resets the demonstration and no action may write to a network service.
- Never describe forecast metrics as collected revenue and never introduce payment collection.
- Preserve all production `/freelancer/*` routes and components; this work changes the preview only.
- Keep personal client address data out of preview records and views.
- Use French user-facing copy and the existing dark/gold visual language.
- Ensure desktop sidebar, mobile bottom navigation, keyboard labels and safe-area spacing are retained.
- Do not stage, alter or delete `firestore-debug.log` or `firebase-debug.log`.
- Do not commit, push, deploy, change Firebase, Vercel, or email settings without a separate explicit user request.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/app/components/freelancer/preview/freelancerPreviewModel.ts` | Preview-only types, seeded records and pure state transitions. |
| `src/app/components/freelancer/preview/freelancerPreviewModel.test.mjs` | Tests the seed state and all non-visual local mutations. |
| `src/app/components/freelancer/preview/FreelancerPreviewShell.tsx` | Responsive sidebar, mobile navigation, header and notification center. |
| `src/app/components/freelancer/preview/FreelancerPreviewTodayView.tsx` | Today-first operational summary and quick actions. |
| `src/app/components/freelancer/preview/FreelancerPreviewPlanningView.tsx` | Day/time/mode availability picker and weekly states. |
| `src/app/components/freelancer/preview/FreelancerPreviewBookingsView.tsx` | Pending/confirmed bookings, status filters and response actions. |
| `src/app/components/freelancer/preview/FreelancerPreviewBusinessViews.tsx` | Services, showcase, analytics and settings preview tabs. |
| `src/app/components/pages/FreelancerPreviewPage.tsx` | Preview composition and local state orchestration. |
| `src/app/components/pages/FreelancerPreviewPage.test.mjs` | Preview route isolation and UI-contract regression tests. |

## Interfaces

```ts
export const PREVIEW_VIEWS = [
  'today', 'planning', 'bookings', 'services', 'showcase', 'analytics', 'settings',
] as const;
export type PreviewView = typeof PREVIEW_VIEWS[number];
export type PreviewMode = 'home' | 'chair';
export type PreviewSlotKind = 'available' | 'booked' | 'pending' | 'blocked';
export type PreviewBookingStatus = 'pending' | 'confirmed' | 'declined' | 'completed' | 'cancelled';

export type PreviewSlot = {
  id: string; day: string; start: string; end: string; mode: PreviewMode; kind: PreviewSlotKind;
};
export type PreviewBooking = {
  id: string; clientName: string; serviceName: string; day: string; start: string; end: string;
  mode: PreviewMode; status: PreviewBookingStatus; totalMinor: number;
};
export type PreviewNotification = {
  id: string; title: string; message: string; view: PreviewView; read: boolean;
};
export type PreviewState = {
  activeView: PreviewView; slots: PreviewSlot[]; bookings: PreviewBooking[];
  notifications: PreviewNotification[]; services: PreviewService[];
};

export function createPreviewState(): PreviewState;
export function addPreviewAvailability(state: PreviewState, input: Pick<PreviewSlot, 'day' | 'start' | 'end' | 'mode'>): PreviewMutation;
export function blockPreviewSlot(state: PreviewState, input: Pick<PreviewSlot, 'day' | 'start' | 'end'>): PreviewMutation;
export function respondToPreviewBooking(state: PreviewState, id: string, decision: 'accept' | 'decline' | 'complete'): PreviewState;
export function markPreviewNotificationRead(state: PreviewState, id: string): PreviewState;
export function markAllPreviewNotificationsRead(state: PreviewState): PreviewState;
```

`PreviewMutation` is `{ state: PreviewState; error?: string }`. Any error preserves `state` unchanged.

### Task 1: Build the local preview model

**Files:**
- Create: `src/app/components/freelancer/preview/freelancerPreviewModel.ts`
- Create: `src/app/components/freelancer/preview/freelancerPreviewModel.test.mjs`

**Consumes:** No React, Firebase or production data layer.

**Produces:** The types and pure mutation functions in the Interfaces section.

- [ ] **Step 1: Write failing tests for the seed and availability mutation**

```js
test('adds a selected home availability without changing existing bookings', () => {
  const state = createPreviewState();
  const result = addPreviewAvailability(state, {
    day: '2026-11-11', start: '09:00', end: '10:00', mode: 'home',
  });
  assert.equal(result.error, undefined);
  assert.equal(result.state.slots.at(-1).kind, 'available');
  assert.equal(result.state.slots.at(-1).mode, 'home');
  assert.deepEqual(result.state.bookings, state.bookings);
});

test('rejects an overlapping availability and preserves the original state', () => {
  const state = createPreviewState();
  const result = addPreviewAvailability(state, {
    day: state.slots[0].day, start: state.slots[0].start, end: state.slots[0].end, mode: 'chair',
  });
  assert.match(result.error, /chevauche/i);
  assert.equal(result.state, state);
});
```

- [ ] **Step 2: Run the model test to verify it fails**

Run: `node --experimental-strip-types --test src/app/components/freelancer/preview/freelancerPreviewModel.test.mjs`

Expected: FAIL because `freelancerPreviewModel.ts` and its exports do not yet exist.

- [ ] **Step 3: Create the model with fixed French demonstration data**

```ts
const overlaps = (left: Pick<PreviewSlot, 'day' | 'start' | 'end'>, right: Pick<PreviewSlot, 'day' | 'start' | 'end'>) =>
  left.day === right.day && left.start < right.end && right.start < left.end;

export function addPreviewAvailability(state: PreviewState, input: Pick<PreviewSlot, 'day' | 'start' | 'end' | 'mode'>): PreviewMutation {
  if (input.start >= input.end) return { state, error: 'Choisissez une heure de fin après l’heure de début.' };
  if (state.slots.some(slot => overlaps(slot, input))) return { state, error: 'Ce créneau chevauche déjà une disponibilité ou un rendez-vous.' };
  return { state: { ...state, slots: [...state.slots, { id: `slot-${state.slots.length + 1}`, ...input, kind: 'available' }] } };
}
```

Seed one pending request, one confirmed booking, one blocked period, at least two available slots, three services and four notifications. Do not include a private street address, client phone number or client email.

- [ ] **Step 4: Add failing tests for booking and notification transitions**

```js
test('accepting a pending booking confirms it and marks its notification read', () => {
  const state = createPreviewState();
  const pending = state.bookings.find(booking => booking.status === 'pending');
  const next = respondToPreviewBooking(state, pending.id, 'accept');
  assert.equal(next.bookings.find(booking => booking.id === pending.id).status, 'confirmed');
  assert.ok(next.notifications.some(notification => notification.view === 'bookings' && notification.read));
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/app/components/freelancer/preview/freelancerPreviewModel.test.mjs`

Expected: FAIL because the booking/notification state transition is missing.

- [ ] **Step 6: Implement minimal immutable booking and notification transitions**

```ts
const nextStatus = { accept: 'confirmed', decline: 'declined', complete: 'completed' } as const;
export function respondToPreviewBooking(state: PreviewState, id: string, decision: keyof typeof nextStatus): PreviewState {
  return {
    ...state,
    bookings: state.bookings.map(booking => booking.id === id ? { ...booking, status: nextStatus[decision] } : booking),
    notifications: state.notifications.map(notification => notification.view === 'bookings' ? { ...notification, read: true } : notification),
  };
}
```

Implement individual and bulk notification-read functions with immutable arrays.

- [ ] **Step 7: Run the full model test to verify it passes**

Run: `node --experimental-strip-types --test src/app/components/freelancer/preview/freelancerPreviewModel.test.mjs`

Expected: PASS with zero failures.

- [ ] **Step 8: Inspect only task files**

Run: `git diff -- src/app/components/freelancer/preview/freelancerPreviewModel.ts src/app/components/freelancer/preview/freelancerPreviewModel.test.mjs`

Expected: pure local state only; no imports from Firebase, Auth, Tenant or production booking APIs.

### Task 2: Add the responsive preview shell and notification center

**Files:**
- Create: `src/app/components/freelancer/preview/FreelancerPreviewShell.tsx`
- Modify: `src/app/components/pages/FreelancerPreviewPage.test.mjs`

**Consumes:** `PreviewView`, `PreviewNotification`, and notification mutation callbacks from Task 1.

**Produces:** `FreelancerPreviewShell` with `activeView`, `onNavigate`, `notifications`, `onReadNotification` and `onReadAll` props.

- [ ] **Step 1: Write a failing shell contract test**

```js
test('the preview has grouped desktop navigation and keeps today, planning and bookings in mobile navigation', async () => {
  const shell = await readFile(new URL('../freelancer/preview/FreelancerPreviewShell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /Gérer mon activité/);
  assert.match(shell, /Développer mon activité/);
  assert.match(shell, /Compte/);
  assert.match(shell, /Aujourd’hui/);
  assert.match(shell, /Planning/);
  assert.match(shell, /Réservations/);
  assert.match(shell, /aria-label="Notifications"/);
});
```

- [ ] **Step 2: Run the route/preview test to verify it fails**

Run: `node --experimental-strip-types --test src/app/components/pages/FreelancerPreviewPage.test.mjs`

Expected: FAIL because the shell file and its navigation contract do not exist.

- [ ] **Step 3: Implement the shell**

Use `Bell`, `CalendarDays`, `ClipboardList`, `Scissors`, `Megaphone`, `BarChart3`, `Settings`, `MoreHorizontal` and `X` from `lucide-react`. Render:

```tsx
<button type="button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(value => !value)}>
  <Bell aria-hidden="true" />
  {unreadCount > 0 && <span aria-label={`${unreadCount} notification${unreadCount > 1 ? 's' : ''} non lue${unreadCount > 1 ? 's' : ''}`}>{unreadCount}</span>}
</button>
```

Desktop uses the three agreed groups. Mobile uses Today, Planning, Bookings and a `Plus` button. Its sheet contains Services & tarifs, Ma vitrine, Statistiques and Paramètres, closes after navigation and responds to Escape. Reserve bottom padding with `pb-[env(safe-area-inset-bottom)]`.

- [ ] **Step 4: Run the shell contract test to verify it passes**

Run: `node --experimental-strip-types --test src/app/components/pages/FreelancerPreviewPage.test.mjs`

Expected: PASS with the existing database-free route tests.

- [ ] **Step 5: Manually inspect at desktop and narrow widths**

Run: `npm run dev -- --host 127.0.0.1 --port 4174`

Open: `http://127.0.0.1:4174/freelancer-preview?dashboard=1`

Expected: desktop sidebar remains visible at `1280px`; at `390px` bottom navigation is visible, content clears it, and Plus exposes four additional tabs.

### Task 3: Implement Today and booking actions

**Files:**
- Create: `src/app/components/freelancer/preview/FreelancerPreviewTodayView.tsx`
- Create: `src/app/components/freelancer/preview/FreelancerPreviewBookingsView.tsx`
- Modify: `src/app/components/pages/FreelancerPreviewPage.test.mjs`

**Consumes:** `PreviewState` and `respondToPreviewBooking` from Task 1; `onNavigate` from Task 2.

**Produces:** Today-first dashboard content and a filtered booking list with local actions.

- [ ] **Step 1: Write failing component-contract tests**

```js
test('today view leads with today and offers availability, block and booking actions', async () => {
  const source = await readFile(new URL('../freelancer/preview/FreelancerPreviewTodayView.tsx', import.meta.url), 'utf8');
  assert.match(source, /Aujourd’hui/);
  assert.match(source, /Ajouter une disponibilité/);
  assert.match(source, /Bloquer un créneau/);
  assert.match(source, /Voir mon lien de réservation/);
});

test('preview bookings labels accept, decline and completion actions', async () => {
  const source = await readFile(new URL('../freelancer/preview/FreelancerPreviewBookingsView.tsx', import.meta.url), 'utf8');
  assert.match(source, /Accepter/);
  assert.match(source, /Refuser/);
  assert.match(source, /Marquer comme terminé/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/app/components/pages/FreelancerPreviewPage.test.mjs`

Expected: FAIL because the two view files do not exist.

- [ ] **Step 3: Implement the Today view**

Render the upcoming booking first, then pending requests, today availability and three secondary metrics. A zero-data branch must use useful French copy such as `Aucun rendez-vous aujourd’hui` and navigate to Planning; it must never return an empty container. Quick actions call `onNavigate('planning')`, `onBlockSlot()` and `onNavigate('showcase')`.

- [ ] **Step 4: Implement bookings with filters and actions**

```tsx
{booking.status === 'pending' && <>
  <button type="button" onClick={() => onRespond(booking.id, 'accept')}>Accepter</button>
  <button type="button" onClick={() => onRespond(booking.id, 'decline')}>Refuser</button>
</>}
{booking.status === 'confirmed' && <button type="button" onClick={() => onRespond(booking.id, 'complete')}>Marquer comme terminé</button>}
```

Include select filters for `Tous / À domicile / En salon` and pending/confirmed/completed status. Do not render private client contact details.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --experimental-strip-types --test src/app/components/freelancer/preview/freelancerPreviewModel.test.mjs src/app/components/pages/FreelancerPreviewPage.test.mjs`

Expected: PASS with zero failures.

### Task 4: Implement the visual availability planner

**Files:**
- Create: `src/app/components/freelancer/preview/FreelancerPreviewPlanningView.tsx`
- Modify: `src/app/components/pages/FreelancerPreviewPage.test.mjs`
- Modify: `src/app/components/freelancer/preview/freelancerPreviewModel.test.mjs`

**Consumes:** `PreviewSlot`, `PreviewMode`, `addPreviewAvailability`, `blockPreviewSlot` and the state from Task 1.

**Produces:** A visual weekly planner with a day selection, start/end times, appointment mode and blocking flow.

- [ ] **Step 1: Write the failing planner contract and edge-case test**

```js
test('planner exposes day, start, end and appointment mode instead of raw ISO entry', async () => {
  const source = await readFile(new URL('../freelancer/preview/FreelancerPreviewPlanningView.tsx', import.meta.url), 'utf8');
  assert.match(source, /Jour/);
  assert.match(source, /Heure de début/);
  assert.match(source, /Heure de fin/);
  assert.match(source, /À domicile/);
  assert.match(source, /En salon/);
  assert.doesNotMatch(source, /AAAA-MM-JJTHH:MM/);
});
```

Add a model test that a `start >= end` availability returns the exact French error and keeps the original state reference.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --experimental-strip-types --test src/app/components/freelancer/preview/freelancerPreviewModel.test.mjs src/app/components/pages/FreelancerPreviewPage.test.mjs`

Expected: FAIL because the planner file and invalid-range branch are missing.

- [ ] **Step 3: Implement the planner**

Use a `select` for one of seven visible demo week dates, `<input type="time">` for start and end, a labelled `home/chair` radio or select, and explicit buttons:

```tsx
<button type="button" onClick={submitAvailability}>Ajouter cette disponibilité</button>
<button type="button" onClick={submitBlock}>Bloquer ce créneau</button>
```

Render each week slot with status text (`Disponible`, `Réservé`, `En attente`, `Bloqué`) in addition to color. Show `role="alert"` for invalid ranges and overlap. A remove button appears only for locally added available or blocked slots.

- [ ] **Step 4: Run the planner tests to verify they pass**

Run: `node --experimental-strip-types --test src/app/components/freelancer/preview/freelancerPreviewModel.test.mjs src/app/components/pages/FreelancerPreviewPage.test.mjs`

Expected: PASS with no failures.

- [ ] **Step 5: Manual mobile interaction check**

At `390px`, choose a day, `09:00` to `10:00`, `À domicile`, then add it. Attempt the same window again.

Expected: first action adds a visible `Disponible` slot; second action keeps the first slot and displays a clear overlap error above the bottom navigation.

### Task 5: Implement business, showcase, analytics and settings tabs

**Files:**
- Create: `src/app/components/freelancer/preview/FreelancerPreviewBusinessViews.tsx`
- Modify: `src/app/components/pages/FreelancerPreviewPage.test.mjs`

**Consumes:** Preview services and state from Task 1, plus `QRCodeSVG` and local callbacks.

**Produces:** Four preview tab components exported from one focused module: `PreviewServicesView`, `PreviewShowcaseView`, `PreviewAnalyticsView`, `PreviewSettingsView`.

- [ ] **Step 1: Write failing contracts for business tabs**

```js
test('business preview keeps public visibility, forecast copy and immutable reviews clear', async () => {
  const source = await readFile(new URL('../freelancer/preview/FreelancerPreviewBusinessViews.tsx', import.meta.url), 'utf8');
  assert.match(source, /Services & tarifs/);
  assert.match(source, /Ma vitrine/);
  assert.match(source, /Prévision de CA/);
  assert.match(source, /Avis clients/);
  assert.doesNotMatch(source, /encaissé/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/app/components/pages/FreelancerPreviewPage.test.mjs`

Expected: FAIL because the business views module does not exist.

- [ ] **Step 3: Implement Services & tarifs and Ma vitrine**

Services offers local add, edit and remove controls with a price and duration. Vitrine shows a clearly labelled example booking URL, a `QRCodeSVG`, portfolio cards, social links and visible read-only reviews. The copy action must report success through a status message or toast and must gracefully handle unavailable clipboard access.

- [ ] **Step 4: Implement Statistiques and Paramètres**

Statistics show bookings, requested services and `Prévision de CA`, derived from demo bookings only. Settings show identity, enabled appointment modes, cancellation policy and notification preference labels. Do not expose a browser-permission request or a real email setting.

- [ ] **Step 5: Run the business contract test to verify it passes**

Run: `node --experimental-strip-types --test src/app/components/pages/FreelancerPreviewPage.test.mjs`

Expected: PASS with zero failures.

### Task 6: Compose the isolated dashboard preview and verify it end-to-end

**Files:**
- Modify: `src/app/components/pages/FreelancerPreviewPage.tsx`
- Modify: `src/app/components/pages/FreelancerPreviewPage.test.mjs`
- Modify: `src/app/components/freelancer/preview/FreelancerPreviewModel.test.mjs` only if an integration edge case requires it.

**Consumes:** Every component and pure model from Tasks 1–5.

**Produces:** `/freelancer-preview` as the isolated interactive dashboard, preserving `PreviewApp.tsx` routing.

- [ ] **Step 1: Write a failing composition/isolation test**

```js
test('preview composes the local dashboard without Firebase or production workspace imports', async () => {
  const page = await readFile(new URL('./FreelancerPreviewPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /FreelancerPreviewShell/);
  assert.match(page, /createPreviewState/);
  assert.doesNotMatch(page, /ServiceCatalog|TravelSettings|firebase|AuthContext|TenantContext|marketplace\/bookings/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/app/components/pages/FreelancerPreviewPage.test.mjs`

Expected: FAIL because the current page imports `ServiceCatalog` and `TravelSettings`.

- [ ] **Step 3: Replace the existing preview composition**

Keep the top-level reset/preview disclosure, initialize once with `useState(createPreviewState)`, and dispatch by active view:

```tsx
const [state, setState] = useState(createPreviewState);
const navigate = (activeView: PreviewView) => setState(current => ({ ...current, activeView }));

return <FreelancerPreviewShell activeView={state.activeView} onNavigate={navigate} notifications={state.notifications} ...>
  {state.activeView === 'today' && <FreelancerPreviewTodayView ... />}
  {state.activeView === 'planning' && <FreelancerPreviewPlanningView ... />}
  {/* bookings, services, showcase, analytics and settings use the same state */}
</FreelancerPreviewShell>;
```

Do not import `FreelancerShell`, `ServiceCatalog`, `TravelSettings`, `AuthContext`, Firebase or any production mutation helper.

- [ ] **Step 4: Run all preview-focused tests to verify they pass**

Run: `node --experimental-strip-types --test src/app/components/freelancer/preview/freelancerPreviewModel.test.mjs src/app/components/pages/FreelancerPreviewPage.test.mjs src/app/components/pages/FreelancerDashboard.test.mjs`

Expected: PASS with zero failures.

- [ ] **Step 5: Build production assets**

Run: `npm run build`

Expected: exit code `0` and a generated `FreelancerPreviewPage-*.js` asset.

- [ ] **Step 6: Browser smoke test without Firebase configuration**

Run: `npm run dev -- --host 127.0.0.1 --port 4174`

Open: `http://127.0.0.1:4174/freelancer-preview?dashboard=1`

Expected: rendered content contains `Aujourd’hui`, `Planning`, `Réservations`, `Services & tarifs`, `Ma vitrine`, `Statistiques`, `Paramètres`, and no runtime error. Repeat at a narrow mobile viewport and exercise notification reading, booking response, availability add and overlap rejection.

- [ ] **Step 7: Review the final changes without staging unrelated files**

Run: `git diff --check && git status --short && git diff -- src/app/components/pages/FreelancerPreviewPage.tsx src/app/components/freelancer/preview src/app/components/pages/FreelancerPreviewPage.test.mjs`

Expected: no whitespace errors; only feature files and pre-existing unrelated log changes are listed. Do not stage, commit, push or deploy.

## Plan Self-Review

| Specification requirement | Plan coverage |
| --- | --- |
| Database-free local preview | Tasks 1 and 6 |
| Desktop/mobile organized tabs | Task 2 |
| Today-first dashboard | Task 3 |
| Visual availability by day/time/mode | Task 4 |
| Booking responses and local notifications | Tasks 1 and 3 |
| Services, showcase, QR, portfolio, visible reviews, forecast | Task 5 |
| Accessibility and responsive checks | Tasks 2, 4 and 6 |
| No Firebase/email/push/payment/production changes | Global constraints and Task 6 |

Placeholder scan completed: this plan has no unresolved implementation markers or deferred instructions. All model types and functions referenced by later tasks are defined in the Interfaces section and produced by Task 1.

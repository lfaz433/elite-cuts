# Brand and Freelancer Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let brands, salon locations, and freelancers safely customize their public identity with logos, colors, social links, public links, and QR codes.

**Architecture:** Store master identity on the brand, and a small opt-in override on each salon location. Store freelancer identity on the existing freelancer profile. All changes go through authenticated Cloud Functions; public routes use the existing sanitized `publicProfiles` projection and a server-reserved slug index.

**Tech Stack:** React 18, TypeScript, Firebase Auth, Firestore, Firebase Cloud Functions v1, Firebase Storage, `qrcode.react`, Jest, Firestore Emulator.

**Spec:** `docs/superpowers/specs/2026-09-09-brand-and-freelancer-customization-design.md`

## Global Constraints

- Images are uploaded to Firebase Storage and Firestore stores only HTTPS URLs and metadata.
- Browser writes to brands, locations, freelancer profiles, public profiles, and slug records remain denied.
- `brandingMode` defaults to `inherit_brand`; a custom location requires `manageLocationBranding`.
- Only the Principal Admin changes master brand identity.
- Freelancer public identity is owned by its authenticated account and still requires existing profile moderation before publishing.
- QR codes contain only the public HTTPS profile URL; never an address, user id, booking, payment, or private data.
- Social links are restricted to Instagram, TikTok, Facebook, website, and WhatsApp. Online payment remains out of scope.

---

### Task 1: Shared identity contracts and validators

**Files:**
- Create: `src/app/lib/marketplace/identity.ts`
- Create: `src/app/lib/marketplace/identity.test.mjs`
- Modify: `src/app/lib/marketplace/types.ts`
- Modify: `src/app/lib/marketplace/freelancerRecords.ts`
- Modify: `functions/src/freelancers.ts`

**Interfaces:**
- Produces `SocialLinks`, `Branding`, `LocationBranding`, `FreelancerIdentity`, `normalizePublicSlug`, and `sanitizeSocialLinks`.
- Consumes `FreelancerProfileInput` and `PermissionKey`.
- Adds `manageLocationBranding` to `PermissionKey` and its default permission records.

- [ ] **Step 1: Write the failing validator tests**

```js
test('normalizes an available public slug', () => {
  assert.equal(normalizePublicSlug(' Amine Fade Studio '), 'amine-fade-studio');
});

test('rejects unsafe social links', () => {
  assert.throws(() => sanitizeSocialLinks({ website: 'javascript:alert(1)' }));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/app/lib/marketplace/identity.test.mjs`  
Expected: FAIL because the identity module does not exist.

- [ ] **Step 3: Implement the smallest shared contract**

```ts
export type SocialLinks = Partial<Record<'instagram' | 'tiktok' | 'facebook' | 'website' | 'whatsapp', string>>;
export function normalizePublicSlug(value: string): string {
  const slug = value.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) throw new Error('publicSlug is invalid');
  return slug;
}
export function sanitizeSocialLinks(value: unknown): SocialLinks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('socialLinks is invalid');
  // Accept only present, validated values from the five supported keys; reject all other keys.
  return validatedSocialLinks(value as Record<string, unknown>);
}
```

Extend `FreelancerProfileInput` with `identity: { profileImageUrl?: string; socialLinks: SocialLinks; publicSlug: string }`. Keep the profile parser strict so old records return safe default identity values.

- [ ] **Step 4: Run validator and existing freelancer tests**

Run: `node --test src/app/lib/marketplace/identity.test.mjs src/app/lib/marketplace/freelancer.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/lib/marketplace/identity.ts src/app/lib/marketplace/identity.test.mjs src/app/lib/marketplace/types.ts src/app/lib/marketplace/freelancerRecords.ts functions/src/freelancers.ts
git commit -m "feat: add public identity contracts"
```

### Task 2: Server-authoritative freelancer identity and public projection

**Files:**
- Modify: `functions/src/freelancers.ts`
- Modify: `functions/src/publicProfiles.ts`
- Modify: `functions/src/jobs.test.ts`
- Create: `functions/src/publicProfiles.test.ts`
- Modify: `firestore.rules`

**Interfaces:**
- Consumes `FreelancerIdentity` and `normalizePublicSlug` from Task 1.
- Produces `publicSlugs/{slug}` reservation records and extends `PublicProfileProjection` with `profileImageUrl`, `socialLinks`, and `publicSlug`.
- Uses `saveFreelancerProfile(callerUid, input, firestore)` as the only mutation endpoint.

- [ ] **Step 1: Write failing server tests**

```ts
test('reserves a unique freelancer slug atomically', async () => {
  await saveFreelancerProfile('freelancer-a', profile('amine-fade'), firestore);
  await expect(saveFreelancerProfile('freelancer-b', profile('amine-fade'), firestore))
    .rejects.toThrow('publicSlug is already in use');
});

test('projects approved identity but not private freelancer data', () => {
  expect(projectFreelancerPublicProfile('freelancer-a', approvedProfile)).toMatchObject({
    publicSlug: 'amine-fade', profileImageUrl: 'https://cdn.example/logo.png',
  });
});
```

- [ ] **Step 2: Run targeted server tests and verify RED**

Run: `npx jest --runInBand --runTestsByPath functions/src/jobs.test.ts functions/src/publicProfiles.test.ts`  
Expected: FAIL because slug reservations and public identity projection do not exist.

- [ ] **Step 3: Implement the transaction and projection**

Within the existing freelancer transaction, reserve `publicSlugs/{slug}` with `{ ownerType: 'freelancer', ownerId: callerUid }`. Permit the same owner to retain a slug, atomically delete their old reservation after reading it, and reject a reservation owned by another uid. Include only sanitized identity fields in `publicProfile`; preserve `approvalStatus` as server-owned. Extend `sanitizePublicProfile` to whitelist the new projection fields.

- [ ] **Step 4: Deny browser access to the new data**

```rules
match /publicSlugs/{slug} { allow read, write: if false; }
```

Keep existing profile and public projection mutation denials unchanged.

- [ ] **Step 5: Run server tests and Functions build**

Run: `npx jest --runInBand --runTestsByPath functions/src/bookings.test.ts functions/src/jobs.test.ts functions/src/publicProfiles.test.ts && npm --prefix functions run build`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/freelancers.ts functions/src/publicProfiles.ts functions/src/jobs.test.ts functions/src/publicProfiles.test.ts firestore.rules
git commit -m "feat: publish validated freelancer identities"
```

### Task 3: Brand identity, salon inheritance, and permissions

**Files:**
- Create: `functions/src/branding.ts`
- Create: `functions/src/branding.test.ts`
- Modify: `functions/src/index.ts`
- Modify: `functions/src/memberships.ts`
- Modify: `src/app/lib/marketplace/permissions.ts`
- Modify: `src/app/lib/marketplace/types.ts`
- Modify: `functions/src/publicProfiles.ts`
- Modify: `firestore.rules`

**Interfaces:**
- Produces `saveBrandBranding`, `saveLocationBranding`, and `resolveEffectiveLocationBranding` server functions.
- `saveBrandBranding({ branding })` requires a Principal Admin membership.
- `saveLocationBranding({ locationId, brandingMode, locationBranding? })` requires Principal Admin or a location-admin membership with `manageLocationBranding`.

- [ ] **Step 1: Write failing authorization and inheritance tests**

```ts
test('a salon admin without manageLocationBranding cannot set an override', async () => {
  await expect(saveLocationBranding('admin-a', overrideInput, firestore)).rejects.toThrow('not authorized');
});

test('an inherited salon uses the brand logo and a custom salon keeps its own logo', () => {
  expect(resolveEffectiveLocationBranding(brand, inherited)).toEqual(brand.branding);
  expect(resolveEffectiveLocationBranding(brand, custom).logoUrl).toBe('https://cdn.example/location.png');
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `npx jest --runInBand --runTestsByPath functions/src/branding.test.ts`  
Expected: FAIL because the branding functions do not exist.

- [ ] **Step 3: Implement validated brand and location mutations**

```ts
export async function saveBrandBranding(callerUid: string | null, input: unknown, firestore = admin.firestore()) {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  const { brandId, branding } = parseBrandBrandingInput(input);
  await requirePrincipalMembership(callerUid, brandId, firestore);
  await firestore.collection('brands').doc(brandId).update({ branding, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
}
export async function saveLocationBranding(callerUid: string | null, input: unknown, firestore = admin.firestore()) {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  const { locationId, brandingMode, locationBranding } = parseLocationBrandingInput(input);
  await requireLocationBrandingAccess(callerUid, locationId, firestore);
  await firestore.collection('salonLocations').doc(locationId).update({ brandingMode, locationBranding: brandingMode === 'custom_location' ? locationBranding : admin.firestore.FieldValue.delete() });
}
```

Use `sanitizeSocialLinks` and validate optional `logoUrl` as HTTPS, `primaryColor` as a six-digit hexadecimal color, and `brandingMode` as exactly `inherit_brand` or `custom_location`. Write an audit event for both operations. Reproject a changed location and all inherited locations when master branding changes.

- [ ] **Step 4: Extend safe public salon projection**

Expose only `effectiveBranding: { displayName, logoUrl?, primaryColor?, socialLinks?, publicSlug? }` in approved public salon profiles. Do not expose location membership, permissions, staff records, or internal IDs.

- [ ] **Step 5: Run authorization, projection, and build checks**

Run: `npx jest --runInBand --runTestsByPath functions/src/branding.test.ts functions/src/publicProfiles.test.ts functions/src/jobs.test.ts && npm --prefix functions run build`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/branding.ts functions/src/branding.test.ts functions/src/index.ts functions/src/memberships.ts functions/src/publicProfiles.ts src/app/lib/marketplace/permissions.ts src/app/lib/marketplace/types.ts firestore.rules
git commit -m "feat: add brand identity inheritance"
```

### Task 4: Brand and freelancer customization interfaces

**Files:**
- Create: `src/app/components/branding/BrandIdentitySettings.tsx`
- Create: `src/app/components/branding/LocationIdentitySettings.tsx`
- Create: `src/app/components/freelancer/PublicIdentitySettings.tsx`
- Create: `src/app/components/freelancer/PublicIdentitySettings.test.mjs`
- Modify: `src/app/components/pages/BrandDashboard.tsx`
- Modify: `src/app/components/pages/FreelancerDashboard.tsx`
- Modify: `src/app/lib/marketplace/freelancer.ts`

**Interfaces:**
- Consumes Task 1 contracts and Task 3 callables.
- Produces `saveBrandBranding`, `saveLocationBranding`, and the existing `saveFreelancerProfile` calls from focused form components.
- `PublicIdentitySettings` accepts `{ value: FreelancerProfileInput; onChange(value): void; publicUrl: string }`.

- [ ] **Step 1: Write a failing public-identity component test**

```js
test('shows the public link and QR only after a valid slug is selected', async () => {
  const source = await readFile(new URL('./PublicIdentitySettings.tsx', import.meta.url), 'utf8');
  assert.match(source, /QRCodeSVG/);
  assert.match(source, /Lien public/);
  assert.match(source, /Instagram/);
});
```

- [ ] **Step 2: Run it to verify RED**

Run: `node --test src/app/components/freelancer/PublicIdentitySettings.test.mjs`  
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Build freelancer settings UI**

Create a focused card that lets the freelancer edit a profile image URL/upload result, five social links, and slug. Render `QRCodeSVG` using `${window.location.origin}/p/${slug}` only after the field validates. Show a clear “pending approval” message when `publicProfile.approvalStatus !== 'approved'`; never show private URLs or an address.

- [ ] **Step 4: Build brand and location UI**

Add a **Brand identity** section visible only to Principal Admins. Add a **Location identity** section for the selected location, with an inherit/custom switch and a disabled local form until custom mode is selected. Hide editing controls from unpermitted Salon Admins, but show them whether the salon inherits the brand.

- [ ] **Step 5: Run interface tests and production build**

Run: `node --test src/app/components/freelancer/PublicIdentitySettings.test.mjs src/app/lib/marketplace/identity.test.mjs && npm run build`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/branding src/app/components/freelancer/PublicIdentitySettings.tsx src/app/components/freelancer/PublicIdentitySettings.test.mjs src/app/components/pages/BrandDashboard.tsx src/app/components/pages/FreelancerDashboard.tsx src/app/lib/marketplace/freelancer.ts
git commit -m "feat: add identity customization settings"
```

### Task 5: Public slug routing and release verification

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/components/discovery/ProfilePage.tsx`
- Create: `src/app/components/discovery/PublicSlugProfile.test.mjs`
- Modify: `rules-tests/authz.rules.test.cjs`
- Modify: `README.md`

**Interfaces:**
- Adds public route `/p/:slug`.
- Resolves a slug through `getPublicProfileBySlug({ slug })`; it returns only the existing sanitized public profile projection.

- [ ] **Step 1: Write failing public-route and security tests**

```js
test('registers the public profile slug route', async () => {
  const app = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /path="p\/:slug"/);
});
```

Add a Firestore-rules assertion that signed-in and anonymous browser clients cannot read or write `publicSlugs`.

- [ ] **Step 2: Run the tests to verify RED**

Run: `node --test src/app/components/discovery/PublicSlugProfile.test.mjs`  
Expected: FAIL because the public route does not exist.

- [ ] **Step 3: Implement safe route resolution**

Add the callable lookup to `functions/src/publicProfiles.ts`, validate with `normalizePublicSlug`, look up `publicSlugs/{slug}`, then fetch only the approved public projection. Render it using the existing `ProfilePage` visual components and an unavailable state for missing/unapproved slugs. Do not add direct Firestore reads.

- [ ] **Step 4: Verify all locally runnable checks**

Run: `node --test $(rg --files src/app | rg '\\.test\\.mjs$') && npm run build && npm --prefix functions run build`  
Expected: all Node tests PASS; both builds exit 0.

Start the emulator and then run: `firebase emulators:exec --only firestore "npx jest --runInBand --runTestsByPath rules-tests/authz.rules.test.cjs rules-tests/booking-privacy.rules.test.cjs"`  
Expected: security tests PASS.

- [ ] **Step 5: Perform staging acceptance checks**

In staging, verify Principal Admin can set brand identity, one salon inherits it, another keeps a custom override, an unpermitted Salon Admin is denied, a freelancer receives a unique URL and QR code, and a client sees only approved public information. Do not deploy production or enable Stripe.

- [ ] **Step 6: Commit**

```bash
git add src/app/App.tsx src/app/components/discovery/ProfilePage.tsx src/app/components/discovery/PublicSlugProfile.test.mjs functions/src/publicProfiles.ts rules-tests/authz.rules.test.cjs README.md
git commit -m "feat: add public branded profile links"
```

## Plan self-review

- Brand master identity, inherited salons, custom salon overrides, and the principal-admin permission boundary are covered by Tasks 1 and 3.
- Freelancer logo/profile image, social links, unique public link, QR code, moderation, and public projection are covered by Tasks 1, 2, 4, and 5.
- Server validation, Firestore direct-write denials, audit events, backwards compatibility, and emulator/staging checks are explicitly covered.
- No task enables Stripe, online payments, payouts, custom CSS, paid domains, or social posting.

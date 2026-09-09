# Brand and Freelancer Customization — Design Specification

**Status:** Awaiting review
**Date:** 2026-09-09
**Scope:** Add scalable visual identity to multi-salon brands, their salon locations, and independent barber public profiles. This does not add online payments.

## Outcome

Each business can present its own identity without creating duplicate accounts or leaking one salon's data into another salon. The brand owner controls the master identity. Each salon may inherit it or use an approved local override. Freelancers control their independent public identity.

## Brand identity

The Principal Admin owns one `brands/{brandId}.branding` record:

- `displayName`
- `logoUrl`
- `primaryColor`
- `socialLinks` (`instagram`, `tiktok`, `facebook`, `website`, `whatsapp`)
- `publicSlug`
- `updatedAt`, `updatedBy`

Only the Principal Admin may update this record. `logoUrl` references an uploaded image; image bytes are never stored in Firestore. Brand styling has safe defaults when no logo or color is set.

## Salon-level choice

Each `salonLocations/{locationId}` receives a `brandingMode`:

- `inherit_brand` (default): uses the brand logo, colors, and social links.
- `custom_location`: uses only that salon's `locationBranding` values.

The Principal Admin chooses the mode. A Salon Admin may edit local identity only when the Principal Admin grants a new `manageLocationBranding` permission. This permission does not permit changing brand identity, brand billing, or another salon's identity.

Changing the master brand identity updates inherited salons automatically. Custom salons remain unchanged. Public pages resolve the effective branding server-side or in a controlled public projection: location override first, otherwise brand identity.

## Freelancer identity

Each `freelancerProfiles/{uid}` receives an `identity` object:

- `profileImageUrl` (optional profile image or logo)
- `socialLinks` (`instagram`, `tiktok`, `facebook`, `website`, `whatsapp`)
- `publicSlug`

The account owner alone may update this object through the existing validated server function. Each slug is globally reserved in a server transaction; it must be lowercase, human-readable, and unique. The system creates an immutable public route such as `/p/amine-fade` after moderation approval. The QR code contains only that public HTTPS profile URL.

Portfolio images remain distinct from the profile image. Existing moderation and visibility rules remain in force. Social links are sanitized to accepted URL schemes and hosts; WhatsApp is stored as a normal international phone number and converted into its safe click-to-chat URL only in the public profile projection.

## User experience

### Principal Admin

1. Opens **Brand identity** in the brand dashboard.
2. Uploads logo, chooses primary color, and adds optional public social links.
3. Selects a salon and chooses **Use brand identity** or **Customise this salon**.
4. Optionally grants that Salon Admin permission to maintain the selected salon's local identity.
5. Saves; the dashboard reports whether the salon inherits or overrides the brand identity.

### Freelancer

1. Opens **Public profile** in their workspace.
2. Adds an optional profile image or logo and social links.
3. Chooses and confirms an available public link.
4. Downloads or shares the generated QR code.
5. When platform moderation approves the profile, the public link and QR resolve to the public profile. Until then, the dashboard clearly shows that the profile is not yet public.

## Security and validation

- Browsers cannot directly set a brand, location, or freelancer identity record that grants authority or overrides moderation.
- Uploads use authenticated Storage paths owned by the brand/location or freelancer; server validation enforces file type, size, and ownership.
- Public profiles contain only the effective public identity and approved portfolio media. They never expose private email, address, membership, booking, or internal payment information.
- Slug uniqueness, social-link normalization, and effective-branding projection are server-authoritative.
- Existing public pages must render safely with old records that have no new branding fields.

## Testing and acceptance

1. A Principal Admin can save a brand logo and color; inherited salons show the new identity.
2. A custom salon stays unchanged after the brand identity changes.
3. A Salon Admin without `manageLocationBranding` cannot edit local identity.
4. A permitted Salon Admin changes only their assigned location identity.
5. A freelancer can save a valid profile image, social links, and unique slug.
6. Duplicate or invalid slugs and unsafe social links are rejected.
7. The QR code opens the exact approved public profile URL.
8. An unapproved freelancer profile, private booking data, and home address never appear in the public route.
9. Old salon and freelancer records without branding fields continue to display defaults.

## Out of scope

- Online payments, Stripe, deposits, or payouts.
- Custom fonts and arbitrary HTML/CSS.
- A public brand directory or paid vanity domains.
- Automatic social-media posting or analytics.

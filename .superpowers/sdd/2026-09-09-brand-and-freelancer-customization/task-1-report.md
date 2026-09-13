# Task 1: Shared identity contracts and validators

## Result

Implemented the shared client/server identity contract for public freelancer profiles and future brand/location identity work. Browser Firestore permissions were not changed.

## RED evidence

Ran:

```sh
node --test src/app/lib/marketplace/identity.test.mjs
```

Result: failed with `ERR_MODULE_NOT_FOUND` because the identity module did not exist. The test covered the required public-slug normalization and unsafe-link rejection behavior.

## GREEN evidence

Ran:

```sh
node --test src/app/lib/marketplace/identity.test.mjs src/app/lib/marketplace/freelancer.test.mjs
npm --prefix functions run build
npm run build
```

Result: 4/4 Node tests passed; the Functions TypeScript build and Vite production build both completed successfully.

## Files changed

- `src/app/lib/marketplace/identity.ts`: shared `SocialLinks`, `Branding`, `LocationBranding`, and `FreelancerIdentity` contracts plus public-slug and social-link validation.
- `src/app/lib/marketplace/identity.test.mjs`: validator tests.
- `src/app/lib/marketplace/freelancerRecords.ts`: parsed identity, with a safe `{ socialLinks: {}, publicSlug: '' }` default for records that predate the feature.
- `src/app/lib/marketplace/freelancer.test.mjs`: existing parser test migrated from the non-runnable TypeScript test format and extended for legacy identity compatibility.
- `src/app/lib/marketplace/types.ts` and `src/app/lib/marketplace/permissions.ts`: added `manageLocationBranding` and default values.
- `functions/src/freelancers.ts`: strict, server-side freelancer identity input validation and exported contract helpers for the following server task.

## Self-review

- The client parser rejects malformed supplied identities but accepts absent legacy identities only as the safe empty default.
- The server input allowlist includes `identity` and rejects unknown nested fields, unsafe URL protocols/hosts, unsupported social networks, malformed WhatsApp numbers, and invalid slugs.
- The validator only permits Instagram, TikTok, Facebook, HTTPS websites, and E.164 WhatsApp numbers; public projection remains for the next task.
- No Firestore rules, browser write permissions, moderation state, or public projections were modified.

## Concerns

The task plan invoked `freelancer.test.mjs`, but the repository contained `freelancer.test.ts`, which Node 22 cannot run directly. It was migrated to the prescribed `.mjs` test path; the test transpiles the production TypeScript source using the already-installed Functions TypeScript dependency.

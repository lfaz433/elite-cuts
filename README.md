# Elite Cuts

Elite Cuts is a Firebase and React application for salon, freelancer, and
client booking workflows.

## Launch Firebase environment

The founder-owned launch environment uses Firebase project `elitecuts-2fb0a`.
Copy `.env.launch.example` to `.env.local`, then fill only the public Firebase
Web App configuration values from that Firebase project. App Check is disabled
by default and must remain disabled until a valid reCAPTCHA configuration is
available.

Public freelancer booking must not be opened for Preview acceptance until
Anonymous Authentication is enabled and reCAPTCHA v3 App Check is registered
for the exact Vercel Preview hostname. In the Vercel **Preview** environment
only, set `VITE_FIREBASE_APPCHECK_ENABLED=true` and
`VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY` to that registration's public site
key, then rebuild the Preview. Keep the local defaults in `.env.example`
disabled; do not copy these activation settings into Development or Production
as part of this release gate.

The reCAPTCHA **site key is public configuration**. Service-account keys,
reCAPTCHA secret keys, private keys, App Check debug tokens and other secrets
must never be placed in `VITE_*` variables: Vite includes those values in the
browser bundle. Configure server/provider secrets through the relevant secure
console or server secret store, never a browser environment file.

The [Preview acceptance checklist](docs/launch/mvp-preview-acceptance.md)
requires valid-token success, missing/invalid/replayed App Check token rejection
and the [freelancer user scenario](docs/launch/freelancer-user-experience-scenario.md)
before any launch decision. Firestore rules tests prove browser authorization;
they do not prove live App Check, cloud configuration or manual UX acceptance.
This implementation does not deploy Firebase/Vercel, activate App Check or add
payments. Any production release remains a separate explicit decision.

Before an authorized Firebase deploy, verify the environment and explicitly
confirm the project:

```bash
VITE_FIREBASE_PROJECT_ID=elitecuts-2fb0a node scripts/verify-environment.mjs launch
CONFIRM_LAUNCH_PROJECT=elitecuts-2fb0a npm --prefix functions run deploy:launch
```

The deployment command applies Firestore rules, indexes, and Cloud Functions
only to the `launch` alias, which is locked to `elitecuts-2fb0a`.

## Legacy referral pilot notes

The referral MVP is limited to non-cash platform credits. Its repeatable local
verification, four-user staging pilot, deployment gate, and intentionally
deferred client-registration attribution are documented in
[the referral pilot checklist](docs/referral-pilot-checklist.md).

These historical notes refer to the old Digitalizi staging pilot. They are not
the deployment path for the founder-owned launch environment.

# Elite Cuts

Elite Cuts is a Firebase and React application for salon, freelancer, and
client booking workflows.

## Launch Firebase environment

The founder-owned launch environment uses Firebase project `elitecuts-2fb0a`.
Copy `.env.launch.example` to `.env.local`, then fill only the public Firebase
Web App configuration values from that Firebase project. App Check is disabled
by default and must remain disabled until a valid reCAPTCHA configuration is
available.

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

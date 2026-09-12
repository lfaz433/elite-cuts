# Elite Cuts

Elite Cuts is a Firebase and React application for salon, freelancer, and
client booking workflows.

## Referral pilot

The referral MVP is limited to non-cash platform credits. Its repeatable local
verification, four-user staging pilot, deployment gate, and intentionally
deferred client-registration attribution are documented in
[the referral pilot checklist](docs/referral-pilot-checklist.md).

Do not deploy referral Functions until the staging project has Blaze billing
and authorized Firebase credentials. Deployments, when authorized, target
`elite-cuts-staging` only; run the four-user pilot after that staging deploy
and make the release decision from its evidence.

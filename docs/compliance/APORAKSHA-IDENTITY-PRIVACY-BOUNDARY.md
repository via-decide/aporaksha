# Aporaksha identity/privacy boundary

`passports.passport_id` is the canonical subject ID. `authenticatedSubject` verifies the signed access token, expiry, type and JTI and requires a matching non-revoked durable `auth_sessions` row. Privacy routes never accept browser email, username, creator slug, user ID, or principal ID; extra identity/query fields fail closed.

Aporaksha owns identity, credentials, sessions, consents, rights cases, nominations, grievances, notice delivery, erasure evidence and security incidents. VIA owns creator/buyer commerce and fulfilment domain records. VIA commit `3ce89a8e3da0752910ea68f13ab0b118c19628f3` is the source snapshot for the deterministically version-labelled purpose registry. A future CI job must compare its canonical serialized registry when both repositories are present; drift is a failure, not an implicit merge.

Cross-repository access and erasure require an authenticated service contract using opaque subject IDs. Until that contract exists, reports return `UNAVAILABLE_FAIL_CLOSED`, erasure retains linked commerce records for `LEGAL_REVIEW_REQUIRED`, and the readiness gate remains incomplete. Audit events cross the boundary using opaque subject/request/event references only. Browser identity is never evidence.

Vercel dispatches `/api/privacy/*` to the existing `api/auth.js` serverless function, which immediately delegates to `lib/privacy-handler.js`. This consolidation avoids creating an additional deployed function and does not bypass privacy authentication or authorization.

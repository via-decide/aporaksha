# Evidence-based processor inventory

| Processor/evidence | Purpose | Categories | Role | Region | Contract | Security | Retention | Subprocessors | Cross-border |
|---|---|---|---|---|---|---|---|---|---|
| Turso/libSQL dependency | database hosting | identity, commerce, privacy | processor candidate | UNKNOWN | LEGAL_REVIEW_REQUIRED | UNKNOWN | UNKNOWN | UNKNOWN | review required |
| Vercel configuration | application hosting | requests, logs | processor candidate | UNKNOWN | LEGAL_REVIEW_REQUIRED | UNKNOWN | UNKNOWN | UNKNOWN | review required |
| Razorpay SDK/config | payments | buyer/payment metadata | processor candidate | UNKNOWN | LEGAL_REVIEW_REQUIRED | UNKNOWN | UNKNOWN | UNKNOWN | review required |
| AWS S3/KMS SDKs | archive/encryption | export/archive payloads | processor candidate | UNKNOWN | LEGAL_REVIEW_REQUIRED | UNKNOWN | UNKNOWN | UNKNOWN | review required |
| Nodemailer | email transport | email/message metadata | processor interface; provider UNKNOWN | UNKNOWN | LEGAL_REVIEW_REQUIRED | UNKNOWN | UNKNOWN | UNKNOWN | review required |
| KafkaJS/Redis/Temporal/Postgres dependencies | messaging/cache/workflow/database | identifiers/telemetry | provider UNKNOWN | UNKNOWN | LEGAL_REVIEW_REQUIRED | UNKNOWN | UNKNOWN | UNKNOWN | review required |

A configurable prohibited-region list is intentionally empty pending a Central Government restriction and deployment-region evidence. Production routing enforcement is **INCOMPLETE**.

# Payment Webhook Ingestion Pattern

Principle: webhook providers are transport systems, not workflow engines, retry coordinators, or execution authorities.

Correct pattern: `Provider -> Ingestion Endpoint -> Durable Event Store -> Queue -> Async Worker -> Business Logic`.

Incorrect pattern: `Provider -> Business Logic -> External APIs/Auth -> Crash -> Provider retries forever`.

Design goals: idempotent, replayable, observable, fault-tolerant, provider-independent.

Execution ownership stays in-platform: retries, reconciliation, state transitions, recovery, and observability are internal responsibilities; provider responsibility is delivery only.

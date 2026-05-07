# IMPLEMENTATION TASK — Razorpay Webhook Pipeline
Priority: CRITICAL  
Mode: IMPLEMENTATION  
Goal: restore `/api/webhooks/razorpay` reliability immediately.

Phase 1 (stabilize): webhook does only raw body signature verify (`x-razorpay-signature`), immutable `webhook_events` persist, enqueue job, immediate `200` (<1s), and no sync business logic/external calls.

`webhook_events` MVP fields: `id, provider, provider_event_id, event_type, signature, payload_raw, payload_json, processing_state, processing_attempts, received_at, processed_at, last_error, correlation_id`; add indexes for `provider_event_id`, `processing_state`, `received_at`; enforce append-only + idempotency via unique dedupe key.

Phase 2 (async execution): queue-backed worker (BullMQ/Redis or equivalent) performs reconciliation, subscription/order/entitlement updates, audit logs, retries with backoff, and replay endpoint `POST /internal/webhooks/replay/:id` (admin-only, idempotent requeue).

Phase 3 (operations): structured stage logs, reconciliation cron against Razorpay API, DLQ for exhausted retries, replay tooling, and visibility dashboards for ingestion success, processing success, retry rate, duplicate rate, DLQ size, and latency.

MVP success: webhook stays enabled, endpoint no longer crashes publicly, duplicates are safe, replay works, transient failures recover internally; principle: transport delivery is not execution success.

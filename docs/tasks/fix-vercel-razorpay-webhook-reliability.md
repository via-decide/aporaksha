# Task — Fix Razorpay Webhook Reliability on Vercel
Priority: CRITICAL  
Status: OPEN

Problem: `/api/webhooks/razorpay` fails on Vercel (`500 FUNCTION_INVOCATION_FAILED`), Razorpay retries exhaust, webhook is auto-disabled, and payment events risk loss.

Required refactor: make webhook a minimal ingestion boundary only (`verify signature -> persist raw payload -> enqueue async job -> return 200 <1s`), with no heavy synchronous business logic.

Implement durable `webhook_events` (append-only, immutable raw payload, replayable/auditable) with fields: `id, provider, event_type, event_id/payload_hash, signature, raw_payload, received_at, processing_state, processing_attempts, last_error, processed_at`.

Enforce idempotency and async processing with retries, DLQ, structured errors, reconciliation, order/subscription updates, entitlement grants, notifications, and audit logs.

Add structured logs/metrics (ingestion, processing, retries, failures, latency), isolate failures so Razorpay always gets 200 after ingestion, and add replay capability (`POST /internal/webhooks/replay/:eventId`) for failed/dead-lettered events.

Outcome: stable Vercel webhook transport, internalized retries/recovery, replay-safe payment processing, and foundation for Hanuman execution orchestration.

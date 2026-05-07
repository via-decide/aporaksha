# Task — Implement Production-Grade Razorpay Webhook Ingestion Pipeline
Priority: CRITICAL  
Status: OPEN  
Type: Infrastructure Refactor

Objective: replace fragile `/api/webhooks/razorpay` flow with durable ingestion (`verify signature -> persist immutable event -> enqueue async task -> return 200 <1s`) to stop FUNCTION_INVOCATION_FAILED and retry exhaustion.

Deliverables: preserve raw request body (no pre-verification mutation), validate `x-razorpay-signature`, store append-only `webhook_events` (`id, provider, provider_event_id, event_type, signature, payload_raw, payload_json, received_at, processing_state, processing_attempts, processed_at, last_error, replayed_from, correlation_id`), and enforce idempotency via unique dedupe key + safe upsert.

Move all business workflows to async worker (reconciliation, subscription/order/entitlement updates, downstream events) with retries, exponential backoff, DLQ, structured logging, and failure isolation so webhook ACK remains successful even when processing fails.

Add internal queue (Redis/BullMQ/SQS/Postgres/Inngest/Trigger.dev), authenticated replay endpoint (`POST /internal/webhooks/replay/:eventId`), ingestion/processing metrics dashboards, and a scheduled Razorpay reconciliation job for drift detection and repair.

Add circuit breakers and Vercel stability controls (Prisma singleton, lightweight imports, timeout budget, lazy deps); enforce principle: transport delivery is never execution success, and this boundary becomes Hanuman orchestration substrate.

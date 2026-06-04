# Webhook Execution Boundary

Principle: providers deliver events only; they do not own retries, execution, reconciliation, or workflow state.

Correct boundary: `Provider -> Ingestion Boundary -> Durable Storage -> Queue -> Orchestration Layer -> Business Workflows`.

Why: serverless endpoints are failure-prone for long workflows (cold starts, timeouts, DB exhaustion, deploy mismatch, uncaught exceptions, network instability), so webhook routes must remain minimal and deterministic.

Golden rule: ACK transport quickly, process execution asynchronously, and keep retries/recovery/audit fully platform-controlled.

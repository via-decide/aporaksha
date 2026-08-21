# Backup and restore runbook

Status: **BLOCKED_CONFIG**. Provider, frequency, retention, encryption, access controls, deletion lifecycle, restore mechanism and RPO/RTO are unverified. Do not claim a backup exists.

For a disposable restore test: obtain authorized snapshot evidence; restore into an isolated network/database; apply migrations; compare counts/checksums without exporting PII; apply `erasure_suppression` before service activation; prove erased opaque subjects cannot be reactivated; run authorization/privacy tests; destroy the restore and record opaque evidence. Never attach a restored database before suppression reconciliation succeeds.

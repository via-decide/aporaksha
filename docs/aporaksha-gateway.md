# Aporaksha Gateway Architecture

## Purpose
Aporaksha is the sovereign entry point for the Zayvora ecosystem. It provides a single gateway where users can:

- Open and persist a Zayvora Passport identity.
- Route into ecosystem systems while attaching identity context.
- Review security posture and telemetry summaries.

## Passport System
The passport layer includes:

- `passport/passport-model.js`: normalizes identity payloads.
- `passport/passport-store.js`: stores passport registry in localStorage.
- `passport/passport-auth.js`: session binding and trusted-origin checks.
- `passport/store/passport-cache.js`: client cache for fast profile loading.
- `passport/store/passport-loader.js`: resolves profile from session and cache.
- `passport/passport-view.js`: profile UI for `/passport`.
- `passport/nfc/nfc-passport-reader.js`: NFC-ready profile lookup.

## Ecosystem Routing
Routing logic is centralized in:

- `core/router-adapter.js`: adapter for aporaksha-core ecosystem router + fallback map.
- `core/ecosystem-router.js`: routes users between systems and appends session identity.

Target systems:

- `https://daxini.xyz`
- `https://daxini.space`
- `https://logichub.app`
- `https://hanuman.solutions`
- `https://viadecide.com`

## Identity Layer
Identity is attached through a passport session token and passport ID.

When users route from the gateway, the router adds:

- `passport_id`
- `session_token`

as URL query parameters to preserve context across connected systems.

## Security Layer
Security adapter stack:

- `core/security-adapter.js`: loads aporaksha-core security-layer and returns status.
- `security/hanuman-telemetry-adapter.js`: presents attack telemetry summary for UI.

## Core Module Adapters
Core adapters are implemented in `core/` and attempt runtime imports from `aporaksha-core`:

- `core/passport-adapter.js`
- `core/router-adapter.js`
- `core/security-adapter.js`

If remote imports are unavailable, adapters gracefully fall back to local browser-based logic so the public gateway remains functional.

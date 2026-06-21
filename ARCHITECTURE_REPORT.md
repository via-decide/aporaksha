# Architecture Report

Generated at: 2026-06-19T15:49:56.755Z

## Repository Overview

- **Total Files Checked:** 138
- **Layer Breakdown:**
  - Shared Utilities: 0 files
  - Games: 0 files
  - Orchard Engine Layer: 0 files
  - Modular Tools: 0 files
  - Root-Level Hub/Router: 28 files

## File Types Distribution

| Extension | Count |
|---|---|
| `(no ext)` | 5 |
| `.example` | 1 |
| `.production` | 1 |
| `.vercel` | 1 |
| `.txt` | 4 |
| `.md` | 13 |
| `.js` | 62 |
| `.json` | 7 |
| `.html` | 29 |
| `.db` | 1 |
| `.css` | 2 |
| `.svg` | 1 |
| `.pdf` | 3 |
| `.sql` | 2 |
| `.mjs` | 1 |
| `.png` | 5 |

## Modular Naming Conventions & Boundaries

✅ All tools satisfy naming boundary standards (clean standalone layouts).

## Dependency Graph Map

```mermaid
graph TD
    "[id].js" --> "db"
    "[id].js" --> "initDb"
    "[id].js" --> "queue"
    "invoices.js" --> "db.js"
    "invoices.js" --> "initDb.js"
    "invoices.js" --> "invoiceEngine.js"
    "logs.js" --> "db"
    "logs.js" --> "initDb"
    "verify.js" --> "db.js"
    "verify.js" --> "initDb.js"
    "create-order.js" --> "commerceConfig.js"
    "create-order.js" --> "emailService.js"
    "create-order.js" --> "passportEngine.js"
    "create-order.js" --> "db.js"
    "verify.js" --> "db.js"
    "verify.js" --> "initDb.js"
    "check-access.js" --> "db"
    "check-access.js" --> "initDb"
    "razorpay.js" --> "db.js"
    "razorpay.js" --> "initDb.js"
    "razorpay.js" --> "queue.js"
    "login.js" --> "token"
    "login.js" --> "token-blacklist"
    "login.js" --> "input-validation"
    "login.js" --> "session-store"
    "middleware.js" --> "token"
    "middleware.js" --> "token-blacklist"
    "middleware.js" --> "session-store"
    "index.html" --> "passport-id-generator.js"
    "index.html" --> "passport-model.js"
    "index.html" --> "passport-store.js"
    "index.html" --> "passport-auth.js"
    "index.html" --> "passport-adapter.js"
    "index.html" --> "router-adapter.js"
    "index.html" --> "security-adapter.js"
    "index.html" --> "ecosystem-router.js"
    "index.html" --> "hanuman-telemetry-adapter.js"
    "index.html" --> "system-status.js"
    "index.html" --> "global-navbar.js"
    "index.html" --> "dashboard.js"
    "index.html" --> "router-adapter.js"
    "index.html" --> "ecosystem-router.js"
    "index.html" --> "global-navbar.js"
    "index.html" --> "dashboard.js"
    "initDb.js" --> "db.js"
    "invoiceEngine.js" --> "db.js"
    "logger.js" --> "db.js"
    "passportEngine.js" --> "db.js"
    "queue.js" --> "db.js"
    "queue.js" --> "logger.js"
    "queue.js" --> "invoiceEngine.js"
    "queue.js" --> "passportEngine.js"
    "queue.js" --> "emailService.js"
    "profile.html" --> "passport-id-generator.js"
    "profile.html" --> "passport-model.js"
    "profile.html" --> "passport-store.js"
    "profile.html" --> "passport-auth.js"
    "profile.html" --> "passport-adapter.js"
    "profile.html" --> "passport-cache.js"
    "profile.html" --> "passport-loader.js"
    "profile.html" --> "nfc-passport-reader.js"
    "profile.html" --> "global-navbar.js"
    "profile.html" --> "passport-view.js"
    "index.js" --> "razorpay"
    "index.js" --> "login"
    "index.js" --> "middleware"
    "razorpay.js" --> "middleware"
    "razorpay.js" --> "check-product-access"
    "razorpay.js" --> "input-validation"
    "login.js" --> "state.js"
    "passport.js" --> "state.js"
    "main.js" --> "login.js"
    "main.js" --> "passport.js"
    "router.js" --> "state.js"
    "test_pdf.js" --> "invoiceEngine.js"
    "validate_commerce_lifecycle.js" --> "create-order.js"
    "validate_commerce_lifecycle.js" --> "verify.js"
    "validate_commerce_lifecycle.js" --> "razorpay.js"
    "validate_commerce_lifecycle.js" --> "verify.js"
    "validate_commerce_lifecycle.js" --> "passportEngine.js"
    "validate_commerce_lifecycle.js" --> "db.js"
    "validate_commerce_lifecycle.js" --> "initDb.js"
```

# aporaksha

## Auth core (browser fallback)

`core/security-adapter.js` now exposes a subscription auth authority compatible with the requested flow:

- `generateAuthPayload(subId)` for `GET /api/auth/generate?sub_id=XXX`
- `verifyAuthPayload({ payload, sig })` for `POST /api/auth/verify`
- `onRazorpayPaymentSuccess(payment)` to create active subscriptions + access tokens

Storage schema is persisted in `localStorage` with SQLite-like tables:

- `subscriptions`: `id`, `user_id`, `plan`, `status`
- `auth_nonces`: `nonce`, `created_at`, `used_at`

## Razorpay Webhook Setup

1. Go to Razorpay Dashboard → Webhooks
2. Set webhook URL:

   https://aporaksha.com/api/webhooks/razorpay

3. Add events:
   - payment.captured
   - order.paid
4. Set secret (same as `.env`)
5. Ensure endpoint returns HTTP 200

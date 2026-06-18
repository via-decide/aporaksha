/**
 * api/payments/verify.js
 * Aporaksha — Razorpay Payment Signature Verification
 * POST /api/payments/verify
 *
 * Verifies the HMAC-SHA256 signature returned by Razorpay after payment.
 * This is the security step — without this, you cannot trust a payment succeeded.
 *
 * Flow: razorpay.orders.create → checkout modal → handler fires → POST here → grant access
 */

import crypto from 'crypto';

export default async function handler(req, res) {
  // ── CORS ────────────────────────────────────────────────────────────────
  const ALLOWED = ['https://aporaksha.com', 'https://www.aporaksha.com'];
  const origin  = req.headers.origin || '';
  if (ALLOWED.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, product_id, email } = req.body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields' });
  }

  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  if (!KEY_SECRET) {
    console.error('[Razorpay] RAZORPAY_KEY_SECRET not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // ── HMAC-SHA256 Signature Verification ─────────────────────────────────
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSig = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(body)
    .digest('hex');

  if (expectedSig !== razorpay_signature) {
    console.warn('[Razorpay] Signature mismatch — possible tamper attempt', {
      razorpay_order_id,
      razorpay_payment_id,
    });
    return res.status(400).json({ success: false, error: 'Payment signature invalid' });
  }

  // ── Payment verified ────────────────────────────────────────────────────
  // In production: record to DB, send receipt email, unlock product access.
  // This stub logs and returns success — wire to your DB when ready.
  console.log('[Razorpay] Payment verified', {
    order_id:   razorpay_order_id,
    payment_id: razorpay_payment_id,
    product_id,
    email,
    verified_at: new Date().toISOString(),
  });

  return res.status(200).json({
    success:    true,
    payment_id: razorpay_payment_id,
    order_id:   razorpay_order_id,
    product_id,
    message:    'Payment verified. You will receive access instructions by email within 24 hours.',
  });
}

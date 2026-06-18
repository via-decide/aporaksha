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
import { getDB } from '../../lib/db.js';
import { initDB } from '../../lib/initDb.js';

const ACCESS_SECRET = process.env.SECRET_KEY || "zayvora_dev_access_secret";
function verifyJWT(token) {
  try {
    const [header, body, sig] = (token || "").split(".");
    if (!header || !body || !sig) return { valid: false };
    const data = `${header}.${body}`;
    const expected = crypto.createHmac("sha256", ACCESS_SECRET).update(data).digest("base64url");
    if (expected !== sig) return { valid: false };
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) return { valid: false };
    return { valid: true, payload };
  } catch (e) {
    return { valid: false };
  }
}
export default async function handler(req, res) {
  // ── CORS ────────────────────────────────────────────────────────────────
  const ALLOWED = ['https://aporaksha.com', 'https://www.aporaksha.com'];
  const origin  = req.headers.origin || '';
  if (ALLOWED.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, product_id, email } = req.body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields' });
  }

  // ── Auth Validation ───────────────────────────────────────────────────────
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  const verification = verifyJWT(token);

  if (!verification.valid) {
    return res.status(401).json({ error: 'Unauthorized. Passport authentication required.' });
  }
  const userId = verification.payload.userId;

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
  try {
    await initDB();
    const db = await getDB();
    await db.run(
      `INSERT INTO orders (id, amount, currency, status, payment_id, verified, email, user_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [razorpay_order_id, 0, 'INR', 'paid', razorpay_payment_id, 1, email || verification.payload.email, userId]
    );

    // Telemetry log
    await db.run(
      `INSERT INTO events (type, payload) VALUES (?, ?)`,
      ['payment_completed', JSON.stringify({ razorpay_order_id, razorpay_payment_id, product_id, user_id: userId })]
    );
  } catch (dbErr) {
    console.error("[Razorpay] Failed to save order to DB:", dbErr);
    // Proceed to return 200 since the actual payment succeeded
  }

  console.log('[Razorpay] Payment verified and linked to user', {
    order_id:   razorpay_order_id,
    payment_id: razorpay_payment_id,
    product_id,
    user_id:    userId,
    email:      email || verification.payload.email,
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

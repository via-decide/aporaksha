/**
 * api/payments/create-order.js
 * Aporaksha — Razorpay Real Order API
 * POST /api/payments/create-order
 *
 * Creates a real Razorpay order using the server-side SDK.
 * Returns { order_id, amount, currency, key_id } to the client.
 * Client opens Razorpay checkout modal, then calls /api/payments/verify.
 */

import Razorpay from 'razorpay';
import crypto from 'crypto';

// ── Product catalogue (amounts in paise = INR × 100) ──────────────────────
const PRODUCTS = {
  zayvora_os:   { amount: 171700, name: 'Zayvora OS — Reasoning IDE',        currency: 'INR' },
  daxini_stack: { amount: 39900,  name: 'Daxini Stack — PDF/ePub',           currency: 'INR' },
  forge_access: { amount: 89900,  name: 'LogicHub Forge Access',             currency: 'INR' },
  scaffold:     { amount: 14900,  name: 'Production Scaffold',               currency: 'INR' },
  arch_audit:   { amount: 499900, name: 'Architecture Audit — Hanuman.Solutions', currency: 'INR' },
};

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

  // ── Auth Validation ───────────────────────────────────────────────────────
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  const verification = verifyJWT(token);

  if (!verification.valid) {
    return res.status(401).json({ error: 'Unauthorized. Passport authentication required.' });
  }
  const userId = verification.payload.userId;

  // ── Validate keys are present ───────────────────────────────────────────
  const KEY_ID     = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

  if (!KEY_ID || !KEY_SECRET) {
    console.error('[Razorpay] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set in env');
    return res.status(500).json({ error: 'Payment gateway not configured. Contact support.' });
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  const { product_id, email } = req.body || {};

  if (!product_id) {
    return res.status(400).json({ error: 'product_id is required' });
  }

  const product = PRODUCTS[product_id];
  if (!product) {
    return res.status(400).json({ error: `Unknown product: ${product_id}` });
  }

  // ── Country Logging (Geofencing relaxed for global access) ───────────────
  const country = req.headers['x-vercel-ip-country'] || 'UNKNOWN';
  console.log(`[Razorpay] Order initiated from country: ${country}`);

  try {
    const razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });

    const order = await razorpay.orders.create({
      amount:   product.amount,
      currency: product.currency,
      receipt:  `rcpt_${product_id}_${crypto.randomBytes(4).toString('hex')}`,
      notes: {
        product_id,
        product_name: product.name,
        customer_email: email || verification.payload.email || '',
        user_id: userId,
      },
    });

    return res.status(200).json({
      order_id:    order.id,
      amount:      order.amount,
      currency:    order.currency,
      product_name: product.name,
      key_id:      KEY_ID,   // safe — this is the public key
    });

  } catch (err) {
    console.error('[Razorpay] Order creation failed:', err);
    return res.status(500).json({ error: 'Order creation failed. Please try again.' });
  }
}

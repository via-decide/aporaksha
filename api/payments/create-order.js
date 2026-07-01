/**
 * api/payments/create-order.js
 * Aporaksha — Razorpay Real Order API
 * POST /api/payments/create-order
 *
 * Creates a real Razorpay order using the server-side SDK.
 * Includes Geo-Fencing Compliance Gate and Commerce Readiness Gate.
 */

import Razorpay from 'razorpay';
import crypto from 'crypto';
import { COUNTRY_POLICY, PRODUCT_GEO_OVERRIDES } from '../../lib/commerceConfig.js';
import { checkHealth as checkSmtpHealth } from '../../lib/emailService.js';
import { checkHealth as checkPassportHealth, getProductMetadata } from '../../lib/passportEngine.js';
import { getDB } from '../../lib/db.js';

// ── Product catalogue (amounts in paise = INR × 100) ──────────────────────
const PRODUCTS = {
  zayvora_os:   { amount: 171700, name: 'Zayvora OS — Reasoning IDE',        currency: 'INR' },
  daxini_stack: { amount: 39900,  name: 'Daxini Stack — PDF/ePub',           currency: 'INR' },
  forge_access: { amount: 89900,  name: 'LogicHub Forge Access',             currency: 'INR' },
  scaffold:     { amount: 14900,  name: 'Production Scaffold',               currency: 'INR' },
  arch_audit:   { amount: 499900, name: 'Architecture Audit — Hanuman.Solutions', currency: 'INR' },
  test_product: { amount: 100,    name: 'Validation Product',               currency: 'INR' },
  digital_architect: { amount: 1244100, name: 'Sovereign Digital Architect Bundle', currency: 'INR' },
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

async function logWaitlist(email, product_id, reason) {
  try {
    if (!email) return;
    const db = await getDB();
    await db.run(
      `INSERT INTO events (type, payload) VALUES (?, ?)`,
      ['waitlist_due_to_outage', JSON.stringify({ email, product_id, reason, ts: new Date().toISOString() })]
    );
  } catch (e) {
    console.error("[Waitlist] Failed to log waitlist event:", e);
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

  // ── Parse body ──────────────────────────────────────────────────────────
  const { product_id, email, timezone, locale } = req.body || {};

  // ── 0. Payment Kill Switch ──────────────────────────────────────────────
  if (process.env.ACCEPT_PAYMENTS === 'OFF') {
    await logWaitlist(email, product_id, 'kill_switch');
    return res.status(503).json({ error: 'Purchases are temporarily unavailable. We are performing system maintenance. We will send an update to your email when payments return.' });
  }

  if (!product_id) {
    return res.status(400).json({ error: 'product_id is required' });
  }

  const product = PRODUCTS[product_id];
  if (!product) {
    return res.status(400).json({ error: `Unknown product: ${product_id}` });
  }

  // ── 1. Geo-Fencing & Compliance Gate ─────────────────────────────────────
  const country = req.headers['x-vercel-ip-country'] || 'UNKNOWN';
  console.log(`[Geo-Fence] Order initiated: ${product_id} from ${country} | TZ: ${timezone} | Locale: ${locale}`);

  // Product specific overrides or default policy
  const policy = PRODUCT_GEO_OVERRIDES[product_id] || COUNTRY_POLICY;
  
  if (policy.BLOCKED && policy.BLOCKED.includes(country)) {
    console.error(`[Geo-Fence] BLOCKED transaction from ${country}`);
    return res.status(403).json({ error: 'Purchases are currently unavailable in your region.', code: 'GEO_BLOCKED' });
  }

  if (policy.ALLOWED && !policy.ALLOWED.includes(country)) {
    console.warn(`[Geo-Fence] RESTRICTED transaction from ${country} (Not in allowed list)`);
    // For now we block them, returning a manual review message
    return res.status(403).json({ error: 'Manual Review Required. Your region requires compliance verification.', code: 'GEO_RESTRICTED' });
  }

  // ── 2. Commerce Readiness Engine ─────────────────────────────────────────
  // Auth Check
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  const verification = verifyJWT(token);

  if (!verification.valid) {
    return res.status(401).json({ error: 'Unauthorized. Passport authentication required.' });
  }
  const userId = verification.payload.userId;
  const userEmail = email || verification.payload.email;

  // Passport Check (DB Health)
  const isPassportHealthy = await checkPassportHealth();
  if (!isPassportHealthy) {
    console.error('[Readiness] Passport DB is offline.');
    await logWaitlist(userEmail, product_id, 'db_offline');
    return res.status(503).json({ error: 'Purchases are temporarily unavailable. We are updating delivery infrastructure. We will send an update to your email when payments return.' });
  }

  // SMTP Check
  const isSmtpHealthy = await checkSmtpHealth();
  if (!isSmtpHealthy) {
    console.error('[Readiness] SMTP is offline. Cannot deliver emails.');
    await logWaitlist(userEmail, product_id, 'smtp_offline');
    return res.status(503).json({ error: 'Purchases are temporarily unavailable. We are updating delivery infrastructure. We will send an update to your email when payments return.' });
  }

  // Product Check (Verify deliverable exists)
  const meta = getProductMetadata(product_id);
  if (!meta || !meta.downloadLink) {
    console.error('[Readiness] Product deliverable missing for:', product_id);
    await logWaitlist(userEmail, product_id, 'missing_deliverable');
    return res.status(503).json({ error: 'Purchases are temporarily unavailable. We are updating delivery infrastructure. We will send an update to your email when payments return.' });
  }

  // ── 3. Validate keys are present ─────────────────────────────────────────
  const KEY_ID     = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  const region     = req.headers['x-pricing-region'] || 'GLOBAL';

  if (!KEY_ID || !KEY_SECRET) {
    console.log('[Razorpay Sandbox] Missing API keys. Initializing simulated sandbox gateway.');
    const db = await getDB();
    if (region === 'IN') {
      const subId = `sub_mock_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      await db.run(
        `UPDATE passports SET razorpay_subscription_id = ?, billing_status = ? WHERE email = ?`,
        [subId, 'PENDING', userEmail]
      );
      return res.status(200).json({
        type: 'subscription',
        subscription_id: subId,
        amount: 9900,
        currency: 'INR',
        product_name: product.name,
        key_id: 'rzp_test_mockkey123',
        sandbox: true
      });
    } else {
      const ordId = `order_mock_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      await db.run(
        `UPDATE passports SET order_id = ?, billing_status = ? WHERE email = ?`,
        [ordId, 'PENDING', userEmail]
      );
      return res.status(200).json({
        type: 'order',
        order_id: ordId,
        amount: 1200,
        currency: 'USD',
        product_name: product.name,
        key_id: 'rzp_test_mockkey123',
        sandbox: true
      });
    }
  }

  // ── 4. Create Order / Subscription ──────────────────────────────────────────
  try {
    const razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
    const db = await getDB();

    if (region === 'IN') {
      const planId = process.env.RAZORPAY_PLAN_ID_INR || 'plan_INR_mock';
      const subscription = await razorpay.subscriptions.create({
        plan_id: planId,
        customer_notify: 1,
        total_count: 120, // 10 years
        notes: {
          product_id,
          product_name: product.name,
          customer_email: userEmail || '',
          user_id: userId,
          country: country,
          timezone: timezone || 'unknown',
          locale: locale || 'unknown'
        }
      });

      await db.run(
        `UPDATE passports SET razorpay_subscription_id = ?, billing_status = ? WHERE email = ?`,
        [subscription.id, 'PENDING', userEmail]
      );

      console.log('[Telemetry] subscription_created:', {
        subscription_id: subscription.id,
        product_id: product_id,
        user_id: userId,
        country
      });

      return res.status(200).json({
        type: 'subscription',
        subscription_id: subscription.id,
        amount: 9900,
        currency: 'INR',
        product_name: product.name,
        key_id: KEY_ID
      });
    } else {
      const order = await razorpay.orders.create({
        amount: 1200, // $12.00
        currency: 'USD',
        receipt: `rcpt_${product_id}_${crypto.randomBytes(4).toString('hex')}`,
        notes: {
          product_id,
          product_name: product.name,
          customer_email: userEmail || '',
          user_id: userId,
          country: country,
          timezone: timezone || 'unknown',
          locale: locale || 'unknown'
        }
      });

      await db.run(
        `UPDATE passports SET order_id = ?, billing_status = ? WHERE email = ?`,
        [order.id, 'PENDING', userEmail]
      );

      console.log('[Telemetry] order_created:', {
        order_id: order.id,
        product_id: product_id,
        user_id: userId,
        country
      });

      return res.status(200).json({
        type: 'order',
        order_id: order.id,
        amount: 1200,
        currency: 'USD',
        product_name: product.name,
        key_id: KEY_ID
      });
    }

  } catch (err) {
    const errorRef = `ORD-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    console.error(`[Razorpay] Payment creation failed [Ref: ${errorRef}]:`, err);
    return res.status(500).json({ 
      error: 'Payment system unavailable.', 
      reference: errorRef, 
      code: 'PAYMENT_GATEWAY_ERROR' 
    });
  }
}

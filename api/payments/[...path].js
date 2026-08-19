import crypto from 'crypto';
import Razorpay from 'razorpay';
import { COUNTRY_POLICY, PRODUCT_GEO_OVERRIDES } from '../../lib/commerceConfig.js';
import { checkHealth as checkSmtpHealth } from '../../lib/emailService.js';
import { checkHealth as checkPassportHealth, getProductMetadata } from '../../lib/passportEngine.js';
import { getDB } from '../../lib/db.js';
import { initDB } from '../../lib/initDb.js';
import { logWaitlist, WAITLIST_REASONS } from '../../lib/waitlist.js';

const ALLOWED = ['https://aporaksha.com', 'https://www.aporaksha.com', 'https://viadecide.com', 'https://www.viadecide.com'];

function cors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
}

function route(req) {
  const url = req.url || '';
  const base = '/api/payments/';
  const idx = url.indexOf(base);
  if (idx === -1) return '';
  return url.slice(idx + base.length).split('?')[0].replace(/\/+$/, '');
}

const PRODUCTS = {
  zayvora_os:   { amount: 171700, name: 'Zayvora OS — Reasoning IDE',        currency: 'INR' },
  daxini_stack: { amount: 39900,  name: 'Daxini Stack — PDF/ePub',           currency: 'INR' },
  forge_access: { amount: 89900,  name: 'LogicHub Forge Access',             currency: 'INR' },
  scaffold:     { amount: 14900,  name: 'Production Scaffold',               currency: 'INR' },
  arch_audit:   { amount: 499900, name: 'Architecture Audit — Hanuman.Solutions', currency: 'INR' },
  test_product: { amount: 100,    name: 'Validation Product',               currency: 'INR' },
  digital_architect: { amount: 1244100, name: 'Sovereign Digital Architect Bundle', currency: 'INR' },
  smarttag_lite_single: { amount: 39900, name: 'SmartTag Lite — Single',     currency: 'INR' },
  smarttag_lite_bulk:   { amount: 89900, name: 'SmartTag Lite — Bulk (5-pack)', currency: 'INR' },
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

async function handleConfig(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  return res.json({ keyId: process.env.RAZORPAY_KEY_ID || '' });
}

async function handleCreateOrder(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { product_id, email, timezone, locale } = req.body || {};

  if (process.env.ACCEPT_PAYMENTS === 'OFF') {
    await logWaitlist(email, product_id, WAITLIST_REASONS.OUTAGE);
    return res.status(503).json({ error: 'Purchases are temporarily unavailable. We are performing system maintenance. We will send an update to your email when payments return.' });
  }

  if (!product_id) return res.status(400).json({ error: 'product_id is required' });

  const product = PRODUCTS[product_id];
  if (!product) return res.status(400).json({ error: `Unknown product: ${product_id}` });

  const country = req.headers['x-vercel-ip-country'] || 'UNKNOWN';
  console.log(`[Geo-Fence] Order initiated: ${product_id} from ${country} | TZ: ${timezone} | Locale: ${locale}`);

  const policy = PRODUCT_GEO_OVERRIDES[product_id] || COUNTRY_POLICY;

  if (policy.BLOCKED && policy.BLOCKED.includes(country)) {
    console.error(`[Geo-Fence] BLOCKED transaction from ${country}`);
    return res.status(403).json({ error: 'Purchases are currently unavailable in your region.', code: 'GEO_BLOCKED' });
  }

  if (policy.ALLOWED && !policy.ALLOWED.includes(country)) {
    console.warn(`[Geo-Fence] RESTRICTED transaction from ${country} (Not in allowed list)`);
    return res.status(403).json({ error: 'Manual Review Required. Your region requires compliance verification.', code: 'GEO_RESTRICTED' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  const verification = verifyJWT(token);

  const userId = verification.valid ? verification.payload.userId : 'guest';
  const userEmail = verification.valid ? (email || verification.payload.email) : (email || null);

  const isPassportHealthy = await checkPassportHealth();
  if (!isPassportHealthy) {
    console.error('[Readiness] Passport DB is offline.');
    await logWaitlist(userEmail, product_id, WAITLIST_REASONS.OUTAGE);
    return res.status(503).json({ error: 'Purchases are temporarily unavailable. We are updating delivery infrastructure. We will send an update to your email when payments return.' });
  }

  const isSmtpHealthy = await checkSmtpHealth();
  if (!isSmtpHealthy) {
    console.error('[Readiness] SMTP is offline. Cannot deliver emails.');
    await logWaitlist(userEmail, product_id, WAITLIST_REASONS.OUTAGE);
    return res.status(503).json({ error: 'Purchases are temporarily unavailable. We are updating delivery infrastructure. We will send an update to your email when payments return.' });
  }

  const meta = getProductMetadata(product_id);
  if (!meta || !meta.downloadLink || meta.deliverable === false) {
    const notBuiltYet = meta && meta.deliverable === false;
    console.error(
      notBuiltYet
        ? '[Waitlist] Interest in an unreleased product:'
        : '[Readiness] Product deliverable missing for:',
      product_id
    );
    await logWaitlist(
      userEmail,
      product_id,
      notBuiltYet ? WAITLIST_REASONS.INTEREST : WAITLIST_REASONS.OUTAGE
    );
    return res.status(503).json({
      error: notBuiltYet
        ? 'This is not released yet. We have noted your interest and will email you the moment it ships.'
        : 'Purchases are temporarily unavailable. We are updating delivery infrastructure. We will send an update to your email when payments return.',
      code: notBuiltYet ? 'NOT_RELEASED' : 'DELIVERY_UNAVAILABLE'
    });
  }

  const KEY_ID     = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  const region     = req.headers['x-pricing-region'] || 'GLOBAL';

  if (!KEY_ID || !KEY_SECRET) {
    console.log('[Razorpay Sandbox] Missing API keys. Initializing simulated sandbox gateway.');
    const db = await getDB();
    if (region === 'IN') {
      const subId = `sub_mock_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      if (userEmail) {
        await db.run(
          `UPDATE passports SET razorpay_subscription_id = ?, billing_status = ? WHERE email = ?`,
          [subId, 'PENDING', userEmail]
        );
      }
      await db.run(
        `INSERT INTO orders (id, amount, currency, status, email, user_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [subId, product.amount, 'INR', 'awaiting_payment', userEmail || '', userId]
      );
      return res.status(200).json({
        type: 'subscription',
        subscription_id: subId,
        amount: product.amount,
        currency: 'INR',
        product_name: product.name,
        key_id: 'rzp_test_mockkey123',
        sandbox: true
      });
    } else {
      const ordId = `order_mock_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      if (userEmail) {
        await db.run(
          `UPDATE passports SET order_id = ?, billing_status = ? WHERE email = ?`,
          [ordId, 'PENDING', userEmail]
        );
      }
      const usdAmount = Math.round(product.amount / 83);
      await db.run(
        `INSERT INTO orders (id, amount, currency, status, email, user_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [ordId, usdAmount, 'USD', 'awaiting_payment', userEmail || '', userId]
      );
      return res.status(200).json({
        type: 'order',
        order_id: ordId,
        amount: usdAmount,
        currency: 'USD',
        product_name: product.name,
        key_id: 'rzp_test_mockkey123',
        sandbox: true
      });
    }
  }

  try {
    const razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
    const db = await getDB();

    if (region === 'IN') {
      const planId = process.env.RAZORPAY_PLAN_ID_INR || 'plan_INR_mock';
      const subscription = await razorpay.subscriptions.create({
        plan_id: planId,
        customer_notify: 1,
        total_count: 120,
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

      if (userEmail) {
        await db.run(
          `UPDATE passports SET razorpay_subscription_id = ?, billing_status = ? WHERE email = ?`,
          [subscription.id, 'PENDING', userEmail]
        );
      }
      await db.run(
        `INSERT INTO orders (id, amount, currency, status, email, user_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [subscription.id, product.amount, 'INR', 'awaiting_payment', userEmail || '', userId]
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
        amount: product.amount,
        currency: 'INR',
        product_name: product.name,
        key_id: KEY_ID
      });
    } else {
      const usdAmount = Math.round(product.amount / 83);
      const order = await razorpay.orders.create({
        amount: usdAmount,
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

      if (userEmail) {
        await db.run(
          `UPDATE passports SET order_id = ?, billing_status = ? WHERE email = ?`,
          [order.id, 'PENDING', userEmail]
        );
      }
      await db.run(
        `INSERT INTO orders (id, amount, currency, status, email, user_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [order.id, usdAmount, 'USD', 'awaiting_payment', userEmail || '', userId]
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
        amount: usdAmount,
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

async function handleVerify(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { razorpay_order_id, razorpay_subscription_id, razorpay_payment_id, razorpay_signature, product_id, email } = req.body || {};

  if ((!razorpay_order_id && !razorpay_subscription_id) || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  const verification = verifyJWT(token);

  if (!verification.valid) {
    return res.status(401).json({ error: 'Unauthorized. Passport authentication required.' });
  }
  const userId = verification.payload.userId;

  const isMock = (razorpay_order_id && razorpay_order_id.startsWith('order_mock_')) ||
                 (razorpay_subscription_id && razorpay_subscription_id.startsWith('sub_mock_'));

  if (isMock && process.env.NODE_ENV === 'development') {
    const id = razorpay_order_id || razorpay_subscription_id;
    console.log('[Razorpay Sandbox] Verifying mock payment signature successfully');
    try {
      await initDB();
      const db = await getDB();
      await db.run(
        `INSERT INTO orders (id, amount, currency, status, payment_id, verified, email, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, razorpay_subscription_id ? 9900 : 1200, razorpay_subscription_id ? 'INR' : 'USD', 'paid', razorpay_payment_id, 1, email || verification.payload.email, userId]
      );

      if (razorpay_subscription_id) {
        await db.run(
          `UPDATE passports SET billing_status = ? WHERE razorpay_subscription_id = ?`,
          ['ACTIVE', razorpay_subscription_id]
        );
      } else {
        await db.run(
          `UPDATE passports SET billing_status = ? WHERE order_id = ?`,
          ['ACTIVE', razorpay_order_id]
        );
      }

      await db.run(
        `INSERT INTO events (type, payload) VALUES (?, ?)`,
        ['payment_completed', JSON.stringify({
          razorpay_order_id: razorpay_order_id || null,
          razorpay_subscription_id: razorpay_subscription_id || null,
          razorpay_payment_id,
          product_id,
          user_id: userId
        })]
      );
    } catch (dbErr) {
      console.error("[Razorpay Sandbox] Failed to save order to DB:", dbErr);
    }

    return res.status(200).json({
      success:    true,
      payment_id: razorpay_payment_id,
      order_id:   razorpay_order_id || null,
      subscription_id: razorpay_subscription_id || null,
      product_id,
      message:    'Payment verified (Sandbox). Access provisioned successfully.',
    });
  }

  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  if (!KEY_SECRET) {
    console.error('[Razorpay] RAZORPAY_KEY_SECRET not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  let body = '';
  if (razorpay_subscription_id) {
    body = `${razorpay_payment_id}|${razorpay_subscription_id}`;
  } else {
    body = `${razorpay_order_id}|${razorpay_payment_id}`;
  }

  const expectedSig = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(body)
    .digest('hex');

  if (expectedSig !== razorpay_signature) {
    console.warn('[Razorpay] Signature mismatch — possible tamper attempt', {
      razorpay_order_id,
      razorpay_subscription_id,
      razorpay_payment_id,
    });
    return res.status(400).json({ success: false, error: 'Payment signature invalid' });
  }

  try {
    await initDB();
    const db = await getDB();
    const id = razorpay_order_id || razorpay_subscription_id;
    await db.run(
      `INSERT INTO orders (id, amount, currency, status, payment_id, verified, email, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, razorpay_subscription_id ? 9900 : 1200, razorpay_subscription_id ? 'INR' : 'USD', 'paid', razorpay_payment_id, 1, email || verification.payload.email, userId]
    );

    if (razorpay_subscription_id) {
      await db.run(
        `UPDATE passports SET billing_status = ? WHERE razorpay_subscription_id = ?`,
        ['ACTIVE', razorpay_subscription_id]
      );
    } else {
      await db.run(
        `UPDATE passports SET billing_status = ? WHERE order_id = ?`,
        ['ACTIVE', razorpay_order_id]
      );
    }

    await db.run(
      `INSERT INTO events (type, payload) VALUES (?, ?)`,
      ['payment_completed', JSON.stringify({
        razorpay_order_id: razorpay_order_id || null,
        razorpay_subscription_id: razorpay_subscription_id || null,
        razorpay_payment_id,
        product_id,
        user_id: userId
      })]
    );
  } catch (dbErr) {
    console.error("[Razorpay] Failed to save order to DB:", dbErr);
  }

  console.log('[Razorpay] Payment verified and linked to user', {
    order_id:   razorpay_order_id || null,
    subscription_id: razorpay_subscription_id || null,
    payment_id: razorpay_payment_id,
    product_id,
    user_id:    userId,
    email:      email || verification.payload.email,
    verified_at: new Date().toISOString(),
  });

  return res.status(200).json({
    success:    true,
    payment_id: razorpay_payment_id,
    order_id:   razorpay_order_id || null,
    subscription_id: razorpay_subscription_id || null,
    product_id,
    message:    'Payment verified. Access provisioned successfully.',
  });
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const path = route(req);

    if (path === 'config') return handleConfig(req, res);
    if (path === 'create-order') return handleCreateOrder(req, res);
    if (path === 'verify') return handleVerify(req, res);

    return res.status(404).json({ error: 'not_found' });
  } catch (err) {
    console.error('Payments error:', err.message);
    return res.status(500).json({ error: 'internal_error' });
  }
}

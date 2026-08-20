import crypto from 'crypto';
import * as membership from '../../lib/domain/membership.js';
import * as subscriptions from '../../lib/domain/razorpaySubscriptions.js';
import * as financialLedger from '../../lib/domain/financialLedger.js';
import { requireIdentity } from '../../lib/authenticatedIdentity.js';
import * as webhookDedup from '../../lib/webhookIdempotency.js';

export const config = { api: { bodyParser: false } };

const ALLOWED = [
  'https://aporaksha.com', 'https://www.aporaksha.com',
  'https://viadecide.com', 'https://www.viadecide.com',
];

function cors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
}

function route(req) {
  const url = req.url || '';
  const base = '/api/membership/';
  const idx = url.indexOf(base);
  if (idx === -1) return '';
  return url.slice(idx + base.length).split('?')[0].replace(/\/+$/, '');
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleStatus(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const email = requireIdentity(req).email;

  const m = await membership.getMembership(email);
  if (!m) return res.json({ active: false, membership: null });

  const active = membership.isMembershipActive(m);
  return res.json({ active, membership: m });
}

async function handleSubscribe(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const email = requireIdentity(req).email;

  const existing = await membership.getMembership(email);
  if (existing && membership.isMembershipActive(existing)) {
    return res.json({
      already_active: true,
      paidThrough: existing.paidThrough,
    });
  }

  try {
    const sub = await subscriptions.createSubscription(email);
    return res.json({
      subscriptionId: sub.subscriptionId,
      shortUrl: sub.shortUrl,
      status: sub.status,
    });
  } catch (err) {
    if (err.message === 'razorpay_not_configured') {
      return res.status(500).json({ error: 'payment_not_configured' });
    }
    throw err;
  }
}

async function handleCancel(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const email = requireIdentity(req).email;

  const m = await membership.getMembership(email);
  if (!m) return res.status(404).json({ error: 'no_membership' });

  if (m.razorpaySubscriptionId) {
    try {
      await subscriptions.cancelSubscription(m.razorpaySubscriptionId);
    } catch (_) {
      // subscription may already be cancelled on Razorpay side
    }
  }

  return res.json({
    status: 'cancellation_requested',
    paidThrough: m.paidThrough,
    message: 'Membership remains active until paid-through date',
  });
}

async function handleAccess(req, res, offerId) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const email = requireIdentity(req).email;

  const m = await membership.getMembership(email);
  const isMember = m ? membership.isMembershipActive(m) : false;
  const hasPurchased = await membership.hasEntitlement(email, offerId);

  return res.json({
    isMember,
    hasPurchased,
    policies: {
      public: true,
      membership: isMember,
      purchase_only: hasPurchased,
      membership_or_purchase: isMember || hasPurchased,
    },
  });
}

async function handleWebhook(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const signature = req.headers['x-razorpay-signature'];
  if (!signature) return res.status(400).json({ error: 'missing_signature' });

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(500).json({ error: 'webhook_not_configured' });

  const rawBody = req.rawBody || '';
  const expectedHex = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  if (typeof signature !== 'string' || signature.length !== expectedHex.length ||
      !crypto.timingSafeEqual(Buffer.from(expectedHex, 'utf8'), Buffer.from(signature, 'utf8'))) {
    return res.status(400).json({ error: 'invalid_signature' });
  }

  const eventId = req.headers['x-razorpay-event-id'];
  if (await webhookDedup.isProcessed(eventId)) {
    return res.status(200).json({ status: 'already_processed' });
  }

  const event = req.body;
  const sub = event.payload?.subscription?.entity;
  if (!sub) return res.status(200).json({ status: 'ignored' });

  const buyerEmail = sub.notes?.buyerEmail;
  if (!buyerEmail) return res.status(200).json({ status: 'ignored_no_email' });

  if (event.event === 'subscription.activated' || event.event === 'subscription.charged') {
    const currentEnd = sub.current_end;
    const paidThrough = currentEnd
      ? new Date(currentEnd * 1000).toISOString().slice(0, 10)
      : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const existing = await membership.getMembership(buyerEmail);
    if (existing) {
      await membership.extendMembership(buyerEmail, paidThrough);
    } else {
      await membership.createMembership(buyerEmail, paidThrough, sub.id);
    }

    if (event.event === 'subscription.charged') {
      const payment = event.payload?.payment?.entity;
      if (!payment?.id) return res.status(200).json({ status: 'ignored_no_payment' });
      await financialLedger.recordMembership({
        buyerEmail,
        amountMinor: membership.PLAN_AMOUNT_MINOR,
        currency: membership.PLAN_CURRENCY,
        providerTxnId: payment.id,
        description: 'Monthly membership charge',
      });
    }
  }

  if (event.event === 'subscription.cancelled' || event.event === 'subscription.completed') {
    await membership.cancelMembership(buyerEmail);
  }

  await webhookDedup.markProcessed(eventId, 'razorpay_membership');
  return res.status(200).json({ status: 'ok' });
}

async function handleEntitlements(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const email = requireIdentity(req).email;

  const entitlements = await membership.getBuyerEntitlements(email);
  return res.json({ entitlements });
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const rawBody = await readRawBody(req);
  req.rawBody = rawBody;
  try { req.body = rawBody ? JSON.parse(rawBody) : {}; } catch { req.body = {}; }

  try {
    const path = route(req);

    if (path === 'status') return await handleStatus(req, res);
    if (path === 'subscribe') return await handleSubscribe(req, res);
    if (path === 'cancel') return await handleCancel(req, res);
    if (path === 'entitlements') return await handleEntitlements(req, res);
    if (path === 'webhook') return await handleWebhook(req, res);

    const accessMatch = path.match(/^access\/([a-zA-Z0-9_-]+)$/);
    if (accessMatch) return await handleAccess(req, res, accessMatch[1]);

    return res.status(404).json({ error: 'not_found' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Membership API error:', err.message);
    return res.status(500).json({ error: 'internal_error' });
  }
}

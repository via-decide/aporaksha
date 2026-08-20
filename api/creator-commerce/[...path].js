import crypto from 'crypto';
import Razorpay from 'razorpay';
import * as store from '../../lib/domain/creatorStore.js';
import { validateOrderInput, isValidHandle } from '../../lib/domain/types.js';
import * as ledger from '../../lib/creatorLedger.js';
import * as financialLedger from '../../lib/domain/financialLedger.js';
import { grantEntitlement } from '../../lib/domain/membership.js';
import { requireAuth } from '../../lib/auth.js';
import * as webhookDedup from '../../lib/webhookIdempotency.js';

export const config = { api: { bodyParser: false } };

const ALLOWED = [
  'https://aporaksha.com', 'https://www.aporaksha.com',
  'https://viadecide.com', 'https://www.viadecide.com',
];

function cors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
}

function route(req) {
  const url = req.url || '';
  const base = '/api/creator-commerce/';
  const idx = url.indexOf(base);
  if (idx === -1) return '';
  return url.slice(idx + base.length).split('?')[0].replace(/\/+$/, '');
}

function parseQuery(req) {
  const url = req.url || '';
  const q = url.indexOf('?');
  if (q === -1) return {};
  return Object.fromEntries(new URLSearchParams(url.slice(q + 1)));
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function verifyCreatorOwner(req, handle) {
  const identity = requireAuth(req);
  if (!identity) return false;
  const creator = await store.getCreator(handle);
  if (!creator || !creator.contactEmail) return false;
  return creator.contactEmail.toLowerCase() === identity.email.toLowerCase();
}

async function fulfillAfterPayment(order, offer) {
  if (offer.offerType === 'digital_file') {
    await grantEntitlement(order.buyerEmail, order.offerId, order.creatorSlug, order.orderId);
  } else {
    const existingBooking = await ledger.getBookingByOrderId(order.orderId);
    if (!existingBooking) {
      await ledger.createBooking({
        bookingId: crypto.randomUUID(),
        orderId: order.orderId,
        creatorSlug: order.creatorSlug,
        offerId: order.offerId,
        offerTitle: order.offerTitle,
        buyerName: order.buyerName,
        buyerEmail: order.buyerEmail,
        scheduledDate: order.selectedDate || '',
        scheduledTime: order.selectedTime || '',
        status: 'confirmed',
      });
    }
  }
}

// ── Handlers ─────────────────────────────────────────────────────────

async function handleConfig(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) return res.status(500).json({ error: 'razorpay_not_configured' });
  return res.json({ razorpayKeyId: keyId });
}

async function handleReserveHandle(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { handle, email } = req.body || {};
  if (!handle || !email) return res.status(400).json({ error: 'handle and email required' });
  const result = await store.reserveHandle(handle, email);
  if (!result.ok) return res.status(409).json({ error: result.error });
  return res.status(200).json(result);
}

async function handleCreators(req, res) {
  if (req.method === 'POST') {
    const identity = requireAuth(req);
    if (!identity) return res.status(401).json({ error: 'authentication_required' });
    if (req.body.contactEmail && req.body.contactEmail.toLowerCase() !== identity.email.toLowerCase()) {
      return res.status(403).json({ error: 'email_mismatch' });
    }
    req.body.contactEmail = identity.email;
    const result = await store.createCreator(req.body);
    if (!result.ok) return res.status(400).json({ error: 'validation_error', details: result.errors });
    return res.status(201).json({ handle: result.handle });
  }
  if (req.method === 'GET') {
    const query = parseQuery(req);
    const creators = await store.listCreators(query.status);
    return res.json({ creators });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleCreatorProfile(req, res, handle) {
  if (!isValidHandle(handle)) return res.status(400).json({ error: 'invalid handle' });

  if (req.method === 'GET') {
    const creator = await store.getCreator(handle);
    if (!creator) return res.status(404).json({ error: 'creator_not_found' });
    const offers = await store.listOffers(handle, false);
    return res.json({
      handle: creator.handle,
      displayName: creator.displayName,
      bio: creator.bio,
      avatarUrl: creator.avatarUrl,
      status: creator.status,
      paymentReady: creator.paymentReady,
      offers,
    });
  }

  if (req.method === 'PUT') {
    const isOwner = await verifyCreatorOwner(req, handle);
    if (!isOwner) return res.status(403).json({ error: 'not_creator_owner' });
    const result = await store.updateCreator(handle, req.body);
    if (!result.ok) return res.status(400).json({ error: 'update_failed' });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleOffers(req, res, handle) {
  if (!isValidHandle(handle)) return res.status(400).json({ error: 'invalid handle' });

  if (req.method === 'GET') {
    const query = parseQuery(req);
    const offers = await store.listOffers(handle, query.all === 'true');
    return res.json({ offers });
  }
  if (req.method === 'POST') {
    const isOwner = await verifyCreatorOwner(req, handle);
    if (!isOwner) return res.status(403).json({ error: 'not_creator_owner' });
    const result = await store.createOffer(handle, req.body);
    if (!result.ok) return res.status(400).json({ error: 'validation_error', details: result.errors });
    return res.status(201).json({ offerId: result.offerId });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleOfferById(req, res, handle, offerId) {
  if (req.method === 'GET') {
    const offer = await store.getOffer(offerId);
    if (!offer || offer.creatorHandle !== handle) return res.status(404).json({ error: 'offer_not_found' });
    return res.json(offer);
  }
  if (req.method === 'PUT') {
    const isOwner = await verifyCreatorOwner(req, handle);
    if (!isOwner) return res.status(403).json({ error: 'not_creator_owner' });
    const result = await store.updateOffer(offerId, handle, req.body);
    if (!result.ok) return res.status(400).json({ error: 'update_failed', details: result.errors });
    return res.json({ ok: true });
  }
  if (req.method === 'DELETE') {
    const isOwner = await verifyCreatorOwner(req, handle);
    if (!isOwner) return res.status(403).json({ error: 'not_creator_owner' });
    await store.deleteOffer(offerId, handle);
    return res.json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleOrders(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const errors = validateOrderInput(req.body);
  if (errors.length) return res.status(400).json({ error: 'validation_error', details: errors });

  const { creatorHandle, offerId, selectedDate, selectedTime, buyerName, buyerEmail, notes, idempotencyKey } = req.body;

  const creator = await store.getCreator(creatorHandle);
  if (!creator) return res.status(404).json({ error: 'creator_not_found' });

  const offer = await store.getOffer(offerId);
  if (!offer || offer.creatorHandle !== creatorHandle) return res.status(404).json({ error: 'offer_not_found' });
  if (offer.status !== 'active') return res.status(400).json({ error: 'offer_not_active' });

  await ledger.ensureTables();
  const existing = await ledger.findByIdempotencyKey(idempotencyKey);
  if (existing) {
    return res.status(200).json({
      orderId: existing.order_id,
      razorpayOrderId: existing.razorpay_order_id || null,
      amountMinor: offer.amountMinor,
      currency: offer.currency,
      status: existing.status,
    });
  }

  const orderId = crypto.randomUUID();
  const isFree = offer.amountMinor === 0;

  let razorpayOrderId;
  if (!isFree) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return res.status(500).json({ error: 'payment_not_configured' });

    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const rpOrder = await rzp.orders.create({
      amount: offer.amountMinor,
      currency: offer.currency,
      receipt: orderId,
      notes: { creatorHandle, offerId, buyerEmail },
    });
    razorpayOrderId = rpOrder.id;
  }

  await ledger.createOrder({
    orderId,
    creatorSlug: creatorHandle,
    offerId,
    offerTitle: offer.title,
    amount: offer.amountMinor,
    currency: offer.currency,
    buyerName,
    buyerEmail,
    selectedDate: selectedDate || '',
    selectedTime: selectedTime || '',
    status: isFree ? 'free_confirmed' : 'created',
    razorpayOrderId,
    notes,
    idempotencyKey,
  });

  if (isFree) {
    const freeOrder = { orderId, creatorSlug: creatorHandle, offerId, offerTitle: offer.title,
      buyerName, buyerEmail, selectedDate: selectedDate || '', selectedTime: selectedTime || '' };
    await fulfillAfterPayment(freeOrder, offer);
  }

  return res.status(201).json({
    orderId,
    razorpayOrderId: razorpayOrderId || null,
    amountMinor: offer.amountMinor,
    currency: offer.currency,
    status: isFree ? 'free_confirmed' : 'created',
    free: isFree,
  });
}

async function handleVerify(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
  if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return res.status(400).json({ error: 'validation_error', details: 'All fields required' });
  }

  await ledger.ensureTables();
  const order = await ledger.getOrder(orderId);
  if (!order) return res.status(404).json({ error: 'order_not_found' });
  if (order.status === 'paid') return res.status(200).json({ status: 'already_verified', orderId });
  if (order.razorpayOrderId !== razorpayOrderId) return res.status(400).json({ error: 'order_mismatch' });

  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return res.status(500).json({ error: 'payment_not_configured' });

  const body = razorpayOrderId + '|' + razorpayPaymentId;
  const expectedBuf = Buffer.from(
    crypto.createHmac('sha256', secret).update(body).digest('hex'), 'utf8'
  );
  const receivedBuf = Buffer.from(razorpaySignature, 'utf8');

  if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
    await ledger.updateOrderStatus(orderId, 'payment_failed');
    return res.status(400).json({ error: 'signature_invalid' });
  }

  await ledger.updateOrderStatus(orderId, 'paid', { razorpayPaymentId });

  await financialLedger.recordSale({
    orderId: order.orderId,
    creatorHandle: order.creatorSlug,
    buyerEmail: order.buyerEmail,
    amountMinor: order.amount,
    currency: order.currency,
    providerTxnId: razorpayPaymentId,
  });

  const offer = await store.getOffer(order.offerId);
  if (offer) {
    await fulfillAfterPayment(order, offer);
  }

  return res.status(200).json({ status: 'verified', orderId });
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
  if (event.event === 'payment.captured') {
    const payment = event.payload?.payment?.entity;
    if (!payment) return res.status(200).json({ status: 'ignored' });

    const receipt = payment.notes?.receipt || payment.receipt;
    if (receipt) {
      await ledger.ensureTables();
      const order = await ledger.getOrder(receipt);
      if (order && order.status === 'created') {
        await ledger.updateOrderStatus(order.orderId, 'paid', { razorpayPaymentId: payment.id });

        await financialLedger.recordSale({
          orderId: order.orderId,
          creatorHandle: order.creatorSlug,
          buyerEmail: order.buyerEmail,
          amountMinor: order.amount,
          currency: order.currency,
          providerTxnId: payment.id,
        });

        const offer = await store.getOffer(order.offerId);
        if (offer) {
          await fulfillAfterPayment(order, offer);
        }
      }
    }
  }

  await webhookDedup.markProcessed(eventId, 'razorpay_creator');
  return res.status(200).json({ status: 'ok' });
}

async function handleFulfillment(req, res, orderId) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  await ledger.ensureTables();
  const order = await ledger.getOrder(orderId);
  if (!order) return res.status(404).json({ error: 'order_not_found' });

  if (order.status !== 'paid' && order.status !== 'free_confirmed' && order.status !== 'fulfilled') {
    return res.status(403).json({ error: 'payment_required' });
  }

  const offer = await store.getOffer(order.offerId);
  if (!offer) return res.status(404).json({ error: 'offer_not_found' });

  if (offer.offerType === 'digital_file') {
    if (!offer.fileUrl) return res.status(404).json({ error: 'file_not_uploaded' });
    if (order.status !== 'fulfilled') {
      await ledger.updateOrderStatus(orderId, 'fulfilled');
    }
    return res.json({
      type: 'digital_file',
      fileLabel: offer.fileLabel || offer.title,
      downloadUrl: offer.fileUrl,
      orderId,
    });
  }

  if (offer.offerType === 'session') {
    const booking = await ledger.getBookingByOrderId(orderId);
    return res.json({
      type: 'session',
      title: offer.title,
      scheduledDate: booking?.scheduled_date || order.selectedDate,
      scheduledTime: booking?.scheduled_time || order.selectedTime,
      orderId,
    });
  }

  return res.json({
    type: offer.offerType,
    title: offer.title,
    status: order.status,
    orderId,
  });
}

async function handleSeed(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    return res.status(403).json({ error: 'seed_disabled_in_production' });
  }
  const ashok = await store.seedAshokIfNeeded();
  const priya = await store.seedPriyaIfNeeded();
  return res.json({ seeded: { ashok, priya } });
}

// ── Router ───────────────────────────────────────────────────────────

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const rawBody = await readRawBody(req);
  req.rawBody = rawBody;
  try { req.body = rawBody ? JSON.parse(rawBody) : {}; } catch { req.body = {}; }

  try {
    const path = route(req);

    if (path === 'config') return handleConfig(req, res);
    if (path === 'reserve-handle') return handleReserveHandle(req, res);
    if (path === 'creators') return handleCreators(req, res);
    if (path === 'orders') return handleOrders(req, res);
    if (path === 'payments/verify') return handleVerify(req, res);
    if (path === 'payments/webhook') return handleWebhook(req, res);
    if (path === 'seed') return handleSeed(req, res);

    const fulfillMatch = path.match(/^fulfillment\/([a-zA-Z0-9-]+)$/);
    if (fulfillMatch) return handleFulfillment(req, res, fulfillMatch[1]);

    const creatorMatch = path.match(/^creators\/([a-z][a-z0-9_-]+)$/);
    if (creatorMatch) return handleCreatorProfile(req, res, creatorMatch[1]);

    const offersMatch = path.match(/^creators\/([a-z][a-z0-9_-]+)\/offers$/);
    if (offersMatch) return handleOffers(req, res, offersMatch[1]);

    const offerByIdMatch = path.match(/^creators\/([a-z][a-z0-9_-]+)\/offers\/([a-zA-Z0-9_-]+)$/);
    if (offerByIdMatch) return handleOfferById(req, res, offerByIdMatch[1], offerByIdMatch[2]);

    return res.status(404).json({ error: 'not_found' });
  } catch (err) {
    console.error('Creator commerce error:', err.message);
    return res.status(500).json({ error: 'internal_error' });
  }
}

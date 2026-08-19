import crypto from 'crypto';
import Razorpay from 'razorpay';
import { getCreator } from '../../lib/creatorCatalog.js';
import * as ledger from '../../lib/creatorLedger.js';

const ALLOWED = ['https://aporaksha.com', 'https://www.aporaksha.com', 'https://viadecide.com', 'https://www.viadecide.com'];

function cors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function route(req) {
  const url = req.url || '';
  const base = '/api/creator-commerce/';
  const idx = url.indexOf(base);
  if (idx === -1) return '';
  const rest = url.slice(idx + base.length).split('?')[0].replace(/\/+$/, '');
  return rest;
}

async function handleConfig(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) return res.status(500).json({ error: 'razorpay_not_configured' });
  return res.json({ razorpayKeyId: keyId });
}

function validateOrder(body) {
  const { creatorSlug, offerId, date, time, buyerName, buyerEmail, idempotencyKey } = body || {};
  const errors = [];
  if (!creatorSlug || typeof creatorSlug !== 'string') errors.push('creatorSlug required');
  if (!offerId || typeof offerId !== 'string') errors.push('offerId required');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('date must be YYYY-MM-DD');
  if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.push('time must be HH:MM');
  if (!buyerName || buyerName.length < 2 || buyerName.length > 200) errors.push('buyerName 2-200 chars');
  if (!buyerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) errors.push('valid buyerEmail required');
  if (!idempotencyKey) errors.push('idempotencyKey required');
  return errors;
}

async function handleOrders(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const errors = validateOrder(req.body);
  if (errors.length) return res.status(400).json({ error: 'validation_error', details: errors });

  const { creatorSlug, offerId, date, time, buyerName, buyerEmail, notes, idempotencyKey } = req.body;

  const creator = getCreator(creatorSlug);
  if (!creator) return res.status(404).json({ error: 'creator_not_found' });

  const offer = creator.offers.find(o => o.id === offerId);
  if (!offer) return res.status(404).json({ error: 'offer_not_found' });

  await ledger.ensureTables();

  const existing = await ledger.findByIdempotencyKey(idempotencyKey);
  if (existing) {
    return res.status(200).json({
      orderId: existing.order_id,
      razorpayOrderId: existing.razorpay_order_id || null,
      amount: offer.price.amount * 100,
      currency: offer.price.currency,
      status: existing.status,
    });
  }

  const orderId = crypto.randomUUID();
  const isFree = offer.price.amount === 0;
  const canCharge = offer.price.amount > 0 && offer.paymentEnabled;

  if (offer.price.amount > 0 && !offer.paymentEnabled) {
    return res.status(400).json({ error: 'payment_not_enabled', message: 'This offer does not accept payments yet.' });
  }

  let razorpayOrderId;
  if (canCharge) {
    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    const rpOrder = await rzp.orders.create({
      amount: offer.price.amount * 100,
      currency: offer.price.currency,
      receipt: orderId,
      notes: { creatorSlug, offerId, buyerEmail },
    });
    razorpayOrderId = rpOrder.id;
  }

  await ledger.createOrder({
    orderId, creatorSlug, offerId, offerTitle: offer.title,
    amount: offer.price.amount, currency: offer.price.currency,
    buyerName, buyerEmail, selectedDate: date, selectedTime: time,
    status: isFree ? 'free_confirmed' : 'created',
    razorpayOrderId, notes, idempotencyKey,
  });

  if (isFree) {
    await ledger.createBooking({
      bookingId: crypto.randomUUID(), orderId, creatorSlug, offerId,
      offerTitle: offer.title, buyerName, buyerEmail,
      scheduledDate: date, scheduledTime: time, status: 'confirmed',
    });
  }

  return res.status(201).json({
    orderId, razorpayOrderId: razorpayOrderId || null,
    amount: offer.price.amount * 100, currency: offer.price.currency,
    status: isFree ? 'free_confirmed' : 'created', free: isFree,
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
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  if (expected !== razorpaySignature) {
    await ledger.updateOrderStatus(orderId, 'payment_failed');
    return res.status(400).json({ error: 'signature_invalid' });
  }

  await ledger.updateOrderStatus(orderId, 'paid', { razorpayPaymentId });

  const existingBooking = await ledger.getBookingByOrderId(orderId);
  if (!existingBooking) {
    await ledger.createBooking({
      bookingId: crypto.randomUUID(), orderId,
      creatorSlug: order.creatorSlug, offerId: order.offerId,
      offerTitle: order.offerTitle, buyerName: order.buyerName,
      buyerEmail: order.buyerEmail, scheduledDate: order.selectedDate,
      scheduledTime: order.selectedTime, status: 'confirmed',
    });
  }

  return res.status(200).json({ status: 'verified', orderId });
}

async function handleWebhook(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const signature = req.headers['x-razorpay-signature'];
  if (!signature) return res.status(400).json({ error: 'missing_signature' });

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(500).json({ error: 'webhook_not_configured' });

  const rawBody = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  if (expected !== signature) return res.status(400).json({ error: 'invalid_signature' });

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
        const existingBooking = await ledger.getBookingByOrderId(order.orderId);
        if (!existingBooking) {
          await ledger.createBooking({
            bookingId: crypto.randomUUID(), orderId: order.orderId,
            creatorSlug: order.creatorSlug, offerId: order.offerId,
            offerTitle: order.offerTitle, buyerName: order.buyerName,
            buyerEmail: order.buyerEmail, scheduledDate: order.selectedDate,
            scheduledTime: order.selectedTime, status: 'confirmed',
          });
        }
      }
    }
  }

  return res.status(200).json({ status: 'ok' });
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const path = route(req);

    if (path === 'config') return handleConfig(req, res);
    if (path === 'orders') return handleOrders(req, res);
    if (path === 'payments/verify') return handleVerify(req, res);
    if (path === 'payments/webhook') return handleWebhook(req, res);

    return res.status(404).json({ error: 'not_found' });
  } catch (err) {
    console.error('Creator commerce error:', err.message);
    return res.status(500).json({ error: 'internal_error' });
  }
}

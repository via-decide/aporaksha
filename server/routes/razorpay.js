const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const { requireAuth } = require('../../auth/middleware');
const orders = new Map();
const processedPayments = new Set();
const userPayments = new Map();

const PAYMENT_TYPES = Object.freeze({
  booking: { amount: 50000 },
  full: { amount: 299900 },
  remaining: { amount: 249900 },
});

const paymentRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

function getRazorpayInstance() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

router.post('/create-order', paymentRateLimit, requireAuth, async (req, res) => {
  try {
    const type = req.body && req.body.type;
    const requestedAmount = Number(req.body && req.body.amount);
    const pricing = PAYMENT_TYPES[type];

    if (!pricing) {
      return res.status(400).json({ success: false, message: 'Invalid payment type.' });
    }

    if (Number.isFinite(requestedAmount) && requestedAmount !== pricing.amount) {
      return res.status(400).json({ success: false, message: 'Amount mismatch for payment type.' });
    }

    if (type === 'remaining' && !userState.booked) {
      return res.status(409).json({ success: false, message: 'Booking required before paying remaining amount.' });
    }

    const userId = req.user.id;
    const userState = userPayments.get(userId) || { booked: false, paidFull: false };

    if (type === 'booking' && userState.booked) {
      return res.status(409).json({ success: false, message: 'NFC card already booked for this user.' });
    }

    const amount = pricing.amount;

    const instance = getRazorpayInstance();
    const order = await instance.orders.create({
      amount,
      currency: 'INR',
      receipt: 'aporaksha_' + Date.now(),
      notes: { product: 'nfc_card', type, userId },
    });
    orders.set(order.id, { type, amount: order.amount, userId, status: 'pending', createdAt: Date.now() });
    console.info('Payment order created:', order.id);

    return res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error('Razorpay order creation failed');
    return res.status(500).json({ error: 'Payment processing failed' });
  }
});

router.post('/verify-payment', paymentRateLimit, requireAuth, async (req, res) => {
  const startedAt = Date.now();
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      type,
    } = req.body || {};

    console.info('Payment verification attempt:', razorpay_order_id || 'missing_order');

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing required payment fields.' });
    }

    const knownOrder = orders.get(razorpay_order_id);
    if (!knownOrder) {
      return res.status(400).json({ success: false, message: 'Unknown order.' });
    }

    if (PAYMENT_TYPES[knownOrder.type] && knownOrder.amount !== PAYMENT_TYPES[knownOrder.type].amount) {
      return res.status(400).json({ success: false, message: 'Order amount mismatch.' });
    }

    if (type !== knownOrder.type) {
      return res.status(400).json({ success: false, message: 'Order type mismatch.' });
    }

    if (req.user.id !== knownOrder.userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (processedPayments.has(razorpay_payment_id)) {
      return res.status(400).json({ error: 'Duplicate payment' });
    }

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expected !== razorpay_signature) {
      console.warn('Payment signature verification failed for order:', razorpay_order_id);
      return res.status(400).json({ success: false });
    }

    if (Date.now() - startedAt > 5000) {
      return res.status(408).json({ error: 'Verification timeout' });
    }

    processedPayments.add(razorpay_payment_id);
    knownOrder.status = 'paid';

    const userState = userPayments.get(knownOrder.userId) || { booked: false, paidFull: false };
    if (knownOrder.type === 'booking') userState.booked = true;
    if (knownOrder.type === 'full' || knownOrder.type === 'remaining') userState.paidFull = true;
    userPayments.set(knownOrder.userId, userState);

    console.info('Payment verified:', razorpay_payment_id);

    return res.json({
      success: true,
      paymentState: {
        booked: userState.booked,
        paidFull: userState.paidFull,
      },
      message: knownOrder.type === 'booking'
        ? 'Card booked. Pay remaining ₹2499 before delivery'
        : 'NFC card payment completed in full',
    });
  } catch (error) {
    console.error('Razorpay verification failed');
    return res.status(500).json({ error: 'Payment processing failed' });
  }
});

module.exports = router;

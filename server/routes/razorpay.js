const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const orders = new Map();
const processedPayments = new Set();

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

router.post('/create-order', paymentRateLimit, async (req, res) => {
  try {
    const amount = Number(req.body && req.body.amount);

    if (!Number.isInteger(amount) || amount < 100 || amount > 10000000) {
      return res.status(400).json({ success: false, message: 'Invalid amount.' });
    }

    if (amount < 100) {
      return res.status(400).json({ success: false, message: 'Amount must be at least 100.' });
    }

    const instance = getRazorpayInstance();
    const order = await instance.orders.create({
      amount,
      currency: 'INR',
      receipt: 'aporaksha_' + Date.now(),
    });
    orders.set(order.id, { amount: order.amount, createdAt: Date.now() });
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

router.post('/verify-payment', paymentRateLimit, async (req, res) => {
  const startedAt = Date.now();
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount,
    } = req.body || {};

    console.info('Payment verification attempt:', razorpay_order_id || 'missing_order');

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing required payment fields.' });
    }

    const knownOrder = orders.get(razorpay_order_id);
    if (!knownOrder) {
      return res.status(400).json({ success: false, message: 'Unknown order.' });
    }

    if (amount !== undefined && Number(amount) !== knownOrder.amount) {
      return res.status(400).json({ success: false, message: 'Order amount mismatch.' });
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
    console.info('Payment verified:', razorpay_payment_id);

    return res.json({ success: true });
  } catch (error) {
    console.error('Razorpay verification failed');
    return res.status(500).json({ error: 'Payment processing failed' });
  }
});

module.exports = router;

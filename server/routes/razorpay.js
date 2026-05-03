const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const router = express.Router();
const { authMiddleware } = require('../../auth/middleware');
const orders = new Map();
const processedPayments = new Set();
const userPayments = new Map();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const PAYMENT_TYPES = Object.freeze({
  booking: { amount: 50000 },
  full: { amount: 299900 },
  remaining: { amount: 249900 },
});

const paymentRateLimit = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

function getRazorpayInstance() {
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

router.post('/payments/create-order', paymentRateLimit, authMiddleware, async (req, res) => {
  try {
    const { productId } = req.body || {};
    const userId = req.userId;
    if (!productId) return res.status(400).json({ error: 'productId is required' });

    const { rows } = await pool.query('SELECT id, name, price FROM products WHERE id = $1 LIMIT 1', [productId]);
    const product = rows[0];
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const order = await getRazorpayInstance().orders.create({
      amount: product.price,
      currency: 'INR',
      receipt: `order_${userId}_${Date.now()}`,
      notes: { userId, productId: product.id },
    });

    await pool.query(
      'INSERT INTO payment_orders (user_id, product_id, razorpay_order_id, amount) VALUES ($1, $2, $3, $4)',
      [userId, product.id, order.id, product.price]
    );

    orders.set(order.id, { type: 'product', amount: order.amount, userId, status: 'pending', createdAt: Date.now() });
    return res.json({ orderId: order.id, amount: product.price, currency: 'INR' });
  } catch (error) {
    console.error('Razorpay order creation failed', error);
    return res.status(500).json({ error: 'Failed to create order' });
  }
});

router.post('/verify-payment', paymentRateLimit, authMiddleware, async (req, res) => {
  const startedAt = Date.now();
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, type } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return res.status(400).json({ success: false, message: 'Missing required payment fields.' });

    const knownOrder = orders.get(razorpay_order_id);
    if (!knownOrder) return res.status(400).json({ success: false, message: 'Unknown order.' });
    if (PAYMENT_TYPES[knownOrder.type] && knownOrder.amount !== PAYMENT_TYPES[knownOrder.type].amount) return res.status(400).json({ success: false, message: 'Order amount mismatch.' });
    if (type !== knownOrder.type) return res.status(400).json({ success: false, message: 'Order type mismatch.' });
    if (req.userId !== knownOrder.userId) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (processedPayments.has(razorpay_payment_id)) return res.status(400).json({ error: 'Duplicate payment' });

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body).digest('hex');
    if (expected !== razorpay_signature) return res.status(400).json({ success: false });
    if (Date.now() - startedAt > 5000) return res.status(408).json({ error: 'Verification timeout' });

    processedPayments.add(razorpay_payment_id);
    knownOrder.status = 'paid';

    const userState = userPayments.get(knownOrder.userId) || { booked: false, paidFull: false };
    if (knownOrder.type === 'booking') userState.booked = true;
    if (knownOrder.type === 'full' || knownOrder.type === 'remaining') userState.paidFull = true;
    userPayments.set(knownOrder.userId, userState);

    return res.json({ success: true, paymentState: { booked: userState.booked, paidFull: userState.paidFull } });
  } catch (error) {
    console.error('Razorpay verification failed', error);
    return res.status(500).json({ error: 'Payment processing failed' });
  }
});

module.exports = router;

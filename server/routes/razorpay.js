const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const router = express.Router();
const { authMiddleware } = require('../../auth/middleware');
const { checkProductAccess } = require('../../auth/check-product-access');
const { validate, validators, escapeHtml } = require('../middleware/input-validation');
const orders = new Map();
const processedPayments = new Set();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const paymentRateLimit = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

function getRazorpayInstance() {
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

router.post('/payments/create-order', paymentRateLimit, authMiddleware, [validators.productIdBody], validate, async (req, res) => {
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
      'INSERT INTO payment_orders (user_id, product_id, razorpay_order_id, amount, status) VALUES ($1, $2, $3, $4, $5)',
      [userId, product.id, order.id, product.price, 'PENDING']
    );

    orders.set(order.id, { amount: order.amount, userId, productId: product.id, status: 'PENDING', createdAt: Date.now() });
    return res.json({ orderId: order.id, amount: product.price, currency: 'INR' });
  } catch (error) {
    console.error('Razorpay order creation failed', error);
    return res.status(500).json({ error: 'Failed to create order' });
  }
});

router.post('/verify-payment', paymentRateLimit, authMiddleware, [validators.razorpayOrderId, validators.razorpayPaymentId, validators.razorpaySignature], validate, async (req, res) => {
  const startedAt = Date.now();
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return res.status(400).json({ success: false, message: 'Missing required payment fields.' });

    const knownOrder = orders.get(razorpay_order_id);
    if (!knownOrder) return res.status(400).json({ success: false, message: 'Unknown order.' });
    if (req.userId !== knownOrder.userId) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (processedPayments.has(razorpay_payment_id)) return res.status(400).json({ error: 'Duplicate payment' });

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body).digest('hex');
    if (expected !== razorpay_signature) return res.status(400).json({ success: false });
    if (Date.now() - startedAt > 5000) return res.status(408).json({ error: 'Verification timeout' });

    processedPayments.add(razorpay_payment_id);

    await pool.query('BEGIN');
    await pool.query(
      `UPDATE payment_orders
       SET razorpay_payment_id = $1, status = 'SUCCESS', paid_at = NOW(), failed_at = NULL
       WHERE razorpay_order_id = $2 AND user_id = $3`,
      [razorpay_payment_id, razorpay_order_id, knownOrder.userId]
    );

    await pool.query(
      `INSERT INTO user_products (user_id, product_id, purchased_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET purchased_at = EXCLUDED.purchased_at, expires_at = NULL`,
      [knownOrder.userId, knownOrder.productId]
    );
    await pool.query('COMMIT');

    knownOrder.status = 'SUCCESS';
    return res.json({ success: true });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Razorpay verification failed', error);
    return res.status(500).json({ error: 'Payment processing failed' });
  }
});

router.get('/purchases', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         po.razorpay_order_id AS "orderId",
         po.product_id AS "productId",
         p.name AS "productName",
         po.amount,
         po.status,
         po.paid_at AS "paidAt",
         up.purchased_at AS "purchasedAt"
       FROM payment_orders po
       LEFT JOIN user_products up ON po.product_id = up.product_id AND po.user_id = up.user_id
       JOIN products p ON po.product_id = p.id
       WHERE po.user_id = $1 AND po.status = 'SUCCESS'
       ORDER BY po.paid_at DESC`,
      [req.userId]
    );

    return res.json({ purchases: rows.map((row) => ({ ...row, productName: escapeHtml(row.productName) })) });
  } catch (error) {
    console.error('Failed to fetch purchases', error);
    return res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

router.get('/products/:productId/data', authMiddleware, [validators.productIdParam], validate, checkProductAccess, async (req, res) => {
  return res.json({ productId: escapeHtml(req.params.productId), access: true });
});

module.exports = router;

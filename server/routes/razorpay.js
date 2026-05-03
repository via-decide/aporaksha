const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');

const router = express.Router();

function getRazorpayInstance() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

router.post('/create-order', async (req, res) => {
  try {
    const amount = Number(req.body && req.body.amount);

    if (!Number.isFinite(amount)) {
      return res.status(400).json({ success: false, message: 'Amount is required.' });
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

    return res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error('Razorpay order creation failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to create order.' });
  }
});

router.post('/verify-payment', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing required payment fields.' });
    }

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ success: false });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Razorpay verification failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to verify payment.' });
  }
});

module.exports = router;

const { body, param, query, validationResult } = require('express-validator');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.warn('Validation failure', { path: req.path, method: req.method, errors: errors.array() });
    return res.status(400).json({ errors: errors.array() });
  }
  return next();
}

const validators = {
  email: body('email').isEmail().normalizeEmail(),
  password: body('password').isLength({ min: 12 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/).trim(),
  userId: param('userId').isUUID(),
  amount: body('amount').isInt({ min: 0 }).toInt(),
  content: body('content').trim().escape().isLength({ min: 1, max: 5000 }),
  appName: body('appName').trim().matches(/^[a-zA-Z0-9\s\-_.]+$/).isLength({ min: 1, max: 100 }),
  nfcUid: body('nfc_uid').matches(/^[A-F0-9]{14}$/),
  productIdParam: param('productId').trim().isString().isLength({ min: 1, max: 128 }).escape(),
  productIdBody: body('productId').trim().isString().isLength({ min: 1, max: 128 }).escape(),
  razorpayOrderId: body('razorpay_order_id').trim().isString().isLength({ min: 1, max: 128 }).escape(),
  razorpayPaymentId: body('razorpay_payment_id').trim().isString().isLength({ min: 1, max: 128 }).escape(),
  razorpaySignature: body('razorpay_signature').trim().matches(/^[a-f0-9]{64}$/),
  refreshToken: body('refreshToken').trim().isString().isLength({ min: 20, max: 2048 }),
};

const escapeHtml = (text = '') => {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
};

module.exports = { body, param, query, validate, validators, escapeHtml };

const escapeHtml = (text = '') => {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
};

const addError = (req, msg, param, location = 'body') => {
  if (!req.validationErrors) req.validationErrors = [];
  req.validationErrors.push({ msg, param, location });
};

function validate(req, res, next) {
  if (req.validationErrors && req.validationErrors.length > 0) {
    console.warn('Validation failure', { path: req.path, method: req.method, errors: req.validationErrors });
    return res.status(400).json({ errors: req.validationErrors });
  }
  return next();
}

const validators = {
  email: (req, res, next) => {
    const email = req.body?.email;
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      addError(req, 'Invalid email format', 'email');
    } else {
      req.body.email = email.trim().toLowerCase();
    }
    next();
  },
  password: (req, res, next) => {
    const password = req.body?.password;
    if (!password || typeof password !== 'string' || password.length < 12 || 
        !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      addError(req, 'Password must be at least 12 characters and contain lowercase, uppercase, digit, and special char', 'password');
    }
    next();
  },
  userId: (req, res, next) => {
    const userId = req.params?.userId;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!userId || !uuidRegex.test(userId)) {
      addError(req, 'Invalid UUID', 'userId', 'params');
    }
    next();
  },
  amount: (req, res, next) => {
    const amount = req.body?.amount;
    const parsed = parseInt(amount, 10);
    if (isNaN(parsed) || parsed < 0) {
      addError(req, 'Amount must be non-negative integer', 'amount');
    } else {
      req.body.amount = parsed;
    }
    next();
  },
  content: (req, res, next) => {
    let content = req.body?.content;
    if (typeof content !== 'string') {
      addError(req, 'Content must be string', 'content');
    } else {
      content = content.trim();
      if (content.length < 1 || content.length > 5000) {
        addError(req, 'Content length must be between 1 and 5000', 'content');
      } else {
        req.body.content = escapeHtml(content);
      }
    }
    next();
  },
  appName: (req, res, next) => {
    const appName = req.body?.appName;
    if (!appName || typeof appName !== 'string' || !/^[a-zA-Z0-9\s\-_.]+$/.test(appName) || appName.length < 1 || appName.length > 100) {
      addError(req, 'App name must be alphanumeric between 1 and 100 characters', 'appName');
    }
    next();
  },
  nfcUid: (req, res, next) => {
    const nfcUid = req.body?.nfc_uid;
    if (!nfcUid || !/^[A-F0-9]{14}$/.test(nfcUid)) {
      addError(req, 'Invalid NFC UID format', 'nfc_uid');
    }
    next();
  },
  productIdParam: (req, res, next) => {
    const productId = req.params?.productId;
    if (!productId || typeof productId !== 'string' || productId.length < 1 || productId.length > 128) {
      addError(req, 'Invalid product ID', 'productId', 'params');
    } else {
      req.params.productId = escapeHtml(productId.trim());
    }
    next();
  },
  productIdBody: (req, res, next) => {
    const productId = req.body?.productId;
    if (!productId || typeof productId !== 'string' || productId.length < 1 || productId.length > 128) {
      addError(req, 'Invalid product ID', 'productId');
    } else {
      req.body.productId = escapeHtml(productId.trim());
    }
    next();
  },
  razorpayOrderId: (req, res, next) => {
    const orderId = req.body?.razorpay_order_id;
    if (!orderId || typeof orderId !== 'string' || orderId.length < 1 || orderId.length > 128) {
      addError(req, 'Invalid order ID', 'razorpay_order_id');
    } else {
      req.body.razorpay_order_id = escapeHtml(orderId.trim());
    }
    next();
  },
  razorpayPaymentId: (req, res, next) => {
    const paymentId = req.body?.razorpay_payment_id;
    if (!paymentId || typeof paymentId !== 'string' || paymentId.length < 1 || paymentId.length > 128) {
      addError(req, 'Invalid payment ID', 'razorpay_payment_id');
    } else {
      req.body.razorpay_payment_id = escapeHtml(paymentId.trim());
    }
    next();
  },
  razorpaySignature: (req, res, next) => {
    const signature = req.body?.razorpay_signature;
    if (!signature || !/^[a-f0-9]{64}$/.test(signature)) {
      addError(req, 'Invalid signature', 'razorpay_signature');
    }
    next();
  },
  refreshToken: (req, res, next) => {
    const token = req.body?.refreshToken;
    if (!token || typeof token !== 'string' || token.length < 20 || token.length > 2048) {
      addError(req, 'Invalid refresh token', 'refreshToken');
    }
    next();
  }
};

const body = (field) => (req, res, next) => next();
const param = (field) => (req, res, next) => next();
const query = (field) => (req, res, next) => next();

module.exports = { body, param, query, validate, validators, escapeHtml };

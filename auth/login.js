const express = require('express');
const crypto = require('crypto');
const { issueToken } = require('./token');

const router = express.Router();
const users = new Map();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/;

function normalizeIdentity(email, phone) {
  return (email || phone || '').trim().toLowerCase();
}

function hashWithRounds(value, rounds = 10) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 2 ** (rounds + 5);
  const digest = crypto.pbkdf2Sync(value, salt, iterations, 64, 'sha512').toString('hex');
  return `pbkdf2$${rounds}$${salt}$${digest}`;
}

function generateRecoveryCodes() {
  return Array.from({ length: 6 }, () => crypto.randomBytes(6).toString('base64url').slice(0, 8).toUpperCase());
}

router.post('/auth/signup', (req, res) => {
  const { email, password } = req.body || {};
  const identity = normalizeIdentity(email);

  if (!EMAIL_REGEX.test(identity) || !PASSWORD_REGEX.test(password || '')) {
    return res.status(400).json({ success: false, message: 'Email/password invalid' });
  }

  if (users.has(identity)) {
    return res.status(409).json({ success: false, message: 'Email/password invalid' });
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const recoveryCodes = generateRecoveryCodes();

  const user = {
    id,
    email: identity,
    password_hash: hashWithRounds(password, 10),
    created_at: createdAt,
    updated_at: createdAt,
    is_active: true,
    recovery_codes: recoveryCodes.map((code) => hashWithRounds(code, 10)),
  };

  users.set(identity, user);

  return res.status(201).json({ success: true, userId: user.id, email: user.email, recoveryCodes });
});

router.post('/login', (req, res) => {
  const { email, phone } = req.body || {};
  const identity = normalizeIdentity(email, phone);

  if (!identity) {
    return res.status(400).json({ success: false, message: 'Email or phone is required.' });
  }

  let user = users.get(identity);
  if (!user) {
    user = { id: crypto.createHash('sha256').update(identity).digest('hex').slice(0, 16), email: email || '', phone: phone || '' };
    users.set(identity, user);
  }

  const token = issueToken(user);
  return res.json({ success: true, token, user: { id: user.id, email: user.email, phone: user.phone } });
});

router.post('/logout', (_req, res) => {
  return res.json({ success: true });
});

module.exports = router;

const express = require('express');
const crypto = require('crypto');
const { issueTokenPair, verifyRefreshToken } = require('./token');

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

function comparePassword(value, storedHash) {
  if (!storedHash || !storedHash.startsWith('pbkdf2$')) return false;
  const [, rounds, salt, digest] = storedHash.split('$');
  const iterations = 2 ** (Number(rounds) + 5);
  const candidate = crypto.pbkdf2Sync(value, salt, iterations, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate, 'utf8'), Buffer.from(digest, 'utf8'));
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

router.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const identity = normalizeIdentity(email);

  if (!identity || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = users.get(identity);
  if (!user || !comparePassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  return res.json(issueTokenPair(user));
});

router.post('/auth/refresh', (req, res) => {
  const { refreshToken } = req.body || {};

  const verification = verifyRefreshToken(refreshToken);
  if (!verification.valid || verification.payload?.type !== 'refresh') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const user = Array.from(users.values()).find((entry) => entry.id === verification.payload.userId);
  if (!user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  return res.json(issueTokenPair(user));
});

router.post('/logout', (_req, res) => {
  return res.json({ success: true });
});

module.exports = router;

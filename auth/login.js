const express = require('express');
const crypto = require('crypto');
const { issueToken } = require('./token');

const router = express.Router();
const users = new Map();

function normalizeIdentity(email, phone) {
  return (email || phone || '').trim().toLowerCase();
}

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

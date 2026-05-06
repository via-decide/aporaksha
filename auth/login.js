const express = require('express');
const crypto = require('crypto');
const { issueTokenPair, verifyAccessToken, verifyRefreshToken } = require('./token');
const { revokeToken, isTokenRevoked } = require('./token-blacklist');
const { validate, validators, escapeHtml } = require('../server/middleware/input-validation');
const { createSession, validateSession, revokeSession, detectAnomaly } = require('./session-store');

const router = express.Router();
const users = new Map();
const lastIpByUser = new Map();
const fingerprintByUser = new Map();
const auditLogsByUser = new Map();
const mfaCodesByUser = new Map();
const lastGeoByUser = new Map();
const behaviorByUser = new Map();

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


function getGeoData(req) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'unknown';
  return { ip, country: req.headers['x-vercel-ip-country'] || 'unknown', city: req.headers['x-vercel-ip-city'] || 'unknown' };
}

function generateFingerprint(req) {
  const ua = req.headers['user-agent'] || '';
  const lang = req.headers['accept-language'] || '';
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  return crypto.createHash('sha256').update(`${ua}|${lang}|${ip}`).digest('hex');
}

function calculateRisk({ impossibleTravel, newIP, newDevice, behaviorAnomaly }) {
  let score = 0;
  if (impossibleTravel) score += 50;
  if (newIP) score += 20;
  if (newDevice) score += 20;
  if (behaviorAnomaly) score += 10;
  if (score >= 60) return { level: 'HIGH', score };
  if (score >= 30) return { level: 'MEDIUM', score };
  return { level: 'LOW', score };
}


function toRad(x) { return (x * Math.PI) / 180; }

function isImpossibleTravel(prev, curr, timeDiffSec) {
  if (!prev || !curr || !timeDiffSec || timeDiffSec <= 0) return false;
  const dLat = toRad(curr.lat - prev.lat);
  const dLon = toRad(curr.lon - prev.lon);
  const lat1 = toRad(prev.lat);
  const lat2 = toRad(curr.lat);
  const aVal = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const dist = 6371 * (2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal)));
  const speed = dist / (timeDiffSec / 3600);
  return speed > 900;
}

function detectBehaviorAnomaly(userId, action) {
  const history = behaviorByUser.get(userId) || [];
  const freq = history.filter((entry) => entry.action === action).length;
  return freq < 2;
}

function trackBehavior(userId, action) {
  const history = behaviorByUser.get(userId) || [];
  history.push({ time: Date.now(), action });
  behaviorByUser.set(userId, history.slice(-20));
}

function logEvent(event) {
  const logs = auditLogsByUser.get(event.userId) || [];
  logs.unshift({ ...event, time: Date.now() });
  auditLogsByUser.set(event.userId, logs.slice(0, 100));
}

router.post('/auth/signup', [validators.email, validators.password], validate, (req, res) => {
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
    role: 'user',
    recovery_codes: recoveryCodes.map((code) => hashWithRounds(code, 10)),
  };

  users.set(identity, user);

  return res.status(201).json({ success: true, userId: user.id, email: escapeHtml(user.email), recoveryCodes });
});

router.post('/auth/login', [validators.email, validators.password], validate, (req, res) => {
  const { email, password } = req.body || {};
  const identity = normalizeIdentity(email);

  if (!identity || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = users.get(identity);
  if (!user || !comparePassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const geo = getGeoData(req);
  const fingerprint = generateFingerprint(req);
  const lastIP = lastIpByUser.get(user.id);
  const lastDevice = fingerprintByUser.get(user.id);
  const prevGeo = lastGeoByUser.get(user.id);
  const now = Date.now();
  const impossibleTravel = isImpossibleTravel(prevGeo, geo, (now - (prevGeo?.time || now)) / 1000);
  const behaviorAnomaly = detectBehaviorAnomaly(user.id, 'login');
  const risk = calculateRisk({ impossibleTravel, newIP: Boolean(lastIP && lastIP !== geo.ip), newDevice: Boolean(lastDevice && lastDevice !== fingerprint), behaviorAnomaly });

  lastIpByUser.set(user.id, geo.ip);
  fingerprintByUser.set(user.id, fingerprint);
  lastGeoByUser.set(user.id, { lat: Number(req.headers['x-geo-lat'] || 0), lon: Number(req.headers['x-geo-lon'] || 0), time: now });
  trackBehavior(user.id, 'login');
  logEvent({ type: 'LOGIN', userId: user.id, ip: geo.ip, country: geo.country, city: geo.city, risk: risk.level, score: risk.score, impossibleTravel, behaviorAnomaly });

  if (risk.level === 'HIGH') {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    mfaCodesByUser.set(user.id, { code, expiresAt: now + 300000 });
    logEvent({ type: 'MFA_REQUIRED', userId: user.id, ip: geo.ip, country: geo.country, city: geo.city, risk: risk.level, score: risk.score });
    return res.status(403).json({ requireMFA: true, userId: user.id, risk });
  }

  const deviceId = req.headers['x-device-id'] || 'unknown';
  const tokens = issueTokenPair(user, deviceId);
  if (detectAnomaly(user.id, req.ip)) console.warn('Suspicious login detected for user:', user.id);
  createSession(user.id, deviceId, tokens.refreshToken);
  return res.json({ ...tokens, risk });
});


router.post('/auth/verify-mfa', (req, res) => {
  const { userId, code } = req.body || {};
  const record = mfaCodesByUser.get(userId);
  if (!record || record.expiresAt < Date.now() || record.code !== String(code || '')) return res.status(401).json({ error: 'Invalid MFA' });
  mfaCodesByUser.delete(userId);
  return res.json({ success: true });
});

router.post('/auth/refresh', [validators.refreshToken], validate, (req, res) => {
  const { refreshToken } = req.body || {};

  if (isTokenRevoked(refreshToken)) {
    return res.status(401).json({ error: 'Token revoked' });
  }

  const verification = verifyRefreshToken(refreshToken);
  if (!verification.valid || verification.payload?.type !== 'refresh') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const user = Array.from(users.values()).find((entry) => entry.id === verification.payload.userId);
  if (!user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const deviceId = verification.payload.deviceId || req.headers['x-device-id'] || 'unknown';
  if (!validateSession(user.id, deviceId, refreshToken)) {
    return res.status(401).json({ error: 'Session revoked' });
  }
  const tokens = issueTokenPair(user, deviceId);
  createSession(user.id, deviceId, tokens.refreshToken);
  return res.json(tokens);
});

router.post('/auth/logout', [validators.refreshToken], validate, (req, res) => {
  const accessToken = req.headers.authorization?.split(' ')[1];
  const { refreshToken } = req.body || {};

  if (!accessToken || !refreshToken) {
    return res.status(400).json({ error: 'Access and refresh tokens are required' });
  }

  if (isTokenRevoked(accessToken) || isTokenRevoked(refreshToken)) {
    return res.status(401).json({ error: 'Token revoked' });
  }

  const accessVerification = verifyAccessToken(accessToken);
  if (!accessVerification.valid || accessVerification.payload?.type !== 'access') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const refreshVerification = verifyRefreshToken(refreshToken);
  if (!refreshVerification.valid || refreshVerification.payload?.type !== 'refresh') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  revokeToken(accessToken, accessVerification.payload.exp);
  revokeToken(refreshToken, refreshVerification.payload.exp);
  revokeSession(accessVerification.payload.userId, refreshVerification.payload.deviceId);

  return res.json({ status: 'logged out' });
});

router.get('/auth/audit/logs', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || isTokenRevoked(token)) return res.status(401).json({ error: 'No token' });
  const verification = verifyAccessToken(token);
  if (!verification.valid || verification.payload?.type !== 'access') return res.status(401).json({ error: 'Invalid token' });
  const logs = auditLogsByUser.get(verification.payload.userId) || [];
  return res.json({ logs: logs.slice(0, 50) });
});

module.exports = router;

const { verifyAccessToken } = require('./token');
const { isTokenRevoked } = require('./token-blacklist');
const { checkThrottle, isBlocked, blockUser } = require('./session-store');
const { checkThrottle } = require('./session-store');

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  if (isTokenRevoked(token)) {
    return res.status(401).json({ error: 'Token revoked' });
  }

  const verification = verifyAccessToken(token);

  if (!verification.valid) {
    if (verification.reason === 'expired') {
      return res.status(401).json({ error: 'Token expired, refresh' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (verification.payload.type !== 'access') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.userId = verification.payload.userId;
  req.user = verification.payload;

  if (isBlocked(req.userId)) return res.status(403).json({ error: 'User blocked' });
  const throttle = checkThrottle(req.userId);
  if (throttle.blocked) { blockUser(req.userId); return res.status(429).json({ error: 'Too many requests' }); }
  const throttle = checkThrottle(req.userId);
  if (throttle.blocked) return res.status(429).json({ error: 'Too many requests' });
  if (throttle.delay) return setTimeout(() => next(), throttle.delay);
  return next();
}

module.exports = { authMiddleware };

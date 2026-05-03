const { verifyAccessToken } = require('./token');
const { isTokenRevoked } = require('./token-blacklist');

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
  return next();
}

module.exports = { authMiddleware };

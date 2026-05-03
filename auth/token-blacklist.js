const crypto = require('crypto');

const revokedTokens = new Map();

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function revokeToken(token, exp) {
  if (!token || !exp) return false;
  const ttlMs = (exp * 1000) - Date.now();
  if (ttlMs <= 0) return false;

  const tokenHash = hashToken(token);
  revokedTokens.set(tokenHash, exp);
  setTimeout(() => revokedTokens.delete(tokenHash), ttlMs);
  return true;
}

function isTokenRevoked(token) {
  if (!token) return false;
  const tokenHash = hashToken(token);
  const exp = revokedTokens.get(tokenHash);
  if (!exp) return false;

  if ((exp * 1000) <= Date.now()) {
    revokedTokens.delete(tokenHash);
    return false;
  }

  return true;
}

module.exports = {
  revokeToken,
  isTokenRevoked,
};

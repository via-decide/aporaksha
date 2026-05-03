const crypto = require('crypto');

const ACCESS_SECRET = process.env.SECRET_KEY || 'zayvora_dev_access_secret';
const REFRESH_SECRET = process.env.REFRESH_SECRET_KEY || 'zayvora_dev_refresh_secret';
const ACCESS_TOKEN_TTL_SEC = 15 * 60;
const REFRESH_TOKEN_TTL_SEC = 7 * 24 * 60 * 60;

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payload, secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verify(token, secret) {
  const [header, body, sig] = (token || '').split('.');
  if (!header || !body || !sig) return { valid: false, reason: 'invalid' };

  const data = `${header}.${body}`;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  if (expected !== sig) return { valid: false, reason: 'invalid' };

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, payload };
}

function issueAccessToken(user) {
  return sign({
    userId: user.id,
    email: user.email || '',
    type: 'access',
    exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SEC,
  }, ACCESS_SECRET);
}

function issueRefreshToken(user) {
  return sign({
    userId: user.id,
    type: 'refresh',
    exp: Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL_SEC,
  }, REFRESH_SECRET);
}

function issueTokenPair(user) {
  return {
    accessToken: issueAccessToken(user),
    refreshToken: issueRefreshToken(user),
    expiresIn: ACCESS_TOKEN_TTL_SEC,
  };
}

function verifyAccessToken(token) {
  return verify(token, ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return verify(token, REFRESH_SECRET);
}

module.exports = {
  issueTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
};

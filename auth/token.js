const crypto = require('crypto');

const SECRET = process.env.AUTH_TOKEN_SECRET || 'zayvora_dev_secret';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verify(token) {
  const [header, body, sig] = (token || '').split('.');
  if (!header || !body || !sig) return null;

  const data = `${header}.${body}`;
  const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  if (expected !== sig) return null;

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

function issueToken(user) {
  return sign({
    sub: user.id,
    email: user.email || '',
    phone: user.phone || '',
    exp: Date.now() + TOKEN_TTL_MS,
  });
}

module.exports = { issueToken, verify };

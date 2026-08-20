import crypto from 'crypto';

const ACCESS_SECRET = process.env.SECRET_KEY || 'zayvora_dev_access_secret';

function verifyJWT(token, secret) {
  const [header, body, sig] = (token || '').split('.');
  if (!header || !body || !sig) return { valid: false };
  const data = `${header}.${body}`;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  if (expected !== sig) return { valid: false };
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) return { valid: false };
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

export function requireAuth(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const result = verifyJWT(token, ACCESS_SECRET);
  if (!result.valid) return null;
  return { email: result.payload.email, userId: result.payload.userId };
}

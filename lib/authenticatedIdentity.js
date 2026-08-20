import crypto from 'crypto';

function unauthorized(reason = 'authentication_required') {
  const error = new Error(reason);
  error.statusCode = 401;
  return error;
}

export function requireIdentity(req) {
  const authorization = req.headers?.authorization || '';
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw unauthorized();

  const secret = process.env.SECRET_KEY;
  if (!secret) throw unauthorized('authentication_not_configured');

  try {
    const [encodedHeader, encodedPayload, signature] = match[1].split('.');
    if (!encodedHeader || !encodedPayload || !signature) throw unauthorized();

    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') throw unauthorized();

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest();
    const received = Buffer.from(signature, 'base64url');
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
      throw unauthorized();
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000) || payload.type !== 'access') {
      throw unauthorized();
    }
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email) throw unauthorized();
    return { ...payload, email };
  } catch (error) {
    if (error?.statusCode === 401) throw error;
    throw unauthorized();
  }
}

export function requireSameEmail(identity, email) {
  if (identity.role === 'admin') return;
  if (identity.email !== String(email || '').trim().toLowerCase()) {
    const error = new Error('forbidden');
    error.statusCode = 403;
    throw error;
  }
}

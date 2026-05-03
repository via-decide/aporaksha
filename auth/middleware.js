const { verify } = require('./token');

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = verify(token);

  if (!payload || !payload.sub) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  req.user = {
    id: payload.sub,
    email: payload.email || '',
  };

  return next();
}

module.exports = { requireAuth };

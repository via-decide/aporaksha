const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkProductAccess(req, res, next) {
  const productId = req.params?.productId || req.body?.productId;
  const userId = req.userId;

  if (!productId) {
    return res.status(400).json({ error: 'productId is required' });
  }

  const { rows } = await pool.query(
    `SELECT id
     FROM user_products
     WHERE user_id = $1 AND product_id = $2
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [userId, productId]
  );

  if (!rows[0]) {
    return res.status(403).json({ error: 'Product not purchased' });
  }

  return next();
}

module.exports = { checkProductAccess };

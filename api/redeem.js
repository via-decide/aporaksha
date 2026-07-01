import crypto from 'crypto';
import { getDB } from '../lib/db.js';
import { initDB } from '../lib/initDb.js';
import { createOrUpdatePassport } from '../lib/passportEngine.js';

const ACCESS_SECRET = process.env.SECRET_KEY || "zayvora_dev_access_secret";

function verifyJWT(token) {
  try {
    const [header, body, sig] = (token || "").split(".");
    if (!header || !body || !sig) return { valid: false };
    const data = `${header}.${body}`;
    const expected = crypto.createHmac("sha256", ACCESS_SECRET).update(data).digest("base64url");
    if (expected !== sig) return { valid: false };
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) return { valid: false };
    return { valid: true, payload };
  } catch (e) {
    return { valid: false };
  }
}

export default async function handler(req, res) {
  // CORS setup
  const ALLOWED = ['https://aporaksha.com', 'https://www.aporaksha.com'];
  const origin  = req.headers.origin || '';
  if (ALLOWED.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { code } = req.body || {};

    if (!code) {
      return res.status(400).json({ error: 'Missing redemption code.' });
    }

    // ── Auth Validation ───────────────────────────────────────────────────────
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const verification = verifyJWT(token);

    if (!verification.valid) {
      return res.status(401).json({ error: 'Unauthorized. Passport authentication required.' });
    }

    const userEmail = verification.payload.email;

    await initDB();
    const db = await getDB();

    // Check if code exists and is used
    const promoCode = await db.get("SELECT * FROM redemption_codes WHERE code = ?", [code.trim()]);

    if (!promoCode) {
      return res.status(404).json({ error: 'Invalid or unrecognized code.' });
    }

    if (promoCode.is_used === 1) {
      return res.status(403).json({ error: 'This code has already been claimed by another user.' });
    }

    // Update code status
    await db.run(
      "UPDATE redemption_codes SET is_used = 1, redeemed_by_email = ?, redeemed_at = CURRENT_TIMESTAMP WHERE code = ?",
      [userEmail, code.trim()]
    );

    // Get user name if possible
    const existingPassport = await db.get("SELECT customer_name FROM passports WHERE email = ?", [userEmail]);
    const customerName = existingPassport ? existingPassport.customer_name : '';

    // Upgrade the user's passport
    const passport = await createOrUpdatePassport({
      email: userEmail,
      name: customerName,
      productId: 'digital_architect',
      orderId: `promo_${code.trim()}`
    });

    console.log(`User ${userEmail} successfully redeemed VIP code: ${code}`);

    return res.status(200).json({
      success: true,
      message: 'Welcome to the inner circle. Complete access unlocked.',
      passport_id: passport.passport_id
    });

  } catch (error) {
    console.error('Redemption Error:', error);
    return res.status(500).json({ error: 'Internal server error during redemption.' });
  }
}

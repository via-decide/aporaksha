import { getDB } from "../../lib/db.js";
import { initDB } from "../../lib/initDb.js";

/**
 * Endpoint for external products (like LogicHub) to securely query a user's passport
 * and verify their access entitlements.
 */
export default async function handler(req, res) {
  // CORS setup for cross-ecosystem calls
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed. Use GET." });
  }

  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: "email parameter is required" });
  }

  try {
    await initDB();
    const db = await getDB();

    const passport = await db.get(`
      SELECT passport_id, customer_name, email, access_entitlements, activation_status, country, billing_status, razorpay_subscription_id, order_id
      FROM passports
      WHERE email = ?
    `, [email]);

    if (!passport) {
      return res.status(200).json({ 
        exists: false,
        hasAccess: false,
        entitlements: []
      });
    }

    let entitlements = [];
    try {
      entitlements = JSON.parse(passport.access_entitlements || "[]");
    } catch (e) {
      console.error("Failed to parse passport entitlements", e);
    }

    return res.status(200).json({
      exists: true,
      hasAccess: entitlements.length > 0 && passport.activation_status !== 'suspended',
      passport_id: passport.passport_id,
      customer_name: passport.customer_name,
      email: passport.email,
      entitlements: entitlements,
      status: passport.activation_status,
      country: passport.country || null,
      billing_status: passport.billing_status || null,
      razorpay_subscription_id: passport.razorpay_subscription_id || null,
      order_id: passport.order_id || null
    });

  } catch (error) {
    console.error("[Passport Verify] Database error:", error);
    return res.status(500).json({ error: "Failed to verify passport" });
  }
}

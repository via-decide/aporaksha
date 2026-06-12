import crypto from "crypto";
import { getDB } from "../../lib/db.js";
import { initDB } from "../../lib/initDb.js";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

async function isStudentVerified(email) {
  if (!email) return false;
  try {
    const gatewayDb = await open({
      filename: "/Users/dharamdaxini/Downloads/via/daxini.xyz/database/daxini.db",
      driver: sqlite3.Database,
    });
    const row = await gatewayDb.get(`
      SELECT verification_status FROM student_verifications 
      WHERE academic_email = ? AND verification_status IN ('OCR_VERIFIED', 'MANUAL_APPROVED')
    `, [email]);
    await gatewayDb.close();
    return !!row;
  } catch (e) {
    console.error("[APORAKSHA] Failed to check student status in gateway DB:", e);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const { email, article_slug, newsletter_slug, amount } = req.body || {};

  if (!email || !amount) {
    return res.status(400).json({ error: "email and amount required" });
  }

  // Enforce Geoblocking for India/INR requests unless student is verified
  const country = req.headers['cf-ipcountry'] || req.headers['x-country-code'] || 'US';
  const currency = req.body.currency || 'INR';

  if (country === 'IN' || currency === 'INR') {
    const verified = await isStudentVerified(email);
    if (!verified) {
      return res.status(403).json({
        error: 'SaaS Billing Restricted',
        code: 'regional_saas_billing_blocked',
        message: 'SaaS licensing and subscription checkouts are not available in India. Access is restricted to local-first workstations or verified academic student accounts.'
      });
    }
  }

  await initDB();
  const db = await getDB();

  const orderId = "order_" + crypto.randomBytes(6).toString("hex");

  const order = {
    id: orderId,
    amount: amount || 69900,
    currency: "INR",
    email,
    article_slug,
    newsletter_slug,
  };

  await db.run(
    "INSERT INTO orders (id, amount, currency, email, article_slug, newsletter_slug, status, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [order.id, order.amount, order.currency, email, article_slug, newsletter_slug, "created", 0]
  );

  return res.status(200).json(order);
}

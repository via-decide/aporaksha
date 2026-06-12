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
  if (req.method !== "GET") {
    return res.status(405).end();
  }

  const { email, article_slug, newsletter_slug } = req.query;

  if (!email) {
    return res.status(400).json({ error: "email required" });
  }

  if (!article_slug && !newsletter_slug) {
    return res.status(400).json({ error: "article_slug or newsletter_slug required" });
  }

  await initDB();
  const db = await getDB();

  const query = `
    SELECT * FROM orders
    WHERE email = ?
      AND verified = 1
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      AND (${article_slug ? "article_slug = ?" : "newsletter_slug = ?"})
    LIMIT 1
  `;

  const params = article_slug ? [email, article_slug] : [email, newsletter_slug];
  const subscription = await db.get(query, params);

  if (subscription) {
    return res.status(200).json({
      hasAccess: true,
      expiresAt: subscription.expires_at,
      email: subscription.email,
      article_slug: subscription.article_slug,
      newsletter_slug: subscription.newsletter_slug,
    });
  }

  // Fallback: Check if verified student
  const verifiedStudent = await isStudentVerified(email);
  if (verifiedStudent) {
    return res.status(200).json({
      hasAccess: true,
      expiresAt: null,
      email: email,
      article_slug: article_slug || null,
      newsletter_slug: newsletter_slug || null,
      source: "student_verification"
    });
  }

  return res.status(200).json({ hasAccess: false });
}

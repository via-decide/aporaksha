import { getDB } from "../../lib/db.js";
import { initDB } from "../../lib/initDb.js";

async function isStudentVerified(email) {
  if (!email) return false;
  try {
    const gatewayUrl = process.env.GATEWAY_URL || "https://daxini.xyz";
    console.log(`[APORAKSHA] Checking student status for ${email} at ${gatewayUrl}/api/verify/student/status`);
    const res = await fetch(`${gatewayUrl}/api/verify/student/status?email=${encodeURIComponent(email)}&t=${Date.now()}`, {
      cache: 'no-store'
    });
    
    const text = await res.text();
    console.log(`[APORAKSHA] Student status response: ${res.status} ${text}`);
    
    if (!res.ok) {
      console.error(`[APORAKSHA] Student status lookup failed with status: ${res.status}`);
      return false;
    }
    const data = JSON.parse(text);
    return !!data.verified;
  } catch (e) {
    console.error("[APORAKSHA] Failed to check student status in gateway API:", e);
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

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

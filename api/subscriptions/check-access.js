import { getDB } from "../../lib/db";
import { initDB } from "../../lib/initDb";

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

  return res.status(200).json({ hasAccess: false });
}

import crypto from "crypto";
import { getDB } from "../../lib/db";
import { initDB } from "../../lib/initDb";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const { email, article_slug, newsletter_slug, amount } = req.body || {};

  if (!email || !amount) {
    return res.status(400).json({ error: "email and amount required" });
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

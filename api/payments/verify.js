import crypto from "crypto";
import { getDB } from "../../lib/db";
import { initDB } from "../../lib/initDb";
import { logEvent } from "../../lib/logger";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const secret = process.env.RAZORPAY_KEY_SECRET;
  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ success: false });
  }

  await initDB();
  const db = await getDB();
  const order = await db.get("SELECT * FROM orders WHERE id = ?", [razorpay_order_id]);

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await db.run("UPDATE orders SET verified = ?, expires_at = ? WHERE id = ?", [
    1,
    expiresAt.toISOString(),
    razorpay_order_id,
  ]);
  await logEvent("payment_verified", {
    razorpay_order_id,
    razorpay_payment_id,
    email: order.email,
    article_slug: order.article_slug,
    newsletter_slug: order.newsletter_slug,
  });

  return res.status(200).json({
    success: true,
    email: order.email,
    article_slug: order.article_slug,
    newsletter_slug: order.newsletter_slug,
    expiresAt: expiresAt.toISOString(),
  });
}

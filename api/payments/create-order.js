import crypto from "crypto";
import { getDB } from "../../lib/db";
import { initDB } from "../../lib/initDb";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  await initDB();
  const db = await getDB();

  const orderId = "order_" + crypto.randomBytes(6).toString("hex");

  const order = {
    id: orderId,
    amount: 50000,
    currency: "INR",
  };

  await db.run(
    "INSERT INTO orders (id, amount, currency, status, verified) VALUES (?, ?, ?, ?, ?)",
    [order.id, order.amount, order.currency, "created", 0]
  );

  return res.status(200).json(order);
}

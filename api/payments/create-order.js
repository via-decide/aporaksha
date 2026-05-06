import crypto from "crypto";
import { createOrder } from "../../lib/orderStore";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const orderId = "order_" + crypto.randomBytes(6).toString("hex");

  const order = {
    id: orderId,
    amount: 50000,
    currency: "INR",
  };

  createOrder(order);

  return res.status(200).json(order);
}

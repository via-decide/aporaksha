import crypto from "crypto";
import { markVerified, getOrder } from "../../lib/orderStore";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  const secret = process.env.RAZORPAY_KEY_SECRET;

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ success: false });
  }

  const order = getOrder(razorpay_order_id);

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  markVerified(razorpay_order_id);

  return res.status(200).json({ success: true });
}

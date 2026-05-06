import crypto from "crypto";
import { getDB } from "../../lib/db";
import { initDB } from "../../lib/initDb";
import { enqueue } from "../../lib/queue";
import { detectFraud } from "../../lib/fraud";
import { logEvent } from "../../lib/logger";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];
    const body = JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    await initDB();
    const db = await getDB();

    const eventId = req.headers["x-razorpay-event-id"];
    if (!eventId) {
      return res.status(400).json({ error: "Missing event id" });
    }

    const existing = await db.get("SELECT * FROM webhook_events WHERE id = ?", [eventId]);
    if (existing) {
      return res.status(200).json({ status: "duplicate ignored" });
    }

    await db.run("INSERT INTO webhook_events (id, processed) VALUES (?, ?)", [eventId, 1]);

    if (req.body.event === "payment.captured") {
      const payment = req.body.payload.payment.entity;

      enqueue(async () => {
        const order = await db.get("SELECT * FROM orders WHERE id = ?", [payment.order_id]);

        if (detectFraud(order, payment)) {
          await logEvent("fraud_detected", payment);
          return;
        }

        await db.run("UPDATE orders SET status = ?, payment_id = ? WHERE id = ?", [
          "paid",
          payment.id,
          payment.order_id,
        ]);

        await logEvent("payment_processed", payment);
      });
    }

    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error(err);
    return res.status(500).end();
  }
}

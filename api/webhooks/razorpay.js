import crypto from "crypto";

const processedEventIds = new Set();

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return res.status(500).json({ error: "Webhook secret missing" });

    const signature = req.headers["x-razorpay-signature"];
    const rawBody = await readRawBody(req);
    const expectedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    if (!signature || signature !== expectedSignature) return res.status(400).json({ error: "Invalid signature" });

    const payload = JSON.parse(rawBody.toString("utf8"));
    const eventId = payload?.payload?.payment?.entity?.id || payload?.created_at;
    if (eventId && processedEventIds.has(eventId)) return res.status(200).json({ status: "ok" });

    if (eventId) processedEventIds.add(eventId);
    console.log("Webhook event:", payload?.event || "unknown");
    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

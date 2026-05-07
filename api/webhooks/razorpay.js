import crypto from "crypto";
import { getDB } from "../../lib/db";
import { initDB } from "../../lib/initDb";
import { enqueue } from "../../lib/queue";
import { logEvent } from "../../lib/logger";

export const config = { api: { bodyParser: false } };

const readRawBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});

function safeLog(type, payload) {
  console.error(JSON.stringify({ provider: "razorpay", type, ...payload, ts: new Date().toISOString() }));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = await readRawBody(req);
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (!signature || signature !== expected) return res.status(200).json({ ok: true });

    const payload = JSON.parse(rawBody || "{}");
    const eventId = req.headers["x-razorpay-event-id"] || payload?.payload?.payment?.entity?.id || payload?.id;
    if (!eventId) return res.status(200).json({ ok: true });

    await initDB();
    const db = await getDB();
    await db.run(
      `INSERT OR IGNORE INTO webhook_events (id, provider, event_type, signature, payload_raw, payload_json, processing_state, processing_attempts)
       VALUES (?, 'razorpay', ?, ?, ?, ?, 'PENDING', 0)`,
      [eventId, payload?.event || "unknown", signature, rawBody, JSON.stringify(payload)]
    );

    enqueue(async () => {
      try {
        await db.run("UPDATE webhook_events SET processing_state = 'PROCESSING', processing_attempts = processing_attempts + 1 WHERE id = ?", [eventId]);
        await logEvent("razorpay_webhook_received", { eventId, eventType: payload?.event || "unknown" });
        await db.run("UPDATE webhook_events SET processing_state = 'PROCESSED', processed_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?", [eventId]);
      } catch (error) {
        safeLog("worker_error", { eventId, error: error?.message || "unknown" });
        await db.run("UPDATE webhook_events SET processing_state = 'FAILED', last_error = ? WHERE id = ?", [error?.message || "unknown", eventId]);
      }
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    safeLog("ingestion_error", { error: error?.message || "unknown" });
    return res.status(200).json({ ok: true });
  }
}

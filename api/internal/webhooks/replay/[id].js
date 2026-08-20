import crypto from "node:crypto";
import { getDB } from "../../../../lib/db.js";
import { initDB } from "../../../../lib/initDb.js";
import { processWebhookEvent } from "../../../../lib/queue.js";

function isAuthorized(req, secret) {
  const match = (req.headers?.authorization || "").match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return false;
  const received = Buffer.from(match[1], "utf8");
  const expected = Buffer.from(secret, "utf8");
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const secret = process.env.INTERNAL_WEBHOOK_REPLAY_TOKEN;
  if (!secret) return res.status(503).json({ error: "replay_not_configured" });
  if (!isAuthorized(req, secret)) return res.status(401).json({ error: "unauthorized" });

  try {
    await initDB();
    const db = await getDB();
    const id = req.query.id;
    const event = await db.get("SELECT * FROM webhook_events WHERE id = ?", [id]);
    if (!event) return res.status(404).json({ error: "not_found" });
    // A successfully processed event must never be replayed: downstream
    // invoice, email, and audit-event writes are not all idempotent. The
    // conditional update also prevents two administrators from scheduling
    // the same failed event concurrently.
    const updated = await db.run(
      "UPDATE webhook_events SET processing_state = 'PENDING', last_error = NULL WHERE id = ? AND processing_state = 'FAILED'",
      [id]
    );
    if (updated.changes !== 1) {
      return res.status(409).json({ error: "event_not_replayable", state: event.processing_state });
    }
    // Do not leave this work on the in-memory queue after responding. Vercel
    // may freeze a serverless invocation as soon as its response is sent,
    // which would report a successful replay without processing the event.
    await processWebhookEvent(id);
    return res.status(200).json({ ok: true, replayed: id });
  } catch (error) {
    console.error(JSON.stringify({ type: "replay_error", error: error?.message || "unknown" }));
    return res.status(500).json({ error: "replay_failed" });
  }
}

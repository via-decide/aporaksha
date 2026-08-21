import crypto from "crypto";
import { getDB } from "../../lib/db.js";
import { initDB } from "../../lib/initDb.js";
import { enqueue, processWebhookEvent } from "../../lib/queue.js";

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

/** Constant-time compare that cannot throw on a length mismatch. */
function signatureMatches(expectedHex, receivedHex) {
  if (typeof receivedHex !== "string" || receivedHex.length !== expectedHex.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expectedHex, "utf8"), Buffer.from(receivedHex, "utf8"));
}

/**
 * Manual re-processing of one already-recorded webhook event, e.g. after
 * fixing whatever made processWebhookEvent() fail the first time. Folded in
 * here (2026-08-19, was api/internal/webhooks/replay/[id].js) to bring this
 * project back under Vercel Hobby's 12-serverless-functions-per-deployment
 * cap -- was its own file/function, functionally unchanged otherwise.
 *
 * Dispatched via `?replay=<id>` BEFORE Razorpay signature verification below,
 * since a replay trigger is never signed by Razorpay -- it would fail that
 * check every time if it ran through the same path.
 *
 * SECURITY NOTE, carried over unchanged from the original file: this has no
 * auth of its own. The two planning docs that describe this endpoint
 * (docs/tasks/IMPLEMENT_WEBHOOK_PIPELINE_NOW.md,
 * docs/tasks/implement-production-webhook-ingestion-pipeline.md) both
 * describe it as "admin-only" / "authenticated" -- that was never actually
 * built. Left as-is rather than silently adding a new auth requirement here,
 * since something may already call this without one; worth fixing as its
 * own deliberate change, not a side effect of a function-count consolidation.
 */
async function handleReplay(req, res, id) {
  try {
    await initDB();
    const db = await getDB();
    const event = await db.get("SELECT * FROM webhook_events WHERE id = ?", [id]);
    if (!event) return res.status(404).json({ error: "not_found" });
    await db.run("UPDATE webhook_events SET processing_state = 'PENDING', last_error = NULL WHERE id = ?", [id]);
    enqueue(async () => processWebhookEvent(id));
    return res.status(200).json({ ok: true, replayed: id });
  } catch (error) {
    safeLog("replay_error", { id, error: error?.message || "unknown" });
    return res.status(500).json({ error: "replay_failed" });
  }
}

/**
 * Razorpay webhook ingestion.
 *
 * STATUS CODES ARE LOAD-BEARING. Razorpay treats any 2xx as "delivered" and
 * stops retrying, so a 200 is a promise that the event is durably recorded.
 *
 * This previously returned 200 on every path — missing secret, bad signature,
 * missing id, and any thrown error. That was an over-correction to the
 * documented FUNCTION_INVOCATION_FAILED problem: it stopped the retries, but
 * by silently discarding events. A signature mismatch after a secret rotation,
 * or a transient DB failure, would acknowledge a real payment and drop it with
 * no trace and no retry.
 *
 *   200  recorded (or already recorded) -> safe to stop retrying
 *   400  signature rejected or unusable body -> retrying cannot help
 *   500  we failed to persist -> Razorpay MUST retry, nothing is lost
 *
 * The real fix for the timeout was keeping ingestion light, which is what the
 * enqueue-and-return structure below does.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (req.query.replay) return handleReplay(req, res, req.query.replay);

  let rawBody;
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      // Refuse rather than accept unverified events. 500 keeps Razorpay
      // retrying, so nothing is lost once the secret is configured.
      safeLog("not_configured", { error: "RAZORPAY_WEBHOOK_SECRET is not set" });
      return res.status(500).json({ error: "Webhook not configured" });
    }

    rawBody = await readRawBody(req);
    const signature = req.headers["x-razorpay-signature"];
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (!signatureMatches(expected, signature)) {
      safeLog("signature_rejected", {});
      return res.status(400).json({ error: "Invalid signature" });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody || "{}");
    } catch {
      return res.status(400).json({ error: "Malformed JSON" });
    }

    const eventId = req.headers["x-razorpay-event-id"] || payload?.payload?.payment?.entity?.id || payload?.id;
    if (!eventId) {
      // Nothing to key idempotency on. Deliberate rejection — a retry of the
      // same body would be equally unusable.
      safeLog("missing_event_id", { event: payload?.event });
      return res.status(400).json({ error: "No event id" });
    }

    await initDB();
    const db = await getDB();
    await db.run(
      `INSERT OR IGNORE INTO webhook_events (id, provider, event_type, signature, payload_raw, payload_json, processing_state, processing_attempts)
       VALUES (?, 'razorpay', ?, ?, ?, ?, 'PENDING', 0)`,
      [eventId, payload?.event || "unknown", signature, rawBody, JSON.stringify(payload)]
    );

    // The event is durably recorded above; from here we may safely answer 200.
    // Downstream processing failures are recoverable via the stored row and
    // the replay endpoint, so they must not turn into a retry storm.
    try {
      await processWebhookEvent(eventId);
    } catch (e) {
      safeLog("processing_error", { eventId, error: e?.message || "unknown" });
      return res.status(200).json({ ok: true, recorded: true, processing: "deferred" });
    }

    return res.status(200).json({ ok: true, eventId });
  } catch (error) {
    // Ingestion itself failed, so the event is NOT recorded. Ask for a retry.
    safeLog("ingestion_error", { error: error?.message || "unknown" });
    return res.status(500).json({ error: "Ingestion failed" });
  }
}

import { getDB } from "./db";
import { logEvent } from "./logger";

const queue = [];
let draining = false;

export function enqueue(task) {
  queue.push({ task, retries: 0 });
  void processQueue();
}

export async function processQueue() {
  if (draining) return;
  draining = true;

  while (queue.length > 0) {
    const item = queue[0];

    try {
      await item.task();
      queue.shift();
    } catch (err) {
      item.retries += 1;
      if (item.retries > 3) {
        console.error("Failed permanently:", err);
        queue.shift();
      }
    }
  }

  draining = false;
}

export async function processWebhookEvent(eventId) {
  const db = await getDB();
  const event = await db.get("SELECT * FROM webhook_events WHERE id = ?", [eventId]);
  if (!event || event.processing_state === "PROCESSED") return;
  try {
    await db.run("UPDATE webhook_events SET processing_state = 'PROCESSING', processing_attempts = processing_attempts + 1 WHERE id = ?", [eventId]);
    const payload = JSON.parse(event.payload_json || "{}");
    await logEvent("razorpay_webhook_received", { eventId, eventType: event.event_type, payloadId: payload?.id || null });
    await db.run("UPDATE webhook_events SET processing_state = 'PROCESSED', processed_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?", [eventId]);
  } catch (error) {
    await db.run("UPDATE webhook_events SET processing_state = 'FAILED', last_error = ? WHERE id = ?", [error?.message || "unknown", eventId]);
    console.error(JSON.stringify({ provider: "razorpay", type: "worker_error", eventId, error: error?.message || "unknown", ts: new Date().toISOString() }));
    throw error;
  }
}

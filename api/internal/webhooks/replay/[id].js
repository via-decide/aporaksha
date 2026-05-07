import { getDB } from "../../../../lib/db";
import { initDB } from "../../../../lib/initDb";
import { enqueue } from "../../../../lib/queue";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    await initDB();
    const db = await getDB();
    const id = req.query.id;
    const event = await db.get("SELECT * FROM webhook_events WHERE id = ?", [id]);
    if (!event) return res.status(404).json({ error: "not_found" });
    await db.run("UPDATE webhook_events SET processing_state = 'PENDING', last_error = NULL WHERE id = ?", [id]);
    enqueue(async () => db.run("UPDATE webhook_events SET processing_state = 'PROCESSED', processed_at = CURRENT_TIMESTAMP WHERE id = ?", [id]));
    return res.status(200).json({ ok: true, replayed: id });
  } catch (error) {
    console.error(JSON.stringify({ type: "replay_error", error: error?.message || "unknown" }));
    return res.status(500).json({ error: "replay_failed" });
  }
}

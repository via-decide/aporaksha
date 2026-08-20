import { getDB } from './db.js';

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  const db = await getDB();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS processed_webhook_events (
      event_id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'razorpay',
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  schemaReady = true;
}

export async function isProcessed(eventId) {
  if (!eventId) return false;
  await ensureSchema();
  const db = await getDB();
  const row = await db.get('SELECT event_id FROM processed_webhook_events WHERE event_id = ?', [eventId]);
  return !!row;
}

export async function markProcessed(eventId, source) {
  if (!eventId) return;
  await ensureSchema();
  const db = await getDB();
  await db.run('INSERT OR IGNORE INTO processed_webhook_events (event_id, source) VALUES (?, ?)', [eventId, source || 'razorpay']);
}

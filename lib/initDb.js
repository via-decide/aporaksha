import { getDB } from "./db";

let initialized = false;

export async function initDB() {
  if (initialized) return;

  const db = await getDB();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      amount INTEGER,
      currency TEXT,
      status TEXT,
      payment_id TEXT,
      verified INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      payload TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      provider TEXT,
      event_type TEXT,
      signature TEXT,
      payload_raw TEXT,
      payload_json TEXT,
      processing_state TEXT DEFAULT 'PENDING',
      processing_attempts INTEGER DEFAULT 0,
      processed_at DATETIME,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  initialized = true;
}

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

  const tableInfo = await db.all("PRAGMA table_info(orders)");
  const columns = new Set(tableInfo.map((col) => col.name));

  if (!columns.has("email")) await db.run("ALTER TABLE orders ADD COLUMN email TEXT");
  if (!columns.has("article_slug")) await db.run("ALTER TABLE orders ADD COLUMN article_slug TEXT");
  if (!columns.has("newsletter_slug")) await db.run("ALTER TABLE orders ADD COLUMN newsletter_slug TEXT");
  if (!columns.has("expires_at")) await db.run("ALTER TABLE orders ADD COLUMN expires_at DATETIME");

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_email_verified ON orders(email, verified, expires_at);
    CREATE INDEX IF NOT EXISTS idx_orders_article ON orders(article_slug, verified, expires_at);
    CREATE INDEX IF NOT EXISTS idx_orders_newsletter ON orders(newsletter_slug, verified, expires_at);
  `);

  initialized = true;
}

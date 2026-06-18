import { getDB } from "./db.js";

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

    CREATE TABLE IF NOT EXISTS invoices (
      invoice_id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE,
      created_at DATETIME,
      payment_id TEXT,
      order_id TEXT,
      customer_name TEXT,
      customer_email TEXT,
      product_name TEXT,
      product_type TEXT,
      currency TEXT,
      amount INTEGER,
      tax_amount INTEGER,
      total_amount INTEGER,
      payment_provider TEXT,
      status TEXT,
      business_name TEXT,
      business_address TEXT,
      pdf_path TEXT,
      json_path TEXT
    );

    CREATE TABLE IF NOT EXISTS invoice_sequences (
      year INTEGER PRIMARY KEY,
      last_val INTEGER
    );

    CREATE TABLE IF NOT EXISTS passports (
      passport_id TEXT PRIMARY KEY,
      customer_name TEXT,
      email TEXT UNIQUE,
      razorpay_customer_id TEXT,
      order_id TEXT,
      purchased_products TEXT,
      access_entitlements TEXT,
      activation_status TEXT,
      onboarding_progress TEXT,
      support_history TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS passport_sequences (
      id INTEGER PRIMARY KEY,
      last_val INTEGER
    );
  `);

  const tableInfo = await db.all("PRAGMA table_info(orders)");
  const columns = new Set(tableInfo.map((col) => col.name));

  if (!columns.has("email")) await db.run("ALTER TABLE orders ADD COLUMN email TEXT");
  if (!columns.has("user_id")) await db.run("ALTER TABLE orders ADD COLUMN user_id TEXT");
  if (!columns.has("article_slug")) await db.run("ALTER TABLE orders ADD COLUMN article_slug TEXT");
  if (!columns.has("newsletter_slug")) await db.run("ALTER TABLE orders ADD COLUMN newsletter_slug TEXT");
  if (!columns.has("expires_at")) await db.run("ALTER TABLE orders ADD COLUMN expires_at DATETIME");
  if (!columns.has("invoice_path")) await db.run("ALTER TABLE orders ADD COLUMN invoice_path TEXT");

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_email_verified ON orders(email, verified, expires_at);
    CREATE INDEX IF NOT EXISTS idx_orders_article ON orders(article_slug, verified, expires_at);
    CREATE INDEX IF NOT EXISTS idx_orders_newsletter ON orders(newsletter_slug, verified, expires_at);
  `);

  initialized = true;
}

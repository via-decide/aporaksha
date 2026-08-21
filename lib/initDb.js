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
      password_hash TEXT,
      role TEXT DEFAULT 'user',
      nfc_chip_id TEXT,
      razorpay_customer_id TEXT,
      order_id TEXT,
      razorpay_subscription_id TEXT,
      billing_status TEXT,
      purchased_products TEXT,
      access_entitlements TEXT,
      activation_status TEXT,
      onboarding_progress TEXT,
      support_history TEXT,
      auth_depth INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS passport_sequences (
      id INTEGER PRIMARY KEY,
      last_val INTEGER
    );
    CREATE TABLE IF NOT EXISTS manual_review_queue (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      payment_id TEXT,
      email TEXT,
      product_id TEXT,
      failure_reason TEXT,
      status TEXT DEFAULT 'PENDING',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS redemption_codes (
      code TEXT PRIMARY KEY,
      is_used INTEGER DEFAULT 0,
      redeemed_by_email TEXT,
      redeemed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      session_id TEXT PRIMARY KEY, principal_identity_id TEXT NOT NULL,
      token_jti TEXT NOT NULL UNIQUE, device_id TEXT, authenticated_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL, revoked_at DATETIME
    );
    CREATE TABLE IF NOT EXISTS consent_records (
      consent_id TEXT PRIMARY KEY, principal_identity_id TEXT NOT NULL, purpose_code TEXT NOT NULL,
      notice_version TEXT NOT NULL, consent_version TEXT NOT NULL, status TEXT NOT NULL,
      affirmative_action TEXT, granted_at DATETIME, withdrawn_at DATETIME, source_surface TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS privacy_requests (
      request_id TEXT PRIMARY KEY, principal_identity_id TEXT NOT NULL, request_type TEXT NOT NULL,
      status TEXT NOT NULL, reason_code TEXT, legal_hold INTEGER NOT NULL DEFAULT 0,
      requested_at DATETIME NOT NULL, identity_verified_at DATETIME, completed_at DATETIME,
      completion_evidence_reference TEXT
    );
    CREATE TABLE IF NOT EXISTS privacy_request_events (
      event_id TEXT PRIMARY KEY, request_id TEXT NOT NULL, event_type TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS privacy_corrections (
      correction_id TEXT PRIMARY KEY, request_id TEXT NOT NULL, field_name TEXT NOT NULL,
      proposed_value TEXT NOT NULL, status TEXT NOT NULL, created_at DATETIME NOT NULL
    );
    CREATE TABLE IF NOT EXISTS privacy_erasure_evidence (
      evidence_id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, opaque_subject_hash TEXT NOT NULL,
      categories_deleted TEXT NOT NULL, categories_anonymized TEXT NOT NULL, categories_retained TEXT NOT NULL,
      retention_reason_codes TEXT NOT NULL, status TEXT NOT NULL, created_at DATETIME NOT NULL
    );
    CREATE TABLE IF NOT EXISTS privacy_nominations (
      nomination_id TEXT PRIMARY KEY, principal_identity_id TEXT NOT NULL, nominee_name TEXT NOT NULL,
      nominee_contact TEXT NOT NULL, relationship_optional TEXT, status TEXT NOT NULL,
      created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
    );
    CREATE TABLE IF NOT EXISTS privacy_grievances (
      grievance_id TEXT PRIMARY KEY, principal_identity_id TEXT, subject TEXT NOT NULL, category TEXT NOT NULL,
      description TEXT NOT NULL, created_at DATETIME NOT NULL, status TEXT NOT NULL,
      response_due_at DATETIME NOT NULL, resolved_at DATETIME, secure_lookup_hash TEXT UNIQUE
    );
    CREATE TABLE IF NOT EXISTS privacy_audit_events (
      event_id TEXT PRIMARY KEY, principal_reference TEXT NOT NULL, event_type TEXT NOT NULL,
      object_reference TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS privacy_notice_deliveries (
      delivery_id TEXT PRIMARY KEY, principal_identity_id TEXT NOT NULL, notice_version TEXT NOT NULL,
      delivered_at DATETIME NOT NULL, delivery_channel TEXT NOT NULL, purpose_set TEXT NOT NULL,
      UNIQUE(principal_identity_id, notice_version, delivery_channel)
    );
    CREATE TABLE IF NOT EXISTS privacy_incidents (
      incident_id TEXT PRIMARY KEY, external_event_id TEXT NOT NULL UNIQUE, detected_at DATETIME NOT NULL,
      confirmed_at DATETIME, status TEXT NOT NULL, data_categories TEXT NOT NULL,
      affected_principal_count INTEGER NOT NULL DEFAULT 0, severity TEXT NOT NULL, containment_status TEXT NOT NULL,
      principal_notification_status TEXT NOT NULL, board_notification_status TEXT NOT NULL,
      detailed_report_due_at DATETIME, closed_at DATETIME
    );
    CREATE TABLE IF NOT EXISTS privacy_incident_principals (
      incident_id TEXT NOT NULL, opaque_principal_reference TEXT NOT NULL, notification_evidence TEXT,
      PRIMARY KEY(incident_id, opaque_principal_reference)
    );
    CREATE TABLE IF NOT EXISTS erasure_suppression (
      opaque_subject_hash TEXT PRIMARY KEY, erased_at DATETIME NOT NULL, reason_code TEXT NOT NULL
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

  const passportTableInfo = await db.all("PRAGMA table_info(passports)");
  const passportColumns = new Set(passportTableInfo.map((col) => col.name));

  if (!passportColumns.has("country")) await db.run("ALTER TABLE passports ADD COLUMN country TEXT");
  if (!passportColumns.has("timezone")) await db.run("ALTER TABLE passports ADD COLUMN timezone TEXT");
  if (!passportColumns.has("locale")) await db.run("ALTER TABLE passports ADD COLUMN locale TEXT");
  if (!passportColumns.has("razorpay_subscription_id")) await db.run("ALTER TABLE passports ADD COLUMN razorpay_subscription_id TEXT");
  if (!passportColumns.has("billing_status")) await db.run("ALTER TABLE passports ADD COLUMN billing_status TEXT");
  if (!passportColumns.has("auth_depth")) await db.run("ALTER TABLE passports ADD COLUMN auth_depth INTEGER DEFAULT 1");

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_email_verified ON orders(email, verified, expires_at);
    CREATE INDEX IF NOT EXISTS idx_orders_article ON orders(article_slug, verified, expires_at);
    CREATE INDEX IF NOT EXISTS idx_orders_newsletter ON orders(newsletter_slug, verified, expires_at);
  `);

  initialized = true;
}

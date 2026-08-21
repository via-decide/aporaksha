import { getDB } from '../db.js';
import { isValidHandle, validateCreatorInput, validateOfferInput } from './types.js';

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  const db = await getDB();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS creators (
      handle TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      bio TEXT DEFAULT '',
      contact_email TEXT,
      avatar_url TEXT,
      status TEXT NOT NULL DEFAULT 'onboarding',
      payment_ready INTEGER NOT NULL DEFAULT 0,
      razorpay_account_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS offers (
      offer_id TEXT PRIMARY KEY,
      creator_handle TEXT NOT NULL REFERENCES creators(handle),
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      offer_type TEXT NOT NULL,
      amount_minor INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'INR',
      duration_minutes INTEGER,
      file_label TEXT,
      file_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS handle_reservations (
      handle TEXT PRIMARY KEY,
      reserved_by_email TEXT NOT NULL,
      reserved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      claimed INTEGER NOT NULL DEFAULT 0
    );
  `);
  schemaReady = true;
}

// ── Handle reservation (atomic) ──────────────────────────────────────

export async function reserveHandle(handle, email) {
  if (!isValidHandle(handle)) return { ok: false, error: 'invalid_handle' };
  await ensureSchema();
  const db = await getDB();

  const existing = await db.get('SELECT handle FROM creators WHERE handle = ?', [handle]);
  if (existing) return { ok: false, error: 'handle_taken' };

  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 60 * 1000);

  const reserved = await db.get(
    'SELECT handle, reserved_by_email, expires_at, claimed FROM handle_reservations WHERE handle = ?',
    [handle]
  );

  if (reserved) {
    if (reserved.claimed) return { ok: false, error: 'handle_taken' };
    const exp = new Date(reserved.expires_at);
    if (exp > now && reserved.reserved_by_email !== email) {
      return { ok: false, error: 'handle_reserved' };
    }
    await db.run(
      'UPDATE handle_reservations SET reserved_by_email = ?, reserved_at = ?, expires_at = ?, claimed = 0 WHERE handle = ?',
      [email, now.toISOString(), expires.toISOString(), handle]
    );
  } else {
    await db.run(
      'INSERT INTO handle_reservations (handle, reserved_by_email, reserved_at, expires_at, claimed) VALUES (?, ?, ?, ?, 0)',
      [handle, email, now.toISOString(), expires.toISOString()]
    );
  }

  return { ok: true, handle, expiresAt: expires.toISOString() };
}

// ── Creator CRUD ─────────────────────────────────────────────────────

export async function createCreator(data) {
  const errors = validateCreatorInput(data);
  if (errors.length) return { ok: false, errors };
  await ensureSchema();
  const db = await getDB();

  const reservation = await db.get(
    'SELECT handle, reserved_by_email, expires_at, claimed FROM handle_reservations WHERE handle = ?',
    [data.handle]
  );

  if (reservation) {
    if (reservation.claimed) return { ok: false, errors: ['handle already claimed'] };
    const exp = new Date(reservation.expires_at);
    if (exp > new Date() && reservation.reserved_by_email !== data.contactEmail) {
      return { ok: false, errors: ['handle reserved by another user'] };
    }
  }

  const existing = await db.get('SELECT handle FROM creators WHERE handle = ?', [data.handle]);
  if (existing) return { ok: false, errors: ['handle taken'] };

  await db.run(
    `INSERT INTO creators (handle, display_name, bio, contact_email, avatar_url, status, payment_ready)
     VALUES (?, ?, ?, ?, ?, 'active', 0)`,
    [data.handle, data.displayName, data.bio || '', data.contactEmail || '', data.avatarUrl || '']
  );

  if (reservation) {
    await db.run('UPDATE handle_reservations SET claimed = 1 WHERE handle = ?', [data.handle]);
  }

  return { ok: true, handle: data.handle };
}

export async function getCreator(handle) {
  await ensureSchema();
  const db = await getDB();
  const row = await db.get('SELECT * FROM creators WHERE handle = ?', [handle]);
  if (!row) return null;
  return {
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    contactEmail: row.contact_email,
    avatarUrl: row.avatar_url,
    status: row.status,
    paymentReady: !!row.payment_ready,
    razorpayAccountId: row.razorpay_account_id,
    createdAt: row.created_at,
  };
}

export async function updateCreator(handle, updates) {
  await ensureSchema();
  const db = await getDB();
  const fields = [];
  const values = [];

  if (updates.displayName !== undefined) { fields.push('display_name = ?'); values.push(updates.displayName); }
  if (updates.bio !== undefined) { fields.push('bio = ?'); values.push(updates.bio); }
  if (updates.contactEmail !== undefined) { fields.push('contact_email = ?'); values.push(updates.contactEmail); }
  if (updates.avatarUrl !== undefined) { fields.push('avatar_url = ?'); values.push(updates.avatarUrl); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.paymentReady !== undefined) { fields.push('payment_ready = ?'); values.push(updates.paymentReady ? 1 : 0); }
  if (updates.razorpayAccountId !== undefined) { fields.push('razorpay_account_id = ?'); values.push(updates.razorpayAccountId); }

  if (!fields.length) return { ok: true };

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(handle);

  await db.run(`UPDATE creators SET ${fields.join(', ')} WHERE handle = ?`, values);
  return { ok: true };
}

export async function listCreators(status) {
  await ensureSchema();
  const db = await getDB();
  const query = status
    ? 'SELECT * FROM creators WHERE status = ? ORDER BY created_at DESC'
    : 'SELECT * FROM creators ORDER BY created_at DESC';
  const rows = await db.all(query, status ? [status] : []);
  return rows.map(row => ({
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    status: row.status,
    paymentReady: !!row.payment_ready,
    createdAt: row.created_at,
  }));
}

// ── Offer CRUD ───────────────────────────────────────────────────────

export async function createOffer(creatorHandle, data) {
  const errors = validateOfferInput(data);
  if (data.offerType === 'digital_file' && !data.fileUrl && data.status === 'active') {
    errors.push('digital_file offers require fileUrl before activation');
  }
  if (errors.length) return { ok: false, errors };
  await ensureSchema();
  const db = await getDB();

  const creator = await db.get('SELECT handle FROM creators WHERE handle = ?', [creatorHandle]);
  if (!creator) return { ok: false, errors: ['creator not found'] };

  const offerId = data.offerId || crypto.randomUUID();
  await db.run(
    `INSERT INTO offers (offer_id, creator_handle, title, description, offer_type, amount_minor, currency,
     duration_minutes, file_label, file_url, status, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [offerId, creatorHandle, data.title, data.description || '', data.offerType,
     data.amountMinor, data.currency || 'INR', data.durationMinutes || null,
     data.fileLabel || null, data.fileUrl || null,
     data.status || (data.offerType === 'digital_file' && !data.fileUrl ? 'draft' : 'active'),
     data.sortOrder || 0]
  );

  return { ok: true, offerId };
}

export async function getOffer(offerId) {
  await ensureSchema();
  const db = await getDB();
  const row = await db.get('SELECT * FROM offers WHERE offer_id = ?', [offerId]);
  if (!row) return null;
  return mapOfferRow(row);
}

export async function getOfferForFulfillment(offerId) {
  await ensureSchema();
  const db = await getDB();
  const row = await db.get('SELECT * FROM offers WHERE offer_id = ?', [offerId]);
  if (!row) return null;
  return { ...mapOfferRow(row), fileUrl: row.file_url };
}

export async function listOffers(creatorHandle, includeInactive) {
  await ensureSchema();
  const db = await getDB();
  const query = includeInactive
    ? 'SELECT * FROM offers WHERE creator_handle = ? ORDER BY sort_order ASC, created_at ASC'
    : "SELECT * FROM offers WHERE creator_handle = ? AND status = 'active' ORDER BY sort_order ASC, created_at ASC";
  const rows = await db.all(query, [creatorHandle]);
  return rows.map(mapOfferRow);
}

export async function updateOffer(offerId, creatorHandle, updates) {
  await ensureSchema();
  const db = await getDB();

  const existing = await db.get(
    'SELECT offer_id, offer_type, file_url, status FROM offers WHERE offer_id = ? AND creator_handle = ?',
    [offerId, creatorHandle]
  );
  if (!existing) return { ok: false, errors: ['offer not found'] };

  const resultingFileUrl = updates.fileUrl !== undefined ? updates.fileUrl : existing.file_url;
  const resultingStatus = updates.status !== undefined ? updates.status : existing.status;
  if (existing.offer_type === 'digital_file' && resultingStatus === 'active' && !resultingFileUrl) {
    return { ok: false, errors: ['digital_file offers require fileUrl before activation'] };
  }

  const fields = [];
  const values = [];

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.amountMinor !== undefined) { fields.push('amount_minor = ?'); values.push(updates.amountMinor); }
  if (updates.durationMinutes !== undefined) { fields.push('duration_minutes = ?'); values.push(updates.durationMinutes); }
  if (updates.fileLabel !== undefined) { fields.push('file_label = ?'); values.push(updates.fileLabel); }
  if (updates.fileUrl !== undefined) { fields.push('file_url = ?'); values.push(updates.fileUrl); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(updates.sortOrder); }

  if (!fields.length) return { ok: true };

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(offerId);

  await db.run(`UPDATE offers SET ${fields.join(', ')} WHERE offer_id = ?`, values);
  return { ok: true };
}

export async function deleteOffer(offerId, creatorHandle) {
  await ensureSchema();
  const db = await getDB();
  await db.run(
    "UPDATE offers SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE offer_id = ? AND creator_handle = ?",
    [offerId, creatorHandle]
  );
  return { ok: true };
}

function mapOfferRow(row) {
  return {
    offerId: row.offer_id,
    creatorHandle: row.creator_handle,
    title: row.title,
    description: row.description,
    offerType: row.offer_type,
    amountMinor: row.amount_minor,
    currency: row.currency,
    durationMinutes: row.duration_minutes,
    fileLabel: row.file_label,
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

// ── Seed data (Ashok migration) ──────────────────────────────────────

export async function seedAshokIfNeeded() {
  await ensureSchema();
  const db = await getDB();
  const existing = await db.get('SELECT handle FROM creators WHERE handle = ?', ['ashok-verma']);
  if (existing) return false;

  await db.run(
    `INSERT INTO creators (handle, display_name, bio, contact_email, status, payment_ready)
     VALUES ('ashok-verma', 'Ashok Verma', 'Strategy & mentorship for creators and builders.', 'HelloAshokVerma@gmail.com', 'active', 0)`,
    []
  );

  const offers = [
    { id: 'discovery-call', title: 'Discovery Call', desc: '15 mins — Video Call', type: 'session', amount: 0, dur: 15 },
    { id: 'mentorship-strategy', title: '1:1 Mentorship & Strategy', desc: '60 mins — Deep Dive', type: 'session', amount: 125000, dur: 60 },
    { id: 'portfolio-review', title: 'Portfolio Review', desc: '45 mins — Feedback Session', type: 'session', amount: 125000, dur: 45 },
  ];

  for (const o of offers) {
    await db.run(
      `INSERT INTO offers (offer_id, creator_handle, title, description, offer_type, amount_minor, currency, duration_minutes, status, sort_order)
       VALUES (?, 'ashok-verma', ?, ?, ?, ?, 'INR', ?, 'active', ?)`,
      [o.id, o.title, o.desc, o.type, o.amount, o.dur, offers.indexOf(o)]
    );
  }

  return true;
}

export async function seedPriyaIfNeeded() {
  await ensureSchema();
  const db = await getDB();
  const existing = await db.get('SELECT handle FROM creators WHERE handle = ?', ['priya-design']);
  if (existing) return false;

  await db.run(
    `INSERT INTO creators (handle, display_name, bio, contact_email, status, payment_ready)
     VALUES ('priya-design', 'Priya Sharma', 'Brand identity & UI/UX design for startups. Based in Mumbai.', '', 'active', 0)`,
    []
  );

  const offers = [
    { id: 'brand-audit', title: 'Brand Audit', desc: '30 min review of your visual identity', type: 'session', amount: 50000, dur: 30 },
    { id: 'logo-package', title: 'Logo Design Package', desc: 'Complete logo + brand mark + usage guidelines', type: 'service', amount: 350000, dur: null },
    { id: 'ui-templates', title: 'Startup UI Kit', desc: 'Figma component library — 120+ components', type: 'digital_file', amount: 99900, dur: null, status: 'draft' },
  ];

  for (const o of offers) {
    await db.run(
      `INSERT INTO offers (offer_id, creator_handle, title, description, offer_type, amount_minor, currency, duration_minutes, status, sort_order)
       VALUES (?, 'priya-design', ?, ?, ?, ?, 'INR', ?, ?, ?)`,
      [o.id, o.title, o.desc, o.type, o.amount, o.dur, o.status || 'active', offers.indexOf(o)]
    );
  }

  return true;
}

export async function seedDaxiniIfNeeded() {
  await ensureSchema();
  const db = await getDB();
  const existing = await db.get('SELECT handle FROM creators WHERE handle = ?', ['daxini']);
  if (existing) return false;

  await db.run(
    `INSERT INTO creators (handle, display_name, bio, contact_email, status, payment_ready)
     VALUES (?, ?, ?, ?, 'active', 0)`,
    [
      'daxini',
      'Daxini Dharmik',
      'Research analyst building from Kutch, India. 148+ intelligence dispatches on semiconductors, chemistry, and industrial bottleneck matrices.',
      'via.decide@gmail.com',
    ]
  );

  const offers = [
    { id: 'weekly-matrix', title: 'Weekly Bottleneck Matrix', desc: 'Scored supplier opportunity matrix across 5 industrial pillars — delivered every Monday.', type: 'digital_product', amount: 9900, dur: null },
    { id: 'chemistry-scan', title: 'Chemistry Research Scan', desc: '35 peer-reviewed paper syntheses with cross-reference matrix and India TRL register.', type: 'digital_product', amount: 14900, dur: null },
    { id: 'strategy-call', title: '1:1 Strategy Call', desc: '30 mins — Industrial sourcing, sovereign infra, or research deep-dive.', type: 'session', amount: 99900, dur: 30 },
    { id: 'discovery-intro', title: 'Discovery Call', desc: '15 mins — Free intro call.', type: 'session', amount: 0, dur: 15 },
  ];

  for (const [sortOrder, offer] of offers.entries()) {
    await db.run(
      `INSERT INTO offers (offer_id, creator_handle, title, description, offer_type, amount_minor, currency, duration_minutes, status, sort_order)
       VALUES (?, 'daxini', ?, ?, ?, ?, 'INR', ?, 'active', ?)`,
      [offer.id, offer.title, offer.desc, offer.type, offer.amount, offer.dur, sortOrder]
    );
  }

  return true;
}

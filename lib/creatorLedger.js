import { getDB } from './db.js';

let tablesCreated = false;

export async function ensureTables() {
  if (tablesCreated) return;
  const db = await getDB();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS creator_orders (
      order_id TEXT PRIMARY KEY,
      creator_slug TEXT NOT NULL,
      offer_id TEXT NOT NULL,
      offer_title TEXT,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      buyer_name TEXT NOT NULL,
      buyer_email TEXT NOT NULL,
      selected_date TEXT NOT NULL,
      selected_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'created',
      razorpay_order_id TEXT,
      razorpay_payment_id TEXT,
      razorpay_signature TEXT,
      notes TEXT,
      idempotency_key TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS creator_bookings (
      booking_id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      creator_slug TEXT NOT NULL,
      offer_id TEXT NOT NULL,
      offer_title TEXT,
      buyer_name TEXT NOT NULL,
      buyer_email TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  tablesCreated = true;
}

export async function findByIdempotencyKey(key) {
  const db = await getDB();
  return db.get('SELECT * FROM creator_orders WHERE idempotency_key = ?', [key]);
}

export async function createOrder(record) {
  await ensureTables();
  const db = await getDB();
  await db.run(
    `INSERT INTO creator_orders (order_id, creator_slug, offer_id, offer_title, amount, currency,
      buyer_name, buyer_email, selected_date, selected_time, status, razorpay_order_id, notes, idempotency_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [record.orderId, record.creatorSlug, record.offerId, record.offerTitle,
     record.amount, record.currency, record.buyerName, record.buyerEmail,
     record.selectedDate, record.selectedTime, record.status,
     record.razorpayOrderId || null, record.notes || null, record.idempotencyKey]
  );
}

export async function getOrder(orderId) {
  await ensureTables();
  const db = await getDB();
  const row = await db.get('SELECT * FROM creator_orders WHERE order_id = ?', [orderId]);
  if (!row) return null;
  return {
    orderId: row.order_id,
    creatorSlug: row.creator_slug,
    offerId: row.offer_id,
    offerTitle: row.offer_title,
    amount: row.amount,
    currency: row.currency,
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email,
    selectedDate: row.selected_date,
    selectedTime: row.selected_time,
    status: row.status,
    razorpayOrderId: row.razorpay_order_id,
    razorpayPaymentId: row.razorpay_payment_id,
  };
}

export async function updateOrderStatus(orderId, status, extra) {
  await ensureTables();
  const db = await getDB();
  if (extra && extra.razorpayPaymentId) {
    await db.run(
      'UPDATE creator_orders SET status = ?, razorpay_payment_id = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?',
      [status, extra.razorpayPaymentId, orderId]
    );
  } else {
    await db.run(
      'UPDATE creator_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?',
      [status, orderId]
    );
  }
}

export async function createBooking(record) {
  await ensureTables();
  const db = await getDB();
  await db.run(
    `INSERT INTO creator_bookings (booking_id, order_id, creator_slug, offer_id, offer_title,
      buyer_name, buyer_email, scheduled_date, scheduled_time, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [record.bookingId, record.orderId, record.creatorSlug, record.offerId,
     record.offerTitle, record.buyerName, record.buyerEmail,
     record.scheduledDate, record.scheduledTime, record.status]
  );
}

export async function getBookingByOrderId(orderId) {
  await ensureTables();
  const db = await getDB();
  return db.get('SELECT * FROM creator_bookings WHERE order_id = ?', [orderId]);
}

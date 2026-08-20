/**
 * Append-only financial ledger.
 *
 * Immutable entries — corrections happen via reversal entries, never updates.
 * All amounts in integer minor units (paise).
 *
 * Entry types:
 *   sale           buyer paid for an offer
 *   platform_fee   1% platform fee deducted from sale
 *   creator_payout net amount owed to creator
 *   refund         reversal of a sale
 *   fee_reversal   reversal of platform fee (on refund)
 *   membership     buyer membership payment
 */

import { getDB } from '../db.js';
import { platformFeeMinor, creatorPayoutMinor, PLATFORM_FEE_BASIS_POINTS } from './money.js';

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  const db = await getDB();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS financial_ledger (
      entry_id TEXT PRIMARY KEY,
      entry_type TEXT NOT NULL,
      order_id TEXT,
      creator_handle TEXT,
      buyer_email TEXT,
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      description TEXT DEFAULT '',
      reference_entry_id TEXT,
      provider TEXT,
      provider_txn_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_order ON financial_ledger(order_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_creator ON financial_ledger(creator_handle);
    CREATE INDEX IF NOT EXISTS idx_ledger_type ON financial_ledger(entry_type);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_order_type
      ON financial_ledger(order_id, entry_type)
      WHERE order_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_sale_components
      ON financial_ledger(order_id, entry_type)
      WHERE entry_type IN ('sale', 'platform_fee', 'creator_payout');
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_membership_payment
      ON financial_ledger(provider, provider_txn_id) WHERE entry_type = 'membership';
  `);
  schemaReady = true;
}

export async function recordSale(params) {
  await ensureSchema();
  const db = await getDB();
  const { orderId, creatorHandle, buyerEmail, amountMinor, currency, providerTxnId } = params;

  let saleId = crypto.randomUUID();
  const feeId = crypto.randomUUID();
  const payoutId = crypto.randomUUID();

  const fee = platformFeeMinor(amountMinor, PLATFORM_FEE_BASIS_POINTS);
  const payout = creatorPayoutMinor(amountMinor, PLATFORM_FEE_BASIS_POINTS);

  await db.run(
  const saleInsert = await db.run(
    `INSERT OR IGNORE INTO financial_ledger (entry_id, entry_type, order_id, creator_handle, buyer_email, amount_minor, currency, description, provider, provider_txn_id)
     VALUES (?, 'sale', ?, ?, ?, ?, ?, 'Purchase', 'razorpay', ?)`,
    [saleId, orderId, creatorHandle, buyerEmail, amountMinor, currency, providerTxnId]
  );
  let recordedSaleId = saleId;
  if (!saleInsert.changes) {
    const existing = await db.get(
      "SELECT entry_id FROM financial_ledger WHERE order_id = ? AND entry_type = 'sale'",
      [orderId]
    );
    recordedSaleId = existing.entry_id;
  }

  const persistedSale = await db.get(
    `SELECT entry_id FROM financial_ledger WHERE order_id = ? AND entry_type = 'sale'`,
    [orderId]
  );
  saleId = persistedSale.entry_id;

  await db.run(
    `INSERT OR IGNORE INTO financial_ledger (entry_id, entry_type, order_id, creator_handle, amount_minor, currency, description, reference_entry_id)
     VALUES (?, 'platform_fee', ?, ?, ?, ?, '1% platform fee', ?)`,
    [feeId, orderId, creatorHandle, fee, currency, recordedSaleId]
  );

  await db.run(
    `INSERT OR IGNORE INTO financial_ledger (entry_id, entry_type, order_id, creator_handle, amount_minor, currency, description, reference_entry_id)
     VALUES (?, 'creator_payout', ?, ?, ?, ?, 'Creator payout (99%)', ?)`,
    [payoutId, orderId, creatorHandle, payout, currency, recordedSaleId]
  );

  return { saleId: recordedSaleId, feeId, payoutId, fee, payout, created: saleInsert.changes > 0 };
}

export async function recordRefund(params) {
  await ensureSchema();
  const db = await getDB();
  const { orderId, creatorHandle, amountMinor, currency, originalSaleId } = params;

  const refundId = crypto.randomUUID();
  const feeReversalId = crypto.randomUUID();

  const fee = platformFeeMinor(amountMinor, PLATFORM_FEE_BASIS_POINTS);

  await db.run(
    `INSERT INTO financial_ledger (entry_id, entry_type, order_id, creator_handle, amount_minor, currency, description, reference_entry_id)
     VALUES (?, 'refund', ?, ?, ?, ?, 'Refund', ?)`,
    [refundId, orderId, creatorHandle, -amountMinor, currency, originalSaleId]
  );

  await db.run(
    `INSERT INTO financial_ledger (entry_id, entry_type, order_id, creator_handle, amount_minor, currency, description, reference_entry_id)
     VALUES (?, 'fee_reversal', ?, ?, ?, ?, 'Fee reversal on refund', ?)`,
    [feeReversalId, orderId, creatorHandle, fee, currency, originalSaleId]
  );

  return { refundId, feeReversalId };
}

export async function recordMembership(params) {
  await ensureSchema();
  const db = await getDB();
  const { buyerEmail, amountMinor, currency, providerTxnId, description } = params;

  const entryId = crypto.randomUUID();
  const result = await db.run(
    `INSERT OR IGNORE INTO financial_ledger (entry_id, entry_type, buyer_email, amount_minor, currency, description, provider, provider_txn_id)
     VALUES (?, 'membership', ?, ?, ?, ?, 'razorpay', ?)`,
    [entryId, buyerEmail, amountMinor, currency, description || 'Buyer membership', providerTxnId]
  );

  return { entryId, created: result.changes > 0 };
}

export async function getCreatorBalance(creatorHandle) {
  await ensureSchema();
  const db = await getDB();
  const row = await db.get(
    `SELECT COALESCE(SUM(amount_minor), 0) as balance
     FROM financial_ledger
     WHERE creator_handle = ? AND entry_type IN ('creator_payout', 'refund', 'fee_reversal')`,
    [creatorHandle]
  );
  return row?.balance || 0;
}

export async function getCreatorLedger(creatorHandle, limit) {
  await ensureSchema();
  const db = await getDB();
  return db.all(
    `SELECT * FROM financial_ledger WHERE creator_handle = ? ORDER BY created_at DESC LIMIT ?`,
    [creatorHandle, limit || 50]
  );
}

export async function getLedgerByOrder(orderId) {
  await ensureSchema();
  const db = await getDB();
  return db.all(
    `SELECT * FROM financial_ledger WHERE order_id = ? ORDER BY created_at ASC`,
    [orderId]
  );
}

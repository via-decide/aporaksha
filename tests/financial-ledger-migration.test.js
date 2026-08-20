import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const dbPath = `/tmp/aporaksha-ledger-migration-${process.pid}.db`;
process.env.APORAKSHA_DB_PATH = dbPath;

test('schema migration deduplicates legacy membership transaction ids', async () => {
  const legacyDb = await open({ filename: dbPath, driver: sqlite3.Database });
  await legacyDb.exec(`
    CREATE TABLE financial_ledger (
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
    INSERT INTO financial_ledger
      (entry_id, entry_type, buyer_email, amount_minor, provider, provider_txn_id, created_at)
    VALUES
      ('first', 'membership', 'buyer@example.com', 2900, 'razorpay', 'sub_legacy', '2025-01-01'),
      ('second', 'membership', 'buyer@example.com', 2900, 'razorpay', 'sub_legacy', '2025-02-01');
  `);
  await legacyDb.close();

  const financialLedger = await import('../lib/domain/financialLedger.js');
  const { getDB } = await import('../lib/db.js');

  await financialLedger.recordMembership({
    buyerEmail: 'buyer@example.com',
    amountMinor: 2900,
    currency: 'INR',
    providerTxnId: 'sub_legacy',
  });

  const db = await getDB();
  const rows = await db.all(
    "SELECT entry_id FROM financial_ledger WHERE entry_type = 'membership' AND provider_txn_id = 'sub_legacy'"
  );
  assert.deepEqual(rows, [{ entry_id: 'first' }]);

  const index = await db.get(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_ledger_membership_payment'"
  );
  assert.equal(index.name, 'idx_ledger_membership_payment');
});

test.after(() => fs.rmSync(dbPath, { force: true }));

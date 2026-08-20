import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const dbPath = `/tmp/aporaksha-review-followups-${process.pid}.db`;
process.env.APORAKSHA_DB_PATH = dbPath;
process.env.INTERNAL_WEBHOOK_REPLAY_TOKEN = 'replay-test-secret';

// Reproduce the schema/data left by the earlier seed before loading the store,
// so its schema migration is exercised rather than only its fresh seed path.
const fixture = await open({ filename: dbPath, driver: sqlite3.Database });
await fixture.exec(`
  CREATE TABLE creators (handle TEXT PRIMARY KEY);
  CREATE TABLE offers (
    offer_id TEXT PRIMARY KEY, creator_handle TEXT, title TEXT NOT NULL,
    description TEXT, offer_type TEXT NOT NULL, amount_minor INTEGER,
    currency TEXT, duration_minutes INTEGER, file_label TEXT, file_url TEXT,
    status TEXT, sort_order INTEGER, created_at DATETIME, updated_at DATETIME
  );
  INSERT INTO creators (handle) VALUES ('priya-design');
  INSERT INTO offers
    (offer_id, creator_handle, title, offer_type, file_url, status)
  VALUES ('ui-templates', 'priya-design', 'Startup UI Kit', 'digital_file', NULL, 'active');
`);
await fixture.close();

const store = await import('../lib/domain/creatorStore.js');
const { initDB } = await import('../lib/initDb.js');
const { getDB } = await import('../lib/db.js');
const { default: webhookHandler } = await import('../api/webhooks/[...path].js');

function request(id, authorization) {
  const req = {
    method: 'POST',
    query: { path: ['replay', id] },
    headers: authorization ? { authorization } : {},
  };
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
  return { req, res };
}

test('schema initialization migrates the previously seeded fileless offer to draft', async () => {
  await store.getCreator('priya-design');
  const db = await getDB();
  const offer = await db.get("SELECT status FROM offers WHERE offer_id = 'ui-templates'");
  assert.equal(offer.status, 'draft');
});

test('webhook replay requires authorization and refuses processed events', async () => {
  await initDB();
  const db = await getDB();
  await db.run(
    `INSERT INTO webhook_events (id, processing_state) VALUES ('processed-event', 'PROCESSED')`
  );

  let call = request('processed-event');
  await webhookHandler(call.req, call.res);
  assert.equal(call.res.statusCode, 401);

  call = request('processed-event', 'Bearer wrong-secret');
  await webhookHandler(call.req, call.res);
  assert.equal(call.res.statusCode, 401);

  call = request('processed-event', 'Bearer replay-test-secret');
  await webhookHandler(call.req, call.res);
  assert.equal(call.res.statusCode, 409);
  assert.equal(call.res.body.error, 'event_not_replayable');
  assert.equal((await db.get("SELECT processing_state FROM webhook_events WHERE id = 'processed-event'")).processing_state, 'PROCESSED');
});

test('authorized replay completes a failed event before responding', async () => {
  await initDB();
  const db = await getDB();
  await db.run(
    `INSERT INTO webhook_events
       (id, event_type, payload_json, processing_state, last_error)
     VALUES ('failed-event', 'test.noop', '{}', 'FAILED', 'transient failure')`
  );

  const call = request('failed-event', 'Bearer replay-test-secret');
  await webhookHandler(call.req, call.res);

  assert.equal(call.res.statusCode, 200);
  assert.equal(call.res.body.replayed, 'failed-event');
  const event = await db.get(
    "SELECT processing_state, processing_attempts, last_error FROM webhook_events WHERE id = 'failed-event'"
  );
  assert.equal(event.processing_state, 'PROCESSED');
  assert.equal(event.processing_attempts, 1);
  assert.equal(event.last_error, null);
});

test.after(() => fs.rmSync(dbPath, { force: true }));

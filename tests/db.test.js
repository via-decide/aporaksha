import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `aporaksha-db-${process.pid}.db`);
process.env.APORAKSHA_DB_PATH = dbPath;

const { getDB, withTransaction } = await import("../lib/db.js");
const db = await getDB();
await db.exec("CREATE TABLE queue_test (value TEXT)");

test("SQLite operations wait for a transaction and are not rolled back with it", async () => {
  let transactionStarted;
  const started = new Promise((resolve) => { transactionStarted = resolve; });
  let releaseTransaction;
  const release = new Promise((resolve) => { releaseTransaction = resolve; });

  const transaction = withTransaction(db, async (tx) => {
    await tx.run("INSERT INTO queue_test VALUES (?)", ["transaction"]);
    transactionStarted();
    await release;
    throw new Error("force rollback");
  });

  await started;
  let unrelatedFinished = false;
  const unrelatedWrite = db.run("INSERT INTO queue_test VALUES (?)", ["unrelated"])
    .then(() => { unrelatedFinished = true; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(unrelatedFinished, false);

  releaseTransaction();
  await assert.rejects(transaction, /force rollback/);
  await unrelatedWrite;
  assert.deepEqual(await db.all("SELECT value FROM queue_test"), [{ value: "unrelated" }]);
});

test("concurrent SQLite transactions are serialized", async () => {
  const transactions = ["first", "second"].map((value) => withTransaction(db, async (tx) => {
    await tx.run("INSERT INTO queue_test VALUES (?)", [value]);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }));

  await Promise.all(transactions);
  assert.deepEqual(
    (await db.all("SELECT value FROM queue_test WHERE value IN ('first', 'second') ORDER BY rowid")).map(({ value }) => value),
    ["first", "second"]
  );
});

test.after(async () => {
  try { fs.unlinkSync(dbPath); } catch {}
});

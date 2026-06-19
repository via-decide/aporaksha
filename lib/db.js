import sqlite3 from "sqlite3";
import { open } from "sqlite";

let dbPromise;

export function getDB() {
  if (!dbPromise) {
    const isVercel = !!process.env.VERCEL;
    const dbPath = process.env.APORAKSHA_DB_PATH || "./data.db";
    dbPromise = open({
      filename: isVercel ? "/tmp/data.db" : dbPath,
      driver: sqlite3.Database,
    });
  }

  return dbPromise;
}

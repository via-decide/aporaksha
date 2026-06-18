import sqlite3 from "sqlite3";
import { open } from "sqlite";

let dbPromise;

export function getDB() {
  if (!dbPromise) {
    const isVercel = !!process.env.VERCEL;
    dbPromise = open({
      filename: isVercel ? "/tmp/data.db" : "./data.db",
      driver: sqlite3.Database,
    });
  }

  return dbPromise;
}

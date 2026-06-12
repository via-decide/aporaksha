import sqlite3 from "sqlite3";
import { open } from "sqlite";

let dbPromise;

export function getDB() {
  if (!dbPromise) {
    const isVercel = typeof process !== "undefined" && process.env.VERCEL;
    const filename = isVercel ? "/tmp/data.db" : "./data.db";
    dbPromise = open({
      filename,
      driver: sqlite3.Database,
    });
  }

  return dbPromise;
}

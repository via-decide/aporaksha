import sqlite3 from "sqlite3";
import { open } from "sqlite";

let dbPromise;

export function getDB() {
  if (!dbPromise) {
    dbPromise = open({
      filename: "./data.db",
      driver: sqlite3.Database,
    });
  }

  return dbPromise;
}

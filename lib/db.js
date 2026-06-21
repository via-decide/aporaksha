import sqlite3 from "sqlite3";
import { open } from "sqlite";

let dbPromise;

class TursoDbAdapter {
  constructor(client) {
    this.client = client;
  }
  
  async run(sql, params = []) {
    const res = await this.client.execute({ sql, args: params });
    return {
      changes: res.rowsAffected,
      lastID: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined
    };
  }

  async get(sql, params = []) {
    const res = await this.client.execute({ sql, args: params });
    return res.rows[0];
  }

  async all(sql, params = []) {
    const res = await this.client.execute({ sql, args: params });
    return res.rows;
  }

  async exec(sql) {
    return this.client.execute(sql);
  }
}

export async function getDB() {
  if (!dbPromise) {
    const dbUrl = process.env.DATABASE_URL || process.env.TURSO_DB_URL;
    const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_DB_AUTH_TOKEN;
    
    if (dbUrl) {
      try {
        console.log("[DATABASE] Attempting dynamic load of @libsql/client for Turso...");
        const { createClient } = await import("@libsql/client");
        const client = createClient({ url: dbUrl, authToken });
        dbPromise = Promise.resolve(new TursoDbAdapter(client));
        console.log("[DATABASE] Connected securely to Turso cloud database.");
      } catch (e) {
        console.warn("[DATABASE] Failed to load @libsql/client. Falling back to local SQLite.", e.message);
      }
    }
    
    if (!dbPromise) {
      const isVercel = !!process.env.VERCEL;
      const dbPath = process.env.APORAKSHA_DB_PATH || "./data.db";
      dbPromise = open({
        filename: isVercel ? "/tmp/data.db" : dbPath,
        driver: sqlite3.Database,
      });
    }
  }

  return dbPromise;
}

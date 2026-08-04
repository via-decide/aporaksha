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
    // TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are the names the Vercel Turso
    // integration injects; the others are kept for existing deployments.
    // Without the integration's names this silently fell through to the
    // SQLite branch below even with a database provisioned.
    const dbUrl =
      process.env.TURSO_DATABASE_URL ||
      process.env.DATABASE_URL ||
      process.env.TURSO_DB_URL;
    const authToken =
      process.env.TURSO_AUTH_TOKEN ||
      process.env.DATABASE_AUTH_TOKEN ||
      process.env.TURSO_DB_AUTH_TOKEN;

    if (dbUrl) {
      try {
        console.log("[DATABASE] Attempting dynamic load of @libsql/client for Turso...");
        const { createClient } = await import("@libsql/client");
        const client = createClient({ url: dbUrl, authToken });
        dbPromise = Promise.resolve(new TursoDbAdapter(client));
        console.log("[DATABASE] Connected securely to Turso cloud database.");
      } catch (e) {
        // Falling back here means writes go to an ephemeral /tmp SQLite file
        // that another serverless container cannot see — the failure mode
        // that made the webhook unreliable. Make it loud.
        console.error("[DATABASE] Turso client failed to load; falling back to EPHEMERAL local SQLite. Orders written here will not be visible to the webhook.", e.message);
      }
    }
    
    if (!dbPromise) {
      const isVercel = !!process.env.VERCEL;
      let dbPath = process.env.APORAKSHA_DB_PATH || "./data.db";
      
      if (isVercel) {
        dbPath = "/tmp/data.db";
        // Copy bundled DB to /tmp so we have the tables
        const fs = await import("fs");
        const path = await import("path");
        if (!fs.existsSync(dbPath)) {
          const bundledDb = path.join(process.cwd(), "data.db");
          if (fs.existsSync(bundledDb)) {
            fs.copyFileSync(bundledDb, dbPath);
          }
        }
      }

      dbPromise = open({
        filename: dbPath,
        driver: sqlite3.Database,
      });
    }
  }

  return dbPromise;
}

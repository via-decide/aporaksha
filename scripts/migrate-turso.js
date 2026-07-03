import { createClient } from "@libsql/client";

const dbUrl = process.env.TURSO_DB_URL;
const authToken = process.env.TURSO_DB_AUTH_TOKEN;

if (!dbUrl || !authToken) {
  console.error("❌ Missing TURSO_DB_URL or TURSO_DB_AUTH_TOKEN environment variables.");
  console.log("Usage:");
  console.log("TURSO_DB_URL=libsql://your-db-url.turso.io TURSO_DB_AUTH_TOKEN=your-token node scripts/migrate-turso.js");
  process.exit(1);
}

const client = createClient({ url: dbUrl, authToken });

async function migrate() {
  console.log(`[Turso Migration] Connecting to ${dbUrl}...`);

  const queries = [
    "ALTER TABLE passports ADD COLUMN password_hash TEXT;",
    "ALTER TABLE passports ADD COLUMN role TEXT DEFAULT 'user';",
    "ALTER TABLE passports ADD COLUMN nfc_chip_id TEXT;"
  ];

  for (const query of queries) {
    try {
      console.log(`Running: ${query}`);
      await client.execute(query);
      console.log("✅ Success");
    } catch (err) {
      if (err.message.includes("duplicate column name")) {
        console.log(`⚠️ Column already exists, skipping...`);
      } else {
        console.error(`❌ Error executing query:`, err.message);
      }
    }
  }

  console.log("[Turso Migration] Completed.");
  process.exit(0);
}

migrate();

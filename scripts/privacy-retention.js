import { initDB } from "../lib/initDb.js";
import { getDB } from "../lib/db.js";
const apply = process.argv.includes("--apply");
if (apply && process.env.PRIVACY_RETENTION_CONFIRM !== "APPLY_TO_DISPOSABLE_DATABASE") throw new Error("Explicit disposable-database confirmation required");
await initDB(); const db = await getDB();
const expired = await db.get("SELECT COUNT(*) AS count FROM auth_sessions WHERE expires_at < CURRENT_TIMESTAMP AND revoked_at IS NOT NULL");
const output = [{ category: "expired_revoked_sessions", recordsEligible: Number(expired?.count || 0), action: "ERASE", policy: "AUTH_SESSION_EXPIRY", reason: "expired_and_revoked" }];
if (apply) await db.run("DELETE FROM auth_sessions WHERE expires_at < CURRENT_TIMESTAMP AND revoked_at IS NOT NULL");
console.log(JSON.stringify(output, null, 2));

import { getDB } from "../../lib/db.js";
import { initDB } from "../../lib/initDb.js";

/**
 * Endpoint to add an entitlement to a user's passport.
 * In production, this would be locked down and called only by the DeliveryWorker.
 * For local testing of checkout flow, it is exposed.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed. Use POST." });

  const { email, entitlements } = req.body || {};

  if (!email || !entitlements || !Array.isArray(entitlements)) {
    return res.status(400).json({ error: "email and entitlements array are required" });
  }

  try {
    await initDB();
    const db = await getDB();

    const passport = await db.get(`SELECT passport_id, access_entitlements FROM passports WHERE email = ?`, [email]);
    
    if (!passport) {
      // If passport doesn't exist in SQLite yet, mock it (since /api/auth.js uses file-based for now)
      await db.run(
        `INSERT INTO passports (passport_id, email, access_entitlements, activation_status) VALUES (?, ?, ?, ?)`,
        [email, email, JSON.stringify(entitlements), 'active']
      );
    } else {
      let existing = [];
      try {
        existing = JSON.parse(passport.access_entitlements || "[]");
      } catch (e) { try { if (typeof sovereignAnalytics !== 'undefined') sovereignAnalytics.log('[SILENT CATCH]', e); else console.warn('[SILENT CATCH]', e); } catch(__e) {} }
      
      const newEntitlements = Array.from(new Set([...existing, ...entitlements]));
      await db.run(
        `UPDATE passports SET access_entitlements = ? WHERE email = ?`,
        [JSON.stringify(newEntitlements), email]
      );
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[Passport Add Entitlement] Database error:", error);
    return res.status(500).json({ error: "Failed to add entitlement" });
  }
}

import { logWaitlist, WAITLIST_REASONS } from "../lib/waitlist.js";

/**
 * POST /api/waitlist  { email, product_id }
 *
 * Intake only. GN8R does the orchestration downstream — validation, queue
 * priority, throttling against manufacturing capacity — so nothing here
 * decides anything. Record it and return.
 *
 * Exists because the Dev Spinner waitlist, the desktop DMG waitlist and the
 * automation tiers on hanuman.solutions were each about to grow their own
 * implementation. The spinner's version set a "you're on the list!" success
 * state without sending anything anywhere, which is worse than no waitlist:
 * you build an audience you cannot contact and do not find out until you try.
 */

// Every property that hosts a waitlist form.
const ALLOWED = [
  "https://aporaksha.com",
  "https://www.aporaksha.com",
  "https://viadecide.com",
  "https://www.viadecide.com",
  "https://hanuman.solutions",
  "https://www.hanuman.solutions",
  "https://pay.viadecide.com",
  "https://logichub.app",
  "https://www.logichub.app",
  "https://daxini.xyz",
  "https://daxini.space",
];

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, product_id } = req.body || {};

  // Deliberately permissive: this is a mailing list, not an auth boundary.
  // Rejecting a real address over a regex costs more than accepting a bad one.
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "A valid email is required" });
  }
  if (typeof product_id !== "string" || !product_id) {
    return res.status(400).json({ error: "product_id is required" });
  }

  const ok = await logWaitlist(email, product_id, WAITLIST_REASONS.INTEREST, {
    source: origin || "unknown",
  });

  // 500 when the write failed, so the caller can keep the form open rather
  // than showing a success state for something that was never recorded.
  if (!ok) return res.status(500).json({ error: "Could not record signup" });

  return res.status(200).json({ ok: true, product_id });
}

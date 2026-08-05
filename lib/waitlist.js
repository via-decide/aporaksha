import { getDB } from "./db.js";

/**
 * Shared waitlist capture.
 *
 * Lifted out of api/payments/create-order.js so every waitlist across the
 * estate writes to one place. There are now three — the desktop DMG, the
 * automation tiers on hanuman.solutions, and the Dev Spinner — and three
 * separate implementations would mean three exports to reconcile the day you
 * actually want to email these people.
 *
 * GN8R handles orchestration downstream (validation, queue priority,
 * throttling against manufacturing capacity). This is only the intake: record
 * it durably and let the backend do the rest. Nothing here should grow logic.
 */

/** Reasons a signup lands here. Two different situations, deliberately split. */
export const WAITLIST_REASONS = {
  // We could not take the money — DB down, SMTP down, kill switch, no
  // deliverable. The customer wanted to buy and we failed. Follow these up.
  OUTAGE: "outage",
  // The product does not exist yet and they asked to be told. Demand signal.
  INTEREST: "interest",
};

/**
 * The original version hardcoded the event type to 'waitlist_due_to_outage'
 * whatever reason was passed, so a pre-order signup would have been filed as
 * an outage. Type is now derived from the reason.
 */
function eventTypeFor(reason) {
  return reason === WAITLIST_REASONS.INTEREST
    ? "waitlist_interest"
    : "waitlist_due_to_outage";
}

export async function logWaitlist(email, product_id, reason, extra = {}) {
  try {
    if (!email) return false;
    const db = await getDB();
    await db.run(`INSERT INTO events (type, payload) VALUES (?, ?)`, [
      eventTypeFor(reason),
      JSON.stringify({
        email,
        product_id,
        reason,
        ...extra,
        ts: new Date().toISOString(),
      }),
    ]);
    return true;
  } catch (e) {
    // Never throw. A failed waitlist write must not break a checkout that is
    // already failing for another reason — that is how one outage becomes two.
    console.error("[Waitlist] Failed to log waitlist event:", e);
    return false;
  }
}

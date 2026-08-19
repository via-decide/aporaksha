/**
 * Order state machine with guarded transitions.
 *
 * States: created → payment_pending → paid → fulfilled → refunded
 *                                   ↘ payment_failed
 *                 → free_confirmed → fulfilled
 *         → cancelled (from created or payment_pending)
 */

const TRANSITIONS = Object.freeze({
  created:          ['payment_pending', 'paid', 'free_confirmed', 'cancelled', 'payment_failed'],
  payment_pending:  ['paid', 'payment_failed', 'cancelled'],
  paid:             ['fulfilled', 'refunded'],
  free_confirmed:   ['fulfilled', 'cancelled'],
  fulfilled:        ['refunded'],
  refunded:         [],
  cancelled:        [],
  payment_failed:   ['created'],
});

export function canTransition(from, to) {
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid order transition: ${from} → ${to}`);
  }
}

export function isFinalState(status) {
  return status === 'refunded' || status === 'cancelled';
}

export function isPaidState(status) {
  return status === 'paid' || status === 'fulfilled' || status === 'free_confirmed';
}

export const ALL_STATES = Object.keys(TRANSITIONS);

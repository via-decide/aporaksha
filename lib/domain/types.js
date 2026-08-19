/**
 * ViaDecide Sell — domain types and validators.
 *
 * All money is integer minor units (paise for INR).
 * amountMinor = 2900 means ₹29.00.
 */

// ── Offer types ──────────────────────────────────────────────────────
export const OFFER_TYPES = Object.freeze([
  'digital_file',
  'session',
  'paid_request',
  'service',
]);

export const OFFER_STATUSES = Object.freeze(['draft', 'active', 'paused', 'archived']);
export const CREATOR_STATUSES = Object.freeze(['onboarding', 'active', 'suspended']);
export const ORDER_STATUSES = Object.freeze([
  'created', 'payment_pending', 'paid', 'free_confirmed',
  'fulfilled', 'refunded', 'cancelled', 'payment_failed',
]);
export const CURRENCIES = Object.freeze(['INR']);

// ── Validators ───────────────────────────────────────────────────────

const HANDLE_RE = /^[a-z][a-z0-9_-]{2,29}$/;

export function isValidHandle(h) {
  return typeof h === 'string' && HANDLE_RE.test(h);
}

export function isValidOfferType(t) {
  return OFFER_TYPES.includes(t);
}

export function isValidAmountMinor(v) {
  return Number.isInteger(v) && v >= 0;
}

export function isValidCurrency(c) {
  return CURRENCIES.includes(c);
}

export function validateCreatorInput(data) {
  const errors = [];
  if (!data) return ['body required'];
  if (!isValidHandle(data.handle)) errors.push('handle: 3-30 lowercase alphanumeric, start with letter');
  if (!data.displayName || typeof data.displayName !== 'string' || data.displayName.length < 1 || data.displayName.length > 100) {
    errors.push('displayName: 1-100 chars');
  }
  if (data.bio && (typeof data.bio !== 'string' || data.bio.length > 500)) {
    errors.push('bio: max 500 chars');
  }
  if (data.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail)) {
    errors.push('contactEmail: invalid format');
  }
  return errors;
}

export function validateOfferInput(data) {
  const errors = [];
  if (!data) return ['body required'];
  if (!data.title || typeof data.title !== 'string' || data.title.length < 1 || data.title.length > 200) {
    errors.push('title: 1-200 chars');
  }
  if (!isValidOfferType(data.offerType)) errors.push('offerType: ' + OFFER_TYPES.join(', '));
  if (!isValidAmountMinor(data.amountMinor)) errors.push('amountMinor: non-negative integer (paise)');
  if (!isValidCurrency(data.currency || 'INR')) errors.push('currency: ' + CURRENCIES.join(', '));

  if (data.offerType === 'session') {
    if (!Number.isInteger(data.durationMinutes) || data.durationMinutes < 5 || data.durationMinutes > 480) {
      errors.push('durationMinutes: 5-480 for session');
    }
  }
  if (data.offerType === 'digital_file') {
    if (!data.fileLabel || typeof data.fileLabel !== 'string') {
      errors.push('fileLabel required for digital_file');
    }
  }
  if (data.description && (typeof data.description !== 'string' || data.description.length > 1000)) {
    errors.push('description: max 1000 chars');
  }
  return errors;
}

export function validateOrderInput(data) {
  const errors = [];
  if (!data) return ['body required'];
  if (!data.creatorHandle || typeof data.creatorHandle !== 'string') errors.push('creatorHandle required');
  if (!data.offerId || typeof data.offerId !== 'string') errors.push('offerId required');
  if (!data.buyerName || data.buyerName.length < 2 || data.buyerName.length > 200) errors.push('buyerName: 2-200 chars');
  if (!data.buyerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.buyerEmail)) errors.push('buyerEmail: valid email');
  if (!data.idempotencyKey) errors.push('idempotencyKey required');

  if (data.selectedDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.selectedDate)) {
    errors.push('selectedDate: YYYY-MM-DD');
  }
  if (data.selectedTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.selectedTime)) {
    errors.push('selectedTime: HH:MM');
  }
  return errors;
}

// ── Display helpers ──────────────────────────────────────────────────

export function formatAmountMinor(amountMinor, currency) {
  if (currency === 'INR') return '₹' + (amountMinor / 100).toFixed(2);
  return (amountMinor / 100).toFixed(2) + ' ' + currency;
}

export function amountMinorFromMajor(major) {
  return Math.round(major * 100);
}

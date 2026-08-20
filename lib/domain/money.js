/**
 * Integer-money arithmetic.
 * All amounts are in minor units (paise for INR).
 * Never use floating-point for money.
 */

export function addMinor(a, b) {
  return (a | 0) + (b | 0);
}

export function subtractMinor(a, b) {
  return (a | 0) - (b | 0);
}

export function platformFeeMinor(amountMinor, basisPoints) {
  return Math.round((amountMinor * basisPoints) / 10000);
}

export function creatorPayoutMinor(amountMinor, feeBasisPoints) {
  return subtractMinor(amountMinor, platformFeeMinor(amountMinor, feeBasisPoints));
}

export function formatMinor(amountMinor, currency) {
  const major = (amountMinor / 100).toFixed(2);
  if (currency === 'INR') return '₹' + major;
  return major + ' ' + currency;
}

export const PLATFORM_FEE_BASIS_POINTS = 100;

/**
 * lib/commerceConfig.js
 * Aporaksha — Commerce Policy and Geo-Fencing Configuration
 * 
 * Defines which countries are allowed, restricted, or blocked from purchasing.
 * Acts as a local admin panel.
 */

export const COUNTRY_POLICY = {
  // Allowed instantly
  ALLOWED: [
    'IN', // India
    'LU', // Luxembourg
    'JP', // Japan
  ],
  // Explicitly blocked
  BLOCKED: [
    'CN', // China
    'RU', // Russia
  ],
  // Note: Anything not in ALLOWED or BLOCKED is considered RESTRICTED (Manual Review)
};

// Optional: specific overrides per product ID
export const PRODUCT_GEO_OVERRIDES = {
  // 'digital_product_b': { allowed: ['IN', 'US'] },
  // 'consulting': { allowed: ['IN'] },
};

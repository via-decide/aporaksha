const placeholders = /(^|\.)example\.(com|org)$|decide\.example|changeme|placeholder/i;
export function validatePrivacyConfig(env = process.env) {
  const required = ["LEGAL_ENTITY_NAME", "LEGAL_ENTITY_ADDRESS", "PRIVACY_CONTACT_EMAIL", "GRIEVANCE_CONTACT_EMAIL"];
  const errors = required.filter(k => !env[k] || placeholders.test(env[k]));
  const days = Number(env.GRIEVANCE_MAX_DAYS || 90);
  if (!Number.isInteger(days) || days < 1 || days > 90) errors.push("GRIEVANCE_MAX_DAYS");
  if (env.DPDP_SDF_STATUS !== "NOT_DESIGNATED") errors.push("DPDP_SDF_STATUS");
  if (errors.length) throw new Error(`Privacy configuration invalid: ${[...new Set(errors)].join(", ")}`);
  return true;
}

import fs from "fs";
const checks = [
 ["Identity model", ["lib/privacy-auth.js","lib/initDb.js"]], ["Data inventory", ["docs/compliance/PERSONAL-DATA-INVENTORY.md"]],
 ["Purpose registry", ["config/privacy-purposes.json"]], ["Consent persistence", ["lib/privacy.js"]], ["Withdrawal enforcement", ["lib/privacy.js"]],
 ["Access authorization", ["lib/privacy-handler.js"]], ["Correction", ["lib/privacy-handler.js"]], ["Erasure", ["lib/privacy-handler.js"]],
 ["Grievance", ["lib/privacy-handler.js"]], ["Nomination", ["lib/privacy-handler.js"]], ["Child gate", ["api/auth.js"]],
 ["Retention", ["scripts/privacy-retention.js"]], ["Security logging", ["lib/privacy.js"]], ["Breach workflow", ["lib/privacy-incident.js"]],
 ["Processor inventory", ["docs/compliance/DATA-PROCESSORS.md"]]
];
console.log("DPDP TECHNICAL READINESS"); let fail = false;
for (const [name, files] of checks) { const ok = files.every(f => fs.existsSync(f) && fs.statSync(f).size > 40); fail ||= !ok; console.log(`${name.padEnd(28)} ${ok ? "PASS" : "FAIL"}`); }
console.log(`Language legal review        BLOCKED_LEGAL`);
const entity = ["LEGAL_ENTITY_NAME","LEGAL_ENTITY_ADDRESS","PRIVACY_CONTACT_EMAIL","GRIEVANCE_CONTACT_EMAIL"].every(k => process.env[k] && !/example|placeholder/i.test(process.env[k]));
console.log(`Entity identity              ${entity ? "PASS" : "BLOCKED_CONFIG"}`);
if (fail) process.exitCode = 1;

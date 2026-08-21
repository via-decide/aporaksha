import crypto from "crypto";
import purposes from "../config/privacy-purposes.json" with { type: "json" };
import { getDB } from "./db.js";
import { initDB } from "./initDb.js";

const allowedIdentityFields = new Set(["affirmativeAction", "noticeVersion", "consentVersion", "sourceSurface", "displayName", "subject", "category", "description", "nomineeName", "nomineeContact", "relationship", "status", "confirm", "reauthenticationNonce"]);
export const purposeCodes = new Set(purposes.purposes.map(p => p.code));
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const opaque = value => crypto.createHmac("sha256", process.env.PRIVACY_HASH_KEY || "test-only-privacy-key").update(String(value)).digest("hex");

export function rejectBrowserIdentity(input = {}) {
  const forbidden = ["email", "userId", "user_id", "principalId", "principal_identity_id", "username", "creatorSlug"];
  if (Object.keys(input).some(k => forbidden.includes(k) || !allowedIdentityFields.has(k))) throw Object.assign(new Error("Undeclared field"), { statusCode: 400 });
}
export async function audit(subject, type, objectReference) {
  const db = await getDB();
  await db.run("INSERT INTO privacy_audit_events(event_id,principal_reference,event_type,object_reference) VALUES(?,?,?,?)", [uuid(), opaque(subject), type, objectReference || null]);
}
export async function consent(subject, purpose, action, body) {
  rejectBrowserIdentity(body);
  if (!purposeCodes.has(purpose) || !["grant", "withdraw"].includes(action)) throw Object.assign(new Error("Unsupported purpose"), { statusCode: 400 });
  const entry = purposes.purposes.find(p => p.code === purpose);
  if (entry.basis !== "CONSENT") throw Object.assign(new Error("Purpose does not use consent"), { statusCode: 400 });
  if (!purposes.noticeVersions.includes(body.noticeVersion) || !body.sourceSurface) throw Object.assign(new Error("Unsupported notice or source"), { statusCode: 400 });
  if (action === "grant" && body.affirmativeAction !== "AFFIRM") throw Object.assign(new Error("Explicit affirmative action required"), { statusCode: 400 });
  const db = await getDB(), timestamp = now(), status = action === "grant" ? "GRANTED" : "WITHDRAWN";
  await db.run(`INSERT INTO consent_records(consent_id,principal_identity_id,purpose_code,notice_version,consent_version,status,affirmative_action,granted_at,withdrawn_at,source_surface,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`, [uuid(), subject, purpose, body.noticeVersion, body.consentVersion || "1", status, action === "grant" ? body.affirmativeAction : null, action === "grant" ? timestamp : null, action === "withdraw" ? timestamp : null, body.sourceSurface, timestamp]);
  await audit(subject, action === "grant" ? "CONSENT_GRANTED" : "CONSENT_WITHDRAWN", purpose);
  return { purposeCode: purpose, status, timestamp };
}
export async function mayProcessPurpose(subject, purpose) {
  const db = await getDB();
  const row = await db.get("SELECT status FROM consent_records WHERE principal_identity_id=? AND purpose_code=? ORDER BY created_at DESC, rowid DESC LIMIT 1", [subject, purpose]);
  return row?.status === "GRANTED";
}
export async function accessReport(subject) {
  const db = await getDB();
  const account = await db.get("SELECT passport_id,customer_name,email,role,country,timezone,locale,created_at FROM passports WHERE passport_id=?", [subject]);
  if (!account) throw Object.assign(new Error("Not found"), { statusCode: 404 });
  const consents = await db.all("SELECT purpose_code,notice_version,consent_version,status,granted_at,withdrawn_at,source_surface FROM consent_records WHERE principal_identity_id=? ORDER BY created_at", [subject]);
  const requests = await db.all("SELECT request_id,request_type,status,reason_code,requested_at,completed_at FROM privacy_requests WHERE principal_identity_id=?", [subject]);
  const notices = await db.all("SELECT notice_version,delivered_at,delivery_channel,purpose_set FROM privacy_notice_deliveries WHERE principal_identity_id=?", [subject]);
  const nomination = await db.get("SELECT nomination_id,status,created_at,updated_at FROM privacy_nominations WHERE principal_identity_id=? ORDER BY updated_at DESC LIMIT 1", [subject]);
  await audit(subject, "PRIVACY_ACCESS_REPORT_CREATED");
  return { account, authenticationMethods: ["password", ...(account ? [] : [])], activeSessions: [], consents, notices, requests, nomination: nomination || null, processingPurposes: purposes.purposes, processorCategories: ["database", "hosting", "email", "payments"], retentionPolicies: "See published registry; legal review required", dataSharingCategories: ["service providers"], viaData: { status: "UNAVAILABLE_FAIL_CLOSED" } };
}
export async function createRequest(subject, type, reason = null) {
  const db = await getDB(), id = uuid(), timestamp = now();
  await db.run("INSERT INTO privacy_requests(request_id,principal_identity_id,request_type,status,reason_code,requested_at,identity_verified_at) VALUES(?,?,?,?,?,?,?)", [id, subject, type, "IDENTITY_VERIFIED", reason, timestamp, timestamp]);
  return id;
}
export async function initPrivacy() { await initDB(); }
export { opaque, now, uuid, purposes };

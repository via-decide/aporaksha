import crypto from "crypto";
import { authenticatedSubject } from "../../lib/privacy-auth.js";
import { accessReport, audit, consent, createRequest, initPrivacy, now, opaque, rejectBrowserIdentity, uuid } from "../../lib/privacy.js";
import { getDB } from "../../lib/db.js";

const json = (res, status, body) => res.status(status).json(body);
const pathOf = req => (Array.isArray(req.query.path) ? req.query.path : String(req.query.path || "").split("/")).filter(Boolean);
function safeQuery(req) {
  const extra = Object.keys(req.query || {}).filter(k => k !== "path");
  if (extra.length) throw Object.assign(new Error("Identity and filtering query parameters are not accepted"), { statusCode: 400 });
}
function dueDate() {
  const days = Math.min(90, Number(process.env.GRIEVANCE_MAX_DAYS || 90));
  return new Date(Date.now() + days * 86400000).toISOString();
}
export default async function handler(req, res) {
  try {
    await initPrivacy(); safeQuery(req);
    const [resource, purpose, action] = pathOf(req);
    const auth = await authenticatedSubject(req);
    const subject = auth.subjectId, db = await getDB(), body = req.body || {};
    if (resource === "me" && req.method === "GET") {
      const account = await db.get("SELECT passport_id,customer_name,email,role,country,timezone,locale,created_at FROM passports WHERE passport_id=?", [subject]);
      return json(res, account ? 200 : 404, account ? { account } : { error: "Not found" });
    }
    if (resource === "access-report" && req.method === "GET") return json(res, 200, await accessReport(subject));
    if (resource === "requests" && req.method === "GET") return json(res, 200, { requests: await db.all("SELECT request_id,request_type,status,reason_code,requested_at,completed_at FROM privacy_requests WHERE principal_identity_id=? ORDER BY requested_at DESC", [subject]) });
    if (resource === "consents" && req.method === "POST") return json(res, 201, await consent(subject, purpose, action, body));
    if (resource === "correction" && req.method === "POST") {
      rejectBrowserIdentity(body);
      if (!body.displayName || typeof body.displayName !== "string" || body.displayName.length > 100) return json(res, 400, { error: "Only displayName is directly editable; email requires the verified-email flow" });
      const requestId = await createRequest(subject, "CORRECTION");
      await db.run("UPDATE passports SET customer_name=? WHERE passport_id=?", [body.displayName.trim(), subject]);
      await db.run("INSERT INTO privacy_corrections(correction_id,request_id,field_name,proposed_value,status,created_at) VALUES(?,?,?,?,?,?)", [uuid(), requestId, "customer_name", body.displayName.trim(), "COMPLETED", now()]);
      await db.run("UPDATE privacy_requests SET status='COMPLETED',completed_at=? WHERE request_id=?", [now(), requestId]);
      await audit(subject, "PRIVACY_CORRECTION_REQUESTED", requestId); return json(res, 202, { requestId, status: "COMPLETED" });
    }
    if (resource === "erasure" && req.method === "POST") {
      rejectBrowserIdentity(body);
      if (body.confirm !== "ERASE_MY_ACCOUNT") return json(res, 400, { error: "Explicit destructive confirmation required" });
      if (!body.reauthenticationNonce || auth.authenticatedAt * 1000 < Date.now() - 10 * 60 * 1000) return json(res, 403, { error: "Recent strong authentication required" });
      const used = await db.get("SELECT event_id FROM privacy_request_events WHERE event_id=?", [opaque(body.reauthenticationNonce)]);
      if (used) return json(res, 403, { error: "Reauthentication proof already used" });
      const requestId = await createRequest(subject, "ERASURE");
      await db.run("INSERT INTO privacy_request_events(event_id,request_id,event_type) VALUES(?,?,?)", [opaque(body.reauthenticationNonce), requestId, "REAUTH_PROOF_CONSUMED"]);
      await audit(subject, "PRIVACY_ERASURE_REQUESTED", requestId);
      const retained = await db.get("SELECT COUNT(*) AS count FROM orders WHERE user_id=?", [subject]);
      await db.run("UPDATE auth_sessions SET revoked_at=? WHERE principal_identity_id=?", [now(), subject]);
      await db.run("UPDATE passports SET customer_name=NULL,email=NULL,password_hash=NULL,nfc_chip_id=NULL,country=NULL,timezone=NULL,locale=NULL,activation_status='ERASED' WHERE passport_id=?", [subject]);
      await db.run("UPDATE privacy_nominations SET nominee_name='ERASED',nominee_contact='ERASED',status='REVOKED',updated_at=? WHERE principal_identity_id=?", [now(), subject]);
      const evidenceId = uuid(), hash = opaque(subject);
      await db.run("INSERT INTO privacy_erasure_evidence(evidence_id,request_id,opaque_subject_hash,categories_deleted,categories_anonymized,categories_retained,retention_reason_codes,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)", [evidenceId, requestId, hash, JSON.stringify(["identity_credentials","sessions","nomination_contact"]), "[]", JSON.stringify(retained?.count ? ["transaction_records"] : []), JSON.stringify(retained?.count ? ["LEGAL_REVIEW_REQUIRED"] : []), "COMPLETED", now()]);
      await db.run("INSERT OR REPLACE INTO erasure_suppression(opaque_subject_hash,erased_at,reason_code) VALUES(?,?,?)", [hash, now(), "PRINCIPAL_ERASURE"]);
      await db.run("UPDATE privacy_requests SET status='COMPLETED',completed_at=?,completion_evidence_reference=? WHERE request_id=?", [now(), evidenceId, requestId]);
      await audit(subject, "PRIVACY_ERASURE_COMPLETED", requestId); return json(res, 202, { requestId, status: "COMPLETED", retainedReasonCodes: retained?.count ? ["LEGAL_REVIEW_REQUIRED"] : [] });
    }
    if (resource === "grievance" && req.method === "POST") {
      rejectBrowserIdentity(body); if (![body.subject, body.category, body.description].every(v => typeof v === "string" && v.trim())) return json(res, 400, { error: "subject, category and description required" });
      const grievanceId = uuid();
      await db.run("INSERT INTO privacy_grievances(grievance_id,principal_identity_id,subject,category,description,created_at,status,response_due_at) VALUES(?,?,?,?,?,?,?,?)", [grievanceId, subject, body.subject.trim(), body.category.trim(), body.description.trim(), now(), "OPEN", dueDate()]);
      await audit(subject, "GRIEVANCE_CREATED", grievanceId); return json(res, 202, { grievanceId, status: "OPEN" });
    }
    if (resource === "nomination" && req.method === "POST") {
      rejectBrowserIdentity(body); if (!body.nomineeName || !body.nomineeContact || !["ACTIVE","REVOKED"].includes(body.status || "ACTIVE")) return json(res, 400, { error: "Invalid nomination" });
      const previous = await db.get("SELECT nomination_id FROM privacy_nominations WHERE principal_identity_id=? ORDER BY updated_at DESC LIMIT 1", [subject]);
      const id = previous?.nomination_id || uuid(), timestamp = now();
      if (previous) await db.run("UPDATE privacy_nominations SET nominee_name=?,nominee_contact=?,relationship_optional=?,status=?,updated_at=? WHERE nomination_id=? AND principal_identity_id=?", [body.nomineeName, body.nomineeContact, body.relationship || null, body.status || "ACTIVE", timestamp, id, subject]);
      else await db.run("INSERT INTO privacy_nominations VALUES(?,?,?,?,?,?,?,?)", [id, subject, body.nomineeName, body.nomineeContact, body.relationship || null, body.status || "ACTIVE", timestamp, timestamp]);
      await audit(subject, "NOMINATION_UPDATED", id); return json(res, 202, { nominationId: id, status: body.status || "ACTIVE", authorityGranted: false });
    }
    return json(res, 404, { error: "Not found" });
  } catch (error) { return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Request failed" }); }
}

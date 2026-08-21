import { getDB } from "./db.js";
import { initDB } from "./initDb.js";
import { now, opaque, uuid } from "./privacy.js";
export const INCIDENT_STATES = ["SUSPECTED","CONFIRMED","CONTAINED","NOTIFICATIONS_PENDING","NOTIFIED","REMEDIATED","CLOSED"];
export async function recordConfirmedIncident({ externalEventId, detectedAt, confirmedAt, dataCategories, severity, principalIds }) {
  await initDB(); const db = await getDB();
  const existing = await db.get("SELECT incident_id FROM privacy_incidents WHERE external_event_id=?", [externalEventId]);
  if (existing) return { incidentId: existing.incident_id, idempotent: true };
  const incidentId = uuid(), confirmation = new Date(confirmedAt), due = new Date(confirmation.getTime() + 72 * 3600000);
  await db.run("INSERT INTO privacy_incidents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", [incidentId, externalEventId, detectedAt, confirmedAt, "CONFIRMED", JSON.stringify(dataCategories), principalIds.length, severity, "OPEN", "PENDING_DELIVERY_EVIDENCE", "MANUAL_SUBMISSION_REQUIRED", due.toISOString(), null]);
  for (const id of principalIds) await db.run("INSERT INTO privacy_incident_principals(incident_id,opaque_principal_reference) VALUES(?,?)", [incidentId, opaque(id)]);
  return { incidentId, idempotent: false, detailedReportDueAt: due.toISOString(), warningsAtHoursRemaining: [24,12,6,1], principalArtifacts: principalIds.map(id => ({ secureReference: opaque(id), autoSend: false })), boardPackage: { generatedAt: now(), submissionStatus: "MANUAL_SUBMISSION_REQUIRED" } };
}

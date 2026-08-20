import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
process.env.NODE_ENV = "test";
process.env.APORAKSHA_DB_PATH = path.join(os.tmpdir(), `aporaksha-privacy-${process.pid}.db`);
process.env.PRIVACY_HASH_KEY = "disposable-test-key";
const { initDB } = await import("../lib/initDb.js");
const { getDB } = await import("../lib/db.js");
const { consent, mayProcessPurpose, accessReport, rejectBrowserIdentity } = await import("../lib/privacy.js");
const { recordConfirmedIncident } = await import("../lib/privacy-incident.js");
const { validatePrivacyConfig } = await import("../lib/privacy-config.js");
const { default: authHandler } = await import("../api/auth.js");
await initDB(); const db = await getDB();
await db.run("INSERT INTO passports(passport_id,email,password_hash,customer_name) VALUES(?,?,?,?),(?,?,?,?)", ["alice","alice@test.invalid","secret-hash","Alice","bob","bob@test.invalid","other-hash","Bob"]);
function mock(body, headers = {}) { const res={code:200,body:null,setHeader(){},status(c){this.code=c;return this;},json(v){this.body=v;return this;},end(){return this;}}; return [{method:"POST",body,headers},res]; }

test("signup-only adult gate creates no account, linkage, consent, subscription or DOB without affirmation", async () => {
  let [req,res] = mock({action:"signup",email:"child@test.invalid",password:"StrongPassword!2",adultConfirmed:false,dob:"2012-01-01"});
  await authHandler(req,res); assert.equal(res.code,400);
  assert.equal(await db.get("SELECT passport_id FROM passports WHERE email='child@test.invalid'"),undefined);
  assert.equal((await db.get("SELECT COUNT(*) count FROM consent_records WHERE principal_identity_id='child'")).count,0);
  [req,res] = mock({action:"signup",email:"adult@test.invalid",password:"StrongPassword!2",adultConfirmed:true});
  await authHandler(req,res); assert.equal(res.code,201);
  const adult=await db.get("SELECT * FROM passports WHERE email='adult@test.invalid'"); assert.ok(adult); assert.ok(!Object.hasOwn(adult,"dob")); assert.equal(adult.razorpay_subscription_id,null);
  [req,res] = mock({action:"login",email:"adult@test.invalid",password:"StrongPassword!2"}); await authHandler(req,res); assert.equal(res.code,200);
});

test("consolidated Vercel privacy dispatch remains fail-closed without authentication", async () => {
  const [req,res] = mock({}); req.method="GET"; req.url="/api/privacy/me"; req.query={};
  await authHandler(req,res); assert.equal(res.code,401); assert.equal(res.body.error,"Authentication required");
  const [rewrittenReq,rewrittenRes] = mock({}); rewrittenReq.method="GET"; rewrittenReq.url="/api/auth?privacyPath=me"; rewrittenReq.query={privacyPath:"me"};
  await authHandler(rewrittenReq,rewrittenRes); assert.equal(rewrittenRes.code,401); assert.equal(rewrittenRes.body.error,"Authentication required");
});

test("silence, page views, defaults and legacy accounts create no consent", async () => {
  assert.equal((await db.get("SELECT COUNT(*) count FROM consent_records")).count, 0);
  await assert.rejects(() => consent("alice", "MARKETING_EMAIL", "grant", { noticeVersion:"2025-01",sourceSurface:"settings" }));
});
test("affirmative purpose-specific consent persists evidence and withdrawal stops queued marketing", async () => {
  const granted = await consent("alice", "MARKETING_EMAIL", "grant", { affirmativeAction:"AFFIRM",noticeVersion:"2025-01",consentVersion:"1",sourceSurface:"settings" });
  assert.equal(granted.status, "GRANTED"); assert.equal(await mayProcessPurpose("alice", "MARKETING_EMAIL"), true);
  assert.equal(await mayProcessPurpose("alice", "PRODUCT_EMAIL"), false);
  const queuedMessageMaySend = () => mayProcessPurpose("alice", "MARKETING_EMAIL");
  const withdrawn = await consent("alice", "MARKETING_EMAIL", "withdraw", { noticeVersion:"2025-01",consentVersion:"1",sourceSurface:"settings" });
  assert.equal(withdrawn.status, "WITHDRAWN"); assert.ok(withdrawn.timestamp); assert.equal(await queuedMessageMaySend(), false);
  assert.equal((await db.get("SELECT COUNT(*) count FROM consent_records WHERE principal_identity_id='alice'")).count, 2);
});
test("browser-controlled identity and undeclared fields fail closed", () => {
  for (const body of [{userId:"bob"},{email:"bob@test.invalid"},{principal_identity_id:"bob"},{fraudRule:"x"}]) assert.throws(() => rejectBrowserIdentity(body));
});
test("curated access report is isolated and excludes authentication secrets", async () => {
  const report = await accessReport("alice"), serialized = JSON.stringify(report);
  assert.equal(report.account.passport_id, "alice"); assert.ok(!serialized.includes("bob@test.invalid"));
  for (const forbidden of ["secret-hash","password_hash","refreshToken","fraudRule","nfc_chip_id"]) assert.ok(!serialized.includes(forbidden));
});
test("notice delivery is idempotent and never creates consent", async () => {
  await db.run("INSERT INTO privacy_notice_deliveries VALUES(?,?,?,?,?,?)", ["d1","bob","2025-01",new Date().toISOString(),"IN_APP",'["ACCOUNT_IDENTITY"]']);
  await assert.rejects(() => db.run("INSERT INTO privacy_notice_deliveries VALUES(?,?,?,?,?,?)", ["d2","bob","2025-01",new Date().toISOString(),"IN_APP",'[]']));
  assert.equal((await db.get("SELECT COUNT(*) count FROM consent_records WHERE principal_identity_id='bob'")).count, 0);
});
test("breach confirmation persists principals separately, is idempotent and calculates 72 hours", async () => {
  const confirmedAt = "2026-01-01T00:00:00.000Z";
  const first = await recordConfirmedIncident({externalEventId:"evt-1",detectedAt:confirmedAt,confirmedAt,dataCategories:["email","order"],severity:"HIGH",principalIds:Array.from({length:10},(_,i)=>`p${i}`)});
  assert.equal(new Date(first.detailedReportDueAt)-new Date(confirmedAt),72*3600000); assert.deepEqual(first.warningsAtHoursRemaining,[24,12,6,1]);
  assert.equal(first.boardPackage.submissionStatus,"MANUAL_SUBMISSION_REQUIRED"); assert.ok(first.principalArtifacts.every(x=>!x.autoSend));
  assert.equal((await db.get("SELECT COUNT(*) count FROM privacy_incident_principals WHERE incident_id=?",[first.incidentId])).count,10);
  assert.equal((await recordConfirmedIncident({externalEventId:"evt-1",detectedAt:confirmedAt,confirmedAt,dataCategories:[],severity:"LOW",principalIds:[]})).idempotent,true);
});
test("production privacy config rejects placeholders, excess grievance period and SDF claims", () => {
  assert.throws(() => validatePrivacyConfig({LEGAL_ENTITY_NAME:"Example",LEGAL_ENTITY_ADDRESS:"x",PRIVACY_CONTACT_EMAIL:"privacy@example.com",GRIEVANCE_CONTACT_EMAIL:"g@example.com",GRIEVANCE_MAX_DAYS:"91",DPDP_SDF_STATUS:"DESIGNATED"}));
  assert.equal(validatePrivacyConfig({LEGAL_ENTITY_NAME:"Verified Entity",LEGAL_ENTITY_ADDRESS:"Verified address",PRIVACY_CONTACT_EMAIL:"privacy@company.invalid",GRIEVANCE_CONTACT_EMAIL:"grievance@company.invalid",GRIEVANCE_MAX_DAYS:"90",DPDP_SDF_STATUS:"NOT_DESIGNATED"}),true);
});
test.after(() => { try { fs.unlinkSync(process.env.APORAKSHA_DB_PATH); } catch {} });

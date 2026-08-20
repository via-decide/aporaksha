import crypto from "crypto";
import { getDB } from "./db.js";
import { initDB } from "./initDb.js";

function verify(token) {
  const [header, body, signature] = String(token || "").split(".");
  if (!header || !body || !signature) return null;
  const expected = crypto.createHmac("sha256", process.env.SECRET_KEY || "zayvora_dev_access_secret").update(`${header}.${body}`).digest("base64url");
  const a = Buffer.from(signature), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url"));
    if (payload.type !== "access" || !payload.userId || !payload.jti || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}
export async function verifyAccessSession(token) {
  await initDB();
  const payload = verify(token);
  if (!payload) return { valid: false };
  const db = await getDB();
  const session = await db.get("SELECT revoked_at,expires_at FROM auth_sessions WHERE principal_identity_id=? AND token_jti=?", [payload.userId, payload.jti]);
  if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) return { valid: false };
  return { valid: true, payload };
}
export async function authenticatedSubject(req) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  const verification = await verifyAccessSession(authorization.slice(7));
  if (!verification.valid) throw Object.assign(new Error("Invalid, expired, or revoked authentication"), { statusCode: 401 });
  const { payload } = verification;
  return Object.freeze({ subjectId: payload.userId, authenticatedAt: Number(payload.auth_time || 0), tokenJti: payload.jti });
}

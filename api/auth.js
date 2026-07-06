import crypto from "crypto";
import { getDB } from "../lib/db.js";
import { initDB } from "../lib/initDb.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/;

function hashPassword(value) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.pbkdf2Sync(value, salt, 32768, 64, "sha512").toString("hex");
  return `${salt}:${digest}`;
}

function comparePassword(value, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, digest] = stored.split(":");
  const candidate = crypto.pbkdf2Sync(value, salt, 32768, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate, "utf8"), Buffer.from(digest, "utf8"));
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function signJWT(payload, secret) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyJWT(token, secret) {
  const [header, body, sig] = (token || "").split(".");
  if (!header || !body || !sig) return { valid: false };
  const data = `${header}.${body}`;
  const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  if (expected !== sig) return { valid: false };
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) return { valid: false };
  return { valid: true, payload };
}

const ACCESS_SECRET = process.env.SECRET_KEY || "zayvora_dev_access_secret";
const REFRESH_SECRET = process.env.REFRESH_SECRET_KEY || "zayvora_dev_refresh_secret";

function issueTokens(user, deviceId) {
  const jti = crypto.randomBytes(16).toString("hex");
  return {
    accessToken: signJWT({
      userId: user.passport_id, email: user.email, role: user.role || "user",
      ecosystem_uid: user.email,
      jti, type: "access", exp: Math.floor(Date.now() / 1000) + 900,
    }, ACCESS_SECRET),
    refreshToken: signJWT({
      userId: user.passport_id, deviceId: deviceId || "unknown",
      type: "refresh", exp: Math.floor(Date.now() / 1000) + 604800,
    }, REFRESH_SECRET),
    userId: user.passport_id,
    expiresIn: 900,
  };
}

const ALLOWED_ORIGINS = [
  'https://logichub.app', 
  'https://viadecide.com', 
  'https://aporaksha.com', 
  'https://daxini.space', 
  'http://localhost:3000', 
  'http://localhost:7004'
];

export default async function handler(req, res) {
  // Strict CORS Validation
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    // Default to the first allowed origin to prevent wildcard credential errors
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0]);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action, email, password, refreshToken, nfc_chip_id } = req.body || {};
  const identity = (email || "").trim().toLowerCase();

  await initDB();
  const db = await getDB();

  // SIGNUP
  if (action === "signup") {
    if (!EMAIL_REGEX.test(identity) || !PASSWORD_REGEX.test(password || ""))
      return res.status(400).json({ error: "Email/password invalid. Password must be 12+ chars with upper, lower, digit, special." });
    
    const existingUser = await db.get(`SELECT email FROM passports WHERE email = ?`, [identity]);
    if (existingUser)
      return res.status(409).json({ error: "Account exists" });

    const id = crypto.randomUUID();
    const newUser = { 
      passport_id: id, 
      email: identity, 
      password_hash: hashPassword(password), 
      role: "user", 
      nfc_chip_id: nfc_chip_id || null 
    };
    
    await db.run(
      `INSERT INTO passports (passport_id, email, password_hash, role, nfc_chip_id) VALUES (?, ?, ?, ?, ?)`,
      [newUser.passport_id, newUser.email, newUser.password_hash, newUser.role, newUser.nfc_chip_id]
    );

    const tokens = issueTokens(newUser, req.headers["x-device-id"] || "web");
    return res.status(201).json(tokens);
  }

  // NFC LOGIN
  if (action === "nfc_login") {
    if (!nfc_chip_id)
      return res.status(400).json({ error: "NFC chip ID required" });
    
    const user = await db.get(`SELECT passport_id, email, password_hash, role, nfc_chip_id FROM passports WHERE nfc_chip_id = ?`, [nfc_chip_id]);
    if (!user)
      return res.status(401).json({ error: "No passport associated with this NFC Card." });

    const tokens = issueTokens(user, req.headers["x-device-id"] || "web");
    return res.json({ ...tokens, email: user.email });
  }

  // LINK NFC
  if (action === "link_nfc") {
    const { email: targetEmail, nfc_chip_id: chipId } = req.body || {};
    if (!targetEmail || !chipId) {
      return res.status(400).json({ error: "Email and NFC chip ID are required" });
    }
    const cleanEmail = targetEmail.trim().toLowerCase();
    
    const user = await db.get(`SELECT passport_id, email FROM passports WHERE email = ?`, [cleanEmail]);
    if (!user) {
      return res.status(404).json({ error: "Passport user account not found" });
    }
    
    const newChipId = chipId.trim().toUpperCase();
    await db.run(`UPDATE passports SET nfc_chip_id = ? WHERE email = ?`, [newChipId, cleanEmail]);

    console.log(`[NFC Link] Linked NFC card ${newChipId} to ${cleanEmail}`);
    return res.status(200).json({ success: true, message: `Successfully linked NFC Card: ${newChipId}` });
  }

  // LOGIN
  if (action === "login") {
    if (!identity || !password)
      return res.status(400).json({ error: "Email and password required" });
      
    const user = await db.get(`SELECT passport_id, email, password_hash, role, nfc_chip_id FROM passports WHERE email = ?`, [identity]);
    
    if (!user || !comparePassword(password, user.password_hash))
      return res.status(401).json({ error: "Invalid credentials" });

    const tokens = issueTokens(user, req.headers["x-device-id"] || "web");
    return res.json(tokens);
  }

  // REFRESH
  if (action === "refresh") {
    if (!refreshToken)
      return res.status(400).json({ error: "Refresh token required" });
    const v = verifyJWT(refreshToken, REFRESH_SECRET);
    if (!v.valid || v.payload?.type !== "refresh")
      return res.status(401).json({ error: "Invalid token" });

    const user = await db.get(`SELECT passport_id, email, password_hash, role, nfc_chip_id FROM passports WHERE passport_id = ?`, [v.payload.userId]);
    if (!user) return res.status(401).json({ error: "User not found" });

    const tokens = issueTokens(user, v.payload.deviceId);
    return res.json(tokens);
  }

  // VERIFY (check if token is valid)
  if (action === "verify" || action === "validate") {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const v = verifyJWT(token, ACCESS_SECRET);
    if (!v.valid || v.payload?.type !== "access") {
      return res.status(401).json({ valid: false, error: "Invalid or expired token" });
    }
    return res.json({ valid: true, ecosystem_uid: v.payload.email, userId: v.payload.userId });
  }

  // INTROSPECT
  if (action === "introspect") {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const v = verifyJWT(token, ACCESS_SECRET);
    if (!v.valid || v.payload?.type !== "access") {
      return res.status(401).json({ active: false, error: "Invalid or expired token" });
    }
    return res.json({
      active: true,
      ecosystem_uid: v.payload.email,
      userId: v.payload.userId,
      email: v.payload.email,
      role: v.payload.role,
      exp: v.payload.exp
    });
  }

  // LOGOUT
  if (action === "logout") {
    return res.json({ success: true, message: "Logged out successfully" });
  }

  return res.status(400).json({ error: "Unknown action. Use: signup, login, refresh, verify, validate, introspect, logout" });
}

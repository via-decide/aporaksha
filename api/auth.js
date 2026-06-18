import crypto from "crypto";

// In-memory user store (serverless-compatible, resets per cold start)
// For production: migrate to Vercel KV or Postgres
const users = new Map();

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
      userId: user.id, email: user.email, role: user.role || "user",
      jti, type: "access", exp: Math.floor(Date.now() / 1000) + 900,
    }, ACCESS_SECRET),
    refreshToken: signJWT({
      userId: user.id, deviceId: deviceId || "unknown",
      type: "refresh", exp: Math.floor(Date.now() / 1000) + 604800,
    }, REFRESH_SECRET),
    userId: user.id,
    expiresIn: 900,
  };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action, email, password, refreshToken } = req.body || {};
  const identity = (email || "").trim().toLowerCase();

  // SIGNUP
  if (action === "signup") {
    if (!EMAIL_REGEX.test(identity) || !PASSWORD_REGEX.test(password || ""))
      return res.status(400).json({ error: "Email/password invalid. Password must be 12+ chars with upper, lower, digit, special." });
    if (users.has(identity))
      return res.status(409).json({ error: "Account exists" });

    const id = crypto.randomUUID();
    users.set(identity, { id, email: identity, password_hash: hashPassword(password), role: "user" });
    return res.status(201).json({ success: true, userId: id, email: identity });
  }

  // LOGIN
  if (action === "login") {
    if (!identity || !password)
      return res.status(400).json({ error: "Email and password required" });
    const user = users.get(identity);
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

    const user = Array.from(users.values()).find((u) => u.id === v.payload.userId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const tokens = issueTokens(user, v.payload.deviceId);
    return res.json(tokens);
  }

  // VERIFY (check if token is valid)
  if (action === "verify") {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const v = verifyJWT(token, ACCESS_SECRET);
    return res.json({ valid: v.valid, userId: v.payload?.userId || null });
  }

  return res.status(400).json({ error: "Unknown action. Use: signup, login, refresh, verify" });
}

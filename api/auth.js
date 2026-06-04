import crypto from "crypto";

// In-memory user store (serverless-compatible, resets per cold start)
// For production: migrate to Vercel KV or Postgres
const users = new Map();
const requestCounter = new Map(); // Tracks request frequency per identity
const hotPool = new Map(); // "Replicated" cache for hot keys to distribute load

// In-memory OTP store (for production, move to Redis/KV)
const otps = new Map();

function trackHotKey(identity) {
  const now = Math.floor(Date.now() / 1000);
  const data = requestCounter.get(identity) || { count: 0, lastReset: now };
  
  if (now - data.lastReset > 60) {
    data.count = 1;
    data.lastReset = now;
  } else {
    data.count++;
  }
  
  requestCounter.set(identity, data);
  
  // If > 50 requests per minute, replicate to hotPool
  if (data.count > 50) {
    const user = users.get(identity);
    if (user) {
      hotPool.set(identity, { ...user, replicatedAt: now });
      console.log(`[HOT_KEY] Replicating session for: ${identity}`);
    }
  }
}

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
    
    trackHotKey(identity);
    const user = hotPool.get(identity) || users.get(identity);
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
    
    // Track verify hits to see if this user becomes hot
    if (v.valid && v.payload?.email) {
      trackHotKey(v.payload.email);
    }
    
    return res.json({ valid: v.valid, userId: v.payload?.userId || null });
  }

  // SEND OTP
  if (action === "send_otp") {
    const uid = req.body.uid;
    if (!uid) return res.status(400).json({ error: "UID required" });

    const now = Math.floor(Date.now() / 1000);
    const existing = otps.get(uid);

    // Rate limiting: max 1 per minute
    if (existing && now < existing.createdAt + 60) {
      return res.status(429).json({ error: "Please wait 60 seconds before requesting a new OTP." });
    }

    // Generate secure 6 digit OTP
    const otp = Math.floor(100000 + crypto.randomInt(900000)).toString();
    otps.set(uid, {
      otp,
      createdAt: now,
      expiresAt: now + 300, // 5 minutes expiry
      attempts: 0
    });

    // In production, this dispatches to the Zayvora SMS Gateway (Twilio/FastAPI)
    console.log(`[ZAYVORA SMS GATEWAY] Dispatching OTP ${otp} to authority bound to UID: ${uid}`);

    return res.json({ success: true, message: "OTP sent" });
  }

  // VERIFY OTP
  if (action === "verify_otp") {
    const { uid, otp } = req.body;
    if (!uid || !otp) return res.status(400).json({ error: "UID and OTP required" });

    const record = otps.get(uid);
    const now = Math.floor(Date.now() / 1000);

    if (!record || now > record.expiresAt) {
      return res.status(401).json({ error: "OTP expired or invalid" });
    }

    if (record.attempts >= 3) {
      otps.delete(uid);
      return res.status(401).json({ error: "Too many failed attempts. Request a new OTP." });
    }

    if (record.otp !== otp) {
      record.attempts++;
      otps.set(uid, record);
      return res.status(401).json({ error: "Invalid OTP" });
    }

    // OTP matched! Destroy the OTP record.
    otps.delete(uid);

    // Ensure the user exists in the local map (or create them)
    let user = users.get(uid);
    if (!user) {
      const id = crypto.randomUUID();
      user = { id, email: uid, role: "user" }; // UID acts as email/identifier
      users.set(uid, user);
    }

    const tokens = issueTokens(user, req.headers["x-device-id"] || "web");
    return res.json(tokens);
  }

  return res.status(400).json({ error: "Unknown action. Use: signup, login, refresh, verify, send_otp, verify_otp" });
}

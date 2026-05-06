const ipByUser = new Map();
const sessions = new Map();

const throttleByUser = new Map();

function checkThrottle(userId) {
  const now = Date.now();
  const key = String(userId);
  const item = throttleByUser.get(key) || { count: 0, ts: now };
  item.count = now - item.ts > 60000 ? 1 : item.count + 1;
  item.ts = now;
  throttleByUser.set(key, item);
  if (item.count > 20) return { blocked: true, delay: 2000 };
  if (item.count > 10) return { blocked: false, delay: 500 };
  return { blocked: false, delay: 0 };
}

function sessionKey(userId, deviceId) {
  return `${userId}:${deviceId || 'unknown'}`;
}

function createSession(userId, deviceId, refreshToken) {
  sessions.set(sessionKey(userId, deviceId), refreshToken);
}

function validateSession(userId, deviceId, refreshToken) {
  return sessions.get(sessionKey(userId, deviceId)) === refreshToken;
}

function revokeSession(userId, deviceId) {
  sessions.delete(sessionKey(userId, deviceId));
}

function detectAnomaly(userId, ip) {
  const lastIp = ipByUser.get(userId);
  ipByUser.set(userId, ip);
  return Boolean(lastIp && lastIp !== ip);
}

module.exports = { createSession, validateSession, revokeSession, detectAnomaly, checkThrottle };

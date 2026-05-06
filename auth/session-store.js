const ipByUser = new Map();
const sessions = new Map();

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

module.exports = { createSession, validateSession, revokeSession, detectAnomaly };

(function (global) {
  'use strict';

  var securityModule = null;
  var CORE_BASE_URL = 'https://cdn.jsdelivr.net/gh/via-decide/aporaksha-core@main';
  var AUTH_SECRET = 'zayvora-auth-core-v1';
  var DB_KEY = 'zayvora_auth_db';

  async function importSecurityLayer() {
    if (securityModule) return securityModule;

    try {
      var securityLayerModule = await import(CORE_BASE_URL + '/security-layer/index.js');
      securityModule = securityLayerModule.default || securityLayerModule;
    } catch (error) {
      console.warn('Unable to import aporaksha-core security-layer. Using local telemetry fallback.', error);
      securityModule = null;
    }

    return securityModule;
  }

  async function getSecurityStatus() {
    var module = await importSecurityLayer();

    if (module && typeof module.getStatus === 'function') {
      return module.getStatus();
    }

    return {
      status: 'Protected',
      threats_blocked: 0,
      last_scan: new Date().toISOString(),
      source: 'local-fallback'
    };
  }

  function loadDb() {
    var db = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
    db.subscriptions = Array.isArray(db.subscriptions) ? db.subscriptions : [];
    db.auth_nonces = Array.isArray(db.auth_nonces) ? db.auth_nonces : [];
    return db;
  }

  function saveDb(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  function findSub(subId) { return loadDb().subscriptions.find(function (s) { return String(s.id) === String(subId); }); }
  function stableStringify(obj) { return JSON.stringify({ sub_id: obj.sub_id, ts: obj.ts, nonce: obj.nonce }); }
  async function signPayload(payload) {
    var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    var sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(stableStringify(payload)));
    return Array.from(new Uint8Array(sig)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  async function generateAuth(subId) {
    var sub = findSub(subId);
    if (!sub) throw new Error('Subscription not found');
    var payload = { sub_id: String(subId), ts: Date.now(), nonce: crypto.randomUUID() };
    var sig = await signPayload(payload);
    var db = loadDb();
    db.auth_nonces.push({ nonce: payload.nonce, created_at: payload.ts, used_at: null });
    saveDb(db);
    return { payload: payload, sig: sig, qr_data: JSON.stringify({ payload: payload, sig: sig }) };
  }

  async function verifyAuth(input) {
    var payload = input && input.payload; var sig = input && input.sig;
    if (!payload || !sig) return { success: false, error: 'Invalid request' };
    if (await signPayload(payload) !== sig) return { success: false, error: 'Invalid signature' };
    if ((Date.now() - Number(payload.ts || 0)) > 60000) return { success: false, error: 'Expired timestamp' };
    var db = loadDb();
    var nonceRec = db.auth_nonces.find(function (n) { return n.nonce === payload.nonce; });
    if (!nonceRec || nonceRec.used_at) return { success: false, error: 'Nonce already used or missing' };
    var sub = db.subscriptions.find(function (s) { return String(s.id) === String(payload.sub_id) && s.status === 'active'; });
    if (!sub) return { success: false, error: 'Subscription inactive' };
    nonceRec.used_at = Date.now();
    saveDb(db);
    return { success: true, sub_id: payload.sub_id };
  }

  function onPaymentSuccess(payment) {
    var db = loadDb();
    var sub = { id: payment.sub_id || crypto.randomUUID(), user_id: payment.user_id, plan: payment.plan || 'default', status: 'active' };
    db.subscriptions.push(sub);
    saveDb(db);
    return { subscription: sub, access_token: btoa(sub.id + ':' + sub.user_id + ':' + Date.now()) };
  }

  global.CoreSecurityAdapter = {
    importSecurityLayer: importSecurityLayer,
    getSecurityStatus: getSecurityStatus,
    generateAuthPayload: generateAuth,
    verifyAuthPayload: verifyAuth,
    onRazorpayPaymentSuccess: onPaymentSuccess,
    __debugAuthDb: loadDb
  };
})(window);

(function (global) {
  'use strict';

  var SESSION_KEY = 'zayvora_passport_session_v1';
  var TRUSTED_ORIGINS = [
    'https://daxini.xyz',
    'https://logichub.app',
    'https://daxini.space',
    'https://hanuman.solutions',
    'https://viadecide.com',
    'https://aporaksha'
  ];

  function nowIso() {
    return new Date().toISOString();
  }

  function createSessionToken(passport) {
    var seed = passport.passport_id + '|' + nowIso() + '|' + Math.random().toString(36).slice(2);
    return btoa(unescape(encodeURIComponent(seed)));
  }

  function createPassport(input) {
    if (!global.ZayvoraPassportStore || typeof global.ZayvoraPassportStore.createPassport !== 'function') {
      throw new Error('ZayvoraPassportStore is not available.');
    }

    return global.ZayvoraPassportStore.createPassport(input);
  }

  function bindSession(passport) {
    var session = {
      token: createSessionToken(passport),
      passport_id: passport.passport_id,
      handle: passport.handle,
      created_at: nowIso(),
      trusted_origins: TRUSTED_ORIGINS.slice()
    };

    global.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function getSession() {
    var raw = global.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn('Invalid passport session payload.', error);
      return null;
    }
  }

  function lookupPassport(identifier) {
    if (!global.ZayvoraPassportStore) return null;

    if (typeof identifier === 'string' && identifier.indexOf('zpv_') === 0) {
      return global.ZayvoraPassportStore.findPassportById(identifier);
    }

    return global.ZayvoraPassportStore.findPassportByHandle(identifier);
  }

  function loginWithNfcChipId(nfcChipId) {
    if (!global.ZayvoraPassportStore || typeof global.ZayvoraPassportStore.findPassportByNfcChipId !== 'function') {
      return null;
    }

    if (!nfcChipId || typeof nfcChipId !== 'string') return null;

    var passport = global.ZayvoraPassportStore.findPassportByNfcChipId(nfcChipId.trim());
    if (!passport) return null;
    return bindSession(passport);
  }

  function getNfcProfile(nfcChipId) {
    if (!global.ZayvoraPassportStore || typeof global.ZayvoraPassportStore.findPassportByNfcChipId !== 'function') {
      return null;
    }

    var passport = global.ZayvoraPassportStore.findPassportByNfcChipId((nfcChipId || '').trim());
    if (!passport) return null;

    return {
      passport_id: passport.passport_id,
      handle: passport.handle,
      skills: Array.isArray(passport.skills) ? passport.skills : [],
      reputation: Number.isFinite(passport.reputation) ? passport.reputation : 0,
      assets: Array.isArray(passport.assets) ? passport.assets : []
    };
  }

  function isTrustedOrigin(origin) {
    return TRUSTED_ORIGINS.indexOf(origin) !== -1;
  }

  function validateSessionForOrigin(origin) {
    var session = getSession();
    if (!session) return false;

    var originToCheck = origin || global.location.origin;
    return isTrustedOrigin(originToCheck) && Array.isArray(session.trusted_origins) && session.trusted_origins.indexOf(originToCheck) !== -1;
  }

  global.ZayvoraPassportAuth = {
    TRUSTED_ORIGINS: TRUSTED_ORIGINS,
    bindSession: bindSession,
    createPassport: createPassport,
    getSession: getSession,
    isTrustedOrigin: isTrustedOrigin,
    loginWithNfcChipId: loginWithNfcChipId,
    lookupPassport: lookupPassport,
    getNfcProfile: getNfcProfile,
    validateSessionForOrigin: validateSessionForOrigin
  };
})(window);

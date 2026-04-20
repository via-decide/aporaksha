(function (global) {
  'use strict';

  async function loadPassportFromSession() {
    if (!global.ZayvoraPassportAuth) return null;

    var session = global.ZayvoraPassportAuth.getSession();
    if (!session || !session.passport_id) return null;

    if (global.CorePassportAdapter && typeof global.CorePassportAdapter.getPassportProfile === 'function') {
      var profile = await global.CorePassportAdapter.getPassportProfile(session.passport_id);
      if (profile) {
        if (global.ZayvoraPassportCache) {
          global.ZayvoraPassportCache.setPassportCache(profile);
        }
        return profile;
      }
    }

    return null;
  }

  async function loadPassport() {
    var fromSession = await loadPassportFromSession();
    if (fromSession) return fromSession;

    if (global.ZayvoraPassportCache) {
      var cache = global.ZayvoraPassportCache.getPassportCache();
      if (cache && cache.passport) {
        return cache.passport;
      }
    }

    return null;
  }

  global.ZayvoraPassportLoader = {
    loadPassport: loadPassport,
    loadPassportFromSession: loadPassportFromSession
  };
})(window);

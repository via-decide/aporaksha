(function (global) {
  'use strict';

  var CACHE_KEY = 'zayvora_passport_cache_v1';

  function setPassportCache(passport) {
    if (!passport) return null;

    var payload = {
      passport: passport,
      cached_at: new Date().toISOString()
    };

    global.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    return payload;
  }

  function getPassportCache() {
    var raw = global.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn('Invalid passport cache.', error);
      return null;
    }
  }

  global.ZayvoraPassportCache = {
    getPassportCache: getPassportCache,
    setPassportCache: setPassportCache
  };
})(window);

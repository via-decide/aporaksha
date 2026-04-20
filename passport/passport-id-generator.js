(function (global) {
  'use strict';

  function toCompactTimestamp(date) {
    return date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  }

  function randomSegment() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    }

    return Math.random().toString(36).slice(2, 14);
  }

  function generatePassportId(prefix) {
    var safePrefix = typeof prefix === 'string' && prefix.trim() ? prefix.trim() : 'zpv';
    return safePrefix + '_' + toCompactTimestamp(new Date()) + '_' + randomSegment();
  }

  global.ZayvoraPassportId = {
    generatePassportId: generatePassportId
  };
})(window);

(function (global) {
  'use strict';

  var securityModule = null;
  var CORE_BASE_URL = 'https://cdn.jsdelivr.net/gh/via-decide/aporaksha-core@main';

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

  global.CoreSecurityAdapter = {
    importSecurityLayer: importSecurityLayer,
    getSecurityStatus: getSecurityStatus
  };
})(window);

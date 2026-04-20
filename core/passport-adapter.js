(function (global) {
  'use strict';

  var coreModules = null;
  var CORE_BASE_URL = 'https://cdn.jsdelivr.net/gh/via-decide/aporaksha-core@main';

  async function importCoreModules() {
    if (coreModules) return coreModules;

    try {
      var passportManagerModule = await import(CORE_BASE_URL + '/passport-manager/index.js');
      var identityRegistryModule = await import(CORE_BASE_URL + '/identity-registry/index.js');

      coreModules = {
        passportManager: passportManagerModule.default || passportManagerModule,
        identityRegistry: identityRegistryModule.default || identityRegistryModule
      };
    } catch (error) {
      console.warn('Unable to import aporaksha-core passport modules. Falling back to browser passport store.', error);
      coreModules = {
        passportManager: null,
        identityRegistry: null
      };
    }

    return coreModules;
  }

  async function getPassportProfile(identifier) {
    var modules = await importCoreModules();

    if (modules.passportManager && typeof modules.passportManager.getPassportProfile === 'function') {
      return modules.passportManager.getPassportProfile(identifier);
    }

    if (!global.ZayvoraPassportAuth || typeof global.ZayvoraPassportAuth.lookupPassport !== 'function') {
      return null;
    }

    return global.ZayvoraPassportAuth.lookupPassport(identifier);
  }

  async function createOrBindSession(handleOrId) {
    if (!global.ZayvoraPassportAuth) return null;

    var passport = global.ZayvoraPassportAuth.lookupPassport(handleOrId);
    if (!passport) {
      passport = global.ZayvoraPassportAuth.createPassport({
        handle: handleOrId || 'gateway-user',
        skills: ['Gateway Access'],
        assets: ['Zayvora Passport'],
        reputation: 10,
        activity_score: 25
      });
    }

    return global.ZayvoraPassportAuth.bindSession(passport);
  }

  global.CorePassportAdapter = {
    importCoreModules: importCoreModules,
    getPassportProfile: getPassportProfile,
    createOrBindSession: createOrBindSession
  };
})(window);

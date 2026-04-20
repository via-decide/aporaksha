(function (global) {
  'use strict';

  var REGISTRY_KEY = 'zayvora_passport_registry_v1';

  function createEmptyRegistry() {
    return {
      version: 1,
      passports: []
    };
  }

  function loadRegistry() {
    var raw = global.localStorage.getItem(REGISTRY_KEY);
    if (!raw) return createEmptyRegistry();

    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.passports)) return createEmptyRegistry();
      return parsed;
    } catch (error) {
      console.warn('Failed to parse passport registry. Resetting store.', error);
      return createEmptyRegistry();
    }
  }

  function saveRegistry(registry) {
    global.localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
    return registry;
  }

  function createPassport(passportInput) {
    if (!global.ZayvoraPassportModel || typeof global.ZayvoraPassportModel.createPassportModel !== 'function') {
      throw new Error('ZayvoraPassportModel is not available.');
    }

    var registry = loadRegistry();
    var passport = global.ZayvoraPassportModel.createPassportModel(passportInput);

    registry.passports.push(passport);
    saveRegistry(registry);

    return passport;
  }

  function findPassportByHandle(handle) {
    var registry = loadRegistry();
    return registry.passports.find(function (passport) {
      return passport.handle === handle;
    }) || null;
  }

  function findPassportById(passportId) {
    var registry = loadRegistry();
    return registry.passports.find(function (passport) {
      return passport.passport_id === passportId;
    }) || null;
  }

  function findPassportByNfcChipId(nfcChipId) {
    var registry = loadRegistry();
    return registry.passports.find(function (passport) {
      return passport.nfc_chip_id === nfcChipId || passport.nfc_id === nfcChipId;
    }) || null;
  }

  function updateActivity(passportId, amount) {
    var registry = loadRegistry();
    var increment = Number.isFinite(amount) ? amount : 1;

    var passport = registry.passports.find(function (entry) {
      return entry.passport_id === passportId;
    });

    if (!passport) return null;

    passport.activity_score += increment;
    saveRegistry(registry);

    return passport;
  }

  global.ZayvoraPassportStore = {
    createPassport: createPassport,
    findPassportByHandle: findPassportByHandle,
    findPassportById: findPassportById,
    findPassportByNfcChipId: findPassportByNfcChipId,
    loadRegistry: loadRegistry,
    saveRegistry: saveRegistry,
    updateActivity: updateActivity
  };
})(window);

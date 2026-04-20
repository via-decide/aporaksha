(function (global) {
  'use strict';

  function normalizeSkills(skills) {
    return Array.isArray(skills) ? skills.filter(Boolean) : [];
  }

  function normalizeAssets(assets) {
    return Array.isArray(assets) ? assets.filter(Boolean) : [];
  }

  function createPassportModel(input) {
    var payload = input || {};

    if (!payload.handle || typeof payload.handle !== 'string') {
      throw new Error('Passport handle is required.');
    }

    if (!global.ZayvoraPassportId || typeof global.ZayvoraPassportId.generatePassportId !== 'function') {
      throw new Error('ZayvoraPassportId generator is not available.');
    }

    return {
      passport_id: payload.passport_id || global.ZayvoraPassportId.generatePassportId('zpv'),
      handle: payload.handle.trim(),
      join_date: payload.join_date || new Date().toISOString(),
      activity_score: Number.isFinite(payload.activity_score) ? payload.activity_score : 0,
      skills: normalizeSkills(payload.skills),
      reputation: Number.isFinite(payload.reputation) ? payload.reputation : 0,
      assets: normalizeAssets(payload.assets),
      wallet_address: payload.wallet_address || null,
      nfc_chip_id: payload.nfc_chip_id || payload.nfc_id || null
    };
  }

  global.ZayvoraPassportModel = {
    createPassportModel: createPassportModel
  };
})(window);

(function (global) {
  'use strict';

  function listOrPlaceholder(values) {
    if (!Array.isArray(values) || !values.length) return '—';
    return values.join(', ');
  }

  function setText(id, text) {
    var element = document.getElementById(id);
    if (!element) return;
    element.textContent = text;
  }

  async function renderPassportProfile() {
    var passport = global.ZayvoraPassportLoader
      ? await global.ZayvoraPassportLoader.loadPassport()
      : null;

    if (!passport) {
      setText('passport-id', 'No active passport session');
      return;
    }

    setText('passport-id', passport.passport_id || '—');
    setText('passport-handle', passport.handle || '—');
    setText('passport-reputation', String(passport.reputation || 0));
    setText('passport-skills', listOrPlaceholder(passport.skills));
    setText('passport-assets', listOrPlaceholder(passport.assets));
    setText('passport-activity', String(passport.activity_score || 0));
  }

  async function bindNfcButton() {
    var button = document.getElementById('nfc-login-button');
    var status = document.getElementById('nfc-status');
    if (!button || !status) return;

    button.addEventListener('click', async function () {
      if (!global.ZayvoraNfcPassportReader) return;

      status.textContent = 'Scanning NFC reader…';
      var result = await global.ZayvoraNfcPassportReader.readPassportFromNfc();
      status.textContent = result.message;

      if (result.passport && global.ZayvoraPassportCache) {
        global.ZayvoraPassportCache.setPassportCache(result.passport);
        renderPassportProfile();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderPassportProfile();
    bindNfcButton();
  });
})(window);

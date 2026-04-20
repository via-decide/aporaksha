(function (global) {
  'use strict';

  async function readPassportFromNfc() {
    if (!('NDEFReader' in global)) {
      return {
        supported: false,
        message: 'Web NFC is not available in this browser.',
        passport: null
      };
    }

    var reader = new global.NDEFReader();

    return new Promise(function (resolve) {
      reader.addEventListener('reading', function (event) {
        var serialNumber = event.serialNumber || '';
        var passport = global.ZayvoraPassportAuth
          ? global.ZayvoraPassportAuth.getNfcProfile(serialNumber)
          : null;

        resolve({
          supported: true,
          message: passport ? 'Passport found.' : 'No passport mapped to NFC serial.',
          passport: passport
        });
      });

      reader.scan().catch(function () {
        resolve({
          supported: true,
          message: 'NFC scan failed or was cancelled.',
          passport: null
        });
      });
    });
  }

  global.ZayvoraNfcPassportReader = {
    readPassportFromNfc: readPassportFromNfc
  };
})(window);

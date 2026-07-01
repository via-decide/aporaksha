(function (global) {
  'use strict';

  async function readPassportFromNfc() {
    if (!('NDEFReader' in global)) {
      return new Promise(function (resolve) {
        let style = document.getElementById('nfc-sim-style');
        if (!style) {
          style = document.createElement('style');
          style.id = 'nfc-sim-style';
          style.textContent = [
            '.nfc-sim-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; background: rgba(2, 2, 5, 0.9); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }',
            '.nfc-sim-card { background: #0b0d19; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 32px; max-width: 380px; width: 90%; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.6); color: #fff; font-family: system-ui, -apple-system, sans-serif; }',
            '.nfc-sim-title { font-size: 18px; font-weight: 700; margin-bottom: 12px; color: #22d3ee; text-transform: uppercase; letter-spacing: 2px; }',
            '.nfc-sim-input { width: 100%; background: #1e293b; border: 1px solid rgba(255,255,255,0.12); padding: 12px; border-radius: 10px; color: #fff; text-align: center; font-family: monospace; font-size: 16px; margin: 20px 0; outline: none; }',
            '.nfc-sim-input:focus { border-color: #22d3ee; }',
            '.nfc-sim-btn-group { display: flex; gap: 10px; justify-content: center; }',
            '.nfc-sim-btn { flex: 1; padding: 12px 20px; border-radius: 10px; border: none; cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.2s; }',
            '.nfc-sim-btn-primary { background: #0ea5e9; color: #fff; }',
            '.nfc-sim-btn-primary:hover { background: #0284c7; }',
            '.nfc-sim-btn-secondary { background: #334155; color: #cbd5e1; }',
            '.nfc-sim-btn-secondary:hover { background: #475569; }'
          ].join('\n');
          document.head.appendChild(style);
        }

        const overlay = document.createElement('div');
        overlay.className = 'nfc-sim-overlay';
        overlay.innerHTML = [
          '<div class="nfc-sim-card">',
          '  <div class="nfc-sim-title">NFC Reader Simulator</div>',
          '  <p style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin: 0;">Physical NFC is unavailable in this browser. Enter a simulated serial address below:</p>',
          '  <input type="text" class="nfc-sim-input" value="04:DE:AD:BE:EF:C0:DE" placeholder="XX:XX:XX:XX:XX:XX:XX" />',
          '  <div class="nfc-sim-btn-group">',
          '    <button class="nfc-sim-btn nfc-sim-btn-secondary nfc-sim-cancel">Cancel</button>',
          '    <button class="nfc-sim-btn nfc-sim-btn-primary nfc-sim-submit">Simulate Tap</button>',
          '  </div>',
          '</div>'
        ].join('\n');
        document.body.appendChild(overlay);

        overlay.querySelector('.nfc-sim-cancel').onclick = function () {
          overlay.remove();
          resolve({
            supported: true,
            message: 'NFC scan failed or was cancelled.',
            passport: null
          });
        };

        overlay.querySelector('.nfc-sim-submit').onclick = function () {
          const serial = overlay.querySelector('.nfc-sim-input').value.trim();
          overlay.remove();

          var passport = global.ZayvoraPassportAuth
            ? global.ZayvoraPassportAuth.getNfcProfile(serial)
            : null;

          resolve({
            supported: true,
            message: passport ? 'Passport found.' : 'No passport mapped to NFC serial.',
            passport: passport,
            serialNumber: serial
          });
        };
      });
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
          passport: passport,
          serialNumber: serialNumber
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

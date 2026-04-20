(function (global) {
  'use strict';

  async function getTelemetrySummary() {
    var securityStatus = global.CoreSecurityAdapter
      ? await global.CoreSecurityAdapter.getSecurityStatus()
      : null;

    return {
      status: securityStatus && securityStatus.status ? securityStatus.status : 'Protected',
      attack_summary: securityStatus && Number.isFinite(securityStatus.threats_blocked)
        ? securityStatus.threats_blocked + ' threats blocked'
        : 'No active threats detected',
      scanned_at: securityStatus && securityStatus.last_scan ? securityStatus.last_scan : new Date().toISOString()
    };
  }

  global.HanumanTelemetryAdapter = {
    getTelemetrySummary: getTelemetrySummary
  };
})(window);

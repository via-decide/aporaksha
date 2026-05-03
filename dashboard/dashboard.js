(function (global) {
  'use strict';

  var systems = [
    { key: 'daxini_xyz', name: 'daxini.xyz', url: 'https://daxini.xyz' },
    { key: 'logichub_app', name: 'logichub.app', url: 'https://logichub.app' },
    { key: 'daxini_space', name: 'daxini.space', url: 'https://daxini.space' },
    { key: 'hanuman_solutions', name: 'hanuman.solutions', url: 'https://hanuman.solutions' },
    { key: 'viadecide_com', name: 'viadecide.com', url: 'https://viadecide.com' }
  ];

  function setText(id, text) {
    var node = document.getElementById(id);
    if (node) node.textContent = text;
  }

  async function loadMarketplaceActivity() {
    try {
      var response = await fetch('https://api.github.com/orgs/via-decide/events?per_page=6');
      if (!response.ok) throw new Error('GitHub status ' + response.status);
      var data = await response.json();
      var installs = data.filter(function (event) { return event.type === 'PushEvent'; }).length;
      var releases = data.filter(function (event) { return event.type === 'ReleaseEvent'; }).length;
      setText('marketplace-activity', installs + ' builder pushes · ' + releases + ' releases in recent events');

      var feed = document.getElementById('activity-stream');
      if (!feed) return;
      feed.innerHTML = data.slice(0, 5).map(function (event) {
        return '<li><span class="activity-time">' + event.type + '</span>' + (event.repo ? event.repo.name : 'unknown') + '</li>';
      }).join('');
    } catch (error) {
      setText('marketplace-activity', 'GitHub event stream unavailable right now.');
      setText('activity-stream', 'Activity feed unavailable.');
      console.error(error);
    }
  }

  async function loadPassportIdentity() {
    var session = global.ZayvoraPassportAuth && global.ZayvoraPassportAuth.getSession
      ? global.ZayvoraPassportAuth.getSession()
      : null;

    if (session && session.passport_id) {
      setText('passport-identity', 'Active passport: ' + session.passport_id);
      return;
    }

    if (global.CorePassportAdapter && typeof global.CorePassportAdapter.createOrBindSession === 'function') {
      var created = await global.CorePassportAdapter.createOrBindSession('dashboard-user');
      setText('passport-identity', created && created.passport_id ? 'Bound passport: ' + created.passport_id : 'Passport bind pending');
      return;
    }

    setText('passport-identity', 'Passport layer offline');
  }

  async function loadSecurityTelemetry() {
    if (!global.HanumanTelemetryAdapter || typeof global.HanumanTelemetryAdapter.getTelemetrySummary !== 'function') {
      setText('security-telemetry', 'Telemetry adapter unavailable');
      return;
    }

    var summary = await global.HanumanTelemetryAdapter.getTelemetrySummary();
    setText('security-telemetry', summary.status + ' · ' + summary.attack_summary);
  }

  function renderOrders() {
    var node = document.getElementById('nfc-dashboard-state');
    if (!node) return;
    try {
      var orders = JSON.parse(localStorage.getItem('nfc_orders') || '[]');
      var latest = Array.isArray(orders) && orders.length ? orders[0] : null;
      if (!latest || latest.type !== 'nfc') {
        node.textContent = 'No NFC orders yet.';
        return;
      }
      if (latest.nfcType === 'booking') {
        node.innerHTML = 'NFC booking confirmed. <button class="btn" data-action="payRemaining" type="button">Pay Remaining ₹2499</button>';
      } else {
        node.textContent = 'NFC card fully paid. Ready for dispatch.';
      }
    } catch (error) {
      node.textContent = 'Unable to read NFC order state.';
    }
  }



  function bindOrderActions() {
    var node = document.getElementById('nfc-dashboard-state');
    if (!node) return;
    node.addEventListener('click', function (event) {
      var button = event.target.closest('[data-action="payRemaining"]');
      if (!button) return;
      global.location.href = '../index.html';
    });
  }

  function renderSystemStatusPanel() {
    if (!global.SystemStatusPanel || typeof global.SystemStatusPanel.render !== 'function') return;

    var health = ['online', 'online', 'degraded', 'online', 'online'];
    global.SystemStatusPanel.render('system-status-grid', systems.map(function (system, index) {
      return {
        name: system.name,
        url: system.url,
        status: health[index] === 'online' ? 'Operational' : 'Partial latency',
        health: health[index]
      };
    }));
  }

  function bindQuickLaunch() {
    var launch = document.getElementById('quick-launch');
    if (!launch) return;

    systems.forEach(function (system) {
      var button = document.createElement('button');
      button.className = 'btn';
      button.type = 'button';
      button.textContent = system.name;
      button.addEventListener('click', function () {
        if (global.EcosystemRouter) {
          global.EcosystemRouter.routeTo(system.key, { openInNewTab: true });
        }
      });
      launch.appendChild(button);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindQuickLaunch();
    renderSystemStatusPanel();
    loadMarketplaceActivity();
    loadSecurityTelemetry();
    loadPassportIdentity();
    bindOrderActions();
    renderOrders();
  });
})(window);

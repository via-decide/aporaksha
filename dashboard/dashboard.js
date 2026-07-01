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

  function isAuthenticated() {
    return !!localStorage.getItem('zayvora_token');
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('timeout')); }, ms);
      })
    ]);
  }

  function renderUnavailable(id) {
    var node = document.getElementById(id);
    if (!node) return;
    node.innerHTML = 'Unavailable — <a href="" onclick="window.location.reload(); return false;">retry</a>';
  }

  async function loadMarketplaceActivity() {
    try {
      var response = await withTimeout(fetch('https://api.github.com/orgs/via-decide/events?per_page=6'), 5000);
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
      renderUnavailable('marketplace-activity');
      renderUnavailable('activity-stream');
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
      try {
        var created = await withTimeout(global.CorePassportAdapter.createOrBindSession('dashboard-user'), 5000);
        setText('passport-identity', created && created.passport_id ? 'Bound passport: ' + created.passport_id : 'Passport bind pending');
      } catch (error) {
        renderUnavailable('passport-identity');
      }
      return;
    }

    renderUnavailable('passport-identity');
  }

  async function loadSecurityTelemetry() {
    if (!global.HanumanTelemetryAdapter || typeof global.HanumanTelemetryAdapter.getTelemetrySummary !== 'function') {
      setText('security-telemetry', 'Telemetry adapter unavailable');
      return;
    }

    try {
      var summary = await withTimeout(global.HanumanTelemetryAdapter.getTelemetrySummary(), 5000);
      setText('security-telemetry', summary.status + ' · ' + summary.attack_summary);
    } catch (error) {
      renderUnavailable('security-telemetry');
    }
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

  async function loadDigitalPurchases() {
    var list = document.getElementById('entitlements-list');
    if (!list) return;
    
    var sessionStr = localStorage.getItem('aporaksha_session');
    var email = sessionStr ? JSON.parse(sessionStr).email : null;
    
    if (!email) {
      list.innerHTML = '<li>Log in to view purchases.</li>';
      return;
    }
    
    try {
      var response = await withTimeout(fetch('../api/passport/verify?email=' + encodeURIComponent(email)), 5000);
      var data = await response.json();
      
      if (!data.entitlements || data.entitlements.length === 0) {
        list.innerHTML = '<li>No digital purchases found on this passport.</li>';
      } else {
        list.innerHTML = data.entitlements.map(function(e) { 
          return '<li><strong style="color:var(--text)">' + e + '</strong> — Lifetime Digital License</li>'; 
        }).join('');
      }

      // Update store bundle details dynamically based on region & billing status
      var priceEl = document.getElementById('store-bundle-price');
      var descEl = document.getElementById('store-bundle-desc');
      var buyBtn = document.getElementById('btn-purchase-architect');
      if (priceEl && descEl && buyBtn) {
        var isPremium = data.billing_status === 'ACTIVE' || (data.entitlements && data.entitlements.some(function(e) {
          return e.indexOf('Founder Pass') !== -1 || e.indexOf('Premium OS') !== -1;
        }));

        if (isPremium) {
          buyBtn.disabled = true;
          buyBtn.textContent = '✓ Active Access Tier';
          buyBtn.style.background = '#10b981';
          priceEl.textContent = 'Purchased';
          descEl.textContent = 'Sovereign Digital Architect Bundle active on your passport.';
        } else if (data.country === 'IN') {
          priceEl.textContent = '₹99/mo';
          descEl.textContent = 'Recurring monthly access subscription.';
          buyBtn.textContent = 'Subscribe — ₹99/mo';
        } else {
          priceEl.textContent = '$12/yr';
          descEl.textContent = 'Recurring annual access subscription.';
          buyBtn.textContent = 'Complete Checkout — $12';
        }
      }

    } catch (err) {
      list.innerHTML = '<li>Unable to load purchases. <a href="" onclick="location.reload();return false;" style="color:var(--accent)">Retry</a></li>';
    }
  }

  function bindStoreActions() {
    var btn = document.getElementById('btn-purchase-architect');
    if (!btn) return;
    
    btn.addEventListener('click', function() {
      global.location.href = '../passport/checkout.html';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!isAuthenticated()) {
      global.location.href = '../index.html?login=required&redirect=dashboard';
      return;
    }

    bindQuickLaunch();
    renderSystemStatusPanel();
    loadMarketplaceActivity();
    loadSecurityTelemetry();
    loadPassportIdentity();
    bindOrderActions();
    renderOrders();
    loadDigitalPurchases();
    bindStoreActions();
  });
})(window);

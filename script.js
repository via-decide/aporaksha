(function () {
  'use strict';

  const stack = document.getElementById('stack');
  const stackInfo = document.getElementById('stack-info');

  if (stack && stackInfo) {
    stack.addEventListener('click', function (event) {
      const button = event.target.closest('.layer');
      if (!button) return;

      stack.querySelectorAll('.layer').forEach(function (layer) {
        layer.classList.remove('active');
      });

      button.classList.add('active');
      stackInfo.textContent = button.dataset.info || '';
    });
  }

  function renderKnowledgeGraph() {
    const container = document.getElementById('knowledge-graph');
    if (!container || typeof window.vis === 'undefined') return;

    const nodes = new window.vis.DataSet([
      { id: 1, label: 'Reasoning Systems', color: '#5b8cff' },
      { id: 2, label: 'AI Decision Making', color: '#c9a84c' },
      { id: 3, label: 'Solo Founder Strategy', color: '#5b8cff' },
      { id: 4, label: 'Research Thinking', color: '#c9a84c' },
      { id: 5, label: 'Zayvora Architecture', color: '#5b8cff' }
    ]);

    const edges = new window.vis.DataSet([
      { from: 1, to: 2 },
      { from: 1, to: 4 },
      { from: 2, to: 5 },
      { from: 3, to: 4 },
      { from: 4, to: 5 }
    ]);

    const options = {
      autoResize: true,
      physics: { stabilization: true },
      nodes: {
        shape: 'dot',
        size: 14,
        font: { color: '#e5e8f0', face: 'Inter', size: 14 },
        borderWidth: 1
      },
      edges: {
        color: 'rgba(91, 140, 255, 0.4)',
        width: 1.2,
        smooth: { type: 'dynamic' }
      },
      interaction: {
        hover: true,
        tooltipDelay: 120
      }
    };

    // eslint-disable-next-line no-new
    new window.vis.Network(container, { nodes: nodes, edges: edges }, options);
  }

  async function loadGitHubRepos() {
    const container = document.getElementById('repos');
    if (!container) return;

    container.textContent = 'Loading repositories…';

    try {
      const response = await fetch('https://api.github.com/users/via-decide/repos?sort=updated&per_page=6');
      if (!response.ok) {
        throw new Error('GitHub response error: ' + response.status);
      }

      const data = await response.json();
      const repos = Array.isArray(data) ? data.slice(0, 6) : [];

      container.textContent = '';

      repos.forEach(function (repo) {
        const card = document.createElement('article');
        card.className = 'repo';

        const title = document.createElement('h4');
        title.textContent = repo.name;

        const description = document.createElement('p');
        description.textContent = repo.description || 'No description available.';

        const link = document.createElement('a');
        link.href = repo.html_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Open Repo';

        card.appendChild(title);
        card.appendChild(description);
        card.appendChild(link);
        container.appendChild(card);
      });

      if (!repos.length) {
        container.textContent = 'No repositories found.';
      }
    } catch (error) {
      container.textContent = 'Unable to load GitHub activity right now.';
      console.error(error);
    }
  }

  function waitForVisAndRender() {
    if (typeof window.vis !== 'undefined') {
      renderKnowledgeGraph();
    } else {
      setTimeout(waitForVisAndRender, 100);
    }
  }

  function setText(id, text) {
    var element = document.getElementById(id);
    if (!element) return;
    element.textContent = text;
  }

  async function loadSecurityTelemetry() {
    if (!window.HanumanTelemetryAdapter || typeof window.HanumanTelemetryAdapter.getTelemetrySummary !== 'function') {
      return;
    }

    var summary = await window.HanumanTelemetryAdapter.getTelemetrySummary();
    setText('security-status', summary.status || 'Protected');
    setText('security-summary', summary.attack_summary || 'No active threats detected');
    setText('security-scan', summary.scanned_at || new Date().toISOString());
  }

  function getGatewayHandle() {
    var seed = Date.now().toString(36).slice(-6);
    return 'gateway_' + seed;
  }

  function bindPassportEntry() {
    var button = document.getElementById('open-passport-button');
    if (!button) return;

    button.addEventListener('click', async function (event) {
      event.preventDefault();

      if (window.CorePassportAdapter && typeof window.CorePassportAdapter.createOrBindSession === 'function') {
        await window.CorePassportAdapter.createOrBindSession(getGatewayHandle());
      }

      window.location.href = './passport/';
    });
  }

  function renderGatewayModules() {
    if (window.EcosystemGrid && typeof window.EcosystemGrid.render === 'function') {
      window.EcosystemGrid.render('ecosystem-module-grid');
    }

    if (window.CapabilitiesGrid && typeof window.CapabilitiesGrid.render === 'function') {
      window.CapabilitiesGrid.render('capabilities-grid');
    }

    if (window.ActivityFeed && typeof window.ActivityFeed.render === 'function') {
      window.ActivityFeed.render('activity-feed');
    }
  }



  function getAuthToken() {
    return localStorage.getItem('zayvora_token') || '';
  }

  function authHeaders() {
    var token = getAuthToken();
    return token ? { Authorization: 'Bearer ' + token } : {};
  }

  function bindLoginFlow() {
    var navAuth = document.getElementById('nav-auth');
    if (!navAuth) return;

    function renderStatus() {
      var hasToken = !!getAuthToken();
      navAuth.innerHTML = hasToken
        ? '<button class="btn" id="logout-btn" type="button">Logout</button>'
        : '<button class="btn" id="login-btn" type="button">Login</button>' ;
      bindActions();
    }

    function bindActions() {
      var button = document.getElementById('login-btn');
      var logout = document.getElementById('logout-btn');
      if (button) button.onclick = async function () {
      try {
      var email = window.prompt('Enter email:', '');
      var password = window.prompt('Enter password:', '');
      var res = await fetch('./api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email, password: password })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      localStorage.setItem('zayvora_token', data.token || data.accessToken || '');
      renderStatus();
    } catch (error) { window.alert(error.message || 'Network error'); }
    };

      if (logout) logout.onclick = async function () {
        localStorage.removeItem('zayvora_token');
        await fetch('./api/logout', { method: 'POST' });
        renderStatus();
      };
    }

    renderStatus();
  }
  async function loadRazorpayKeyId() {
    try {
      var response = await fetch('./api/razorpay-config');
      if (!response.ok) throw new Error('Config fetch failed');
      var data = await response.json();
      return data.keyId || '';
    } catch (error) {
      console.error('Unable to load Razorpay key id:', error);
      return '';
    }
  }

  function getTrackedOrders() {
    try {
      var raw = localStorage.getItem('nfc_orders');
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function saveTrackedOrder(order) {
    var orders = getTrackedOrders();
    orders.unshift(order);
    localStorage.setItem('nfc_orders', JSON.stringify(orders.slice(0, 20)));
  }



  function ensureReminderState(order) {
    if (!order || order.type !== 'nfc' || order.nfcType !== 'booking') return order;
    if (!order.reminder || typeof order.reminder !== 'object') {
      order.reminder = { enabled: true, lastSent: null, count: 0 };
      return order;
    }
    if (order.reminder.enabled !== true) order.reminder.enabled = true;
    if (!Object.prototype.hasOwnProperty.call(order.reminder, 'lastSent')) order.reminder.lastSent = null;
    if (typeof order.reminder.count !== 'number') order.reminder.count = 0;
    return order;
  }

  function loadOrders() {
    var orders = getTrackedOrders();
    var changed = false;
    orders.forEach(function (order) {
      var before = JSON.stringify(order && order.reminder ? order.reminder : null);
      ensureReminderState(order);
      var after = JSON.stringify(order && order.reminder ? order.reminder : null);
      if (before !== after) changed = true;
    });
    if (changed) {
      localStorage.setItem('nfc_orders', JSON.stringify(orders.slice(0, 20)));
    }
    return orders;
  }

  function saveOrders(orders) {
    localStorage.setItem('nfc_orders', JSON.stringify((orders || []).slice(0, 20)));
  }

  function triggerReminder(order) {
    window.alert('⚠️ Complete your NFC payment ₹2499');
    setTimeout(function () {
      if (window.confirm('Pay remaining ₹2499 for NFC Card?')) {
        var button = document.getElementById('pay-remaining-btn');
        if (button) button.click();
      }
    }, 500);
  }

  function runReminderEngine() {
    var orders = loadOrders();
    var now = Date.now();

    orders.forEach(function (order) {
      if (!order || order.type !== 'nfc') return;
      if (order.nfcType !== 'booking') return;
      ensureReminderState(order);
      if (order.reminder.enabled !== true) return;
      if (order.reminder.count >= 3) return;

      var last = order.reminder.lastSent ? new Date(order.reminder.lastSent).getTime() : 0;
      var hoursPassed = (now - last) / (1000 * 60 * 60);

      if (hoursPassed > 24) {
        triggerReminder(order);
        order.reminder.lastSent = new Date().toISOString();
        order.reminder.count += 1;
        saveOrders(orders);
      }
    });
  }

  function renderLiveTracking() {
    var root = document.getElementById('nfc-tracking');
    if (!root) return;
    var order = getTrackedOrders()[0];
    if (!order || order.type !== 'nfc') {
      root.style.display = 'none';
      return;
    }
    var detail = order.nfcType === 'booking' ? 'Booked ✅ · Remaining ₹2499' : 'Fully Paid ✅ · Ready for dispatch';
    root.style.display = 'block';
    root.innerHTML = '<strong>NFC Card Order</strong><div>' + detail + '</div><div>Order ID: ' + order.id + '</div>';
  }

  function createOrderAfterPayment(paymentType, razorpayOrderId) {
    var total = paymentType === 'booking' ? 500 : (paymentType === 'full' ? 2999 : 2499);
    var now = new Date();
    saveTrackedOrder({
      id: razorpayOrderId || ('local_' + now.getTime()),
      items: [{ type: 'nfc', name: 'NFC Card', price: total, qty: 1 }],
      total: total,
      payment: 'razorpay',
      status: 'confirmed',
      type: 'nfc',
      nfcType: paymentType === 'booking' ? 'booking' : 'full',
      reminder: paymentType === 'booking' ? { enabled: true, lastSent: null, count: 0 } : null,
      timestamp: now.toISOString(),
      updates: [{ at: now.toISOString(), text: 'Payment verified' }]
    });
    renderLiveTracking();
  }

  function bindPayRemainingButton() {
    var fullBtn = document.getElementById('pay-full-btn');
    if (!fullBtn || !fullBtn.parentNode || document.getElementById('pay-remaining-btn')) return;
    var button = document.createElement('button');
    button.className = 'btn';
    button.id = 'pay-remaining-btn';
    button.type = 'button';
    button.textContent = 'PAY REMAINING ₹2499';
    fullBtn.parentNode.appendChild(button);
  }

  function bindPaymentButton(buttonId, paymentType) {
    var button = document.getElementById(buttonId);
    if (!button) return;

    button.onclick = async function () {
      try {
        if (!getAuthToken()) {
          window.alert('Please login before making payment.');
          return;
        }
        var res = await fetch('./api/create-order', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
          body: JSON.stringify({ type: paymentType })
        });

        if (!res.ok) {
          throw new Error('Order creation failed');
        }

        var order = await res.json();
        var keyId = window.RAZORPAY_KEY_ID || await loadRazorpayKeyId();

        var options = {
          key: keyId,
          amount: order.amount,
          currency: order.currency,
          order_id: order.order_id,
          handler: async function (response) {
            var verifyResponse = await fetch('./api/verify-payment', {
              method: 'POST',
              headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                type: paymentType
              })
            });
            if (!verifyResponse.ok) {
              throw new Error('Payment verification failed');
            }
            createOrderAfterPayment(paymentType, response.razorpay_order_id);
          },
          modal: {
            ondismiss: function () {
              console.log('User closed payment');
            }
          }
        };

        var rzp = new Razorpay(options);

        rzp.on('payment.failed', function (failure) {
          console.warn('Payment failed:', failure && failure.error && failure.error.reason ? failure.error.reason : 'unknown');
        });

        rzp.open();
      } catch (error) {
        console.error('Payment flow failed:', error);
        if (window.confirm('Payment service unavailable. Continue with demo checkout?')) {
          window.alert('Demo checkout complete.');
        }
      }
    };
  }

  waitForVisAndRender();
  loadGitHubRepos();
  bindPassportEntry();
  loadSecurityTelemetry();
  renderGatewayModules();
  bindLoginFlow();
  bindPayRemainingButton();
  bindPaymentButton('pay-booking-btn', 'booking');
  bindPaymentButton('pay-full-btn', 'full');
  bindPaymentButton('pay-remaining-btn', 'remaining');
  renderLiveTracking();
  runReminderEngine();
  setInterval(runReminderEngine, 60000);
})();

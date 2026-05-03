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

  function bindPaymentButton(buttonId, paymentType) {
    var button = document.getElementById(buttonId);
    if (!button) return;

    button.onclick = async function () {
      try {
        var res = await fetch('./api/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: paymentType, userId: getGatewayHandle() })
        });

        if (!res.ok) {
          throw new Error('Order creation failed');
        }

        var order = await res.json();
        var keyId = await loadRazorpayKeyId();

        var options = {
          key: keyId,
          amount: order.amount,
          currency: order.currency,
          order_id: order.order_id,
          handler: async function (response) {
            var verifyResponse = await fetch('./api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                type: paymentType,
                userId: getGatewayHandle()
              })
            });
            if (!verifyResponse.ok) {
              throw new Error('Payment verification failed');
            }
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
      }
    };
  }

  waitForVisAndRender();
  loadGitHubRepos();
  bindPassportEntry();
  loadSecurityTelemetry();
  renderGatewayModules();
  bindPaymentButton('pay-booking-btn', 'booking');
  bindPaymentButton('pay-full-btn', 'full');
})();

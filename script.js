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

      window.location.href = '/passport';
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

  waitForVisAndRender();
  loadGitHubRepos();
  bindPassportEntry();
  loadSecurityTelemetry();
  renderGatewayModules();
})();

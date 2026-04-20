(function (global) {
  'use strict';

  var modules = [
    {
      icon: '🧠',
      name: 'Workspace',
      description: 'Plan and execute work sessions in Daxini.',
      href: 'https://daxini.xyz'
    },
    {
      icon: '🛠️',
      name: 'Builder Platform',
      description: 'Design and ship logic flows in Logichub.',
      href: 'https://logichub.app'
    },
    {
      icon: '🛒',
      name: 'Marketplace',
      description: 'Publish and install ecosystem assets.',
      href: 'https://daxini.space'
    },
    {
      icon: '🛡️',
      name: 'Security Telemetry',
      description: 'Monitor trust signals and blocked attacks.',
      href: 'https://hanuman.solutions'
    },
    {
      icon: '🏢',
      name: 'Company',
      description: 'Explore ViaDecide organization and mission.',
      href: 'https://viadecide.com'
    }
  ];

  function renderGrid(targetId) {
    var container = document.getElementById(targetId);
    if (!container || !global.EcosystemCard || typeof global.EcosystemCard.render !== 'function') return;
    container.innerHTML = modules.map(global.EcosystemCard.render).join('');
  }

  global.EcosystemGrid = {
    render: renderGrid
  };
})(window);

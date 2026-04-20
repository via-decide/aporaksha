(function (global) {
  'use strict';

  var capabilities = [
    'Research with AI',
    'Build tools visually',
    'Generate simulations',
    'Publish creations',
    'Install marketplace tools',
    'Monitor security telemetry'
  ];

  function render(targetId) {
    var container = document.getElementById(targetId);
    if (!container) return;

    container.innerHTML = capabilities.map(function (item) {
      return '<article class="surface capability-item"><h3>' + item + '</h3></article>';
    }).join('');
  }

  global.CapabilitiesGrid = {
    render: render
  };
})(window);

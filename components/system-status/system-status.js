(function (global) {
  'use strict';

  function render(targetId, systems) {
    var container = document.getElementById(targetId);
    if (!container || !Array.isArray(systems)) return;

    container.innerHTML = '';

    systems.forEach(function (system) {
      var card = document.createElement('article');
      card.className = 'module';

      var name = document.createElement('h3');
      name.textContent = system.name;

      var status = document.createElement('p');
      status.textContent = 'Status: ' + system.status;

      var indicator = document.createElement('span');
      indicator.className = 'status-pill status-' + (system.health || 'degraded');
      indicator.textContent = system.health || 'degraded';

      var openLink = document.createElement('a');
      openLink.className = 'module-open';
      openLink.href = system.url;
      openLink.target = '_blank';
      openLink.rel = 'noopener noreferrer';
      openLink.textContent = 'Open';

      card.appendChild(name);
      card.appendChild(status);
      card.appendChild(indicator);
      card.appendChild(openLink);
      container.appendChild(card);
    });
  }

  global.SystemStatusPanel = {
    render: render
  };
})(window);

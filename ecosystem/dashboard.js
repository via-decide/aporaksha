(function (global) {
  'use strict';

  var ecosystemItems = [
    { key: 'daxini_xyz', name: 'daxini.xyz', purpose: 'Workspace and app execution core.', link: 'https://daxini.xyz', activity: 'Active' },
    { key: 'daxini_space', name: 'daxini.space', purpose: 'Marketplace for ecosystem modules.', link: 'https://daxini.space', activity: 'Growing' },
    { key: 'logichub_app', name: 'logichub.app', purpose: 'Logic hub and system coordination.', link: 'https://logichub.app', activity: 'Active' },
    { key: 'hanuman_solutions', name: 'hanuman.solutions', purpose: 'Security and telemetry layer.', link: 'https://hanuman.solutions', activity: 'Protected' },
    { key: 'viadecide_com', name: 'viadecide.com', purpose: 'Public ecosystem and brand portal.', link: 'https://viadecide.com', activity: 'Active' }
  ];

  function renderItem(item) {
    var article = document.createElement('article');
    article.className = 'module';

    var title = document.createElement('h3');
    title.textContent = item.name;

    var purpose = document.createElement('p');
    purpose.textContent = item.purpose;

    var indicator = document.createElement('p');
    indicator.className = 'module-status online';
    indicator.textContent = 'Activity: ' + item.activity;

    var openLink = document.createElement('a');
    openLink.className = 'module-open';
    openLink.href = item.link;
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    openLink.textContent = 'Open Live Link';

    var routeButton = document.createElement('button');
    routeButton.className = 'btn';
    routeButton.type = 'button';
    routeButton.style.marginTop = '0.5rem';
    routeButton.textContent = 'Route with Passport';
    routeButton.addEventListener('click', function () {
      if (global.EcosystemRouter) {
        global.EcosystemRouter.routeTo(item.key, { openInNewTab: true });
      }
    });

    article.appendChild(title);
    article.appendChild(purpose);
    article.appendChild(indicator);
    article.appendChild(openLink);
    article.appendChild(routeButton);

    return article;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var container = document.getElementById('ecosystem-directory');
    if (!container) return;

    ecosystemItems.forEach(function (item) {
      container.appendChild(renderItem(item));
    });
  });
})(window);

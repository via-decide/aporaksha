(function (global) {
  'use strict';

  var items = [
    'New tool published',
    'Simulation created',
    'Research session completed',
    'Marketplace asset uploaded',
    'Security attack blocked'
  ];

  function render(targetId) {
    var container = document.getElementById(targetId);
    if (!container) return;

    container.innerHTML = items.map(function (item, index) {
      return '<li><span class="activity-time">T-' + (5 - index) + 'm</span>' + item + '</li>';
    }).join('');
  }

  global.ActivityFeed = {
    render: render
  };
})(window);

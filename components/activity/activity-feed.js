(function (global) {
  'use strict';

  var items = [
    {
      category: 'New tools',
      title: 'Decision Matrix Composer launched',
      detail: 'A creator published a matrix planner for daily architecture tradeoffs.',
      age: '2m ago'
    },
    {
      category: 'New simulations',
      title: 'Founder Runway Stress Test posted',
      detail: 'A sandbox model now lets builders test cash-flow decisions before launch.',
      age: '6m ago'
    },
    {
      category: 'New research artifacts',
      title: 'Prompt Reliability Notes shared',
      detail: 'A public artifact tracks benchmark outcomes across five reasoning patterns.',
      age: '11m ago'
    },
    {
      category: 'Marketplace releases',
      title: 'Telemetry Guard v1.2 released',
      detail: 'Marketplace listing updated with trust scoring and export snapshots.',
      age: '17m ago'
    },
    {
      category: 'New tools',
      title: 'Workflow Relay Kit updated',
      detail: 'Automation utility now supports one-click routing into workspace modules.',
      age: '24m ago'
    },
    {
      category: 'Marketplace releases',
      title: 'Skillpack Starter Bundle published',
      detail: 'A packaged starter bundle went live for first-time creators.',
      age: '31m ago'
    }
  ];

  function render(targetId) {
    var container = document.getElementById(targetId);
    if (!container) return;

    container.innerHTML = items.map(function (item) {
      return '<li class="activity-item">'
        + '<div class="activity-top">'
        + '<span class="activity-badge">' + item.category + '</span>'
        + '<span class="activity-time">' + item.age + '</span>'
        + '</div>'
        + '<p class="activity-title">' + item.title + '</p>'
        + '<p class="activity-detail">' + item.detail + '</p>'
        + '</li>';
    }).join('');
  }

  global.ActivityFeed = {
    render: render
  };
})(window);

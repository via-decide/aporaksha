(function (global) {
  'use strict';

  function render(module) {
    return '<article class="module ecosystem-card">'
      + '<div class="module-icon" aria-hidden="true">' + module.icon + '</div>'
      + '<h3>' + module.name + '</h3>'
      + '<p>' + module.description + '</p>'
      + '<a class="module-open" href="' + module.href + '" target="_blank" rel="noopener noreferrer">Open</a>'
      + '</article>';
  }

  global.EcosystemCard = {
    render: render
  };
})(window);

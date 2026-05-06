const routes = { '/': 'gateway', '/login': 'login', '/passport': 'passport' };

function navigate(path) {
  window.history.pushState({}, '', path);
  renderRoute(path);
}

function renderRoute(path) {
  const view = routes[path] || 'gateway';
  document.querySelectorAll('[data-view]').forEach((el) => {
    el.style.display = el.dataset.view === view ? '' : 'none';
  });
}

window.addEventListener('popstate', () => renderRoute(window.location.pathname));
window.navigate = navigate;
document.addEventListener('DOMContentLoaded', () => renderRoute(window.location.pathname));

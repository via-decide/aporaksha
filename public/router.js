import { isAuth, loadAuth } from './state.js';

const routes = {
  '/': { view: 'gateway' },
  '/login': { view: 'login' },
  '/passport': { view: 'passport', protected: true },
};

function navigate(path) {
  window.history.pushState({}, '', path);
  render(path);
}

function render(path) {
  loadAuth();

  const route = routes[path] || routes['/'];

  if (route.protected && !isAuth()) {
    return navigate('/login');
  }

  document.querySelectorAll('[data-view]').forEach((el) => {
    el.classList.remove('active', 'fade-in');
  });

  const el = document.querySelector(`[data-view="${route.view}"]`);

  if (el) {
    el.classList.add('active');
    setTimeout(() => el.classList.add('fade-in'), 10);
  }
}

window.navigate = navigate;
window.addEventListener('popstate', () => render(window.location.pathname));
document.addEventListener('DOMContentLoaded', () => render(window.location.pathname));

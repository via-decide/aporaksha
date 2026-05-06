import { logout, loadAuth, isAuth } from '../state.js';

export function initPassport() {
  const btn = document.getElementById('logout-btn');
  if (btn) btn.onclick = () => { logout(); window.navigate('/login'); };

  const dash = document.getElementById('dashboard');
  if (dash) {
    loadAuth();
    dash.textContent = isAuth() ? 'Secure dashboard loaded' : 'Unauthorized';
  }
}

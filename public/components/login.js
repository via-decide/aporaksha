import { login } from '../state.js';

export function initLogin() {
  const btn = document.getElementById('login-btn');

  if (btn) {
    btn.onclick = () => {
      login();
      window.navigate('/passport');
    };
  }
}

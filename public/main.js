import './router.js';
import { initLogin } from './components/login.js';
import { initPassport } from './components/passport.js';

document.addEventListener('DOMContentLoaded', () => {
  initLogin();
  initPassport();
});

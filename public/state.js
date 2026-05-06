let state = { isAuthenticated: false, accessExp: 0, refreshExp: 0 };

export function login() {
  const now = Date.now();
  state = { isAuthenticated: true, accessExp: now + 15 * 60 * 1000, refreshExp: now + 7 * 24 * 60 * 60 * 1000 };
  localStorage.setItem('auth', JSON.stringify(state));
}

export function logout() { state = { isAuthenticated: false, accessExp: 0, refreshExp: 0 }; localStorage.removeItem('auth'); }

export function loadAuth() {
  const stored = JSON.parse(localStorage.getItem('auth') || '{}');
  const now = Date.now();
  if (stored.refreshExp > now && stored.accessExp <= now) stored.accessExp = now + 15 * 60 * 1000;
  state = { isAuthenticated: !!stored.isAuthenticated && stored.refreshExp > now && stored.accessExp > now, accessExp: stored.accessExp || 0, refreshExp: stored.refreshExp || 0 };
  localStorage.setItem('auth', JSON.stringify(state));
}

export function isAuth() { return state.isAuthenticated; }

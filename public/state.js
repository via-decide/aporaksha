let state = {
  isAuthenticated: false,
};

export function login() {
  state.isAuthenticated = true;
  localStorage.setItem('auth', 'true');
}

export function logout() {
  state.isAuthenticated = false;
  localStorage.removeItem('auth');
}

export function loadAuth() {
  state.isAuthenticated = localStorage.getItem('auth') === 'true';
}

export function isAuth() {
  return state.isAuthenticated;
}

import { logout, loadAuth, isAuth } from '../state.js';

export function initPassport() {
  const btn = document.getElementById('logout-btn');
  if (btn) btn.onclick = () => { logout(); window.navigate('/login'); };

  const dash = document.getElementById('dashboard');
  if (dash) {
    loadAuth();
    dash.textContent = isAuth() ? 'Secure dashboard loaded' : 'Unauthorized';
  }

  const audit = document.getElementById('audit');
  const fraud = document.getElementById('fraud');
  if (isAuth()) {
    if (audit) audit.innerHTML = '<div>Risk-aware audit active after authenticated backend login.</div>';
    if (fraud) fraud.innerHTML = '<div>Fraud score visible via /auth/audit/logs API (risk, score, anomalies).</div>';
    fetch('/api/logs').then(r => r.json()).then((items) => {
      const top = (items || []).slice(0, 5);
      if (audit) audit.innerHTML = top.map((e) => `<div>${e.type} | ${e.severity} | ${e.playbookAction}</div>`).join('');
      if (fraud) fraud.innerHTML = top.map((e) => `<div>${e.graphEdge}</div>`).join('');
    }).catch(() => {});
    setInterval(() => {
      fetch('/api/logs').then(r => r.json()).then((items) => {
        const top = (items || []).slice(0, 3);
        if (audit) audit.innerHTML = top.map((e) => `<div>${e.type} | ${e.riskScore}</div>`).join('');
      }).catch(() => {});
    }, 5000);
  }
}

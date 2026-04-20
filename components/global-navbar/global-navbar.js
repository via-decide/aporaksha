(function (global) {
  'use strict';

  var NAV_ITEMS = [
    { label: 'Dashboard', href: 'dashboard', key: 'dashboard' },
    { label: 'Workspace', href: 'https://daxini.xyz', key: 'daxini_xyz' },
    { label: 'Build', href: 'https://logichub.app', key: 'logichub_app' },
    { label: 'Marketplace', href: 'https://daxini.space', key: 'daxini_space' },
    { label: 'Security', href: 'https://hanuman.solutions', key: 'hanuman_solutions' },
    { label: 'Passport', href: 'passport', key: 'passport' }
  ];

  var SYSTEM_BADGES = {
    dashboard: 'Dashboard \u2192 aporaksha',
    workspace: 'Workspace \u2192 daxini.xyz',
    build: 'Builder \u2192 logichub.app',
    marketplace: 'Marketplace \u2192 daxini.space',
    security: 'Security \u2192 hanuman.solutions',
    passport: 'Passport \u2192 aporaksha/passport'
  };

  var SWITCH_OPTIONS = [
    { label: 'Workspace', key: 'daxini_xyz', href: 'https://daxini.xyz' },
    { label: 'Build', key: 'logichub_app', href: 'https://logichub.app' },
    { label: 'Marketplace', key: 'daxini_space', href: 'https://daxini.space' },
    { label: 'Security', key: 'hanuman_solutions', href: 'https://hanuman.solutions' }
  ];

  function resolveCurrentSystem() {
    var attr = document.body && document.body.getAttribute('data-system');
    if (attr) return attr;

    var path = global.location.pathname;
    if (path.indexOf('/passport') !== -1) return 'passport';
    if (path.indexOf('/dashboard') !== -1) return 'dashboard';
    return 'workspace';
  }

  function ensureStyles() {
    if (document.getElementById('global-navbar-styles')) return;

    var style = document.createElement('style');
    style.id = 'global-navbar-styles';
    style.textContent =
      '.global-navbar{max-width:1080px;margin:.75rem auto 0;padding:.75rem 1.25rem;display:grid;gap:.75rem;position:sticky;top:0;z-index:20;background:rgba(11,12,15,.92);border:1px solid var(--border);border-radius:12px;backdrop-filter:blur(8px)}' +
      '.global-navbar__row{display:flex;flex-wrap:wrap;align-items:center;gap:.55rem}' +
      '.global-navbar__links{display:flex;flex-wrap:wrap;gap:.55rem}' +
      '.global-navbar__links a{text-decoration:none;color:var(--text);border:1px solid var(--border);border-radius:999px;padding:.3rem .7rem;font-size:.9rem}' +
      '.global-navbar__links a:hover{border-color:var(--gold)}' +
      '.global-navbar__badge{margin-left:auto;border:1px solid var(--border);border-radius:999px;padding:.28rem .7rem;font-size:.8rem;color:var(--gold);font-family:"JetBrains Mono",monospace}' +
      '.global-navbar__switch{display:flex;align-items:center;gap:.5rem;color:var(--muted);font-size:.88rem}' +
      '.global-navbar__switch select{background:#0f1117;color:var(--text);border:1px solid var(--border);border-radius:8px;padding:.35rem .5rem}';

    document.head.appendChild(style);
  }


  function getInternalHref(name) {
    var path = global.location.pathname;
    var inNestedPage = path.indexOf('/dashboard/') !== -1 || path.indexOf('/passport/') !== -1 || path.indexOf('/ecosystem/') !== -1;
    var prefix = inNestedPage ? '../' : './';

    if (name === 'dashboard') return prefix + 'dashboard/';
    if (name === 'passport') return prefix + 'passport/';
    return '#';
  }

  function createNavLink(item) {
    var link = document.createElement('a');
    link.textContent = item.label;
    link.href = item.href.indexOf('http') === 0 ? item.href : getInternalHref(item.href);

    if (item.href.indexOf('http') === 0) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }

    return link;
  }

  function routeTo(option) {
    if (global.EcosystemRouter && typeof global.EcosystemRouter.routeTo === 'function') {
      global.EcosystemRouter.routeTo(option.key);
      return;
    }

    global.location.href = option.href;
  }

  function render(rootId) {
    var root = document.getElementById(rootId || 'global-navbar-root');
    if (!root) return;

    ensureStyles();

    var currentSystem = resolveCurrentSystem();
    var nav = document.createElement('nav');
    nav.className = 'global-navbar';
    nav.setAttribute('aria-label', 'Global ecosystem navigation');

    var row = document.createElement('div');
    row.className = 'global-navbar__row';

    var links = document.createElement('div');
    links.className = 'global-navbar__links';
    NAV_ITEMS.forEach(function (item) {
      links.appendChild(createNavLink(item));
    });

    var badge = document.createElement('span');
    badge.className = 'global-navbar__badge';
    badge.textContent = SYSTEM_BADGES[currentSystem] || SYSTEM_BADGES.dashboard;

    row.appendChild(links);
    row.appendChild(badge);

    var switchWrap = document.createElement('label');
    switchWrap.className = 'global-navbar__switch';
    switchWrap.textContent = 'Switch system';

    var select = document.createElement('select');
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select...';
    select.appendChild(placeholder);

    SWITCH_OPTIONS.forEach(function (option) {
      var optionEl = document.createElement('option');
      optionEl.value = option.key;
      optionEl.textContent = option.label;
      select.appendChild(optionEl);
    });

    select.addEventListener('change', function () {
      var selected = SWITCH_OPTIONS.find(function (item) {
        return item.key === select.value;
      });
      if (!selected) return;
      routeTo(selected);
    });

    switchWrap.appendChild(select);

    nav.appendChild(row);
    nav.appendChild(switchWrap);

    root.innerHTML = '';
    root.appendChild(nav);
  }

  global.GlobalNavbar = {
    render: render
  };

  document.addEventListener('DOMContentLoaded', function () {
    render('global-navbar-root');
  });
})(window);

(function (global) {
  'use strict';

  var routerModule = null;
  var CORE_BASE_URL = 'https://cdn.jsdelivr.net/gh/via-decide/aporaksha-core@main';

  async function importCoreRouter() {
    if (routerModule) return routerModule;

    try {
      var ecosystemRouterModule = await import(CORE_BASE_URL + '/ecosystem-router/index.js');
      routerModule = ecosystemRouterModule.default || ecosystemRouterModule;
    } catch (error) {
      console.warn('Unable to import aporaksha-core ecosystem router module. Using local route map.', error);
      routerModule = null;
    }

    return routerModule;
  }

  function getDefaultRouteMap() {
    return {
      daxini_xyz: 'https://daxini.xyz',
      daxini_space: 'https://daxini.space',
      logichub_app: 'https://logichub.app',
      hanuman_solutions: 'https://hanuman.solutions',
      viadecide_com: 'https://viadecide.com',
      daxini_workspace: 'https://daxini.xyz/workspace'
    };
  }

  async function resolveRoute(systemKey) {
    var module = await importCoreRouter();

    if (module && typeof module.resolveRoute === 'function') {
      return module.resolveRoute(systemKey);
    }

    var routeMap = getDefaultRouteMap();
    return routeMap[systemKey] || null;
  }

  global.CoreRouterAdapter = {
    importCoreRouter: importCoreRouter,
    getDefaultRouteMap: getDefaultRouteMap,
    resolveRoute: resolveRoute
  };
})(window);

(function (global) {
  'use strict';

  function buildRoutedUrl(baseUrl, session) {
    if (!baseUrl) return null;

    try {
      var url = new URL(baseUrl);
      if (session && session.passport_id) {
        url.searchParams.set('passport_id', session.passport_id);
      }
      if (session && session.token) {
        url.searchParams.set('session_token', session.token);
      }
      return url.toString();
    } catch (error) {
      console.warn('Unable to build routed URL.', error);
      return baseUrl;
    }
  }

  async function routeTo(systemKey, options) {
    var routeOptions = options || {};
    var route = null;

    if (global.CoreRouterAdapter && typeof global.CoreRouterAdapter.resolveRoute === 'function') {
      route = await global.CoreRouterAdapter.resolveRoute(systemKey);
    }

    if (!route) return null;

    var session = global.ZayvoraPassportAuth && global.ZayvoraPassportAuth.getSession
      ? global.ZayvoraPassportAuth.getSession()
      : null;
    var routedUrl = buildRoutedUrl(route, session);

    if (routeOptions.openInNewTab) {
      global.open(routedUrl, '_blank', 'noopener,noreferrer');
    } else {
      global.location.href = routedUrl;
    }

    return routedUrl;
  }

  global.EcosystemRouter = {
    buildRoutedUrl: buildRoutedUrl,
    routeTo: routeTo
  };
})(window);

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EventAppRouter = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const DEFAULT_ACTIVITY_ID = 'midyear2026';
  const AREA_VIEWS = Object.freeze({
    accounting: Object.freeze(['overview', 'budget', 'expenses', 'prizes', 'vendors', 'payment_requests', 'reimbursement']),
    planning: Object.freeze(['history', 'forecast', 'rundown'])
  });

  function normalizeActivityId(value) {
    return String(value || '').trim() || DEFAULT_ACTIVITY_ID;
  }

  function normalizeArea(value) {
    const area = String(value || '').trim();
    return Object.prototype.hasOwnProperty.call(AREA_VIEWS, area) ? area : '';
  }

  function normalizeView(area, value) {
    if (!area) return '';
    const requested = String(value || '').trim();
    return AREA_VIEWS[area].includes(requested) ? requested : AREA_VIEWS[area][0];
  }

  function normalizeRoute(route) {
    const area = normalizeArea(route && route.area);
    return {
      activityId: normalizeActivityId(route && route.activityId),
      area,
      view: normalizeView(area, route && route.view)
    };
  }

  function parseRoute(search) {
    const params = new URLSearchParams(search || '');
    return normalizeRoute({
      activityId: params.get('activity_id'),
      area: params.get('area'),
      view: params.get('view')
    });
  }

  function buildQuery(route) {
    const normalized = normalizeRoute(route);
    const params = new URLSearchParams({ activity_id: normalized.activityId });
    if (normalized.area) {
      params.set('area', normalized.area);
      params.set('view', normalized.view);
    }
    return '?' + params.toString();
  }

  function createRouter(win, onChange) {
    if (!win || !win.location || !win.history) throw new TypeError('router 需要 window');
    let state = parseRoute(win.location.search);
    const notify = () => { if (typeof onChange === 'function') onChange({ ...state }); };

    function write(next, replace) {
      state = normalizeRoute({ ...state, ...(next || {}) });
      const url = win.location.pathname + buildQuery(state);
      win.history[replace ? 'replaceState' : 'pushState'](null, '', url);
      notify();
      return { ...state };
    }

    function handlePopState() {
      state = parseRoute(win.location.search);
      notify();
    }

    win.addEventListener('popstate', handlePopState);
    return {
      current: () => ({ ...state }),
      navigate: (next) => write(next, false),
      replace: (next) => write(next, true),
      start: notify,
      destroy: () => win.removeEventListener('popstate', handlePopState)
    };
  }

  return {
    DEFAULT_ACTIVITY_ID,
    AREA_VIEWS,
    normalizeRoute,
    parseRoute,
    buildQuery,
    createRouter
  };
});

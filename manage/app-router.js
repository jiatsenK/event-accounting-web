(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EventAppRouter = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const DEFAULT_ACTIVITY_ID = 'midyear2026';
  // #155：活動工作台。活動頁六個分頁（總覽、預算與廠商、規劃、款項申請、支出、核銷），
  // 「規劃」分頁底下再分流程表／獎項／飲品三個子頁；歷史分析獨立一區。
  const AREA_VIEWS = Object.freeze({
    activity: Object.freeze(['overview', 'budget', 'rundown', 'prizes', 'drinks', 'payment_requests', 'expenses', 'close']),
    analysis: Object.freeze(['dashboard'])
  });
  // 舊網址（改版前的 area=accounting／planning）照樣能開，導到新位置。
  const LEGACY_ROUTES = Object.freeze({
    accounting: Object.freeze({ reimbursement: 'close', vendors: 'budget' }),
    planning: Object.freeze({ history: 'drinks', forecast: 'drinks', rundown: 'rundown', dashboard: 'analysis:dashboard' })
  });
  const VIEW_ALIASES = Object.freeze({ planning: 'rundown', reimbursement: 'close' });

  function normalizeActivityId(value) {
    return String(value || '').trim() || DEFAULT_ACTIVITY_ID;
  }

  function resolveLegacy(areaValue, viewValue) {
    const area = String(areaValue || '').trim();
    const view = String(viewValue || '').trim();
    if (!Object.prototype.hasOwnProperty.call(LEGACY_ROUTES, area)) return { area, view };
    const mapped = LEGACY_ROUTES[area][view] || (area === 'planning' ? 'drinks' : view);
    const parts = mapped.split(':');
    return parts.length === 2 ? { area: parts[0], view: parts[1] } : { area: 'activity', view: mapped };
  }

  function normalizeArea(value) {
    const area = String(value || '').trim();
    return Object.prototype.hasOwnProperty.call(AREA_VIEWS, area) ? area : '';
  }

  function normalizeView(area, value) {
    if (!area) return '';
    const raw = String(value || '').trim();
    const requested = VIEW_ALIASES[raw] || raw;
    return AREA_VIEWS[area].includes(requested) ? requested : AREA_VIEWS[area][0];
  }

  function normalizeRoute(route) {
    const legacy = resolveLegacy(route && route.area, route && route.view);
    const area = normalizeArea(legacy.area);
    return {
      activityId: normalizeActivityId(route && route.activityId),
      area,
      view: normalizeView(area, legacy.view)
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
    LEGACY_ROUTES,
    normalizeRoute,
    parseRoute,
    buildQuery,
    createRouter
  };
});

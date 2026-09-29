(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EventAppViews = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // #155：活動頁六個分頁；「規劃」分頁含三個子頁（流程表、獎項、飲品），
  // 其餘分頁一頁對一個 view。歷史分析是跨活動的獨立一區。
  function tab(id, label, views) {
    return Object.freeze({
      id,
      label,
      views: Object.freeze((views || [{ id, label }]).map(item => Object.freeze(item)))
    });
  }

  const AREAS = Object.freeze({
    activity: Object.freeze({
      label: '活動',
      tabs: Object.freeze([
        tab('overview', '總覽'),
        tab('budget', '預算與廠商'),
        tab('planning', '規劃', [{ id: 'rundown', label: '流程表' }, { id: 'prizes', label: '獎項' }, { id: 'drinks', label: '飲品' }]),
        tab('payment_requests', '款項申請'),
        tab('expenses', '支出'),
        tab('close', '核銷')
      ])
    }),
    analysis: Object.freeze({
      label: '歷史分析',
      tabs: Object.freeze([tab('dashboard', '歷史分析')])
    })
  });

  function areaViews(areaId) {
    const area = AREAS[areaId];
    return area ? area.tabs.reduce((list, item) => list.concat(item.views), []) : [];
  }

  function tabForView(areaId, viewId) {
    const area = AREAS[areaId];
    if (!area) return null;
    return area.tabs.find(item => item.views.some(view => view.id === viewId)) || area.tabs[0];
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function viewKey(area, view) {
    return area + ':' + view;
  }

  function stubView(title, message) {
    return {
      mount(container) {
        container.innerHTML = '<div class="view-placeholder"><h2>' + escapeHtml(title) + '</h2><p>' + escapeHtml(message) + '</p></div>';
      }
    };
  }

  const DEFAULT_VIEW_MODULES = Object.freeze({
    'activity:overview': stubView('總覽', '此 view 將沿用既有帳務總覽。'),
    'activity:budget': stubView('預算與廠商', '此 view 將沿用既有活動預算。'),
    'activity:rundown': stubView('流程表', '此 view 將接上流程表資料層。'),
    'activity:prizes': stubView('獎項', '此 view 將接上獎項資料。'),
    'activity:drinks': stubView('飲品', '此 view 將接上飲品規劃試算與歷史紀錄。'),
    'activity:payment_requests': stubView('款項申請', '此 view 將列出款項申請單。'),
    'activity:expenses': stubView('支出', '此 view 將沿用既有支出清單。'),
    'activity:close': stubView('核銷', '此 view 將沿用既有核銷預覽與 Excel 匯出。'),
    'analysis:dashboard': stubView('歷史分析', '此 view 將接上跨活動歷史分析資料層。')
  });

  function mountFailure(container, error) {
    const message = error && error.message ? error.message : '讀取失敗';
    container.innerHTML = '<div class="view-error" role="alert"><h2>這個頁面暫時無法載入</h2>' +
      '<p>' + escapeHtml(message) + '</p><p>你仍可切換其他頁面，或回活動管理。</p></div>';
  }

  async function mountView(module, container, context) {
    try {
      if (!module || typeof module.mount !== 'function') throw new Error('view 尚未註冊');
      await module.mount(container, context);
      return true;
    } catch (error) {
      mountFailure(container, error);
      return false;
    }
  }

  function createViewHost(rootElement, options) {
    if (!rootElement) throw new TypeError('view host 需要 root element');
    const modules = { ...DEFAULT_VIEW_MODULES, ...((options && options.modules) || {}) };
    const navigate = options && options.navigate;
    const mounts = new Map();
    let renderVersion = 0;

    rootElement.innerHTML = '<header class="section-header">' +
      '<button class="back-button" type="button" data-back>← 回活動列表</button>' +
      '<div><p class="eyebrow" data-area-label></p><h1 data-activity-name></h1><p class="activity-state" data-activity-state hidden></p></div>' +
      '<div class="section-header-actions" data-header-actions></div>' +
      '</header><nav class="section-tabs" data-section-tabs></nav><nav class="section-subtabs" data-section-subtabs hidden></nav><div data-view-stack></div>';
    const headerActions = rootElement.querySelector('[data-header-actions]');
    rootElement.addEventListener('click', event => {
      if (event.target.closest('[data-back]')) {
        if (typeof navigate === 'function') navigate({ area: '', view: '' });
        return;
      }
      const button = event.target.closest('[data-view]');
      if (button && typeof navigate === 'function') navigate({ view: button.dataset.view });
    });

    async function render(route, activity) {
      const area = AREAS[route.area];
      if (!area) throw new RangeError('未知的活動區塊');
      const currentTab = tabForView(route.area, route.view);
      const currentView = currentTab.views.find(item => item.id === route.view) || currentTab.views[0];
      rootElement.querySelector('[data-area-label]').textContent = area.label;
      rootElement.querySelector('[data-activity-name]').textContent = route.area === 'analysis'
        ? '各場活動比較' : (activity && activity.name || route.activityId);
      const stateLabel = rootElement.querySelector('[data-activity-state]');
      const closed = route.area === 'activity' && String(activity && activity.status || '').trim() === '已結案';
      stateLabel.hidden = !closed;
      stateLabel.textContent = closed ? '已結案：往年紀錄，帳務已鎖定，只能查看' : '';
      const tabs = rootElement.querySelector('[data-section-tabs]');
      tabs.setAttribute('aria-label', area.label + '分頁');
      tabs.hidden = area.tabs.length <= 1;
      tabs.innerHTML = area.tabs.map(item => '<button type="button" data-view="' + item.views[0].id + '" aria-pressed="' + String(item.id === currentTab.id) + '"' +
        (item.id === currentTab.id ? ' class="active"' : '') + '>' + escapeHtml(item.label) + '</button>').join('');
      const subtabs = rootElement.querySelector('[data-section-subtabs]');
      subtabs.hidden = currentTab.views.length <= 1;
      subtabs.setAttribute('aria-label', currentTab.label + '子頁');
      subtabs.innerHTML = currentTab.views.length <= 1 ? '' : currentTab.views.map(item => '<button type="button" data-view="' + item.id + '" aria-pressed="' + String(item.id === currentView.id) + '"' +
        (item.id === currentView.id ? ' class="active"' : '') + '>' + escapeHtml(item.label) + '</button>').join('');

      const version = ++renderVersion;
      const module = modules[viewKey(route.area, currentView.id)];
      const cacheKey = module && module.cacheKey || viewKey(route.area, currentView.id);
      if (!mounts.has(cacheKey)) {
        const element = rootElement.ownerDocument.createElement('section');
        element.className = 'view-mount';
        element.dataset.cacheKey = cacheKey;
        element.setAttribute('aria-live', 'polite');
        rootElement.querySelector('[data-view-stack]').appendChild(element);
        mounts.set(cacheKey, element);
      }
      mounts.forEach((element, key) => { element.hidden = key !== cacheKey; });
      const mount = mounts.get(cacheKey);
      if (!mount.childNodes.length) mount.innerHTML = '<div class="view-loading">正在載入…</div>';
      headerActions.innerHTML = '';
      const result = await mountView(module, mount, {
        activityId: route.activityId,
        activity,
        headerActions,
        area: route.area,
        view: currentView.id,
        navigate
      });
      return version === renderVersion ? result : false;
    }

    return { render };
  }

  return {
    AREAS,
    areaViews,
    tabForView,
    DEFAULT_VIEW_MODULES,
    viewKey,
    mountView,
    createViewHost
  };
});

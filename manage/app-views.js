(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EventAppViews = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const AREAS = Object.freeze({
    accounting: Object.freeze({
      label: '活動帳務',
      views: Object.freeze([
        Object.freeze({ id: 'overview', label: '總覽' }),
        Object.freeze({ id: 'budget', label: '活動預算' }),
        Object.freeze({ id: 'expenses', label: '支出明細' }),
        Object.freeze({ id: 'prizes', label: '獎項' }),
        Object.freeze({ id: 'vendors', label: '廠商主檔' }),
        Object.freeze({ id: 'payment_requests', label: '款項申請' }),
        Object.freeze({ id: 'reimbursement', label: '核銷整理' })
      ])
    }),
    planning: Object.freeze({
      label: '活動規劃',
      views: Object.freeze([
        Object.freeze({ id: 'history', label: '歷史紀錄' }),
        Object.freeze({ id: 'forecast', label: '規劃試算' }),
        Object.freeze({ id: 'rundown', label: '流程表' })
      ])
    })
  });

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
    'accounting:overview': Object.freeze({
      mount(container, context) {
        container.innerHTML = '<div class="view-placeholder view-placeholder-ready">' +
          '<p class="view-kicker">掛載骨架已就緒</p>' +
          '<h2>帳務總覽</h2>' +
          '<p>下一步會把既有帳務 DOM 與 <code>assets/app-core.js</code> 接到這個掛載點，不改寫帳務計算與匯出邏輯。</p>' +
          '<p class="view-context">activity_id：<strong>' + escapeHtml(context.activityId) + '</strong></p>' +
          '</div>';
      }
    }),
    'accounting:expenses': stubView('支出明細', '此 view 將沿用既有支出清單、篩選與編輯邏輯。'),
    'accounting:budget': stubView('活動預算', '此 view 將建立與核准活動預算。'),
    'accounting:vendors': stubView('廠商主檔', '此 view 將讀取正式廠商主檔。'),
    'accounting:payment_requests': stubView('款項申請', '此 view 將列出款項申請單、依狀態篩選並可產出 xlsx。'),
    'accounting:reimbursement': stubView('核銷整理', '此 view 將沿用既有核銷預覽與 Excel 匯出邏輯。'),
    'planning:history': stubView('歷史紀錄', '此 view 將接上規劃資料層的歷史資料讀取。'),
    'planning:forecast': stubView('規劃試算', '此 view 將接上規劃資料層的試算與建議量計算。'),
    'planning:rundown': stubView('流程表', '此 view 將接上流程表資料層（rundown 讀寫與四種列印版本）。')
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
      '<button class="back-button" type="button" data-back>← 回活動管理</button>' +
      '<div><p class="eyebrow" data-area-label></p><h1 data-activity-name></h1></div>' +
      '</header><nav class="section-tabs" data-section-tabs></nav><div data-view-stack></div>';
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
      const currentView = area.views.find(item => item.id === route.view) || area.views[0];
      rootElement.querySelector('[data-area-label]').textContent = area.label;
      rootElement.querySelector('[data-activity-name]').textContent = activity && activity.name || route.activityId;
      const tabs = rootElement.querySelector('[data-section-tabs]');
      tabs.setAttribute('aria-label', area.label + '功能');
      tabs.innerHTML = area.views.map(item => '<button type="button" data-view="' + item.id + '" aria-pressed="' + String(item.id === currentView.id) + '"' +
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
      const result = await mountView(module, mount, {
        activityId: route.activityId,
        activity,
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
    DEFAULT_VIEW_MODULES,
    viewKey,
    mountView,
    createViewHost
  };
});

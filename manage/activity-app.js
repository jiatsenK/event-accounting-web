(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EventActivityApp = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  const API_TIMEOUT_MS = 12000;

  function canonicalActivityName(activity) {
    const id = String(activity && activity.activity_id || '').trim();
    const raw = String(activity && activity.name || '').trim().replace(/\s+/g, ' ');
    const nameMatch = raw.match(/^(\d{4})\s*(?:年度)?\s*(.*)$/);
    const idMatch = id.match(/(\d{4})$/);
    const year = nameMatch && nameMatch[1] || idMatch && idMatch[1] || '';
    let title = String(nameMatch ? nameMatch[2] : raw).trim();
    if (!title && /^midyear\d{4}$/.test(id)) title = '年中聚餐';
    if (!title && /^yearend\d{4}$/.test(id)) title = '忘年會';
    return year && title ? year + '年度 ' + title : (raw || id || '未命名活動');
  }

  function isHistoricalActivity(activity) {
    return String(activity && activity.status || '').trim() === '已結案';
  }

  function fallbackActivity(activityId) {
    const id = String(activityId || '').trim() || 'midyear2026';
    return { activity_id: id, name: canonicalActivityName({ activity_id: id }) };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function init(doc, win, dependencies) {
    if (!doc || !win) return;
    const routerApi = dependencies && dependencies.router || win.EventAppRouter;
    const viewsApi = dependencies && dependencies.views || win.EventAppViews;
    const apiConfig = dependencies && dependencies.apiConfig || win.EventApiConfig;
    if (!routerApi || !viewsApi) throw new Error('app modules 尚未載入');
    if (!apiConfig) throw new Error('API 環境設定尚未載入');
    const apiUrl = apiConfig.resolveApiUrl(win);
    const tokenStorageKey = apiConfig.tokenStorageKey(win);
    apiConfig.mountEnvironmentBanner(doc, win);

    const configPanel = doc.querySelector('#platformConfigPanel');
    const tokenInput = doc.querySelector('#platformTokenInput');
    const saveConfig = doc.querySelector('#platformSaveConfig');
    const entryView = doc.querySelector('#entryView');
    const sectionView = doc.querySelector('#sectionView');
    const status = doc.querySelector('#platformStatus');
    let activities = [];
    const STATUS_FILTERS = ['籌備中', '已結案'];
    let statusFilter = '籌備中';

    const router = routerApi.createRouter(win, renderRoute);
    const viewHost = viewsApi.createViewHost(sectionView, {
      navigate: next => router.navigate(next),
      modules: {
        'activity:overview': win.AccountingViews,
        'activity:budget': win.AccountingViews,
        'activity:payment_requests': win.AccountingViews,
        'activity:expenses': win.AccountingViews,
        'activity:close': win.AccountingViews,
        'activity:rundown': win.RundownViews && win.RundownViews.rundown,
        'activity:prizes': win.PrizeViews,
        'activity:drinks': win.PlanningViews && win.PlanningViews.drinks,
        'analysis:dashboard': win.DashboardViews && win.DashboardViews.dashboard
      }
    });

    function token() {
      return win.localStorage.getItem(tokenStorageKey) || '';
    }

    function setStatus(message, error) {
      status.textContent = message || '';
      status.classList.toggle('error', Boolean(error));
    }

    function selectedActivity(activityId) {
      return activities.find(item => String(item.activity_id || '') === activityId) || fallbackActivity(activityId);
    }

    // #155：入口改成活動列表（ERP 的單據列表），點一場活動進活動頁六個分頁。
    // 已結案的活動留在列表當往年紀錄，點進去看當年完整的帳（帳務已鎖定、唯讀）。
    function renderEntry(route) {
      const visibleActivities = activities.filter(item => !statusFilter || String(item.status || '').trim() === statusFilter);
      const filterButtons = ['', ...STATUS_FILTERS].map(value => {
        const label = value || '全部';
        const active = statusFilter === value;
        const count = activities.filter(item => !value || String(item.status || '').trim() === value).length;
        return '<button type="button" class="status-filter" data-status-filter="' + escapeHtml(value) + '"' +
          (active ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + escapeHtml(label) + ' <span class="count">' + count + '</span></button>';
      }).join('');
      const rows = visibleActivities.map(item => {
        const id = String(item.activity_id || '');
        const historical = isHistoricalActivity(item);
        const meta = [item.date ? '活動日期 ' + item.date : '', item.activity_type || ''].filter(Boolean).join(' · ');
        return '<button type="button" class="activity-row' + (id === route.activityId ? ' current' : '') + '" data-open-activity="' + escapeHtml(id) + '">' +
          '<span class="activity-row-name">' + escapeHtml(canonicalActivityName(item)) + '</span>' +
          '<span class="activity-row-meta">' + escapeHtml(meta || '—') + '</span>' +
          '<span class="activity-row-status ' + (historical ? 'closed' : 'open') + '">' + escapeHtml(item.status || '未設定') + '</span>' +
          '<b aria-hidden="true">→</b></button>';
      }).join('');
      entryView.innerHTML = '<header class="entry-header"><div><p class="eyebrow">活動管理</p>' +
        '<h1>活動</h1><p class="muted">點一場活動，預算、款項申請、支出和核銷都在同一頁。已結案的活動就是往年紀錄。</p></div>' +
        '<div class="activity-picker"><div class="status-filters" role="group" aria-label="依狀態篩選活動">' + filterButtons + '</div>' +
        '<button type="button" class="secondary" data-open-analysis>歷史分析</button></div></header>' +
        '<div class="activity-list" aria-label="活動列表">' + (rows || '<div class="empty">沒有符合條件的活動</div>') + '</div>';
      Array.from(entryView.querySelectorAll('[data-status-filter]')).forEach(button => {
        button.addEventListener('click', () => {
          statusFilter = button.dataset.statusFilter;
          renderEntry(route);
        });
      });
      Array.from(entryView.querySelectorAll('[data-open-activity]')).forEach(button => {
        button.addEventListener('click', () => router.navigate({ activityId: button.dataset.openActivity, area: 'activity', view: 'overview' }));
      });
      entryView.querySelector('[data-open-analysis]').addEventListener('click', () => router.navigate({ area: 'analysis', view: 'dashboard' }));
    }

    function renderRoute(route) {
      const atEntry = !route.area;
      configPanel.hidden = !atEntry || Boolean(token());
      entryView.hidden = !atEntry;
      sectionView.hidden = atEntry;
      if (atEntry) renderEntry(route);
      else viewHost.render(route, selectedActivity(route.activityId));
    }

    function apiRead(action) {
      return new Promise((resolve, reject) => {
        const accessToken = token();
        if (!accessToken) return reject(new Error('尚未輸入存取碼'));
        const callback = '__activityApp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        const script = doc.createElement('script');
        const params = new URLSearchParams({ action, token: accessToken, callback });
        let timer = null;
        const cleanup = () => {
          if (timer) win.clearTimeout(timer);
          delete win[callback];
          script.remove();
        };
        win[callback] = result => {
          cleanup();
          result && result.ok ? resolve(result.data) : reject(new Error(result && result.error || '讀取失敗'));
        };
        script.onerror = () => { cleanup(); reject(new Error('無法連線到活動資料')); };
        timer = win.setTimeout(() => { cleanup(); reject(new Error('活動資料連線逾時')); }, API_TIMEOUT_MS);
        script.src = apiUrl + '?' + params.toString();
        doc.body.appendChild(script);
      });
    }

    function useFallback(message) {
      const route = router.current();
      activities = [fallbackActivity(route.activityId)];
      renderRoute(route);
      setStatus(message, true);
    }

    async function loadActivities() {
      setStatus('正在讀取活動…');
      try {
        const data = await apiRead('activities');
        activities = Array.isArray(data && data.activities) ? data.activities : [];
        if (!activities.length) throw new Error('目前沒有可使用的活動');
        const route = router.current();
        if (!activities.some(item => String(item.activity_id || '') === route.activityId)) {
          router.replace({ activityId: String(activities[0].activity_id || '') });
        } else {
          renderRoute(route);
        }
        configPanel.hidden = true;
        setStatus('');
      } catch (error) {
        if (error && error.message === '無權限') {
          win.localStorage.removeItem(tokenStorageKey);
          configPanel.hidden = false;
          useFallback('存取碼不正確；入口仍可使用，請重新輸入。');
        } else {
          useFallback('活動清單暫時無法更新；目前活動仍可使用。');
        }
      }
    }

    saveConfig.addEventListener('click', () => {
      const value = tokenInput.value.trim();
      if (!value) return;
      win.localStorage.setItem(tokenStorageKey, value);
      tokenInput.value = '';
      configPanel.hidden = true;
      loadActivities();
    });
    tokenInput.addEventListener('keydown', event => { if (event.key === 'Enter') saveConfig.click(); });

    activities = [fallbackActivity(router.current().activityId)];
    configPanel.hidden = Boolean(token());
    router.start();
    if (token()) loadActivities();
    else setStatus('尚未設定存取碼；可先進入區塊，資料 view 會各自顯示設定或錯誤狀態。');
  }

  return { canonicalActivityName, fallbackActivity, isHistoricalActivity, init };
});

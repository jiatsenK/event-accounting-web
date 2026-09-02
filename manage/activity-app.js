(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EventActivityApp = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbyLKDauNZi4zQzztda_agrJF84ILNSL6mXBsTe6e7DUx7dIbNN3GKwSWkDURQjYxkf_aA/exec';
  const TOKEN_STORAGE_KEY = 'eventAccountingToken:' + DEFAULT_API_URL;
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
    if (!routerApi || !viewsApi) throw new Error('app modules 尚未載入');

    const configPanel = doc.querySelector('#platformConfigPanel');
    const tokenInput = doc.querySelector('#platformTokenInput');
    const saveConfig = doc.querySelector('#platformSaveConfig');
    const entryView = doc.querySelector('#entryView');
    const sectionView = doc.querySelector('#sectionView');
    const status = doc.querySelector('#platformStatus');
    let activities = [];

    const router = routerApi.createRouter(win, renderRoute);
    const viewHost = viewsApi.createViewHost(sectionView, {
      navigate: next => router.navigate(next),
      modules: {
        'accounting:overview': win.AccountingViews,
        'accounting:expenses': win.AccountingViews,
        'accounting:reimbursement': win.AccountingViews,
        'planning:history': win.PlanningViews && win.PlanningViews.history,
        'planning:forecast': win.PlanningViews && win.PlanningViews.forecast
      }
    });

    function token() {
      return win.sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
    }

    function setStatus(message, error) {
      status.textContent = message || '';
      status.classList.toggle('error', Boolean(error));
    }

    function selectedActivity(activityId) {
      return activities.find(item => String(item.activity_id || '') === activityId) || fallbackActivity(activityId);
    }

    function renderEntry(route) {
      const activity = selectedActivity(route.activityId);
      entryView.innerHTML = '<header class="entry-header"><div><p class="eyebrow">活動管理</p>' +
        '<h1>' + escapeHtml(canonicalActivityName(activity)) + '</h1><p class="muted">先確認活動，再選擇要處理的區塊。</p></div>' +
        '<label class="activity-picker"><span>切換活動</span><select id="platformActivitySelector" aria-label="切換活動">' +
        activities.map(item => '<option value="' + escapeHtml(item.activity_id) + '"' +
          (String(item.activity_id) === route.activityId ? ' selected' : '') + '>' + escapeHtml(canonicalActivityName(item)) + '</option>').join('') +
        '</select></label></header><div class="area-grid" aria-label="活動區塊">' +
        '<button type="button" class="area-card" data-area="accounting"><span>活動帳務</span><small>總覽、支出明細、核銷整理</small><b aria-hidden="true">→</b></button>' +
        '<button type="button" class="area-card" data-area="planning"><span>活動規劃</span><small>歷史紀錄、規劃試算</small><b aria-hidden="true">→</b></button></div>';
      const selector = entryView.querySelector('#platformActivitySelector');
      selector.disabled = activities.length <= 1;
      selector.addEventListener('change', event => router.replace({ activityId: event.target.value }));
      Array.from(entryView.querySelectorAll('[data-area]')).forEach(button => {
        button.addEventListener('click', () => router.navigate({ area: button.dataset.area, view: '' }));
      });
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
        script.src = DEFAULT_API_URL + '?' + params.toString();
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
          win.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
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
      win.sessionStorage.setItem(TOKEN_STORAGE_KEY, value);
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

  return { DEFAULT_API_URL, TOKEN_STORAGE_KEY, canonicalActivityName, fallbackActivity, init };
});

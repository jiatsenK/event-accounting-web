(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ActivityManager = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const DEFAULT_ACTIVITY_ID = 'midyear2026';
  const VALID_AREAS = new Set(['planning', 'accounting']);
  const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbyLKDauNZi4zQzztda_agrJF84ILNSL6mXBsTe6e7DUx7dIbNN3GKwSWkDURQjYxkf_aA/exec';
  const TOKEN_STORAGE_KEY = 'eventAccountingToken:' + DEFAULT_API_URL;

  function parseRoute(search) {
    const params = new URLSearchParams(search || '');
    const activityId = String(params.get('activity_id') || DEFAULT_ACTIVITY_ID).trim() || DEFAULT_ACTIVITY_ID;
    const requestedArea = String(params.get('area') || '').trim();
    return {
      activityId,
      area: VALID_AREAS.has(requestedArea) ? requestedArea : ''
    };
  }

  function buildAreaUrl(area, activityId) {
    if (!VALID_AREAS.has(area)) return '';
    const id = String(activityId || '').trim();
    if (!id) return '';
    const target = area === 'planning' ? '../planning-preview/' : '../';
    return target + '?activity_id=' + encodeURIComponent(id);
  }

  function buildShellQuery(activityId, area) {
    const params = new URLSearchParams();
    const id = String(activityId || '').trim();
    if (id) params.set('activity_id', id);
    if (VALID_AREAS.has(area)) params.set('area', area);
    const query = params.toString();
    return query ? '?' + query : '';
  }

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

  function init(doc, win) {
    if (!doc || !win) return;
    const route = parseRoute(win.location.search);
    const activitySelector = doc.querySelector('#activitySelector');
    const currentActivity = doc.querySelector('#currentActivity');
    const configPanel = doc.querySelector('#configPanel');
    const shellContent = doc.querySelector('#shellContent');
    const tokenInput = doc.querySelector('#tokenInput');
    const saveConfig = doc.querySelector('#saveConfig');
    const status = doc.querySelector('#status');
    const frame = doc.querySelector('#areaFrame');
    const frameWrap = doc.querySelector('#frameWrap');
    const emptyState = doc.querySelector('#areaEmpty');
    const areaButtons = Array.from(doc.querySelectorAll('[data-area]'));
    let activities = [];

    function setStatus(message, error) {
      status.textContent = message || '';
      status.classList.toggle('error', Boolean(error));
    }

    function token() {
      return win.sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
    }

    function showConfig(message) {
      configPanel.hidden = false;
      shellContent.hidden = true;
      if (message) configPanel.querySelector('.config-note').textContent = message;
    }

    function showShell() {
      configPanel.hidden = true;
      shellContent.hidden = false;
    }

    function apiRead(action, args) {
      return new Promise((resolve, reject) => {
        const accessToken = token();
        if (!accessToken) return reject(new Error('尚未輸入存取碼'));
        const callback = '__activityManager_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        const script = doc.createElement('script');
        const params = new URLSearchParams({ action, token: accessToken, callback, ...(args || {}) });
        const cleanup = () => {
          delete win[callback];
          script.remove();
        };
        win[callback] = result => {
          cleanup();
          result && result.ok ? resolve(result.data) : reject(new Error(result && result.error || '讀取失敗'));
        };
        script.onerror = () => {
          cleanup();
          reject(new Error('無法連線到活動資料'));
        };
        script.src = DEFAULT_API_URL + '?' + params.toString();
        doc.body.appendChild(script);
      });
    }

    function updateRoute() {
      win.history.replaceState(null, '', win.location.pathname + buildShellQuery(route.activityId, route.area));
    }

    function updateAreaView() {
      areaButtons.forEach(button => {
        const active = button.dataset.area === route.area;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      const target = buildAreaUrl(route.area, route.activityId);
      if (!target) {
        frame.hidden = true;
        frameWrap.hidden = true;
        frame.removeAttribute('src');
        emptyState.hidden = false;
        return;
      }
      emptyState.hidden = true;
      frameWrap.hidden = false;
      frame.hidden = false;
      if (frame.getAttribute('src') !== target) frame.setAttribute('src', target);
      frame.title = route.area === 'planning' ? '活動規劃' : '活動帳務';
    }

    function syncEmbeddedArea() {
      if (route.area !== 'accounting') return;
      try {
        const innerDoc = frame.contentDocument;
        const childSwitcher = innerDoc && innerDoc.querySelector('.activity-switcher');
        if (childSwitcher) childSwitcher.hidden = true;
      } catch (_) {}
    }

    function updateActivityLabel() {
      const selected = activities.find(item => String(item.activity_id || '') === route.activityId);
      currentActivity.textContent = selected ? canonicalActivityName(selected) : route.activityId;
    }

    function chooseActivity(nextActivityId) {
      route.activityId = String(nextActivityId || '').trim() || DEFAULT_ACTIVITY_ID;
      updateActivityLabel();
      updateRoute();
      updateAreaView();
    }

    function chooseArea(area) {
      if (!VALID_AREAS.has(area)) return;
      route.area = area;
      updateRoute();
      updateAreaView();
    }

    async function loadActivities() {
      setStatus('正在讀取活動…');
      try {
        const data = await apiRead('activities');
        activities = Array.isArray(data && data.activities) ? data.activities : [];
        if (!activities.length) throw new Error('目前沒有可使用的活動');
        const hasCurrent = activities.some(item => String(item.activity_id || '') === route.activityId);
        if (!hasCurrent) route.activityId = String(activities[0].activity_id || DEFAULT_ACTIVITY_ID);
        activitySelector.innerHTML = activities.map(item => {
          const id = String(item.activity_id || '');
          return '<option value="' + escapeHtml(id) + '">' + escapeHtml(canonicalActivityName(item)) + '</option>';
        }).join('');
        activitySelector.value = route.activityId;
        updateActivityLabel();
        updateRoute();
        updateAreaView();
        setStatus('');
        showShell();
      } catch (err) {
        if (err && err.message === '無權限') {
          win.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
          showConfig('存取碼不正確，請重新輸入。');
        } else {
          showShell();
          setStatus(err && err.message ? err.message : '活動讀取失敗', true);
        }
      }
    }

    function escapeHtml(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[char]));
    }

    saveConfig.addEventListener('click', () => {
      const value = tokenInput.value.trim();
      if (!value) return;
      win.sessionStorage.setItem(TOKEN_STORAGE_KEY, value);
      tokenInput.value = '';
      loadActivities();
    });
    tokenInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') saveConfig.click();
    });
    activitySelector.addEventListener('change', event => chooseActivity(event.target.value));
    areaButtons.forEach(button => button.addEventListener('click', () => chooseArea(button.dataset.area)));
    frame.addEventListener('load', syncEmbeddedArea);

    if (token()) {
      showShell();
      loadActivities();
    } else {
      showConfig();
    }
  }

  return {
    parseRoute,
    buildAreaUrl,
    buildShellQuery,
    canonicalActivityName,
    init
  };
});

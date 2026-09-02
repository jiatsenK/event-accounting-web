(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanningCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbyLKDauNZi4zQzztda_agrJF84ILNSL6mXBsTe6e7DUx7dIbNN3GKwSWkDURQjYxkf_aA/exec';
  const TOKEN_STORAGE_KEY = 'eventAccountingToken:' + DEFAULT_API_URL;
  const API_TIMEOUT_MS = 12000;
  const ACTIVITY_TYPES = ['尾牙', '年中聚餐'];

  function asNonNegative(value, name) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new RangeError(`${name} 必須是 0 以上的數字`);
    return n;
  }

  function assertActivityType(activityType) {
    if (!ACTIVITY_TYPES.includes(activityType)) throw new RangeError('請選擇活動類型');
  }

  function getHistory(history, activityType = '全部') {
    if (!Array.isArray(history)) throw new TypeError('歷史資料必須是陣列');
    if (activityType === '全部' || activityType === '') return history.slice();
    assertActivityType(activityType);
    return history.filter(row => row.activity_type === activityType);
  }

  function calculateRows(baselines, activityType, forecastHeadcount, safetyRatePercent, safetyLiters) {
    if (!Array.isArray(baselines)) throw new TypeError('baseline 資料必須是陣列');
    assertActivityType(activityType);
    const headcount = asNonNegative(forecastHeadcount, '預估人數');
    if (headcount === 0) throw new RangeError('預估人數必須大於 0');
    const ratePercent = asNonNegative(safetyRatePercent, '安全率');
    const fixedSafety = asNonNegative(safetyLiters, '固定安全量');
    const rate = ratePercent / 100;

    return baselines.filter(row => row.activity_type === activityType).map(row => {
      if (!Number.isFinite(row.average) || row.sample_count < 2) {
        return {
          ...row,
          baseline_liters: null,
          safety_rate_percent: null,
          safety_from_rate_liters: null,
          fixed_safety_liters: null,
          total_safety_liters: null,
          system_recommended_liters: null
        };
      }
      const baselineLiters = row.average * headcount;
      const safetyFromRate = baselineLiters * rate;
      const totalSafety = safetyFromRate + fixedSafety;
      return {
        ...row,
        baseline_liters: baselineLiters,
        safety_rate_percent: ratePercent,
        safety_from_rate_liters: safetyFromRate,
        fixed_safety_liters: fixedSafety,
        total_safety_liters: totalSafety,
        system_recommended_liters: baselineLiters + totalSafety
      };
    });
  }

  function apiRead(action, args) {
    return new Promise((resolve, reject) => {
      const win = root && root.window === root ? root : null;
      const doc = win && win.document;
      if (!win || !doc) return reject(new Error('JSONP 只能在瀏覽器中使用'));
      const accessToken = win.sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
      if (!accessToken) return reject(new Error('尚未輸入存取碼'));
      const callback = '__planning_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = doc.createElement('script');
      const params = new URLSearchParams({ action, token: accessToken, callback, ...(args || {}) });
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
      script.onerror = () => {
        cleanup();
        reject(new Error('無法連線到活動資料'));
      };
      timer = win.setTimeout(() => {
        cleanup();
        reject(new Error('活動資料連線逾時'));
      }, API_TIMEOUT_MS);
      script.src = DEFAULT_API_URL + '?' + params.toString();
      doc.body.appendChild(script);
    });
  }

  async function fetchActivities() {
    const data = await apiRead('activities');
    return Array.isArray(data && data.activities) ? data.activities : [];
  }

  async function fetchPlanningHistory() {
    const data = await apiRead('planning_history');
    return Array.isArray(data && data.history) ? data.history : [];
  }

  async function fetchPlanningForecast(activityType) {
    assertActivityType(activityType);
    const data = await apiRead('planning_forecast', { activity_type: activityType });
    return {
      activity_type: data && data.activity_type,
      baselines: Array.isArray(data && data.baselines) ? data.baselines : [],
      excluded_groups: Array.isArray(data && data.excluded_groups) ? data.excluded_groups : []
    };
  }

  return {
    DEFAULT_API_URL,
    TOKEN_STORAGE_KEY,
    apiRead,
    fetchActivities,
    fetchPlanningHistory,
    fetchPlanningForecast,
    getHistory,
    calculateRows
  };
});

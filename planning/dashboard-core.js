// Issue #14：活動歷史分析儀表板的純資料層——跟後端 payload 的轉換／篩選
// 邏輯，不碰 DOM，方便在 Node 直接測試。畫面渲染見 manage/dashboard-views.js。
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DashboardCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function planningCore() {
    const core = (root && root.PlanningCore) || (typeof require === 'function' ? require('./core.js') : null);
    if (!core) throw new Error('規劃資料模組尚未載入');
    return core;
  }

  async function fetchHistoricalDashboard() {
    const data = await planningCore().apiRead('historical_dashboard');
    return {
      standard_categories: Array.isArray(data && data.standard_categories) ? data.standard_categories : [],
      activities: Array.isArray(data && data.activities) ? data.activities : []
    };
  }

  const ACTIVITY_TYPES = ['尾牙', '年中聚餐'];

  const COMPLETENESS_LABELS = Object.freeze({
    complete: '完整結算',
    partial: '部分結算',
    activity_only: '無結算資料',
    source_conflict: '來源待確認'
  });

  function byType(activities, type) {
    if (!Array.isArray(activities)) throw new TypeError('活動資料必須是陣列');
    return type && type !== '全部' ? activities.filter(row => row.activity_type === type) : activities.slice();
  }

  function sortByDate(rows) {
    return rows.slice().sort((a, b) => String(a.activity_date || '').localeCompare(String(b.activity_date || '')));
  }

  function completeActivities(activities, type) {
    return byType(activities, type).filter(row => row.data_completeness === 'complete');
  }

  function toPoint(row, value) {
    return {
      activity_id: row.activity_id,
      activity_name: row.activity_name,
      activity_date: row.activity_date,
      activity_type: row.activity_type,
      data_completeness: row.data_completeness,
      value: value
    };
  }

  // 人數趨勢：所有有可靠人數的活動都可顯示，不限 complete（Issue #14 規則 2）。
  function headcountSeries(activities, type) {
    return sortByDate(byType(activities, type)
      .filter(row => Number.isFinite(row.actual_headcount) && row.actual_headcount > 0))
      .map(row => toPoint(row, row.actual_headcount));
  }

  // 總支出／人均成本：只畫 complete 活動；缺資料活動不補 0，用列表另外提示
  // （Issue #14 規則 3）。
  function totalExpenseSeries(activities, type) {
    return sortByDate(completeActivities(activities, type).filter(row => Number.isFinite(row.total_expense)))
      .map(row => toPoint(row, row.total_expense));
  }

  function perCapitaSeries(activities, type) {
    return sortByDate(completeActivities(activities, type).filter(row => Number.isFinite(row.per_capita_expense)))
      .map(row => toPoint(row, row.per_capita_expense));
  }

  // 依同類型、同期間，列出因缺完整結算而被總支出／人均圖排除的活動，讓畫面
  // 能明確標示「缺資料」而不是讓它悄悄消失。
  function excludedFromTotals(activities, type) {
    return sortByDate(byType(activities, type).filter(row => row.data_completeness !== 'complete'));
  }

  function availableCategories(activities) {
    const set = new Set();
    (activities || []).forEach(row => (row.category_breakdown || []).forEach(c => set.add(c.category)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }

  // 主要費用類別趨勢：只比較有該分類正式結算的活動，回傳樣本數
  // （Issue #14 規則 4）。
  function categorySeries(activities, type, category) {
    const points = sortByDate(completeActivities(activities, type))
      .map(row => {
        const match = (row.category_breakdown || []).find(c => c.category === category);
        return match ? Object.assign(toPoint(row, match.amount), { ratio: match.ratio }) : null;
      })
      .filter(Boolean);
    return { category: category, sample_count: points.length, points: points };
  }

  // 樣本只有 1～2 次時不畫趨勢線或成長率，避免暗示不存在的走勢
  // （Issue #14 圖表規則）。
  function shouldShowTrend(points) {
    return Array.isArray(points) && points.length >= 3;
  }

  function growthRate(points) {
    if (!shouldShowTrend(points)) return null;
    const first = points[0].value;
    const last = points[points.length - 1].value;
    if (!Number.isFinite(first) || first === 0 || !Number.isFinite(last)) return null;
    return (last - first) / first;
  }

  // 單一活動的費用結構占比（Issue #14 規則 5）；只要有分類明細就能看
  // （complete 與 partial 都可能有，partial 會在 data_issues 標記缺口）。
  function categoryComposition(activity) {
    if (!activity) return [];
    return (activity.category_breakdown || []).slice().sort((a, b) => b.amount - a.amount);
  }

  // 預算 vs 實際：只有兩者皆存在才顯示差異，不把缺預算當 0
  // （Issue #14 規則 6）。
  function budgetComparisons(activities, type) {
    return sortByDate(byType(activities, type).filter(row =>
      row.budget && Number.isFinite(row.budget.total) && Number.isFinite(row.total_expense)))
      .map(row => ({
        activity_id: row.activity_id,
        activity_name: row.activity_name,
        activity_date: row.activity_date,
        activity_type: row.activity_type,
        data_completeness: row.data_completeness,
        budget_total: row.budget.total,
        actual_total: row.total_expense,
        variance: row.budget.variance,
        variance_rate: row.budget.variance_rate
      }));
  }

  function sortActivitiesForList(activities) {
    return (activities || []).slice().sort((a, b) =>
      String(b.activity_date || '').localeCompare(String(a.activity_date || '')) ||
      String(a.activity_id || '').localeCompare(String(b.activity_id || '')));
  }

  return {
    ACTIVITY_TYPES,
    COMPLETENESS_LABELS,
    fetchHistoricalDashboard,
    byType,
    sortActivitiesForList,
    headcountSeries,
    totalExpenseSeries,
    perCapitaSeries,
    excludedFromTotals,
    availableCategories,
    categorySeries,
    categoryComposition,
    budgetComparisons,
    shouldShowTrend,
    growthRate
  };
});

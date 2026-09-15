(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DashboardViews = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function (root) {
  'use strict';

  function core() {
    if (!root || !root.DashboardCore) throw new Error('歷史分析資料模組尚未載入');
    return root.DashboardCore;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function money(value) {
    return Number.isFinite(value) ? Math.round(value).toLocaleString('zh-Hant') : '—';
  }

  function percent(value, digits) {
    return Number.isFinite(value) ? (value * 100).toFixed(digits == null ? 1 : digits) + '%' : '—';
  }

  function dateLabel(value) {
    return String(value == null ? '' : value).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3');
  }

  function shortDateLabel(value) {
    return String(value == null ? '' : value).replace(/^(\d{4})-(\d{2})-\d{2}$/, '$1/$2');
  }

  const COMPLETENESS_BADGE_CLASS = Object.freeze({
    complete: 'badge', partial: 'badge warn', activity_only: 'badge empty', source_conflict: 'badge warn'
  });

  function completenessBadge(status) {
    const label = core().COMPLETENESS_LABELS[status] || status;
    const cls = COMPLETENESS_BADGE_CLASS[status] || 'badge';
    return '<span class="' + cls + '">' + escapeHtml(label) + '</span>';
  }

  // 手刻 SVG 折線／長條圖：專案沒有引入任何圖表庫，維持跟其餘頁面一樣不依賴
  // 外部套件。樣本只有 1～2 點時不連線（Issue #14 圖表規則），只標出原始點。
  const CHART_WIDTH = 560;
  const CHART_HEIGHT = 200;
  const CHART_PAD = { top: 16, right: 16, bottom: 28, left: 44 };

  function chartScale(points, formatter) {
    const values = points.map(p => p.value);
    const maxValue = Math.max(0, ...values);
    const minValue = Math.min(0, ...values);
    const innerW = CHART_WIDTH - CHART_PAD.left - CHART_PAD.right;
    const innerH = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;
    const range = maxValue - minValue || 1;
    const x = index => points.length <= 1 ? CHART_PAD.left + innerW / 2 :
      CHART_PAD.left + (innerW * index) / (points.length - 1);
    const y = value => CHART_PAD.top + innerH * (1 - (value - minValue) / range);
    return { x, y, maxValue, minValue, innerW, innerH, formatter: formatter || (v => v) };
  }

  function lineChart(points, options) {
    const opts = options || {};
    if (!points.length) return '<div class="no-data">目前沒有可顯示的資料。</div>';
    const formatter = opts.formatter || money;
    const scale = chartScale(points, formatter);
    const showLine = core().shouldShowTrend(points);
    const zeroY = scale.y(0);
    const dots = points.map((p, i) => {
      const cx = scale.x(i);
      const cy = scale.y(p.value);
      const title = escapeHtml(p.activity_name) + '｜' + escapeHtml(dateLabel(p.activity_date)) +
        '｜' + escapeHtml(formatter(p.value)) +
        (p.data_completeness ? '｜' + escapeHtml(core().COMPLETENESS_LABELS[p.data_completeness] || p.data_completeness) : '');
      return '<g class="chart-point"><circle cx="' + cx + '" cy="' + cy + '" r="4"><title>' + title + '</title></circle></g>';
    }).join('');
    const line = showLine ? '<polyline class="chart-line" fill="none" points="' +
      points.map((p, i) => scale.x(i) + ',' + scale.y(p.value)).join(' ') + '"/>' : '';
    const labels = points.map((p, i) => '<text class="chart-x" x="' + scale.x(i) + '" y="' + (CHART_HEIGHT - 8) +
      '" text-anchor="middle">' + escapeHtml(shortDateLabel(p.activity_date)) + '</text>').join('');
    return '<svg class="chart" viewBox="0 0 ' + CHART_WIDTH + ' ' + CHART_HEIGHT + '" role="img" aria-label="趨勢圖">' +
      '<line class="chart-axis" x1="' + CHART_PAD.left + '" y1="' + zeroY + '" x2="' + (CHART_WIDTH - CHART_PAD.right) + '" y2="' + zeroY + '"/>' +
      line + dots + labels + '</svg>' +
      (showLine ? '' : '<div class="chart-note">樣本只有 ' + points.length + ' 筆，僅標示原始點，不畫趨勢線。</div>');
  }

  function barChart(points, options) {
    const opts = options || {};
    if (!points.length) return '<div class="no-data">目前沒有可顯示的資料。</div>';
    const formatter = opts.formatter || money;
    const scale = chartScale(points, formatter);
    const barWidth = Math.min(36, scale.innerW / points.length - 8);
    const zeroY = scale.y(0);
    const bars = points.map((p, i) => {
      const cx = scale.x(i);
      const y = scale.y(Math.max(0, p.value));
      const h = Math.abs(scale.y(p.value) - zeroY);
      const title = escapeHtml(p.activity_name) + '｜' + escapeHtml(dateLabel(p.activity_date)) + '｜' + escapeHtml(formatter(p.value));
      return '<rect class="chart-bar" x="' + (cx - barWidth / 2) + '" y="' + y + '" width="' + barWidth + '" height="' + Math.max(1, h) + '">' +
        '<title>' + title + '</title></rect>';
    }).join('');
    const labels = points.map((p, i) => '<text class="chart-x" x="' + scale.x(i) + '" y="' + (CHART_HEIGHT - 8) +
      '" text-anchor="middle">' + escapeHtml(shortDateLabel(p.activity_date)) + '</text>').join('');
    return '<svg class="chart" viewBox="0 0 ' + CHART_WIDTH + ' ' + CHART_HEIGHT + '" role="img" aria-label="長條圖">' +
      '<line class="chart-axis" x1="' + CHART_PAD.left + '" y1="' + zeroY + '" x2="' + (CHART_WIDTH - CHART_PAD.right) + '" y2="' + zeroY + '"/>' +
      bars + labels + '</svg>';
  }

  function typePanels(activities, type, buildOne) {
    const types = type === '全部' ? core().ACTIVITY_TYPES : [type];
    return types.map(t => '<div class="chart-panel"><h3>' + escapeHtml(t) + '</h3>' + buildOne(t) + '</div>').join('');
  }

  function activityRow(row) {
    return '<tr data-activity-row="' + escapeHtml(row.activity_id) + '">' +
      '<td>' + escapeHtml(dateLabel(row.activity_date)) + '</td>' +
      '<td><strong>' + escapeHtml(row.activity_name) + '</strong><div class="meta">' + escapeHtml(row.activity_type) + '</div></td>' +
      '<td class="num">' + (Number.isFinite(row.actual_headcount) ? escapeHtml(row.actual_headcount) + ' 人' : '—') + '</td>' +
      '<td class="num">' + money(row.total_expense) + '</td>' +
      '<td class="num">' + money(row.per_capita_expense) + '</td>' +
      '<td>' + completenessBadge(row.data_completeness) + '</td></tr>';
  }

  function categoryCompositionList(activity) {
    if (!activity) return '<div class="no-data">請選擇活動。</div>';
    const rows = core().categoryComposition(activity);
    if (!rows.length) {
      return '<div class="no-data">這場活動目前沒有分類明細（' +
        escapeHtml(core().COMPLETENESS_LABELS[activity.data_completeness] || activity.data_completeness) + '）。</div>';
    }
    const issues = (activity.data_issues || []).length ?
      '<div class="page-status">' + activity.data_issues.map(escapeHtml).join('；') + '</div>' : '';
    const items = rows.map(row => '<div class="composition-row"><div class="composition-label">' + escapeHtml(row.category) +
      (row.raw_categories && row.raw_categories.length ? '<span class="meta">原始分類：' + row.raw_categories.map(escapeHtml).join('、') + '</span>' : '') +
      '</div><div class="composition-bar"><div class="composition-fill" style="width:' + Math.max(2, (row.ratio || 0) * 100) + '%"></div></div>' +
      '<div class="composition-value">' + money(row.amount) + '<span class="meta">' + percent(row.ratio) + '</span></div></div>').join('');
    return issues + '<div class="composition-list">' + items + '</div>';
  }

  function budgetRow(row) {
    const varianceClass = row.variance > 0 ? 'over' : row.variance < 0 ? 'under' : '';
    return '<tr><td>' + escapeHtml(dateLabel(row.activity_date)) + '</td>' +
      '<td><strong>' + escapeHtml(row.activity_name) + '</strong></td>' +
      '<td class="num">' + money(row.budget_total) + '</td>' +
      '<td class="num">' + money(row.actual_total) + '</td>' +
      '<td class="num variance ' + varianceClass + '">' + (row.variance > 0 ? '+' : '') + money(row.variance) +
      '<span class="meta">' + percent(row.variance_rate) + '</span></td></tr>';
  }

  function render(container, state) {
    const dc = core();
    const activities = dc.sortActivitiesForList(dc.byType(state.activities, state.type));
    const categories = dc.availableCategories(state.activities);
    if (!state.category || !categories.includes(state.category)) state.category = categories[0] || '';
    const compositionOptions = dc.sortActivitiesForList(state.activities).filter(row => (row.category_breakdown || []).length);
    if (!state.compositionId || !compositionOptions.some(row => row.activity_id === state.compositionId)) {
      state.compositionId = compositionOptions[0] && compositionOptions[0].activity_id || '';
    }
    const compositionActivity = compositionOptions.find(row => row.activity_id === state.compositionId) || null;

    const excluded = dc.excludedFromTotals(state.activities, state.type);
    const excludedNote = excluded.length ?
      '<div class="page-status">' + excluded.length + ' 場活動缺完整結算資料，未列入總支出／人均圖：' +
      excluded.map(row => escapeHtml(row.activity_name) + '（' + escapeHtml(dc.COMPLETENESS_LABELS[row.data_completeness]) + '）').join('、') +
      '</div>' : '';

    const categorySeries = state.category ? dc.categorySeries(state.activities, state.type, state.category) : null;

    container.innerHTML = '<div class="planning-app"><div class="dashboard-app">' +
      '<div class="section-head"><div><h2>歷史分析</h2><div class="muted">跨活動人數、總支出、人均與類別趨勢；金額只取正式結算資料，缺資料的活動不補 0。</div></div>' +
      '<label class="filter"><span>活動類型</span><select data-dashboard-type><option value="全部">全部</option>' +
      dc.ACTIVITY_TYPES.map(t => '<option value="' + t + '"' + (t === state.type ? ' selected' : '') + '>' + t + '</option>').join('') +
      '</select></label></div>' +

      '<section class="panel"><h3>活動列表</h3><table class="history-table"><thead><tr><th>日期</th><th>活動</th>' +
      '<th class="num">實際人數</th><th class="num">總支出</th><th class="num">人均</th><th>資料完整度</th></tr></thead><tbody>' +
      (activities.length ? activities.map(activityRow).join('') : '<tr><td colspan="6"><div class="no-data">目前沒有活動資料。</div></td></tr>') +
      '</tbody></table></section>' +

      '<section class="panel"><h3>人數趨勢</h3><div class="chart-grid">' +
      typePanels(state.activities, state.type, t => lineChart(dc.headcountSeries(state.activities, t), { formatter: v => v + ' 人' })) +
      '</div></section>' +

      '<section class="panel"><h3>總支出與人均成本</h3><div class="muted">只計入資料完整度為「完整結算」的活動。</div>' + excludedNote +
      '<div class="chart-grid">' +
      typePanels(state.activities, state.type, t => '<div class="chart-sub">總支出</div>' + barChart(dc.totalExpenseSeries(state.activities, t)) +
        '<div class="chart-sub">人均成本</div>' + lineChart(dc.perCapitaSeries(state.activities, t))) +
      '</div></section>' +

      '<section class="panel"><h3>主要費用類別趨勢</h3>' +
      '<label class="filter"><span>費用類別</span><select data-dashboard-category>' +
      (categories.length ? categories.map(c => '<option value="' + escapeHtml(c) + '"' + (c === state.category ? ' selected' : '') + '>' + escapeHtml(c) + '</option>').join('') :
        '<option value="">目前沒有可比較的分類</option>') + '</select></label>' +
      (categorySeries ? '<div class="muted">樣本數：' + categorySeries.sample_count + ' 場（僅計入有此分類正式結算的完整活動）。</div>' : '') +
      '<div class="chart-grid">' +
      typePanels(state.activities, state.type, t => lineChart(dc.categorySeries(state.activities, t, state.category).points)) +
      '</div></section>' +

      '<section class="panel"><h3>費用結構占比</h3>' +
      '<label class="filter"><span>選擇活動</span><select data-dashboard-composition>' +
      (compositionOptions.length ? compositionOptions.map(row => '<option value="' + escapeHtml(row.activity_id) + '"' +
        (row.activity_id === state.compositionId ? ' selected' : '') + '>' + escapeHtml(row.activity_name) + '</option>').join('') :
        '<option value="">目前沒有可用的活動</option>') + '</select></label>' +
      '<div data-composition-body>' + categoryCompositionList(compositionActivity) + '</div>' +
      (compositionActivity ? '<button type="button" class="link-button" data-open-accounting="' + escapeHtml(compositionActivity.activity_id) +
        '">在帳務系統開啟這場活動的明細 →</button>' : '') +
      '</section>' +

      '<section class="panel"><h3>預算 vs 實際</h3><div class="muted">只有活動預算與正式結算都存在時才顯示差異。</div>' +
      '<table class="history-table"><thead><tr><th>日期</th><th>活動</th><th class="num">核准預算</th><th class="num">實際支出</th><th class="num">差異</th></tr></thead><tbody>' +
      (function () {
        const rows = dc.budgetComparisons(state.activities, state.type);
        return rows.length ? rows.map(budgetRow).join('') : '<tr><td colspan="5"><div class="no-data">目前沒有同時具備預算與正式結算的活動。</div></td></tr>';
      })() + '</tbody></table></section>' +

      '</div></div>';

    container.querySelector('[data-dashboard-type]').addEventListener('change', event => {
      state.type = event.target.value;
      render(container, state);
    });
    const categorySelect = container.querySelector('[data-dashboard-category]');
    if (categorySelect) categorySelect.addEventListener('change', event => {
      state.category = event.target.value;
      render(container, state);
    });
    const compositionSelect = container.querySelector('[data-dashboard-composition]');
    if (compositionSelect) compositionSelect.addEventListener('change', event => {
      state.compositionId = event.target.value;
      render(container, state);
    });
    const openAccounting = container.querySelector('[data-open-accounting]');
    if (openAccounting && typeof state.navigate === 'function') {
      openAccounting.addEventListener('click', () => state.navigate({
        activityId: openAccounting.dataset.openAccounting, area: 'accounting', view: 'overview'
      }));
    }
  }

  const dashboard = Object.freeze({
    async mount(container, context) {
      container.innerHTML = '<div class="planning-app"><div class="no-data">正在讀取歷史分析資料…</div></div>';
      const data = await core().fetchHistoricalDashboard();
      render(container, { activities: data.activities, type: '全部', category: '', compositionId: '', navigate: context && context.navigate });
    }
  });

  return {
    dashboard,
    escapeHtml,
    money,
    percent,
    dateLabel,
    completenessBadge,
    lineChart,
    barChart,
    categoryCompositionList,
    activityRow,
    budgetRow
  };
});

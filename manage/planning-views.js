(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlanningViews = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  const forecastCache = new Map();

  function core() {
    if (!root || !root.PlanningCore) throw new Error('規劃資料模組尚未載入');
    return root.PlanningCore;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function liters(value) {
    return Number.isFinite(value) ? `${value.toFixed(1).replace(/\.0$/, '')} L` : '—';
  }

  function ratio(value, confidence) {
    return Number.isFinite(value) ? `${value.toFixed(confidence === '低' ? 2 : 3)} L/人` : '—';
  }

  function dateLabel(value) {
    return String(value == null ? '' : value).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3');
  }

  function hasAccountingPurchasePending(event) {
    return Array.isArray(event && event.categories) && event.categories.some(row =>
      row && row.ordered_liters != null && row.consumed_liters == null
    );
  }

  function eventTotals(event) {
    return (event.categories || []).reduce((sum, row) => {
      if (Number.isFinite(row.ordered_liters)) sum.ordered = (sum.ordered == null ? 0 : sum.ordered) + row.ordered_liters;
      if (Number.isFinite(row.consumed_liters)) sum.consumed = (sum.consumed == null ? 0 : sum.consumed) + row.consumed_liters;
      if (Number.isFinite(row.remaining_liters)) sum.remaining = (sum.remaining == null ? 0 : sum.remaining) + row.remaining_liters;
      return sum;
    }, { ordered: null, consumed: null, remaining: null });
  }

  function historyRow(row) {
    let quality = '正常';
    if (row.ordered_liters != null && row.consumed_liters == null) quality = '帳務已有採購，消耗待補';
    else if (row.missing_capacity_count) quality = `${row.missing_capacity_count} 項缺容量，無法換算 L`;
    else if (row.warning_count) quality = `${row.warning_count} 項異常：消耗量大於採購量`;
    return '<tr><td><strong>' + escapeHtml(row.drink_category) + '</strong><div class="meta">' +
      escapeHtml(row.item_count) + ' 個品項</div></td><td class="num">' + liters(row.ordered_liters) +
      '</td><td class="num">' + liters(row.consumed_liters) + '</td><td class="num">' +
      liters(row.remaining_liters) + '</td><td class="quality">' + escapeHtml(quality) + '</td></tr>';
  }

  function eventCard(event, open) {
    const hasData = Array.isArray(event.categories) && event.categories.length > 0;
    const purchasePending = hasAccountingPurchasePending(event);
    const totals = eventTotals(event);
    const warningBadge = event.warning_count ? '<span class="badge warn">' + escapeHtml(event.warning_count) + ' 筆需注意</span>' : '';
    const dataBadge = hasData ? '<span class="badge">查看明細</span>' +
      (purchasePending ? '<span class="badge">帳務已有採購</span><span class="badge empty">消耗待補</span>' : '') :
      '<span class="badge empty">尚無飲品資料</span>';
    const pendingNotice = purchasePending ? '<div class="no-data"><strong>帳務已有採購，部分消耗紀錄待補。</strong><br>消耗資料補入前，相關類別不會被納入 L/人 baseline。</div>' : '';
    const body = hasData ? pendingNotice + '<div class="totals"><div class="total">可換算採購<strong>' + liters(totals.ordered) +
      '</strong></div><div class="total">可換算消耗<strong>' + liters(totals.consumed) +
      '</strong></div><div class="total">可換算剩餘<strong>' + liters(totals.remaining) +
      '</strong></div></div><table class="history-table"><thead><tr><th>飲品類別</th><th class="num">採購</th><th class="num">消耗</th><th class="num">剩餘</th><th>資料狀態</th></tr></thead><tbody>' +
      event.categories.map(historyRow).join('') + '</tbody></table>' :
      '<div class="no-data">這場活動目前尚未提供可供檢視的飲品資料。</div>';
    const headcount = Number(event.actual_headcount);
    const headcountLabel = Number.isFinite(headcount) && headcount > 0 ? `實際 ${headcount} 人` : '實際人數未提供';
    return '<details class="event"' + (open ? ' open' : '') + '><summary><div class="date">' + dateLabel(event.activity_date) +
      '</div><div><div class="event-title">' + escapeHtml(event.activity_name) + '</div><div class="meta">' +
      escapeHtml(event.activity_type) + ' · ' + headcountLabel + (hasData ? ` · ${event.categories.length} 類飲品` : '') +
      '</div></div><div class="badges">' + warningBadge + dataBadge + '</div></summary><div class="event-body">' + body + '</div></details>';
  }

  function renderHistory(container, history, activityType) {
    const rows = core().getHistory(history, activityType);
    const completed = rows.filter(row => Array.isArray(row.categories) && row.categories.some(category => category.consumed_liters != null)).length;
    const accountingOnly = rows.filter(hasAccountingPurchasePending).length;
    container.querySelector('[data-history-count]').textContent = `${activityType === '全部' ? '全部' : activityType}共 ${rows.length} 場；${completed} 場已有飲品消耗實績${accountingOnly ? `，${accountingOnly} 場帳務已有採購但消耗待補` : ''}。`;
    const firstDataIndex = rows.findIndex(row => Array.isArray(row.categories) && row.categories.length > 0);
    container.querySelector('[data-history-list]').innerHTML = rows.length ? rows.map((event, index) => eventCard(event, index === firstDataIndex)).join('') :
      '<div class="no-data">目前沒有符合條件的歷史活動。</div>';
  }

  const history = Object.freeze({
    async mount(container) {
      container.innerHTML = '<div class="planning-app"><div class="section-head"><div><h2>歷史活動</h2><div data-history-count class="muted"></div></div>' +
        '<label class="filter"><span>活動類型</span><select data-history-type><option value="全部">全部</option><option value="尾牙">尾牙</option><option value="年中聚餐">年中聚餐</option></select></label></div>' +
        '<div data-history-list class="history-list"><div class="no-data">正在讀取歷史資料…</div></div></div>';
      const rows = await core().fetchPlanningHistory();
      const select = container.querySelector('[data-history-type]');
      const refresh = () => renderHistory(container, rows, select.value);
      select.addEventListener('change', refresh);
      refresh();
    }
  });

  function estimatedHeadcount(activity) {
    const candidates = [activity && activity.estimated_headcount, activity && activity.forecast_headcount, activity && activity.expected_headcount];
    const value = candidates.map(Number).find(number => Number.isFinite(number) && number > 0);
    return value || null;
  }

  async function baselinesFor(activityType) {
    if (!forecastCache.has(activityType)) {
      const forecast = await core().fetchPlanningForecast(activityType);
      forecastCache.set(activityType, forecast.baselines);
    }
    return forecastCache.get(activityType);
  }

  function planCard(row) {
    if (!Number.isFinite(row.system_recommended_liters)) {
      return '<article class="card empty"><div><div class="cardhead"><h3>' + escapeHtml(row.drink_category) +
        '</h3><span class="badge low">資料不足</span></div><div class="value">—</div><div class="small">沒有足夠的可用 L/人 baseline，因此不輸出假的精準建議量。</div><div class="plan-quality">排除 ' +
        escapeHtml(row.excluded) + ' 個歷史活動資料群組</div></div></article>';
    }
    const low = row.confidence === '低';
    return '<article class="card"><div class="cardhead"><h3>' + escapeHtml(row.drink_category) + '</h3><span class="badge' +
      (low ? ' low' : '') + '">信心：' + escapeHtml(row.confidence) + (low ? ' · 樣本少' : '') +
      '</span></div><div class="value">' + liters(row.system_recommended_liters) +
      '</div><div class="small">系統建議 = 基準需求 + 透明安全量</div><div class="breakdown"><div>基準需求<strong>' +
      liters(row.baseline_liters) + '</strong></div><div>比例安全量<strong>' + liters(row.safety_from_rate_liters) +
      '</strong></div><div>固定安全量<strong>' + liters(row.fixed_safety_liters) + '</strong></div><div>總安全量<strong>' +
      liters(row.total_safety_liters) + '</strong></div></div><dl><div><dt>歷史平均</dt><dd>' + ratio(row.average, row.confidence) +
      '</dd></div><div><dt>樣本</dt><dd>' + escapeHtml(row.sample_count) + ' 次</dd></div><div><dt>中位數</dt><dd>' +
      ratio(row.median, row.confidence) + '</dd></div><div><dt>歷史範圍</dt><dd>' + ratio(row.min, row.confidence) + ' ～ ' +
      ratio(row.max, row.confidence) + '</dd></div></dl><div class="plan-quality">來源活動：' +
      (row.sources || []).map(escapeHtml).join('、') + (row.excluded ? ` · 另排除 ${row.excluded} 個異常／缺資料群組` : '') + '</div></article>';
  }

  async function renderForecast(container) {
    const type = container.querySelector('[data-plan-type]').value;
    const headcount = Number(container.querySelector('[data-plan-headcount]').value);
    const rate = Number(container.querySelector('[data-plan-rate]').value);
    const fixed = Number(container.querySelector('[data-plan-fixed]').value);
    const baselines = await baselinesFor(type);
    const rows = core().calculateRows(baselines, type, headcount, rate, fixed);
    container.querySelector('[data-plan-results]').innerHTML = '<div class="summary"><div><h2>' + escapeHtml(type) + ' · 預估 ' +
      escapeHtml(headcount) + ' 人</h2></div><div class="muted">安全設定：' + escapeHtml(rate) + '% ＋ 每類別固定 ' +
      liters(fixed) + '。安全量與歷史 baseline 分開顯示。</div></div><div class="cards">' +
      (rows.length ? rows.map(planCard).join('') : '<div class="no-data">目前沒有可供試算的 baseline。</div>') + '</div>';
  }

  const forecast = Object.freeze({
    async mount(container, context) {
      container.innerHTML = '<div class="planning-app"><section class="panel"><div data-plan-notice class="no-data" hidden></div>' +
        '<form data-plan-form class="form"><label class="field"><span>活動類型</span><select data-plan-type><option value="尾牙">尾牙</option><option value="年中聚餐">年中聚餐</option></select></label>' +
        '<label class="field"><span>預估人數</span><input data-plan-headcount type="number" min="1" step="1" value="200"></label>' +
        '<label class="field"><span>安全率（%）</span><input data-plan-rate type="number" min="0" step="0.1" value="10"></label>' +
        '<label class="field"><span>每類別固定安全量（L）</span><input data-plan-fixed type="number" min="0" step="0.1" value="2"></label>' +
        '<button type="submit">重新計算</button></form><div data-plan-error class="error" role="alert"></div></section><section data-plan-results></section></div>';
      const activities = await core().fetchActivities();
      const activity = activities.find(item => String(item.activity_id || '') === String(context.activityId || ''));
      if (!activity) throw new Error(`找不到 activity_id=${context.activityId} 對應的活動，請回到活動管理頁重新選擇。`);
      const activityType = String(activity.activity_type || '').trim();
      const typeSelect = container.querySelector('[data-plan-type]');
      if (!Array.from(typeSelect.options).some(option => option.value === activityType)) {
        throw new Error(`活動類型「${activityType || '未設定'}」目前無法試算。`);
      }
      typeSelect.value = activityType;
      const estimate = estimatedHeadcount(activity);
      if (estimate) container.querySelector('[data-plan-headcount]').value = String(estimate);
      else {
        const notice = container.querySelector('[data-plan-notice]');
        notice.hidden = false;
        notice.textContent = '此活動尚無預估人數，已保留預設值，請自行調整。';
      }
      await renderForecast(container);
      container.querySelector('[data-plan-form]').addEventListener('submit', async event => {
        event.preventDefault();
        const error = container.querySelector('[data-plan-error]');
        error.textContent = '';
        try { await renderForecast(container); } catch (reason) { error.textContent = reason && reason.message || String(reason); }
      });
    }
  });

  return {
    history,
    forecast,
    hasAccountingPurchasePending,
    estimatedHeadcount,
    eventTotals,
    eventCard,
    planCard
  };
});

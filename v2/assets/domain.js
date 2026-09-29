/* 活動工作台 v2：計算規則（不碰畫面、不碰試算表）。
 * 瀏覽器、Node 測試與 Apps Script 共用同一份，規則以 event-accounting/v2/SPEC.md 為準。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.V2Domain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LINE_STAGES = ['待報價', '已報價', '發票已到', '付款中', '全部付清'];
  const REQUEST_STATUSES = ['待申請', '已申請', '公司已匯款'];
  const EXPENSE_STATUSES = ['待確認', '待核銷', '已核銷'];
  const BUDGET_STATUSES = ['草稿', '已提報', '已核准'];
  const CLOSE_STAGES = ['未開始', '已核銷', '已回覆會計', '已結清', '已結案'];
  const PAYMENT_METHODS = ['公司轉帳', '活動零用金', '個人代墊', '公司刷卡'];

  const alive = row => row && !row.deleted_at;
  const num = value => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(String(value).replace(/[,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const sum = (rows, pick) => rows.reduce((total, row) => total + (num(pick(row)) || 0), 0);
  const byActivity = (rows, activityId) => (rows || []).filter(row => alive(row) && row.activity_id === activityId);

  function nextId(prefix, rows) {
    const pattern = new RegExp('^' + prefix + '-(\\d+)$');
    const max = (rows || []).reduce((top, row) => {
      const match = pattern.exec(String(row && row.id || ''));
      return match ? Math.max(top, Number(match[1])) : top;
    }, 0);
    return prefix + '-' + String(max + 1).padStart(6, '0');
  }

  function quotesOf(lineId, quotes) {
    return (quotes || []).filter(q => alive(q) && q.line_id === lineId)
      .sort((a, b) => String(a.quoted_at || '').localeCompare(String(b.quoted_at || '')) || String(a.id).localeCompare(String(b.id)));
  }

  function latestQuote(lineId, quotes) {
    const list = quotesOf(lineId, quotes);
    return list.length ? num(list[list.length - 1].amount) : null;
  }

  function requestsOfLine(lineId, requests, requestLines) {
    const ids = new Set((requestLines || []).filter(rl => rl.line_id === lineId).map(rl => rl.request_id));
    return (requests || []).filter(r => alive(r) && ids.has(r.id));
  }

  function linePayment(line, db) {
    const quote = latestQuote(line.id, db.quotes);
    const links = (db.request_lines || []).filter(rl => rl.line_id === line.id);
    const requests = (db.payment_requests || []).filter(alive);
    const amountFor = link => {
      const request = requests.find(r => r.id === link.request_id);
      return request ? { request, amount: num(link.amount) != null ? num(link.amount) : num(request.amount) || 0 } : null;
    };
    const parts = links.map(amountFor).filter(Boolean);
    const planned = parts.reduce((t, p) => t + p.amount, 0);
    const submitted = parts.filter(p => p.request.status !== '待申請').reduce((t, p) => t + p.amount, 0);
    const paid = parts.filter(p => p.request.status === '公司已匯款').reduce((t, p) => t + p.amount, 0);
    const total = quote != null ? quote : num(line.approved_amount);
    return { quote, total, planned, submitted, paid, remaining: total == null ? null : Math.max(0, total - planned), requests: parts.map(p => p.request) };
  }

  function lineStage(line, db) {
    const pay = linePayment(line, db);
    if (pay.quote == null) return '待報價';
    if (pay.paid > 0 && pay.paid >= pay.quote) return '全部付清';
    if (pay.submitted > 0) return '付款中';
    if (line.invoice_received_at) return '發票已到';
    return '已報價';
  }

  function isPossibleDuplicate(expense, expenses) {
    if (!alive(expense) || expense.not_duplicate === true || expense.not_duplicate === 'TRUE') return false;
    return (expenses || []).some(other => other !== expense && other.id !== expense.id && alive(other)
      && other.activity_id === expense.activity_id && other.date === expense.date
      && num(other.amount) === num(expense.amount)
      && !(other.not_duplicate === true || other.not_duplicate === 'TRUE'));
  }

  function needsReceipt(expense) {
    if (!alive(expense) || expense.status === '待確認' || expense.method === '公司轉帳') return false;
    return !(expense.receipt === true || expense.receipt === 'TRUE' || expense.receipt === '有');
  }

  /* 零用金結算：暫支 − 零用金支付 − 從零用金扣回的代墊。正值匯回公司，負值向公司補請。 */
  function pettySettlement(activity, expenses) {
    const rows = byActivity(expenses, activity.id).filter(e => e.status !== '待確認');
    const advance = num(activity.petty_advance) || 0;
    const pettyUsed = sum(rows.filter(e => e.method === '活動零用金'), e => e.amount);
    const advances = sum(rows.filter(e => e.method === '個人代墊' && !e.request_id), e => e.amount);
    const balance = advance - pettyUsed - advances;
    return {
      advance, pettyUsed, advances, balance,
      direction: balance > 0 ? '回沖' : balance < 0 ? '補請' : '無需沖銷',
      amount: Math.abs(balance)
    };
  }

  function activityState(activity) {
    if (activity.closed_at) return '已結案';
    if (activity.locked_at) return '核銷中';
    return '籌備中';
  }

  function closeStage(activity) {
    if (activity.closed_at) return '已結案';
    if (activity.settled_at) return '已結清';
    if (activity.replied_at) return '已回覆會計';
    if (activity.locked_at) return '已核銷';
    return '未開始';
  }

  function activitySummary(activity, db) {
    const lines = byActivity(db.budget_lines, activity.id);
    const requests = byActivity(db.payment_requests, activity.id);
    const expenses = byActivity(db.expenses, activity.id).filter(e => e.status !== '待確認');
    const approved = num(activity.approved_total);
    const latest = lines.reduce((total, line) => {
      const quote = latestQuote(line.id, db.quotes);
      return total + (quote != null ? quote : 0);
    }, 0);
    const quotedLines = lines.filter(line => latestQuote(line.id, db.quotes) != null).length;
    const submitted = sum(requests.filter(r => r.status !== '待申請'), r => r.amount);
    const paid = sum(requests.filter(r => r.status === '公司已匯款'), r => r.amount);
    const actual = sum(expenses, e => e.amount);
    const base = approved || latest || 0;
    const pct = value => base ? Math.round(value / base * 100) : null;
    return {
      approved, latest, quotedLines, lineCount: lines.length,
      latestDelta: approved != null ? latest - approved : null,
      submitted, submittedPct: pct(submitted),
      paid, paidPct: pct(paid),
      actual, actualCount: expenses.length
    };
  }

  /* 依預算項目對照：簽呈金額（品項核准時凍結）、最新報價、實際支出。 */
  function categoryComparison(activity, db) {
    const lines = byActivity(db.budget_lines, activity.id);
    const expenses = byActivity(db.expenses, activity.id).filter(e => e.status !== '待確認');
    const map = new Map();
    const row = name => {
      if (!map.has(name)) map.set(name, { category: name, approved: null, latest: null, actual: 0 });
      return map.get(name);
    };
    lines.forEach(line => {
      const r = row(line.category || '未分類');
      const approved = num(line.approved_amount);
      if (approved != null) r.approved = (r.approved || 0) + approved;
      const quote = latestQuote(line.id, db.quotes);
      if (quote != null) r.latest = (r.latest || 0) + quote;
    });
    expenses.forEach(e => { row(e.category || '未分類').actual += num(e.amount) || 0; });
    const order = new Map((db.budget_categories || []).map((c, i) => [c.name, num(c.order) != null ? num(c.order) : i]));
    return Array.from(map.values()).map(r => Object.assign(r, {
      delta: r.approved != null && r.latest != null ? r.latest - r.approved : null
    })).sort((a, b) => (order.has(a.category) ? order.get(a.category) : 999) - (order.has(b.category) ? order.get(b.category) : 999));
  }

  /* 核准後的變動：核准後新增的品項，以及核准後改過價的品項。 */
  function changesSinceApproval(activity, db) {
    if (!activity.budget_approved_at) return [];
    const approvedAt = String(activity.budget_approved_at);
    return byActivity(db.budget_lines, activity.id).map(line => {
      const later = quotesOf(line.id, db.quotes).filter(q => String(q.quoted_at || '') > approvedAt);
      if (!later.length) return null;
      const approved = num(line.approved_amount);
      const latest = num(later[later.length - 1].amount);
      return { line, approved, latest, delta: latest - (approved || 0), added: approved == null, quotes: later };
    }).filter(Boolean);
  }

  function todoCounts(db, activityId) {
    const activities = (db.activities || []).filter(alive).filter(a => activityId ? a.id === activityId : !a.closed_at);
    const open = new Set(activities.map(a => a.id));
    const inScope = rows => (rows || []).filter(r => alive(r) && open.has(r.activity_id));
    const lines = inScope(db.budget_lines);
    const requests = inScope(db.payment_requests);
    const expenses = inScope(db.expenses);
    return {
      invoice: lines.filter(line => lineStage(line, db) === '發票已到' && !linePayment(line, db).requests.length).length,
      draftRequest: requests.filter(r => r.status === '待申請').length,
      confirm: expenses.filter(e => e.status === '待確認').length,
      duplicate: expenses.filter(e => isPossibleDuplicate(e, db.expenses)).length,
      receipt: expenses.filter(needsReceipt).length,
      waitPay: requests.filter(r => r.status === '已申請').length,
      closing: activities.filter(a => a.locked_at && !a.closed_at).length
    };
  }

  return {
    LINE_STAGES, REQUEST_STATUSES, EXPENSE_STATUSES, BUDGET_STATUSES, CLOSE_STAGES, PAYMENT_METHODS,
    num, nextId, quotesOf, latestQuote, requestsOfLine, linePayment, lineStage,
    isPossibleDuplicate, needsReceipt, pettySettlement, activityState, closeStage,
    activitySummary, categoryComparison, changesSinceApproval, todoCounts
  };
});

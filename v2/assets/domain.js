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
  const REQUEST_STAGES = ['訂金', '尾款', '全額', '追加', '回沖', '補請', '零用金'];
  const NON_VENDOR_STAGES = ['回沖', '補請', '零用金'];
  const ACTIVITY_TYPES = ['尾牙', '年中聚餐', '家庭日', '其他'];
  /* 各表編號前綴，與後端 v2/gas/Schema.gs 一致。活動的 id 由 activityIdFor 產生。 */
  const TABLE_PREFIX = {
    activities: '', vendors: 'V', budget_categories: 'C', staff: 'S', budget_lines: 'L', quotes: 'Q',
    payment_requests: 'R', request_lines: 'RL', expenses: 'E', settlement_lines: 'SL', allocation_units: 'AU',
    prizes: 'P', rundown_config: 'RC', rundown_segments: 'SG', rundown_roles: 'RR', rundown_tasks: 'T',
    rundown_assignments: 'RA', drink_records: 'D', drink_plans: 'DP', activity_log: 'G'
  };

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
    /* 回沖、補請、零用金是跟公司之間的往來，不是付給廠商的錢，不算進已申請／已匯款。 */
    const requests = byActivity(db.payment_requests, activity.id).filter(r => NON_VENDOR_STAGES.indexOf(r.stage) === -1);
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

  const isTrue = value => value === true || value === 'TRUE' || value === '有';
  const fmt = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const slashDate = d => String(d || '').replace(/-/g, '/');

  /* 活動代碼：尾牙 yearendYYYY、年中聚餐 midyearYYYY、家庭日 familyYYYY、其他 eventYYYY；重複時加 -2、-3。 */
  function activityIdFor(type, year, existingIds) {
    const prefix = { '尾牙': 'yearend', '年中聚餐': 'midyear', '家庭日': 'family' }[type] || 'event';
    const taken = new Set(existingIds || []);
    const base = prefix + String(year || '').replace(/\D/g, '');
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(base + '-' + n)) return base + '-' + n;
  }

  /* 核銷前的自動檢查；key 讓畫面決定「去處理」要跳到哪。 */
  function closeChecks(activity, db) {
    const expenses = byActivity(db.expenses, activity.id);
    const requests = byActivity(db.payment_requests, activity.id);
    const lines = byActivity(db.budget_lines, activity.id);
    return [
      { key: 'confirm', label: 'ChatGPT 記的支出都已確認', help: '收件匣要清空', ok: expenses.every(e => e.status !== '待確認') },
      { key: 'category', label: '每筆支出都有預算項目', help: '核銷總覽依預算項目彙總', ok: expenses.every(e => e.status === '待確認' || e.category) },
      { key: 'petty', label: '零用金暫支已填', help: '零用金結算表要用', ok: num(activity.petty_advance) != null },
      { key: 'duplicate', label: '沒有可能重複的支出', help: '同一天同金額的都確認過', ok: !expenses.some(e => isPossibleDuplicate(e, db.expenses)) },
      { key: 'receipt', label: '零用金和代墊都有收據', help: '零用金結算表要附', ok: !expenses.some(needsReceipt) },
      { key: 'lines', label: '廠商品項都已付清', help: '每個品項的訂金、尾款都匯完', ok: lines.length > 0 && lines.every(l => lineStage(l, db) === '全部付清') },
      { key: 'requests', label: '申請單都已公司匯款', help: '沒有卡在申請中的單', ok: requests.every(r => r.status === '公司已匯款') }
    ];
  }

  /* 簽呈文字：只給主旨與說明，貼到公司簽呈範本用。prev 是上一屆同類活動的 { total, headcount }（可省略）。 */
  function proposalText(activity, db, prev) {
    const lines = byActivity(db.budget_lines, activity.id);
    const total = lines.reduce((t, l) => {
      const q = latestQuote(l.id, db.quotes);
      return t + (q != null ? q : num(l.approved_amount) || 0);
    }, 0);
    const people = num(activity.est_headcount);
    const yearEnd = activity.type === '尾牙';
    const title = yearEnd ? '有關 ' + activity.name + '總費用提報乙案，呈請 核示' : '有關舉辦' + activity.name + '費用乙案，呈請 核示';
    const prevText = yearEnd && prev && num(prev.total) && num(prev.headcount) ? '；上一屆人均 ' + fmt(num(prev.total) / num(prev.headcount)) + ' 元' : '';
    const intro = [
      '一、擬辦理旨揭活動，活動時間：' + (slashDate(activity.date) || '未定') + '；活動地點：' + (activity.venue || '未定') + '。',
      '二、本次活動預估總金額為新臺幣 ' + fmt(total) + ' 元整' + (people ? '，預估參加人數 ' + people + ' 人，人均 ' + fmt(total / people) + ' 元' : '') + prevText + '，費用明細詳如附件。',
      yearEnd ? '三、本案採實支實付；付款條件詳如附件預估費用明細。' : '三、費用擬依活動分攤設定辦理，結束後另行提報。',
      '四、呈請核示。'
    ];
    return '主　旨：' + title + '\n\n說　明：\n' + intro.join('\n');
  }

  /* 歷史分析：已結案的活動看實際支出；進行中的活動看最新報價，加上非公司轉帳的支出。 */
  function historySummary(db) {
    const activities = (db.activities || []).filter(alive);
    const catOrder = new Map((db.budget_categories || []).map((c, i) => [c.name, num(c.order) != null ? num(c.order) : i]));
    const seen = new Set();
    const rows = activities.map(activity => {
      const totals = {};
      const add = (cat, amount) => { const k = cat || '未分類'; seen.add(k); totals[k] = (totals[k] || 0) + (num(amount) || 0); };
      const expenses = byActivity(db.expenses, activity.id).filter(e => e.status !== '待確認');
      const lines = byActivity(db.budget_lines, activity.id);
      const closed = !!activity.closed_at;
      if (closed) expenses.forEach(e => add(e.category, e.amount));
      else {
        lines.forEach(l => { const q = latestQuote(l.id, db.quotes); add(l.category, q != null ? q : l.approved_amount); });
        expenses.filter(e => e.method !== '公司轉帳').forEach(e => add(e.category, e.amount));
      }
      if (!lines.length && !expenses.length) return null;
      const total = Object.keys(totals).reduce((t, k) => t + totals[k], 0);
      return {
        id: activity.id, name: activity.name, date: activity.date, state: activityState(activity),
        headcount: num(activity.actual_headcount) || num(activity.est_headcount), totals, total
      };
    }).filter(Boolean).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    const categories = Array.from(seen).sort((a, b) => (catOrder.has(a) ? catOrder.get(a) : 999) - (catOrder.has(b) ? catOrder.get(b) : 999));
    const drinkMap = new Map();
    (db.drink_records || []).filter(alive).forEach(d => {
      const key = d.activity_id + '|' + (d.category || '其他');
      const ml = (num(d.consumed_units) || 0) * (num(d.unit_capacity_ml) || 0);
      const cur = drinkMap.get(key) || { activity_id: d.activity_id, category: d.category || '其他', liters: 0 };
      cur.liters += ml / 1000;
      drinkMap.set(key, cur);
    });
    const drinks = Array.from(drinkMap.values()).map(d => Object.assign(d, { liters: Math.round(d.liters * 10) / 10 }));
    return { activities: rows, categories, drinks };
  }

  /* 跨活動搜尋：活動、品項、申請單、支出、廠商，各最多 limit 筆。 */
  function searchAll(db, q, limit) {
    const needle = String(q || '').trim().toLowerCase();
    const max = limit || 50;
    const empty = { activities: [], budget_lines: [], payment_requests: [], expenses: [], vendors: [] };
    if (!needle) return empty;
    const has = value => String(value == null ? '' : value).toLowerCase().indexOf(needle) !== -1;
    const vendors = (db.vendors || []).filter(alive);
    const vendorName = id => { const v = vendors.find(x => x.id === id); return v ? (v.short_name || v.name) : ''; };
    const pick = (rows, test) => (rows || []).filter(r => alive(r) && test(r)).slice(0, max);
    return {
      activities: pick(db.activities, a => has(a.name) || has(a.venue) || has(a.id)),
      budget_lines: pick(db.budget_lines, l => has(l.item) || has(l.category) || has(vendorName(l.vendor_id))),
      payment_requests: pick(db.payment_requests, r => has(r.payee_name) || has(vendorName(r.payee_vendor_id)) || has(r.request_no) || has(r.stage) || has(r.purpose)),
      expenses: pick(db.expenses, e => has(e.item) || has(e.category) || has(e.vendor_name) || has(e.invoice_no)),
      vendors: pick(vendors, v => has(v.name) || has(v.short_name) || has(v.tax_id))
    };
  }

  /* ---------- 寫入規則 ----------
   * 把 SPEC 第 5 節的寫入 op 套到記憶體中的資料表（db = { 表名: [列] }）。
   * 網頁用它做樂觀更新、本機模擬後端用它回應；後端也可以用同一份。
   * ctx = { now: ISO 時間, today: YYYY-MM-DD, idFor(table): 指定新列編號（可省略） }。
   * 回傳 { row, table }；資料不合規時丟出 Error，message 是給人看的原因。 */
  function applyWrite(db, op, args, ctx) {
    args = args || {};
    ctx = ctx || {};
    const now = ctx.now || new Date().toISOString();
    const today = ctx.today || now.slice(0, 10);
    const fail = message => { throw new Error(message); };
    const rowsOf = name => {
      if (!Object.prototype.hasOwnProperty.call(TABLE_PREFIX, name)) fail('沒有這張表：' + name);
      return db[name] || (db[name] = []);
    };
    const find = (name, id) => rowsOf(name).find(r => r.id === id && alive(r)) || fail('找不到資料：' + id);
    const insert = (name, row) => {
      const rows = rowsOf(name);
      const r = Object.assign({}, row);
      if (!r.id) r.id = (ctx.idFor && ctx.idFor(name)) || (TABLE_PREFIX[name] ? nextId(TABLE_PREFIX[name], rows) : fail('要先給活動代碼'));
      if (rows.some(x => x.id === r.id)) fail('編號 ' + r.id + ' 已經有了');
      r.created_at = r.created_at || now;
      r.updated_at = now;
      rows.push(r);
      return r;
    };
    const patch = (row, fields) => {
      Object.keys(fields).forEach(k => {
        if (k === 'id' || k === 'created_at') return;
        const v = fields[k];
        if (v === '' || v === null || v === undefined) delete row[k]; else row[k] = v;
      });
      row.updated_at = now;
      return row;
    };
    const checkAmount = (value, label) => {
      const n = num(value);
      if (n == null || !Number.isInteger(n) || n < 0) fail((label || '金額') + '要是 0 以上的整數');
      return n;
    };
    const activityOfRow = (name, row) => {
      if (name === 'activities') return row.id;
      if (row.activity_id) return row.activity_id;
      if (name === 'quotes') { const l = rowsOf('budget_lines').find(x => x.id === row.line_id); return l && l.activity_id; }
      if (name === 'request_lines') { const r = rowsOf('payment_requests').find(x => x.id === row.request_id); return r && r.activity_id; }
      return '';
    };
    const ensureOpen = activityId => {
      const a = activityId && rowsOf('activities').find(x => x.id === activityId);
      if (a && a.locked_at && !ctx.allowLocked) fail('這場活動已完成核銷並鎖定，不能再改');
      return a;
    };
    const log = (activityId, entity, entityId, action, text) => insert('activity_log', {
      activity_id: activityId || '', at: now, entity, entity_id: entityId, action, text
    });
    const moneyFields = ['amount', 'unit_price', 'approved_amount', 'sponsor_amount', 'petty_advance', 'est_headcount', 'actual_headcount'];
    const checkRow = row => moneyFields.forEach(k => { if (row[k] !== undefined && row[k] !== '' && row[k] !== null) row[k] = checkAmount(row[k], k === 'est_headcount' || k === 'actual_headcount' ? '人數' : '金額'); });

    if (op === 'create') {
      const name = args.table;
      const row = Object.assign({}, args.row);
      checkRow(row);
      if (name === 'activities') {
        if (!row.name) fail('活動名稱不能空白');
        row.budget_status = row.budget_status || '草稿';
        row.close_stage = row.close_stage || '未開始';
      }
      if (name === 'budget_lines' && !row.item) fail('品項名稱不能空白');
      if (name === 'expenses') {
        if (!row.item) fail('支出項目不能空白');
        if (row.amount === undefined) fail('支出要有金額');
        row.status = row.status || '待核銷';
        row.source = row.source || '網頁';
        row.date = row.date || today;
      }
      if (name === 'payment_requests') {
        if (row.amount === undefined) fail('申請單要有金額');
        row.status = row.status || '待申請';
      }
      if (name === 'vendors' && !row.name) fail('廠商名稱不能空白');
      if (name !== 'activities') ensureOpen(activityOfRow(name, row));
      const created = insert(name, row);
      log(activityOfRow(name, created), name, created.id, '新增', '新增' + (created.name || created.item || created.payee_name || created.id));
      return { table: name, row: created };
    }
    if (op === 'update' || op === 'delete') {
      const name = args.table;
      const current = find(name, (args.row || {}).id);
      ensureOpen(name === 'activities' ? null : activityOfRow(name, current));
      if (op === 'delete') {
        patch(current, { deleted_at: now });
        log(activityOfRow(name, current), name, current.id, '刪除', '刪除' + (current.item || current.name || current.id));
      } else {
        const fields = Object.assign({}, args.row);
        checkRow(fields);
        patch(current, fields);
        log(activityOfRow(name, current), name, current.id, '修改', '修改' + (current.item || current.name || current.payee_name || current.id));
      }
      return { table: name, row: current };
    }
    if (op === 'add_quote') {
      const line = find('budget_lines', args.line_id);
      ensureOpen(line.activity_id);
      const amount = checkAmount(args.amount, '報價');
      const quote = insert('quotes', { line_id: line.id, amount, quoted_at: args.quoted_at || today, reason: args.reason || '', doc_url: args.doc_url || '' });
      if (!quote.reason) delete quote.reason;
      if (!quote.doc_url) delete quote.doc_url;
      log(line.activity_id, 'quotes', quote.id, '新增', line.item + '報價改為 ' + fmt(amount) + (args.reason ? '（' + args.reason + '）' : ''));
      return { table: 'quotes', row: quote };
    }
    if (op === 'set_budget_status') {
      const activity = find('activities', args.activity_id || args.id);
      ensureOpen(activity.id);
      const from = BUDGET_STATUSES.indexOf(activity.budget_status || '草稿');
      const to = BUDGET_STATUSES.indexOf(args.status);
      if (to === -1) fail('沒有這個預算狀態：' + args.status);
      if (to !== from + 1) fail('預算要依序推進：' + BUDGET_STATUSES.join(' → '));
      activity.budget_status = args.status;
      if (args.status === '已提報') activity.budget_submitted_at = today;
      if (args.status === '已核准') {
        activity.budget_approved_at = today;
        let total = 0;
        byActivity(db.budget_lines, activity.id).forEach(line => {
          const q = latestQuote(line.id, db.quotes);
          if (q != null) { line.approved_amount = q; line.updated_at = now; total += q; }
        });
        activity.approved_total = total;
      }
      activity.updated_at = now;
      log(activity.id, 'activities', activity.id, '狀態變更', '預算' + args.status);
      return { table: 'activities', row: activity };
    }
    if (op === 'set_request_status') {
      const request = find('payment_requests', args.id);
      ensureOpen(request.activity_id);
      const from = REQUEST_STATUSES.indexOf(request.status || '待申請');
      const to = REQUEST_STATUSES.indexOf(args.status);
      if (to === -1) fail('沒有這個申請單狀態：' + args.status);
      if (to <= from) fail('申請單狀態只能往前推進');
      request.status = args.status;
      if (args.request_no) request.request_no = args.request_no;
      if (to >= 1 && !request.requested_at) request.requested_at = today;
      if (to === 2) request.paid_at = args.paid_at || today;
      request.updated_at = now;
      log(request.activity_id, 'payment_requests', request.id, '狀態變更', (request.payee_name || '') + request.stage + '申請單' + args.status);
      return { table: 'payment_requests', row: request };
    }
    if (op === 'confirm_expense') {
      const expense = find('expenses', args.id);
      ensureOpen(expense.activity_id);
      if (expense.status !== '待確認') fail('這筆支出已經確認過了');
      const category = args.category || expense.category || expense.suggested_category;
      if (!category) fail('請先選預算項目');
      expense.category = category;
      expense.status = '待核銷';
      expense.updated_at = now;
      log(expense.activity_id, 'expenses', expense.id, '狀態變更', '確認支出：' + expense.item);
      return { table: 'expenses', row: expense };
    }
    if (['lock_close', 'reply_accounting', 'settle', 'close'].indexOf(op) !== -1) {
      const activity = find('activities', args.activity_id || args.id);
      const stage = CLOSE_STAGES.indexOf(closeStage(activity));
      const need = { lock_close: 0, reply_accounting: 1, settle: 2, close: 3 }[op];
      if (stage !== need) fail('核銷要依序進行：' + CLOSE_STAGES.slice(1).join(' → '));
      if (op === 'lock_close') {
        byActivity(db.expenses, activity.id).forEach(e => { if (e.status === '待核銷') { e.status = '已核銷'; e.updated_at = now; } });
        const petty = pettySettlement(activity, db.expenses);
        activity.locked_at = now;
        activity.settle_direction = petty.direction;
        activity.settle_amount_expected = petty.amount;
        activity.close_stage = '已核銷';
      }
      if (op === 'reply_accounting') { activity.replied_at = now; activity.close_stage = '已回覆會計'; }
      if (op === 'settle') {
        const actual = checkAmount(args.amount, '實際金額');
        const expected = num(activity.settle_amount_expected) || 0;
        if (actual !== expected && !String(args.reason || '').trim()) fail('實際金額 ' + fmt(actual) + ' 和系統算的 ' + fmt(expected) + ' 不同，請寫原因');
        activity.settle_amount_actual = actual;
        if (args.reason) activity.settle_note = args.reason;
        activity.settled_at = now;
        activity.close_stage = '已結清';
      }
      if (op === 'close') { activity.closed_at = now; activity.close_stage = '已結案'; }
      activity.updated_at = now;
      const text = { lock_close: '完成核銷並鎖定', reply_accounting: '已回覆會計', settle: '零用金已結清', close: '結案' }[op];
      log(activity.id, 'activities', activity.id, '狀態變更', text);
      return { table: 'activities', row: activity };
    }
    return fail('不認得的操作：' + op);
  }

  return {
    LINE_STAGES, REQUEST_STATUSES, EXPENSE_STATUSES, BUDGET_STATUSES, CLOSE_STAGES, PAYMENT_METHODS,
    REQUEST_STAGES, NON_VENDOR_STAGES, ACTIVITY_TYPES, TABLE_PREFIX,
    num, nextId, quotesOf, latestQuote, requestsOfLine, linePayment, lineStage,
    isPossibleDuplicate, needsReceipt, pettySettlement, activityState, closeStage,
    activitySummary, categoryComparison, changesSinceApproval, todoCounts,
    isTrue, activityIdFor, closeChecks, proposalText, historySummary, searchAll, applyWrite
  };
});

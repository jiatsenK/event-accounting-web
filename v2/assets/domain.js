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

  /* 歷史分析表：把後端 history 回傳（各活動依預算項目的實際支出、人數、飲品實績）整理成畫面用的欄與列。
   * 只列有支出的活動，依舉辦日排序；預算項目依 budget_categories 的順序。 */
  function historyTable(history) {
    const data = history || {};
    const catOrder = new Map((data.budget_categories || []).map((c, i) => [c.name, num(c.order) != null ? num(c.order) : i]));
    const columns = (data.activities || []).map(a => {
      const totals = a.categories || {};
      const total = Object.keys(totals).reduce((t, k) => t + (num(totals[k]) || 0), 0);
      const headcount = num(a.actual_headcount) || num(a.est_headcount);
      return { id: a.id, name: a.name, date: a.date, closed: !!a.closed_at, totals, total, headcount, perHead: headcount ? Math.round(total / headcount) : null };
    }).filter(c => c.total > 0).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    const seen = new Set();
    columns.forEach(c => Object.keys(c.totals).forEach(k => { if (num(c.totals[k])) seen.add(k); }));
    const categories = Array.from(seen).sort((a, b) => (catOrder.has(a) ? catOrder.get(a) : 999) - (catOrder.has(b) ? catOrder.get(b) : 999));
    const drinkMap = new Map();
    (data.drink_records || []).filter(alive).forEach(d => {
      const category = d.category || '其他';
      if (!drinkMap.has(category)) drinkMap.set(category, {});
      const row = drinkMap.get(category);
      row[d.activity_id] = (row[d.activity_id] || 0) + (num(d.consumed_units) || 0) * (num(d.unit_capacity_ml) || 0) / 1000;
    });
    const drinks = Array.from(drinkMap.entries()).map(([category, byActivity]) => {
      Object.keys(byActivity).forEach(k => { byActivity[k] = Math.round(byActivity[k] * 10) / 10; });
      return { category, liters: byActivity };
    });
    return { columns, categories, drinks };
  }

  /* 流程表時間：依 order 排序；有 anchor_time 的段落從那個時間開始，其餘接在上一段結束後。start 是正式開始時間（HH:MM）。 */
  function rundownTimes(segments, start) {
    const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
    const toText = m => m == null ? '' : String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    let cursor = toMin(start);
    return (segments || []).filter(alive).slice().sort((a, b) => (num(a.order) || 0) - (num(b.order) || 0)).map(seg => {
      const anchor = toMin(seg.anchor_time);
      const begin = anchor != null ? anchor : cursor;
      const end = begin != null ? begin + (num(seg.duration_min) || 0) : null;
      cursor = end;
      return { segment: seg, start: toText(begin), end: toText(end) };
    });
  }

  /* ---------- 寫入規則 ----------
   * 把 SPEC 第 5 節的寫入 op 套到記憶體中的資料表（db = { 表名: [列] }），行為對齊後端 v2/gas/Ops.gs。
   * 網頁用它做樂觀更新（先顯示、後端說不行再回復），本機模擬後端也用它回應。
   * ctx = { now: ISO 時間, today: YYYY-MM-DD, idFor(table): 指定新列編號（可省略） }。
   * 回傳 { table, row }；資料不合規時丟出 Error，message 是給人看的原因。 */
  const PROTECTED_FIELDS = {
    activities: ['budget_status', 'budget_approved_at', 'approved_total', 'close_stage', 'locked_at', 'replied_at', 'settled_at', 'closed_at',
      'settle_direction', 'settle_amount_expected', 'settle_amount_actual'],
    budget_lines: ['approved_amount'],
    payment_requests: ['status', 'requested_at', 'paid_at'],
    expenses: ['status']
  };
  const MASTER_TABLES = ['activities', 'vendors', 'budget_categories', 'staff'];

  function applyWrite(db, op, args, ctx) {
    args = args || {};
    ctx = ctx || {};
    const now = ctx.now || new Date().toISOString();
    const today = ctx.today || now.slice(0, 10);
    const fail = message => { throw new Error(message); };
    const rowsOf = name => {
      if (!Object.prototype.hasOwnProperty.call(TABLE_PREFIX, name) || name === 'activity_log') fail('不能寫入這張表：' + name);
      return db[name] || (db[name] = []);
    };
    const find = (name, id, label) => {
      if (id === undefined || id === null || id === '') fail('缺少' + label);
      return (db[name] || []).find(r => r.id === id && alive(r)) || fail('找不到' + label + '：' + id);
    };
    const insert = (name, row) => {
      const rows = name === 'activity_log' ? (db.activity_log || (db.activity_log = [])) : rowsOf(name);
      const r = Object.assign({}, row);
      Object.keys(r).forEach(k => { if (r[k] === '' || r[k] === null || r[k] === undefined) delete r[k]; });
      if (!r.id) r.id = (ctx.idFor && ctx.idFor(name)) || nextId(TABLE_PREFIX[name], rows);
      if (rows.some(x => x.id === r.id)) fail(name + ' 已有編號 ' + r.id);
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
    const activityOf = (name, row) => {
      if (name === 'activities') return row.id;
      if (row.activity_id) return row.activity_id;
      if (name === 'quotes') { const l = (db.budget_lines || []).find(x => x.id === row.line_id); return l && l.activity_id; }
      if (name === 'request_lines') { const r = (db.payment_requests || []).find(x => x.id === row.request_id); return r && r.activity_id; }
      return '';
    };
    /* 已結案的活動只能看不能改；核銷鎖定後不能再動支出、品項與報價。 */
    const guard = (name, activityId) => {
      if (!activityId || (MASTER_TABLES.indexOf(name) !== -1 && name !== 'activities')) return;
      const activity = (db.activities || []).find(a => a.id === activityId) || fail('找不到活動：' + activityId);
      if (activity.closed_at) fail('活動已結案，不能修改');
      if (activity.locked_at && ['expenses', 'budget_lines', 'quotes'].indexOf(name) !== -1) fail('活動已核銷鎖定，不能再改支出或品項');
    };
    const checkMoney = row => ['amount', 'unit_price', 'approved_amount', 'sponsor_amount', 'petty_advance'].forEach(k => {
      if (row[k] === undefined || row[k] === '' || row[k] === null) return;
      const n = num(row[k]);
      if (n == null || !Number.isInteger(n) || n < 0) fail('金額要是 0 以上的整數');
      row[k] = n;
    });
    const label = row => row.item || row.name || row.purpose || row.content || row.id;
    const log = (activityId, entity, entityId, action, text) => insert('activity_log', { activity_id: activityId || '', at: now, entity, entity_id: entityId, action, text });

    if (op === 'create') {
      const name = String(args.table || '');
      rowsOf(name);
      const row = Object.assign({}, args.row || {});
      checkMoney(row);
      if (name === 'expenses') {
        row.status = row.status || '待核銷';
        row.source = row.source || '網頁';
        if (row.amount === undefined || row.amount === '') fail('缺少金額');
      }
      if (name === 'payment_requests') row.status = '待申請';
      if (name === 'activities') {
        if (!row.id) fail('缺少活動代碼');
        if (!row.name) fail('活動名稱不能空白');
        row.budget_status = row.budget_status || '草稿';
        row.close_stage = '未開始';
        ['locked_at', 'replied_at', 'settled_at', 'closed_at', 'approved_total', 'budget_approved_at'].forEach(k => delete row[k]);
      }
      const activityId = activityOf(name, row);
      if (name !== 'activities') guard(name, activityId);
      const saved = insert(name, row);
      log(activityId, name, saved.id, '新增', '新增「' + label(saved) + '」');
      return { table: name, row: saved };
    }
    if (op === 'update') {
      const name = String(args.table || '');
      rowsOf(name);
      const fields = Object.assign({}, args.row || {});
      const current = find(name, fields.id, '資料');
      (PROTECTED_FIELDS[name] || []).forEach(k => delete fields[k]);
      delete fields.deleted_at;
      checkMoney(fields);
      const activityId = activityOf(name, current);
      guard(name, activityId);
      patch(current, fields);
      log(activityId, name, current.id, '修改', '修改「' + label(current) + '」');
      return { table: name, row: current };
    }
    if (op === 'delete') {
      const name = String(args.table || '');
      rowsOf(name);
      const current = find(name, args.id || (args.row && args.row.id), '資料');
      if (name === 'payment_requests' && current.status !== '待申請') fail('已送出的申請單不能刪除');
      const activityId = activityOf(name, current);
      guard(name, activityId);
      patch(current, { deleted_at: now });
      log(activityId, name, current.id, '刪除', '刪除「' + label(current) + '」');
      return { table: name, row: current };
    }
    if (op === 'add_quote') {
      const line = find('budget_lines', args.line_id, '品項');
      guard('quotes', line.activity_id);
      const amount = num(args.amount);
      if (amount === null || !Number.isInteger(amount) || amount < 0) fail('報價金額要是 0 以上的整數');
      const previous = latestQuote(line.id, db.quotes);
      const activity = (db.activities || []).find(a => a.id === line.activity_id) || {};
      if (previous !== null && activity.budget_approved_at && !String(args.reason || '').trim()) fail('簽呈核准後改價要寫原因');
      const saved = insert('quotes', { line_id: line.id, amount, quoted_at: args.quoted_at || now, reason: args.reason, doc_url: args.doc_url });
      log(line.activity_id, 'quotes', saved.id, '新增', previous === null
        ? '「' + line.item + '」報價 ' + fmt(amount)
        : '「' + line.item + '」改價 ' + fmt(previous) + ' → ' + fmt(amount) + (args.reason ? '（' + args.reason + '）' : ''));
      return { table: 'quotes', row: saved };
    }
    if (op === 'set_budget_status') {
      const activity = find('activities', args.activity_id, '活動');
      guard('activities', activity.id);
      const status = String(args.status || '');
      if (BUDGET_STATUSES.indexOf(status) === -1) fail('預算狀態不正確：' + status);
      if (status === '草稿' && activity.budget_approved_at) fail('已核准的預算不能退回草稿');
      activity.budget_status = status;
      if (status === '已提報') activity.budget_submitted_at = activity.budget_submitted_at || today;
      if (status === '已核准') {
        let total = 0;
        byActivity(db.budget_lines, activity.id).forEach(line => {
          const quote = latestQuote(line.id, db.quotes);
          if (quote === null) return;
          line.approved_amount = quote;
          line.updated_at = now;
          total += quote;
        });
        activity.budget_submitted_at = activity.budget_submitted_at || today;
        activity.budget_approved_at = now;
        activity.approved_total = total;
      }
      activity.updated_at = now;
      log(activity.id, 'activities', activity.id, '狀態變更', '預算' + status + (status === '已核准' ? '，簽呈金額 ' + fmt(activity.approved_total) : ''));
      return { table: 'activities', row: activity };
    }
    if (op === 'set_request_status') {
      const request = find('payment_requests', args.id, '申請單');
      guard('payment_requests', request.activity_id);
      const status = String(args.status || '');
      if (REQUEST_STATUSES.indexOf(status) === -1) fail('申請單狀態不正確：' + status);
      const fields = { status };
      if (args.request_no) fields.request_no = args.request_no;
      if (status === '已申請') fields.requested_at = args.date || request.requested_at || today;
      if (status === '公司已匯款') { fields.requested_at = request.requested_at || args.requested_at || today; fields.paid_at = args.date || today; }
      if (status === '待申請') { fields.requested_at = ''; fields.paid_at = ''; }
      patch(request, fields);
      log(request.activity_id, 'payment_requests', request.id, '狀態變更', '申請單「' + (request.purpose || request.id) + '」' + status);
      return { table: 'payment_requests', row: request };
    }
    if (op === 'confirm_expense') {
      const expense = find('expenses', args.id, '支出');
      if (expense.status !== '待確認') fail('這筆支出已確認過');
      guard('expenses', expense.activity_id);
      const fields = Object.assign({}, args.row || {});
      delete fields.id;
      delete fields.deleted_at;
      checkMoney(fields);
      fields.status = '待核銷';
      fields.category = args.category || fields.category || expense.category || expense.suggested_category || '';
      patch(expense, fields);
      log(expense.activity_id, 'expenses', expense.id, '狀態變更', '確認支出「' + (expense.item || expense.id) + '」');
      return { table: 'expenses', row: expense };
    }
    if (op === 'lock_close') {
      const activity = find('activities', args.activity_id, '活動');
      if (activity.closed_at) fail('活動已結案');
      if (activity.locked_at) fail('已經核銷鎖定過');
      const expenses = byActivity(db.expenses, activity.id);
      const waiting = expenses.filter(e => e.status === '待確認').length;
      if (waiting) fail('還有 ' + waiting + ' 筆支出待確認，確認後才能核銷');
      expenses.filter(e => e.status === '待核銷').forEach(e => { e.status = '已核銷'; e.updated_at = now; });
      const petty = pettySettlement(activity, db.expenses);
      patch(activity, { locked_at: now, close_stage: '已核銷', settle_direction: petty.direction, settle_amount_expected: petty.amount });
      log(activity.id, 'activities', activity.id, '狀態變更', '核銷鎖定，零用金' + petty.direction + (petty.amount ? ' ' + fmt(petty.amount) : ''));
      return { table: 'activities', row: activity };
    }
    if (op === 'reply_accounting' || op === 'settle' || op === 'close') {
      const activity = find('activities', args.activity_id, '活動');
      const step = {
        reply_accounting: ['locked_at', 'replied_at', '已回覆會計'],
        settle: ['replied_at', 'settled_at', '已結清'],
        close: ['settled_at', 'closed_at', '已結案']
      }[op];
      if (activity.closed_at) fail('活動已結案');
      if (!activity[step[0]]) fail('上一個步驟還沒完成');
      if (activity[step[1]]) fail('這個步驟已經完成過');
      const fields = { [step[1]]: args.date || now, close_stage: step[2] };
      if (op === 'settle') {
        const actual = num(args.amount);
        if (actual === null) fail('請填實際匯款金額');
        const expected = num(activity.settle_amount_expected) || 0;
        const note = String(args.note || '').trim();
        if (actual !== expected && !note) fail('實際金額和系統算的 ' + fmt(expected) + ' 不同，請寫原因');
        fields.settle_amount_actual = actual;
        fields.settle_note = note;
      }
      patch(activity, fields);
      log(activity.id, 'activities', activity.id, '狀態變更', step[2] + (fields.settle_note ? '（' + fields.settle_note + '）' : ''));
      return { table: 'activities', row: activity };
    }
    return fail('不支援的動作：' + op);
  }

  return {
    LINE_STAGES, REQUEST_STATUSES, EXPENSE_STATUSES, BUDGET_STATUSES, CLOSE_STAGES, PAYMENT_METHODS,
    REQUEST_STAGES, NON_VENDOR_STAGES, ACTIVITY_TYPES, TABLE_PREFIX,
    num, nextId, quotesOf, latestQuote, requestsOfLine, linePayment, lineStage,
    isPossibleDuplicate, needsReceipt, pettySettlement, activityState, closeStage,
    activitySummary, categoryComparison, changesSinceApproval, todoCounts,
    isTrue, activityIdFor, closeChecks, proposalText, historyTable, rundownTimes, applyWrite
  };
});

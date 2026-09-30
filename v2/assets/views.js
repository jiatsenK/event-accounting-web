/* 活動工作台 v2：畫面（只把資料排成 HTML）。
 * 數字與狀態一律來自 V2Domain；資料來自 V2Store；互動在 app.js。 */
(function (root) {
  'use strict';
  const D = root.V2Domain;
  const App = root.V2App = root.V2App || {};

  /* ---------- 小工具 ---------- */
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    cal: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 3v3M16 3v3"/>',
    store: '<path d="M3 9 4.5 4h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6"/>',
    inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    alert: '<path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
    bank: '<path d="M3 10 12 4l9 6M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3 20h18"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.2 2.2 3.8 5"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    wallet: '<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7V6a2 2 0 0 1 2-2h11M16 13.5h2"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>'
  };
  const ic = (n, c) => '<svg class="i ' + (c || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + P[n] + '</svg>';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => n == null || n === '' ? '—' : new Intl.NumberFormat('en-US').format(Math.round(Number(n)));
  const dateText = d => d ? String(d).slice(0, 10).replace(/-/g, '/') : '';
  const shortDate = d => {
    if (!d) return '';
    const s = String(d).slice(0, 10);
    return s.slice(0, 4) === String(new Date().getFullYear()) ? s.slice(5).replace('-', '/') : s.replace(/-/g, '/');
  };
  const TONE = { '付款中': 'b', '全部付清': 'g', '可能重複': 'r', '缺收據': 'a', '待報價': 'n', '已報價': 'b', '發票已到': 'a', '已申請': 'b', '公司已匯款': 'g',
    '待申請': 'a', '待確認': 'a', '待核銷': 'b', '已核銷': 'g', '草稿': 'n', '已提報': 'a', '已核准': 'g', '使用中': 'g', '未登記': 'n', '已停用': 'n',
    '籌備中': 'b', '核銷中': 'a', '已結案': 'g' };
  const st = (s, label) => '<span class="st ' + (TONE[s] || 'n') + '">' + esc(label || s) + '</span>';
  function stepperAt(steps, i) {
    return '<div class="stepper">' + steps.map((s, k) => (k ? '<span class="bar ' + (k <= i ? 'done' : '') + '"></span>' : '')
      + '<span class="stp ' + (k < i ? 'done' : k === i ? 'cur' : '') + '"><span class="dot">'
      + (k < i ? ic('check', 's').replace('class="i s"', 'class="i s" style="width:12px;height:12px;stroke-width:3"') : k + 1) + '</span>' + esc(s) + '</span>').join('') + '</div>';
  }
  const stepper = (steps, cur) => stepperAt(steps, steps.indexOf(cur));
  const PALETTE = ['#4f46e5', '#db2777', '#0891b2', '#ea580c', '#16a34a', '#7c3aed', '#ca8a04', '#0d9488'];
  const colorOf = key => { let h = 0; String(key || '').split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return PALETTE[h % PALETTE.length]; };
  const initial = name => String(name || '?').replace(/[○◯\s]/g, '').slice(0, 1) || '?';
  const av = (name, color) => '<span class="av" style="background:' + color + '1f;color:' + color + '">' + esc(initial(name)) + '</span>';
  const deltaText = d => d == null ? '<span class="sub">—</span>' : d > 0 ? '<span class="delta-up">+' + money(d) + '</span>' : d < 0 ? '<span class="delta-down">−' + money(-d) + '</span>' : '0';

  /* ---------- 資料查詢（只讀） ---------- */
  const db = () => root.V2Store.db();
  const alive = r => r && !r.deleted_at;
  const actOf = id => db().activities.find(a => a.id === id);
  const vendorOf = id => id ? db().vendors.find(v => v.id === id) : null;
  const vendorName = id => { const v = vendorOf(id); return v ? (v.short_name || v.name) : ''; };
  const linesOf = id => db().budget_lines.filter(l => alive(l) && l.activity_id === id).sort((a, b) => (D.num(a.order) || 0) - (D.num(b.order) || 0));
  const reqsOf = id => db().payment_requests.filter(r => alive(r) && r.activity_id === id);
  const expsOf = id => db().expenses.filter(e => alive(e) && e.activity_id === id);
  const payeeOf = r => r.payee_vendor_id ? vendorName(r.payee_vendor_id) || r.payee_name || r.payee_vendor_id : (r.payee_name || '—');
  const categories = () => {
    const list = db().budget_categories.filter(c => alive(c) && c.active !== 'FALSE' && c.active !== false).sort((a, b) => (D.num(a.order) || 0) - (D.num(b.order) || 0)).map(c => c.name);
    return list.length ? list : ['其他'];
  };
  const locked = a => !!(a && (a.locked_at || a.closed_at));
  const closed = a => !!(a && a.closed_at);
  const isAddedAfterApproval = (line, a) => line.approved_amount == null && a && a.budget_approved_at && String(line.created_at || '') > String(a.budget_approved_at);
  const payInfo = line => {
    const p = D.linePayment(line, db());
    return Object.assign(p, { pct: p.total ? Math.min(100, Math.round(p.paid / p.total * 100)) : 0 });
  };
  const lineStage = line => D.lineStage(line, db());
  const isDup = e => D.isPossibleDuplicate(e, db().expenses);

  /* ---------- 側欄與頂列 ---------- */
  function side() {
    const ui = App.ui;
    const c = D.todoCounts(db());
    const hot = c.invoice + c.draftRequest + c.confirm + c.duplicate + c.receipt + c.closing;
    const items = [['todo', '待辦', 'home', hot], ['activities', '活動', 'cal', 0], ['vendors', '廠商', 'store', 0], ['inbox', '收件匣', 'inbox', c.confirm], ['history', '歷史分析', 'chart', 0]];
    const cur = v => ui.view === v || (v === 'activities' && ui.view === 'activity');
    const mode = root.V2Api.isMock() ? '模擬資料（本機測試）' : '已連線後端';
    return '<div class="logo"><i>活</i><span>活動工作台</span></div>'
      + '<div class="navgroup"><div class="navlabel">工作區</div>' + items.map(([v, l, icn, n]) => '<a class="nav ' + (cur(v) ? 'cur' : '') + '" href="#/' + v + '"' + (cur(v) ? ' aria-current="page"' : '') + '>' + ic(icn) + '<span>' + l + '</span>' + (n ? '<span class="badge hot tn">' + n + '</span>' : '') + '</a>').join('') + '</div>'
      + '<div class="me"><span class="avatar">' + ic('people', 's') + '</span><div class="who-text"><b>活動承辦</b><small>' + esc(mode) + '</small>'
      + '<span style="display:flex;gap:10px;margin-top:2px"><button class="btn link" type="button" data-act="refresh">重新讀取</button>'
      + (root.V2Api.isMock() ? '<button class="btn link" type="button" data-act="mock-reset">重設模擬資料</button>' : '<button class="btn link" type="button" data-act="logout">登出</button>') + '</span></div></div>';
  }

  /* ---------- 待辦 ---------- */
  const TODO = [
    ['invoice', '發票到了，還沒開申請單', 'receipt', 'a', 'budget', ''],
    ['draftRequest', '申請單待送出', 'send', 'a', 'requests', 'status=待申請'],
    ['confirm', 'ChatGPT 新記的支出待確認', 'sparkle', 'a', 'expenses', 'status=待確認'],
    ['duplicate', '可能重複登記的支出', 'alert', 'r', 'expenses', 'flag=duplicate'],
    ['receipt', '零用金／代墊還缺收據', 'file', 'a', 'expenses', 'flag=receipt'],
    ['waitPay', '等公司匯款', 'bank', 'b', 'requests', 'status=已申請'],
    ['closing', '核銷後還沒回覆會計或結清', 'lock', 'a', 'close', '']
  ];
  function todoCards(c, activityId) {
    return '<div class="todo">' + TODO.map(([k, label, icon, tone]) => '<button type="button" class="tcard ' + (c[k] ? '' : 'zero') + '" data-act="todo" data-key="' + k + '"' + (activityId ? ' data-activity="' + esc(activityId) + '"' : '') + '>'
      + '<span class="ticon ' + (c[k] ? tone : 'n') + '">' + ic(icon) + '</span><span class="tx"><b class="tn">' + c[k] + '</b><span>' + label + '</span></span><span class="go">' + ic('chev', 's') + '</span></button>').join('') + '</div>';
  }
  function greeting() {
    const h = new Date().getHours();
    return h < 11 ? '早安' : h < 18 ? '午安' : '晚安';
  }
  function pageTodo() {
    const open = db().activities.filter(a => alive(a) && !a.closed_at).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    return '<div><h1>' + greeting() + '</h1><div class="meta"><span>所有進行中活動的待辦都在這裡，點卡片直接跳到篩好的清單。</span></div></div>'
      + todoCards(D.todoCounts(db()))
      + '<div class="panel"><div class="phd"><div><h2>進行中的活動</h2></div><a class="btn sec sm" href="#/activities">看全部活動</a></div>'
      + '<div class="tbl"><table><thead><tr><th>活動</th><th>日期</th><th>預算</th><th class="num">待辦</th><th></th></tr></thead><tbody>'
      + (open.length ? open.map(a => {
        const k = D.todoCounts(db(), a.id);
        const n = k.invoice + k.draftRequest + k.confirm + k.duplicate + k.receipt + k.closing;
        return '<tr class="click" tabindex="0" data-href="#/activity/' + esc(a.id) + '/overview"><td><div class="who">' + av(a.name, '#4f46e5') + '<div><b>' + esc(a.name) + '</b><small>' + esc(a.venue || '') + '</small></div></div></td>'
          + '<td class="tn">' + dateText(a.date) + '</td><td>' + st(a.budget_status || '草稿') + '</td><td class="num">' + (n ? '<span class="badge hot">' + n + '</span>' : '<span class="sub">—</span>') + '</td><td style="color:var(--faint);text-align:right">' + ic('chev', 's') + '</td></tr>';
      }).join('') : '<tr><td colspan="5" class="empty">目前沒有進行中的活動</td></tr>')
      + '</tbody></table></div></div>';
  }

  /* ---------- 活動列表 ---------- */
  function actualSpend(a) {
    if (root.V2Store.isLoaded(a.id)) return D.activitySummary(a, db()).actual;
    const s = root.V2Store.summary(a.id);
    if (s && s.summary) return s.summary.actual;
    const col = App.historyTable && App.historyTable.columns.find(c => c.id === a.id);
    return col ? col.total : null;
  }
  function stateBadge(a) {
    const stage = D.closeStage(a);
    if (a.closed_at) return st('已結案');
    if (a.locked_at) return st('核銷中', stage === '已核銷' ? '核銷後待回覆會計' : stage === '已回覆會計' ? '核銷後待結清' : '待結案');
    return st('籌備中', '進行中');
  }
  function pageActivities() {
    const list = db().activities.filter(alive).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return '<div class="phead"><div><h1>活動</h1><div class="meta"><span>所有活動（含往年）。新增活動不必再去改試算表。</span></div></div><button class="btn" type="button" data-act="drawer" data-type="newAct">' + ic('plus', 's') + '新增活動</button></div>'
      + '<div class="panel"><div class="tbl"><table><thead><tr><th>活動</th><th>日期</th><th class="num">預估人數</th><th>預算</th><th>狀態</th><th class="num">實際支出</th></tr></thead><tbody>'
      + (list.length ? list.map(a => '<tr class="click" tabindex="0" data-href="#/activity/' + esc(a.id) + '/overview"><td><div class="who">' + av(a.name, '#4f46e5') + '<div><b>' + esc(a.name) + '</b><small>' + esc(a.venue || '') + '</small></div></div></td>'
        + '<td class="tn">' + dateText(a.date) + '</td><td class="num">' + (a.est_headcount || '—') + '</td><td>' + st(a.budget_status || '草稿') + '</td><td>' + stateBadge(a) + '</td><td class="num">' + money(actualSpend(a)) + '</td></tr>').join('')
        : '<tr><td colspan="6" class="empty">還沒有活動，按右上「新增活動」開始。</td></tr>')
      + '</tbody></table></div></div>';
  }

  /* ---------- 廠商 ---------- */
  function pageVendors() {
    const ui = App.ui;
    const list = db().vendors.filter(alive);
    return '<div class="phead"><div><h1>廠商</h1><div class="meta"><span>跨活動共用的廠商名冊，匯款文件和報價單都掛在這裡。</span></div></div><button class="btn" type="button" data-act="drawer" data-type="newVendor">' + ic('plus', 's') + '新增廠商</button></div>'
      + '<div class="panel"><div class="tbl"><table><thead><tr><th>廠商</th><th>統一編號</th><th>匯款資料</th><th>報價單</th><th class="num">往來品項</th></tr></thead><tbody>'
      + (list.length ? list.map(v => '<tr class="click ' + (ui.drawer && ui.drawer.id === v.id ? 'sel' : '') + '" tabindex="0" data-act="drawer" data-type="vendor" data-id="' + esc(v.id) + '"><td><div class="who">' + av(v.short_name || v.name, colorOf(v.id)) + '<div><b>' + esc(v.short_name || v.name) + '</b>' + (v.short_name && v.short_name !== v.name ? '<small>' + esc(v.name) + '</small>' : '') + '</div></div></td>'
        + '<td class="tn">' + esc(v.tax_id || '—') + '</td><td>' + st(v.remit_status || '未登記', v.remit_status === '使用中' ? '使用中' : v.remit_status || '零售／未登記') + '</td>'
        + '<td>' + (v.quote_doc_url ? '<span class="who" style="gap:6px;color:var(--muted)">' + ic('file', 's') + '有報價單</span>' : '<span class="sub">—</span>') + '</td>'
        + '<td class="num">' + db().budget_lines.filter(l => alive(l) && l.vendor_id === v.id).length + '</td></tr>').join('')
        : '<tr><td colspan="5" class="empty">還沒有廠商</td></tr>')
      + '</tbody></table></div></div>';
  }

  /* ---------- 收件匣 ---------- */
  function catSelect(id, current, attrs) {
    const list = categories();
    const opts = (current && list.indexOf(current) === -1 ? [current] : []).concat(list);
    return '<select ' + (attrs || '') + ' id="' + id + '">' + (current ? '' : '<option value="">請選擇</option>') + opts.map(c => '<option ' + (c === current ? 'selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>';
  }
  function pageInbox() {
    const list = db().expenses.filter(e => alive(e) && e.status === '待確認').sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    return '<div class="phead"><div><h1>收件匣</h1><div class="meta"><span>ChatGPT 記進來的支出先放這裡，系統先建議預算項目，你確認後才算數。</span></div></div>'
      + (list.length ? '<button class="btn" type="button" data-act="confirm-all">' + ic('check', 's') + '全部照建議確認</button>' : '') + '</div>'
      + '<div class="panel"><div class="tbl"><table><thead><tr><th>項目</th><th>活動</th><th>日期</th><th>支付方式</th><th class="num">金額</th><th>預算項目（建議）</th><th></th></tr></thead><tbody>'
      + (list.length ? list.map(e => {
        const a = actOf(e.activity_id);
        return '<tr><td><div class="who"><span class="av" style="background:var(--brand-soft);color:var(--brand)">' + ic('sparkle', 's') + '</span><div><b>' + esc(e.item) + '</b><small>來源 ' + esc(e.source || 'ChatGPT') + (isDup(e) ? ' · <span class="delta-up">可能重複</span>' : '') + '</small></div></div></td>'
          + '<td>' + (a ? '<a class="btn link" href="#/activity/' + esc(a.id) + '/expenses?status=待確認">' + esc(a.name) + '</a>' : esc(e.activity_id)) + '</td><td class="tn">' + dateText(e.date) + '</td><td>' + esc(e.method || '—') + '</td><td class="num">' + money(e.amount) + '</td>'
          + '<td>' + catSelect('cat_' + e.id, e.category || e.suggested_category, 'class="inline" aria-label="預算項目" data-cat="' + esc(e.id) + '"') + '</td>'
          + '<td style="text-align:right;white-space:nowrap"><button class="btn sec sm" type="button" data-act="delete-exp" data-id="' + esc(e.id) + '" style="color:var(--r)">刪除</button> <button class="btn sm" type="button" data-act="confirm-exp" data-id="' + esc(e.id) + '">確認</button></td></tr>';
      }).join('') : '<tr><td colspan="7" class="empty">' + ic('check') + '<div style="margin-top:6px">都確認完了</div></td></tr>')
      + '</tbody></table></div></div>';
  }

  /* ---------- 歷史分析 ---------- */
  function searchBox() {
    return '<div class="searchbox">' + ic('search', 's') + '<input id="q2" type="search" value="' + esc(App.ui.q || '') + '" placeholder="搜尋所有活動（含往年）的廠商、品項、申請單…" aria-label="搜尋" autocomplete="off"></div>';
  }
  function pageHistory() {
    const t = App.historyTable;
    let body;
    if (App.historyError) body = '<div class="pbody"><div class="note r">' + esc(App.historyError) + '</div></div>';
    else if (!t) body = '<div class="loading">讀取歷史資料中…</div>';
    else if (!t.columns.length) body = '<div class="empty">還沒有已確認的支出可以比較</div>';
    else {
      body = '<div class="tbl"><table><thead><tr><th>預算項目</th>' + t.columns.map(c => '<th class="num"><a class="btn link" href="#/activity/' + esc(c.id) + '/overview">' + esc(c.name) + '</a><div class="sub" style="font-weight:400">' + (isClosedId(c.id) ? '已結案' : '進行中') + '</div></th>').join('') + '</tr></thead><tbody>'
        + t.categories.map(cat => '<tr><td>' + esc(cat) + '</td>' + t.columns.map(c => '<td class="num">' + (D.num(c.totals[cat]) ? money(c.totals[cat]) : '<span class="sub">—</span>') + '</td>').join('') + '</tr>').join('')
        + '<tr><td><b>合計</b></td>' + t.columns.map(c => '<td class="num"><b>' + money(c.total) + '</b></td>').join('') + '</tr>'
        + '<tr><td>人數</td>' + t.columns.map(c => '<td class="num">' + (c.headcount || '—') + '</td>').join('') + '</tr>'
        + '<tr><td>每人平均</td>' + t.columns.map(c => '<td class="num">' + (c.perHead != null ? money(c.perHead) : '—') + '</td>').join('') + '</tr>'
        + '</tbody></table></div>';
    }
    const drinks = t && t.drinks.length ? (() => {
      const ids = Array.from(new Set([].concat.apply([], t.drinks.map(d => Object.keys(d.liters)))));
      const cols = ids.map(id => ({ id, name: (actOf(id) || {}).name || id, date: (actOf(id) || {}).date || '' })).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      return '<div class="panel"><div class="phd"><div><h2>飲品用量</h2><div class="sub">實際喝掉的公升數，規劃下一場的採購量時參考</div></div></div><div class="tbl"><table><thead><tr><th>類別</th>'
        + cols.map(c => '<th class="num">' + esc(c.name) + '</th>').join('') + '</tr></thead><tbody>'
        + t.drinks.map(d => '<tr><td>' + esc(d.category) + '</td>' + cols.map(c => '<td class="num">' + (d.liters[c.id] != null ? d.liters[c.id] + ' L' : '<span class="sub">—</span>') + '</td>').join('') + '</tr>').join('')
        + '</tbody></table></div></div>';
    })() : '';
    return '<div><h1>歷史分析</h1><div class="meta"><span>往年的活動都在同一個地方，不用再翻舊試算表。點活動名稱就是當年完整的帳。</span></div></div>'
      + searchBox()
      + '<div class="panel"><div class="phd"><div><h2>各場活動花費比較</h2><div class="sub">依預算項目的實際支出（已確認的支出）</div></div></div>' + body + '</div>' + drinks;
  }
  const isClosedId = id => { const a = actOf(id); return !!(a && a.closed_at); };

  /* ---------- 搜尋 ---------- */
  function searchResults() {
    const s = App.search || {};
    const q = (App.ui.q || '').trim();
    if (!q) return '<p class="sub">輸入關鍵字，例如「飯店」「識別證」「訂金」。</p>';
    if (s.error) return '<div class="note r">' + esc(s.error) + '</div>';
    if (s.q !== q || s.loading) return '<p class="sub">搜尋中…</p>';
    const groups = { activities: [], budget_lines: [], payment_requests: [], expenses: [], vendors: [], prizes: [] };
    (s.results || []).forEach(r => { if (groups[r.table]) groups[r.table].push(r.row); });
    const aname = id => (actOf(id) || {}).name || id;
    const g = (title, rows) => rows.length ? '<div class="panel"><div class="phd"><h2>' + title + ' <span class="sub tn">' + rows.length + '</span></h2></div><div class="links" style="border:0;border-radius:0">' + rows.join('') + '</div></div>' : '';
    const out = g('活動', groups.activities.map(a => '<button type="button" data-href="#/activity/' + esc(a.id) + '/overview"><span><b>' + esc(a.name) + '</b> <span>' + dateText(a.date) + ' · ' + esc(a.venue || '') + '</span></span>' + stateBadge(a) + '</button>'))
      + g('廠商品項', groups.budget_lines.map(l => '<button type="button" data-act="open-line" data-id="' + esc(l.id) + '" data-activity="' + esc(l.activity_id) + '"><span><b>' + esc(l.item) + '</b> <span>' + esc(aname(l.activity_id)) + ' · ' + esc(vendorName(l.vendor_id) || '自行採購') + '</span></span><span class="tn">' + esc(l.category || '') + '</span></button>'))
      + g('款項申請單', groups.payment_requests.map(r => '<button type="button" data-act="open-req" data-id="' + esc(r.id) + '" data-activity="' + esc(r.activity_id) + '"><span><b>' + esc(payeeOf(r)) + '</b> ' + esc(r.stage || '') + ' <span>' + esc(aname(r.activity_id)) + (r.request_no ? ' · ' + esc(r.request_no) : '') + '</span></span><span class="tn">NT$ ' + money(r.amount) + '</span></button>'))
      + g('支出', groups.expenses.map(e => '<button type="button" data-act="open-exp" data-id="' + esc(e.id) + '" data-activity="' + esc(e.activity_id) + '"><span><b>' + esc(e.item) + '</b> <span>' + esc(aname(e.activity_id)) + ' · ' + dateText(e.date) + '</span></span><span class="tn">NT$ ' + money(e.amount) + '</span></button>'))
      + g('廠商', groups.vendors.map(v => '<button type="button" data-act="open-vendor" data-id="' + esc(v.id) + '"><span><b>' + esc(v.short_name || v.name) + '</b> <span>' + esc(v.tax_id || '') + '</span></span><span>廠商</span></button>'))
      + g('獎項', groups.prizes.map(p => '<button type="button" data-href="#/activity/' + esc(p.activity_id) + '/plan?view=獎項"><span><b>' + esc(p.name) + '</b> <span>' + esc(aname(p.activity_id)) + ' · ' + esc(p.purpose || '') + '</span></span><span class="tn">NT$ ' + money(p.budget_amount) + '</span></button>'));
    return out || '<p class="sub">找不到符合的資料。</p>';
  }
  function pageSearch() {
    return '<div><h1>搜尋</h1><div class="meta"><span>一次搜所有活動，包括已結案的往年活動。</span></div></div>' + searchBox() + '<div id="sr" style="display:flex;flex-direction:column;gap:16px">' + searchResults() + '</div>';
  }

  /* ---------- 活動明細 ---------- */
  const TABS = [['overview', '總覽'], ['budget', '預算與廠商'], ['plan', '規劃'], ['requests', '款項申請'], ['expenses', '支出'], ['close', '核銷']];
  function pageActivity() {
    const ui = App.ui;
    const a = actOf(ui.actId);
    if (!a) return '<div class="crumb"><a class="btn link" href="#/activities">活動</a></div><div class="empty">' + (App.loadingActivity ? '讀取中…' : '找不到這場活動') + '</div>';
    if (!root.V2Store.isLoaded(a.id)) return '<div class="crumb"><a class="btn link" href="#/activities" style="color:var(--muted)">活動</a>' + ic('chev', 's') + '<span>' + esc(a.name) + '</span></div><div class="loading">' + (App.activityError ? '<div class="note r">' + esc(App.activityError) + '</div>' : '讀取這場活動的帳…') + '</div>';
    const s = D.activitySummary(a, db());
    const c = D.todoCounts(db(), a.id);
    const tabCount = { requests: c.draftRequest, expenses: c.confirm + c.duplicate + c.receipt, budget: c.invoice, close: a.locked_at && !a.closed_at ? 1 : 0 };
    const status = a.budget_status || '草稿';
    const next = status === '草稿' ? ['已提報', '提報預算'] : status === '已提報' ? ['已核准', '標記已核准'] : null;
    const stage = D.closeStage(a);
    const approvedLines = linesOf(a.id).filter(l => l.approved_amount != null).length;
    const pct = v => Math.max(0, Math.min(100, v || 0));
    const body = { overview: tabOverview, budget: tabBudget, plan: tabPlan, requests: tabRequests, expenses: tabExpenses, close: tabClose }[ui.tab] || tabOverview;
    return '<div class="crumb"><a class="btn link" href="#/activities" style="color:var(--muted)">活動</a>' + ic('chev', 's') + '<span>' + esc(a.name) + '</span></div>'
      + '<div class="phead"><div><h1>' + esc(a.name) + ' ' + (a.closed_at ? '<span class="st g" style="vertical-align:middle">已結案</span>' : a.locked_at ? '<span class="st a" style="vertical-align:middle">已核銷，待' + (stage === '已核銷' ? '回覆會計' : stage === '已回覆會計' ? '錢結清' : '結案') + '</span>' : '') + '</h1>'
      + '<div class="meta"><span>' + ic('cal', 's') + (dateText(a.date) || '日期未定') + '</span><span>' + ic('pin', 's') + esc(a.venue || '地點未定') + '</span><span>' + ic('people', 's') + '預估 ' + (a.est_headcount || '—') + ' 人' + (a.actual_headcount ? '（實到 ' + a.actual_headcount + '）' : '') + '</span>'
      + (closed(a) ? '' : '<span><button class="btn link" type="button" data-act="drawer" data-type="editAct" data-id="' + esc(a.id) + '">' + ic('edit', 's') + '編輯</button></span>') + '</div></div>'
      + '<div style="display:flex;flex-direction:column;gap:12px;align-items:flex-end">'
      + '<div class="acts" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec" type="button" data-act="drawer" data-type="proposal" data-id="' + esc(a.id) + '">' + ic('file', 's') + '簽呈文字</button>'
      + (next && !locked(a) ? '<button class="btn" type="button" data-act="budget-next" data-status="' + next[0] + '">' + next[1] + '</button>' : '') + '</div>'
      + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="sub">預算</span>' + stepper(D.BUDGET_STATUSES, status) + '</div></div></div>'
      + (a.closed_at ? '<div class="banner g">' + ic('lock', 's') + '這場活動已結案，只能看、不能改。</div>' : a.locked_at ? '<div class="banner g">' + ic('lock', 's') + '這場活動已完成核銷並鎖定，支出與品項只能看、不能改。</div>' : '')
      + '<div class="kpis">'
      + '<div class="kpi"><span class="l">簽呈預算</span><span class="v tn"><small>NT$</small>' + money(s.approved) + '</span><span class="f">' + (s.approved != null ? approvedLines + ' 個品項' + (a.budget_approved_at ? ' · ' + shortDate(a.budget_approved_at) + ' 核准' : '') : '還沒核准') + '</span></div>'
      + '<div class="kpi"><span class="l">最新報價合計</span><span class="v tn"><small>NT$</small>' + money(s.latest) + '</span><span class="f">' + (s.latestDelta == null ? s.quotedLines + '／' + s.lineCount + ' 個品項已報價' : s.latestDelta > 0 ? '<span class="delta-up">比簽呈 +' + money(s.latestDelta) + '</span>' : s.latestDelta < 0 ? '<span class="delta-down">比簽呈 −' + money(-s.latestDelta) + '</span>' : '跟簽呈一樣') + '</span></div>'
      + '<div class="kpi"><span class="l">已申請</span><span class="v tn"><small>NT$</small>' + money(s.submitted) + '</span><span class="f"><span class="meter"><i style="width:' + pct(s.submittedPct) + '%"></i></span>佔預算 ' + (s.submittedPct == null ? '—' : s.submittedPct + '%') + '</span></div>'
      + '<div class="kpi"><span class="l">公司已匯款</span><span class="v tn"><small>NT$</small>' + money(s.paid) + '</span><span class="f"><span class="meter"><i style="width:' + pct(s.paidPct) + '%"></i></span>佔預算 ' + (s.paidPct == null ? '—' : s.paidPct + '%') + '</span></div>'
      + '<div class="kpi"><span class="l">實際支出</span><span class="v tn"><small>NT$</small>' + money(s.actual) + '</span><span class="f">' + s.actualCount + ' 筆已確認</span></div>'
      + '</div>'
      + '<div class="tabs" role="tablist">' + TABS.map(([id, l]) => '<a role="tab" class="tab ' + (ui.tab === id ? 'cur' : '') + '" aria-selected="' + (ui.tab === id) + '" href="#/activity/' + esc(a.id) + '/' + id + '">' + l + (tabCount[id] ? '<span class="badge hot tn">' + tabCount[id] + '</span>' : '') + '</a>').join('') + '</div>'
      + body(a);
  }

  function tabOverview(a) {
    const rows = D.categoryComparison(a, db());
    const logs = db().activity_log.filter(g => g.activity_id === a.id).sort((x, y) => String(y.at || '').localeCompare(String(x.at || ''))).slice(0, 8);
    return todoCards(D.todoCounts(db(), a.id), a.id)
      + '<div class="cols"><div class="panel"><div class="phd"><div><h2>預算與最新報價</h2><div class="sub">依預算項目彙總</div></div><a class="btn sec sm" href="#/activity/' + esc(a.id) + '/budget">看全部品項</a></div>'
      + '<div class="tbl"><table><thead><tr><th>預算項目</th><th class="num">簽呈預算</th><th class="num">最新報價</th><th class="num">差額</th></tr></thead><tbody>'
      + (rows.length ? rows.map(r => '<tr><td>' + esc(r.category) + '</td><td class="num">' + (r.approved == null ? '<span class="sub">—</span>' : money(r.approved)) + '</td><td class="num">' + (r.latest == null ? '<span class="sub">—</span>' : money(r.latest)) + '</td><td class="num">' + (r.latest == null ? st('待報價') : r.delta == null ? '<span class="sub">—</span>' : deltaText(r.delta)) + '</td></tr>').join('')
        : '<tr><td colspan="4" class="empty">還沒有預算品項</td></tr>')
      + '</tbody></table></div></div>'
      + '<div class="panel"><div class="phd"><h2>最近動態</h2></div><div class="pbody"><div class="feed">' + (logs.length ? logs.map(g => '<div><i></i><span><p>' + esc(g.text) + '</p><small>' + shortDate(g.at) + '</small></span></div>').join('') : '<p class="sub">還沒有動態</p>') + '</div></div></div></div>'
      + changesPanel(a);
  }
  function changesPanel(a) {
    if (!a.budget_approved_at) return '';
    const list = D.changesSinceApproval(a, db());
    const s = D.activitySummary(a, db());
    const d = s.latestDelta || 0;
    return '<div class="panel"><div class="phd"><div><h2>簽呈核准後的變動</h2><div class="sub">高層改方向、廠商改報價，每一次都留紀錄，不會蓋掉前一版</div></div><button class="btn sec sm" type="button" disabled>' + ic('file', 's') + '下載變更說明（下一步做）</button></div>'
      + '<div class="tbl"><table><thead><tr><th>品項</th><th class="num">簽呈時</th><th class="num">現在</th><th class="num">改過</th><th>最後一次原因</th></tr></thead><tbody>'
      + (list.length ? list.map(ch => {
        const all = D.quotesOf(ch.line.id, db().quotes);
        const last = all[all.length - 1] || {};
        return '<tr class="click" tabindex="0" data-act="drawer" data-type="line" data-id="' + esc(ch.line.id) + '"><td><b>' + esc(ch.line.item) + '</b>' + (ch.added ? ' <span class="tag">簽呈後新增</span>' : '') + '</td><td class="num">' + (ch.added ? '<span class="sub">—</span>' : money(ch.approved)) + '</td><td class="num">' + money(ch.latest) + '</td><td class="num">' + all.length + ' 版</td><td class="sub">' + esc(last.reason || '') + (last.quoted_at ? ' · ' + shortDate(last.quoted_at) : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="5" class="empty">核准後還沒有變動</td></tr>')
      + '</tbody></table></div>'
      + '<div class="pbody" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid var(--line)"><span class="sub">簽呈 NT$ ' + money(s.approved) + ' → 現在 NT$ ' + money(s.latest) + '</span><b class="tn ' + (d > 0 ? 'delta-up' : d < 0 ? 'delta-down' : '') + '">' + (d > 0 ? '+' : d < 0 ? '−' : '') + money(Math.abs(d)) + '</b></div></div>';
  }

  function tabBudget(a) {
    const ui = App.ui;
    const list = linesOf(a.id);
    return '<div class="panel"><div class="phd"><div><h2>廠商品項</h2><div class="sub">一列一個品項；訂金、尾款各開一張申請單掛在同一列，幾期都行。點一列在右邊改報價、標記發票、開申請單。</div></div>' + (locked(a) ? '' : '<button class="btn" type="button" data-act="drawer" data-type="newLine">' + ic('plus', 's') + '新增品項</button>') + '</div>'
      + '<div class="tbl"><table><thead><tr><th>廠商／品項</th><th>預算項目</th><th class="num">簽呈預算</th><th class="num">最新報價</th><th>付款</th><th>狀態</th></tr></thead><tbody>'
      + (list.length ? list.map(l => {
        const vname = vendorName(l.vendor_id) || '自行採購';
        const p = payInfo(l);
        const qn = D.quotesOf(l.id, db().quotes).length;
        const added = isAddedAfterApproval(l, a);
        return '<tr class="click ' + (ui.drawer && ui.drawer.id === l.id ? 'sel' : '') + '" tabindex="0" data-act="drawer" data-type="line" data-id="' + esc(l.id) + '"><td><div class="who">' + av(vname, colorOf(l.vendor_id || l.id)) + '<div><b>' + esc(l.item) + '</b>' + (added ? ' <span class="tag">簽呈後新增</span>' : '') + '<small>' + esc(vname) + '</small></div></div></td>'
          + '<td>' + esc(l.category || '—') + '</td><td class="num">' + (l.approved_amount == null ? '<span class="sub">—</span>' : money(l.approved_amount)) + '</td>'
          + '<td class="num">' + (p.quote == null ? '<span class="sub">—</span>' : money(p.quote)) + (qn > 1 ? '<div class="sub">第 ' + qn + ' 版</div>' : '') + '</td>'
          + '<td>' + (p.requests.length ? '<div class="pay"><span class="meter"><i style="width:' + p.pct + '%"></i></span><small>' + p.requests.map(r => esc(r.stage) + (r.status === '公司已匯款' ? ' 已匯' : r.status === '已申請' ? ' 申請中' : ' 待送')).join('、') + '</small></div>' : '<span class="sub">—</span>') + '</td>'
          + '<td>' + st(lineStage(l)) + (p.requests.some(r => r.status === '待申請') ? ' <span class="tag">申請單待送出</span>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="empty">還沒有預算品項' + (locked(a) ? '' : '，按右上「新增品項」開始。') + '</td></tr>')
      + '</tbody></table></div></div>';
  }

  function tabPlan(a) {
    const ui = App.ui;
    const view = ['流程表', '獎項', '飲品'].indexOf(ui.planView) === -1 ? '流程表' : ui.planView;
    const rows = t => db()[t].filter(r => alive(r) && r.activity_id === a.id);
    const prizes = rows('prizes');
    const seg = '<div class="toolbar"><div class="seg">' + ['流程表', '獎項', '飲品'].map(v => '<button type="button" class="' + (view === v ? 'cur' : '') + '" data-act="plan-view" data-view="' + v + '">' + v + '<span class="c tn">' + (v === '流程表' ? rows('rundown_segments').length : v === '獎項' ? prizes.length : rows('drink_records').length + rows('drink_plans').length) + '</span></button>').join('') + '</div><span class="sub">目前只能看，編輯下一步做</span></div>';
    let body = '';
    if (view === '流程表') {
      const config = rows('rundown_config')[0] || {};
      const times = D.rundownTimes(rows('rundown_segments'), config.formal_start);
      const prizeName = id => (prizes.find(p => p.id === id) || {}).name || id;
      body = '<div class="tbl"><table><thead><tr><th>時間</th><th class="num">分鐘</th><th>內容</th><th>階段</th><th>獎項</th><th>備註</th></tr></thead><tbody>'
        + (times.length ? times.map(t => '<tr><td class="tn">' + (t.start ? t.start + '–' + t.end : '—') + '</td><td class="num">' + esc(t.segment.duration_min || '—') + '</td><td class="wrap"><b style="font-weight:500;color:var(--ink)">' + esc(t.segment.content || '') + '</b></td><td>' + esc(t.segment.phase || '') + '</td><td class="wrap">' + esc(String(t.segment.prize_ids || '').split(/[,，、]/).filter(Boolean).map(prizeName).join('、')) + '</td><td class="wrap sub">' + esc(t.segment.note || '') + '</td></tr>').join('')
          : '<tr><td colspan="6" class="empty">還沒有流程表</td></tr>') + '</tbody></table></div>';
    } else if (view === '獎項') {
      body = '<div class="tbl"><table><thead><tr><th>用途</th><th>名稱</th><th>形式</th><th class="num">單價</th><th class="num">名額</th><th class="num">預算</th><th class="num">實際</th><th>頒獎人</th><th>狀態</th></tr></thead><tbody>'
        + (prizes.length ? prizes.map(p => '<tr><td>' + esc(p.purpose || '') + '</td><td><b style="font-weight:500;color:var(--ink)">' + esc(p.name || '') + '</b></td><td>' + esc(p.form || '') + '</td><td class="num">' + money(p.unit_amount) + '</td><td class="num">' + esc(p.slots || '—') + '</td><td class="num">' + money(p.budget_amount) + '</td><td class="num">' + money(p.actual_amount) + '</td><td>' + esc(p.presenter || '—') + '</td><td>' + (p.status ? st(p.status) : '') + '</td></tr>').join('')
          : '<tr><td colspan="9" class="empty">還沒有獎項</td></tr>') + '</tbody></table></div>';
    } else {
      const recs = rows('drink_records');
      const plans = rows('drink_plans');
      body = '<div class="tbl"><table><thead><tr><th>品項</th><th>類別</th><th class="num">容量 ml</th><th class="num">訂購</th><th class="num">喝掉</th><th class="num">剩下</th><th class="num">金額</th></tr></thead><tbody>'
        + (recs.length ? recs.map(d => '<tr><td>' + esc(d.item_name || '') + '</td><td>' + esc(d.category || '') + '</td><td class="num">' + esc(d.unit_capacity_ml || '—') + '</td><td class="num">' + esc(d.ordered_units == null ? '—' : d.ordered_units) + '</td><td class="num">' + esc(d.consumed_units == null ? '—' : d.consumed_units) + '</td><td class="num">' + esc(d.remaining_units == null ? '—' : d.remaining_units) + '</td><td class="num">' + money(d.line_amount) + '</td></tr>').join('')
          : '<tr><td colspan="7" class="empty">這場還沒有飲品實績</td></tr>') + '</tbody></table></div>'
        + '<div class="phd" style="border-top:1px solid var(--line)"><div><h2>飲品規劃</h2><div class="sub">依歷史消耗估的採購量</div></div></div>'
        + '<div class="tbl"><table><thead><tr><th>類別</th><th class="num">歷史基準（公升）</th><th class="num">安全係數</th><th class="num">規劃（公升）</th><th>調整原因</th></tr></thead><tbody>'
        + (plans.length ? plans.map(p => '<tr><td>' + esc(p.category || '') + '</td><td class="num">' + esc(p.baseline_liters == null ? '—' : p.baseline_liters) + '</td><td class="num">' + (p.safety_rate != null ? Math.round(D.num(p.safety_rate) * 100) + '%' : '—') + '</td><td class="num">' + esc(p.planned_liters == null ? '—' : p.planned_liters) + '</td><td class="wrap sub">' + esc(p.override_reason || '') + '</td></tr>').join('')
          : '<tr><td colspan="5" class="empty">還沒有飲品規劃</td></tr>') + '</tbody></table></div>';
    }
    return '<div class="panel"><div class="phd"><div><h2>規劃</h2><div class="sub">流程表、獎項、飲品收在同一場活動裡</div></div></div>' + seg + body + '</div>';
  }

  function tabRequests(a) {
    const ui = App.ui;
    const all = reqsOf(a.id);
    const list = all.filter(r => (ui.reqStatus === '全部' || r.status === ui.reqStatus) && (!ui.reqPayee || payeeOf(r) === ui.reqPayee));
    const payees = Array.from(new Set(all.map(payeeOf)));
    return '<div class="panel"><div class="phd"><div><h2>款項申請單</h2><div class="sub">一張單＝一個收款對象的一個付款階段。</div></div>' + (closed(a) ? '' : '<button class="btn" type="button" data-act="drawer" data-type="newReq">' + ic('plus', 's') + '新增申請單</button>') + '</div>'
      + '<div class="toolbar"><div class="seg">' + ['全部'].concat(D.REQUEST_STATUSES).map(s => '<button type="button" class="' + (ui.reqStatus === s ? 'cur' : '') + '" data-act="filter" data-key="status" data-value="' + s + '">' + s + '<span class="c tn">' + (s === '全部' ? all.length : all.filter(r => r.status === s).length) + '</span></button>').join('') + '</div>'
      + '<div class="chips"><span class="chip ' + (ui.reqPayee ? 'on' : '') + '">收款對象<select data-filter="payee" aria-label="收款對象"><option value="">全部</option>' + payees.map(p => '<option ' + (ui.reqPayee === p ? 'selected' : '') + '>' + esc(p) + '</option>').join('') + '</select></span>' + (ui.reqPayee ? '<button class="btn link" type="button" data-act="filter" data-key="payee" data-value="">清除</button>' : '') + '</div></div>'
      + '<div class="tbl"><table><thead><tr><th>收款對象</th><th>單號</th><th>付款階段</th><th class="num">金額</th><th>匯款期限</th><th>狀態</th></tr></thead><tbody>'
      + (list.length ? list.map(r => '<tr class="click ' + (ui.drawer && ui.drawer.id === r.id ? 'sel' : '') + '" tabindex="0" data-act="drawer" data-type="req" data-id="' + esc(r.id) + '"><td><div class="who">' + av(payeeOf(r), r.payee_vendor_id ? colorOf(r.payee_vendor_id) : '#667085') + '<b>' + esc(payeeOf(r)) + '</b></div></td>'
        + '<td class="tn sub">' + esc(r.request_no || '—') + '</td><td>' + esc(r.stage || '—') + '</td><td class="num">' + money(r.amount) + '</td><td class="tn">' + (r.due_date ? dateText(r.due_date) : '<span class="sub">—</span>') + '</td><td>' + st(r.status || '待申請') + '</td></tr>').join('')
        : '<tr><td colspan="6" class="empty">這個條件下沒有申請單</td></tr>')
      + '</tbody></table></div></div>';
  }

  function pettyCalc(a) {
    const p = D.pettySettlement(a, db().expenses);
    const noAdvance = D.num(a.petty_advance) == null;
    return '<div class="calc"><div><span>零用金暫支</span><b class="tn">' + (noAdvance ? '未填' : money(p.advance)) + '</b></div>'
      + '<div><span>− 零用金支出</span><b class="tn">' + money(p.pettyUsed) + '</b></div>'
      + '<div><span>− 負責人代墊（從零用金扣回給負責人）</span><b class="tn">' + money(p.advances) + '</b></div>'
      + '<div><span>' + (p.direction === '回沖' ? '= 要匯回公司（回沖）' : p.direction === '補請' ? '= 不夠，要向公司補請' : '= 剛好用完') + '</span><b class="tn" style="color:var(' + (p.direction === '補請' ? '--a' : '--g') + ')">' + money(p.amount) + '</b></div></div>';
  }
  function tabExpenses(a) {
    const ui = App.ui;
    const all = expsOf(a.id).sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
    const list = all.filter(e => (ui.expStatus === '全部' || e.status === ui.expStatus) && (!ui.expMethod || e.method === ui.expMethod)
      && (ui.expFlag !== 'duplicate' || isDup(e)) && (ui.expFlag !== 'receipt' || D.needsReceipt(e)));
    const flagLabel = { duplicate: '只看可能重複', receipt: '只看缺收據' }[ui.expFlag];
    return '<div class="panel"><div class="phd"><div style="display:flex;gap:12px;align-items:center"><span class="ticon b">' + ic('wallet') + '</span><div><h2>零用金結算（即時）</h2><div class="sub">每記一筆就自動重算，活動結束直接用這個數字，不用自己加減</div></div></div>'
      + (locked(a) ? '' : '<button class="btn sec sm" type="button" data-act="drawer" data-type="petty">' + (D.num(a.petty_advance) == null ? '填暫支' : '修改暫支') + '</button>') + '</div>'
      + '<div class="pbody">' + pettyCalc(a) + '</div></div>'
      + '<div class="panel"><div class="phd"><div><h2>支出明細</h2><div class="sub">同一天同金額會標「可能重複」，零用金和代墊缺收據會標出來</div></div>' + (locked(a) ? '' : '<button class="btn" type="button" data-act="drawer" data-type="newExp">' + ic('plus', 's') + '快速記一筆</button>') + '</div>'
      + '<div class="toolbar"><div class="seg">' + ['全部'].concat(D.EXPENSE_STATUSES).map(s => '<button type="button" class="' + (ui.expStatus === s ? 'cur' : '') + '" data-act="filter" data-key="status" data-value="' + s + '">' + s + '<span class="c tn">' + (s === '全部' ? all.length : all.filter(e => e.status === s).length) + '</span></button>').join('') + '</div>'
      + '<div class="chips"><span class="chip ' + (ui.expMethod ? 'on' : '') + '">支付方式<select data-filter="method" aria-label="支付方式"><option value="">全部</option>' + D.PAYMENT_METHODS.map(m => '<option ' + (ui.expMethod === m ? 'selected' : '') + '>' + m + '</option>').join('') + '</select></span>'
      + (flagLabel ? '<span class="chip on" style="padding-right:10px">' + flagLabel + '</span>' : '')
      + (ui.expMethod || flagLabel ? '<button class="btn link" type="button" data-act="filter-clear">清除</button>' : '') + '</div></div>'
      + '<div class="tbl"><table><thead><tr><th>項目</th><th>日期</th><th>預算項目</th><th>支付方式</th><th class="num">金額</th><th>狀態</th></tr></thead><tbody>'
      + (list.length ? list.map(e => '<tr class="click ' + (ui.drawer && ui.drawer.id === e.id ? 'sel' : '') + '" tabindex="0" data-act="drawer" data-type="exp" data-id="' + esc(e.id) + '"><td><div class="who"><span class="av" style="background:var(--n-bg);color:var(--muted)">' + ic(e.source === 'ChatGPT' ? 'sparkle' : 'receipt', 's') + '</span><div><b>' + esc(e.item) + '</b><small>' + esc((e.source || '網頁') + ' 記錄') + '</small></div></div></td>'
        + '<td class="tn">' + dateText(e.date) + '</td><td>' + (e.category ? esc(e.category) : '<span class="sub">建議：' + esc(e.suggested_category || '—') + '</span>') + '</td>'
        + '<td>' + esc(e.method || '—') + (e.payer ? ' <span class="sub">· ' + esc(e.payer) + '</span>' : '') + '</td><td class="num">' + money(e.amount) + '</td>'
        + '<td><span class="flags">' + st(e.status) + (isDup(e) ? st('可能重複') : '') + (D.needsReceipt(e) ? st('缺收據') : '') + '</span></td></tr>').join('')
        : '<tr><td colspan="6" class="empty">這個條件下沒有支出</td></tr>')
      + '</tbody></table></div></div>';
  }

  const CLOSE_STEPS = ['核銷', '回覆會計', '錢結清', '結案'];
  function tabClose(a) {
    const ui = App.ui;
    const stage = D.CLOSE_STAGES.indexOf(D.closeStage(a)); // 0 未開始 … 4 已結案
    const checks = D.closeChecks(a, db());
    const done = checks.filter(c => c.ok).length;
    const allOk = done === checks.length;
    const dir = a.settle_direction || D.pettySettlement(a, db().expenses).direction;
    const expected = a.locked_at ? D.num(a.settle_amount_expected) || 0 : D.pettySettlement(a, db().expenses).amount;
    const replyReq = reqsOf(a.id).find(r => r.stage === dir && (r.stage === '回沖' || r.stage === '補請'));
    const lockNote = t => '<div class="pbody sub" style="display:flex;gap:8px;align-items:center">' + ic('lock', 's') + t + '</div>';
    const dirText = dir === '回沖' ? '零用金剩 NT$ ' + money(expected) + '，要匯回公司（回沖）' : dir === '補請' ? '零用金不夠，向公司補請 NT$ ' + money(expected) : '零用金剛好用完，不用沖銷';
    const go = { confirm: 'expenses?status=待確認', category: 'expenses', petty: 'expenses', duplicate: 'expenses?flag=duplicate', receipt: 'expenses?flag=receipt', lines: 'budget', requests: 'requests' };

    const s1 = stage === 0
      ? '<div class="pbody"><div class="progress"><span class="meter"><i style="width:' + Math.round(done / checks.length * 100) + '%"></i></span><b class="tn">' + done + '／' + checks.length + '</b></div></div>'
        + '<div class="checklist">' + checks.map(c => '<div class="ck"><span class="m ' + (c.ok ? 'y' : 'no') + '">' + ic(c.ok ? 'check' : 'alert', 's') + '</span><div><b style="font-weight:500">' + esc(c.label) + '</b><small>' + esc(c.help) + '</small></div>'
          + (c.ok ? '<span class="sub">完成</span>' : '<a class="btn sec sm" href="#/activity/' + esc(a.id) + '/' + go[c.key] + '">去處理</a>') + '</div>').join('') + '</div>'
        + '<div class="df" style="justify-content:space-between;align-items:center;flex-wrap:wrap"><span class="sub">完成核銷後，待核銷支出整批改成已核銷，零用金結算金額凍結。</span><button class="btn" type="button" data-act="close-step" data-op="lock_close" ' + (allOk ? '' : 'disabled') + '>' + ic('lock', 's') + '完成核銷</button></div>'
      : '<div class="pbody" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between"><span class="st g">已完成核銷，支出已鎖定 · ' + shortDate(a.locked_at) + '</span><span class="acts" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec sm" type="button" disabled>' + ic('file', 's') + '下載結算表（下一步做）</button></span></div>';

    const s2 = stage < 1 ? lockNote('完成核銷後才能做') : '<div class="pbody" style="display:flex;flex-direction:column;gap:14px">' + pettyCalc(a)
      + '<div class="note">核銷時凍結的結算：' + esc(dirText) + '。' + (stage === 1 ? '按下面的按鈕會開一張' + (dir === '無需沖銷' ? '' : '「' + dir + '」') + '款項申請單並標記已送會計。' : '') + '</div>'
      + '<div class="links">' + (dir !== '無需沖銷' ? (replyReq ? '<button type="button" data-act="drawer" data-type="req" data-id="' + esc(replyReq.id) + '"><span><b>款項申請單（' + esc(dir) + '）</b> NT$ ' + money(replyReq.amount) + '</span>' + st(replyReq.status) + '</button>' : '<button type="button" disabled><span><b>款項申請單（' + esc(dir) + '）</b> NT$ ' + money(expected) + '</span><span>送出時產出</span></button>') : '')
      + '<button type="button" disabled><span><b>分攤表</b> 依分攤單位人數</span><span>下載分攤表（下一步做）</span></button></div></div>'
      + (stage === 1 ? '<div class="df"><button class="btn" type="button" data-act="reply-accounting">' + ic('send', 's') + '產出申請單並送會計</button></div>' : '');

    const s3 = stage < 2 ? lockNote('回覆會計後才能做') : stage === 2
      ? '<div class="pbody" style="display:flex;flex-direction:column;gap:12px"><p style="margin:0">' + (dir === '回沖' ? '把剩下的 NT$ ' + money(expected) + ' 匯回公司後，輸入實際匯出的金額，系統幫你核對。' : dir === '補請' ? '公司把 NT$ ' + money(expected) + ' 補給你後，輸入實際收到的金額，系統幫你核對。' : '不用匯款，確認金額為 0 即可。') + '</p>'
        + '<div class="grid2"><div class="field"><label for="settle_amt">' + (dir === '回沖' ? '實際匯回金額' : dir === '補請' ? '實際收到金額' : '實際金額') + '</label><input id="settle_amt" type="number" inputmode="numeric" min="0" value="' + (dir === '無需沖銷' ? 0 : '') + '" placeholder="照存摺或網銀明細輸入"></div>'
        + '<div class="field"><label for="settle_note">差額原因</label><input id="settle_note" placeholder="金額和系統算的不同時必填"></div></div>'
        + (ui.settleErr ? '<div class="note r">' + esc(ui.settleErr) + '</div>' : '') + '</div>'
        + '<div class="df"><button class="btn" type="button" data-act="settle">' + ic('bank', 's') + (dir === '回沖' ? '已匯回公司' : dir === '補請' ? '公司已補款' : '確認結清') + '</button></div>'
      : '<div class="pbody"><span class="st g">已結清 · ' + shortDate(a.settled_at) + ' · 實際 NT$ ' + money(a.settle_amount_actual) + '</span>' + (a.settle_note ? '<div class="sub" style="margin-top:6px">差額原因：' + esc(a.settle_note) + '</div>' : '') + '</div>';

    const s4 = stage < 3 ? lockNote('錢結清後才能做') : stage === 3
      ? '<div class="pbody sub">帳都對完了，按結案後這場活動只能看、不能改，會移到往年活動。</div><div class="df"><button class="btn" type="button" data-act="close-step" data-op="close">' + ic('check', 's') + '結案</button></div>'
      : '<div class="pbody"><span class="st g">已結案 · ' + shortDate(a.closed_at) + '</span></div>';

    const sec = (n, t, d, body, i) => {
      const tone = stage > i ? 'g' : stage === i ? 'b' : 'n';
      return '<div class="panel"><div class="phd"><div style="display:flex;gap:12px;align-items:center"><span class="ticon ' + tone + '">' + (tone === 'g' ? ic('check') : '<b style="font-size:15px">' + n + '</b>') + '</span><div><h2>' + t + '</h2><div class="sub">' + d + '</div></div></div></div>' + body + '</div>';
    };
    return '<div class="panel"><div class="pbody" style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between"><div><h2>活動後核銷</h2><div class="sub">核銷＝把整場活動的費用提報回公司，錢結清、結案才算真正結束。</div></div>' + stepperAt(CLOSE_STEPS, stage) + '</div></div>'
      + (stage >= 4 ? '<div class="banner g">' + ic('check', 's') + '這場活動已結案：核銷完成、已回覆會計、零用金已結清。</div>' : '')
      + sec(1, '核銷', '自動檢查全部通過後按「完成核銷」', s1, 0)
      + sec(2, '回覆會計', '依零用金結算開回沖或補請的款項申請單，連同分攤表送會計', s2, 1)
      + sec(3, '錢結清', '零用金匯回公司，或收到公司補款', s3, 2)
      + sec(4, '結案', '全部完成後結案', s4, 3);
  }

  /* ---------- 抽屜 ---------- */
  const f = (id, label, input, help) => '<div class="field"><label for="' + id + '">' + label + '</label>' + input + (help ? '<span class="help">' + help + '</span>' : '') + '</div>';
  const inp = (id, value, attrs) => '<input id="' + id + '" value="' + esc(value == null ? '' : value) + '" ' + (attrs || '') + '>';
  const sel = (id, options, current, attrs) => '<select id="' + id + '" ' + (attrs || '') + '>' + options.map(o => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return '<option value="' + esc(v) + '" ' + (String(v) === String(current == null ? '' : current) ? 'selected' : '') + '>' + esc(l) + '</option>';
  }).join('') + '</select>';
  const vendorOptions = () => [['', '自行採購（沒有廠商）']].concat(db().vendors.filter(alive).map(v => [v.id, v.short_name || v.name]));
  const closeBtn = '<button class="x" type="button" data-act="close-drawer" aria-label="關閉">' + ic('x') + '</button>';
  const todayStr = () => { const d = new Date(Date.now() + 8 * 3600 * 1000); return d.toISOString().slice(0, 10); };

  function drawer() {
    const d = App.ui.drawer;
    if (!d) return '';
    const a = actOf(App.ui.actId);
    let head = '', body = '', foot = '';
    const form = (kind, title, fields, btn, action, extraFoot) => {
      head = '<div class="row1"><div><div class="kind">' + kind + '</div><h2>' + title + '</h2></div>' + closeBtn + '</div>';
      body = fields + (d.error ? '<div class="note r">' + esc(d.error) + '</div>' : '');
      foot = (extraFoot || '') + '<button class="btn sec" type="button" data-act="close-drawer">取消</button><button class="btn" type="button" data-act="' + action + '"' + (d.id ? ' data-id="' + esc(d.id) + '"' : '') + '>' + btn + '</button>';
    };

    if (d.type === 'line' && !d.edit) {
      const l = db().budget_lines.find(x => x.id === d.id);
      if (!l) return '';
      const la = actOf(l.activity_id);
      const vname = vendorName(l.vendor_id) || '自行採購';
      const s = lineStage(l);
      const p = payInfo(l);
      const qs = D.quotesOf(l.id, db().quotes);
      const pending = p.requests.find(r => r.status === '待申請');
      const added = isAddedAfterApproval(l, la);
      const lockedLine = locked(la);
      const hist = App.historyTable ? App.historyTable.columns.filter(c => c.id !== l.activity_id && D.num(c.totals[l.category])) : null;
      head = '<div class="row1"><div><div class="kind">預算品項' + (added ? ' · 簽呈後新增' : '') + '</div><h2>' + esc(l.item) + '</h2><div class="sub">' + esc(vname) + ' · ' + esc(l.category || '未分類') + ' · ' + esc(la ? la.name : '') + '</div></div>' + closeBtn + '</div>' + stepper(D.LINE_STAGES, s);
      body = '<div class="dsec"><div class="sechead"><h3>金額</h3>' + (lockedLine ? '' : '<button class="btn link" type="button" data-act="drawer-edit">' + ic('edit', 's') + '編輯品項</button>') + '</div><dl>'
        + '<dt>簽呈預算</dt><dd class="tn">' + (l.approved_amount != null ? 'NT$ ' + money(l.approved_amount) : added ? '簽呈後新增' : '—') + '</dd>'
        + '<dt>最新報價</dt><dd class="tn">' + (p.quote == null ? '—' : 'NT$ ' + money(p.quote) + (qs.length > 1 ? '（第 ' + qs.length + ' 版）' : '')) + '</dd>'
        + '<dt>比簽呈</dt><dd class="tn">' + (p.quote == null || l.approved_amount == null ? '—' : deltaText(p.quote - D.num(l.approved_amount))) + '</dd>'
        + (l.unit_price != null || l.qty != null ? '<dt>單價 × 數量</dt><dd class="tn">' + money(l.unit_price) + ' × ' + esc(l.qty == null ? '—' : l.qty) + '</dd>' : '')
        + (l.payment_terms ? '<dt>付款條件</dt><dd>' + esc(l.payment_terms) + '</dd>' : '')
        + '<dt>發票</dt><dd>' + (l.invoice_received_at ? dateText(l.invoice_received_at) + ' 收到' : '還沒到') + '</dd>'
        + (l.note ? '<dt>備註</dt><dd>' + esc(l.note) + '</dd>' : '') + '</dl></div>'
        + '<div class="dsec"><h3>付款（訂金、尾款分開記）</h3>'
        + (p.total == null ? '<span class="sub">先有報價才能排付款</span>' : '<div class="pay" style="margin-bottom:10px"><span class="meter"><i style="width:' + p.pct + '%"></i></span><small>已付 NT$ ' + money(p.paid) + '／報價 NT$ ' + money(p.total) + ' · 還沒排進申請單 NT$ ' + money(p.remaining) + '</small></div>')
        + (p.requests.length ? '<div class="links">' + p.requests.map(r => '<button type="button" data-act="drawer" data-type="req" data-id="' + esc(r.id) + '"><span><b>' + esc(r.stage) + '</b> NT$ ' + money(r.amount) + ' <span>' + esc(r.request_no || '') + '</span></span>' + st(r.status) + '</button>').join('') + '</div>' : '')
        + (!closed(la) && p.total != null && p.remaining > 0 ? '<div class="inst" style="margin-top:10px">' + sel('ni_stage', ['訂金', '尾款', '全額', '追加'], p.requests.length ? '尾款' : '訂金', 'aria-label="付款階段"') + '<input id="ni_amt" type="number" inputmode="numeric" min="1" value="' + p.remaining + '" aria-label="金額"><button class="btn sec" type="button" data-act="add-installment" data-id="' + esc(l.id) + '">加一期</button></div>' : '')
        + '</div>'
        + '<div class="dsec"><h3>報價版本</h3><div class="feed">' + (qs.length ? qs.map((q, i) => ({ q, i })).reverse().map(({ q, i }) => '<div><i></i><span><p><b class="tn">v' + (i + 1) + ' · NT$ ' + money(q.amount) + '</b>' + (q.reason ? ' · ' + esc(q.reason) : '') + '</p><small>' + shortDate(q.quoted_at) + (i === qs.length - 1 ? ' · 目前這版' : '') + '</small></span></div>').join('') : '<p class="sub">還沒有報價</p>') + '</div>'
        + (lockedLine ? '' : '<div class="field" style="margin-top:6px"><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="q_amt" type="number" inputmode="numeric" min="0" value="' + (p.quote == null ? '' : p.quote) + '" placeholder="新報價" style="flex:1;min-width:110px" aria-label="新報價"><input id="q_reason" placeholder="為什麼改？例：高層改成 34 桌" style="flex:2;min-width:160px" aria-label="改報價原因"><button class="btn sec" type="button" data-act="add-quote" data-id="' + esc(l.id) + '">存成新版</button></div><span class="help">舊版不會被蓋掉' + (la && la.budget_approved_at ? '；簽呈核准後改價要寫原因，會列在總覽' : '') + '</span></div>')
        + '</div>'
        + '<div class="dsec"><h3>以前的活動（同預算項目）</h3>' + (hist == null ? '<span class="sub">讀取中…</span>' : hist.length ? '<div class="links">' + hist.map(c => '<button type="button" data-href="#/activity/' + esc(c.id) + '/budget"><span><b>' + esc(c.name) + '</b> <span>' + esc(l.category) + ' 實際支出</span></span><span class="tn">NT$ ' + money(c.totals[l.category]) + '</span></button>').join('') + '</div>' : '<span class="sub">以前沒有同預算項目的支出</span>') + '</div>'
        + (l.vendor_id ? '<div class="dsec"><h3>關聯</h3><div class="links"><button type="button" data-act="open-vendor" data-id="' + esc(l.vendor_id) + '"><span class="who">' + av(vname, colorOf(l.vendor_id)) + '<b>' + esc(vname) + '</b></span><span>廠商</span></button></div></div>' : '')
        + (d.error ? '<div class="note r">' + esc(d.error) + '</div>' : '');
      if (!closed(la)) {
        foot = pending ? '<button class="btn" type="button" data-act="drawer" data-type="req" data-id="' + esc(pending.id) + '">' + ic('send', 's') + '去送出' + esc(pending.stage) + '申請單</button>'
          : !l.invoice_received_at && p.quote != null && !lockedLine ? '<button class="btn" type="button" data-act="invoice" data-id="' + esc(l.id) + '">' + ic('receipt', 's') + '發票到了</button>'
            : l.invoice_received_at && p.remaining > 0 ? '<button class="btn" type="button" data-act="make-request" data-id="' + esc(l.id) + '">' + ic('send', 's') + '開' + (p.requests.length ? '尾款' : '全額') + '申請單 NT$ ' + money(p.remaining) + '</button>'
              : s === '待報價' ? '<span class="sub" style="margin-right:auto;align-self:center">先填報價，才能往下走</span>' : '';
      }
    }
    if ((d.type === 'line' && d.edit) || d.type === 'newLine') {
      const l = d.type === 'line' ? db().budget_lines.find(x => x.id === d.id) || {} : {};
      const isNew = d.type === 'newLine';
      form(isNew ? '預算品項' : '編輯品項', isNew ? '新增預算品項' : esc(l.item),
        f('nl_cat', '預算項目', catSelect('nl_cat', l.category || categories()[0]))
        + f('nl_vendor', '廠商', sel('nl_vendor', vendorOptions(), l.vendor_id || ''), '第一次合作的廠商可以先到「廠商」頁新增')
        + f('nl_item', '品項', inp('nl_item', l.item, 'placeholder="例：舞台布置"'))
        + '<div class="grid2">' + f('nl_price', '單價（含服務費）', inp('nl_price', l.unit_price, 'type="number" inputmode="numeric" min="0"')) + f('nl_qty', '數量', inp('nl_qty', l.qty, 'type="number" inputmode="decimal" min="0"')) + '</div>'
        + (isNew ? f('nl_quote', '報價金額', inp('nl_quote', '', 'type="number" inputmode="numeric" min="0" placeholder="還沒報價可以先空白"'), a && a.budget_approved_at ? '預算已核准，這個品項會標成「簽呈後新增」' : '會存成第一版報價') : '')
        + f('nl_terms', '付款條件', inp('nl_terms', l.payment_terms, 'placeholder="例：訂金 30%，餘款活動後付清"'))
        + f('nl_note', '備註', '<textarea id="nl_note">' + esc(l.note || '') + '</textarea>'),
        isNew ? '加入預算' : '儲存', isNew ? 'create-line' : 'save-line',
        isNew ? '' : '<button class="btn sec" type="button" data-act="delete-line" data-id="' + esc(l.id) + '" style="margin-right:auto;color:var(--r)">刪除品項</button>');
    }

    if (d.type === 'req' && !d.edit) {
      const r = db().payment_requests.find(x => x.id === d.id);
      if (!r) return '';
      const ra = actOf(r.activity_id);
      const links = db().request_lines.filter(rl => alive(rl) && rl.request_id === r.id);
      const exps = db().expenses.filter(e => alive(e) && e.request_id === r.id);
      head = '<div class="row1"><div><div class="kind">款項申請單 · ' + esc(r.request_no || '尚未送出') + '</div><h2>' + esc(payeeOf(r)) + '</h2><div class="sub">' + esc(r.stage || '') + ' · 匯款期限 ' + (r.due_date ? dateText(r.due_date) : '未填') + '</div></div>' + closeBtn + '</div><div class="amt tn">NT$ ' + money(r.amount) + '</div>' + stepper(D.REQUEST_STATUSES, r.status || '待申請');
      body = '<div class="dsec"><div class="sechead"><h3>明細</h3>' + (!closed(ra) && r.status === '待申請' ? '<button class="btn link" type="button" data-act="drawer-edit">' + ic('edit', 's') + '編輯申請單</button>' : '') + '</div><dl>'
        + '<dt>收款對象</dt><dd>' + esc(payeeOf(r)) + '</dd><dt>付款階段</dt><dd>' + esc(r.stage || '—') + '</dd>'
        + '<dt>用途</dt><dd>' + esc(r.purpose || '—') + '</dd>'
        + '<dt>送出日</dt><dd class="tn">' + (r.requested_at ? dateText(r.requested_at) : '—') + '</dd><dt>公司匯款日</dt><dd class="tn">' + (r.paid_at ? dateText(r.paid_at) : '—') + '</dd>'
        + '<dt>涵蓋品項</dt><dd>' + links.length + ' 項</dd>' + (r.note ? '<dt>備註</dt><dd>' + esc(r.note) + '</dd>' : '') + '</dl></div>'
        + (closed(ra) ? '' : r.status === '待申請' ? '<div class="dsec"><h3>送出</h3><div class="grid2">' + f('rq_date', '送出日', inp('rq_date', todayStr(), 'type="date"')) + f('rq_no', '公司的申請單編號', inp('rq_no', r.request_no, 'placeholder="送出後才有，可先空白"')) + '</div></div>'
          : r.status === '已申請' ? '<div class="dsec"><h3>公司匯款</h3><div class="grid2">' + f('rq_sent', '送出日', inp('rq_sent', r.requested_at, 'type="date"')) + f('rq_paid', '公司匯款日', inp('rq_paid', todayStr(), 'type="date"')) + '</div></div>' : '')
        + (links.length || exps.length ? '<div class="dsec"><h3>關聯</h3><div class="links">' + links.map(rl => { const l = db().budget_lines.find(x => x.id === rl.line_id) || {}; return '<button type="button" data-act="drawer" data-type="line" data-id="' + esc(rl.line_id) + '"><span><b>' + esc(l.item || rl.line_id) + '</b> NT$ ' + money(rl.amount) + '</span><span>預算品項</span></button>'; }).join('')
          + exps.map(e => '<button type="button" data-act="drawer" data-type="exp" data-id="' + esc(e.id) + '"><span><b>' + esc(e.item) + '</b> NT$ ' + money(e.amount) + '</span><span>支出</span></button>').join('') + '</div></div>' : '')
        + (d.error ? '<div class="note r">' + esc(d.error) + '</div>' : '');
      foot = '<button class="btn sec" type="button" disabled>' + ic('file', 's') + '下載申請單（下一步做）</button>'
        + (closed(ra) ? '' : r.status === '待申請' ? '<button class="btn" type="button" data-act="req-status" data-id="' + esc(r.id) + '" data-status="已申請">' + ic('send', 's') + '標記已申請</button>'
          : r.status === '已申請' ? '<button class="btn sec" type="button" data-act="req-status" data-id="' + esc(r.id) + '" data-status="待申請">退回待申請</button><button class="btn" type="button" data-act="req-status" data-id="' + esc(r.id) + '" data-status="公司已匯款">' + ic('bank', 's') + '標記公司已匯款</button>'
          : '<button class="btn sec" type="button" data-act="req-status" data-id="' + esc(r.id) + '" data-status="已申請">退回已申請</button>');
    }
    if ((d.type === 'req' && d.edit) || d.type === 'newReq') {
      const isNew = d.type === 'newReq';
      const r = isNew ? { stage: '訂金' } : db().payment_requests.find(x => x.id === d.id) || {};
      const actId = isNew ? App.ui.actId : r.activity_id;
      const existing = isNew ? [] : db().request_lines.filter(rl => alive(rl) && rl.request_id === r.id);
      const lines = linesOf(actId);
      const payee = r.payee_vendor_id || (r.payee_name ? '__other' : (lines[0] && lines[0].vendor_id) || '__other');
      const vendorsFirst = Array.from(new Set(lines.map(l => l.vendor_id).filter(Boolean)));
      const vopts = vendorsFirst.map(id => [id, vendorName(id)]).concat(db().vendors.filter(v => alive(v) && vendorsFirst.indexOf(v.id) === -1).map(v => [v.id, v.short_name || v.name])).concat([['__other', '其他（公司或個人）']]);
      form(isNew ? '款項申請單' : '編輯申請單', isNew ? '新增款項申請單' : esc(payeeOf(r)),
        f('nr_payee', '收款對象', sel('nr_payee', vopts, payee))
        + f('nr_name', '收款對象名稱', inp('nr_name', r.payee_name, 'placeholder="不是廠商時填，例：公司（零用金回沖）"'), '選「其他」時必填')
        + '<div class="grid2">' + f('nr_stage', '付款階段', sel('nr_stage', D.REQUEST_STAGES, r.stage)) + f('nr_amt', '金額', inp('nr_amt', r.amount, 'type="number" inputmode="numeric" min="0" placeholder="空白＝勾選品項的合計"')) + '</div>'
        + '<div class="grid2">' + f('nr_due', '匯款期限', inp('nr_due', r.due_date, 'type="date"')) + f('nr_no', '公司申請單編號', inp('nr_no', r.request_no, 'placeholder="送出後才有"')) + '</div>'
        + f('nr_purpose', '用途說明', inp('nr_purpose', r.purpose, 'placeholder="例：尾牙桌菜訂金"'))
        + '<div class="field"><label>涵蓋品項</label>' + (lines.length ? '<div class="pick">' + lines.map(l => {
          const link = existing.find(rl => rl.line_id === l.id);
          const p = payInfo(l);
          const def = link ? link.amount : p.remaining || '';
          return '<label><input type="checkbox" data-pick-line="' + esc(l.id) + '" ' + (link ? 'checked' : '') + '><span><b style="font-weight:500">' + esc(l.item) + '</b><small>' + esc(vendorName(l.vendor_id) || '自行採購') + ' · 還沒排 NT$ ' + money(p.remaining) + '</small></span><input type="number" inputmode="numeric" min="0" data-pick-amt="' + esc(l.id) + '" value="' + esc(def == null ? '' : def) + '" aria-label="' + esc(l.item) + ' 金額"></label>';
        }).join('') + '</div>' : '<span class="sub">這場活動還沒有品項</span>') + '<span class="help">一張單可以涵蓋多個品項；一個品項也可以分多張付</span></div>'
        + f('nr_note', '備註', '<textarea id="nr_note">' + esc(r.note || '') + '</textarea>'),
        isNew ? '建立申請單' : '儲存', isNew ? 'create-request' : 'save-request',
        isNew || r.status !== '待申請' ? '' : '<button class="btn sec" type="button" data-act="delete-request" data-id="' + esc(r.id) + '" style="margin-right:auto;color:var(--r)">刪除</button>');
    }

    if (d.type === 'exp' && !d.edit) {
      const e = db().expenses.find(x => x.id === d.id);
      if (!e) return '';
      const ea = actOf(e.activity_id);
      const editable = !locked(ea);
      const dup = isDup(e);
      const other = dup ? expsOf(e.activity_id).find(x => x.id !== e.id && x.date === e.date && D.num(x.amount) === D.num(e.amount) && !D.isTrue(x.not_duplicate)) : null;
      head = '<div class="row1"><div><div class="kind">支出 · ' + esc((e.source || '網頁') + ' 記錄') + '</div><h2>' + esc(e.item) + '</h2><div class="sub">' + dateText(e.date) + ' · ' + esc(e.method || '') + (e.payer ? ' · ' + esc(e.payer) : '') + '</div></div>' + closeBtn + '</div><div class="amt tn">NT$ ' + money(e.amount) + '</div>' + stepper(D.EXPENSE_STATUSES, e.status);
      body = (e.status === '待確認' && editable ? '<div class="dsec"><h3>確認分類</h3>' + f('c_exp', '預算項目', catSelect('c_exp', e.category || e.suggested_category), '系統建議：' + esc(e.suggested_category || '—')) + '</div>' : '')
        + '<div class="dsec"><div class="sechead"><h3>明細</h3>' + (editable ? '<button class="btn link" type="button" data-act="drawer-edit">' + ic('edit', 's') + '編輯支出</button>' : '') + '</div><dl>'
        + '<dt>預算項目</dt><dd>' + esc(e.category || '—') + '</dd>' + (e.sub_category ? '<dt>報帳分類</dt><dd>' + esc(e.sub_category) + '</dd>' : '')
        + '<dt>支付方式</dt><dd>' + esc(e.method || '—') + '</dd>' + (e.payer ? '<dt>代墊／刷卡人</dt><dd>' + esc(e.payer) + '</dd>' : '')
        + ((e.vendor_id || e.vendor_name) ? '<dt>廠商</dt><dd>' + esc(vendorName(e.vendor_id) || e.vendor_name) + '</dd>' : '')
        + (e.invoice_no ? '<dt>發票號碼</dt><dd class="tn">' + esc(e.invoice_no) + '</dd>' : '')
        + '<dt>收據</dt><dd>' + (e.method === '公司轉帳' ? '看發票' : D.isTrue(e.receipt) ? '已拿到' : '<span class="delta-up">還沒</span>') + '</dd>'
        + (e.note ? '<dt>備註</dt><dd>' + esc(e.note) + '</dd>' : '') + '</dl></div>'
        + (dup && other ? '<div class="note r">同一天（' + dateText(e.date) + '）已經有一筆一樣金額的「' + esc(other.item) + '」（' + esc((other.source || '網頁') + ' 記錄') + '）。確認不是同一筆再往下。</div>' : '')
        + (e.method === '個人代墊' && e.status !== '待確認' && !e.request_id ? '<div class="note">個人代墊會在零用金結算時從零用金扣回給你，不用另外請款。</div>' : '')
        + (e.request_id ? '<div class="dsec"><h3>關聯</h3><div class="links"><button type="button" data-act="drawer" data-type="req" data-id="' + esc(e.request_id) + '"><span><b>款項申請單</b></span><span>查看</span></button></div></div>' : '')
        + (d.error ? '<div class="note r">' + esc(d.error) + '</div>' : '');
      if (editable) {
        foot = dup ? '<button class="btn sec" type="button" data-act="delete-exp" data-id="' + esc(e.id) + '">是重複的，刪掉這筆</button><button class="btn" type="button" data-act="not-dup" data-id="' + esc(e.id) + '">不是重複</button>'
          : e.status === '待確認' ? '<button class="btn" type="button" data-act="confirm-exp" data-id="' + esc(e.id) + '">' + ic('check', 's') + '確認這筆</button>'
            : D.needsReceipt(e) ? '<button class="btn" type="button" data-act="receipt" data-id="' + esc(e.id) + '">' + ic('file', 's') + '收據拿到了</button>' : '';
      }
    }
    if ((d.type === 'exp' && d.edit) || d.type === 'newExp') {
      const isNew = d.type === 'newExp';
      const e = isNew ? { date: todayStr(), method: '活動零用金' } : db().expenses.find(x => x.id === d.id) || {};
      form(isNew ? '手機也好按' : '編輯支出', isNew ? '快速記一筆' : esc(e.item),
        f('ne_item', '項目', inp('ne_item', e.item, 'placeholder="例：現場冰塊"'))
        + '<div class="grid2">' + f('ne_amt', '金額', inp('ne_amt', e.amount, 'type="number" inputmode="numeric" min="0"')) + f('ne_date', '日期', inp('ne_date', e.date, 'type="date"')) + '</div>'
        + '<div class="grid2">' + f('ne_cat', '預算項目', catSelect('ne_cat', e.category || e.suggested_category || '')) + f('ne_method', '支付方式', sel('ne_method', D.PAYMENT_METHODS, e.method)) + '</div>'
        + '<div class="grid2">' + f('ne_payer', '代墊／刷卡人', inp('ne_payer', e.payer, 'placeholder="個人代墊、公司刷卡時填"')) + f('ne_vendor', '店家', inp('ne_vendor', e.vendor_name, 'placeholder="例：全家"')) + '</div>'
        + '<div class="grid2">' + f('ne_inv', '發票號碼', inp('ne_inv', e.invoice_no)) + '<div class="field"><label>收據</label><label class="inline-check"><input type="checkbox" id="ne_receipt" ' + (D.isTrue(e.receipt) ? 'checked' : '') + '>已拿到收據</label></div></div>'
        + f('ne_note', '備註', '<textarea id="ne_note">' + esc(e.note || '') + '</textarea>'),
        isNew ? '記下' : '儲存', isNew ? 'create-exp' : 'save-exp',
        isNew ? '' : '<button class="btn sec" type="button" data-act="delete-exp" data-id="' + esc(e.id) + '" style="margin-right:auto;color:var(--r)">刪除</button>');
    }

    if (d.type === 'vendor' && !d.edit) {
      const v = db().vendors.find(x => x.id === d.id);
      if (!v) return '';
      const lines = db().budget_lines.filter(l => alive(l) && l.vendor_id === v.id);
      const color = colorOf(v.id);
      head = '<div class="row1"><div class="who"><span class="av" style="width:44px;height:44px;font-size:16px;background:' + color + '1f;color:' + color + '">' + esc(initial(v.short_name || v.name)) + '</span><div><div class="kind">廠商</div><h2>' + esc(v.short_name || v.name) + '</h2></div></div>' + closeBtn + '</div>';
      const link = (url, label) => url ? '<a class="btn link" href="' + esc(url) + '" target="_blank" rel="noopener">' + label + '</a>' : '—';
      body = '<div class="dsec"><div class="sechead"><h3>基本資料</h3><button class="btn link" type="button" data-act="drawer-edit">' + ic('edit', 's') + '編輯廠商</button></div><dl><dt>正式名稱</dt><dd>' + esc(v.name) + '</dd><dt>統一編號</dt><dd class="tn">' + esc(v.tax_id || '—') + '</dd>'
        + '<dt>匯款資料</dt><dd>' + st(v.remit_status || '未登記', v.remit_status || '零售／未登記') + '</dd><dt>匯款同意書</dt><dd>' + link(v.remit_doc_url, '開啟') + '</dd><dt>報價單</dt><dd>' + link(v.quote_doc_url, '開啟') + '</dd>'
        + (v.note ? '<dt>備註</dt><dd>' + esc(v.note) + '</dd>' : '') + '</dl></div>'
        + '<div class="dsec"><h3>往來品項</h3>' + (lines.length ? '<div class="links">' + lines.map(l => '<button type="button" data-act="open-line" data-id="' + esc(l.id) + '" data-activity="' + esc(l.activity_id) + '"><span><b>' + esc(l.item) + '</b> <span>' + esc((actOf(l.activity_id) || {}).name || '') + '</span></span>' + st(lineStage(l)) + '</button>').join('') + '</div>' : '<span class="sub">目前讀進來的活動裡還沒有</span>') + '</div>';
    }
    if ((d.type === 'vendor' && d.edit) || d.type === 'newVendor') {
      const isNew = d.type === 'newVendor';
      const v = isNew ? { remit_status: '未登記' } : db().vendors.find(x => x.id === d.id) || {};
      form('廠商', isNew ? '新增廠商' : esc(v.short_name || v.name),
        f('nv_name', '正式名稱', inp('nv_name', v.name)) + f('nv_short', '畫面上顯示的短名', inp('nv_short', v.short_name))
        + f('nv_tax', '統一編號', inp('nv_tax', v.tax_id, 'inputmode="numeric"' + (isNew ? '' : ' disabled')), isNew ? '有統編的會用統編當廠商代碼；沒有的系統自動編號' : '廠商代碼建立後不會變')
        + f('nv_remit', '匯款資料', sel('nv_remit', ['使用中', '已停用', '未登記'], v.remit_status))
        + f('nv_remit_url', '匯款同意書連結', inp('nv_remit_url', v.remit_doc_url, 'type="url" placeholder="Drive 連結"'))
        + f('nv_quote_url', '報價單連結', inp('nv_quote_url', v.quote_doc_url, 'type="url" placeholder="Drive 連結"'))
        + f('nv_note', '備註', '<textarea id="nv_note">' + esc(v.note || '') + '</textarea>'),
        isNew ? '新增廠商' : '儲存', isNew ? 'create-vendor' : 'save-vendor');
    }

    if (d.type === 'newAct' || d.type === 'editAct') {
      const isNew = d.type === 'newAct';
      const x = isNew ? { type: '尾牙', plan_year: new Date().getFullYear() } : actOf(d.id) || {};
      form(isNew ? '活動' : '編輯活動', isNew ? '新增活動' : esc(x.name),
        f('na_name', '活動名稱', inp('na_name', x.name, 'placeholder="例：2027 春酒"'))
        + '<div class="grid2">' + f('na_type', '類型', sel('na_type', D.ACTIVITY_TYPES, x.type, isNew ? 'data-act-id-src' : '')) + f('na_year', '企劃年度', inp('na_year', x.plan_year, 'type="number" inputmode="numeric"' + (isNew ? ' data-act-id-src' : ''))) + '</div>'
        + (isNew ? f('na_id', '活動代碼', inp('na_id', D.activityIdFor(x.type, x.plan_year, db().activities.map(a => a.id))), '系統依類型與年度產生，建立後不會變') : '')
        + '<div class="grid2">' + f('na_date', '舉辦日', inp('na_date', x.date, 'type="date"')) + f('na_people', '預估人數', inp('na_people', x.est_headcount, 'type="number" inputmode="numeric" min="0"')) + '</div>'
        + f('na_venue', '場地', inp('na_venue', x.venue, 'placeholder="例：○○餐廳"')) + f('na_addr', '地址', inp('na_addr', x.address))
        + (isNew ? '' : '<div class="grid2">' + f('na_actual', '實際出席人數', inp('na_actual', x.actual_headcount, 'type="number" inputmode="numeric" min="0"')) + f('na_alloc', '分攤方式', inp('na_alloc', x.allocation_method, 'placeholder="例：人數比例"')) + '</div>')
        + f('na_note', '備註', '<textarea id="na_note">' + esc(x.note || '') + '</textarea>'),
        isNew ? '建立活動' : '儲存', isNew ? 'create-activity' : 'save-activity');
    }
    if (d.type === 'petty') {
      form('零用金', '零用金暫支', f('pa_amt', '暫支金額', inp('pa_amt', a && a.petty_advance != null ? a.petty_advance : '', 'type="number" inputmode="numeric" min="0"'), '沒有暫支請填 0') + f('pa_date', '申請日', inp('pa_date', a && a.petty_requested_at, 'type="date"')), '儲存', 'save-petty');
    }
    if (d.type === 'proposal') {
      const x = actOf(d.id);
      const prev = App.previousFor ? App.previousFor(x) : null;
      head = '<div class="row1"><div><div class="kind">預算簽呈</div><h2>簽呈文字</h2><div class="sub">' + esc(x.name) + ' · 依目前預算即時產生</div></div>' + closeBtn + '</div>';
      body = '<div class="note">複製後貼到公司的簽呈範本。公司抬頭、簽核欄在範本裡本來就有，這裡只給主旨和說明。</div>'
        + '<div class="field"><label for="ptext">主旨與說明</label><textarea id="ptext" class="ptext" readonly>' + esc(D.proposalText(x, db(), prev)) + '</textarea></div>';
      foot = '<button class="btn sec" type="button" disabled>下載預估費用明細（下一步做）</button><button class="btn" type="button" data-act="copy-proposal">' + ic('copy', 's') + '複製文字</button>';
    }
    return '<div class="scrim" data-act="close-drawer"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="明細"><div class="dh">' + head + '</div><div class="db">' + body + '</div>' + (foot ? '<div class="df">' + foot + '</div>' : '') + '</aside>';
  }

  function main() {
    const v = App.ui.view;
    return v === 'search' ? pageSearch() : v === 'todo' ? pageTodo() : v === 'activities' ? pageActivities() : v === 'vendors' ? pageVendors()
      : v === 'inbox' ? pageInbox() : v === 'history' ? pageHistory() : v === 'activity' ? pageActivity() : pageTodo();
  }

  root.V2Views = { ic, esc, money, side, main, drawer, searchResults, dateText };
})(window);

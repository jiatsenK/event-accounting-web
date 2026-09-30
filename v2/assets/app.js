/* 活動工作台 v2：網址路由、互動與寫入動作。
 * 畫面在 views.js，計算規則在 domain.js，後端呼叫在 api.js，資料狀態在 store.js。 */
(function (root) {
  'use strict';
  const D = root.V2Domain;
  const api = root.V2Api;
  const store = root.V2Store;
  const V = root.V2Views;
  const App = root.V2App;

  const VIEWS = ['todo', 'activities', 'activity', 'vendors', 'inbox', 'history', 'search'];
  const TABS = ['overview', 'budget', 'plan', 'requests', 'expenses', 'close'];
  App.ui = { view: 'todo', actId: null, tab: 'overview', reqStatus: '全部', reqPayee: '', expStatus: '全部', expMethod: '', expFlag: '', planView: '流程表', drawer: null, q: '', settleErr: '' };
  App.phase = 'boot';

  const $ = id => document.getElementById(id);
  const val = id => { const el = $(id); return el ? String(el.value).trim() : ''; };
  const db = () => store.db();
  const alive = r => r && !r.deleted_at;
  const taipeiToday = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const money = V.money;

  /* ---------- 提示 ---------- */
  function toast(text, isError) {
    const host = $('toastHost');
    host.innerHTML = '<div class="toast ' + (isError ? 'err' : '') + '" role="' + (isError ? 'alert' : 'status') + '">' + V.ic(isError ? 'alert' : 'check') + V.esc(text) + '</div>';
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { host.innerHTML = ''; }, isError ? 6000 : 2200);
  }
  let savedTimer = null;
  let wasSaving = false;
  function updateSaving() {
    const el = $('saving');
    if (!el) return;
    const n = store.pendingCount();
    if (n) {
      clearTimeout(savedTimer);
      el.hidden = false;
      el.className = 'saving';
      el.textContent = '儲存中' + (n > 1 ? '（' + n + ' 筆）' : '') + '…';
      wasSaving = true;
    } else if (wasSaving) {
      wasSaving = false;
      el.hidden = false;
      el.className = 'saving idle';
      el.textContent = '已儲存';
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => { el.hidden = true; }, 1600);
    }
  }

  /* ---------- 路由 ---------- */
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const i = raw.indexOf('?');
    const path = i === -1 ? raw : raw.slice(0, i);
    const query = new URLSearchParams(i === -1 ? '' : raw.slice(i + 1));
    return { parts: path.split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch (_) { return s; } }), query };
  }
  function buildHash(parts, query) {
    const qs = query && query.toString();
    return '#/' + parts.map(encodeURIComponent).join('/') + (qs ? '?' + qs : '');
  }
  function navigate(hash, drawer) {
    App.ui.drawer = drawer || null;
    App.ui.keepDrawer = !!drawer;
    if (location.hash === hash || decodeURI(location.hash) === decodeURI(hash)) { applyRoute(true); return; }
    location.hash = hash;
  }
  function setQuery(key, value) {
    const { parts, query } = parseHash();
    if (value && value !== '全部') query.set(key, value); else query.delete(key);
    history.replaceState(null, '', buildHash(parts, query));
    App.ui.keepDrawer = true;
    applyRoute(true);
  }

  function applyRoute(noScroll) {
    const ui = App.ui;
    const { parts, query } = parseHash();
    const before = ui.view + '|' + ui.actId + '|' + ui.tab;
    ui.view = VIEWS.indexOf(parts[0]) === -1 ? 'todo' : parts[0];
    if (ui.view === 'activity') {
      ui.actId = parts[1] || null;
      ui.tab = TABS.indexOf(parts[2]) === -1 ? 'overview' : parts[2];
    }
    ui.reqStatus = ui.tab === 'requests' && query.get('status') || '全部';
    ui.reqPayee = query.get('payee') || '';
    ui.expStatus = ui.tab === 'expenses' && query.get('status') || '全部';
    ui.expMethod = query.get('method') || '';
    ui.expFlag = query.get('flag') || '';
    ui.planView = query.get('view') || '流程表';
    if (ui.view === 'search') {
      ui.q = query.get('q') || '';
      if (ui.q && (!App.search || App.search.q !== ui.q)) runSearch(ui.q);
    } else {
      ui.q = '';
      const top = $('q');
      if (top && document.activeElement !== top) top.value = '';
    }
    if (!ui.keepDrawer) ui.drawer = null;
    ui.keepDrawer = false;
    ui.settleErr = '';
    if (ui.view === 'activity' && ui.actId) loadActivity(ui.actId);
    if (ui.view === 'history' || ui.view === 'activities') loadHistory(ui.view === 'history');
    render({ fresh: before !== ui.view + '|' + ui.actId + '|' + ui.tab });
    if (!noScroll && before !== ui.view + '|' + ui.actId + '|' + ui.tab) root.scrollTo(0, 0);
  }

  function loadActivity(id) {
    App.activityError = '';
    if (!db().activities.some(a => a.id === id)) return;
    store.ensureActivity(id).then(() => render()).catch(err => { App.activityError = err.message; render(); });
  }
  let historyJob = null;
  function loadHistory(force) {
    if (historyJob || (App.historyTable && !force)) return historyJob;
    historyJob = api.history().then(res => {
      App.historyTable = D.historyTable(res.data);
      App.historyError = '';
    }).catch(err => { App.historyError = err.message; }).finally(() => { historyJob = null; render(); });
    return historyJob;
  }
  /* 上一屆同類活動（已結案、舉辦日較早）的總支出與人數，給簽呈文字算上一屆人均。 */
  App.previousFor = activity => {
    if (!activity || !App.historyTable) return null;
    const prev = db().activities.filter(a => alive(a) && a.id !== activity.id && a.closed_at && a.type === activity.type && String(a.date || '') < String(activity.date || '9999'))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
    const col = prev && App.historyTable.columns.find(c => c.id === prev.id);
    return col ? { total: col.total, headcount: col.headcount } : null;
  };

  /* ---------- 搜尋 ---------- */
  let searchTimer = null;
  function runSearch(q) {
    const query = q.trim();
    if (!query) { App.search = null; updateSearchResults(); return; }
    App.search = { q: query, loading: true };
    updateSearchResults();
    api.search(query).then(res => {
      if (App.ui.q.trim() !== query) return;
      App.search = { q: query, results: (res.data && res.data.results) || [] };
      updateSearchResults();
    }).catch(err => {
      if (App.ui.q.trim() !== query) return;
      App.search = { q: query, error: err.message };
      updateSearchResults();
    });
  }
  function updateSearchResults() { const sr = $('sr'); if (sr) sr.innerHTML = V.searchResults(); }
  function onSearchInput(input) {
    const ui = App.ui;
    ui.q = input.value;
    const other = $(input.id === 'q' ? 'q2' : 'q');
    if (other && other.value !== input.value) other.value = input.value;
    const hash = '#/search' + (ui.q.trim() ? '?q=' + encodeURIComponent(ui.q.trim()) : '');
    if (ui.view !== 'search') {
      if (!ui.q.trim()) return;
      ui.view = 'search';
      ui.drawer = null;
      history.pushState(null, '', hash);
      render({ fresh: true });
      const el = $(input.id);
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    } else {
      history.replaceState(null, '', hash);
    }
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(ui.q), 250);
    updateSearchResults();
  }

  /* ---------- 畫面更新（保留使用者正在輸入的值） ---------- */
  function snapshot(container) {
    const out = {};
    if (!container) return out;
    container.querySelectorAll('input,select,textarea').forEach(el => {
      const key = el.id || (el.dataset.pickLine ? 'pl:' + el.dataset.pickLine : el.dataset.pickAmt ? 'pa:' + el.dataset.pickAmt : el.dataset.cat ? 'cat:' + el.dataset.cat : '');
      if (key) out[key] = { value: el.value, checked: el.checked };
    });
    return out;
  }
  function restore(container, snap) {
    if (!container) return;
    container.querySelectorAll('input,select,textarea').forEach(el => {
      const key = el.id || (el.dataset.pickLine ? 'pl:' + el.dataset.pickLine : el.dataset.pickAmt ? 'pa:' + el.dataset.pickAmt : el.dataset.cat ? 'cat:' + el.dataset.cat : '');
      const s = key && snap[key];
      if (!s || el.readOnly) return;
      if (el.type === 'checkbox') el.checked = s.checked; else if (el.value !== s.value && [].some.call(el.options || [{ value: s.value }], o => o.value === s.value)) el.value = s.value;
    });
  }
  let lastDrawerKey = '';
  let lastMainKey = '';
  function render(opts) {
    const o = opts || {};
    if (App.phase !== 'ready') { renderGate(); return; }
    const ui = App.ui;
    const drawerKey = ui.drawer ? [ui.drawer.type, ui.drawer.id, !!ui.drawer.edit].join('|') : '';
    const mainKey = location.hash;
    const mainSnap = !o.fresh && mainKey === lastMainKey ? snapshot($('main')) : {};
    const drawerSnap = !o.fresh && !o.freshDrawer && drawerKey && drawerKey === lastDrawerKey ? snapshot($('drawerHost')) : {};
    const drawerScroll = drawerKey === lastDrawerKey && document.querySelector('#drawerHost .db') ? document.querySelector('#drawerHost .db').scrollTop : 0;
    const active = document.activeElement;
    const activeId = active && active.id && !active.closest('.top') ? active.id : '';
    const caret = activeId && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null;
    document.body.classList.remove('gate');
    $('side').innerHTML = V.side();
    $('main').innerHTML = V.main();
    $('drawerHost').innerHTML = V.drawer();
    restore($('main'), mainSnap);
    restore($('drawerHost'), drawerSnap);
    const db2 = document.querySelector('#drawerHost .db');
    if (db2 && drawerScroll) db2.scrollTop = drawerScroll;
    if (activeId && $(activeId)) {
      const el = $(activeId);
      el.focus({ preventScroll: true });
      if (caret && el.setSelectionRange) { try { el.setSelectionRange(caret[0], caret[1]); } catch (_) { /* number 欄位不支援 */ } }
    } else if (drawerKey && drawerKey !== lastDrawerKey) {
      const first = document.querySelector('#drawerHost .drawer .x');
      if (first) first.focus({ preventScroll: true });
    }
    lastDrawerKey = drawerKey;
    lastMainKey = mainKey;
    const top = $('q');
    if (top && ui.view === 'search' && document.activeElement !== top) top.value = ui.q;
    document.title = pageTitle();
    updateSaving();
  }
  function pageTitle() {
    const ui = App.ui;
    const names = { todo: '待辦', activities: '活動', vendors: '廠商', inbox: '收件匣', history: '歷史分析', search: '搜尋' };
    const a = ui.view === 'activity' && db().activities.find(x => x.id === ui.actId);
    return (a ? a.name : names[ui.view] || '待辦') + ' · 活動工作台';
  }
  function renderGate() {
    document.body.classList.add('gate');
    $('side').innerHTML = '<div class="logo"><i>活</i><span>活動工作台</span></div>';
    $('drawerHost').innerHTML = '';
    let inner;
    if (App.phase === 'login') {
      inner = '<form class="panel" id="loginForm"><div><h1>輸入存取碼</h1><div class="sub" style="margin-top:6px">存取碼只會留在這個分頁，關掉分頁就要重新輸入。</div></div>'
        + '<div class="field"><label for="token">存取碼</label><input id="token" type="password" autocomplete="current-password" required></div>'
        + (App.loginError ? '<div class="note r">' + V.esc(App.loginError) + '</div>' : '')
        + '<button class="btn" type="submit" style="justify-content:center">進入</button></form>';
    } else if (App.phase === 'noconfig') {
      inner = '<div class="panel"><h1>還沒設定後端網址</h1><p class="sub" style="margin:0">請在 <code>assets/config.js</code> 填入後端（Apps Script /exec）網址。只想看畫面，可以在網址後面加 <code>?mock=1</code> 用模擬資料。</p></div>';
    } else if (App.phase === 'error') {
      inner = '<div class="panel"><h1>讀不到資料</h1><div class="note r">' + V.esc(App.bootError || '') + '</div><button class="btn" type="button" data-act="retry" style="justify-content:center">再試一次</button></div>';
    } else {
      inner = '<div class="loading">讀取資料中…</div>';
    }
    $('main').innerHTML = '<div class="login">' + inner + '</div>';
    const t = $('token');
    if (t) t.focus();
  }

  /* ---------- 開始 ---------- */
  function start() {
    App.phase = 'loading';
    render();
    store.bootstrap().then(() => {
      App.phase = 'ready';
      applyRoute(true);
    }).catch(err => {
      if (/存取碼/.test(err.message)) { api.clearToken(); App.phase = 'login'; App.loginError = err.message; } else { App.phase = 'error'; App.bootError = err.message; }
      render();
    });
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('載入失敗：' + src));
      document.head.appendChild(s);
    });
  }
  function boot() {
    const mock = new URLSearchParams(location.search).get('mock') === '1';
    (mock ? loadScript('dev/mock-api.js') : Promise.resolve()).then(() => {
      if (!api.isConfigured()) { App.phase = 'noconfig'; render(); return; }
      if (!api.isMock() && !api.getToken()) { App.phase = 'login'; render(); return; }
      start();
    }).catch(err => { App.phase = 'error'; App.bootError = err.message; render(); });
  }

  let frame = 0;
  store.subscribe(event => {
    if (event.type === 'idmap' && App.ui.drawer && App.ui.drawer.id === event.from) App.ui.drawer.id = event.to;
    if (event.type === 'stale') store.bootstrap().catch(() => {});
    if (event.type === 'change' && App.phase === 'ready') {
      if (!frame) frame = root.requestAnimationFrame(() => { frame = 0; render(); });
    }
    updateSaving();
  });

  /* ---------- 動作 ---------- */
  const current = () => db().activities.find(a => a.id === App.ui.actId);
  const lineById = id => db().budget_lines.find(l => l.id === id);
  const reqById = id => db().payment_requests.find(r => r.id === id);
  const expById = id => db().expenses.find(e => e.id === id);
  const intOrBlank = id => { const v = val(id); return v === '' ? '' : Number(v); };
  const needInt = (id, label) => {
    const v = val(id);
    if (v === '') return { error: '請填' + label };
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) return { error: label + '要是 0 以上的整數' };
    return { value: n };
  };
  const drawerError = message => { if (App.ui.drawer) { App.ui.drawer.error = message; render(); } else toast(message, true); };
  const closeDrawer = () => { App.ui.drawer = null; render(); };

  function createRequestForLine(line, stage, amount) {
    const r = store.write('create', { table: 'payment_requests', row: {
      activity_id: line.activity_id, payee_vendor_id: line.vendor_id || '', stage, amount, purpose: line.item + ' ' + stage
    } });
    if (r.rejected) { r.done.catch(err => drawerError(err.message)); return null; }
    watch(r);
    watch(store.write('create', { table: 'request_lines', row: { request_id: r.id, line_id: line.id, amount } }));
    return r.id;
  }
  /* 已被本機接受的寫入：失敗時只提示（畫面由 store 回復）。 */
  function watch(res) {
    res.done.catch(err => {
      if (err.kind === 'dependent') return;
      toast((err.kind === 'local' ? '' : '沒有存成功：') + err.message + (err.kind === 'local' ? '' : '（畫面已回復）'), true);
    });
    return res;
  }
  /* 送一筆寫入；本機就不合規時回傳 false 並把原因顯示在抽屜（或提示）。 */
  function send(op, args) {
    const res = store.write(op, args);
    if (res.rejected) { res.done.catch(err => drawerError(err.message)); return null; }
    return watch(res);
  }

  const actions = {
    'drawer': el => {
      App.ui.drawer = { type: el.dataset.type, id: el.dataset.id || null };
      if (['line', 'proposal'].indexOf(el.dataset.type) !== -1) loadHistory();
      render();
    },
    'drawer-edit': () => { App.ui.drawer.edit = true; App.ui.drawer.error = ''; render(); },
    'close-drawer': closeDrawer,
    'todo': el => {
      const key = el.dataset.key;
      const map = { invoice: 'budget', draftRequest: 'requests?status=待申請', confirm: 'expenses?status=待確認', duplicate: 'expenses?flag=duplicate', receipt: 'expenses?flag=receipt', waitPay: 'requests?status=已申請', closing: 'close' };
      let id = el.dataset.activity;
      if (!id) {
        if (key === 'confirm') { navigate('#/inbox'); return; }
        const open = db().activities.filter(a => alive(a) && !a.closed_at).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
        const hit = open.find(a => D.todoCounts(db(), a.id)[key]) || open[0];
        if (!hit) return;
        id = hit.id;
      }
      navigate('#/activity/' + encodeURIComponent(id) + '/' + map[key]);
    },
    'filter': el => setQuery(el.dataset.key, el.dataset.value),
    'filter-clear': () => {
      const { parts, query } = parseHash();
      query.delete('method'); query.delete('flag');
      history.replaceState(null, '', buildHash(parts, query));
      App.ui.keepDrawer = true;
      applyRoute(true);
    },
    'plan-view': el => setQuery('view', el.dataset.view),
    'budget-next': el => {
      const a = current();
      if (send('set_budget_status', { activity_id: a.id, status: el.dataset.status })) toast('預算' + el.dataset.status);
    },
    'add-quote': el => {
      const line = lineById(el.dataset.id);
      const amount = needInt('q_amt', '報價');
      if (amount.error) { drawerError(amount.error); return; }
      if (amount.value === D.latestQuote(line.id, db().quotes)) { drawerError('金額跟目前這版一樣'); return; }
      const res = send('add_quote', { line_id: line.id, amount: amount.value, reason: val('q_reason') });
      if (!res) return;
      App.ui.drawer.error = '';
      render({ freshDrawer: true });
      toast('已存成第 ' + D.quotesOf(line.id, db().quotes).length + ' 版');
    },
    'invoice': el => { if (send('update', { table: 'budget_lines', row: { id: el.dataset.id, invoice_received_at: taipeiToday() } })) toast('已標記發票到了'); },
    'add-installment': el => {
      const line = lineById(el.dataset.id);
      const p = D.linePayment(line, db());
      const amount = needInt('ni_amt', '金額');
      if (amount.error || amount.value <= 0) { drawerError(amount.error || '金額要大於 0'); return; }
      if (amount.value > p.remaining) { drawerError('超過還沒排的 NT$ ' + money(p.remaining) + '，請再核對'); return; }
      const stage = val('ni_stage');
      if (createRequestForLine(line, stage, amount.value)) { render({ freshDrawer: true }); toast('已加一期：' + stage + ' NT$ ' + money(amount.value)); }
    },
    'make-request': el => {
      const line = lineById(el.dataset.id);
      const p = D.linePayment(line, db());
      const id = createRequestForLine(line, p.requests.length ? '尾款' : '全額', p.remaining);
      if (id) { navigate('#/activity/' + encodeURIComponent(line.activity_id) + '/requests', { type: 'req', id }); toast('已建立申請單，金額帶入還沒排的部分'); }
    },
    'create-line': () => {
      const a = current();
      const item = val('nl_item');
      if (!item) { drawerError('請填品項名稱'); return; }
      const quote = val('nl_quote');
      if (quote !== '' && (!Number.isInteger(Number(quote)) || Number(quote) < 0)) { drawerError('報價金額要是 0 以上的整數'); return; }
      const order = db().budget_lines.filter(l => l.activity_id === a.id).reduce((m, l) => Math.max(m, D.num(l.order) || 0), 0) + 1;
      const res = send('create', { table: 'budget_lines', row: {
        activity_id: a.id, category: val('nl_cat'), vendor_id: val('nl_vendor'), item, unit_price: intOrBlank('nl_price'), qty: intOrBlank('nl_qty'),
        payment_terms: val('nl_terms'), note: val('nl_note'), order
      } });
      if (!res) return;
      if (quote !== '') watch(store.write('add_quote', { line_id: res.id, amount: Number(quote), reason: a.budget_approved_at ? '簽呈後新增' : '第一次報價' }));
      closeDrawer();
      toast('已加入預算');
    },
    'save-line': el => {
      const item = val('nl_item');
      if (!item) { drawerError('請填品項名稱'); return; }
      const res = send('update', { table: 'budget_lines', row: {
        id: el.dataset.id, category: val('nl_cat'), vendor_id: val('nl_vendor'), item, unit_price: intOrBlank('nl_price'), qty: intOrBlank('nl_qty'), payment_terms: val('nl_terms'), note: val('nl_note')
      } });
      if (!res) return;
      App.ui.drawer.edit = false;
      render({ freshDrawer: true });
      toast('品項已更新');
    },
    'delete-line': el => {
      const line = lineById(el.dataset.id);
      if (!root.confirm('確定刪除「' + line.item + '」？')) return;
      if (send('delete', { table: 'budget_lines', id: line.id, row: { id: line.id } })) { closeDrawer(); toast('已刪除品項'); }
    },
    'req-status': el => {
      const status = el.dataset.status;
      const args = { id: el.dataset.id, status };
      const req = db().payment_requests.find(r => r.id === args.id) || {};
      const back = D.REQUEST_STATUSES.indexOf(status) < D.REQUEST_STATUSES.indexOf(req.status || '待申請');
      const pick = val(status === '公司已匯款' ? 'rq_paid' : 'rq_date');
      if (!back && pick) args.date = pick;
      if (back && status === '已申請') args.date = req.requested_at;
      if (status === '公司已匯款' && val('rq_sent')) args.requested_at = val('rq_sent');
      if (status === '已申請' && val('rq_no')) args.request_no = val('rq_no');
      if (send('set_request_status', args)) toast(back ? '已退回' + status : status === '公司已匯款' ? '已標記公司已匯款' : '已標記已申請');
    },
    'create-request': () => saveRequest(null),
    'save-request': el => saveRequest(el.dataset.id),
    'delete-request': el => {
      if (!root.confirm('確定刪除這張申請單？')) return;
      if (send('delete', { table: 'payment_requests', id: el.dataset.id, row: { id: el.dataset.id } })) { closeDrawer(); toast('已刪除申請單'); }
    },
    'confirm-exp': el => {
      const e = expById(el.dataset.id);
      const pick = document.querySelector('[data-cat="' + CSS.escape(e.id) + '"]') || $('c_exp');
      const category = pick ? pick.value : (e.category || e.suggested_category || '');
      if (!category) { drawerError('請先選預算項目'); return; }
      if (send('confirm_expense', { id: e.id, category })) toast('已確認：' + e.item);
    },
    'confirm-all': () => {
      const list = db().expenses.filter(e => alive(e) && e.status === '待確認');
      let n = 0;
      let skipped = 0;
      list.forEach(e => {
        const pick = document.querySelector('[data-cat="' + CSS.escape(e.id) + '"]');
        const category = pick ? pick.value : (e.category || e.suggested_category || '');
        if (!category) { skipped++; return; }
        if (send('confirm_expense', { id: e.id, category })) n++;
      });
      toast('已確認 ' + n + ' 筆' + (skipped ? '，' + skipped + ' 筆沒有預算項目，請先選' : ''), !!skipped);
    },
    'not-dup': el => { if (send('update', { table: 'expenses', row: { id: el.dataset.id, not_duplicate: 'TRUE' } })) toast('已標記不是重複'); },
    'receipt': el => { if (send('update', { table: 'expenses', row: { id: el.dataset.id, receipt: '有' } })) toast('已記下收據'); },
    'delete-exp': el => {
      const e = expById(el.dataset.id);
      if (!root.confirm('確定刪除「' + e.item + '」NT$ ' + money(e.amount) + '？')) return;
      if (send('delete', { table: 'expenses', id: e.id, row: { id: e.id } })) { closeDrawer(); toast('已刪除這筆支出'); }
    },
    'create-exp': () => saveExpense(null),
    'save-exp': el => saveExpense(el.dataset.id),
    'create-vendor': () => {
      const name = val('nv_name');
      if (!name) { drawerError('請填廠商名稱'); return; }
      const tax = val('nv_tax');
      if (tax && db().vendors.some(v => v.id === tax)) { drawerError('統編 ' + tax + ' 的廠商已經有了'); return; }
      const row = { name, short_name: val('nv_short'), tax_id: tax, remit_status: val('nv_remit'), remit_doc_url: val('nv_remit_url'), quote_doc_url: val('nv_quote_url'), note: val('nv_note') };
      if (tax) row.id = tax;
      const res = send('create', { table: 'vendors', row });
      if (!res) return;
      App.ui.drawer = { type: 'vendor', id: res.id };
      render();
      toast('已新增廠商');
    },
    'save-vendor': el => {
      const name = val('nv_name');
      if (!name) { drawerError('請填廠商名稱'); return; }
      if (!send('update', { table: 'vendors', row: { id: el.dataset.id, name, short_name: val('nv_short'), remit_status: val('nv_remit'), remit_doc_url: val('nv_remit_url'), quote_doc_url: val('nv_quote_url'), note: val('nv_note') } })) return;
      App.ui.drawer.edit = false;
      render({ freshDrawer: true });
      toast('廠商已更新');
    },
    'create-activity': () => {
      const name = val('na_name');
      const id = val('na_id');
      if (!name) { drawerError('請填活動名稱'); return; }
      if (!/^[a-z0-9-]+$/.test(id)) { drawerError('活動代碼只能用小寫英文、數字和 -'); return; }
      if (db().activities.some(a => a.id === id)) { drawerError('活動代碼 ' + id + ' 已經有了'); return; }
      const res = send('create', { table: 'activities', row: {
        id, name, type: val('na_type'), plan_year: intOrBlank('na_year'), date: val('na_date'), venue: val('na_venue'), address: val('na_addr'), est_headcount: intOrBlank('na_people'), note: val('na_note'), source: '網頁'
      } });
      if (!res) return;
      navigate('#/activity/' + encodeURIComponent(id) + '/budget');
      toast('活動已建立，接著建預算');
    },
    'save-activity': el => {
      const name = val('na_name');
      if (!name) { drawerError('請填活動名稱'); return; }
      if (!send('update', { table: 'activities', row: {
        id: el.dataset.id, name, type: val('na_type'), plan_year: intOrBlank('na_year'), date: val('na_date'), venue: val('na_venue'), address: val('na_addr'),
        est_headcount: intOrBlank('na_people'), actual_headcount: intOrBlank('na_actual'), allocation_method: val('na_alloc'), note: val('na_note')
      } })) return;
      closeDrawer();
      toast('活動已更新');
    },
    'save-petty': () => {
      const a = current();
      const amount = needInt('pa_amt', '暫支金額');
      if (amount.error) { drawerError(amount.error); return; }
      if (!send('update', { table: 'activities', row: { id: a.id, petty_advance: amount.value, petty_requested_at: val('pa_date') } })) return;
      closeDrawer();
      toast('暫支已儲存');
    },
    'copy-proposal': () => {
      const ta = $('ptext');
      const fallback = () => { ta.focus(); ta.select(); toast('已選取文字，請按 Ctrl+C（手機長按）複製'); };
      try {
        if (!navigator.clipboard || !root.isSecureContext) { fallback(); return; }
        navigator.clipboard.writeText(ta.value).then(() => toast('已複製，可以貼到簽呈範本'), fallback);
      } catch (_) { fallback(); }
    },
    'close-step': el => {
      const a = current();
      const op = el.dataset.op;
      if (op === 'close' && !root.confirm('結案後這場活動只能看、不能改。確定結案？')) return;
      if (send(op, { activity_id: a.id })) toast(op === 'lock_close' ? '核銷完成，支出已鎖定' : '已結案');
    },
    'reply-accounting': () => {
      const a = current();
      const dir = a.settle_direction;
      const amount = D.num(a.settle_amount_expected) || 0;
      if (dir === '回沖' || dir === '補請') {
        let req = db().payment_requests.find(r => alive(r) && r.activity_id === a.id && r.stage === dir);
        let reqId = req && req.id;
        if (!req) {
          const created = send('create', { table: 'payment_requests', row: {
            activity_id: a.id, stage: dir, amount, payee_name: dir === '回沖' ? '公司（零用金回沖）' : '零用金補請', purpose: a.name + ' 零用金' + dir
          } });
          if (!created) return;
          reqId = created.id;
        }
        if (!req || req.status === '待申請') watch(store.write('set_request_status', { id: reqId, status: '已申請' }));
      }
      if (send('reply_accounting', { activity_id: a.id })) toast('已產出申請單，標記已送會計');
    },
    'settle': () => {
      const a = current();
      const amount = needInt('settle_amt', '實際金額');
      if (amount.error) { App.ui.settleErr = amount.error; render(); return; }
      const res = store.write('settle', { activity_id: a.id, amount: amount.value, note: val('settle_note') });
      if (res.rejected) { res.done.catch(err => { App.ui.settleErr = err.message; render(); }); return; }
      watch(res);
      App.ui.settleErr = '';
      const req = db().payment_requests.find(r => alive(r) && r.activity_id === a.id && r.stage === a.settle_direction && r.status !== '公司已匯款');
      if (req) watch(store.write('set_request_status', { id: req.id, status: '公司已匯款' }));
      toast(amount.value === D.num(a.settle_amount_expected) ? '金額核對無誤，已結清' : '已結清，差額原因已記下');
    },
    'open-line': el => navigate('#/activity/' + encodeURIComponent(el.dataset.activity) + '/budget', { type: 'line', id: el.dataset.id }),
    'open-req': el => navigate('#/activity/' + encodeURIComponent(el.dataset.activity) + '/requests', { type: 'req', id: el.dataset.id }),
    'open-exp': el => navigate('#/activity/' + encodeURIComponent(el.dataset.activity) + '/expenses', { type: 'exp', id: el.dataset.id }),
    'open-vendor': el => navigate('#/vendors', { type: 'vendor', id: el.dataset.id }),
    'refresh': () => store.bootstrap().then(() => { App.historyTable = null; toast('已重新讀取'); applyRoute(true); }).catch(err => toast(err.message, true)),
    'logout': () => { api.clearToken(); App.phase = 'login'; App.loginError = ''; render(); },
    'mock-reset': () => { if (root.V2Mock) { root.V2Mock.reset(); App.historyTable = null; store.bootstrap().then(() => { toast('已重設模擬資料'); applyRoute(true); }); } },
    'retry': start
  };

  function saveRequest(id) {
    const a = current();
    const payee = val('nr_payee');
    const name = val('nr_name');
    if (payee === '__other' && !name) { drawerError('選「其他」時請填收款對象名稱'); return; }
    const picks = [];
    document.querySelectorAll('[data-pick-line]').forEach(cb => {
      if (!cb.checked) return;
      const amt = document.querySelector('[data-pick-amt="' + CSS.escape(cb.dataset.pickLine) + '"]');
      picks.push({ line_id: cb.dataset.pickLine, amount: amt && amt.value !== '' ? Number(amt.value) : '' });
    });
    if (picks.some(p => p.amount !== '' && (!Number.isInteger(p.amount) || p.amount < 0))) { drawerError('品項金額要是 0 以上的整數'); return; }
    let amount = val('nr_amt');
    if (amount === '') {
      if (!picks.length) { drawerError('請填金額，或勾選要涵蓋的品項'); return; }
      amount = picks.reduce((t, p) => t + (p.amount || 0), 0);
    } else amount = Number(amount);
    if (!Number.isInteger(amount) || amount < 0) { drawerError('金額要是 0 以上的整數'); return; }
    const row = {
      payee_vendor_id: payee === '__other' ? '' : payee, payee_name: payee === '__other' ? name : name, stage: val('nr_stage'), amount,
      due_date: val('nr_due'), request_no: val('nr_no'), purpose: val('nr_purpose'), note: val('nr_note')
    };
    if (!id) {
      const res = send('create', { table: 'payment_requests', row: Object.assign({ activity_id: a.id }, row) });
      if (!res) return;
      picks.forEach(p => watch(store.write('create', { table: 'request_lines', row: { request_id: res.id, line_id: p.line_id, amount: p.amount } })));
      App.ui.drawer = { type: 'req', id: res.id };
      render();
      toast('申請單已建立');
      return;
    }
    if (!send('update', { table: 'payment_requests', row: Object.assign({ id }, row) })) return;
    const existing = db().request_lines.filter(rl => alive(rl) && rl.request_id === id);
    existing.forEach(rl => {
      const p = picks.find(x => x.line_id === rl.line_id);
      if (!p) watch(store.write('delete', { table: 'request_lines', id: rl.id, row: { id: rl.id } }));
      else if (D.num(p.amount) !== D.num(rl.amount)) watch(store.write('update', { table: 'request_lines', row: { id: rl.id, amount: p.amount } }));
    });
    picks.filter(p => !existing.some(rl => rl.line_id === p.line_id)).forEach(p => watch(store.write('create', { table: 'request_lines', row: { request_id: id, line_id: p.line_id, amount: p.amount } })));
    App.ui.drawer.edit = false;
    render({ freshDrawer: true });
    toast('申請單已更新');
  }

  function saveExpense(id) {
    const a = current();
    const item = val('ne_item');
    if (!item) { drawerError('請填項目'); return; }
    const amount = needInt('ne_amt', '金額');
    if (amount.error) { drawerError(amount.error); return; }
    const row = {
      item, amount: amount.value, date: val('ne_date') || taipeiToday(), category: val('ne_cat'), method: val('ne_method'), payer: val('ne_payer'),
      vendor_name: val('ne_vendor'), invoice_no: val('ne_inv'), receipt: $('ne_receipt').checked ? '有' : '沒有', note: val('ne_note')
    };
    if (!id) {
      if (!send('create', { table: 'expenses', row: Object.assign({ activity_id: a.id }, row) })) return;
      closeDrawer();
      toast('已記下');
      return;
    }
    if (!send('update', { table: 'expenses', row: Object.assign({ id }, row) })) return;
    App.ui.drawer.edit = false;
    render({ freshDrawer: true });
    toast('支出已更新');
  }

  /* ---------- 事件 ---------- */
  document.addEventListener('click', ev => {
    const actEl = ev.target.closest('[data-act]');
    if (actEl && !actEl.disabled && App.phase === 'ready' || (actEl && actEl.dataset.act === 'retry')) {
      const fn = actions[actEl.dataset.act];
      if (fn) { ev.preventDefault(); fn(actEl); }
      return;
    }
    const link = ev.target.closest('[data-href]');
    if (link && !link.disabled) { ev.preventDefault(); navigate(link.dataset.href); }
  });
  document.addEventListener('change', ev => {
    const t = ev.target;
    if (t.matches('select[data-filter]')) setQuery(t.dataset.filter, t.value);
    if (t.matches('[data-act-id-src]') && $('na_id')) $('na_id').value = D.activityIdFor(val('na_type'), val('na_year'), db().activities.map(a => a.id));
  });
  document.addEventListener('input', ev => {
    if (ev.target.id === 'q' || ev.target.id === 'q2') onSearchInput(ev.target);
    if (ev.target.matches('[data-act-id-src]') && $('na_id')) $('na_id').value = D.activityIdFor(val('na_type'), val('na_year'), db().activities.map(a => a.id));
  });
  document.addEventListener('submit', ev => {
    if (ev.target.id !== 'loginForm') return;
    ev.preventDefault();
    api.setToken(val('token'));
    App.loginError = '';
    start();
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && App.ui.drawer) { closeDrawer(); return; }
    if (ev.key === 'Enter' && ev.target.matches('tr[tabindex]')) { ev.preventDefault(); ev.target.click(); }
    if (ev.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { const q = $('q'); if (q && q.offsetParent) { ev.preventDefault(); q.focus(); } }
  });
  root.addEventListener('hashchange', () => { if (App.phase === 'ready') applyRoute(); });

  boot();
})(window);

/* 活動工作台 v2：前端資料狀態（不碰畫面）。
 * confirmed：後端確認過的資料；pending：已送出、等後端回覆的寫入。
 * 畫面看到的 = confirmed 再依序套上 pending（用 V2Domain.applyWrite），所以寫入可以先顯示，
 * 後端說不行時只要把那筆 pending 拿掉，畫面自然回到原狀（樂觀更新＋回復）。
 *
 * 後端回傳格式（event-accounting/v2/gas/Api.gs）：
 *   bootstrap：{ db: { 主檔＋未結案活動的各表 }, open: [活動 id], summaries, recent: [最近 activity_log] }
 *   activity ：{ db: { 主檔＋這場活動的各表 }, summaries, log: [這場的 activity_log] } */
(function (root) {
  'use strict';
  const D = root.V2Domain;
  const api = root.V2Api;
  const TABLES = Object.keys(D.TABLE_PREFIX);
  const MASTER = ['activities', 'vendors', 'budget_categories', 'staff'];

  const clone = value => JSON.parse(JSON.stringify(value));
  const emptyDb = () => TABLES.reduce((db, t) => { db[t] = []; return db; }, {});

  let confirmed = emptyDb();
  let view = emptyDb();
  let pending = [];
  let summaries = {};
  let version = null;
  let seq = 0;
  let sending = false;
  const loaded = new Set();
  const logLoaded = new Set();
  const loading = new Map();
  const idMap = {};
  const listeners = [];

  function emit(event) { listeners.forEach(fn => { try { fn(event); } catch (e) { console.error(e); } }); }
  function subscribe(fn) { listeners.push(fn); }

  function taipeiNow() {
    const d = new Date(Date.now() + 8 * 3600 * 1000);
    return d.toISOString().slice(0, 19) + '+08:00';
  }
  function ctxFor(p) {
    const now = taipeiNow();
    let n = 0;
    let mainUsed = false;
    return {
      now, today: now.slice(0, 10), allowLocked: !!p.allowLocked,
      idFor: table => {
        if (table === p.mainTable && !mainUsed) { mainUsed = true; return p.realId || p.tmpId; }
        return p.key + '-' + table + '-' + (n++);
      }
    };
  }

  function upsert(db, table, row) {
    if (!row || !row.id || !db[table]) return;
    const rows = db[table];
    const i = rows.findIndex(r => r.id === row.id);
    if (i === -1) rows.push(clone(row)); else rows[i] = clone(row);
  }

  /* 把一場活動的資料換成後端給的最新版（主檔整批換掉，這場的各表只換這場的列）。 */
  function mergeActivity(data, activityId) {
    const src = data.db || {};
    MASTER.forEach(t => { if (Array.isArray(src[t])) confirmed[t] = clone(src[t]); });
    const oldLines = new Set(confirmed.budget_lines.filter(l => l.activity_id === activityId).map(l => l.id));
    const oldReqs = new Set(confirmed.payment_requests.filter(r => r.activity_id === activityId).map(r => r.id));
    TABLES.forEach(t => {
      if (MASTER.indexOf(t) !== -1 || t === 'activity_log' || !Array.isArray(src[t])) return;
      const belongs = t === 'quotes' ? r => oldLines.has(r.line_id)
        : t === 'request_lines' ? r => oldReqs.has(r.request_id)
          : r => r.activity_id === activityId;
      confirmed[t] = confirmed[t].filter(r => !belongs(r)).concat(clone(src[t]));
    });
    if (Array.isArray(data.log)) {
      confirmed.activity_log = confirmed.activity_log.filter(g => g.activity_id !== activityId).concat(clone(data.log));
      logLoaded.add(activityId);
    }
    Object.assign(summaries, data.summaries || {});
    loaded.add(activityId);
  }

  function loadBootstrap(data) {
    const src = data.db || {};
    confirmed = emptyDb();
    loaded.clear();
    logLoaded.clear();
    TABLES.forEach(t => { if (Array.isArray(src[t])) confirmed[t] = clone(src[t]); });
    if (Array.isArray(data.recent)) confirmed.activity_log = clone(data.recent);
    (data.open || confirmed.activities.filter(a => !a.closed_at).map(a => a.id)).forEach(id => loaded.add(id));
    summaries = data.summaries || {};
  }

  function recompute() {
    const next = clone(confirmed);
    pending.forEach(p => {
      try { D.applyWrite(next, p.op, p.args, ctxFor(p)); } catch (e) { p.localError = e.message; }
    });
    view = next;
  }

  function remapValue(value) {
    if (typeof value === 'string') return idMap[value] || value;
    if (Array.isArray(value)) return value.map(remapValue);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).forEach(k => { out[k] = remapValue(value[k]); });
      return out;
    }
    return value;
  }

  function bootstrap() {
    return api.bootstrap().then(res => {
      version = res.version;
      loadBootstrap(res.data || {});
      recompute();
      emit({ type: 'change' });
      return res;
    });
  }

  /* 讀一場活動的完整資料（含全部動態紀錄）。已結案的活動 bootstrap 沒有帶，要用這個讀。 */
  function ensureActivity(id, force) {
    if (!force && loaded.has(id) && logLoaded.has(id)) return Promise.resolve();
    if (loading.has(id)) return loading.get(id);
    const job = api.activity(id).then(res => {
      mergeActivity(res.data || {}, id);
      recompute();
      emit({ type: 'change' });
    }).finally(() => loading.delete(id));
    loading.set(id, job);
    return job;
  }

  function mainTableOf(op, args) {
    if (op === 'create') return args.table;
    if (op === 'add_quote') return 'quotes';
    return null;
  }

  /* 送出一筆寫入。回傳 { id, done }：id 是新列的暫時編號（後端回來後會換成正式編號，並發出 idmap 事件）。
   * 資料在本機就不合規時，直接回傳被拒絕的 done，不送後端。 */
  function write(op, args, options) {
    const opts = options || {};
    const key = 'tmp' + (++seq) + Date.now().toString(36);
    const mainTable = mainTableOf(op, args);
    const p = {
      key, op, args: clone(remapValue(args || {})), mainTable, cid: api.clientId(), allowLocked: !!opts.allowLocked,
      tmpId: mainTable ? key + '-' + mainTable : null, label: opts.label || ''
    };
    if (op === 'create' && p.args.row && p.args.row.id) p.tmpId = p.args.row.id;
    try {
      const probe = clone(view);
      D.applyWrite(probe, p.op, p.args, ctxFor(p));
    } catch (e) {
      return { id: null, rejected: true, done: Promise.reject(new api.ApiError(e.message, 'local')) };
    }
    p.done = new Promise((resolve, reject) => { p.resolve = resolve; p.reject = reject; });
    pending.push(p);
    /* 新建的活動本來就沒有其他資料，不用再向後端讀一次。 */
    if (op === 'create' && p.args.table === 'activities' && p.tmpId) { loaded.add(p.tmpId); logLoaded.add(p.tmpId); }
    recompute();
    emit({ type: 'change' });
    pump();
    return { id: p.tmpId, rejected: false, done: p.done };
  }

  function pump() {
    if (sending || !pending.length) return;
    const p = pending[0];
    sending = true;
    p.args = remapValue(p.args);
    api.write(p.op, p.args, p.cid).then(res => {
      const data = res.data || {};
      const row = data.row || null;
      if (res.version != null) version = res.version;
      if (p.tmpId && row && row.id && row.id !== p.tmpId) {
        idMap[p.tmpId] = row.id;
        p.realId = row.id;
        pending.forEach(q => { q.args = remapValue(q.args); });
        emit({ type: 'idmap', from: p.tmpId, to: row.id });
      } else if (p.tmpId) {
        p.realId = p.tmpId;
      }
      let table = null;
      try { table = D.applyWrite(confirmed, p.op, p.args, ctxFor(p)).table; } catch (e) { console.warn('套用已確認的寫入時出錯', e); }
      if (row) upsert(confirmed, table || p.mainTable || (p.args && p.args.table), row);
      if (data.rows && typeof data.rows === 'object' && !Array.isArray(data.rows)) {
        Object.keys(data.rows).forEach(t => (data.rows[t] || []).forEach(r => upsert(confirmed, t, r)));
      }
      pending = pending.filter(q => q !== p);
      if (data.replayed) emit({ type: 'stale' });
      p.resolve({ id: p.realId || null, data });
    }).catch(err => {
      pending = pending.filter(q => q !== p);
      /* 依賴這筆新列的後續寫入也一起取消，避免送出指向不存在資料的請求。 */
      if (p.tmpId && p.tmpId.indexOf(p.key) === 0) {
        const dependent = pending.filter(q => JSON.stringify(q.args).indexOf(p.tmpId) !== -1);
        pending = pending.filter(q => dependent.indexOf(q) === -1);
        dependent.forEach(q => q.reject(new api.ApiError('前一筆沒有存成功，這筆也取消了', 'dependent')));
      }
      p.reject(err);
      emit({ type: 'error', error: err, op: p.op, label: p.label });
    }).finally(() => {
      sending = false;
      recompute();
      emit({ type: 'change' });
      pump();
    });
  }

  root.V2Store = {
    subscribe, bootstrap, ensureActivity, write,
    db: () => view,
    summary: id => summaries[id] || null,
    isLoaded: id => loaded.has(id),
    isLoading: id => loading.has(id),
    pendingCount: () => pending.length,
    version: () => version,
    realId: id => idMap[id] || id
  };
})(typeof window !== 'undefined' ? window : globalThis);

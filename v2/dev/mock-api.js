/* 本機模擬後端：只在網址帶 ?mock=1 時載入，回應格式與 SPEC 第 5 節相同。
 * 資料全部是虛構的範例（○○大飯店、星光公關…），不是任何真實公司的帳。
 * 資料存在這個分頁的 sessionStorage，重新整理不會消失；網址加 &reset=1 重設。
 * 網址加 &mockfail=<op> 會讓那個寫入 op 第一次被拒絕，用來測試畫面的回復。 */
(function (root) {
  'use strict';
  const D = root.V2Domain;
  const STORE_KEY = 'v2.mockDb';
  const params = new URLSearchParams(root.location.search);
  const failOps = new Set((params.get('mockfail') || '').split(',').filter(Boolean));
  const clone = v => JSON.parse(JSON.stringify(v));

  const T = (d, time) => d + 'T' + (time || '10:00:00') + '+08:00';

  function seed() {
    const db = {};
    Object.keys(D.TABLE_PREFIX).forEach(t => { db[t] = []; });
    const stamp = rows => rows.map(r => Object.assign({ created_at: T('2026-06-01'), updated_at: T('2026-06-01') }, r));

    db.activities = stamp([
      { id: 'yearend2026', name: '2026 尾牙', type: '尾牙', plan_year: 2026, date: '2027-01-15', venue: '○○大飯店 宴會廳', address: '示範市示範路 1 號',
        est_headcount: 320, budget_status: '已核准', budget_submitted_at: '2026-09-18', budget_approved_at: '2026-09-20', approved_total: 663000,
        petty_advance: 30000, petty_requested_at: '2026-09-15', close_stage: '未開始', allocation_method: '人數比例', source: '範例' },
      { id: 'family2026', name: '2026 家庭日', type: '家庭日', plan_year: 2026, date: '2026-12-06', venue: '樂遊農場', est_headcount: 150,
        budget_status: '草稿', close_stage: '未開始', source: '範例' },
      { id: 'midyear2026', name: '2026 年中聚餐', type: '年中聚餐', plan_year: 2026, date: '2026-07-10', venue: '○○大飯店', est_headcount: 210, actual_headcount: 205,
        budget_status: '已核准', budget_submitted_at: '2026-05-20', budget_approved_at: '2026-05-25', approved_total: 258000, petty_advance: 10000,
        close_stage: '已結案', locked_at: T('2026-07-20'), replied_at: T('2026-07-22'), settled_at: T('2026-07-25'), closed_at: T('2026-07-25', '15:00:00'),
        settle_direction: '回沖', settle_amount_expected: 7600, settle_amount_actual: 7600, source: '範例' },
      { id: 'yearend2025', name: '2025 尾牙', type: '尾牙', plan_year: 2025, date: '2026-01-16', venue: '○○大飯店 宴會廳', est_headcount: 300, actual_headcount: 296,
        budget_status: '已核准', budget_submitted_at: '2025-09-20', budget_approved_at: '2025-09-28', approved_total: 597000, petty_advance: 25000,
        close_stage: '已結案', locked_at: T('2026-01-25'), replied_at: T('2026-01-28'), settled_at: T('2026-02-03'), closed_at: T('2026-02-03', '15:00:00'),
        settle_direction: '回沖', settle_amount_expected: 21800, settle_amount_actual: 21800, source: '範例' }
    ]);
    db.vendors = stamp([
      { id: '12345678', name: '○○大飯店股份有限公司', short_name: '○○大飯店', tax_id: '12345678', remit_status: '使用中', remit_doc_url: 'https://example.com/remit-hotel.pdf', quote_doc_url: 'https://example.com/quote-hotel.pdf' },
      { id: '23456789', name: '星光公關有限公司', short_name: '星光公關', tax_id: '23456789', remit_status: '使用中', remit_doc_url: 'https://example.com/remit-star.pdf', quote_doc_url: 'https://example.com/quote-star.pdf' },
      { id: '34567890', name: '大印刷廠', short_name: '大印刷廠', tax_id: '34567890', remit_status: '使用中', quote_doc_url: 'https://example.com/quote-print.pdf' },
      { id: '45678901', name: '光影攝影工作室', short_name: '光影攝影', tax_id: '45678901', remit_status: '未登記' },
      { id: '56789012', name: '樂遊農場', short_name: '樂遊農場', tax_id: '56789012', remit_status: '未登記' }
    ]);
    db.budget_categories = ['場地', '公關／表演', '場地布置', '攝影', '印刷品', '識別證', '酒水', '獎金-抽獎', '獎金-遊戲', '獎牌', '紀念禮物', '活動零用金', '其他']
      .map((name, i) => ({ id: 'C-' + String(i + 1).padStart(6, '0'), name, order: i + 1, active: 'TRUE' }));
    db.staff = stamp([
      { id: 'S-000001', name: '小明', default_group: '總務', active: 'TRUE' },
      { id: 'S-000002', name: '小華', default_group: '主持', active: 'TRUE' },
      { id: 'S-000003', name: '阿傑', default_group: '場控', active: 'TRUE' }
    ]);
    const L = (n, activity_id, vendor_id, category, item, approved_amount, extra) => Object.assign({ id: 'L-' + String(n).padStart(6, '0'), activity_id, vendor_id, category, item, approved_amount, order: n }, extra || {});
    db.budget_lines = stamp([
      L(1, 'yearend2026', '12345678', '場地', '桌菜 32 桌', 480000, { unit_price: 15200, qty: 32, payment_terms: '訂金 10 萬，餘款活動後 30 天' }),
      L(2, 'yearend2026', '23456789', '公關／表演', '主持與表演', 150000, { invoice_received_at: '2026-09-25' }),
      L(3, 'yearend2026', '34567890', '識別證', '識別證 350 張', 8000, { unit_price: 21, qty: 350 }),
      L(4, 'yearend2026', '45678901', '攝影', '全程攝影', 25000),
      Object.assign(L(5, 'yearend2026', '23456789', '公關／表演', '開場動畫', undefined), { created_at: T('2026-09-26') }),
      L(6, 'family2026', '56789012', '場地', '場地包場', undefined),
      L(7, 'family2026', '34567890', '印刷品', '活動手冊', undefined),
      L(8, 'midyear2026', '12345678', '場地', '自助餐', 258000, { invoice_received_at: '2026-07-10' }),
      L(9, 'yearend2025', '12345678', '場地', '桌菜 30 桌', 450000, { invoice_received_at: '2026-01-16' }),
      L(10, 'yearend2025', '23456789', '公關／表演', '主持與表演', 140000, { invoice_received_at: '2026-01-16' }),
      L(11, 'yearend2025', '34567890', '識別證', '識別證 320 張', 6800, { invoice_received_at: '2025-12-20' })
    ]).map(l => { if (l.approved_amount === undefined) delete l.approved_amount; return l; });
    const Q = (n, line, amount, quoted_at, reason) => ({ id: 'Q-' + String(n).padStart(6, '0'), line_id: 'L-' + String(line).padStart(6, '0'), amount, quoted_at, reason });
    db.quotes = stamp([
      Q(1, 1, 480000, '2026-09-10', '第一次報價 30 桌'), Q(2, 1, 512000, '2026-09-24', '高層要加到 34 桌'), Q(3, 1, 486400, '2026-09-27', '改回 32 桌，菜色升級'),
      Q(4, 2, 150000, '2026-09-12', '第一次報價'),
      Q(5, 3, 8000, '2026-09-12', '第一次報價 400 張'), Q(6, 3, 7350, '2026-09-25', '人數確定，改 350 張'),
      Q(7, 4, 25000, '2026-09-15', '第一次報價'),
      Q(8, 5, 30000, '2026-09-26', '簽呈後高層加的'),
      Q(9, 8, 258000, '2026-06-02', '第一次報價'),
      Q(10, 9, 450000, '2025-10-01', '第一次報價'), Q(11, 9, 452000, '2025-12-10', '加 2 桌素食'),
      Q(12, 10, 140000, '2025-10-05', '第一次報價'), Q(13, 11, 6800, '2025-11-20', '第一次報價')
    ]);
    const R = (n, activity_id, request_no, payee_vendor_id, stage, amount, status, due_date, extra) => Object.assign({ id: 'R-' + String(n).padStart(6, '0'), activity_id, request_no, payee_vendor_id, stage, amount, status, due_date }, extra || {});
    db.payment_requests = stamp([
      R(1, 'yearend2026', 'PR-2026-012', '12345678', '訂金', 100000, '公司已匯款', '2026-09-30', { purpose: '尾牙桌菜訂金', requested_at: '2026-09-18', paid_at: '2026-09-28' }),
      R(2, 'yearend2026', 'PR-2026-014', '23456789', '訂金', 45000, '已申請', '2026-10-15', { purpose: '主持表演訂金', requested_at: '2026-09-26' }),
      R(3, 'midyear2026', 'PR-2026-009', '12345678', '全額', 258000, '公司已匯款', '2026-07-05', { requested_at: '2026-06-20', paid_at: '2026-07-03' }),
      R(4, 'yearend2025', 'PR-2025-031', '12345678', '訂金', 100000, '公司已匯款', '2025-11-01', { requested_at: '2025-10-20', paid_at: '2025-10-30' }),
      R(5, 'yearend2025', 'PR-2026-002', '12345678', '尾款', 352000, '公司已匯款', '2026-01-15', { requested_at: '2026-01-05', paid_at: '2026-01-14' }),
      R(6, 'yearend2025', 'PR-2025-036', '23456789', '全額', 140000, '公司已匯款', '2025-12-20', { requested_at: '2025-12-01', paid_at: '2025-12-18' }),
      R(7, 'yearend2025', 'PR-2025-038', '34567890', '全額', 6800, '公司已匯款', '2025-12-25', { requested_at: '2025-12-10', paid_at: '2025-12-22' }),
      R(8, 'yearend2025', 'PR-2026-005', undefined, '回沖', 21800, '公司已匯款', undefined, { payee_name: '公司（零用金回沖）', requested_at: '2026-01-28', paid_at: '2026-02-03' })
    ]).map(r => { Object.keys(r).forEach(k => r[k] === undefined && delete r[k]); return r; });
    const RL = (n, req, line, amount) => ({ id: 'RL-' + String(n).padStart(6, '0'), request_id: 'R-' + String(req).padStart(6, '0'), line_id: 'L-' + String(line).padStart(6, '0'), amount });
    db.request_lines = stamp([RL(1, 1, 1, 100000), RL(2, 2, 2, 45000), RL(3, 3, 8, 258000), RL(4, 4, 9, 100000), RL(5, 5, 9, 352000), RL(6, 6, 10, 140000), RL(7, 7, 11, 6800)]);
    const E = (n, activity_id, date, item, category, amount, method, status, source, extra) => Object.assign({ id: 'E-' + String(n).padStart(6, '0'), activity_id, date, item, category, amount, method, status, source }, extra || {});
    db.expenses = stamp([
      E(1, 'yearend2026', '2026-09-20', '場勘計程車', '場地', 385, '個人代墊', '待核銷', '網頁', { payer: '小明', receipt: '有' }),
      E(2, 'yearend2026', '2026-09-26', '全家 飲料', undefined, 1240, '活動零用金', '待確認', 'ChatGPT', { suggested_category: '酒水', receipt: '沒有', vendor_name: '全家' }),
      E(3, 'yearend2026', '2026-09-27', '計程車', undefined, 410, '個人代墊', '待確認', 'ChatGPT', { suggested_category: '場地', payer: '小明', receipt: '有' }),
      E(4, 'yearend2026', '2026-09-27', '計程車（場勘）', '場地', 410, '個人代墊', '待核銷', '網頁', { payer: '小明', receipt: '沒有' }),
      E(5, 'midyear2026', '2026-07-10', '自助餐尾款', '場地', 258000, '公司轉帳', '已核銷', 'ChatGPT', { request_id: 'R-000003', receipt: '有', vendor_id: '12345678' }),
      E(6, 'midyear2026', '2026-07-10', '飲料冰塊', '酒水', 2400, '活動零用金', '已核銷', '網頁', { receipt: '有' }),
      E(7, 'yearend2025', '2026-01-16', '桌菜 30 桌', '場地', 452000, '公司轉帳', '已核銷', '歷史', { vendor_id: '12345678' }),
      E(8, 'yearend2025', '2026-01-16', '主持與表演', '公關／表演', 140000, '公司轉帳', '已核銷', '歷史', { vendor_id: '23456789' }),
      E(9, 'yearend2025', '2025-12-20', '識別證 320 張', '識別證', 6800, '公司轉帳', '已核銷', '歷史', { vendor_id: '34567890' }),
      E(10, 'yearend2025', '2026-01-16', '現場飲料冰塊', '酒水', 3200, '活動零用金', '已核銷', '歷史', { receipt: '有' })
    ]).map(e => { Object.keys(e).forEach(k => e[k] === undefined && delete e[k]); return e; });
    db.prizes = stamp([
      { id: 'P-000001', activity_id: 'yearend2026', purpose: '抽獎', name: '頭獎', fund_source: '公司', form: '現金', unit_amount: 20000, slots: 1, budget_amount: 20000, presenter: '總經理', status: '已確認', category: '獎金-抽獎' },
      { id: 'P-000002', activity_id: 'yearend2026', purpose: '抽獎', name: '二獎', fund_source: '公司', form: '現金', unit_amount: 10000, slots: 3, budget_amount: 30000, presenter: '副總經理', status: '已確認', category: '獎金-抽獎' },
      { id: 'P-000003', activity_id: 'yearend2026', purpose: '遊戲', name: '闖關冠軍隊', fund_source: '公司', form: '禮券', unit_amount: 5000, slots: 1, budget_amount: 5000, status: '規劃中', category: '獎金-遊戲' },
      { id: 'P-000004', activity_id: 'yearend2026', purpose: '表揚', name: '資深員工獎牌', fund_source: '公司', form: '實物', unit_amount: 800, slots: 10, budget_amount: 8000, presenter: '董事長', status: '規劃中', category: '獎牌' }
    ]);
    db.rundown_config = stamp([{ id: 'RC-000001', activity_id: 'yearend2026', formal_start: '17:30', rehearsal_mode: '有', rehearsal_start: '15:00', rehearsal_buffer_min: 30 }]);
    const SG = (n, anchor_time, duration_min, content, phase, prize_ids) => ({ id: 'SG-' + String(n).padStart(6, '0'), activity_id: 'yearend2026', order: n, anchor_time, duration_min, content, phase, prize_ids });
    db.rundown_segments = stamp([
      SG(1, '17:30', 30, '報到入場', '會前'), SG(2, '18:00', 10, '開場動畫', '開場'), SG(3, '18:10', 15, '長官致詞', '開場'),
      SG(4, '18:25', 60, '用餐與表演', '主節目'), SG(5, '19:25', 30, '抽獎', '主節目', 'P-000001,P-000002'), SG(6, '19:55', 5, '散場', '收尾')
    ]).map(s => { if (!s.prize_ids) delete s.prize_ids; return s; });
    const DR = (n, activity_id, category, item_name, ml, ordered, consumed, unit_price) => ({ id: 'D-' + String(n).padStart(6, '0'), activity_id, category, item_name, unit_capacity_ml: ml,
      package_unit: '箱', inventory_unit: '瓶', ordered_units: ordered, consumed_units: consumed, remaining_units: ordered - consumed, unit_price, line_amount: ordered * unit_price, data_quality: '完整' });
    db.drink_records = stamp([
      DR(1, 'yearend2025', '啤酒', '示範啤酒 330ml', 330, 288, 240, 35), DR(2, 'yearend2025', '果汁', '柳橙汁 1L', 1000, 72, 60, 45), DR(3, 'yearend2025', '汽水', '汽水 600ml', 600, 96, 80, 25),
      DR(4, 'midyear2026', '啤酒', '示範啤酒 330ml', 330, 192, 150, 35), DR(5, 'midyear2026', '果汁', '柳橙汁 1L', 1000, 48, 41, 45)
    ]);
    db.drink_plans = stamp([
      { id: 'DP-000001', activity_id: 'yearend2026', category: '啤酒', baseline_liters: 79.2, safety_rate: 0.1, planned_liters: 90 },
      { id: 'DP-000002', activity_id: 'yearend2026', category: '果汁', baseline_liters: 60, safety_rate: 0.1, planned_liters: 66 }
    ]);
    const G = (n, activity_id, day, text) => ({ id: 'G-' + String(n).padStart(6, '0'), activity_id, at: T(day), entity: 'activities', entity_id: activity_id, action: '修改', text });
    db.activity_log = [
      G(1, 'yearend2026', '2026-09-18', '預算已提報'), G(2, 'yearend2026', '2026-09-20', '預算已核准'),
      G(3, 'yearend2026', '2026-09-26', '星光公關訂金申請單已申請'), G(4, 'yearend2026', '2026-09-27', '○○大飯店更新報價為 486,400'),
      G(5, 'midyear2026', '2026-07-20', '完成核銷並鎖定')
    ];
    return db;
  }

  let db;
  function save() { try { root.sessionStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (_) { /* 只留在記憶體 */ } }
  function load() {
    if (params.get('reset') !== '1') {
      try { const raw = root.sessionStorage.getItem(STORE_KEY); if (raw) return JSON.parse(raw); } catch (_) { /* 用範例資料 */ }
    }
    return seed();
  }
  db = load();
  save();

  let version = 1;
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const alive = r => r && !r.deleted_at;

  /* 以下對應後端 v2/gas/Api.gs 的回傳格式。 */
  const MASTER = ['activities', 'vendors', 'budget_categories', 'staff'];
  const ACTIVITY_TABLES = Object.keys(D.TABLE_PREFIX).filter(t => MASTER.indexOf(t) === -1 && ['quotes', 'request_lines', 'activity_log'].indexOf(t) === -1);

  function dbFor(ids) {
    const keep = new Set(ids);
    const out = {};
    MASTER.forEach(t => { out[t] = clone(db[t].filter(alive)); });
    ACTIVITY_TABLES.forEach(t => { out[t] = clone((db[t] || []).filter(r => alive(r) && keep.has(r.activity_id))); });
    const lineIds = new Set(out.budget_lines.map(l => l.id));
    const reqIds = new Set(out.payment_requests.map(r => r.id));
    out.quotes = clone(db.quotes.filter(q => alive(q) && lineIds.has(q.line_id)));
    out.request_lines = clone(db.request_lines.filter(rl => alive(rl) && reqIds.has(rl.request_id)));
    return out;
  }

  function summariesFor(part, ids) {
    const out = {};
    ids.forEach(id => {
      const a = part.activities.find(x => x.id === id);
      if (a) out[id] = { summary: D.activitySummary(a, part), petty: D.pettySettlement(a, part.expenses), todo: D.todoCounts(part, id) };
    });
    return out;
  }

  function history() {
    const byActivity = {};
    db.expenses.filter(e => alive(e) && e.status !== '待確認').forEach(e => {
      const bucket = byActivity[e.activity_id] || (byActivity[e.activity_id] = {});
      const cat = e.category || '未分類';
      bucket[cat] = (bucket[cat] || 0) + (D.num(e.amount) || 0);
    });
    return {
      activities: db.activities.filter(alive).map(a => ({ id: a.id, name: a.name, type: a.type, plan_year: a.plan_year, date: a.date,
        est_headcount: a.est_headcount, actual_headcount: a.actual_headcount, approved_total: a.approved_total, closed_at: a.closed_at, categories: byActivity[a.id] || {} })),
      budget_categories: clone(db.budget_categories.filter(alive)),
      drink_records: clone(db.drink_records.filter(alive))
    };
  }

  function search(q) {
    const needle = String(q || '').trim().toLowerCase();
    if (!needle) return { results: [] };
    const hit = row => Object.keys(row).some(k => String(row[k]).toLowerCase().indexOf(needle) !== -1);
    const results = [];
    ['activities', 'vendors', 'budget_lines', 'payment_requests', 'expenses', 'prizes'].forEach(t => {
      db[t].filter(r => alive(r) && hit(r)).slice(0, 50).forEach(row => results.push({ table: t, row: clone(row) }));
    });
    return { results: results.slice(0, 200) };
  }

  const ok = data => ({ ok: true, data, version });
  const nowIso = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 19) + '+08:00';

  function get(action, p) {
    return delay(120).then(() => {
      if (action === 'bootstrap') {
        const open = db.activities.filter(a => alive(a) && !a.closed_at).map(a => a.id);
        const part = dbFor(open);
        return ok({ db: part, open, summaries: summariesFor(part, open), recent: clone(db.activity_log.slice(-20).reverse()) });
      }
      if (action === 'activity') {
        if (!db.activities.some(a => a.id === p.id && alive(a))) return { ok: false, error: '找不到活動：' + p.id };
        const part = dbFor([p.id]);
        return ok({ db: part, summaries: summariesFor(part, [p.id]), log: clone(db.activity_log.filter(g => g.activity_id === p.id)) });
      }
      if (action === 'history') return ok(history());
      if (action === 'search') return ok(search(p.q));
      return { ok: false, error: '不支援的讀取：' + action };
    });
  }

  function post(body) {
    return delay(350).then(() => {
      if (!body || !body.op) return { ok: false, error: '不支援的動作：' };
      if (body.client_id && db.activity_log.some(g => g.client_id === body.client_id)) return ok({ replayed: true });
      if (failOps.has(body.op)) { failOps.delete(body.op); return { ok: false, error: '模擬後端刻意拒絕這次「' + body.op + '」，用來測試回復' }; }
      try {
        const now = nowIso();
        const logCount = db.activity_log.length;
        const result = D.applyWrite(db, body.op, clone(body.args || {}), { now, today: now.slice(0, 10) });
        db.activity_log.slice(logCount).forEach(g => { g.client_id = body.client_id; });
        version += 1;
        save();
        return ok(body.op === 'delete' ? { id: result.row.id } : { row: clone(result.row) });
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
  }

  root.V2Api.useTransport({ get, post });
  root.V2Mock = { reset: () => { db = seed(); save(); }, db: () => db };
})(window);

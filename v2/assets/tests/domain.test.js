const assert = require('assert');
const D = require('../domain.js');

const db = {
  activities: [{ id: 'yearend2026', petty_advance: 30000, approved_total: 663000, budget_approved_at: '2026-09-20' }],
  budget_categories: [{ name: '場地', order: 1 }, { name: '公關／表演', order: 2 }, { name: '攝影', order: 4 }],
  budget_lines: [
    { id: 'L-000001', activity_id: 'yearend2026', category: '場地', item: '桌菜', approved_amount: 480000 },
    { id: 'L-000002', activity_id: 'yearend2026', category: '公關／表演', item: '主持', approved_amount: 150000, invoice_received_at: '2026-09-25' },
    { id: 'L-000003', activity_id: 'yearend2026', category: '攝影', item: '攝影', approved_amount: 25000 },
    { id: 'L-000004', activity_id: 'yearend2026', category: '公關／表演', item: '開場動畫' }
  ],
  quotes: [
    { id: 'Q-1', line_id: 'L-000001', amount: 480000, quoted_at: '2026-09-10' },
    { id: 'Q-2', line_id: 'L-000001', amount: 486400, quoted_at: '2026-09-27', reason: '菜色升級' },
    { id: 'Q-3', line_id: 'L-000002', amount: 150000, quoted_at: '2026-09-12' },
    { id: 'Q-4', line_id: 'L-000004', amount: 30000, quoted_at: '2026-09-26' }
  ],
  payment_requests: [
    { id: 'R-1', activity_id: 'yearend2026', amount: 100000, status: '公司已匯款' },
    { id: 'R-2', activity_id: 'yearend2026', amount: 45000, status: '已申請' },
    { id: 'R-3', activity_id: 'yearend2026', amount: 386400, status: '待申請' }
  ],
  request_lines: [
    { request_id: 'R-1', line_id: 'L-000001', amount: 100000 },
    { request_id: 'R-3', line_id: 'L-000001', amount: 386400 },
    { request_id: 'R-2', line_id: 'L-000002', amount: 45000 }
  ],
  expenses: [
    { id: 'E-1', activity_id: 'yearend2026', date: '2026-09-20', amount: 385, method: '個人代墊', status: '待核銷', receipt: '有', category: '場地' },
    { id: 'E-2', activity_id: 'yearend2026', date: '2026-09-27', amount: 410, method: '個人代墊', status: '待核銷', receipt: '沒有', category: '場地' },
    { id: 'E-3', activity_id: 'yearend2026', date: '2026-09-27', amount: 410, method: '個人代墊', status: '待確認', category: '' },
    { id: 'E-4', activity_id: 'yearend2026', date: '2026-09-26', amount: 1240, method: '活動零用金', status: '待核銷', receipt: '有', category: '酒水' },
    { id: 'E-5', activity_id: 'yearend2026', date: '2026-09-28', amount: 5000, method: '公司轉帳', status: '待核銷', category: '攝影' }
  ]
};

// 編號
assert.strictEqual(D.nextId('L', db.budget_lines), 'L-000005');
assert.strictEqual(D.nextId('R', []), 'R-000001');

// 品項階段
const stage = id => D.lineStage(db.budget_lines.find(l => l.id === id), db);
assert.strictEqual(stage('L-000001'), '付款中');
assert.strictEqual(stage('L-000002'), '付款中');
assert.strictEqual(stage('L-000003'), '待報價');
assert.strictEqual(stage('L-000004'), '已報價');
assert.strictEqual(D.lineStage({ id: 'X', invoice_received_at: '2026-09-01' }, { quotes: [{ line_id: 'X', amount: 10 }] }), '發票已到');
assert.strictEqual(D.lineStage({ id: 'X' }, { quotes: [{ line_id: 'X', amount: 10 }], payment_requests: [{ id: 'R', status: '公司已匯款', amount: 10 }], request_lines: [{ request_id: 'R', line_id: 'X' }] }), '全部付清');

// 付款進度
const pay = D.linePayment(db.budget_lines[0], db);
assert.deepStrictEqual([pay.quote, pay.planned, pay.submitted, pay.paid, pay.remaining], [486400, 486400, 100000, 100000, 0]);

// 重複與收據
assert.strictEqual(D.isPossibleDuplicate(db.expenses[1], db.expenses), true);
assert.strictEqual(D.isPossibleDuplicate(Object.assign({}, db.expenses[1], { not_duplicate: true }), db.expenses), false);
assert.strictEqual(D.isPossibleDuplicate(db.expenses[0], db.expenses), false);
assert.strictEqual(D.needsReceipt(db.expenses[1]), true);
assert.strictEqual(D.needsReceipt(db.expenses[2]), false, '待確認不提示');
assert.strictEqual(D.needsReceipt(db.expenses[4]), false, '公司轉帳不需要');

// 零用金：30000 − 1240 − (385 + 410) = 27965，待確認不算
const petty = D.pettySettlement(db.activities[0], db.expenses);
assert.deepStrictEqual([petty.pettyUsed, petty.advances, petty.balance, petty.direction], [1240, 795, 27965, '回沖']);
assert.strictEqual(D.pettySettlement({ id: 'a', petty_advance: 100 }, [{ activity_id: 'a', method: '活動零用金', amount: 300, status: '待核銷' }]).direction, '補請');

// 總覽數字
const s = D.activitySummary(db.activities[0], db);
assert.strictEqual(s.latest, 486400 + 150000 + 30000);
assert.strictEqual(s.latestDelta, 666400 - 663000);
assert.strictEqual(s.submitted, 145000);
assert.strictEqual(s.paid, 100000);
assert.strictEqual(s.actual, 385 + 410 + 1240 + 5000);
assert.strictEqual(s.quotedLines, 3);

// 依預算項目對照
const cmp = D.categoryComparison(db.activities[0], db);
assert.deepStrictEqual(cmp.map(r => r.category), ['場地', '公關／表演', '攝影', '酒水']);
assert.deepStrictEqual(cmp[1], { category: '公關／表演', approved: 150000, latest: 180000, actual: 0, delta: 30000 });

// 核准後的變動
const changes = D.changesSinceApproval(db.activities[0], db);
assert.deepStrictEqual(changes.map(c => [c.line.id, c.delta, c.added]), [['L-000001', 6400, false], ['L-000004', 30000, true]]);

// 活動狀態
assert.strictEqual(D.activityState({}), '籌備中');
assert.strictEqual(D.activityState({ locked_at: 'x' }), '核銷中');
assert.strictEqual(D.closeStage({ locked_at: 'x', replied_at: 'y' }), '已回覆會計');

// 待辦
const todo = D.todoCounts(db);
assert.deepStrictEqual(todo, { invoice: 0, draftRequest: 1, confirm: 1, duplicate: 2, receipt: 1, waitPay: 1, closing: 0 });

// 回沖、補請、零用金不算進已申請／已匯款
const s2 = D.activitySummary(db.activities[0], Object.assign({}, db, {
  payment_requests: db.payment_requests.concat([{ id: 'R-9', activity_id: 'yearend2026', stage: '回沖', amount: 999, status: '公司已匯款' }])
}));
assert.strictEqual(s2.paid, 100000);

// 活動代碼
assert.strictEqual(D.activityIdFor('尾牙', 2027, []), 'yearend2027');
assert.strictEqual(D.activityIdFor('家庭日', '2026', ['family2026']), 'family2026-2');
assert.strictEqual(D.activityIdFor('其他', 2027, ['event2027', 'event2027-2']), 'event2027-3');

// 核銷檢查
const checks = D.closeChecks(db.activities[0], db);
assert.deepStrictEqual(checks.filter(c => !c.ok).map(c => c.key), ['confirm', 'duplicate', 'receipt', 'lines', 'requests']);

// 簽呈文字
const text = D.proposalText({ id: 'yearend2026', name: '2026 尾牙', type: '尾牙', date: '2027-01-15', venue: '某飯店', est_headcount: 320 }, db, { total: 600000, headcount: 300 });
assert.ok(text.startsWith('主　旨：有關 2026 尾牙總費用提報乙案'));
assert.ok(text.includes('2027/01/15'));
assert.ok(text.includes('新臺幣 691,400 元整'), '沒有報價的品項以核准金額計');
assert.ok(text.includes('人均 2,161 元'));
assert.ok(text.includes('上一屆人均 2,000 元'));
assert.ok(D.proposalText({ id: 'x', name: '家庭日', type: '家庭日' }, db).includes('費用擬依活動分攤設定辦理'));

// 歷史分析表（後端 history 回傳 → 畫面欄列）
const table = D.historyTable({
  activities: [
    { id: 'new', name: '新', date: '2027-01-01', est_headcount: 200, categories: { '場地': 900, '酒水': 50 } },
    { id: 'old', name: '舊', date: '2025-01-01', closed_at: '2025-02-01', actual_headcount: 100, est_headcount: 120, categories: { '酒水': 300, '場地': 5000 } },
    { id: 'empty', name: '空', date: '2026-01-01', categories: {} }
  ],
  budget_categories: [{ name: '酒水', order: 2 }, { name: '場地', order: 1 }],
  drink_records: [{ id: 'D1', activity_id: 'old', category: '啤酒', consumed_units: 24, unit_capacity_ml: 330 }]
});
assert.deepStrictEqual(table.columns.map(c => [c.id, c.total, c.headcount, c.perHead]), [['old', 5300, 100, 53], ['new', 950, 200, 5]]);
assert.deepStrictEqual(table.categories, ['場地', '酒水']);
assert.deepStrictEqual(table.drinks, [{ category: '啤酒', liters: { old: 7.9 } }]);

// 流程表時間
const times = D.rundownTimes([
  { id: 'b', order: 2, duration_min: 15 }, { id: 'a', order: 1, duration_min: 30, anchor_time: '17:30' },
  { id: 'c', order: 3, duration_min: 10, anchor_time: '18:30' }, { id: 'd', order: 4, duration_min: 5 }
], '17:00');
assert.deepStrictEqual(times.map(t => t.segment.id + ' ' + t.start + '-' + t.end), ['a 17:30-18:00', 'b 18:00-18:15', 'c 18:30-18:40', 'd 18:40-18:45']);

// 寫入規則（對齊後端 Ops.gs）
const ctx = { now: '2026-09-29T10:00:00+08:00', today: '2026-09-29' };
const w = JSON.parse(JSON.stringify(db));
w.activities[0].budget_status = '已提報';
delete w.activities[0].budget_approved_at;
w.activities.push({ id: 'draft', name: '草稿活動', budget_status: '草稿' });
const created = D.applyWrite(w, 'create', { table: 'budget_lines', row: { activity_id: 'yearend2026', item: '舞台', category: '場地' } }, ctx);
assert.strictEqual(created.row.id, 'L-000005');
assert.strictEqual(created.row.created_at, ctx.now);
assert.strictEqual(w.activity_log.length, 1);
D.applyWrite(w, 'add_quote', { line_id: 'L-000005', amount: 40000 }, ctx);
assert.strictEqual(D.latestQuote('L-000005', w.quotes), 40000);
assert.throws(() => D.applyWrite(w, 'add_quote', { line_id: 'L-000005', amount: -1 }, ctx), /0 以上的整數/);
assert.throws(() => D.applyWrite(w, 'set_budget_status', { activity_id: 'draft', status: '核准' }, ctx), /不正確/);
D.applyWrite(w, 'set_budget_status', { activity_id: 'yearend2026', status: '已核准' }, ctx);
assert.strictEqual(w.activities[0].budget_approved_at, ctx.now);
assert.strictEqual(w.budget_lines.find(l => l.id === 'L-000001').approved_amount, 486400);
assert.strictEqual(w.budget_lines.find(l => l.id === 'L-000003').approved_amount, 25000, '沒有報價的維持原值');
assert.strictEqual(w.activities[0].approved_total, 486400 + 150000 + 30000 + 40000);
assert.throws(() => D.applyWrite(w, 'set_budget_status', { activity_id: 'yearend2026', status: '草稿' }, ctx), /不能退回/);
assert.throws(() => D.applyWrite(w, 'add_quote', { line_id: 'L-000005', amount: 42000 }, ctx), /要寫原因/);
D.applyWrite(w, 'add_quote', { line_id: 'L-000005', amount: 42000, reason: '加燈光' }, Object.assign({}, ctx, { now: '2026-09-30T09:00:00+08:00' }));
assert.deepStrictEqual(D.changesSinceApproval(w.activities[0], w).map(c => c.line.id), ['L-000005']);
D.applyWrite(w, 'update', { table: 'payment_requests', row: { id: 'R-3', status: '公司已匯款', purpose: '尾款' } }, ctx);
assert.deepStrictEqual([w.payment_requests[2].status, w.payment_requests[2].purpose], ['待申請', '尾款'], 'update 不能直接改狀態');
D.applyWrite(w, 'set_request_status', { id: 'R-3', status: '已申請', request_no: 'PR-1' }, ctx);
assert.deepStrictEqual([w.payment_requests[2].status, w.payment_requests[2].requested_at, w.payment_requests[2].request_no], ['已申請', '2026-09-29', 'PR-1']);
assert.throws(() => D.applyWrite(w, 'delete', { table: 'payment_requests', id: 'R-3' }, ctx), /不能刪除/);
const madeReq = D.applyWrite(w, 'create', { table: 'payment_requests', row: { activity_id: 'yearend2026', stage: '追加', amount: 10, status: '公司已匯款' } }, ctx);
assert.strictEqual(madeReq.row.status, '待申請', '新申請單一律待申請');
D.applyWrite(w, 'delete', { table: 'payment_requests', id: madeReq.row.id }, ctx);
assert.ok(madeReq.row.deleted_at);
assert.throws(() => D.applyWrite(w, 'lock_close', { activity_id: 'yearend2026' }, ctx), /待確認/);
D.applyWrite(w, 'confirm_expense', { id: 'E-3', category: '場地' }, ctx);
assert.deepStrictEqual([w.expenses[2].status, w.expenses[2].category], ['待核銷', '場地']);
assert.throws(() => D.applyWrite(w, 'confirm_expense', { id: 'E-3' }, ctx), /確認過/);
const withId = D.applyWrite(w, 'create', { table: 'expenses', row: { activity_id: 'yearend2026', item: '冰塊', amount: 600, method: '活動零用金', date: '2026-09-29' } }, Object.assign({ idFor: () => 'tmp-1' }, ctx));
assert.deepStrictEqual([withId.row.id, withId.row.status, withId.row.source], ['tmp-1', '待核銷', '網頁']);
assert.throws(() => D.applyWrite(w, 'reply_accounting', { activity_id: 'yearend2026' }, ctx), /上一個步驟/);
D.applyWrite(w, 'lock_close', { activity_id: 'yearend2026' }, ctx);
assert.ok(w.expenses.filter(e => e.activity_id === 'yearend2026').every(e => e.status === '已核銷'));
// 30000 − (1240 + 600) − (385 + 410 + 410) = 26955
assert.deepStrictEqual([w.activities[0].settle_direction, w.activities[0].settle_amount_expected], ['回沖', 26955]);
assert.throws(() => D.applyWrite(w, 'update', { table: 'expenses', row: { id: 'E-1', amount: 1 } }, ctx), /鎖定/);
D.applyWrite(w, 'set_request_status', { id: 'R-2', status: '公司已匯款' }, ctx);
D.applyWrite(w, 'reply_accounting', { activity_id: 'yearend2026' }, ctx);
assert.throws(() => D.applyWrite(w, 'reply_accounting', { activity_id: 'yearend2026' }, ctx), /完成過/);
assert.throws(() => D.applyWrite(w, 'settle', { activity_id: 'yearend2026', amount: 26000 }, ctx), /請寫原因/);
D.applyWrite(w, 'settle', { activity_id: 'yearend2026', amount: 26000, note: '手續費' }, ctx);
assert.deepStrictEqual([w.activities[0].settle_amount_actual, w.activities[0].settle_note, D.closeStage(w.activities[0])], [26000, '手續費', '已結清']);
D.applyWrite(w, 'close', { activity_id: 'yearend2026' }, ctx);
assert.strictEqual(D.activityState(w.activities[0]), '已結案');
assert.throws(() => D.applyWrite(w, 'update', { table: 'payment_requests', row: { id: 'R-2', note: 'x' } }, ctx), /已結案/);
assert.throws(() => D.applyWrite(w, 'create', { table: 'nope', row: {} }, ctx), /不能寫入/);
assert.throws(() => D.applyWrite(w, 'create', { table: 'activities', row: { name: '沒代碼' } }, ctx), /活動代碼/);

console.log('v2 domain: all passed');

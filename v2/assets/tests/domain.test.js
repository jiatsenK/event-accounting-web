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

console.log('v2 domain: all passed');

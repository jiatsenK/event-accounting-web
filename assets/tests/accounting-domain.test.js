'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../domain.js');

const activity = {
  budget: 10000,
  petty_cash_advance: 3000,
  budget_items: [{ name: '餐飲', amount: 8000 }, { name: '交通', amount: 2000 }]
};
const expenses = [
  { expense_id: 'e1', date: '2026-08-01', item: '餐費', budget_item: '餐飲', amount: 4000, payment_method: '公司轉帳', reimbursement_status: '待核銷', vendor: '餐廳' },
  { expense_id: 'e2', date: '2026-08-02', item: '車資', category: '車資', budget_item: '交通', amount: 600, payment_method: '活動零用金', reimbursement_status: '待核銷' },
  { expense_id: 'e3', date: '2026-08-03', item: '用品', budget_item: '餐飲', amount: 900, payment_method: '個人代墊', payer: '承辦人', reimbursement_status: '待核銷' }
];

test('總覽摘要維持預算、支出、零用金與待核銷行為', () => {
  const summary = domain.summarizeDashboard(activity, expenses);
  assert.equal(summary.actualExpense, 5500);
  assert.equal(summary.budgetRemaining, 4500);
  // 只算支付方式=活動零用金（e2 的 600）；個人代墊待核銷（e3）不算零用金已使用，
  // 避免核銷狀態一變，零用金已使用金額就跟著縮水（Issue：零用金已使用不要歸零）。
  assert.equal(summary.pettyCashUsed, 600);
  assert.equal(summary.pettyCashRemaining, 2400);
  assert.deepEqual(summary.pendingAdvances, [{ payer: '承辦人', amount: 900 }]);
});

const paymentMethods = ['公司轉帳', '活動零用金', '個人代墊'];

test('支出明細維持欄位驗證與重複檢查', () => {
  const candidate = domain.validateExpense({ activity_id: 'midyear2026', date: '2026-08-01', item: '餐費', budget_item: '餐飲', amount: '4,000', payment_method: '公司轉帳' }, paymentMethods);
  assert.equal(candidate.amount, 4000);
  assert.equal(domain.findDuplicateExpense(expenses, candidate).expense_id, 'e1');
  assert.throws(() => domain.validateExpense({ ...candidate, payment_method: '個人代墊', payer: '' }, paymentMethods), /支付人/);
  assert.throws(() => domain.validateExpense({ ...candidate, payment_method: '不存在的方式' }, paymentMethods), /支付方式不正確/);
});

test('核銷整理維持主要廠商與零用金彙總', () => {
  const overview = domain.buildReimbursementOverview(expenses, {});
  assert.equal(overview.total, 5500);
  assert.equal(overview.mainVendors[0].vendor, '餐廳');
  assert.equal(overview.mainVendors[0].total, 4000);
  assert.equal(overview.pettyCash.total, 1500);
});

test('公司轉帳掛款項申請單後計入已另行提報', () => {
  const expense = { amount: 4000, payment_method: '公司轉帳', reimbursement_status: '待核銷', payment_request_id: 'req-1' };
  assert.equal(domain.isAlreadySubmittedExpense(expense), true);
  assert.deepEqual(domain.summarizeCurrentClaim([expense]), {
    actualTotal: 4000,
    alreadySubmittedTotal: 4000,
    currentClaimTotal: 0
  });
});

test('公司已有付款日但未掛請款單時仍計入已另行提報', () => {
  const expense = { amount: 2500, payment_method: '公司轉帳', reimbursement_status: '待核銷', payment_request_id: '', company_payment_date: '2026-09-23' };
  assert.equal(domain.isAlreadySubmittedExpense(expense), true);
});

test('個人代墊未掛款項申請單時計入本次請款', () => {
  const expense = { amount: 900, payment_method: '個人代墊', reimbursement_status: '待核銷', payment_request_id: '', company_payment_date: '' };
  assert.equal(domain.isAlreadySubmittedExpense(expense), false);
  assert.deepEqual(domain.summarizeCurrentClaim([expense]), {
    actualTotal: 900,
    alreadySubmittedTotal: 0,
    currentClaimTotal: 900
  });
});

test('未遷移舊資料的已請款與已支付仍計入已另行提報', () => {
  for (const reimbursementStatus of ['已請款', '已支付']) {
    const expense = { amount: 1000, reimbursement_status: reimbursementStatus, payment_request_id: '', company_payment_date: '' };
    assert.equal(domain.isAlreadySubmittedExpense(expense), true, reimbursementStatus);
  }
});

test('只有已核銷但沒有請款事實時不算已另行提報', () => {
  const expense = { amount: 1200, reimbursement_status: '已核銷', payment_request_id: '', company_payment_date: '' };
  assert.equal(domain.isAlreadySubmittedExpense(expense), false);
});

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
  assert.equal(summary.pettyCashUsed, 1500);
  assert.equal(summary.pettyCashRemaining, 1500);
  assert.deepEqual(summary.pendingAdvances, [{ payer: '承辦人', amount: 900 }]);
});

test('支出明細維持欄位驗證與重複檢查', () => {
  const candidate = domain.validateExpense({ activity_id: 'midyear2026', date: '2026-08-01', item: '餐費', budget_item: '餐飲', amount: '4,000', payment_method: '公司轉帳' });
  assert.equal(candidate.amount, 4000);
  assert.equal(domain.findDuplicateExpense(expenses, candidate).expense_id, 'e1');
  assert.throws(() => domain.validateExpense({ ...candidate, payment_method: '個人代墊', payer: '' }), /支付人/);
});

test('核銷整理維持主要廠商與零用金彙總', () => {
  const overview = domain.buildReimbursementOverview(expenses, {});
  assert.equal(overview.total, 5500);
  assert.equal(overview.mainVendors[0].vendor, '餐廳');
  assert.equal(overview.mainVendors[0].total, 4000);
  assert.equal(overview.pettyCash.total, 1500);
});

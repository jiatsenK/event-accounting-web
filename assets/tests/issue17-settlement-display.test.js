'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(__dirname + '/../issue17.js', 'utf8');

function makeElement() {
  let html = '';
  return {
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; },
    addEventListener() {},
    querySelector() { return null; },
  };
}

function run(expenses) {
  const expenseRows = makeElement();
  const context = {
    window: {},
    document: {
      querySelector(selector) {
        if (selector === '#expenseRows') return expenseRows;
        return null;
      },
    },
    state: { activity: {}, capabilities: [] },
    money: v => 'NT$' + Number(v).toLocaleString(),
    escapeHtml: v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])),
  };
  context.window.renderInlineExpenseRows = () => {}; // 讓 issue17.js 的 typeof 檢查判定要覆寫
  vm.createContext(context);
  vm.runInContext(source, context);
  context.window.renderInlineExpenseRows(expenses);
  return expenseRows.innerHTML;
}

test('Issue #15：有 structured_settlement 的支出顯示拆分按鈕與明細列，沒有的不顯示', () => {
  const withSettlement = {
    expense_id: 'e1', date: '2026-01-01', item: '便當', category: '餐飲', budget_item: '餐飲費',
    payment_method: '公司轉帳', payer: '', reimbursement_status: '已核銷', amount: 5000, note: '',
    structured_settlement: { rows: [{ item: '雞腿飯', unitPrice: 150, quantity: 20, amount: 3000 }, { item: '排骨飯', unitPrice: 200, quantity: 10, amount: 2000 }] }
  };
  const withoutSettlement = {
    expense_id: 'e2', date: '2026-01-02', item: '車資', category: '交通', budget_item: '交通費',
    payment_method: '個人代墊', payer: '小明', reimbursement_status: '待核銷', amount: 300, note: ''
  };
  const html = run([withSettlement, withoutSettlement]);

  assert.match(html, /data-settlement-toggle="e1"/);
  assert.match(html, /拆分×2/);
  assert.match(html, /data-settlement-detail="e1"[^>]*hidden/);
  assert.match(html, /雞腿飯/);
  assert.match(html, /排骨飯/);

  const e2Row = html.slice(html.indexOf('data-expense-id="e2"'));
  assert.doesNotMatch(e2Row.slice(0, e2Row.indexOf('</tr>')), /data-settlement-toggle/);
});

console.log('issue17 settlement display tests PASS');

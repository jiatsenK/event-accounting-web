const assert = require('assert');
const X = require('../exports.js');

const db = {
  activities: [{ id: 'yearend2026', name: '2026 尾牙' }],
  vendors: [{ id: 'V-1', name: '範例餐飲股份有限公司', short_name: '範例餐飲' }],
  payment_requests: [{
    id: 'R-1', activity_id: 'yearend2026', payee_vendor_id: 'V-1', stage: '訂金', amount: 100000,
    purpose: '尾牙桌菜訂金', requested_at: '2026-09-18', note: '請勿扣匯費'
  }],
  request_lines: [
    { id: 'RL-1', request_id: 'R-1', line_id: 'L-1', amount: 80000 },
    { id: 'RL-2', request_id: 'R-1', line_id: 'L-2', amount: 20000 }
  ],
  budget_lines: [
    { id: 'L-1', activity_id: 'yearend2026', item: '桌菜' },
    { id: 'L-2', activity_id: 'yearend2026', item: '場租' }
  ]
};

const payload = X.buildPaymentRequestExport(db, 'R-1');
assert.strictEqual(payload.activity.name, '2026 尾牙');
assert.strictEqual(payload.vendor.name, '範例餐飲股份有限公司');
assert.deepStrictEqual(payload.requestLines.map(row => row.id), ['RL-1', 'RL-2']);
assert.deepStrictEqual(payload.budgetLines.map(row => row.id), ['L-1', 'L-2']);
assert.strictEqual(payload.fileName, '2026 尾牙_範例餐飲股份有限公司_訂金.xlsx');

const cells = {};
const sheet = { getCell(address) { return cells[address] || (cells[address] = { value: '範本舊資料' }); } };
X.fillPaymentRequestSheet(sheet, payload);
assert.deepStrictEqual(Object.fromEntries(Object.entries(cells).map(([address, cell]) => [address, cell.value])), {
  A6: '申請日期：2026/09/18',
  A9: '尾牙桌菜訂金',
  A10: '請勿扣匯費',
  A11: '',
  A12: '',
  V13: 100000,
  H14: '範例餐飲股份有限公司',
  AB17: 0
});

const fallback = X.buildPaymentRequestExport(Object.assign({}, db, {
  payment_requests: [{ id: 'R-2', activity_id: 'yearend2026', payee_name: '公司（零用金回沖）', stage: '回沖' }],
  request_lines: [{ id: 'RL-3', request_id: 'R-2', line_id: 'L-1', amount: 80000 }]
}), 'R-2');
assert.strictEqual(fallback.payee, '公司（零用金回沖）');
assert.strictEqual(fallback.purpose, '桌菜');
assert.strictEqual(fallback.amount, 80000);

assert.throws(() => X.buildPaymentRequestExport(db, 'missing'), /找不到款項申請單/);
console.log('v2 exports: all passed');

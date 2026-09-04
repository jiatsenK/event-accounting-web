'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const budget = require('../activity-budget.js');

test('預算輸入正規化會拆出正式廠商 key 與年終資金來源', () => {
  const line = budget.normalizeLine({
    budget_line_id: 'line-1',
    budget_item: '場地',
    vendor_value: 'key:04724804',
    item: '桌菜',
    unit_price: '20,680',
    quantity: '23',
    amount: '475,640',
    sponsor_amount: '5,000',
    jdc_amount: '470,640',
    payment_terms: '訂金'
  });
  assert.deepEqual(line, {
    budget_line_id: 'line-1',
    budget_item: '場地',
    vendor_key: '04724804',
    vendor: '',
    item: '桌菜',
    unit_price: 20680,
    quantity: 23,
    amount: 475640,
    sponsor_amount: 5000,
    jdc_amount: 470640,
    payment_terms: '訂金',
    note: ''
  });
  assert.equal(budget.lineMatches({ ...line, vendor: '正式廠商名稱' }, line), true);
  assert.throws(() => budget.normalizeLine({
    budget_item: '場地', vendor_value: '', item: '桌菜', unit_price: 1, quantity: 1,
    amount: 100, sponsor_amount: 60, jdc_amount: 30
  }), /合計必須等於預算金額/);
});

test('預算列依廠商分組且狀態只能向前推進', () => {
  const groups = budget.groupRows([
    { budget_line_id: '1', vendor_key: 'v1', vendor: '甲', amount: 100 },
    { budget_line_id: '2', vendor_key: 'v1', vendor: '甲', amount: 50 },
    { budget_line_id: '3', vendor: '抽獎金', amount: 300 }
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].total, 150);
  assert.equal(groups[1].total, 300);
  assert.equal(budget.nextStatus('草稿'), '已提報');
  assert.equal(budget.nextStatus('已提報'), '已核准');
  assert.equal(budget.nextStatus('已核准'), '');
});

test('簽呈內容含活動日期、地點、預估總額與呈請核示', () => {
  const copy = budget.proposalCopy({
    activity: {
      name: '2026年度 忘年會',
      date: '2027-01-22',
      activity_type: '尾牙',
      location: '翡麗絲莊園',
      estimated_headcount: 220
    },
    total: 1908913,
    previous_total: 1556010,
    previous_activity: { actual_headcount: 170 }
  });
  assert.match(copy.title, /忘年會.*呈請 核示/);
  assert.match(copy.intro.join('\n'), /2027-01-22/);
  assert.match(copy.intro.join('\n'), /翡麗絲莊園/);
  assert.match(copy.intro.join('\n'), /1,908,913/);
  assert.match(copy.intro.join('\n'), /上一屆人均 9,153/);
});

test('忘年會 Excel 附件定義廠商贊助款與 JDC 負擔區段', () => {
  const source = fs.readFileSync(__dirname + '/../activity-budget.js', 'utf8');
  assert.match(source, /廠商贊助款/);
  assert.match(source, /JDC負擔/);
  assert.match(source, /金額差異/);
  assert.match(source, /今年人數/);
  assert.match(source, /去年人數/);
  assert.match(source, /去年人均/);
  assert.match(source, /人均差異/);
  assert.match(source, /printTitlesRow = '1:2'/);
  assert.match(source, /orientation: 'landscape'/);
});

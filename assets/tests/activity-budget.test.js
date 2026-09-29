'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const budget = require('../activity-budget.js');

class FakeCell {
  constructor() {
    this.value = null;
    this.border = {};
  }
}

class FakeRow {
  constructor(number) {
    this.number = number;
    this.cells = new Map();
  }

  getCell(column) {
    if (!this.cells.has(column)) this.cells.set(column, new FakeCell());
    return this.cells.get(column);
  }

  set values(values) {
    values.forEach((value, index) => {
      this.getCell(index + 1).value = value;
    });
  }
}

class FakeSheet {
  constructor(name, options) {
    this.name = name;
    this.options = options;
    this.pageSetup = options.pageSetup;
    this.rows = new Map();
    this.columns = new Map();
    this.merges = [];
  }

  getRow(number) {
    if (!this.rows.has(number)) this.rows.set(number, new FakeRow(number));
    return this.rows.get(number);
  }

  getCell(reference) {
    const match = /^([A-Z]+)(\d+)$/.exec(reference);
    const column = match[1].split('').reduce((sum, character) => sum * 26 + character.charCodeAt(0) - 64, 0);
    return this.getRow(Number(match[2])).getCell(column);
  }

  getColumn(number) {
    if (!this.columns.has(number)) this.columns.set(number, {});
    return this.columns.get(number);
  }

  mergeCells(reference) {
    this.merges.push(reference);
  }
}

class FakeWorkbook {
  constructor() {
    this.worksheets = [];
  }

  addWorksheet(name, options) {
    const sheet = new FakeSheet(name, options);
    this.worksheets.push(sheet);
    return sheet;
  }
}

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
  const payload = {
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
  };
  const copy = budget.proposalCopy(payload);
  assert.match(copy.title, /忘年會.*呈請 核示/);
  assert.match(copy.intro.join('\n'), /2027-01-22/);
  assert.match(copy.intro.join('\n'), /翡麗絲莊園/);
  assert.match(copy.intro.join('\n'), /1,908,913/);
  assert.match(copy.intro.join('\n'), /上一屆人均 9,153/);
  assert.equal(budget.proposalText(payload), [
    `主旨：${copy.title}`,
    '說明：',
    ...copy.intro,
    '預估總額：$1,908,913'
  ].join('\n'));
});

test('預算預覽列與 Excel 預估費用資料列使用同一份列模型', () => {
  const payload = {
    activity: { name: '2026 年中聚餐', date: '2026-08-28' },
    rows: [
      { budget_line_id: '1', vendor_key: 'v1', vendor: '甲廠商', item: '桌菜', unit_price: 12000, quantity: 2, amount: 24000, payment_terms: '訂金' },
      { budget_line_id: '2', vendor_key: 'v1', vendor: '甲廠商', item: '飲料', unit_price: 500, quantity: 10, amount: 5000, note: '含運' },
      { budget_line_id: '3', vendor: '抽獎金', item: '抽獎金', unit_price: 30000, quantity: 1, amount: 30000 }
    ],
    total: 59000,
    previous_total: 0
  };
  const previewRows = budget.budgetSheetRows(payload);
  assert.deepEqual(previewRows, [
    { vendor: '甲廠商', vendor_row_span: 2, item: '桌菜', unit_price: 12000, quantity: 2, amount: 24000, total: 29000, note: '訂金' },
    { vendor: null, vendor_row_span: 0, item: '飲料', unit_price: 500, quantity: 10, amount: 5000, total: null, note: '含運' },
    { vendor: '抽獎金', vendor_row_span: 1, item: '抽獎金', unit_price: 30000, quantity: 1, amount: 30000, total: 30000, note: null }
  ]);

  const workbook = budget.buildBudgetWorkbook({ Workbook: FakeWorkbook }, payload);
  const sheet = workbook.worksheets[0];
  const excelRows = previewRows.map((_, index) => {
    const row = sheet.getRow(index + 3);
    return Array.from({ length: 7 }, (unused, column) => row.getCell(column + 1).value);
  });
  assert.deepEqual(excelRows, previewRows.map(row => [
    row.vendor,
    row.item,
    row.unit_price,
    row.quantity,
    row.amount,
    row.total,
    row.note
  ]));
  assert.deepEqual(sheet.merges, ['A1:G1', 'A3:A4', 'F3:F4', 'A6:E6']);
});

test('忘年會 Excel 附件定義廠商贊助款與 JDC 負擔區段', () => {
  const source = fs.readFileSync(__dirname + '/../activity-budget.js', 'utf8');
  const uiSource = fs.readFileSync(__dirname + '/../activity-budget-ui.js', 'utf8');
  assert.match(source, /廠商贊助款/);
  assert.match(source, /JDC負擔/);
  assert.match(source, /金額差異/);
  assert.match(source, /今年人數/);
  assert.match(source, /去年人數/);
  assert.match(source, /去年人均/);
  assert.match(source, /人均差異/);
  assert.match(source, /printTitlesRow = '1:2'/);
  assert.match(source, /orientation: 'landscape'/);
  assert.match(source, /function buildProposalDocument/);
  assert.match(source, /function downloadProposal/);
  assert.doesNotMatch(uiSource, /ActivityBudget\.downloadProposal\(/);
});

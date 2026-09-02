'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const core = fs.readFileSync(__dirname + '/../app-core.js', 'utf8');
const issue17 = fs.readFileSync(__dirname + '/../issue17.js', 'utf8');
const ui = fs.readFileSync(__dirname + '/../accounting-ui.js', 'utf8');
const domain = fs.readFileSync(__dirname + '/../domain.js', 'utf8');

test('帳務寫入以隱藏 form/iframe 接收 GAS postMessage，並保留讀回確認', () => {
  for (const source of [core, issue17]) {
    assert.match(source, /document\.createElement\('iframe'\)/);
    assert.match(source, /document\.createElement\('form'\)/);
    assert.match(source, /event-accounting-result/);
    assert.match(source, /window\.addEventListener\('message'/);
    assert.match(source, /await apiRead\('activity'/);
    assert.doesNotMatch(source, /mode:\s*'no-cors'/);
  }
});

test('核銷 Excel 不再定義或呼叫兩張淘汰工作表', () => {
  const budgetBuilder = ['build', 'Budget', 'Sheet'].join('');
  const invoiceBuilder = ['build', 'Invoice', 'Sheet'].join('');
  for (const source of [core, ui, domain]) {
    assert.equal(source.includes(budgetBuilder), false);
    assert.equal(source.includes(invoiceBuilder), false);
  }
  assert.doesNotMatch(core + ui, /addWorksheet\('(?:預算與結算|核銷憑證)'/);
});

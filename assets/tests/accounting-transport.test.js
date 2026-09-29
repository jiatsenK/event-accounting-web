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

test('樂觀更新先套用新畫面，確認成功換成讀回資料，失敗則還原', () => {
  const vm = require('node:vm');
  const source = core.slice(core.indexOf('function markOptimisticRow'), core.indexOf('function currentAccountingView'));
  const rendered = [];
  const context = { document: { querySelectorAll: () => [] } };
  vm.createContext(context); vm.runInContext(source, context);

  const success = context.applyOptimisticUpdate({
    previous: { value: '舊值' }, next: { value: '新值' }, render: data => rendered.push(data.value)
  });
  success.confirm({ value: '已確認' });
  success.rollback();
  assert.deepEqual(rendered, ['新值', '已確認']);

  const failure = context.applyOptimisticUpdate({
    previous: { value: '舊值' }, next: { value: '另一個新值' }, render: data => rendered.push(data.value)
  });
  failure.rollback();
  assert.deepEqual(rendered, ['新值', '已確認', '另一個新值', '舊值']);
});

test('樂觀列顯示儲存中並停用同筆按鈕', () => {
  const vm = require('node:vm');
  const source = core.slice(core.indexOf('function markOptimisticRow'), core.indexOf('function currentAccountingView'));
  const controls = [{ disabled: false }, { disabled: false }];
  let marker = null;
  const row = {
    getAttribute: name => name === 'data-expense-id' ? 'expense-1' : '',
    querySelectorAll: () => controls,
    lastElementChild: { appendChild: element => { marker = element; } }
  };
  const context = { document: {
    querySelectorAll: selector => selector === '[data-expense-id]' ? [row] : [],
    createElement: () => ({})
  } };
  vm.createContext(context); vm.runInContext(source, context);
  context.applyOptimisticUpdate({
    previous: {}, next: {}, render() {},
    savingRow: { selector: '[data-expense-id]', attribute: 'data-expense-id', value: 'expense-1' }
  });
  assert.equal(controls.every(control => control.disabled), true);
  assert.equal(marker.textContent, '儲存中…');
});

test('只有指定寫入呼叫傳入 optimistic，其他 action 維持原等待流程', () => {
  const budgetUi = fs.readFileSync(__dirname + '/../activity-budget-ui.js', 'utf8');
  const paymentUi = fs.readFileSync(__dirname + '/../payment-request-ui.js', 'utf8');
  assert.match(core, /action: 'add_expense'[\s\S]*?optimistic: optimisticExpenseView/);
  assert.match(core, /action: 'update_expense'[\s\S]*?optimistic: optimisticExpenseView/);
  assert.match(ui, /action: 'update_expense'[\s\S]*?optimistic: optimisticExpenseView/);
  assert.match(budgetUi, /action: 'save_activity_budget_line'[\s\S]*?optimistic:/);
  assert.match(paymentUi, /action: 'save_payment_request'[\s\S]*?optimistic:/);
  assert.doesNotMatch(core, /action: 'update_petty_cash_settlement'[\s\S]{0,200}optimistic:/);
  assert.doesNotMatch(budgetUi, /action: 'delete_activity_budget_line'[\s\S]{0,200}optimistic:/);
});

test('settlement transport waits for matching status, date and note readback', async () => {
  const vm = require('node:vm');
  const source = core.slice(core.indexOf('async function apiWriteConfirmed(fields)'), core.indexOf('async function refresh()'));
  const requested = {action:'update_petty_cash_settlement',activity_id:'a',settlement_status:'已沖銷',settlement_date:'2026-09-06',note:'done'};
  let reads = 0; let submitted = false; let removed = 0;
  const node = () => ({style:{},setAttribute(){},appendChild(){},remove(){removed++;},submit(){submitted=true;}});
  const context = {state:{apiUrl:'https://example.invalid',token:'test'},location:{origin:'https://example.invalid'},
    document:{createElement:node,body:{append(){}}}, window:{addEventListener(){},removeEventListener(){}},sleep:async()=>{},
    apiRead:async()=> { reads++; return {expenses:[],petty_cash_settlement:{'沖銷狀態':'已沖銷','沖銷日期':reads<3 ? '2026-09-05':'2026-09-06','備註':'done'}}; }};
  vm.createContext(context);vm.runInContext(source,context);
  const after=await context.apiWrite(requested);
  assert.equal(submitted,true);assert.equal(reads,3);assert.equal(removed,2);
  assert.equal(after.petty_cash_settlement['沖銷日期'],'2026-09-06');
});

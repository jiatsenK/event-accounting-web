'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const views = require('../accounting-views.js');

test('帳務掛載模板保留既有 panel，不再有廠商主檔／款項申請', () => {
  assert.match(views.template, /data-tab-panel="overview"/);
  assert.match(views.template, /data-tab-panel="expenses"/);
  assert.match(views.template, /data-tab-panel="budget"/);
  assert.match(views.template, /id="activityBudgetForm"/);
  assert.match(views.template, /id="advanceBudgetStatus"/);
  assert.match(views.template, /id="downloadBudgetProposal"/);
  assert.doesNotMatch(views.template, /data-tab-panel="vendors"/);
  assert.doesNotMatch(views.template, /data-tab-panel="payment_requests"/);
  assert.match(views.template, /data-tab-panel="reimbursement"/);
  assert.match(views.template, /id="expenseSection"/);
  assert.match(views.template, /id="personalAdvanceSection" hidden/);
  assert.match(views.template, /data-expense-view="expenses"/);
  assert.match(views.template, /data-expense-view="advances"/);
  assert.match(views.template, /支出登記時一律為待核銷，活動後才整批改為已核銷/);
  assert.doesNotMatch(views.template, /核銷狀態由支付方式自動帶入/);
  assert.doesNotMatch(views.template, /class="tabs"/);
  assert.doesNotMatch(views.template, /class="page-header"/);
});

test('帳務既有 scripts 由同一 mount 依序載入', () => {
  assert.deepEqual(views.scriptSources.map(item => item.key), [
    'exceljs', 'docx', 'accounting-domain', 'activity-budget', 'accounting-core', 'accounting-ui', 'activity-budget-ui',
    'accounting-issue17', 'accounting-settlement'
  ]);
  assert.equal(
    views.scriptSources.find(item => item.key === 'accounting-core').src,
    '../assets/app-core.js?v=20260916-01'
  );
  assert.equal(views.cacheKey, 'accounting');
});

test('入口外殼與帳務模板不共用 status/activity selector id', () => {
  const fs = require('node:fs');
  const shell = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  const entry = fs.readFileSync(__dirname + '/../activity-app.js', 'utf8');
  assert.match(shell, /id="platformStatus"/);
  assert.match(entry, /id="platformActivitySelector"/);
  assert.doesNotMatch(entry, /id="activitySelector"/);
  assert.equal((views.template.match(/id="status"/g) || []).length, 1);
  assert.equal((views.template.match(/id="activitySelector"/g) || []).length, 1);
});

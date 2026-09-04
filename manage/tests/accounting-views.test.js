'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const views = require('../accounting-views.js');

test('帳務掛載模板保留既有 panel 並加入廠商主檔', () => {
  assert.match(views.template, /data-tab-panel="overview"/);
  assert.match(views.template, /data-tab-panel="expenses"/);
  assert.match(views.template, /data-tab-panel="budget"/);
  assert.match(views.template, /id="activityBudgetForm"/);
  assert.match(views.template, /id="advanceBudgetStatus"/);
  assert.match(views.template, /id="downloadBudgetProposal"/);
  assert.match(views.template, /data-tab-panel="vendors"/);
  assert.match(views.template, /id="vendorSearch"/);
  assert.match(views.template, /id="vendorRows"/);
  assert.match(views.template, /data-tab-panel="reimbursement"/);
  assert.doesNotMatch(views.template, /class="tabs"/);
  assert.doesNotMatch(views.template, /class="page-header"/);
});

test('帳務既有 scripts 由同一 mount 依序載入', () => {
  assert.deepEqual(views.scriptSources.map(item => item.key), [
    'exceljs', 'docx', 'accounting-domain', 'activity-budget', 'accounting-core', 'accounting-ui', 'activity-budget-ui', 'accounting-issue17'
  ]);
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

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const views = require('../planning-views.js');
const fixtures = require('../../planning/tests/fixtures.js');

test('採購待補狀態由 history 類別資料判斷', () => {
  assert.equal(views.hasAccountingPurchasePending(fixtures.history[0]), true);
  assert.equal(views.hasAccountingPurchasePending(fixtures.history[1]), false);
});

test('規劃人數只採活動主檔的預估人數', () => {
  assert.equal(views.estimatedHeadcount(fixtures.activities[0]), 220);
  assert.equal(views.estimatedHeadcount({ actual_headcount: 180 }), null);
});

test('歷史卡缺實際人數仍可呈現', () => {
  const html = views.eventCard(fixtures.history[1], false);
  assert.match(html, /實際人數未提供/);
  assert.doesNotMatch(html, /undefined/);
});

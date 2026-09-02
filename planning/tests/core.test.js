'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');
const fixtures = require('./fixtures.js');

test('calculateRows 疊加比例與每類別固定安全量', () => {
  const rows = core.calculateRows(fixtures.baselines, '尾牙', 200, 10, 2);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].baseline_liters, 63.3);
  assert.ok(Math.abs(rows[0].safety_from_rate_liters - 6.33) < 1e-12);
  assert.equal(rows[0].fixed_safety_liters, 2);
  assert.ok(Math.abs(rows[0].system_recommended_liters - 71.63) < 1e-12);
});

test('calculateRows 不對不足樣本輸出假精準數字', () => {
  const rows = core.calculateRows(fixtures.baselines, '尾牙', 200, 10, 2);
  assert.equal(rows[1].baseline_liters, null);
  assert.equal(rows[1].total_safety_liters, null);
  assert.equal(rows[1].system_recommended_liters, null);
});

test('getHistory 只篩選傳入資料且不改動來源', () => {
  assert.deepEqual(core.getHistory(fixtures.history, '尾牙'), [fixtures.history[0]]);
  const all = core.getHistory(fixtures.history, '全部');
  assert.deepEqual(all, fixtures.history);
  assert.notEqual(all, fixtures.history);
});

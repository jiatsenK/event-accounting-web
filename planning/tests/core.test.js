'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');

const baselines = [
  {
    activity_type: '尾牙',
    drink_category: '啤酒',
    sample_count: 6,
    average: 0.3165,
    median: 0.2946,
    min: 0.0971,
    max: 0.655,
    confidence: '高',
    sources: ['yearend2019', 'yearend2020'],
    excluded: 0
  },
  {
    activity_type: '尾牙',
    drink_category: '無酒精飲料',
    sample_count: 0,
    average: null,
    median: null,
    min: null,
    max: null,
    confidence: '不足',
    sources: [],
    excluded: 2
  },
  {
    activity_type: '年中聚餐',
    drink_category: '啤酒',
    sample_count: 3,
    average: 0.3416,
    median: 0.343,
    min: 0.1313,
    max: 0.5506,
    confidence: '中',
    sources: ['midyear2023'],
    excluded: 1
  }
];

test('calculateRows 計算 baseline 並疊加比例與固定安全量', () => {
  const rows = core.calculateRows(baselines, '尾牙', 200, 10, 2);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].baseline_liters, 63.3);
  assert.ok(Math.abs(rows[0].safety_from_rate_liters - 6.33) < 1e-12);
  assert.equal(rows[0].fixed_safety_liters, 2);
  assert.ok(Math.abs(rows[0].total_safety_liters - 8.33) < 1e-12);
  assert.ok(Math.abs(rows[0].system_recommended_liters - 71.63) < 1e-12);
});

test('calculateRows 對 sample_count 小於 2 或無有效 average 輸出 null', () => {
  const insufficient = [
    { ...baselines[0], drink_category: '調酒', sample_count: 1 },
    baselines[1]
  ];
  const rows = core.calculateRows(insufficient, '尾牙', 200, 10, 2);
  for (const row of rows) {
    assert.equal(row.baseline_liters, null);
    assert.equal(row.safety_from_rate_liters, null);
    assert.equal(row.fixed_safety_liters, null);
    assert.equal(row.total_safety_liters, null);
    assert.equal(row.system_recommended_liters, null);
  }
});

test('getHistory 只依傳入資料篩選且不改動來源陣列', () => {
  const history = [
    { activity_id: 'yearend2025', activity_type: '尾牙' },
    { activity_id: 'midyear2025', activity_type: '年中聚餐' }
  ];
  assert.deepEqual(core.getHistory(history, '尾牙'), [history[0]]);
  const all = core.getHistory(history, '全部');
  assert.deepEqual(all, history);
  assert.notEqual(all, history);
});

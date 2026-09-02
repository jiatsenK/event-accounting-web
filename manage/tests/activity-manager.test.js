'use strict';
const assert = require('node:assert/strict');
const manager = require('../activity-manager.js');

assert.deepEqual(
  manager.fallbackActivity('midyear2026'),
  { activity_id: 'midyear2026', name: '2026年度 年中聚餐' }
);
assert.deepEqual(
  manager.fallbackActivity('yearend2025'),
  { activity_id: 'yearend2025', name: '2025年度 忘年會' }
);
assert.equal(typeof manager.init, 'function');
console.log('activity-manager tests PASS');

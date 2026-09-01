'use strict';
const assert = require('node:assert/strict');
const manager = require('../activity-manager.js');

assert.equal(
  manager.buildAreaUrl('accounting', 'midyear2026'),
  '../?activity_id=midyear2026'
);
assert.equal(
  manager.buildAreaUrl('planning', 'midyear2026'),
  '../planning-preview/?activity_id=midyear2026'
);
assert.deepEqual(
  manager.parseRoute('?activity_id=yearend2025&area=planning'),
  { activityId: 'yearend2025', area: 'planning' }
);
assert.equal(manager.buildAreaUrl('unknown', 'midyear2026'), '');
assert.deepEqual(
  manager.fallbackActivity('midyear2026'),
  { activity_id: 'midyear2026', name: '2026年度 年中聚餐' }
);
assert.deepEqual(
  manager.fallbackActivity('yearend2025'),
  { activity_id: 'yearend2025', name: '2025年度 忘年會' }
);
console.log('activity-manager tests PASS');

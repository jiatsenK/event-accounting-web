'use strict';
const assert = require('node:assert/strict');
const app = require('../activity-app.js');

assert.equal(
  app.canonicalActivityName({ activity_id: 'midyear2026', name: '2026 年中聚餐' }),
  '2026年度 年中聚餐'
);
assert.deepEqual(
  app.fallbackActivity('yearend2025'),
  { activity_id: 'yearend2025', name: '2025年度 忘年會' }
);
console.log('activity-app tests PASS');

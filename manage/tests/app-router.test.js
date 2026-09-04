'use strict';
const assert = require('node:assert/strict');
const router = require('../app-router.js');

assert.deepEqual(
  router.parseRoute('?activity_id=yearend2025&area=accounting&view=expenses'),
  { activityId: 'yearend2025', area: 'accounting', view: 'expenses' }
);
assert.deepEqual(
  router.parseRoute('?activity_id=midyear2026&area=accounting&view=vendors'),
  { activityId: 'midyear2026', area: 'accounting', view: 'vendors' }
);
assert.deepEqual(
  router.parseRoute('?activity_id=midyear2026&area=planning&view=unknown'),
  { activityId: 'midyear2026', area: 'planning', view: 'history' }
);
assert.deepEqual(
  router.parseRoute('?activity_id=midyear2026&area=unknown&view=overview'),
  { activityId: 'midyear2026', area: '', view: '' }
);
assert.equal(
  router.buildQuery({ activityId: '活動 1', area: 'accounting', view: 'reimbursement' }),
  '?activity_id=%E6%B4%BB%E5%8B%95+1&area=accounting&view=reimbursement'
);
assert.equal(
  router.buildQuery({ activityId: 'midyear2026', area: '', view: '' }),
  '?activity_id=midyear2026'
);
console.log('app-router tests PASS');

'use strict';
const assert = require('node:assert/strict');
const router = require('../app-router.js');

// #155：活動頁六個分頁（規劃分頁含流程表／獎項／飲品）＋歷史分析。
assert.deepEqual(
  router.parseRoute('?activity_id=yearend2025&area=activity&view=expenses'),
  { activityId: 'yearend2025', area: 'activity', view: 'expenses' }
);
assert.deepEqual(
  router.parseRoute('?activity_id=midyear2026&area=activity&view=payment_requests'),
  { activityId: 'midyear2026', area: 'activity', view: 'payment_requests' }
);
assert.deepEqual(
  router.parseRoute('?activity_id=midyear2026&area=activity&view=planning'),
  { activityId: 'midyear2026', area: 'activity', view: 'rundown' }
);
assert.deepEqual(
  router.parseRoute('?activity_id=midyear2026&area=activity&view=unknown'),
  { activityId: 'midyear2026', area: 'activity', view: 'overview' }
);
assert.deepEqual(
  router.parseRoute('?activity_id=midyear2026&area=analysis'),
  { activityId: 'midyear2026', area: 'analysis', view: 'dashboard' }
);
assert.deepEqual(
  router.parseRoute('?activity_id=midyear2026&area=unknown&view=overview'),
  { activityId: 'midyear2026', area: '', view: '' }
);

// 改版前的舊網址導到新位置。
assert.deepEqual(
  router.parseRoute('?activity_id=yearend2026&area=accounting&view=budget'),
  { activityId: 'yearend2026', area: 'activity', view: 'budget' }
);
assert.deepEqual(
  router.parseRoute('?activity_id=yearend2026&area=accounting&view=reimbursement'),
  { activityId: 'yearend2026', area: 'activity', view: 'close' }
);
assert.deepEqual(
  router.parseRoute('?activity_id=midyear2026&area=accounting&view=vendors'),
  { activityId: 'midyear2026', area: 'activity', view: 'budget' }
);
assert.deepEqual(
  router.parseRoute('?activity_id=midyear2026&area=planning&view=forecast'),
  { activityId: 'midyear2026', area: 'activity', view: 'drinks' }
);
assert.deepEqual(
  router.parseRoute('?activity_id=midyear2026&area=planning&view=unknown'),
  { activityId: 'midyear2026', area: 'activity', view: 'drinks' }
);
assert.deepEqual(
  router.parseRoute('?activity_id=midyear2026&area=planning&view=dashboard'),
  { activityId: 'midyear2026', area: 'analysis', view: 'dashboard' }
);
assert.deepEqual(
  router.normalizeRoute({ activityId: 'yearend2025', area: 'accounting', view: 'overview' }),
  { activityId: 'yearend2025', area: 'activity', view: 'overview' }
);

assert.equal(
  router.buildQuery({ activityId: '活動 1', area: 'activity', view: 'close' }),
  '?activity_id=%E6%B4%BB%E5%8B%95+1&area=activity&view=close'
);
assert.equal(
  router.buildQuery({ activityId: 'midyear2026', area: '', view: '' }),
  '?activity_id=midyear2026'
);
console.log('app-router tests PASS');

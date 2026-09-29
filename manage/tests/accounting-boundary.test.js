'use strict';
const assert = require('node:assert/strict');
const views = require('../app-views.js');
const ui = require('../../assets/drink-inventory-ui.js');

// #155：獎項、流程表、飲品收進活動頁的「規劃」分頁，不再掛在帳務底下。
assert.deepEqual(views.AREAS.activity.tabs.find(item => item.id === 'planning').views.map(item => item.id), [
  'rundown', 'prizes', 'drinks'
]);
assert.equal(ui.enabled, false);
assert.equal(ui.owner, 'planning');
console.log('accounting boundary tests PASS');

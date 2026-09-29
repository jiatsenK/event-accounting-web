'use strict';
const assert = require('node:assert/strict');
const views = require('../app-views.js');

const planning = require('../planning-views.js');

assert.deepEqual(views.AREAS.analysis.tabs.map(item => item.id), ['dashboard']);
assert.equal(views.viewKey('activity', 'drinks'), 'activity:drinks');
// 飲品子頁＝規劃試算＋歷史紀錄兩個既有畫面。
assert.equal(typeof planning.drinks.mount, 'function');
console.log('planning view registry tests PASS');

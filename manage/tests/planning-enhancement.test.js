'use strict';
const assert = require('node:assert/strict');
const views = require('../app-views.js');

assert.deepEqual(views.AREAS.planning.views.map(item => item.id), ['history', 'forecast']);
assert.equal(views.viewKey('planning', 'history'), 'planning:history');
assert.equal(views.viewKey('accounting', 'overview'), 'accounting:overview');
console.log('planning view registry tests PASS');

'use strict';
const assert = require('node:assert/strict');
const views = require('../app-views.js');
const ui = require('../../assets/drink-inventory-ui.js');

assert.deepEqual(views.AREAS.accounting.views.map(item => item.id), [
  'overview', 'expenses', 'reimbursement'
]);
assert.equal(ui.enabled, false);
assert.equal(ui.owner, 'planning');
console.log('accounting boundary tests PASS');

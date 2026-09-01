'use strict';
const assert = require('node:assert/strict');
const manager = require('../activity-manager.js');
const ui = require('../../assets/drink-inventory-ui.js');

assert.deepEqual(manager.embeddedCleanupSelectors('accounting'), [
  '[data-tab="drink-inventory"]',
  '[data-tab-panel="drink-inventory"]'
]);
assert.deepEqual(manager.embeddedCleanupSelectors('planning'), []);
assert.equal(ui.enabled, false);
assert.equal(ui.owner, 'planning');
console.log('accounting boundary tests PASS');

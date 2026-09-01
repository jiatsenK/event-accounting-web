'use strict';
const assert = require('node:assert/strict');
const manager = require('../activity-manager.js');

assert.equal(manager.embeddedEnhancementUrl('planning'), 'drink-inventory-panel.js?v=20260901-01');
assert.equal(manager.embeddedEnhancementUrl('accounting'), '');
assert.equal(manager.embeddedEnhancementUrl('unknown'), '');
console.log('planning enhancement hook tests PASS');

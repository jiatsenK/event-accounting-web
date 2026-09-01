'use strict';
const assert = require('node:assert/strict');
const panel = require('../drink-inventory-panel.js');

assert.equal(panel.parseActivityId('?activity_id=midyear2026'), 'midyear2026');
assert.deepEqual(
  panel.buildUpdateFields('midyear2026', 'midyear2026-drink-001', 8),
  {
    action: 'update_drink_inventory',
    activity_id: 'midyear2026',
    drink_group_id: 'midyear2026-drink-001',
    remaining_units: 8
  }
);
assert.throws(() => panel.buildUpdateFields('midyear2026', '', 8), /drink_group_id/);
assert.throws(() => panel.buildUpdateFields('midyear2026', 'g1', ''), /剩餘數量/);
console.log('planning drink inventory panel tests PASS');

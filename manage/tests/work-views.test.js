'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const views = require('../work-views.js');

test('模組匯出 checklist.mount 與狀態值域', () => {
  assert.equal(typeof views.checklist.mount, 'function');
  assert.deepEqual(views.CHECKLIST_STATUSES, ['待辦', '進行中', '完成', '不做']);
});

test('checklistRow 依狀態套對應樣式 class，空欄位顯示 —', () => {
  const row = views.checklistRow({
    item_id: 'a1', '項目': '確認場地與檔期', '負責': '', '狀態': '進行中', '到期': '', '關聯': '', '備註': ''
  });
  assert.match(row, /確認場地與檔期/);
  assert.match(row, /checklist-status-進行中/);
  assert.match(row, /data-edit-checklist-item="a1"/);
  assert.match(row, /data-delete-checklist-item="a1"/);
  // 負責/到期/關聯/備註留空時顯示 — 不是空白，避免表格看起來像壞掉
  assert.equal((row.match(/—/g) || []).length, 4);
});

test('checklistRow 對使用者輸入做 HTML escape，防止 XSS', () => {
  const row = views.checklistRow({
    item_id: '<img src=x onerror=alert(1)>', '項目': '<script>alert(1)</script>', '負責': '', '狀態': '待辦', '到期': '', '關聯': '', '備註': ''
  });
  assert.doesNotMatch(row, /<script>/);
  assert.match(row, /&lt;script&gt;/);
});

console.log('work-views tests PASS');

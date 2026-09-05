'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const views = require('../rundown-views.js');
const prizes = require('../prize-views.js');
const core = require('../../planning/rundown-core.js');

test('快選依目前活動同基底名稱接續全形中文編號', () => {
  const segments = [{ title: '抽獎（一）', order: 10 }, { title: '抽獎(第一輪)', order: 30 }, { title: '歌手演唱（一）', order: 20 }];
  const next = views.quickSegment(segments, 1);
  assert.equal(next['節目內容'], '抽獎（三）');
  assert.equal(next.duration_min, 10);
  assert.equal(next['順序'], 40);
  assert.equal(views.quickSegment([], 1)['節目內容'], '抽獎（一）');
  assert.equal(views.quickSegment(segments, 0)['節目內容'], '歌手演唱（二）');
});
test('重讀比對要求所有變更欄位一致', () => {
  const p = { 獎別: '測試獎', 名額: 9, 頒獎人: '' };
  assert.equal(prizes.matches(p, { 獎別: '測試獎', 名額: '10' }), false);
  assert.equal(prizes.matches(p, { 名額: '9', 頒獎人: '' }), true);
});
test('姓名建議僅回傳相符員工', () => {
  const staff = [{ name: '測試甲' }, { name: '其他乙' }];
  assert.deepEqual(prizes.staffMatches(staff, '測'), [staff[0]]);
  assert.deepEqual(prizes.staffMatches(staff, ''), []);
});
test('重讀名額後圖文同步且時段標題不變', () => {
  const d = core.normalize({ segments: [{ segment_id: 's', 節目內容: '抽獎（一）', prize_ids: 'p', duration_min: 10 }], prizes: [{ prize_id: 'p', 獎別: '測試獎', 名額: 9, 單筆金額: 1200, 頒獎人: '測試同仁' }] });
  assert.equal(core.prizeLabel(d.prizes[0]), '測試獎 $1,200 × 9名／測試同仁');
  assert.equal(d.segments[0].title, '抽獎（一）');
  assert.deepEqual(d.segments[0].prize_ids, ['p']);
});

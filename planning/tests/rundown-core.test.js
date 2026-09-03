'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../rundown-core.js');

test('prizeLabel 組出圖文字串', () => {
  assert.equal(
    core.prizeLabel({ tier: '四等獎', amount: 5000, count: 15, presenter: '彭玉明協理' }),
    '四等獎 $5,000 × 15名／彭玉明協理'
  );
  assert.equal(core.prizeLabel({ tier: '普獎', amount: null, count: 100, presenter: '' }), '普獎 × 100名');
});

test('normalize 接受中文欄位與英文欄位、prize_ids 字串或陣列', () => {
  const data = core.normalize({
    activity_id: 'x',
    segments: [
      { segment_id: 'b', 順序: 2, 節目內容: '後', 開始時間: '19:00' },
      { segment_id: 'a', order: 1, title: '前', start: '18:00', prize_ids: 'p1,p2' }
    ],
    tasks: [{ segment_id: 'a', 角色: '音控', 任務內容: 'x', 對象: '亂寫' }]
  });
  assert.deepEqual(data.segments.map(s => s.segment_id), ['a', 'b']);
  assert.deepEqual(data.segments[0].prize_ids, ['p1', 'p2']);
  assert.equal(data.tasks[0].audience, '全部', '未知對象退回全部');
});

test('晚綁定：未指派角色列在 unassignedRoles，不從投影消失', () => {
  const data = core.normalize({
    roles: [{ 角色: '音控' }, { 角色: '攝影' }],
    assignments: [{ 角色: '音控', 人員姓名: '何正貽' }]
  });
  assert.deepEqual(core.unassignedRoles(data), ['攝影']);
});

test('總控版：彩排段與正式段分區，含全部任務與未排標記', () => {
  const data = core.demoRundown();
  const control = core.projectControl(data);
  assert.deepEqual(control.stages.map(s => s.stage), ['彩排', '正式']);
  const opening = control.stages[1].segments.find(s => s.title === '迎賓酒會');
  assert.ok(opening.tasks.length >= 3);
  const venueTask = opening.tasks.find(t => t.role === '場地聯絡');
  assert.equal(venueTask.unassigned, true, '場地聯絡未指派 → 未排');
  assert.ok(control.unassignedRoles.indexOf('場地聯絡') >= 0);
});

test('工作人員版：依人員分組，只出對象含工作人員/全部的任務', () => {
  const data = core.demoRundown();
  const crew = core.projectCrew(data);
  const minnie = crew.people.find(p => p.name === 'Minnie');
  assert.ok(minnie.rows.length === 0, '主持的任務對象是總控，不進工作人員版');
  const host = crew.people.find(p => p.name === '江宇柔');
  assert.ok(host.rows.some(r => r.segment === '迎賓酒會'));
  assert.ok(host.rows.every((r, i, arr) => i === 0 || arr[i - 1].order <= r.order), '依時段排序');
  assert.ok(crew.people.every(p => !p.rows.some(r => r.role === '場地聯絡')), '飯店任務不進工作人員版');
});

test('飯店版：只留對象含飯店的任務', () => {
  const data = core.demoRundown();
  const venue = core.projectVenue(data);
  assert.ok(venue.rows.length >= 3);
  const roles = new Set(venue.rows.flatMap(r => r.tasks.map(t => t.role)));
  assert.deepEqual([...roles], ['場地聯絡']);
  assert.ok(venue.rows.some(r => r.segment === '團體合照' && r.tasks.some(t => /出菜/.test(t.content))));
});

test('設計師（圖文）版：只有 segment 時間軸＋獎項字串，無任務', () => {
  const data = core.demoRundown();
  const designer = core.projectDesigner(data);
  assert.ok(designer.segments.every(s => !('tasks' in s)));
  assert.ok(designer.segments.every(s => s.time !== undefined));
  const four = designer.segments.find(s => s.title === '抽獎活動 四等獎');
  assert.deepEqual(four.prizeLabels, ['四等獎 $5,000 × 15名／彭玉明協理']);
  assert.deepEqual(four.presenters, ['彭玉明協理']);
  assert.ok(designer.segments.every(s => s.title !== '工作人員到場、場佈'), '彩排段不進圖文版');
});

test('templates / template：內建 2026 尾牙與 2025 忘年會，可取回完整流程供帶入', () => {
  const list = core.templates();
  assert.ok(list.some(t => t.id === 'yearend2026'));
  assert.ok(list.some(t => t.id === 'yearend2025'));
  const t = core.template('yearend2025');
  assert.ok(t.segments.length > 10 && t.roles.length && t.tasks.length);
  assert.equal(core.template('不存在').id, list[0].id, '未知 id 退回第一個（2026）');
});

test('2026 尾牙範本：兩個提案方案並列，可依方案投影', () => {
  const d = core.rundown2026();
  const planList = core.plans(d);
  assert.deepEqual(planList, ['五輪抽獎', '六輪抽獎']);
  const five = core.projectControl(d, '五輪抽獎');
  const six = core.projectControl(d, '六輪抽獎');
  const fiveTitles = five.stages.flatMap(s => s.segments.map(x => x.title));
  const sixTitles = six.stages.flatMap(s => s.segments.map(x => x.title));
  assert.ok(fiveTitles.filter(x => /輪抽獎/.test(x)).length === 5);
  assert.ok(sixTitles.filter(x => /輪抽獎/.test(x)).length === 6);
  assert.ok(fiveTitles.includes('工作人員到場、場佈'), '彩排（無方案）在每個方案都出現');
  assert.ok(sixTitles.includes('工作人員到場、場佈'));
});

test('forPlan：沒填方案的時段在所有方案都保留，任務跟著過濾', () => {
  const d = core.normalize({
    segments: [
      { segment_id: 'a', 節目內容: '共用', 順序: 1 },
      { segment_id: 'b', 節目內容: '五輪限定', 順序: 2, 方案: '五輪抽獎' },
      { segment_id: 'c', 節目內容: '六輪限定', 順序: 3, 方案: '六輪抽獎' }
    ],
    tasks: [
      { segment_id: 'a', 角色: 'x', 任務內容: 't1', 對象: '全部' },
      { segment_id: 'b', 角色: 'x', 任務內容: 't2', 對象: '全部' }
    ]
  });
  const five = core.forPlan(d, '五輪抽獎');
  assert.deepEqual(five.segments.map(s => s.segment_id), ['a', 'b']);
  assert.deepEqual(five.tasks.map(t => t.content), ['t1', 't2']);
});

test('project 依 versionId 分派，未知退回總控版', () => {
  const data = core.demoRundown();
  assert.ok(core.project('venue', data).rows);
  assert.ok(core.project('???', data).stages);
});

console.log('rundown-core tests PASS');

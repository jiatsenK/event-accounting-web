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

test('normalize 接受新時間欄位與 prize_ids 字串或陣列', () => {
  const data = core.normalize({
    activity_id: 'x',
    config: { 正式_基準開始: '18:00', 彩排_基準: '固定開始', 彩排_固定開始: '15:00', 彩排_緩衝分鐘: 5 },
    segments: [
      { segment_id: 'b', 順序: 2, 節目內容: '後', duration_min: '20', 錨定時間: '19:00' },
      { segment_id: 'a', order: 1, title: '前', duration_min: 30, prize_ids: 'p1,p2' }
    ],
    tasks: [{ segment_id: 'a', 角色: '音控', 任務內容: 'x', 對象: '亂寫' }]
  });
  assert.deepEqual(data.segments.map(s => s.segment_id), ['a', 'b']);
  assert.deepEqual(data.segments[0].prize_ids, ['p1', 'p2']);
  assert.equal(data.segments[0].duration_min, 30);
  assert.equal(data.segments[1].anchor_time, '19:00');
  assert.deepEqual(data.config, {
    official_start: '18:00', rehearsal_mode: '固定開始', rehearsal_start: '15:00', rehearsal_buffer_min: 5,
    activity_date: '', activity_start_time: ''
  });
  assert.equal(data.tasks[0].audience, '全部', '未知對象退回全部');
});

test('正式段依基準、duration 與中途錨點往後計算', () => {
  const segments = core.normalize({
    config: { 正式_基準開始: '18:00' },
    segments: [
      { segment_id: 'a', 順序: 1, 階段: '正式', duration_min: 30 },
      { segment_id: 'b', 順序: 2, 階段: '正式', duration_min: 10, 錨定時間: '19:00' },
      { segment_id: 'c', 順序: 3, 階段: '正式', duration_min: 20 }
    ]
  });
  const result = core.calculateTimeline(segments.segments, segments.config);
  assert.deepEqual(result.map(s => [s.start_min, s.end_min]), [[1080, 1110], [1140, 1150], [1150, 1170]]);
  assert.equal(result[1].gap_min, 30);
});

test('彩排接續正式：扣除緩衝後由後往前回推', () => {
  const data = core.normalize({
    config: { 正式_基準開始: '18:00', 彩排_基準: '接續正式', 彩排_緩衝分鐘: 10 },
    segments: [
      { segment_id: 'a', 順序: 1, 階段: '彩排', duration_min: 30 },
      { segment_id: 'b', 順序: 2, 階段: '彩排', duration_min: 20 },
      { segment_id: 'c', 順序: 3, 階段: '正式', duration_min: 10 }
    ]
  });
  const result = core.calculateTimeline(data.segments, data.config);
  assert.deepEqual(result.slice(0, 2).map(s => [s.start_min, s.end_min]), [[1020, 1050], [1050, 1070]]);
  assert.deepEqual([result[2].start_min, result[2].end_min], [1080, 1090]);
});

test('時間格式化只在顯示層標示跨日', () => {
  assert.equal(core.formatTimeRange(1430, 1470), '23:50–翌 00:30');
  assert.equal(core.formatTimeRange(null, null), '');
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

test('2026 尾牙範本：只保留五輪定案版本，不含方案欄位', () => {
  const d = core.rundown2026();
  const titles = core.projectControl(d).stages.flatMap(s => s.segments.map(x => x.title));
  assert.equal(titles.filter(x => /輪抽獎/.test(x)).length, 5);
  assert.ok(d.segments.every(segment => !('plan' in segment)));
  assert.equal('plans' in core, false);
  assert.equal('forPlan' in core, false);
});

test('project 依 versionId 分派，未知退回總控版', () => {
  const data = core.demoRundown();
  assert.ok(core.project('venue', data).rows);
  assert.ok(core.project('???', data).stages);
});

console.log('rundown-core tests PASS');
